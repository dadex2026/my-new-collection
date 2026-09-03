#!/usr/bin/env node
/**
 * scripts/update-candy-guard.selftest.js
 *
 * Exercises the pure logic of update-candy-guard.js with no network, no
 * RPC and no deploy key. Run it before and after touching that script.
 *
 *   node scripts/update-candy-guard.selftest.js
 *
 * WHAT IT PROVES
 *   - unwrapGuardSet turns the Option-wrapped shape fetchCandyGuard
 *     actually returns into the plain guard args updateCandyGuard takes.
 *   - buildPlan writes an EMPTY default guard set, carries the machine's
 *     existing guards into `public`, and puts assetBurn in `holder`.
 *   - verifyReadBack catches the three ways this migration goes wrong:
 *     a default set that was not emptied (every group inherits it, so a
 *     free holder mint would still be charged), a group that did not
 *     land, and assetGate written where assetBurn was meant.
 *
 * WHAT IT DOES NOT PROVE — and this is the important half
 *   Nothing about how Candy Guard behaves on chain. Whether a group's
 *   guards really override an inherited default, whether assetBurn
 *   really consumes the asset, and who receives the burned asset's rent
 *   are all questions no local test can answer. They are answered by
 *   minting through each group on a machine nobody depends on and
 *   watching the transactions settle.
 *
 * Exit codes:
 *   0 = every assertion held
 *   1 = an assertion failed
 */
"use strict";

const assert = require("assert");
const path = require("path");
const m = require(path.join(__dirname, "update-candy-guard.js"));

const TREASURY = "7XJJvj5N4aBMNyX9g5NZqSEzi9vY6vYxWydezMZvC4n9";
const BURN_COLLECTION = "7DayQZfbEBZQV1YRcbUxCNfrJ3wSTU3EmvsCFqfrLqXV";

function ok(label, detail) {
  console.log(`  ok  ${label}${detail ? " — " + detail : ""}`);
}

