#!/usr/bin/env node
/**
 * scripts/reconcile.selftest.js
 *
 * Exercises the comparison logic of reconcile.js with no network. Run it
 * before and after touching that script.
 *
 *   node scripts/reconcile.selftest.js
 *
 * FIXTURES ARE PRODUCTION DATA, not written to match the code (open-items 50):
 *   FORK  - my-new-collection/backend/master.csv at its HEAD, the four TEST rows
 *   DRIFT - the same file as found on 2026-10-21 with +11 on every maxSupply
 *           (open-items 51), the case this script exists to catch
 * Chain values are what the chain verification read on 2026-10-21: TEST-004
 * itemsAvailable 8, itemsRedeemed 2 (docs/runs/chain-verification-2026-10-21.md).
 *
 * WHAT IT PROVES
 *   - The six-week drift is reported as a mismatch, by drop, with its size.
 *   - maxSupply is read as deploy-candy-machine.js reads it, so an open
 *     edition matches its u32 cap - but a typo that deploy would also read as
 *     unlimited is flagged rather than passed.
 *   - A missing account, an ambiguous CSV value and a mismatch all fail; a
 *     row on another network is skipped and does not.
 *
 * WHAT IT DOES NOT PROVE
 *   That main() reads the right account for each row, or that the RPC returns
 *   what it should. That is shown only by running reconcile.js against the
 *   chain.
 *
 * Exit codes:
 *   0 = every assertion held
 *   1 = an assertion failed
 */
"use strict";

const assert = require("assert");
const path = require("path");
const m = require(path.join(__dirname, "reconcile.js"));

function ok(label, detail) {
  console.log(`  ok  ${label}${detail ? " — " + detail : ""}`);
}

// my-new-collection/backend/master.csv, verbatim for the columns read.
const FORK = [
  { dropItemId: "TEST-001", collectionSlug: "test-mech-a", maxSupply: "5", network: "mainnet", candyMachineAddress: "" },
  { dropItemId: "TEST-002", collectionSlug: "test-mech-b", maxSupply: "5", network: "mainnet", candyMachineAddress: "CzTMdNb7Umu9mexAex8L6NYUaYquoCRiTNQEC6kpsX8T" },
  { dropItemId: "TEST-003", collectionSlug: "test-mech", maxSupply: "5", network: "mainnet", candyMachineAddress: "D24hPHn7rx6mLcwYwsBRXh2oDrpYbPTM8eTWVzceY27U" },
  { dropItemId: "TEST-004", collectionSlug: "test-mech", maxSupply: "8", network: "mainnet", candyMachineAddress: "BLGGzRUgu5KQKJCkTM7CevhJibvpf9geCmDrxerusp7P" },
];
// The same file as found before the chain verification: +11 on every row.
const DRIFT = FORK.map((r) => ({ ...r, maxSupply: String(Number(r.maxSupply) + 11) }));
const row = (rows, id) => rows.find((r) => r.dropItemId === id);
const TEST_004_CHAIN = { itemsAvailable: 8n, itemsRedeemed: 2n }; // bigints, as umi returns them

