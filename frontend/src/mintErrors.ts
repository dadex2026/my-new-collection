// frontend/src/mintErrors.ts
//
// What a mint or claim failure is called on screen. No imports on purpose: a
// Node harness transpiles this file alone and feeds it the errors a real
// validator raises, so the wording is tested against the program, not
// against a guess (open-items 65, 66).

// ---- A transaction that LANDED and failed ---------------------------------
// Umi's sendAndConfirm does not throw when a transaction lands and fails on
// chain. It returns web3.js's confirmation as is, and that confirmation
// resolves normally with `value.err` set; it throws only on expiry. Until
// 2026-10-24 mint.ts and campaign.ts discarded it, so a mint that passed
// preflight simulation and then failed - an edition that sold out in the
// seconds between - printed "Complete" with an asset address that was never
// created, after the network fee was spent (open-items 66).
export function landedError(sent: unknown): string | null {
  const err = (sent as any)?.result?.value?.err;
  if (err == null) return null;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function describeLandedMintFailure(signature: string, holdsVoucher: boolean): string {
  return (
    "Mint failed on chain — the network fee was spent and nothing was minted." +
    (holdsVoucher ? " Your voucher was NOT used and is still in your wallet." : "") +
    ` Signature: ${signature} (check it in an explorer before retrying).`
  );
}

export function describeLandedClaimFailure(signature: string): string {
  return (
    "Claim failed on chain — the network fee was spent and nothing was claimed." +
    ` Signature: ${signature} (check it in an explorer before retrying).`
  );
}

// ---- The edition sold out after the pre-check -----------------------------
// The candy machine program raises CandyMachineEmpty ("Candy machine is
// empty"; guard 0x177b, core 0x1776). It never says "sold out" or
// InsufficientItemsRemaining, so the sold-out branch below it could not
// match, and Umi's message carries "Source: Program > mplCoreCandyGuard",
// whose "guard" matched the eligibility branch first: a voucher holder was
// told they were not eligible (open-items 65). It is checked before every
// other branch for that reason.
export function isCandyMachineEmpty(lower: string): boolean {
  return lower.includes("candymachineempty") || lower.includes("candy machine is empty");
}

export function describeMintError(err: unknown, holdsVoucher = false): string {
  const name = (err as any)?.name ? String((err as any).name) : "";
  const message = err instanceof Error ? err.message : String(err);
  const lower = (name + " " + message).toLowerCase();

  if (isCandyMachineEmpty(lower)) {
    return holdsVoucher
      ? "This edition sold out before your transaction was processed. Your voucher was NOT used and is still in your wallet."
      : "Sold out — the last edition went before your transaction was processed. Nothing was minted.";
  }
  if (lower.includes("user rejected") || lower.includes("rejected the request")) {
    return "Wallet rejected — you cancelled the transaction in your wallet.";
  }
  // Before the plain "insufficient" check: insufficientitemsremaining
  // contains "insufficient", and was being called a lack of SOL.
  if (lower.includes("insufficientitemsremaining") || lower.includes("sold out")) {
    return "Collection sold out — no more editions remain for this drop.";
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

  return `Mint failed — ${message}`;
}

// Moved here from campaign.ts on 2026-10-24. That file is Windows-1252, and
// its dashes reached the page as a replacement character, because the build
// reads source as UTF-8.
export function describeClaimError(err: unknown): string {
  const name = (err as any)?.name ? String((err as any).name) : "";
  const message = err instanceof Error ? err.message : String(err);
  const lower = (name + " " + message).toLowerCase();

  if (isCandyMachineEmpty(lower) || lower.includes("insufficientitemsremaining") || lower.includes("sold out")) {
    return "This campaign is sold out — all allocations have been claimed.";
  }
  if (lower.includes("user rejected") || lower.includes("rejected the request")) {
    return "Wallet rejected — you cancelled the transaction in your wallet.";
  }
  if (lower.includes("insufficient")) {
    return "Insufficient SOL — your wallet doesn't have enough SOL to cover the price and network fee.";
  }
  if (lower.includes("assetgate") || lower.includes("missing required")) {
    return "Not eligible — you don't currently hold the required NFT for this campaign.";
  }
  if (lower.includes("blockhash not found") || lower.includes("timeout")) {
    return "Network timeout — the transaction didn't confirm in time. Check your wallet/explorer before retrying.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network error")) {
    return "RPC unavailable — couldn't reach the Solana network. Try again in a moment.";
  }
  return `Claim failed — ${message}`;
}
