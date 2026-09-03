/**
 * frontend/src/mint.ts
 *
 * Replaces the old server-based mint() — no more POST /mint to a backend.
 * The buyer's connected wallet builds, signs, and sends a single
 * mintV1 transaction directly to Solana. Payment (via the drop's
 * solPayment guard) and the mint itself happen atomically in one
 * instruction the buyer approves in Phantom. No backend is involved
 * or trusted at mint time.
 *
 * ASSUMPTIONS ABOUT THE REST OF THE CODEBASE — confirmed against the
 * real state.ts / normalize.ts (not guessed):
 *
 *   1. state.ts exports `state` directly (a mutable object), not a
 *      getState() function. setStatus(status: string) takes a plain
 *      string — there's no {type, message} shape, so this file folds
 *      the "kind" of message into the string text itself.
 *
 *   2. normalize.ts's NormalizedRegistry types drops/collections
 *      values as `unknown`, not a concrete RegistryDrop shape. This
 *      file casts to `any` when reading candyMachineAddress /
 *      collectionAddress / treasury off a drop — if normalize.ts's
 *      types get tightened later, these casts can be removed.
 *
 *   3. The registry's drop objects (from registry.json, produced by
 *      generate-registry.js) need the fields that script writes:
 *        - collectionAddress
 *        - candyMachineAddress
 *        - treasury (the SOL payment destination — matches the
 *          candy guard's configured destination)
 *
 *   4. @solana/web3.js and the Metaplex/Umi packages below are added
 *      to frontend/package.json as new dependencies.
 *
 * Dependencies (npm install, in frontend/):
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

// ---- Local pending-mint marker (ties into future mintRecovery.ts) -------
// Written before sending, cleared on success or explicit failure. A
// dedicated mintRecovery.ts can read this key on page load to offer
// "Resume mint?" if the page was refreshed mid-transaction.
const PENDING_MINT_KEY = "template-open-edition:pending-mint";

function setPendingMint(dropId: string, wallet: string) {
  try {
    localStorage.setItem(
      PENDING_MINT_KEY,
      JSON.stringify({ dropId, wallet, startedAt: Date.now() })
    );
  } catch {
    // localStorage can throw in private-browsing/quota-exceeded cases —
    // recovery is a nice-to-have, never block the mint over it.
  }
}

function clearPendingMint() {
  try {
    localStorage.removeItem(PENDING_MINT_KEY);
  } catch {
    /* ignore */
  }
}

// ---- Friendly error mapping (replaces the old generic "Mint failed") ----

function describeMintError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes("user rejected") || lower.includes("rejected the request")) {
    return "Wallet rejected — you cancelled the transaction in your wallet.";
  }
  if (lower.includes("insufficient") || lower.includes("insufficient funds")) {
    return "Insufficient SOL — your wallet doesn't have enough SOL to cover the price and network fee.";
  }
  // "has expired: block height exceeded" is the common shape of this on a busy
  // mainnet, and it matched none of the substrings above until 2026-09-03 - so
  // the one case where the advice not to retry blindly matters most fell
  // through to the generic branch and printed the raw error instead. An
  // expired blockhash means the client stopped waiting, NOT that the
  // transaction failed; it may already have landed.
  if (
    lower.includes("blockhash not found") ||
    lower.includes("block height exceeded") ||
    lower.includes("has expired") ||
    lower.includes("timed out") ||
    lower.includes("timeout")
  ) {
    return "Network timeout — the transaction didn't confirm in time. It may still have gone through: check the signature in an explorer before retrying, or you may pay twice.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network error") || lower.includes("503")) {
    return "RPC unavailable — couldn't reach the Solana network. Try again in a moment.";
  }
  if (lower.includes("noeligiblegroup") || lower.includes("guard") || lower.includes("mintlimit")) {
    return "Not eligible to mint right now — you may have reached the per-wallet mint limit, or minting hasn't started yet.";
  }
  if (lower.includes("insufficientitemsremaining") || lower.includes("sold out")) {
    return "Collection sold out — no more editions remain for this drop.";
  }

  return `Mint failed — ${message}`;
}

