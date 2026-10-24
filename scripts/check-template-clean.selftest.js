#!/usr/bin/env node
/**
 * scripts/check-template-clean.selftest.js
 *
 * Exercises check-template-clean.js's judgement offline, in both modes.
 * FIXTURE IS PRODUCTION DATA: the template's actual state on 2026-10-22 -
 * its git status, which state files and generated dirs existed, and its real
 * config.json and deployment.json values (including the _why fixture note).
 */
"use strict";

const assert = require("assert");
const path = require("path");
const { findState } = require(path.join(__dirname, "check-template-clean.js"));

function ok(label, detail) {
  console.log(`  ok  ${label}${detail ? " — " + detail : ""}`);
}

const WHY = "Deliberate fixture for prompt A1 (docs/generation-prompts.md: A1's deployment.json step ...). See open-items item 61.";
// TEMPLATE-OPEN-EDITION as found on 2026-10-22.
const TEMPLATE = {
  porcelain: ['?? "Claude outputs/"'],
  exists: { "backend/.env.admin": true, "backend/.env": true, "frontend/.env": true, "backend/deploy-state.json": true, "backend/registry.json": true, "backend/logs": true, ".netlify": true },
  dirs: { "backend/images": 0 },
  config: { collectionSlug: "your-collection-slug", network: "devnet", treasury: "YOUR_TREASURY_ADDRESS" },
  deployment: { _why: WHY, assetAddress: "GSy11Cj6N8TtA5EeWYs7pUtAx3weXtxdBH6GLQJCyrK6", treasury: "7XJJvj5N4aBMNyX9g5NZqSEzi9vY6vYxWydezMZvC4n9", rpc: "https://rpc-proxy.smallen1967.workers.dev", createdAt: "2026-06-26T20:52:48.712Z" },
  masterRows: [{ dropItemId: "SAMPLE-001", collectionAddress: "", candyMachineAddress: "", candyGuardAddress: "", holderRequiredCollection: "", holderPrice: "", itemImage: "", uri: "" }],
  campaignRows: [],
};
// A correct copy after Stage 1: Remove-Item run, deployment.json edited.
const GOOD_COPY = {
  ...TEMPLATE,
  porcelain: [" M deployment.json"],
  exists: Object.fromEntries(Object.keys(TEMPLATE.exists).map((k) => [k, false])),
  dirs: {},
  deployment: { rpc: TEMPLATE.deployment.rpc, treasury: "NewOwnersOwnTreasury1111111111111111111111" },
};
const whats = (r) => r.findings.map((f) => f.what);

(async () => {
  console.log("\n  check-template-clean.js — offline, both modes\n");

  const inv = findState(TEMPLATE, "inventory");
  assert.deepStrictEqual(whats(inv), [
    'git status: ?? "Claude outputs/"', "backend/images/ (0 entries)",
    "backend/.env.admin", "backend/.env", "frontend/.env", "backend/deploy-state.json", "backend/registry.json", "backend/logs", ".netlify",
  ]);
  assert.deepStrictEqual(inv.expected.map((e) => e.what), ["deployment.json assetAddress", "deployment.json treasury", "deployment.json createdAt"]);
  ok("inventory of the template: 9 findings, the 3 A1 fields expected not found", "porcelain catches Claude outputs/; the sweep the empty images/");

  const noWhy = findState({ ...TEMPLATE, deployment: { ...TEMPLATE.deployment, _why: undefined } }, "inventory");
  assert.ok(["deployment.json assetAddress", "deployment.json treasury", "deployment.json createdAt"].every((w) => whats(noWhy).includes(w)));
  ok("without the _why note, the same three fields are drift", "the note is what makes them deliberate");

  assert.deepStrictEqual(findState(GOOD_COPY, "verify"), { findings: [], expected: [] });
  ok("verify on a correct copy exits clean", "Stage 1's own edit to deployment.json is allowed");

  const skipped = whats(findState({ ...TEMPLATE, porcelain: [] }, "verify"));
  for (const w of ["backend/.env.admin", "backend/deploy-state.json", "deployment.json assetAddress", "deployment.json treasury", "deployment.json createdAt", "deployment.json _why"]) {
    assert.ok(skipped.includes(w), w);
  }
  ok("verify catches a skipped Remove-Item and an unedited deployment.json", "the key, the deploy state, every stale field and the _why");

  const halfway = whats(findState({ ...GOOD_COPY, porcelain: [" M deployment.json", '?? "Claude outputs/"', "?? notes.md"], dirs: { "backend/metadata": 0 } }, "verify"));
  assert.deepStrictEqual(halfway, ['git status: ?? "Claude outputs/"', "git status: ?? notes.md", "backend/metadata/ (0 entries)"]);
  ok("verify catches the eleventh thing", "untracked files no list names, and an empty generated dir");

  const filled = whats(findState({ ...GOOD_COPY, masterRows: [{ ...TEMPLATE.masterRows[0], candyMachineAddress: "BLGGzRUgu5KQKJCkTM7CevhJibvpf9geCmDrxerusp7P" }] }, "verify"));
  assert.deepStrictEqual(filled, ["master.csv SAMPLE-001 candyMachineAddress"]);
  ok("a filled address column in a copied CSV is caught", "the fork's real TEST-004 machine");

  // Preconditions: when the folder cannot be judged at all (exit 2).
  const { cannotJudge } = require(path.join(__dirname, "check-template-clean.js"));
  assert.ok(/not a git checkout/.test(cannotJudge({ status: false, head: false })));
  assert.ok(/fresh git init with no commits - commit first/.test(cannotJudge({ status: true, head: false })));
  assert.strictEqual(cannotJudge({ status: true, head: true }), null);
  ok("an unborn HEAD is 'commit first', not hundreds of findings", "Stage 1's without-.git route, right after git init");

  // A file the guard cannot parse is a finding - the deployment.json of 2026-10-22.
  const broken = findState({ ...GOOD_COPY, deployment: null, parseErrors: { "deployment.json": "Expected ',' or '}' after property value in JSON at position 110" } }, "verify");
  assert.deepStrictEqual(whats(broken), ["deployment.json"]);
  assert.ok(/not valid JSON: Expected ','/.test(broken.findings[0].why));
  const badConfig = whats(findState({ ...GOOD_COPY, config: null, parseErrors: { "backend/config.json": "Unexpected token" } }, "verify"));
  assert.deepStrictEqual(badConfig, ["backend/config.json"]);
  ok("an unparseable deployment.json or config.json is reported, not a crash", "and not also as three placeholder findings");

  console.log("\n  All local assertions held. Nothing was read from disk.\n");
})().catch((err) => {
  console.error("\n  FAILED: " + err.message + "\n");
  process.exit(1);
});
