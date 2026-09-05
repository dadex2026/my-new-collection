#!/usr/bin/env node
/**
 * scripts/update-candy-machine-supply.selftest.js
 *
 * Exercises the pure logic of update-candy-machine-supply.js with no network,
 * no RPC and no deploy key. Run it before and after touching that script.
 *
 *   node scripts/update-candy-machine-supply.selftest.js
 *
 * WHAT IT PROVES
 *   - gatingCampaignsFrom finds the campaigns whose eligibility is this drop,
 *     separates deployed from not-yet-deployed, filters by network, and treats
 *     a blank network column as a match rather than as an exemption.
 *   - widenRefusal refuses a RAISE on a drop a live campaign gates on, and
 *     allows: a cut, a raise nothing gates on, a raise gated only by campaigns
 *     that were never deployed, and a raise with --yes-widens-eligibility.
 *   - findDropIdByCandyMachine resolves a drop from its machine address, so
 *     --candy-machine cannot be used to slip past the eligibility check, and
 *     refuses to guess when the address is ambiguous or unknown.
 *
 * WHAT IT DOES NOT PROVE — and this is the important half
 *   Nothing about the chain. Whether updateCandyMachine accepts an increase,
 *   what it costs, whether the read-back polls long enough, and whether a
 *   raised cap really produces claimable eligibility are all questions no local
 *   test can answer. The first is answered by mainnet 2026-09-05, signature
 *   4Urxi4eB; the rest by watching a campaign run.
 *
 *   It also proves nothing about whether refusing is the RIGHT policy. It only
 *   proves the refusal fires where it was aimed.
 *
 * Exit codes:
 *   0 = every assertion held
 *   1 = an assertion failed
 */
"use strict";

const assert = require("assert");
const path = require("path");
const m = require(path.join(__dirname, "update-candy-machine-supply.js"));

function ok(label, detail) {
  console.log(`  ok  ${label}${detail ? " — " + detail : ""}`);
}

const CAMPAIGNS = [
  { campaignId: "live-mainnet",    eligibilityDropItemId: "OE-001", allocation: "250", network: "mainnet", campaignCandyMachineAddress: "CM_live" },
  { campaignId: "planned-mainnet", eligibilityDropItemId: "OE-001", allocation: "100", network: "mainnet", campaignCandyMachineAddress: "" },
  { campaignId: "live-devnet",     eligibilityDropItemId: "OE-001", allocation: "50",  network: "devnet",  campaignCandyMachineAddress: "CM_dev" },
  { campaignId: "live-no-network", eligibilityDropItemId: "OE-002", allocation: "10",  network: "",        campaignCandyMachineAddress: "CM_blank" },
  { campaignId: "other-drop",      eligibilityDropItemId: "OE-003", allocation: "10",  network: "mainnet", campaignCandyMachineAddress: "CM_other" },
];

// ---- 1. gatingCampaignsFrom -------------------------------------------
{
  const g = m.gatingCampaignsFrom(CAMPAIGNS, "OE-001", "mainnet");
  assert.deepStrictEqual(g.deployed.map((c) => c.campaignId), ["live-mainnet"]);
  assert.deepStrictEqual(g.undeployed.map((c) => c.campaignId), ["planned-mainnet"]);
  ok("splits deployed from planned, and drops the devnet row", "mainnet sees live-mainnet + planned-mainnet");

  const blank = m.gatingCampaignsFrom(CAMPAIGNS, "OE-002", "mainnet");
  assert.deepStrictEqual(blank.deployed.map((c) => c.campaignId), ["live-no-network"]);
  ok("a blank network column counts as a match", "not knowing the chain is not a reason to wave it through");

  assert.deepStrictEqual(m.gatingCampaignsFrom(CAMPAIGNS, "OE-999", "mainnet").deployed, []);
  assert.deepStrictEqual(m.gatingCampaignsFrom(CAMPAIGNS, null, "mainnet").deployed, []);
  ok("an ungated drop, and a null drop id, gate nothing");
}

// ---- 2. widenRefusal ---------------------------------------------------
{
  const gated = m.gatingCampaignsFrom(CAMPAIGNS, "OE-001", "mainnet");
  const free = m.gatingCampaignsFrom(CAMPAIGNS, "OE-999", "mainnet");
  const plannedOnly = { deployed: [], undeployed: gated.undeployed };
  const base = { dropItemId: "OE-001", current: 500, itemsAvailable: 800, gating: gated, acceptsWidening: false };

  const r = m.widenRefusal(base);
  assert.ok(r, "a raise on a live-gated drop must be refused");
  assert.strictEqual(r.code, "widens_campaign_eligibility");
  assert.match(r.message, /live-mainnet \(allocation 250\)/);
  assert.match(r.message, /adds 300 potential claims/);
  ok("refuses a raise on a live-gated drop", "names the campaign, its allocation, and the 300 claims added");

  assert.strictEqual(m.widenRefusal({ ...base, itemsAvailable: 300 }), null);
  ok("allows a CUT", "narrowing eligibility is never the farming direction");

  assert.strictEqual(m.widenRefusal({ ...base, itemsAvailable: 500 }), null);
  ok("allows a no-op", "equal is not a raise");

  assert.strictEqual(m.widenRefusal({ ...base, gating: free }), null);
  ok("allows a raise nothing gates on", "the common case stays one command");

  assert.strictEqual(m.widenRefusal({ ...base, gating: plannedOnly }), null);
  ok("allows a raise gated only by an UNDEPLOYED campaign", "preflight still refuses it at deploy time");

  assert.strictEqual(m.widenRefusal({ ...base, acceptsWidening: true }), null);
  ok("--yes-widens-eligibility is the way through", "a decision recorded, not a check removed");
}

// ---- 3. findDropIdByCandyMachine --------------------------------------
// The check keys on the machine being changed, not on how it was named, so
// --candy-machine <addr> resolves to the same drop --drop <id> would.
{
  const fs = require("fs");
  const os = require("os");
  const csv = [
    "collectionSlug,dropItemId,candyMachineAddress",
    "founders,OE-001,CM_aaa",
    "founders,OE-002,CM_bbb",
    "founders,DUP-A,CM_dup",
    "founders,DUP-B,CM_dup",
  ].join("\n") + "\n";

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "supply-selftest-"));
  const backend = path.join(dir, "backend");
  fs.mkdirSync(path.join(backend, "scripts", "lib"), { recursive: true });
  fs.writeFileSync(path.join(backend, "master.csv"), csv, "utf8");
  for (const f of ["update-candy-machine-supply.js"]) {
    fs.copyFileSync(path.join(__dirname, f), path.join(backend, "scripts", f));
  }
  fs.copyFileSync(path.join(__dirname, "lib", "csv.js"), path.join(backend, "scripts", "lib", "csv.js"));
  fs.symlinkSync(path.join(__dirname, "..", "node_modules"), path.join(backend, "node_modules"), "junction");

  const isolated = require(path.join(backend, "scripts", "update-candy-machine-supply.js"));
  assert.strictEqual(isolated.findDropIdByCandyMachine("CM_aaa"), "OE-001");
  ok("resolves a drop from its candy machine address", "--candy-machine cannot slip past the check");
  assert.strictEqual(isolated.findDropIdByCandyMachine("CM_dup"), null);
  ok("refuses to guess when two rows share an address");
  assert.strictEqual(isolated.findDropIdByCandyMachine("CM_nope"), null);
  ok("returns null for an address no row claims", "the one remaining gap, and it is reported");

  fs.rmSync(dir, { recursive: true, force: true });
}

console.log("\n  All local assertions held. No on-chain behaviour was tested.\n");