(async () => {
  const umiCore = await import("@metaplex-foundation/umi");

  // ---- 1. The shape fetchCandyGuard returns ------------------------------
  const fetched = {
    botTax: { __option: "None" },
    solPayment: {
      __option: "Some",
      value: { lamports: { basisPoints: 1000000n, identifier: "SOL", decimals: 9 }, destination: TREASURY },
    },
    startDate: { __option: "None" },
    mintLimit: { __option: "None" },
  };
  const current = m.unwrapGuardSet(fetched);
  assert.deepStrictEqual(Object.keys(current), ["solPayment"]);
  ok("unwrapGuardSet drops the None slots", "solPayment survives, three None slots do not");

  // ---- 2. The plan ------------------------------------------------------
  const plan = m.buildPlan(current, {
    burnCollection: BURN_COLLECTION,
    holderPrice: 0,
    treasury: TREASURY,
    umiCore,
  });
  assert.deepStrictEqual(plan.guards, {}, "default guard set must be empty — groups inherit it");
  assert.deepStrictEqual(plan.groups.map((g) => g.label), ["public", "holder"]);
  assert.deepStrictEqual(Object.keys(plan.groups[0].guards), ["solPayment"]);
  assert.deepStrictEqual(Object.keys(plan.groups[1].guards), ["assetBurn"]);
  ok("buildPlan", "default={}, public=[solPayment], holder=[assetBurn]");

  const paid = m.buildPlan(current, {
    burnCollection: BURN_COLLECTION,
    holderPrice: 0.005,
    treasury: TREASURY,
    umiCore,
  });
  assert.deepStrictEqual(Object.keys(paid.groups[1].guards).sort(), ["assetBurn", "solPayment"]);
  ok("--holder-price", "adds solPayment to holder and nowhere else");

  const busy = m.buildPlan(
    {
      solPayment: current.solPayment,
      startDate: { date: 123n },
      botTax: { lamports: {}, lastInstruction: true },
      mintLimit: { id: 1, limit: 5 },
    },
    { burnCollection: BURN_COLLECTION, holderPrice: 0, treasury: TREASURY, umiCore }
  );
  assert.deepStrictEqual(Object.keys(busy.groups[0].guards).sort(), [
    "botTax", "mintLimit", "solPayment", "startDate",
  ]);
  assert.deepStrictEqual(Object.keys(busy.groups[1].guards).sort(), ["assetBurn", "botTax", "startDate"]);
  ok("guard carry-over", "startDate+botTax restated in holder; mintLimit deliberately not");

  // ---- 3. The read-back check -------------------------------------------
  const Some = { __option: "Some", value: {} };
  const correct = {
    guards: { solPayment: { __option: "None" } },
    groups: [
      { label: "public", guards: { solPayment: Some } },
      { label: "holder", guards: { assetBurn: Some } },
    ],
  };
  assert.deepStrictEqual(m.verifyReadBack(plan, correct), []);
  ok("verifyReadBack", "a correct write reports nothing");

  const leaked = JSON.parse(JSON.stringify(correct));
  leaked.guards.solPayment = { __option: "Some", value: {} };
  let problems = m.verifyReadBack(plan, leaked);
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0], /default guard set should be empty/);
  ok("catches a default set that was not emptied", "holders would still be charged");

  problems = m.verifyReadBack(plan, { guards: {}, groups: [correct.groups[0]] });
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0], /expected \[public, holder\]/);
  ok("catches a group that did not land");

  const gated = JSON.parse(JSON.stringify(correct));
  gated.groups[1].guards = { assetGate: Some };
  problems = m.verifyReadBack(plan, gated);
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0], /group "holder".*assetGate.*assetBurn/);
  ok("catches assetGate written where assetBurn was meant", "the unlimited-redemption bug");

  // ---- 4. --verify, the resume path -------------------------------------
  // Added 2026-09-03 after the first real migration: the transaction landed
  // exactly as planned and the read-back 124ms later got a stale account and
  // called it a mismatch, so master.csv was never written. --verify is the
  // way back from that, and it must not simply agree with whatever it finds.
  const migrated = {
    guards: { solPayment: { __option: "None" } },
    groups: [
      { label: "public", guards: { solPayment: { __option: "Some", value: {} }, botTax: { __option: "None" } } },
      {
        label: "holder",
        guards: {
          assetBurn: { __option: "Some", value: { requiredCollection: BURN_COLLECTION } },
          solPayment: { __option: "None" },
        },
      },
    ],
  };
  assert.deepStrictEqual(m.verifyMigrated(migrated, { burnCollection: BURN_COLLECTION, holderPrice: 0 }), []);
  ok("verifyMigrated accepts a correctly migrated guard");

  const wrongCollection = m.verifyMigrated(migrated, {
    burnCollection: "7XJJvj5N4aBMNyX9g5NZqSEzi9vY6vYxWydezMZvC4n9",
    holderPrice: 0,
  });
  assert.strictEqual(wrongCollection.length, 1);
  assert.match(wrongCollection[0], /requiredCollection/);
  ok("catches a holder group burning the wrong collection", "would redeem against the wrong voucher");

  const shouldCharge = m.verifyMigrated(migrated, { burnCollection: BURN_COLLECTION, holderPrice: 0.005 });
  assert.strictEqual(shouldCharge.length, 1);
  assert.match(shouldCharge[0], /no solPayment/);
  ok("catches a paid holder route that does not charge");

  const freePublic = JSON.parse(JSON.stringify(migrated));
  freePublic.groups[0].guards.solPayment = { __option: "None" };
  const pub = m.verifyMigrated(freePublic, { burnCollection: BURN_COLLECTION, holderPrice: 0 });
  assert.strictEqual(pub.length, 1);
  assert.match(pub[0], /public mint is FREE/);
  ok("catches a public group with no payment", "the expensive direction to get wrong");

  const stillGated = JSON.parse(JSON.stringify(migrated));
  stillGated.groups[1].guards = { assetGate: { __option: "Some", value: {} } };
  const gate = m.verifyMigrated(stillGated, { burnCollection: BURN_COLLECTION, holderPrice: 0 });
  assert.ok(gate.some((x) => /no assetBurn/.test(x)));
  ok("catches assetGate in the holder group", "nothing would be consumed");

  // ---- 4b. --set-holder-price -------------------------------------------
  // Repricing edits a guard that already has groups, so it runs with
  // assertMigratable deliberately skipped. Everything protecting a live guard
  // therefore has to live in buildRepricePlan, and these are those guards.
  const priced = m.buildRepricePlan(migrated, { holderPrice: 0.005, treasury: TREASURY, umiCore });
  assert.deepStrictEqual(priced.guards, {});
  assert.deepStrictEqual(Object.keys(priced.groups[1].guards).sort(), ["assetBurn", "solPayment"]);
  assert.strictEqual(
    String(priced.groups[1].guards.assetBurn.requiredCollection),
    BURN_COLLECTION,
    "repricing must not change which collection is burned"
  );
  assert.deepStrictEqual(Object.keys(priced.groups[0].guards), ["solPayment"], "public group untouched");
  ok("buildRepricePlan adds a holder price", "burn collection and public group unchanged");

  const backToFree = m.buildRepricePlan(
    { guards: {}, groups: [priced.groups[0], { label: "holder", guards: {
        assetBurn: { __option: "Some", value: { requiredCollection: BURN_COLLECTION } },
        solPayment: { __option: "Some", value: {} },
      } }] },
    { holderPrice: 0, treasury: TREASURY, umiCore }
  );
  assert.deepStrictEqual(Object.keys(backToFree.groups[1].guards), ["assetBurn"]);
  ok("a price of 0 REMOVES solPayment", "not a zero-lamport guard, which still needs a destination");

  // ---- 5. unwrapGroups --------------------------------------------------
  // The chain returns all 31 guard slots per group, 29 of them None. The
  // first real run printed them raw: two hundred lines of noise around the
  // two values that mattered.
  const flattened = m.unwrapGroups(migrated.groups);
  assert.deepStrictEqual(flattened.map((g) => g.label), ["public", "holder"]);
  assert.deepStrictEqual(Object.keys(flattened[0].guards), ["solPayment"]);
  assert.deepStrictEqual(Object.keys(flattened[1].guards), ["assetBurn"]);
  ok("unwrapGroups collapses 31 slots to the ones that are set");

  console.log("\n  All local assertions held. No on-chain behaviour was tested.\n");
})().catch((err) => {
  console.error("\n  FAILED: " + err.message + "\n");
  process.exit(1);
});
