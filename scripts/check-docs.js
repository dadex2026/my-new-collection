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
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
// Source is searched alongside docs as of 2026-09-03. Restricting this to
// `docs/` was itself the hole: four false capability claims found on
// 2026-09-02 lived in code comments, where no rule could see them
// (open-items 30). Two more were sitting in frontend/src/mint.ts on the
// day this widened - one asserting generate-registry.js emits holder
// fields it has never emitted, one asserting get-holders.js is 0 bytes
// after it had been written. A comment is a claim about the code with
// exactly the same shelf life as a sentence in a document.
const SEARCH_DIRS = ["docs", "backend/standings", "backend/scripts", "frontend/src", "scripts"];
const EXTENSIONS = new Set([".md", ".js", ".ts"]);

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
// truth lives. A line within two of a RETRACTION word (below) is exempt, so a
// doc may quote a falsehood in order to retract it - unless the rule is
// `strict`, for a claim that was itself written as a correction.
const RULES = [
  {
    id: "preflight-check-count",
    // Widened 2026-09-03 from /(ten|10) checks/. The guide's own appendix was
    // titled "The sixteen preflight checks" while its first line said
    // twenty-one, and this rule watched only for "ten" — so the stale count
    // sat in a heading through every run of the guard that was supposed to
    // catch stale counts. Match every wrong number, not the last one seen.
    // Widened again 2026-09-05 for campaign_eligibility_capped (22 -> 23), and
    // extended UPWARD past the new truth as well as below it. The previous
    // revision stopped at twenty-one, one short of the number it was written
    // to protect, so the next increment had nowhere to land. A count drifts in
    // both directions; the wrong numbers above the right one are wrong too.
    pattern: /\b(ten|10|eleven|11|twelve|12|sixteen|16|seventeen|17|eighteen|18|nineteen|19|twenty|20|twenty-one|21|twenty-two|22|twenty-three|23|twenty-five|25|twenty-six|26|twenty-seven|27)\s+checks\b/i,
    why: "preflight.js registers 24 checks in six groups. A clean run prints 21 of them, or 19 without campaigns.csv, where both campaign checks never run - three others are recorded only on failure.",
    truth: "backend/scripts/preflight.js — count the results.push({ name: ... }) calls",
  },
  {
    id: "registry-url-fallback",
    // Replaced 2026-10-21 (open-items 49). Its predecessor, registry-url-no-
    // fallback, banned the TRUE claim: it took its truth from config.ts:8,
    // whose registryUrl was read only by registry/loader.ts, which nothing
    // imported (both deleted 2026-10-21). The live fetch is adapter.ts, with no
    // fallback - by decision, not oversight (open-items 49). This bans every
    // shape the false fallback travelled in - the never-written path itself,
    // "does have a fallback", "falls back", and "the fallback firing" - not
    // just the sentence it replaces (the lesson of open-items 33).
    pattern: /\/registry\/registry\.json|VITE_REGISTRY_URL(?:[^.\n]|\.(?=[A-Za-z])){0,80}\b(does have|has|have|with) a (built-in )?fallback\b|VITE_REGISTRY_URL`?(?:[^.\n]|\.(?=[A-Za-z])){0,30}\bfalls back\b|\b(built-in|VITE_REGISTRY_URL)`? fallback\b(?:[^.\n]|\.(?=[A-Za-z])){0,20}\bfir(es|ing)\b/i,
    why: "VITE_REGISTRY_URL has no fallback. registry/adapter.ts:43 reads it bare and :82 fetches it; unset, the build compiles that to fetch(void 0), a request for /undefined. The /registry/registry.json fallback in config.ts:8 is dead - only registry/loader.ts reads it, and nothing imports loader.ts.",
    truth: "frontend/src/registry/adapter.ts:43 and :82 (registry/loader.ts and CONFIG.registryUrl deleted 2026-10-21)",
  },
  {
    id: "undefined-symptom",
    // Inverted 2026-10-21 (open-items 49). From 2026-08-28 this rule banned any
    // mention of /undefined, on the strength of the same dead config.ts
    // fallback, and so blocked the accurate symptom for eight weeks. It now
    // bans the DENIAL of that symptom, in each shape the denial was written:
    // "nothing requests a literal /undefined", "you will not find /undefined",
    // "not a request for /undefined", "the /undefined symptom is wrong".
    //
    // strict exists because a denial can wear a correction's clothes. This one
    // was itself phrased as a correction ("Both were wrong", "the symptom is
    // wrong"), so the RETRACTION exemption waved through exactly the sentences
    // the rule exists to catch; without strict, two of them slip (tested
    // 2026-10-21). Mark any new rule strict when the claim it bans is one
    // people write as a retraction.
    strict: true,
    pattern: /\b(nothing|never|no longer|does not|doesn't|will not|won't)\s+(\w+\s+){0,2}(requests?|fetch\w*|find|see|hit\w*)\s+(a\s+)?(literal\s+)?(URL\s+)?(literally\s+named\s+)?`?\/undefined|\/undefined`?(?:[^.\n]|\.(?=[A-Za-z])){0,40}\b(will not|won't|never|do not|don't)\s+(find|see|appear)|\bnot a request for (a )?(literal )?`?\/undefined|\/undefined`? symptom is wrong/i,
    why: "A missing VITE_REGISTRY_URL DOES request a literal /undefined: registry/adapter.ts:43 has no fallback, and the build compiles the fetch to fetch(void 0).",
    truth: "frontend/src/registry/adapter.ts:43 and :82 - build with no env file and read the bundle",
  },
  {
    id: "environment-never-warning",
    pattern: /Environment failure is never a warning/i,
    why: "This was false while deployer_not_treasury sat in CONTENT_CHECK_NAMES. It is true again as of 2026-08-28 — but only because that entry was removed, so the claim must be re-verified, not inherited.",
    truth: "backend/scripts/preflight.js — CONTENT_CHECK_NAMES",
  },
  {
    id: "corecollection-name-source",
    // "collectionName", "COLLECTION NAME" and "collection name" are the same
    // claim; the prompt library uses the spaced, upper-case form in its answer
    // sheets and the camel-case form in its prose. A rule that only knew one
    // spelling passed the other for months.
    pattern: /collection[ _-]?name(?:[^.\n]|\.(?=[A-Za-z])){0,80}(written on.?chain|on.?chain name|on.?chain by)(?:[^.\n]|\.(?=[A-Za-z])){0,80}deployCoreAsset/i,
    why: "deployCoreAsset.ts is invoked by nothing. The on-chain name is master.csv's collectionName, first matching row.",
    truth: "backend/scripts/deploy-collection.js — name: firstRow.collectionName || collectionSlug",
  },
  {
    id: "template-name-fallback",
    // The fallback is written both as `templateName` and as the fully qualified
    // `templateVersion.templateName`. Both name the same dead code path.
    pattern: /falls back to `?(templateVersion\.)?templateName`?(?:[^.\n]|\.(?=[A-Za-z])){0,80}(mint|on.?chain|permanent)/i,
    why: "That fallback is in deployCoreAsset.ts, which nothing runs. deploy-collection.js falls back to collectionSlug.",
    truth: "backend/scripts/deploy-collection.js",
  },
  {
    id: "get-holders-empty",
    // Added the same day the file was written, because writing it made eight
    // documents wrong at once and nothing would have said so. A guard earns its
    // place by catching the drift its own change creates.
    pattern: /get-holders(\.js)?(?:[^.\n]|\.(?=[A-Za-z])){0,60}(0 bytes|empty file|is empty|currently empty)/i,
    why: "get-holders.js was written on 2026-09-02, 312 lines. It is no longer empty.",
    truth: "backend/scripts/get-holders.js",
  },
  {
    id: "redemption-not-built",
    // Added 2026-09-09 while replacing voucher-airdrop-runbook.md, whose
    // "What is not built" section still said redemption did not exist a week
    // after buildPlan landed. Three phrasings because the claim travels as a
    // code quote, as prose, and as a statement about the frontend branch -
    // a rule matching only the code quote passed the other two. The code
    // quote is anchored on "hardcodes": a bare `groups: []` matched the real
    // no-holder fallback in deploy-candy-machine.js and deploy-campaign.js,
    // and update-candy-guard.js's true description of pre-groups drops.
    pattern: /(hardcod\w*\s+`?groups:\s*\[\s*\]|redemption(?:[^.\n]|\.(?=[A-Za-z])){0,60}(is not|not yet|never) (built|wired|implemented)|holder branch(?:[^.\n]|\.(?=[A-Za-z])){0,40}(unreachable|never runs))/i,
    why: "deploy-candy-machine.js calls buildPlan when --holder-collection is given, emitting public and holder groups; update-candy-guard.js migrates already-deployed drops with --burn-collection. Redemption is built.",
    truth: "backend/scripts/deploy-candy-machine.js; backend/scripts/update-candy-guard.js - buildPlan",
  },
  {
    id: "allow-warnings-count",
    // Same widening, same reason: this watched for "six", so when the guide
    // said "five" it passed. Everything but "nine" is wrong as of 2026-09-05:
    // campaign_eligibility_capped and holder_collection_is_local both joined
    // the set that day, which is why this number moved twice in one session.
    //
    // The digit branch is a negative lookahead rather than a plain \d+, which
    // matched the CORRECT numeral and would have flagged "downgrades 8 checks"
    // as a contradiction. It never fired only because every doc spells the
    // count as a word. A rule that is right by luck is a rule that is wrong.
    pattern: /--allow-warnings(?:[^.\n]|\.(?=[A-Za-z])){0,60}\b(one|two|three|four|five|six|seven|eight|ten|eleven|twelve|(?!9\b)\d+)\b(?:[^.\n]|\.(?=[A-Za-z])){0,30}checks/i,
    why: "CONTENT_CHECK_NAMES holds nine entries as of 2026-09-05, and deployer_not_treasury is deliberately not one of them.",
    truth: "backend/scripts/preflight.js — CONTENT_CHECK_NAMES",
  },
];

// Files the documentation now states are gone.
//
// "X was deleted on <date>" is a claim about the tree like any other, and it is
// the one class this guard could not check, because it is not a pattern in a
// doc — it is the absence of a file. The deletion and the doc edits that
// describe it ship in one commit; if the `git rm` is forgotten, or a later
// merge resurrects the file, every one of those sentences is quietly false
// again. That is precisely the failure this file exists to stop, so it is
// checked rather than trusted.
//
// Removing an entry here is a real decision: it means the docs no longer say
// the file is gone.
const DELETED_FILES = [
  "scripts/deployCoreAsset.ts",
  "scripts/audit-production.ps1",
  "frontend/src/styles.css",
  "project-files.txt",
  // The dead VITE_REGISTRY_URL fallback's only reader. Deleted 2026-10-21 with
  // CONFIG.registryUrl; it is what made two rules wrong for eight weeks.
  "frontend/src/registry/loader.ts",
];

// A line is exempt if it is visibly retracting the claim rather than making it.
const RETRACTION = /\b(wrong|false|untrue|incorrect|corrected|correction|stale|outdated|until 20\d\d|earlier (version|revision|draft|doc)|no longer|used to (say|read)|previously (said|read)|do not (say|write)|must not appear|said|claimed)\b/i;

// This file necessarily contains every banned claim - that is what a rule
// is - so scanning itself reports each rule as a violation of itself. It is
// the one file that must be skipped, and skipping it costs nothing: a rule
// here is never a claim anybody reads as true.
const SELF = path.join(ROOT, "scripts", "check-docs.js");

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
    else if (EXTENSIONS.has(path.extname(e.name)) && full !== SELF) out.push(full);
  }
  return out;
}

// Is the guard actually armed? core.hooksPath set to a directory that does not
// exist disables hooks SILENTLY — git runs nothing and says nothing. That state
// was reached once, on 2026-08-28, by a `git reset --hard` that removed the hook
// while leaving the config pointing at it. A guard that can quietly become
// inert is worse than no guard, because it is trusted.
//
// The hook cannot detect its own absence, so this reports it when run by hand.
function hookStatus() {
  if (process.env.GIT_PARAMS !== undefined || process.env.PRE_PUSH === "1") return null;
  let configured;
  try {
    configured = execFileSync("git", ["config", "--get", "core.hooksPath"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return { armed: false, why: "core.hooksPath is not set — the committed hook never runs" };
  }
  if (!configured) {
    return { armed: false, why: "core.hooksPath is not set — the committed hook never runs" };
  }
  const hook = path.join(ROOT, configured, "pre-push");
  if (!fs.existsSync(hook)) {
    return {
      armed: false,
      why: `core.hooksPath is "${configured}" but ${configured}/pre-push does not exist — git runs NO hooks and reports nothing`,
    };
  }
  return { armed: true };
}

// Is the claim on line `idx` visibly being retracted rather than asserted?
// Looks at the line itself and its immediate neighbours, the same reach as the
// scan window, because a correction is routinely split across a wrap.
function retractedNear(lines, idx, radius = 2) {
  const from = Math.max(0, idx - radius);
  const to = Math.min(lines.length - 1, idx + radius);
  for (let j = from; j <= to; j++) if (RETRACTION.test(lines[j])) return true;
  return false;
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
      "\n✗ check-docs: found no files to check. Nothing was compared — this is not a pass.\n\n"
    );
    process.exit(2);
  }

  // Markdown in this repo is hard-wrapped at ~78 columns, so a claim routinely
  // spans two or three lines. A line-by-line scan misses every one of those.
  //
  // This is not hypothetical. On 2026-08-28 this guard reported a clean run while
  // `generation-prompts.md` — the library every generated runbook is seeded from,
  // and a BLOCKING file, not an advisory fixture — asserted in three separate
  // places that `deployCoreAsset.ts` writes the on-chain name. Each time the wrap
  // fell between "written on-chain by" and the filename, so `corecollection-name-
  // source` never saw a line to match. The guard had never been validated against
  // text known to be false, so its green tick meant only that its regexes had not
  // been tested.
  //
  // Scan windows of one, two and three consecutive lines. The smallest window
  // that matches wins; a hit is reported at the line the match actually starts
  // on, not at the start of the window; and once a rule fires, windows
  // overlapping that hit are suppressed so one claim is reported once.
  const WINDOW = 3;

  const hits = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const advisory = ADVISORY_ONLY.some((re) => re.test(rel));
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    const firedThrough = new Map(); // rule.id -> last line index already accounted for

    for (let i = 0; i < lines.length; i++) {
      for (let w = 1; w <= WINDOW && i + w <= lines.length; w++) {
        const win = lines.slice(i, i + w);

        const offsets = [];
        let text = "";
        win.forEach((l, k) => {
          if (k > 0) text += " ";
          offsets.push(text.length);
          text += l.trim();
        });

        for (const rule of RULES) {
          if ((firedThrough.get(rule.id) ?? -1) >= i) continue;
          const m = rule.pattern.exec(text);
          if (!m) continue;
          let k = 0;
          while (k + 1 < offsets.length && offsets[k + 1] <= m.index) k++;

          // Exemption is judged around the line the claim is ON, not around the
          // line the scan happened to start from. Judging it per window was a
          // bug: a window opening two lines above a claim could reach it while
          // excluding the retraction just below it, so the same sentence was
          // exempt or not depending on where the scan began. It fired on a
          // correction note in my-new-collection that reads as a retraction to
          // any human. A doc may quote a falsehood in order to withdraw it, and
          // the withdrawal does not always share its line.
          // A `strict` rule bans a claim that was itself written as a
          // correction, so a retraction word nearby proves nothing.
          if (!rule.strict && retractedNear(lines, i + k)) continue;

          hits.push({ rel, line: i + k + 1, text, rule, advisory });
          firedThrough.set(rule.id, i + w - 1);
        }
      }
    }
  }

  const blocking = hits.filter((h) => !h.advisory);
  const advisories = hits.filter((h) => h.advisory);

  const report = (h, out) => {
    out(`${h.rel}:${h.line}  [${h.rule.id}]\n`);
    out(`  says:  ${h.text.slice(0, 150)}\n`);
    out(`  but:   ${h.rule.why}\n`);
    out(`  check: ${h.rule.truth}\n\n`);
  };

  // Advisories are a standing, unchanging list — they are known-stale fixtures
  // that nobody intends to rewrite. Printing them in full on every push is how
  // a guard turns into wallpaper, and a guard people scroll past has stopped
  // guarding. One line, expandable on request.
  if (advisories.length > 0) {
    const o = (t) => process.stdout.write(t);
    if (process.argv.includes("--advisory")) {
      o(`\n— advisory: ${advisories.length} in worked runs (historical records, not failing) —\n\n`);
      advisories.forEach((h) => report(h, o));
    } else {
      const files = [...new Set(advisories.map((h) => h.rel))];
      o(
        `\n— ${advisories.length} advisory in ${files.length} worked run(s), not failing ` +
          `(node scripts/check-docs.js --advisory to list) —\n`
      );
    }
  }

  const hook = hookStatus();
  if (hook && !hook.armed) {
    process.stdout.write(
      `\n⚠ the guard is NOT armed: ${hook.why}.\n` +
        `  Arm it:  git config core.hooksPath .githooks\n` +
        `  Until then this check only runs when you type it.\n`
    );
  }

  // Naive-CSV check. open-items 28: eleven scripts on the mint path each carried
  // an inline `line.split(",")` with no quote handling, while lib/csv.js sat in
  // the same directory doing it correctly. They were fixed on 2026-09-02. This is
  // not a claim in a doc, so no rule can catch it coming back — a copy-pasted
  // helper in a twelfth script would simply be wrong again, silently.
  const scriptsDir = path.join(ROOT, "backend", "scripts");
  const naive = [];
  const walkScripts = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walkScripts(full);
      else if (e.name.endsWith(".js") && fs.readFileSync(full, "utf8").includes('.split(",")')) {
        naive.push(path.relative(ROOT, full).replace(/\\/g, "/"));
      }
    }
  };
  walkScripts(scriptsDir);
  if (naive.length > 0) {
    const e = (t) => process.stderr.write(t);
    e(`\n✗ check-docs: ${naive.length} script(s) parse CSV with a naive split(",").\n\n`);
    naive.forEach((f) => e(`  ${f}\n`));
    e(
      "\nUse backend/scripts/lib/csv.js instead. A split(\",\") has no quote handling, and quoting\n" +
        "does not help it: \"a, b\" splits into \"a and  b\" with the quotes retained. See open-items 28.\n\n"
    );
    process.exit(1);
  }

  // Deleted-file check — see DELETED_FILES.
  const resurrected = DELETED_FILES.filter((f) => fs.existsSync(path.join(ROOT, f)));
  if (resurrected.length > 0) {
    const e = (t) => process.stderr.write(t);
    e(
      `\n✗ check-docs: ${resurrected.length} file(s) the docs say were deleted still exist.\n\n`
    );
    resurrected.forEach((f) => e(`  ${f}\n`));
    e(
      "\nThe docs describing these as deleted are in the tree, so right now they are wrong.\n" +
        "Either run `git rm` on the file(s), or take them out of DELETED_FILES in\n" +
        "scripts/check-docs.js and correct the docs that say they are gone.\n\n"
    );
    process.exit(1);
  }

  if (blocking.length === 0) {
    process.stdout.write(
      `\n✓ check-docs: ${files.length} file(s), ${RULES.length} rule(s), no contradicted claims.\n\n`
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
