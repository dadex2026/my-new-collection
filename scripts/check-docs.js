#!/usr/bin/env node
/**
 * scripts/check-docs.js
 *
 * Fails when the documentation asserts something the code contradicts.
 *
 * WHY THIS EXISTS
 *   Between 2026-08-11 and 2026-08-28 the same class of defect was found four
 *   separate times, always by someone happening to read a script and notice a
 *   doc disagreed:
 *
 *     - "preflight runs ten checks"            it ran sixteen
 *     - "VITE_REGISTRY_URL has no fallback"    it has one, to a path that 404s
 *     - "an Environment failure is never a     deployer_not_treasury was in the
 *        warning"                              downgrade set
 *     - "collectionName is written on chain    deployCoreAsset.ts is invoked by
 *        by deployCoreAsset.ts"                nothing; the name comes from master.csv
 *
 *   Each was fixed in one file while copies survived elsewhere — the ten-checks
 *   claim outlived its own "corrected" note in open-items.md by weeks. Sampling
 *   finds one instance per pass, forever. This script is the enumeration.
 *
 * WHAT IT IS NOT
 *   Not a spell-checker and not a style guide. Every rule below is a statement
 *   about the code that was true when someone wrote it and is false now, or
 *   would become false under a plausible edit. If a rule cannot name the file
 *   and behaviour that contradicts it, it does not belong here.
 *
 * ADDING A RULE
 *   Add one whenever you correct a factual claim in a doc. The cost is two
 *   lines; the alternative is the same correction being rediscovered.
 *
 * Exit codes:
 *   0 = no banned claim found
 *   1 = at least one doc asserts something the code contradicts
 *   2 = could not run (no docs directory, unreadable files)
 *
 * Usage:
 *   node scripts/check-docs.js
 *   node scripts/check-docs.js --list      # print the rules, check nothing
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SEARCH_DIRS = ["docs", "backend/standings"];
const EXTENSIONS = new Set([".md"]);

// Worked runs are historical records — a run reports what it saw on the day,
// and a fixture is judged against the code of its own commit. Rewriting one to
// match today's code destroys the thing that makes it a fixture. So they are
// reported as ADVISORY and do not fail the run.
//
// This is the concession that keeps the tool usable. A guard that screams about
// files nobody intends to change is a guard people learn to ignore, and then it
// stops catching the things that do matter.
const ADVISORY_ONLY = [/^docs\/runs\//];

// Each rule: a pattern that must not appear, why it is wrong, and where the
// truth lives. `unless` exempts lines that are explicitly correcting the claim,
// so a doc may quote a falsehood in order to retract it.
const RULES = [
  {
    id: "preflight-check-count",
    pattern: /\b(ten|10)\s+checks\b/i,
    why: "preflight.js runs 21 checks in six groups, not ten.",
    truth: "backend/scripts/preflight.js — count the results.push({ name: ... }) calls",
  },
  {
    id: "registry-url-no-fallback",
    pattern: /VITE_REGISTRY_URL[^.\n]{0,80}\bno fallback\b/i,
    why: "It has a fallback: config.ts reads VITE_REGISTRY_URL || \"/registry/registry.json\". The fallback points at a path the generator never writes, so it 404s.",
    truth: "frontend/src/config.ts",
  },
  {
    id: "undefined-symptom",
    pattern: /literally named `?\/undefined/i,
    why: "A missing VITE_REGISTRY_URL 404s on /registry/registry.json. Nothing requests a literal /undefined.",
    truth: "frontend/src/config.ts",
  },
  {
    id: "environment-never-warning",
    pattern: /Environment failure is never a warning/i,
    why: "This was false while deployer_not_treasury sat in CONTENT_CHECK_NAMES. It is true again as of 2026-08-28 — but only because that entry was removed, so the claim must be re-verified, not inherited.",
    truth: "backend/scripts/preflight.js — CONTENT_CHECK_NAMES",
  },
  {
    id: "corecollection-name-source",
    pattern: /collectionName[^.\n]{0,60}(written on.?chain|on.?chain name)[^.\n]{0,60}deployCoreAsset/i,
    why: "deployCoreAsset.ts is invoked by nothing. The on-chain name is master.csv's collectionName, first matching row.",
    truth: "backend/scripts/deploy-collection.js — name: firstRow.collectionName || collectionSlug",
  },
  {
    id: "template-name-fallback",
    pattern: /falls back to `?templateName`?[^.\n]{0,80}(mint|on.?chain|permanent)/i,
    why: "That fallback is in deployCoreAsset.ts, which nothing runs. deploy-collection.js falls back to collectionSlug.",
    truth: "backend/scripts/deploy-collection.js",
  },
  {
    id: "allow-warnings-count",
    pattern: /--allow-warnings[^.\n]{0,60}\bsix\b[^.\n]{0,30}checks/i,
    why: "CONTENT_CHECK_NAMES holds seven entries as of 2026-08-28, and deployer_not_treasury is deliberately not one of them.",
    truth: "backend/scripts/preflight.js — CONTENT_CHECK_NAMES",
  },
];

// A line is exempt if it is visibly retracting the claim rather than making it.
const RETRACTION = /\b(wrong|false|untrue|incorrect|corrected|correction|stale|outdated|until 20\d\d|earlier (version|revision|draft|doc)|no longer|used to (say|read)|previously (said|read)|do not (say|write)|must not appear|said|claimed)\b/i;

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(path.extname(e.name))) out.push(full);
  }
  return out;
}

function main() {
  if (process.argv.includes("--list")) {
    for (const r of RULES) {
      process.stdout.write(`${r.id}\n  ${r.why}\n  truth: ${r.truth}\n\n`);
    }
    process.exit(0);
  }

  const files = [];
  for (const d of SEARCH_DIRS) walk(path.join(ROOT, d), files);

  if (files.length === 0) {
    process.stderr.write(
      "\n✗ check-docs: found no markdown to check. Nothing was compared — this is not a pass.\n\n"
    );
    process.exit(2);
  }

  const hits = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const advisory = ADVISORY_ONLY.some((re) => re.test(rel));
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (RETRACTION.test(line)) return;
      for (const rule of RULES) {
        if (rule.pattern.test(line)) {
          hits.push({ rel, line: i + 1, text: line.trim(), rule, advisory });
        }
      }
    });
  }

  const blocking = hits.filter((h) => !h.advisory);
  const advisories = hits.filter((h) => h.advisory);

  const report = (h, out) => {
    out(`${h.rel}:${h.line}  [${h.rule.id}]\n`);
    out(`  says:  ${h.text.slice(0, 150)}\n`);
    out(`  but:   ${h.rule.why}\n`);
    out(`  check: ${h.rule.truth}\n\n`);
  };

  if (advisories.length > 0) {
    const o = (t) => process.stdout.write(t);
    o(`\n— advisory: ${advisories.length} in worked runs (historical records, not failing) —\n\n`);
    advisories.forEach((h) => report(h, o));
  }

  if (blocking.length === 0) {
    process.stdout.write(
      `✓ check-docs: ${files.length} file(s), ${RULES.length} rule(s), no contradicted claims.\n\n`
    );
    process.exit(0);
  }

  const e = (t) => process.stderr.write(t);
  e(`\n✗ check-docs: ${blocking.length} claim(s) the code contradicts.\n\n`);
  blocking.forEach((h) => report(h, e));
  e(
    "If the code changed and the doc is now right, update the rule in scripts/check-docs.js.\n" +
      "If the doc is wrong, fix the doc — and check whether the same claim survives elsewhere.\n\n"
  );
  process.exit(1);
}

main();
