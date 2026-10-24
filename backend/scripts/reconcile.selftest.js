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

  // ---- campaigns.csv (open-items 57) ----------------------------------------
  // my-new-collection/backend/campaigns.csv, verbatim for the columns read, and
  // the chain as read on 2026-10-21.
  const CAMPAIGN = (campaignId, campaignCandyMachineAddress, eligibilityCollection) =>
    ({ campaignId, campaignCandyMachineAddress, eligibilityCollection, network: "mainnet" });
  const V = "7DayQZfbPCXz5xMpkFG3RsPdsWL4hwWX9ea3EjKj2xVP";
  const liveRow = CAMPAIGN("test-mech-d-reward", "3MrHBsSa3mD6xhuP2rgQy3b7bsbmawch9vNUVDpo6esf", V);
  const live = m.compareCampaignRow(liveRow, { kind: "candy_machine", itemsAvailable: 5n, itemsRedeemed: 0n }, "mainnet");
  assert.strictEqual(live.status, "live");
  assert.strictEqual(live.claimed, "0/5");
  const p6 = m.compareCampaignRow(CAMPAIGN("test-page-006", "7RJWhvQBQPEjJmki5fhBboGBWRJhmcFkMvrr4Fu3tMSJ", "DWGTLJUEyGUH33dLut6JLLbPqpHnPm8tLW2ejnj6EEcw"), null, "mainnet");
  assert.strictEqual(p6.status, "no_account");
  const p4 = m.compareCampaignRow(CAMPAIGN("test-page-004", "h82pJGF9p7kpzb6eU326EFZf2cDnimbTFVeJtx1qtBmU", V), "invalid", "mainnet");
  assert.strictEqual(p4.status, "invalid_address");
  const wallet = m.compareCampaignRow(CAMPAIGN("odd", "7XJJvj5N4aBMNyX9g5NZqSEzi9vY6vYxWydezMZvC4n9", V), { kind: "other" }, "mainnet");
  assert.strictEqual(wallet.status, "not_a_candy_machine");
  const dev = m.compareCampaignRow({ ...liveRow, network: "devnet" }, null, "mainnet");
  assert.strictEqual(dev.status, "other_network");
  ok("campaign rows: live, no account, invalid key, not a machine, other network", "test-page-006 - 3a's \"live\" campaign - is no_account");

  // Closed rows (close-campaign.js): the chain's history decides, not the CSV.
  const closedRow = { ...liveRow, campaignStatus: "closed", closedSignature: "48b1yXFGDuhA78EYwMTbyxCrYYdrqu284Gxr4g4Qi6msapoZGymggHpCJE2AAt5VSgniqmx8VD4C5j4YNYxJP5BT" };
  assert.strictEqual(m.compareCampaignRow(closedRow, null, "mainnet", true).status, "closed");
  assert.strictEqual(m.compareCampaignRow(closedRow, null, "mainnet", false).status, "closed_without_history");
  assert.strictEqual(m.compareCampaignRow(closedRow, { kind: "candy_machine", itemsAvailable: 5n, itemsRedeemed: 0n }, "mainnet").status, "marked_closed_but_live");
  assert.strictEqual(m.compareCampaignRow(liveRow, null, "mainnet", true).status, "no_account");
  ok("a closed row passes only with history; never-existed and still-live fail", "item 50's real close signature as the record");

  const ctable = m.formatCampaignTable([live, p6, p4, dev]).split("\n");
  assert.deepStrictEqual(ctable.filter((l) => l.startsWith("<<")).map((l) => l.split(/\s+/)[1]), ["test-page-006", "test-page-004"]);
  ok("the campaign table marks exactly the rows that are not live", "<< test-page-006, test-page-004");

  // The six candy machines under the fork's deployer on 2026-10-21, and every
  // address the two CSVs record.
  const ON_CHAIN = [
    "3MrHBsSa3mD6xhuP2rgQy3b7bsbmawch9vNUVDpo6esf", "BLGGzRUgu5KQKJCkTM7CevhJibvpf9geCmDrxerusp7P",
    "CzTMdNb7Umu9mexAex8L6NYUaYquoCRiTNQEC6kpsX8T", "D24hPHn7rx6mLcwYwsBRXh2oDrpYbPTM8eTWVzceY27U",
    "GcwSvghcrDmbC2o3Td5ns13ugbS8Z9f14cR42LeQV7v6", "HFnMxQj7idRHkt9uPQ6QPQGWnm8821rycT8ovNJEDgNZ",
  ];
  const RECORDED = [
    ...FORK.map((r) => r.candyMachineAddress),
    "HFnMxQj7idRHkt9uPQ6QPQGWnm8821rycT8ovNJEDgNZ", "GcwSvghcrDmbC2o3Td5ns13ugbS8Z9f14cR42LeQV7v6",
    "3MrHBsSa3mD6xhuP2rgQy3b7bsbmawch9vNUVDpo6esf", "h82pJGF9p7kpzb6eU326EFZf2cDnimbTFVeJtx1qtBmU",
    "NJAEqN76R7PwPfHt3oWb8R6cKvhgyxQdDn53jFrK6wFx", "7RJWhvQBQPEjJmki5fhBboGBWRJhmcFkMvrr4Fu3tMSJ",
    "5EdynMEiYSyiWAH9GpcbHpeUzeSQF9ZY6q4x8AhBskUf", "5RRfWaHcx1ko8kybqJriN8KUBW1oyoHZqCZ7xhLvhZfD", "",
  ];
  assert.deepStrictEqual(m.findUnrecorded(ON_CHAIN, RECORDED), []);
  // The dangerous direction: test-mech-d-reward deployed, its column blank.
  const blanked = RECORDED.filter((a) => a !== "3MrHBsSa3mD6xhuP2rgQy3b7bsbmawch9vNUVDpo6esf");
  assert.deepStrictEqual(m.findUnrecorded(ON_CHAIN, blanked), ["3MrHBsSa3mD6xhuP2rgQy3b7bsbmawch9vNUVDpo6esf"]);
  ok("a live machine no row records is found - the direction guards cannot see", "the fork's six machines all recorded; blank one, it is flagged");

  console.log("\n  All local assertions held. No RPC call was made.\n");
})().catch((err) => {
  console.error("\n  FAILED: " + err.message + "\n");
  process.exit(1);
});
