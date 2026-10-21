#!/usr/bin/env node
/**
 * scripts/close-campaign.selftest.js
 *
 * Exercises close-campaign.js's campaigns.csv rewrite (markClosed) offline.
 * FIXTURE IS PRODUCTION DATA: my-new-collection/backend/campaigns.csv's header
 * and two of its rows, verbatim from git.
 *
 * WHAT IT DOES NOT PROVE: the chain half - that the close transaction deletes
 * both accounts. That was observed once, by hand, closing item 50's campaign
 * (48b1yXFG..., rent returned); this script's own --write has not run yet.
 */
"use strict";

const assert = require("assert");
const path = require("path");
const { parseCsvRecords } = require("./lib/csv");
const { markClosed } = require(path.join(__dirname, "close-campaign.js"));

function ok(label, detail) {
  console.log(`  ok  ${label}${detail ? " — " + detail : ""}`);
}

const FORK =
  "campaignId,title,headline,description,eligibilityText,rewardText,priceText,allocationText,claimText,soldOutText,eligibilityDropItemId,targetDropItemId,price,allocation,campaignCandyMachineAddress,eligibilityCollection,targetCollection,network,treasury,claimLimitId,claimLimit\n" +
  "test-combined-check,Combined Mechanics Check,Holder Reward,Throwaway campaign testing cross-collection and paid claims together,You must hold TEST-001 to claim,Receive 1 TEST-002,0.001 SOL,3 available,Claim,All claimed,TEST-001,TEST-002,0.001,3,HFnMxQj7idRHkt9uPQ6QPQGWnm8821rycT8ovNJEDgNZ,7DayQZfbPCXz5xMpkFG3RsPdsWL4hwWX9ea3EjKj2xVP,4VKpPBoWctoQCECh5QquzaX9WM6vJChEArWCb2kUxJF9,mainnet,7XJJvj5N4aBMNyX9g5NZqSEzi9vY6vYxWydezMZvC4n9,,\n" +
  "test-mech-d-reward,TEST-001 Holder Reward D,Claim Reward D,Holders of TEST-001 can claim TEST-004,Must hold TEST-001,Receive 1 TEST-004,FREE,5 available,Claim,Sold out,TEST-001,TEST-004,0,5,3MrHBsSa3mD6xhuP2rgQy3b7bsbmawch9vNUVDpo6esf,7DayQZfbPCXz5xMpkFG3RsPdsWL4hwWX9ea3EjKj2xVP,DWGTLJUEyGUH33dLut6JLLbPqpHnPm8tLW2ejnj6EEcw,mainnet,,1,1\n";
const SIG = "48b1yXFGDuhA78EYwMTbyxCrYYdrqu284Gxr4g4Qi6msapoZGymggHpCJE2AAt5VSgniqmx8VD4C5j4YNYxJP5BT";

(async () => {
  console.log("\n  close-campaign.js — campaigns.csv rewrite, offline\n");

  const out = markClosed(FORK, "test-mech-d-reward", SIG);
  const before = parseCsvRecords(FORK);
  const after = parseCsvRecords(out);
  assert.deepStrictEqual(after.header, [...before.header, "campaignStatus", "closedSignature"]);
  ok("the two columns are appended, the 21 existing ones unchanged and in order");

  const d = after.records.find((r) => r.campaignId === "test-mech-d-reward");
  assert.strictEqual(d.campaignStatus, "closed");
  assert.strictEqual(d.closedSignature, SIG);
  assert.strictEqual(d.campaignCandyMachineAddress, "3MrHBsSa3mD6xhuP2rgQy3b7bsbmawch9vNUVDpo6esf");
  ok("the closed row is marked, and keeps its address as history");

  const c = after.records.find((r) => r.campaignId === "test-combined-check");
  for (const k of before.header) assert.strictEqual(c[k], before.records[0][k], k);
  assert.strictEqual(c.campaignStatus, "");
  for (const k of before.header) assert.strictEqual(d[k], before.records[1][k], k);
  ok("every other value of every row is unchanged", "including the untouched row");

  const again = markClosed(out, "test-combined-check", "sig2");
  assert.deepStrictEqual(parseCsvRecords(again).header, after.header);
  ok("existing columns are not duplicated on a second close");

  assert.throws(() => markClosed(FORK, "no-such-campaign", SIG), /expected one row/);
  const dup = FORK + FORK.split("\n")[2] + "\n";
  assert.throws(() => markClosed(dup, "test-mech-d-reward", SIG), /found 2/);
  ok("an unknown or duplicated campaignId is refused, not guessed");

  console.log("\n  All local assertions held. No transaction was sent.\n");
})().catch((err) => {
  console.error("\n  FAILED: " + err.message + "\n");
  process.exit(1);
});
