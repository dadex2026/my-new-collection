#!/usr/bin/env node
/**
 * scripts/compose-post.js
 *
 * Composes a social post from the project's own records, so a post and the
 * site cannot describe the same thing differently.
 *
 * WHY THIS IS STRONGER THAN A USUAL TEMPLATING SCRIPT:
 *   campaigns.csv doesn't hold values, it holds the exact strings the frontend
 *   renders — eligibilityText, rewardText, priceText, claimText. A post built
 *   from those is not a paraphrase of the site, it IS the site's wording.
 *   Disagreement becomes structurally impossible rather than merely unlikely.
 *
 * THE SOURCING RULE:
 *   Authored content comes from its CSV. Generated content comes from its
 *   published artifact.
 *
 *     master.csv      drops / mints        authored
 *     campaigns.csv   campaigns            authored
 *     textcards.csv   news, updates        authored
 *     standings.json  rankings             GENERATED — never a CSV
 *
 *   There is no rankings.csv and there should not be one. Rankings enter via
 *   backend/standings/*.json, are validated by generate-standings-cards.js and
 *   published to frontend/public/standings.json. Reading a CSV would read a
 *   layer that doesn't exist; reading the board files directly would bypass
 *   the validation. The published artifact is what the site serves, so the
 *   same no-disagreement guarantee applies.
 *
 * FIXED VS PER-RECORD SCHEMA:
 *   A CSV's header is its field list — known before the run, identical for
 *   every row. A standings board is not: each board declares its own columns
 *   and its entries carry only the fields that board actually has. So the
 *   available placeholder list is resolved per record at runtime, and the
 *   "unknown placeholder" error names the fields available for THAT record.
 *   A template hard-coding {entry[0].score} is correct for one board and wrong
 *   for another, and must fail loudly rather than render a blank.
 *
 * IT COUNTS THE WAY X COUNTS.
 *   Weighted length, not characters: every URL is 23 regardless of its real
 *   length because t.co rewrites it, and emoji and CJK weigh 2 where Latin
 *   weighs 1. Counting code points instead refuses posts that would fit
 *   (common — most templates carry a link) and accepts emoji-heavy posts that
 *   would not. See weightedLength().
 *
 * IT REFUSES RATHER THAN TRUNCATES.
 *   Over budget, the post is still printed so it can be edited, but no file is
 *   written and the exit code is non-zero. A silently truncated field list is
 *   worse than a long one, because people act on only what they can see.
 *
 * IT DOES NOT POST.
 *   Generate, read, paste, post. Publishing under your own name stays a human
 *   action; an unattended poster is one that can publish the wrong thing.
 *
 * Exit codes:
 *   0 = composed within budget
 *   1 = validation failure (nothing composed)
 *   2 = composed but over budget (printed to stdout, no file written)
 *
 * Usage:
 *   node backend/scripts/compose-post.js mint-live --id SAMPLE-001
 *   node backend/scripts/compose-post.js campaign-launch --id sample-campaign-001
 *   node backend/scripts/compose-post.js ranking-highlight --id example-participants-accuracy --allow-example
 *   node backend/scripts/compose-post.js mint-live --id SAMPLE-001 --out post.txt --limit 25000
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { parseCsvRecords } = require("./lib/csv");

// ---- Paths ----------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const TEMPLATES_DIR = path.join(BACKEND_DIR, "post-templates");
const FRONTEND_PUBLIC_DIR = path.join(BACKEND_DIR, "..", "frontend", "public");

const DEFAULT_LIMIT = 280; // X free tier. Premium is ~25,000 — pass --limit.

// A source is a place records live plus the field each record is addressed by.
const SOURCES = {
  master: { kind: "csv", file: path.join(BACKEND_DIR, "master.csv"), idField: "dropItemId" },
  campaigns: { kind: "csv", file: path.join(BACKEND_DIR, "campaigns.csv"), idField: "campaignId" },
  textcards: { kind: "csv", file: path.join(BACKEND_DIR, "textcards.csv"), idField: "textCardId" },
  standings: { kind: "standings", file: path.join(FRONTEND_PUBLIC_DIR, "standings.json"), idField: "boardId" },
};

// ---- Failure --------------------------------------------------------------
function fail(message, hint) {
  process.stderr.write(`\n✗ ${message}\n`);
  if (hint) process.stderr.write(`${hint}\n`);
  process.stderr.write("\n");
  process.exit(1);
}

function readFileOrFail(file, what) {
  if (!fs.existsSync(file)) {
    fail(`${what} not found: ${path.relative(process.cwd(), file)}`);
  }
  return fs.readFileSync(file, "utf-8");
}

// ---- CSV ------------------------------------------------------------------
// Parser lives in ./lib/csv.js, shared with set-post-url.js. Two copies of a
// quoting implementation is where they start to disagree.
function loadCsvRecords(file) {
  const { records } = parseCsvRecords(readFileOrFail(file, "Source file"));
  if (!records.length) fail(`No rows in ${path.basename(file)}`);
  return records;
}

// ---- Standings ------------------------------------------------------------
// Mirrors formatMovement() in generate-standings-cards.js so a post renders
// movement exactly as the card does. standings.json carries RAW board entries
// (movement is an object), unlike a card's already-projected rows.
function formatMovement(movement) {
  if (!movement || !movement.state) return "";
  const { state, delta } = movement;
  if (state === "new") return "new";
  if (state === "returning") return "returning";
  if (state === "hold") return "—";
  const size = typeof delta === "number" ? Math.abs(delta) : "";
  if (state === "up") return `▲ ${size}`.trim();
  if (state === "down") return `▼ ${size}`.trim();
  return "";
}

function loadStandingsBoards(file) {
  let parsed;
  try {
    parsed = JSON.parse(readFileOrFail(file, "standings.json"));
  } catch (err) {
    fail(`standings.json is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(parsed.boards)) fail("standings.json has no boards array.");
  return parsed.boards;
}

// Board-level fields a template may reference bare, plus entryCount, which the
// board doesn't store but every highlight post wants.
function boardFields(board) {
  const fields = {};
  Object.entries(board).forEach(([key, value]) => {
    if (key === "entries") return;
    if (value === null || value === undefined) return;
    if (typeof value === "object") return; // capture, eligibility — not post material
    fields[key] = value;
  });
  fields.entryCount = Array.isArray(board.entries) ? board.entries.length : 0;
  return fields;
}

// An entry's extra columns live in a `fields` object — that is how a ranked
// export carries Winner, Spread, Total and anything else past the label and
// score (see backend/standings/README.md). projectEntry() spreads them onto
// the card row, so a post must see them too, or a Sports board's most
// post-worthy values would be invisible to every template.
function entryFields(entry) {
  const fields = {};
  const take = ([key, value]) => {
    if (value === null || value === undefined) return;
    if (key === "movement") { fields.movement = formatMovement(value); return; }
    if (typeof value === "object") return;
    fields[key] = value;
  };

  Object.entries(entry).forEach(([key, value]) => {
    if (key === "fields") return; // flattened below, not nested
    take([key, value]);
  });

  // Flattened last so an extra column never silently shadows rank or name.
  Object.entries(entry.fields || {}).forEach(([key, value]) => {
    if (key in fields) return;
    take([key, value]);
  });

  return fields;
}

// ---- Templates ------------------------------------------------------------
// A template is directive lines, then the body. Directives are `#key: value`
// at the top; `#source:` is required. Self-describing beats a manifest — the
// template and its source can't drift apart if they're the same file.
function loadTemplate(name) {
  const file = path.join(TEMPLATES_DIR, `${name}.txt`);
  if (!fs.existsSync(file)) {
    const available = fs.existsSync(TEMPLATES_DIR)
      ? fs.readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".txt")).map((f) => f.replace(/\.txt$/, ""))
      : [];
    fail(
      `No template named "${name}".`,
      available.length ? `Available: ${available.join(", ")}` : `No templates in ${path.relative(process.cwd(), TEMPLATES_DIR)}`
    );
  }

  const lines = readFileOrFail(file, "Template").split("\n");
  const directives = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("#")) break;
    const match = /^#\s*([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (match) directives[match[1]] = match[2].trim();
  }

  const body = lines.slice(i).join("\n").replace(/^\n+/, "").replace(/\s+$/, "");
  if (!body) fail(`Template "${name}" has no body.`);

  const source = directives.source;
  if (!source) {
    fail(
      `Template "${name}" declares no source.`,
      `Add a first line: #source: ${Object.keys(SOURCES).join(" | ")}`
    );
  }
  if (!SOURCES[source]) {
    fail(
      `Template "${name}" declares unknown source "${source}".`,
      `Known sources: ${Object.keys(SOURCES).join(", ")}`
    );
  }

  return { name, body, source, directives };
}

const PLACEHOLDER = /\{([^{}]+)\}/g;

function placeholdersIn(body) {
  const found = [];
  let m;
  while ((m = PLACEHOLDER.exec(body)) !== null) {
    const key = m[1].trim();
    if (!found.includes(key)) found.push(key);
  }
  return found;
}

// ---- Site URL -------------------------------------------------------------
// Deliberately NOT a config key. master.csv already carries the URLs per row,
// and backend/config.json is still template placeholders — adding a setting to
// a file nobody maintains just moves the staleness somewhere less visible.
function resolveSiteUrl(explicit) {
  if (explicit) return explicit.replace(/\/+$/, "");
  const rows = loadCsvRecords(SOURCES.master.file);
  const url = rows.length ? (rows[0].collectionExternalUrl || "").trim() : "";
  return url ? url.replace(/\/+$/, "") : "";
}

// ---- Resolution -----------------------------------------------------------
function resolveRecord(template, id, opts) {
  const source = SOURCES[template.source];

  if (source.kind === "csv") {
    const records = loadCsvRecords(source.file);
    const record = records.find((r) => r[source.idField] === id);
    if (!record) {
      const ids = records.map((r) => r[source.idField]).filter(Boolean);
      fail(
        `No record with ${source.idField} "${id}" in ${path.basename(source.file)}.`,
        ids.length ? `Available ids: ${ids.join(", ")}` : "That file has no rows."
      );
    }
    return { fields: { ...record }, label: `${path.basename(source.file)} · ${id}` };
  }

  const boards = loadStandingsBoards(source.file);
  const board = boards.find((b) => b[source.idField] === id);
  if (!board) {
    const ids = boards.map((b) => b[source.idField]).filter(Boolean);
    fail(
      `No board with ${source.idField} "${id}" in standings.json.`,
      ids.length ? `Available boards: ${ids.join(", ")}` : "No boards are published yet."
    );
  }

  // The sample board proves the pipeline; it is not something to announce.
  if (board.example === true && !opts.allowExample) {
    fail(
      `Board "${id}" is tagged example: true and will not be composed.`,
      "It exists to prove the pipeline, not to be published. Pass --allow-example to override, or delete it once real boards land."
    );
  }

  const fields = boardFields(board);
  const entries = Array.isArray(board.entries) ? board.entries : [];
  entries.forEach((entry, index) => {
    const flat = entryFields(entry);
    Object.entries(flat).forEach(([key, value]) => {
      fields[`entry[${index}].${key}`] = value;
    });
  });

  return { fields, label: `standings.json · ${id}`, entryCount: entries.length };
}

function render(template, fields, siteUrl) {
  const available = { ...fields };
  if (siteUrl) {
    available.siteUrl = siteUrl;
    available.methodologyUrl = `${siteUrl}/#methodology`;
  }

  const used = placeholdersIn(template.body);

  // A standings post cites a rank. The site already publishes a generated page
  // saying which ruleset produced it and where movement is and isn't shown —
  // link that rather than carry a free-text disclaimer, which goes stale
  // silently where a link to a generated page cannot.
  if (template.source === "standings" && !used.includes("methodologyUrl")) {
    fail(
      `Template "${template.name}" reads standings but has no {methodologyUrl}.`,
      "A post citing a rank must point at how the ranking was produced. Add {methodologyUrl} to the template."
    );
  }

  const unknown = used.filter((key) => !(key in available));
  if (unknown.length) {
    fail(
      `Unknown placeholder${unknown.length > 1 ? "s" : ""}: ${unknown.map((u) => `{${u}}`).join(", ")}`,
      `Available for this record:\n  ${Object.keys(available).sort().join("\n  ")}`
    );
  }

  const empty = used.filter((key) => String(available[key]).trim() === "");
  if (empty.length) {
    fail(
      `Empty in this record: ${empty.map((e) => `{${e}}`).join(", ")}`,
      "A blank value leaves a dangling line that still reads as a finished post. Fill the field or drop it from the template."
    );
  }

  return template.body.replace(PLACEHOLDER, (_, raw) => String(available[raw.trim()]));
}

// ---- Weighted length ------------------------------------------------------
// X does not count characters. It computes a *weighted* length, and counting
// code points instead is wrong in both directions:
//
//   - Every URL counts as 23 whatever its real length, because t.co rewrites
//     it. Counting the real length over-counts, so a post that would fit gets
//     refused — and a budget check that rejects valid posts is one people
//     learn to override, at which point it has stopped being a check.
//   - Emoji and CJK weigh 2, most Latin text weighs 1. Counting code points
//     under-counts those, so a post can pass here and be rejected by X.
//
// The ranges below are X's published weight-1 set; everything outside them
// weighs 2. Text is NFC-normalised first, as twitter-text does.
const URL_WEIGHT = 23;
const URL_PATTERN = /https?:\/\/\S+/gi;
const WEIGHT_ONE_RANGES = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];

function codePointWeight(cp) {
  for (const [lo, hi] of WEIGHT_ONE_RANGES) {
    if (cp >= lo && cp <= hi) return 1;
  }
  return 2;
}

// Known limitation: `\S+` claims trailing punctuation as part of a URL, where
// X's own extractor is stricter. Composed posts put links on their own line or
// at the end of one, so this has not mattered — but a link followed by a comma
// mid-sentence would be counted one or two units short.
function weightedLength(text) {
  let total = 0;
  const withoutUrls = text.normalize("NFC").replace(URL_PATTERN, () => {
    total += URL_WEIGHT;
    return "";
  });
  for (const ch of withoutUrls) total += codePointWeight(ch.codePointAt(0));
  return total;
}

// ---- Budget report --------------------------------------------------------
function report(text, limit, label) {
  const total = weightedLength(text);
  const lines = text.split("\n");
  const width = String(total).length;

  process.stderr.write(`\n  ${label}\n`);
  lines.forEach((line) => {
    const n = weightedLength(line);
    const preview = line.length > 58 ? `${line.slice(0, 55)}…` : line;
    process.stderr.write(`  ${String(n).padStart(width)}  ${preview || "·"}\n`);
  });
  process.stderr.write(`  ${"-".repeat(width)}\n`);
  process.stderr.write(`  ${String(total).padStart(width)}  total (limit ${limit})\n`);

  if (total > limit) {
    process.stderr.write(`\n✗ Over budget by ${total - limit}. Nothing written — shorten a line above and re-run.\n\n`);
    return false;
  }
  process.stderr.write(`  ${" ".repeat(width)}  ${limit - total} to spare\n\n`);
  return true;
}

// ---- Main -----------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const templateName = args.find((a) => !a.startsWith("-"));

  const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
  };
  const has = (name) => args.includes(`--${name}`);

  if (!templateName || has("help")) {
    process.stderr.write(
      "\nUsage: node backend/scripts/compose-post.js <template> --id <recordId>\n" +
      "         [--out <path>] [--limit <chars>] [--site <url>] [--allow-example]\n\n"
    );
    process.exit(templateName ? 0 : 1);
  }

  const id = flag("id");
  if (!id) fail("--id is required.", "Name the record to compose from, e.g. --id SAMPLE-001");

  const limitRaw = flag("limit");
  const limit = limitRaw ? Number(limitRaw) : DEFAULT_LIMIT;
  if (!Number.isFinite(limit) || limit <= 0) fail(`--limit must be a positive number, got "${limitRaw}".`);

  const template = loadTemplate(templateName);
  const record = resolveRecord(template, id, { allowExample: has("allow-example") });
  const siteUrl = resolveSiteUrl(flag("site"));
  const text = render(template, record.fields, siteUrl);

  process.stdout.write(`${text}\n`);

  const withinBudget = report(text, limit, record.label);
  if (!withinBudget) process.exit(2);

  const out = flag("out");
  if (out) {
    fs.writeFileSync(path.resolve(out), `${text}\n`, "utf-8");
    process.stderr.write(`  written to ${out}\n\n`);
  }
}

main();
