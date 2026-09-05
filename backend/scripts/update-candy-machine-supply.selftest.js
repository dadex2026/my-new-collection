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
 *   - it matches by COLLECTION as well as by drop id. assetGate is written
 *     against the eligibility drop's collection, so with OE-001 and OE-002
 *     sharing a slug, raising OE-002 widens a campaign that names only OE-001.
 *     Matching on drop id alone missed that, which is the defect this file was
 *     extended to hold shut on the day it was introduced.
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

// Each drop in its own collection. This is the world the first block assumes,
// and keeping it separate from the shared-slug fixture below is what lets both
// be asserted without either quietly relaxing the other.
const MASTER_SOLO = [
  { dropItemId: "OE-001", collectionSlug: "a", collectionAddress: "COLL_A" },
  { dropItemId: "OE-002", collectionSlug: "b", collectionAddress: "COLL_B" },
  { dropItemId: "OE-003", collectionSlug: "c", collectionAddress: "COLL_C" },
];

const CAMPAIGNS = [
  { campaignId: "live-mainnet",    eligibilityDropItemId: "OE-001", allocation: "250", network: "mainnet", campaignCandyMachineAddress: "CM_live" },
  { campaignId: "planned-mainnet", eligibilityDropItemId: "OE-001", allocation: "100", network: "mainnet", campaignCandyMachineAddress: "" },
  { campaignId: "live-devnet",     eligibilityDropItemId: "OE-001", allocation: "50",  network: "devnet",  campaignCandyMachineAddress: "CM_dev" },
  { campaignId: "live-no-network", eligibilityDropItemId: "OE-002", allocation: "10",  network: "",        campaignCandyMachineAddress: "CM_blank" },
  { campaignId: "other-drop",      eligibilityDropItemId: "OE-003", allocation: "10",  network: "mainnet", campaignCandyMachineAddress: "CM_other" },
];

// ---- 1. gatingCampaignsFrom -------------------------------------------
{
  const g = m.gatingCampaignsFrom(CAMPAIGNS, MASTER_SOLO, "OE-001", "mainnet");
  assert.deepStrictEqual(g.deployed.map((c) => c.campaignId), ["live-mainnet"]);
  assert.deepStrictEqual(g.undeployed.map((c) => c.campaignId), ["planned-mainnet"]);
  ok("splits deployed from planned, and drops the devnet row", "mainnet sees live-mainnet + planned-mainnet");

  const blank = m.gatingCampaignsFrom(CAMPAIGNS, MASTER_SOLO, "OE-002", "mainnet");
  assert.deepStrictEqual(blank.deployed.map((c) => c.campaignId), ["live-no-network"]);
  ok("a blank network column counts as a match", "not knowing the chain is not a reason to wave it through");

  assert.deepStrictEqual(m.gatingCampaignsFrom(CAMPAIGNS, MASTER_SOLO, "OE-999", "mainnet").deployed, []);
  assert.deepStrictEqual(m.gatingCampaignsFrom(CAMPAIGNS, MASTER_SOLO, null, "mainnet").deployed, []);
  ok("an ungated drop, and a null drop id, gate nothing");
}

