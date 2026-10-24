/**
 * frontend/src/campaign.ts
 *
 * Claims a reward campaign (deploy-campaign.js's independent, separately-
 * supplied Candy Machine) — DELIBERATELY KEPT SEPARATE FROM mint.ts.
 *
 * mint.ts has real, proven mainnet transactions behind it. Rather than
 * add campaign-claim branches into that file and risk the code path
 * that's already handled real money, this is its own self-contained
 * module. It reuses the same verified patterns (walletAdapterIdentity,
 * DAS eligibility lookup, assetGate mint args) but touches nothing in
 * mint.ts at all.
 *
 * state.campaigns (state.ts) and the full loadCampaigns()/setCampaigns()
 * chain are confirmed wired and working — verified end to end via a
 * full 18-step mainnet test (cross-collection eligibility, paid claims,
 * treasury persistence, supply isolation, allocation limits all passed).
 *
 * Dependencies (npm install, in frontend/) — same as mint.ts:
 *   @metaplex-foundation/umi
 *   @metaplex-foundation/umi-bundle-defaults
 *   @metaplex-foundation/mpl-core
 *   @metaplex-foundation/mpl-core-candy-machine
 *   @metaplex-foundation/umi-signer-wallet-adapters
 *   @solana/web3.js
 *   bs58
 */

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplCore, safeFetchAssetV1 } from "@metaplex-foundation/mpl-core";
import {
  mplCandyMachine,
  mintV1,
  findCandyGuardPda,
  safeFetchAssetMintCounterFromSeeds,
  safeFetchMintCounterFromSeeds,
} from "@metaplex-foundation/mpl-core-candy-machine";
import { generateSigner, publicKey as umiPublicKey, some } from "@metaplex-foundation/umi";
import { walletAdapterIdentity, WalletAdapter } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

import { state, setStatus, setMinting } from "./state";
import { describeClaimError, describeLandedClaimFailure, landedError } from "./mintErrors";

const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL as string;

// ---- Wallet adapter (identical to mint.ts's — window.solana directly) ---

function getPhantomWalletAdapter(): WalletAdapter {
  const provider = (window as any).solana;
  if (!provider || !provider.publicKey) {
    throw new Error("Wallet not connected — connect your wallet before claiming.");
  }
  return {
    publicKey: new PublicKey(provider.publicKey.toString()),
    signTransaction: (tx) => provider.signTransaction(tx),
    signAllTransactions: (txs) => provider.signAllTransactions(txs),
  };
}

// describeClaimError lives in mintErrors.ts (2026-10-24): testable on its own,
// and UTF-8, where this file's dashes reached the page as a replacement
// character.

// ---- Has this wallet, or this edition, already claimed? ------------------
//
// Claims are capped by two on-chain counters: mintLimit keyed to the paying
// WALLET, and assetMintLimit keyed to the qualifying NFT. Both are PDAs, and
// nothing read them until 2026-09-03 - so a spent holder saw an enabled Claim
// button, clicked it, and got a wallet simulation failure with nothing to
// explain it. Exactly the experience the burned-voucher lockout produced.
//
// The asset-keyed counter matters beyond the button: it rides with the NFT, so
// selling an eligible edition transfers its UNSPENT claims and leaves its spent
// ones behind. That makes "has this edition already claimed?" a question with
// money attached, and it was unanswerable from the interface.
//
// One more thing this fixes: findQualifyingAsset returns the FIRST eligible
// asset it sees. A wallet holding two eligible editions, one already spent,
// could hand assetGate the spent one and revert - while holding a perfectly
// good unspent one. The search below prefers an asset whose counter is clear.

export type CampaignClaimState = "unknown" | "ineligible" | "spent" | "available";

type ClaimStatus = { state: CampaignClaimState; asset: string | null };

const claimStatusByCampaign = new Map<string, ClaimStatus>();

export function getCampaignClaimState(campaignId: string): ClaimStatus {
  return claimStatusByCampaign.get(campaignId) || { state: "unknown", asset: null };
}

// Bounded: a wallet with hundreds of eligible editions should not turn a card
// render into hundreds of RPC calls. Checking a handful finds an unspent one
// in every realistic case, and the mint itself still fails loudly if not.
const MAX_ASSETS_TO_CHECK = 5;

async function fetchEligibleAssets(walletAddress: string, requiredCollection: string): Promise<string[]> {
  const MAX_PAGES = 3;
  const PAGE_LIMIT = 1000;
  const found: string[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    let response: Response;
    try {
      response = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "campaign-eligible-assets",
          method: "getAssetsByOwner",
          params: { ownerAddress: walletAddress, page, limit: PAGE_LIMIT },
        }),
      });
    } catch {
      return found;
    }
    if (!response.ok) return found;

    const body = await response.json();
    const items = body.result?.items || [];
    for (const item of items) {
      if (item.burnt) continue;
      const inCollection = (item.grouping || []).some(
        (g: any) => g.group_key === "collection" && g.group_value === requiredCollection
      );
      if (inCollection) found.push(item.id);
    }
    if (items.length < PAGE_LIMIT) break;
  }
  return found;
}

