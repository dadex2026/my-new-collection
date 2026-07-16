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
  if (lower.includes("blockhash not found") || lower.includes("timed out") || lower.includes("timeout")) {
    return "Network timeout — the transaction didn't confirm in time. Check your wallet/explorer before retrying, in case it actually went through.";
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

    setStatus("Waiting for wallet approval...");

    const builder = mintV1(umi, {
      candyMachine: umiPublicKey(drop.candyMachineAddress),
      collection: umiPublicKey(drop.collectionAddress),
      asset,
      mintArgs: {
        solPayment: some({ destination: umiPublicKey(drop.treasury) }),
      },
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