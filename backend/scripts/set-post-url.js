#!/usr/bin/env node
/**
 * scripts/set-post-url.js
 *
 * Writes the URL of a published post back into its textcards.csv row, then
 * regenerates the content registry.
 *
 * WHY IT EXISTS:
 *   This is the step people skip. Nothing breaks when they do — the card looks
 *   finished, it simply has no way back to its own discussion thread — so the
 *   omission is invisible. Collapsing "edit the last field of a sixteen-column
 *   row" and "remember to regenerate" into one command removes the gap rather
 *   than documenting it.
 *
 * IT REWRITES ONE LINE, NOT THE FILE.
 *   Reserialising the whole CSV would reformat rows this script never meant to
 *   touch — quoting a field that was unquoted, or dropping a spelling of a
 *   value that round-trips differently. So it locates the single line whose
 *   first field matches the card id, rebuilds that line, and leaves every other
 *   byte alone.
 *
 *   A row wrapping onto a second physical line (a field containing a newline)
 *   is refused rather than half-rewritten.
 *
 * Exit codes:
 *   0 = written and regenerated
 *   1 = validation failure, nothing written
 *   n = the content registry generator's exit code, if that step failed
 *
 * Usage:
 *   node backend/scripts/set-post-url.js ANNOUNCEMENT-012 https://x.com/you/status/123
 *   node backend/scripts/set-post-url.js ANNOUNCEMENT-012 https://... --no-generate
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { parseLine, serializeRow } = require("./lib/csv");

const BACKEND_DIR = path.join(__dirname, "..");
const CSV_PATH = path.join(BACKEND_DIR, "textcards.csv");
const ID_COLUMN = "textCardId";
const URL_COLUMN = "postUrl";

function fail(message, hint) {
  process.stderr.write(`\n✗ ${message}\n`);
  if (hint) process.stderr.write(`${hint}\n`);
  process.stderr.write("\n");
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const [cardId, url] = positional;

  if (!cardId || !url || args.includes("--help")) {
    process.stderr.write(
      "\nUsage: node backend/scripts/set-post-url.js <textCardId> <https://...> [--no-generate]\n\n"
    );
    process.exit(cardId && url ? 0 : 1);
  }

  // https only, and checked before anything is read. An announcement lives on
  // another host, so a relative path is a mistake and http:// is a downgrade —
  // the same rule generate-content-registry.js enforces, applied earlier so the
  // failure lands on the argument rather than two commands later.
  if (!/^https:\/\//i.test(url)) {
    fail(
      `postUrl must start with https:// — got "${url}".`,
      "It links to a post on another site."
    );
  }

  if (!fs.existsSync(CSV_PATH)) fail(`Not found: ${path.relative(process.cwd(), CSV_PATH)}`);

  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);

  const header = parseLine(lines[0]);
  if (!header) fail("Could not parse the header row of textcards.csv.");

  const idIndex = header.indexOf(ID_COLUMN);
  const urlIndex = header.indexOf(URL_COLUMN);
  if (idIndex === -1) fail(`textcards.csv has no "${ID_COLUMN}" column.`);
  if (urlIndex === -1) {
    fail(
      `textcards.csv has no "${URL_COLUMN}" column.`,
      "This collection predates the postUrl field — add the column to the header and to every row before using this."
    );
  }

  // Find the target row, and collect the ids so a miss can name the options.
  const seen = [];
  let targetLine = -1;
  let targetFields = null;

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const fields = parseLine(lines[i]);
    if (!fields) {
      // Unclosed quotes: this row wraps. Only a problem if it is the one asked
      // for; otherwise it is left untouched like every other line.
      if (lines[i].startsWith(`${cardId},`)) {
        fail(
          `Row "${cardId}" spans more than one line and will not be rewritten safely.`,
          "Edit that row by hand, or remove the newline from the field that contains it."
        );
      }
      continue;
    }
    const id = (fields[idIndex] || "").trim();
    if (id) seen.push(id);
    if (id === cardId) { targetLine = i; targetFields = fields; }
  }

  if (targetLine === -1) {
    fail(
      `No row with ${ID_COLUMN} "${cardId}" in textcards.csv.`,
      seen.length ? `Available ids: ${seen.join(", ")}` : "That file has no data rows."
    );
  }

  const existing = (targetFields[urlIndex] || "").trim();
  if (existing && existing !== url) {
    process.stderr.write(`\n  replacing existing postUrl:\n    was ${existing}\n    now ${url}\n`);
  }

  // Pad to the header width, so a short row gains its missing trailing commas
  // rather than putting the URL in the wrong column.
  while (targetFields.length < header.length) targetFields.push("");
  targetFields[urlIndex] = url;

  lines[targetLine] = serializeRow(targetFields);
  fs.writeFileSync(CSV_PATH, lines.join(eol), "utf-8");

  process.stderr.write(`\n  ${cardId} → ${url}\n  written to textcards.csv\n\n`);

  if (args.includes("--no-generate")) {
    process.stderr.write("  --no-generate: run generate-content-registry.js yourself.\n\n");
    return;
  }

  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, "generate-content-registry.js")],
    { stdio: "inherit" }
  );
  if (result.error) fail(`Could not run generate-content-registry.js: ${result.error.message}`);
  if (result.status !== 0) {
    process.stderr.write(`\n✗ The registry generator failed (exit ${result.status}). The CSV was still updated.\n\n`);
    process.exit(result.status);
  }

  process.stderr.write("  Next: commit the CSV and both content-registry.json files, then push.\n\n");
}

main();