// ---- Build a Umi-compatible wallet adapter from window.solana (Phantom) -

function getPhantomWalletAdapter(): WalletAdapter {
  const provider = (window as any).solana;
  if (!provider || !provider.publicKey) {
    throw new Error("Wallet not connected — connect your wallet before minting.");
  }

  return {
    publicKey: new PublicKey(provider.publicKey.toString()),
    signTransaction: (tx) => provider.signTransaction(tx),
    signAllTransactions: (txs) => provider.signAllTransactions(txs),
  };
}

// ---- Main mint function --------------------------------------------------

export async function mint(dropId: string): Promise<void> {
  // state.registry is an array of { collection, drops: [...] } groups
  // (see adapter.ts's groupForUI), matching what ui.engine.ts renders —
  // not a flat map. Each drop's identity field is `key`, matching
  // ui.engine.ts's data-drop-id, not dropItemId (registry.json's name
  // for the same value before adapter.ts reshapes it).
  const collections = (state.registry as any[]) ?? [];
  const drop = collections.flatMap((c) => c.drops).find((d: any) => d.key === dropId);

  if (!drop) {
    setStatus(`Unknown drop: ${dropId}`);
    return;
  }
  if (!drop.candyMachineAddress) {
    setStatus("This drop hasn't been deployed on-chain yet.");
    return;
  }
  if (!drop.collectionAddress) {
    setStatus("This drop's collection hasn't been deployed on-chain yet.");
    return;
  }
  if (!drop.treasury) {
    setStatus("Missing payment destination for this drop — registry data is incomplete.");
    return;
  }

  let walletAdapter: WalletAdapter;
  try {
    walletAdapter = getPhantomWalletAdapter();
  } catch (err) {
    setStatus(describeMintError(err));
    return;
  }

  const walletAddress = walletAdapter.publicKey!.toString();

  setMinting(true);
  setStatus("Preparing transaction...");
  setPendingMint(dropId, walletAddress);

  try {
    const umi = createUmi(RPC_URL).use(mplCore()).use(mplCandyMachine());
    umi.use(walletAdapterIdentity(walletAdapter));

    const asset = generateSigner(umi);

    // ---- Holder-redemption branch ------------------------------------
    // drop.holderRequiredCollection comes from master.csv's
    // holderRequiredCollection column via generate-registry.js, and is
    // written there by deploy-candy-machine.js --holder-collection (new
    // machines) or update-candy-guard.js (machines already deployed).
    // Drops with no holder route leave it empty — for those, `group`
    // must be omitted entirely below, not set to some("public"), since a
    // candy machine with an empty groups array has no group named
    // "public" to match.
    //
    // The guard is assetBurn, not assetGate. assetGate only checks that
    // the wallet still holds a qualifying asset, so one asset admits an
    // unlimited number of mints across an unlimited number of campaigns.
    // assetBurn consumes it, which is the only way this codebase can
    // express "choose one of N" — see docs/open-items.md.
    //
    // The mintArgs below must name exactly the guards the chosen group
    // has active on chain. A mismatch does not fall back to something
    // safe; the instruction fails to deserialize against that group.
    let group: string | undefined;
    const mintArgs: any = {};

    if (drop.holderRequiredCollection) {
      setStatus("Checking holder eligibility...");
      const qualifyingAsset = await findQualifyingHolderAsset(walletAddress, drop.holderRequiredCollection);

      if (qualifyingAsset) {
        group = "holder";
        mintArgs.assetBurn = some({
          requiredCollection: umiPublicKey(drop.holderRequiredCollection),
          asset: umiPublicKey(qualifyingAsset),
        });
        // solPayment is in the holder group only when the drop was
        // configured with a non-zero holder price — mirroring what
        // update-candy-guard.js and deploy-candy-machine.js write.
        const holderPrice = drop.holderPrice != null ? Number(drop.holderPrice) : 0;
        if (holderPrice > 0) {
          mintArgs.solPayment = some({ destination: umiPublicKey(drop.treasury) });
          setStatus(`Holder price applied — minting at ${holderPrice} SOL. Your voucher will be burned.`);
        } else {
          setStatus("Redeeming — your voucher will be burned to mint this...");
        }
      } else {
        group = "public";
        mintArgs.solPayment = some({ destination: umiPublicKey(drop.treasury) });
      }
    } else {
      // Original, unchanged path — no groups, no group parameter passed.
      mintArgs.solPayment = some({ destination: umiPublicKey(drop.treasury) });
    }

    setStatus("Waiting for wallet approval...");

    const builder = mintV1(umi, {
      candyMachine: umiPublicKey(drop.candyMachineAddress),
      collection: umiPublicKey(drop.collectionAddress),
      asset,
      ...(group ? { group: some(group) } : {}),
      mintArgs,
    });

    setStatus("Minting...");
    const { signature } = await builder.sendAndConfirm(umi, {
      confirm: { commitment: "confirmed" },
    });

    setStatus("Confirming...");

    const signatureBase58 = bs58.encode(signature);

    clearPendingMint();
    setMinting(false);
    setStatus(`Complete — mint confirmed. Signature: ${signatureBase58} | Asset: ${asset.publicKey.toString()}`);
  } catch (err) {
    clearPendingMint();
    setMinting(false);
    setStatus(describeMintError(err));
  }
}

