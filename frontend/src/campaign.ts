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
import { mplCore } from "@metaplex-foundation/mpl-core";
import { mplCandyMachine, mintV1 } from "@metaplex-foundation/mpl-core-candy-machine";
import { generateSigner, publicKey as umiPublicKey, some } from "@metaplex-foundation/umi";
import { walletAdapterIdentity, WalletAdapter } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

import { state, setStatus, setMinting } from "./state";

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

// ---- Friendly error mapping (same categories as mint.ts) -----------------

function describeClaimError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes("user rejected") || lower.includes("rejected the request")) {
    return "Wallet rejected — you cancelled the transaction in your wallet.";
  }
  if (lower.includes("insufficient")) {
    return "Insufficient SOL — your wallet doesn't have enough SOL to cover the price and network fee.";
  }
  if (lower.includes("assetgate") || lower.includes("missing required")) {
    return "Not eligible — you don't currently hold the required NFT for this campaign.";
  }
  if (lower.includes("insufficientitemsremaining") || lower.includes("sold out")) {
    return "This campaign is sold out — all allocations have been claimed.";
  }
  if (lower.includes("blockhash not found") || lower.includes("timeout")) {
    return "Network timeout — the transaction didn't confirm in time. Check your wallet/explorer before retrying.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network error")) {
    return "RPC unavailable — couldn't reach the Solana network. Try again in a moment.";
  }
  return `Claim failed — ${message}`;
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
    const qualifyingAsset = await findQualifyingAsset(walletAddress, campaign.eligibilityCollection);
    if (!qualifyingAsset) {
      setMinting(false);
      setStatus("Not eligible — you don't currently hold the required NFT for this campaign.");
      return;
    }

    const umi = createUmi(RPC_URL).use(mplCore()).use(mplCandyMachine());
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
    if (campaign.claimLimitId) {
      // Which counter guard is deployed depends on how the campaign was
      // created: --per-wallet gives mintLimit (one claim per wallet, args
      // { id }), the default gives assetMintLimit (one per qualifying NFT,
      // args { id, asset }). Sending the wrong shape does not fall back to
      // anything safe - the instruction fails to deserialize against the
      // guard set. claimScope is empty for every campaign deployed before
      // 2026-09-03, and all of those are per-asset.
      if (campaign.claimScope === "wallet") {
        mintArgs.mintLimit = some({ id: Number(campaign.claimLimitId) });
      } else {
        mintArgs.assetMintLimit = some({ id: Number(campaign.claimLimitId), asset: umiPublicKey(qualifyingAsset) });
      }
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
    const { signature } = await builder.sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });

    const signatureBase58 = bs58.encode(signature);
    setMinting(false);
    setStatus(`Complete — claim confirmed. Signature: ${signatureBase58} | Asset: ${asset.publicKey.toString()}`);
  } catch (err) {
    setMinting(false);
    setStatus(describeClaimError(err));
  }
}