(async () => {
  console.log("\n  reconcile.js — CSV against chain, offline\n");

  // ---- The case it exists for ----------------------------------------------
  const drift = m.compareRow(row(DRIFT, "TEST-004"), TEST_004_CHAIN, "mainnet");
  assert.strictEqual(drift.status, "mismatch");
  assert.strictEqual(drift.chainAvailable, 8);
  assert.strictEqual(drift.itemsRedeemed, 2);
  assert.ok(drift.detail.includes("drift +11"), drift.detail);
  assert.strictEqual(m.exitCodeFor([drift]), 1);
  ok("the six-week +11 drift is a mismatch and fails", "TEST-004: CSV 19, chain 8, drift +11");

  const clean = m.compareRow(row(FORK, "TEST-004"), TEST_004_CHAIN, "mainnet");
  assert.strictEqual(clean.status, "match");
  assert.strictEqual(clean.detail, "");
  assert.strictEqual(m.exitCodeFor([clean]), 0);
  ok("the restored CSV matches the same chain values", "TEST-004: 8 and 8, bigints from umi compared as numbers");

  const down = m.compareRow({ ...row(FORK, "TEST-004"), maxSupply: "8" }, { itemsAvailable: 2n, itemsRedeemed: 2n }, "mainnet");
  assert.strictEqual(down.status, "mismatch");
  assert.ok(down.detail.includes("drift +6"));
  ok("a chain cap cut below the CSV is caught too", "the 3c.i cut, had the write-back failed");

  // ---- Reading maxSupply as deploy-candy-machine.js does -------------------
  const U = m.UNLIMITED_ITEMS_AVAILABLE;
  assert.strictEqual(U, 4294967295);
  for (const v of ["unlimited", "Unlimited", " unlimited ", ""]) assert.strictEqual(m.expectedItemsAvailable(v), U, JSON.stringify(v));
  assert.strictEqual(m.expectedItemsAvailable("8"), 8);
  assert.strictEqual(m.expectedItemsAvailable("8.9"), 8);
  const open = m.compareRow({ ...row(FORK, "TEST-002"), maxSupply: "unlimited" }, { itemsAvailable: BigInt(U), itemsRedeemed: 0n }, "mainnet");
  assert.strictEqual(open.status, "match");
  const openCapped = m.compareRow({ ...row(FORK, "TEST-002"), maxSupply: "unlimited" }, { itemsAvailable: 1000n, itemsRedeemed: 0n }, "mainnet");
  assert.strictEqual(openCapped.status, "mismatch");
  ok("an open edition matches its u32 cap, and only that", "\"unlimited\" against 1,000 on chain is a mismatch");

  for (const v of ["abc", "0", "-3", "1e"]) {
    assert.strictEqual(m.isAmbiguousMaxSupply(v), true, v);
    const r = m.compareRow({ ...row(FORK, "TEST-002"), maxSupply: v }, { itemsAvailable: BigInt(U), itemsRedeemed: 0n }, "mainnet");
    assert.strictEqual(r.status, "csv_ambiguous", v);
    assert.strictEqual(m.exitCodeFor([r]), 1);
  }
  ok("a typo deploy would read as unlimited is flagged, not matched", '"abc", "0", "-3", "1e"');

  // ---- Missing, other network, and the exit code ---------------------------
  const gone = m.compareRow(row(FORK, "TEST-003"), null, "mainnet");
  assert.strictEqual(gone.status, "missing_on_chain");
  assert.strictEqual(m.exitCodeFor([gone]), 1);
  ok("a candyMachineAddress with no account on chain fails", "D24hPHn7 as if closed");

  const elsewhere = m.compareRow(row(FORK, "TEST-004"), null, "devnet");
  assert.strictEqual(elsewhere.status, "other_network");
  assert.strictEqual(m.exitCodeFor([elsewhere, clean]), 0);
  ok("a row on another network is listed and skipped, not failed", "config.rpc serves one network");

  assert.strictEqual(m.exitCodeFor([clean, clean, drift]), 1);
  assert.strictEqual(m.exitCodeFor([]), 0);
  ok("one disagreement among matches fails the whole run", "exit 1");

  // ---- The table marks what disagrees --------------------------------------
  const table = m.formatTable([clean, drift, open]).split("\n");
  assert.ok(table[0].includes("csv maxSupply") && table[0].includes("chain cap") && table[0].includes("redeemed"));
  const marked = table.filter((l) => l.startsWith("<<"));
  assert.strictEqual(marked.length, 1);
  assert.ok(marked[0].includes("TEST-004") && marked[0].includes("19") && marked[0].includes("drift +11"));
  assert.ok(table.some((l) => l.includes("u32 max")));
  ok("the table marks exactly the disagreeing rows", "<< TEST-004 19 vs 8");

  console.log("\n  All local assertions held. No RPC call was made.\n");
})().catch((err) => {
  console.error("\n  FAILED: " + err.message + "\n");
  process.exit(1);
});