// ---- Holder eligibility check (DAS query, browser-side) -----------------
// Checks whether the connected wallet holds at least one asset from the
// required collection, using the Helius DAS getAssetsByOwner method. The
// same call is made in campaign.ts for campaign eligibility.
//
// This is a UI convenience only. The real, trustless enforcement is the
// on-chain assetBurn guard: a wallet that does not hold a qualifying
// asset has its mint rejected by the program even if this check is
// bypassed entirely.
//
// Two corrections have already been made to this comment, both because
// it asserted things about get-holders.js that stopped being true —
// that it used getAssetsByGroup (it never did), and that it was 0 bytes
// (it was written on 2026-09-02 and is not). Neither was caught by
// check-docs, which only scanned docs/ until 2026-09-03. It scans
// source now.
async function findQualifyingHolderAsset(walletAddress: string, requiredCollection: string): Promise<string | null> {
  const MAX_PAGES = 3; // bounded — checking a personal wallet, not building a full holder list
  const PAGE_LIMIT = 1000;

  for (let page = 1; page <= MAX_PAGES; page++) {
    let response: Response;
    try {
      response = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "holder-check",
          method: "getAssetsByOwner",
          params: { ownerAddress: walletAddress, page, limit: PAGE_LIMIT },
        }),
      });
    } catch {
      return null; // network failure — treat as "not verified", fall back to public group
    }

    if (!response.ok) return null;

    const body = await response.json();
    const items = body.result?.items || [];

    // `!item.burnt` is load-bearing. DAS returns a burned asset with its
    // ownership record intact and only this flag to say it is gone, so without
    // the check a wallet that has already redeemed keeps matching: the mint is
    // routed to the `holder` group, `assetBurn` is handed an asset that no
    // longer exists, and the transaction reverts in simulation. The wallet can
    // then never mint again — not through `holder`, because the voucher is
    // spent, and not through `public`, because this function never lets it fall
    // through. Observed on mainnet 2026-09-03, the first time anyone redeemed.
    // The identical omission in get-holders.js is open-items 38.
    const match = items.find(
      (item: any) =>
        !item.burnt &&
        (item.grouping || []).some((g: any) => g.group_key === "collection" && g.group_value === requiredCollection)
    );
    if (match) return match.id;

    if (items.length < PAGE_LIMIT) break; // last page
  }

  return null;
}