export async function refreshCampaignClaimStatus(): Promise<void> {
  claimStatusByCampaign.clear();

  const walletAddress = state.wallet.connected ? state.wallet.address : null;
  const campaigns = state.campaigns || [];
  if (!walletAddress || campaigns.length === 0) return;

  const umi = createUmi(RPC_URL, { commitment: "confirmed" }).use(mplCore()).use(mplCandyMachine());

  for (const campaign of campaigns) {
    if (!campaign.campaignCandyMachineAddress || !campaign.eligibilityCollection) continue;

    try {
      const assets = await fetchEligibleAssets(walletAddress, campaign.eligibilityCollection);
      if (assets.length === 0) {
        claimStatusByCampaign.set(campaign.campaignId, { state: "ineligible", asset: null });
        continue;
      }

      const candyMachine = umiPublicKey(campaign.campaignCandyMachineAddress);
      const [candyGuard] = findCandyGuardPda(umi, { base: candyMachine });
      const limit = campaign.claimLimit ? Number(campaign.claimLimit) : 1;
      const scope = campaign.claimScope || "asset";
      const walletLimitId = campaign.claimLimitId ? Number(campaign.claimLimitId) : null;
      const assetLimitId = campaign.assetLimitId
        ? Number(campaign.assetLimitId)
        : campaign.claimLimitId
        ? Number(campaign.claimLimitId)
        : null;

      // The wallet counter is per campaign, not per asset - if it is spent,
      // no asset in this wallet can claim and there is nothing else to check.
      if ((scope === "both" || scope === "wallet") && walletLimitId !== null) {
        const counter = await safeFetchMintCounterFromSeeds(umi, {
          id: walletLimitId,
          user: umiPublicKey(walletAddress),
          candyGuard,
          candyMachine,
        });
        if (counter && Number(counter.count) >= limit) {
          claimStatusByCampaign.set(campaign.campaignId, { state: "spent", asset: null });
          continue;
        }
      }

      if ((scope === "both" || scope === "asset") && assetLimitId !== null) {
        let usable: string | null = null;
        for (const asset of assets.slice(0, MAX_ASSETS_TO_CHECK)) {
          const counter = await safeFetchAssetMintCounterFromSeeds(umi, {
            id: assetLimitId,
            asset: umiPublicKey(asset),
            candyGuard,
            candyMachine,
          });
          // No account means the counter was never created, which means this
          // asset has never claimed here. Absence is the answer.
          if (!counter || Number(counter.count) < limit) {
            usable = asset;
            break;
          }
        }
        claimStatusByCampaign.set(
          campaign.campaignId,
          usable ? { state: "available", asset: usable } : { state: "spent", asset: null }
        );
        continue;
      }

      // No asset counter deployed on this campaign - eligibility alone decides.
      claimStatusByCampaign.set(campaign.campaignId, { state: "available", asset: assets[0] });
    } catch {
      // A failed lookup means "we do not know", never "you cannot claim".
      // Leaving it unknown keeps the button enabled and lets the chain be the
      // authority, which is the safe direction: the worst case is the old
      // behaviour, not a holder wrongly told they are ineligible.
      claimStatusByCampaign.set(campaign.campaignId, { state: "unknown", asset: null });
    }
  }
}

// ---- DAS eligibility check (same approach as mint.ts's holder-discount) -

async function findQualifyingAsset(walletAddress: string, requiredCollection: string): Promise<string | null> {
  const MAX_PAGES = 3;
  const PAGE_LIMIT = 1000;

  for (let page = 1; page <= MAX_PAGES; page++) {
    let response: Response;
    try {
      response = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "campaign-eligibility-check",
          method: "getAssetsByOwner",
          params: { ownerAddress: walletAddress, page, limit: PAGE_LIMIT },
        }),
      });
    } catch {
      return null;
    }
    if (!response.ok) return null;

    const body = await response.json();
    const items = body.result?.items || [];
    // !item.burnt, for the same reason as mint.ts and get-holders.js: DAS
    // returns a burned asset with its ownership record intact and only this
    // flag to say it is gone. Without it a wallet whose gating asset has been
    // burned still reads as eligible, assetGate is handed an asset that no
    // longer exists, and the claim reverts in simulation with no way forward.
    // Third occurrence of one omission - see open-items 38 and 39.
    const match = items.find(
      (item: any) =>
        !item.burnt &&
        (item.grouping || []).some((g: any) => g.group_key === "collection" && g.group_value === requiredCollection)
    );
    if (match) return match.id;

    if (items.length < PAGE_LIMIT) break;
  }
  return null;
}

// ---- Main claim function -------------------------------------------------