// ---- 2. widenRefusal ---------------------------------------------------
{
  const gated = m.gatingCampaignsFrom(CAMPAIGNS, MASTER_SOLO, "OE-001", "mainnet");
  const free = m.gatingCampaignsFrom(CAMPAIGNS, MASTER_SOLO, "OE-999", "mainnet");
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

// ---- 2b. The shared-slug case: collection, not drop id ----------------
// The defect this fixes. OE-001, OE-002 and OE-003 share one collectionSlug and
// therefore one collectionAddress. A campaign gating on OE-001 is really gating
// on that collection, so raising ANY of the three widens it. KEY-001 sits in its
// own collection and must stay unaffected - that is the three-collection shape,
// and if this assertion ever flips, the guard has started refusing raises it has
// no business refusing.
{
  const MASTER_SHARED = [
    { dropItemId: "OE-001", collectionSlug: "founders", collectionAddress: "COLL_F" },
    { dropItemId: "OE-002", collectionSlug: "founders", collectionAddress: "COLL_F" },
    { dropItemId: "OE-003", collectionSlug: "founders", collectionAddress: "COLL_F" },
    { dropItemId: "KEY-001", collectionSlug: "founders-key", collectionAddress: "COLL_K" },
  ];
  const shared = [
    { campaignId: "voucher-claim", eligibilityDropItemId: "OE-001", allocation: "250",
      network: "mainnet", campaignCandyMachineAddress: "CM_live", eligibilityCollection: "COLL_F" },
  ];
  const raise = (drop) => {
    const g = m.gatingCampaignsFrom(shared, MASTER_SHARED, drop, "mainnet");
    return { g, refusal: m.widenRefusal({ dropItemId: drop, current: 750, itemsAvailable: 1000, gating: g, acceptsWidening: false }) };
  };

  const named = raise("OE-001");
  assert.ok(named.refusal);
  assert.strictEqual(named.g.deployed[0]._matchedVia, "drop");
  ok("refuses the drop the campaign names", "matched via drop id");

  for (const sibling of ["OE-002", "OE-003"]) {
    const r = raise(sibling);
    assert.ok(r.refusal, `${sibling} shares OE-001's collection and must be refused`);
    assert.strictEqual(r.g.deployed[0]._matchedVia, "collection");
    assert.match(r.refusal.message, /assetGate is written against the eligibility drop's COLLECTION/);
    assert.match(r.refusal.message, /gates on OE-001, which shares this drop's collection/);
  }
  ok("refuses a SIBLING sharing the collection", "OE-002 and OE-003, which the campaign never names");

  assert.strictEqual(raise("KEY-001").refusal, null);
  ok("allows a drop in a different collection", "the three-collection shape stays a clean raise");

  // eligibilityCollection is written back at deploy time, but a campaign row
  // that predates the column must still resolve - via the drop it names.
  const noColumn = [{ ...shared[0], eligibilityCollection: "" }];
  const viaMaster = m.gatingCampaignsFrom(noColumn, MASTER_SHARED, "OE-002", "mainnet");
  assert.strictEqual(viaMaster.deployed.length, 1);
  ok("resolves the collection from master.csv when the column is blank", "older rows are not exempt");

  // With no master.csv to consult, the drop-id match is all that is left. It is
  // kept rather than replaced precisely so this degrades to the old behaviour
  // instead of to silence.
  // Two unknowns are not a match. A drop absent from master.csv has no
  // collection, and a campaign naming an absent drop has no collection either -
  // and "" === "" is true. Without the truthiness guards this refuses every
  // raise on an unrecognised drop, citing campaigns that have nothing to do
  // with it. Found by mutating the guards away and watching the suite still
  // pass, which is the only reason this assertion exists.
  const ghosts = [{ campaignId: "ghost", eligibilityDropItemId: "GHOST-999", allocation: "10",
    network: "mainnet", campaignCandyMachineAddress: "CM_ghost", eligibilityCollection: "" }];
  const bothUnknown = m.gatingCampaignsFrom(ghosts, MASTER_SHARED, "NOT-IN-MASTER", "mainnet");
  assert.strictEqual(bothUnknown.deployed.length, 0);
  ok("an unresolvable drop does not match an unresolvable campaign", "empty === empty is not a collection match");

  const noMaster = m.gatingCampaignsFrom(shared, [], "OE-001", "mainnet");
  assert.strictEqual(noMaster.deployed.length, 1);
  assert.strictEqual(m.gatingCampaignsFrom(shared, [], "OE-002", "mainnet").deployed.length, 0);
  ok("falls back to the drop-id match with no master rows", "degrades to the old behaviour, not to nothing");
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
