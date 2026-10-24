#!/usr/bin/env node
/**
 * scripts/run-selftests.js
 *
 * Runs every *.selftest.js in backend/scripts/ and scripts/, and fails if any
 * does. Offline: every selftest here is.
 *
 * WHY: on 2026-10-21 a change was committed and pushed with
 * placeholder.selftest.js failing, because the selftests were run one by one
 * and that one was skipped. A suite you have to remember to run in full is not
 * a suite. Run this before every commit that touches a script.
 *
 *   node scripts/run-selftests.js
 *
 * Exit codes: 0 = all passed; 1 = at least one failed (each is named).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DIRS = ["backend/scripts", "scripts"];

function main() {
  const tests = DIRS.flatMap((d) =>
    fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith(".selftest.js")).map((f) => path.join(d, f)));
  const failed = [];
  for (const t of tests) {
    const r = spawnSync(process.execPath, [path.join(ROOT, t)], { cwd: path.dirname(path.join(ROOT, t)), encoding: "utf8" });
    const checks = (r.stdout.match(/^ {2}ok {2}/gm) || []).length;
    console.log(`  ${r.status === 0 ? "ok  " : "FAIL"}  ${t.padEnd(52)} ${checks} check(s)`);
    if (r.status !== 0) failed.push({ t, why: ((r.stderr || "").match(/FAILED: (.*)/) || [])[1] || `exit ${r.status}` });
  }
  if (failed.length) {
    console.log(`\n✗ ${failed.length} of ${tests.length} selftest(s) failed:\n` + failed.map((f) => `  ${f.t}: ${f.why}`).join("\n") + "\n");
    process.exit(1);
  }
  console.log(`\n✓ all ${tests.length} selftests passed.\n`);
}

if (require.main === module) {
  main();
}
