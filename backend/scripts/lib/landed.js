/**
 * scripts/lib/landed.js
 *
 * Whether a transaction did what it was sent to do (open-items 66).
 *
 * Umi's sendAndConfirm does not throw when a transaction lands and fails on
 * chain: it returns web3.js's confirmation, which resolves normally with
 * `value.err` set, and throws only on expiry. A script that writes an address
 * or a "success" row because sendAndConfirm returned can therefore record an
 * account that does not exist. Two checks close it:
 *
 *   assertLanded(sent)  throws if the confirmed transaction carries an error;
 *   readBack(fetchFn)   polls until the account the transaction made exists.
 *
 * The poll is for the reason recorded in update-candy-guard.js on
 * 2026-09-03: "confirmed" does not mean every read node has the write yet, and
 * a read-back that cries wolf trains people to ignore it.
 */

function assertLanded(sent) {
  const err = sent && sent.result && sent.result.value ? sent.result.value.err : null;
  if (err != null) {
    let detail;
    try {
      detail = JSON.stringify(err);
    } catch {
      detail = String(err);
    }
    const e = new Error(`the transaction landed and failed on chain: ${detail}`);
    e.landedFailure = true;
    throw e;
  }
  return sent;
}

// fetchFn returns the account, or null/undefined while it is not visible.
// Errors from fetchFn count as "not visible yet". Returns the account, or null
// once every attempt has missed.
async function readBack(fetchFn, { attempts = 6, delayMs = 2500 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, delayMs));
    try {
      const account = await fetchFn();
      if (account) return account;
    } catch {
      // not visible yet
    }
  }
  return null;
}

module.exports = { assertLanded, readBack };
