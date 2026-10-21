#!/usr/bin/env node
/**
 * scripts/deploy-campaign.selftest.js
 *
 * Exercises the voucher headroom floor of deploy-campaign.js with no network,
 * no RPC and no deploy key. Run it before and after touching that script.
 *
 *   node scripts/deploy-campaign.selftest.js
 *
 * WHY IT EXISTS
 *   Until 2026-10-21 the floor had no offline test at all, and it recognised a
 *   voucher only by its row's mintStatus. The fork's real voucher, TEST-001,
 *   reads "ready", so the floor was skipped in silence and a 999-allocation
 *   campaign deployed on mainnet (open-items 50). The first fixture below is
 *   copied from that master.csv rather than written to match the code: a
 *   fixture built from the author's assumption cannot catch the assumption.
 *
 * WHAT IT PROVES
 *   - isVoucherTarget accepts a voucher by label OR by redemption, and an
 *     empty collectionAddress never matches the empty holderRequiredCollection
 *     every unmigrated row carries.
 *   - headroomRows finds every drop a voucher is spendable on and measures each
 *     against the WHOLE allocation, with the boundary in the right place.
 *   - Every collection this repo's own master.csv names as a
 *     holderRequiredCollection is detected as a voucher.
 *
 * WHAT IT DOES NOT PROVE
 *   Live headroom. The floor reads maxSupply offline, never itemsRedeemed, so
 *   remaining >= outstanding vouchers + public sales intended is still read per
 *   drop with update-candy-machine-supply.js. Nor does it prove main() calls
 *   these functions on the path that deploys; the --dry-run runs recorded in
 *   docs/runs/chain-verification-2026-10-21.md do that.
 *
 * Exit codes:
 *   0 = every assertion held
 *   1 = an assertion failed
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { parseCsvRecords } = require("./lib/csv");
const m = require(path.join(__dirname, "deploy-campaign.js"));

function ok(label, detail) {
  console.log(`  ok  ${label}${detail ? " — " + detail : ""}`);
}

// my-new-collection/backend/master.csv at 2db9607, the columns the floor reads,
// values verbatim.
const VOUCHER = "7DayQZfbPCXz5xMpkFG3RsPdsWL4hwWX9ea3EjKj2xVP";
const SHARED = "DWGTLJUEyGUH33dLut6JLLbPqpHnPm8tLW2ejnj6EEcw";
const FORK = [
  { dropItemId: "TEST-001", mintStatus: "ready", maxSupply: "5", collectionAddress: VOUCHER, holderRequiredCollection: "" },
  { dropItemId: "TEST-002", mintStatus: "ready", maxSupply: "5", collectionAddress: "4VKpPBoWctoQCECh5QquzaX9WM6vJChEArWCb2kUxJF9", holderRequiredCollection: "" },
  { dropItemId: "TEST-003", mintStatus: "ready", maxSupply: "5", collectionAddress: SHARED, holderRequiredCollection: "" },
  { dropItemId: "TEST-004", mintStatus: "ready", maxSupply: "8", collectionAddress: SHARED, holderRequiredCollection: VOUCHER },
];
const row = (id) => FORK.find((r) => r.dropItemId === id);

(async () => {
  console.log("\n  deploy-campaign.js — voucher headroom floor, offline\n");

  // ---- isVoucherTarget ----------------------------------------------------
  assert.strictEqual(m.isVoucherTarget({ mintStatus: "voucher", collectionAddress: "" }, []), true);
  assert.strictEqual(m.isVoucherTarget({ mintStatus: " Voucher ", collectionAddress: "" }, []), true);
  ok("a mintStatus of voucher counts on its own", "before migration no drop redeems it yet");

  assert.strictEqual(m.isVoucherTarget(row("TEST-001"), FORK), true);
  ok("TEST-001 reads ready and is still the voucher", "TEST-004 names its collection - the 2026-10-21 case");

  assert.strictEqual(m.isVoucherTarget(row("TEST-002"), FORK), false);
  assert.strictEqual(m.isVoucherTarget(row("TEST-003"), FORK), false);
  ok("a drop nothing redeems is not a voucher", "TEST-002, TEST-003");

  assert.strictEqual(m.isVoucherTarget({ mintStatus: "ready", collectionAddress: "" }, FORK), false);
  assert.strictEqual(m.isVoucherTarget({ mintStatus: "ready", collectionAddress: "  " }, FORK), false);
  ok("an empty collectionAddress never matches", "three FORK rows have an empty holderRequiredCollection");

  // ---- headroomRows -------------------------------------------------------
  const r999 = m.headroomRows(row("TEST-001"), FORK, 999);
  assert.deepStrictEqual(r999, [{ dropItemId: "TEST-004", raw: "8", n: 8, below: true }]);
  ok("TEST-004 at 8 is below an allocation of 999", "the refusal step 3b expected");

  assert.strictEqual(m.headroomRows(row("TEST-001"), FORK, 8)[0].below, false);
  assert.strictEqual(m.headroomRows(row("TEST-001"), FORK, 9)[0].below, true);
  ok("a cap equal to the allocation is not below it", "8 vs 8 passes, 8 vs 9 refuses");

  const open = (maxSupply) => [{ dropItemId: "OPEN", maxSupply, collectionAddress: "X", holderRequiredCollection: VOUCHER }];
  for (const s of ["", "0", "-1", "unlimited"]) {
    assert.strictEqual(m.headroomRows(row("TEST-001"), open(s), 999)[0].below, false, `maxSupply "${s}"`);
  }
  ok("a blank or non-positive maxSupply is uncapped, never below", '"", "0", "-1", "unlimited"');

  const two = [
    ...FORK,
    { dropItemId: "TEST-005", mintStatus: "ready", maxSupply: "1000", collectionAddress: SHARED, holderRequiredCollection: VOUCHER },
  ];
  const both = m.headroomRows(row("TEST-001"), two, 999);
  assert.deepStrictEqual(both.map((r) => [r.dropItemId, r.below]), [["TEST-004", true], ["TEST-005", false]]);
  ok("each redeemable drop is measured against the WHOLE allocation", "it cannot be split between them");

  assert.deepStrictEqual(m.headroomRows(row("TEST-003"), FORK, 999), []);
  assert.deepStrictEqual(m.headroomRows({ collectionAddress: "" }, FORK, 999), []);
  ok("nothing redeemable, or no collection, yields no rows", "never a match on empty strings");

  // ---- This repo's own master.csv ----------------------------------------
  const csvPath = path.join(__dirname, "..", "master.csv");
  if (!fs.existsSync(csvPath)) {
    ok("this repo's master.csv", "not present - nothing to compare, and that is said rather than passed");
  } else {
    const { records } = parseCsvRecords(fs.readFileSync(csvPath, "utf8"));
    const named = [...new Set(records.map((r) => (r.holderRequiredCollection || "").trim()).filter(Boolean))];
    for (const c of named) {
      const voucherRows = records.filter((r) => (r.collectionAddress || "").trim() === c);
      for (const v of voucherRows) {
        assert.strictEqual(m.isVoucherTarget(v, records), true, `${v.dropItemId} is named as a voucher but not detected`);
      }
    }
    ok(
      "every voucher this repo's master.csv names is detected",
      named.length === 0 ? "it names none, so there was nothing to check" : `${named.length} voucher collection(s)`
    );
  }

  console.log("\n  All local assertions held. No on-chain behaviour was tested.\n");
})().catch((err) => {
  console.error("\n  FAILED: " + err.message + "\n");
  process.exit(1);
});
