#!/usr/bin/env node
/**
 * scripts/entrypoint-guard.selftest.js
 *
 * Fails if any script in backend/scripts would run itself when required.
 *
 *   node scripts/entrypoint-guard.selftest.js
 *
 * WHY
 *   On 2026-10-21 a check that only meant to load nine scripts ran their main()
 *   instead, because most had no `require.main === module` guard. It misfired
 *   harmlessly only because that machine had no deploy key and a placeholder
 *   config - generate-registry.js still rewrote two files. On a machine with
 *   the real key loaded, the same accident runs a deploy. Every script is now
 *   guarded; this keeps it that way.
 *
 * STATIC, DELIBERATELY
 *   It reads the source and never require()s a script. A behavioural check
 *   would, on any script missing the guard, execute exactly the main() it is
 *   trying to prevent - on whatever machine runs the test.
 *
 * WHAT IT CHECKS, for every .js here except *.selftest.js (which are entry
 * points by nature) and lib/ (which has no main):
 *   - the file contains `if (require.main === module)`
 *   - no column-0 line calls an entry point outside it: `main(`, `main().catch`,
 *     `try {` (the try-main-catch shape), or an immediately-invoked async block
 *
 * WHAT IT DOES NOT CHECK
 *   That the guarded block calls the right function, or that nothing else at
 *   top level has side effects (requiring dotenv still loads .env files).
 *
 * Exit codes:
 *   0 = every script is guarded
 *   1 = at least one is not
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

function ok(label, detail) {
  console.log(`  ok  ${label}${detail ? " — " + detail : ""}`);
}

const UNGUARDED_CALL = /^(main\s*\(|try\s*\{\s*$|\(async\s*\(|void\s+main\s*\()/;

function problems(source) {
  const found = [];
  if (!source.includes("if (require.main === module)")) found.push("no `if (require.main === module)` guard");
  source.replace(/\r/g, "").split("\n").forEach((line, i) => {
    if (UNGUARDED_CALL.test(line)) found.push(`line ${i + 1} calls an entry point at top level: ${line.trim().slice(0, 50)}`);
  });
  return found;
}

(async () => {
  console.log("\n  entry-point guards — static, nothing is required\n");

  // The detector itself, on known shapes, before trusting it on the tree.
  assert.deepStrictEqual(problems('async function main() {}\nif (require.main === module) {\n  main();\n}\n'), []);
  assert.strictEqual(problems("async function main() {}\nmain().catch(() => {});\n").length, 2);
  assert.strictEqual(problems("function main() {}\ntry {\n  main();\n} catch (e) {}\n").length, 2);
  assert.strictEqual(problems("(async () => {\n})();\n").length, 2);
  assert.strictEqual(problems("// main() is called below\nif (require.main === module) {\n  main();\n}\n").length, 0);
  ok("the detector flags each unguarded shape and passes a guarded one", "main(), main().catch, try-main-catch, async IIFE");

  const dir = __dirname;
  const scripts = fs.readdirSync(dir).filter((f) => f.endsWith(".js") && !f.endsWith(".selftest.js"));
  assert.ok(scripts.length >= 25, `expected the pipeline's scripts, found ${scripts.length}`);
  const bad = {};
  for (const f of scripts) {
    const p = problems(fs.readFileSync(path.join(dir, f), "latin1"));
    if (p.length) bad[f] = p;
  }
  assert.deepStrictEqual(bad, {}, "unguarded scripts:\n" + JSON.stringify(bad, null, 2));
  ok("every script runs only when executed, never when required", `${scripts.length} scripts`);

  console.log("\n  All assertions held. No script was required or run.\n");
})().catch((err) => {
  console.error("\n  FAILED: " + err.message + "\n");
  process.exit(1);
});
