#!/usr/bin/env node
/**
 * scripts/check-line-endings.js
 *
 * Fails if any tracked .js, .ts, .md or .json file in the WORKING TREE holds a
 * carriage return. --fix removes them, byte by byte, and proves nothing else
 * moved.
 *
 * WHY
 *   .gitattributes normalises every text file to LF in the index, so a fresh
 *   clone is LF throughout (145 of 145 text files on 2026-10-21). The CRLF and
 *   mixed files in older checkouts were residue from before that rule - and
 *   git structurally cannot see working-tree line endings, because it
 *   normalises before comparing. Three slips hid there: CRLF stripped from ten
 *   scripts by a bulk edit, end-of-file endings broken on six, and LF lines
 *   inserted into CRLF files. Each was caught by care, and care is not a
 *   control. With the trees normalised to LF, "no CR at all" is a rule that
 *   holds on any clone, so it can be checked.
 *
 * NOT CSVs, deliberately. Excel and PowerShell write CRLF (and a BOM) back into
 * a CSV whenever someone opens and saves it - the drifted master.csv of
 * open-items 51 was such a file. A check that fails because someone looked at a
 * spreadsheet is a check that gets disabled. CSVs are read with lib/csv.js,
 * which accepts either ending.
 *
 * --fix converts on BYTES, never through a text decode: deploy-campaign.js and
 * generate-campaigns-registry.js are Windows-1252 (byte 0x97), which a UTF-8
 * round trip would corrupt. It removes 0x0D only where 0x0A follows, then
 * verifies, before writing, that the result is the original with exactly those
 * bytes removed and no other byte moved, and re-reads the file after writing.
 * A lone 0x0D (not before 0x0A) is refused, not guessed at.
 *
 * Exit codes:
 *   0 = no carriage return in scope (after --fix, if given)
 *   1 = at least one file holds one, or --fix refused a file
 *   2 = could not run (not a git checkout)
 *
 * Usage:
 *   node scripts/check-line-endings.js
 *   node scripts/check-line-endings.js --fix
 *   node scripts/check-line-endings.js --root ../my-new-collection [--fix]
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// --root <dir> checks another checkout (e.g. the fork, before a cross-repo copy).
const rootFlag = process.argv.indexOf("--root");
const ROOT = rootFlag !== -1 && process.argv[rootFlag + 1] ? path.resolve(process.argv[rootFlag + 1]) : path.join(__dirname, "..");
const IN_SCOPE = new Set([".js", ".ts", ".md", ".json"]);
const CR = 0x0d;
const LF = 0x0a;

// Remove every 0x0D that precedes 0x0A. Pure.
function stripCrlf(buf) {
  const out = Buffer.alloc(buf.length);
  let j = 0;
  let removed = 0;
  let loneCr = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === CR) {
      if (buf[i + 1] === LF) { removed++; continue; }
      loneCr++;
    }
    out[j++] = buf[i];
  }
  return { out: out.subarray(0, j), removed, loneCr };
}

// True only if `after` is `before` with some 0x0D bytes removed, each of which
// was followed by 0x0A, and nothing else changed. Pure.
function onlyCrlfCrsRemoved(before, after) {
  let j = 0;
  for (let i = 0; i < before.length; i++) {
    if (j < after.length && before[i] === after[j]) { j++; continue; }
    if (before[i] === CR && before[i + 1] === LF) continue;
    return false;
  }
  return j === after.length;
}

function trackedInScope() {
  let out;
  try {
    out = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch {
    process.stderr.write("check-line-endings: not a git checkout - nothing checked, not a pass.\n");
    process.exit(2);
  }
  return out.split("\0").filter((f) => f && IN_SCOPE.has(path.extname(f).toLowerCase()));
}

function main() {
  const fix = process.argv.includes("--fix");
  const files = trackedInScope();
  const found = [];
  let refused = 0;
  for (const rel of files) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    const buf = fs.readFileSync(full);
    if (!buf.includes(CR)) continue;
    const { out, removed, loneCr } = stripCrlf(buf);
    found.push(`${rel}  (${removed} CRLF${loneCr ? `, ${loneCr} lone CR` : ""})`);
    if (!fix) continue;
    if (loneCr) { console.log(`  REFUSED  ${rel}: ${loneCr} lone CR - fix by hand`); refused++; continue; }
    if (!onlyCrlfCrsRemoved(buf, out) || buf.length - out.length !== removed) {
      console.log(`  REFUSED  ${rel}: the conversion would move more than CR bytes`);
      refused++;
      continue;
    }
    fs.writeFileSync(full, out);
    if (!fs.readFileSync(full).equals(out)) { console.log(`  REFUSED  ${rel}: the file did not read back as written`); refused++; continue; }
    console.log(`  fixed    ${rel}: removed ${removed} CR byte(s), every other byte unchanged`);
  }

  if (found.length === 0) {
    console.log(`\n✓ check-line-endings: ${files.length} tracked .js/.ts/.md/.json file(s), no carriage returns.\n`);
    process.exit(0);
  }
  if (fix) {
    const fixed = found.length - refused;
    console.log(`\n${fixed} file(s) normalised to LF${refused ? `, ${refused} refused` : ""}. Git sees no change in a normalised file; that is expected.\n`);
    process.exit(refused ? 1 : 0);
  }
  console.log(`\n✗ check-line-endings: ${found.length} file(s) hold carriage returns:\n  ` + found.join("\n  ") +
    `\n\nRun: node scripts/check-line-endings.js --fix\n`);
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = { stripCrlf, onlyCrlfCrsRemoved };