export async function claimCampaign(campaignId: string): Promise<void> {
  const campaigns = (state as any).campaigns as any[] | undefined;
  const campaign = campaigns?.find((c) => c.campaignId === campaignId);

  if (!campaign) {
    setStatus(`Unknown campaign: ${campaignId}`);
    return;
  }
  if (!campaign.campaignCandyMachineAddress || !campaign.targetCollection) {
    setStatus("This campaign hasn't been fully deployed yet.");
    return;
  }
  if (campaign.claimed != null && campaign.allocation != null && campaign.claimed >= campaign.allocation) {
    setStatus(campaign.soldOutText || "This campaign is sold out.");
    return;
  }

  let walletAdapter: WalletAdapter;
  try {
    walletAdapter = getPhantomWalletAdapter();
  } catch (err) {
    setStatus(describeClaimError(err));
    return;
  }
  const walletAddress = walletAdapter.publicKey!.toString();

  setMinting(true);
  setStatus("Checking eligibility...");

  try {
    // Prefer the unspent asset refreshCampaignClaimStatus already found. Its
    // counter was read, so it is known good; findQualifyingAsset returns the
    // first eligible asset regardless of whether that one has already claimed.
    const known = getCampaignClaimState(campaignId);
    const qualifyingAsset =
      known.asset || (await findQualifyingAsset(walletAddress, campaign.eligibilityCollection));
    if (!qualifyingAsset) {
      setMinting(false);
      setStatus("Not eligible — you don't currently hold the required NFT for this campaign.");
      return;
    }

    // "confirmed", not the node default ("finalized", about 13 seconds behind):
    // the supply pre-check and preflight simulation must see the state the
    // readback sees, or a sell-out in the last few seconds passes both, then
    // lands and fails (open-items 67).
    const umi = createUmi(RPC_URL, { commitment: "confirmed" }).use(mplCore()).use(mplCandyMachine());
    umi.use(walletAdapterIdentity(walletAdapter));

    const asset = generateSigner(umi);

    const mintArgs: any = {
      assetGate: some({ asset: umiPublicKey(qualifyingAsset) }),
    };
    // deploy-campaign.js always attaches assetMintLimit now (default
    // limit 1, one claim per eligible wallet/asset) — this closed a
    // real gap found during testing where nothing prevented one
    // eligible wallet from claiming the entire allocation by itself.
    // Every campaign deployed after that fix has claimLimitId set;
    // older campaigns deployed before the fix won't, so this stays
    // conditional rather than assumed-always-present.
    // The mint args must name exactly the counter guards deployed on this
    // campaign, and sending the wrong shape does not fall back to anything
    // safe - the instruction fails to deserialize against the guard set.
    //
    //   "both"   (default since 2026-09-03) mintLimit AND assetMintLimit
    //   "wallet" mintLimit only
    //   "asset"  assetMintLimit only
    //   ""       every campaign deployed before that date: assetMintLimit
    //            with id 1, which is why assetLimitId falls back to
    //            claimLimitId rather than being assumed absent.
    const claimScope = campaign.claimScope || "asset";
    const walletLimitId = campaign.claimLimitId;
    const assetLimitId = campaign.assetLimitId || campaign.claimLimitId;

    if ((claimScope === "both" || claimScope === "wallet") && walletLimitId) {
      mintArgs.mintLimit = some({ id: Number(walletLimitId) });
    }
    if ((claimScope === "both" || claimScope === "asset") && assetLimitId) {
      mintArgs.assetMintLimit = some({ id: Number(assetLimitId), asset: umiPublicKey(qualifyingAsset) });
    }
    // price === 0 campaigns have no solPayment guard deployed at all
    // (see deploy-campaign.js) — must not send solPayment mint args for
    // those, or the instruction bytes would desync from what the
    // on-chain guard set actually expects to deserialize.
    if (campaign.price > 0) {
      if (!campaign.treasury) {
        setMinting(false);
        setStatus("This campaign has a price but no payment destination configured — registry data is incomplete.");
        return;
      }
      mintArgs.solPayment = some({ destination: umiPublicKey(campaign.treasury) });
    }

    setStatus(
      campaign.rewardText ? `Claiming — ${campaign.rewardText}...` : "Claiming..."
    );

    const builder = mintV1(umi, {
      candyMachine: umiPublicKey(campaign.campaignCandyMachineAddress),
      collection: umiPublicKey(campaign.targetCollection),
      asset,
      mintArgs,
    });

    setStatus("Waiting for wallet approval...");
    const sent = await builder.sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
    const signatureBase58 = bs58.encode(sent.signature);

    // sendAndConfirm returns normally when the transaction landed and failed
    // (open-items 66), so read the confirmation's error before saying anything.
    if (landedError(sent)) {
      setMinting(false);
      setStatus(describeLandedClaimFailure(signatureBase58));
      return;
    }

    // Read the asset back; a miss is "not visible yet", not a failure.
    let visible = false;
    for (let attempt = 1; attempt <= 4 && !visible; attempt++) {
      if (attempt > 1) await new Promise((r) => setTimeout(r, 1500));
      try {
        visible = !!(await safeFetchAssetV1(umi, asset.publicKey, { commitment: "confirmed" }));
      } catch {
        // not visible yet
      }
    }
    setMinting(false);
    setStatus(
      visible
        ? `Complete - claim confirmed. Signature: ${signatureBase58} | Asset: ${asset.publicKey.toString()}`
        : `Claim confirmed (signature ${signatureBase58}), but the asset ${asset.publicKey.toString()} is not visible yet. Check your wallet in a minute.`
    );
  } catch (err) {
    setMinting(false);
    setStatus(describeClaimError(err));
  }
}
