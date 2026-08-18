#!/usr/bin/env node
/**
 * scripts/generate-content-registry.js
 *
 * Publishes backend/textcards.csv as content-registry.json, mirroring
 * exactly how generate-registry.js publishes master.csv as registry.json
 * and generate-campaigns-registry.js publishes campaigns.csv as
 * campaigns.json: same CommonJS style, same log()/fail() JSON-line
 * logging to logs/, same --out flag, same best-effort copy into
 * frontend/public/.
 *
 * Deliberately a separate output filename from registry.json and
 * campaigns.json — those are owned by the two scripts above and hold
 * live deployment data; reusing either name here would silently
 * clobber it.
 *
 * WHAT THIS SCRIPT DOES NOT MANAGE:
 *   Persistent/structured cards (category RANKING, LEADERBOARD,
 *   SCOREBOARD, STANDINGS, STATS) are never read from or written to
 *   the CSV. Their `content` is a structured entries array, which
 *   doesn't fit a CSV cell and tends to be revised often (e.g. a
 *   weekly ranking refresh) without a full regen. Those cards are
 *   hand-edited directly in content-registry.json. This script only
 *   ever inserts/updates cards whose textCardId appears in
 *   textcards.csv — every other card already in content-registry.json,
 *   persistent or not, is carried through untouched.
 *
 * ONE DELIBERATE DEVIATION FROM readCsv() IN THE SIBLING SCRIPTS:
 *   generate-registry.js / generate-campaigns-registry.js split CSV
 *   lines on a plain "," — fine for short, structured fields like
 *   names and addresses, but `content` here is prose and will
 *   routinely contain commas ("We've shipped X, Y, and Z."). A naive
 *   split would silently shear a card's content at the first comma.
 *   parseCSV() below is a small quote-aware parser instead (handles
 *   "quoted, with, embedded commas" and "" as an escaped quote) so a
 *   normal sentence in `content` can't corrupt a row. Flag this if
 *   you'd rather match the sibling scripts' parser exactly for
 *   consistency and enforce comma-free content by convention instead.
 *
 * Exit codes:
 *   0 = success
 *   1 = validation failure
 *
 * Usage:
 *   node scripts/generate-content-registry.js
 *   node scripts/generate-content-registry.js --out ../frontend/public/content-registry.json
 */
"use strict";

const fs = require("fs");
const path = require("path");

// ---- Paths ----------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const CSV_PATH = path.join(BACKEND_DIR, "textcards.csv");
const DEFAULT_OUTPUT_PATH = path.join(BACKEND_DIR, "content-registry.json");
const FRONTEND_PUBLIC_PATH = path.join(BACKEND_DIR, "..", "frontend", "public", "content-registry.json");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

// ---- Schema -----------------------------------------------------------
const SIMPLE_CATEGORIES = ["NEWS", "UPDATE", "ANNOUNCEMENT", "ANALYSIS"];
const STRUCTURED_CATEGORIES = ["RANKING", "LEADERBOARD", "SCOREBOARD", "STANDINGS", "STATS"];
const STATUSES = ["DRAFT", "SCHEDULED", "ACTIVE", "INACTIVE", "EXPIRED", "ARCHIVED"];

// ---- Logging ----------------------------------------------------------
function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}
function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "generate-content-registry", ...event };
  const line = JSON.stringify(entry);
  console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, "generate-content-registry.log"), line + "\n");
}
function fail(reason, message, exitCode) {
  log({ status: "failure", reason, message });
  process.exit(exitCode);
}

// ---- Quote-aware CSV parser (see header note above) -----------------------
function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && next === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return { header: [], rows: [] };
  const raw = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  const parsed = parseCsvRows(raw);
  if (parsed.length === 0) return { header: [], rows: [] };
  const header = parsed[0].map((h) => h.trim());
  const rows = parsed.slice(1).map((cols) => {
    const row = {};
    header.forEach((key, i) => {
      row[key] = cols[i] !== undefined ? cols[i].trim() : "";
    });
    return row;
  });
  return { header, rows };
}

// ---- Field parsing ----------------------------------------------------
function toISODate(value, fieldLabel, cardId) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    fail("invalid_date", `Card ${cardId}: "${fieldLabel}" is not a valid date: "${value}"`, 1);
  }
  return d.toISOString();
}
function toBool(value) {
  return String(value).trim().toUpperCase() === "TRUE";
}
function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return isNaN(n) ? fallback : n;
}
function splitTags(value) {
  // Same "|"-delimited convention master.csv already uses for `attributes`.
  return value ? value.split("|").map((t) => t.trim()).filter(Boolean) : [];
}

function validateAndNormalizeRow(row, seenIds) {
  const required = ["textCardId", "category", "headline", "content", "publishedDate", "status"];
  for (const field of required) {
    if (!row[field]) {
      fail("missing_field", `Row missing required field "${field}": ${JSON.stringify(row)}`, 1);
    }
  }

  const { textCardId, category } = row;

  if (seenIds.has(textCardId)) {
    fail("duplicate_id", `Duplicate textCardId in CSV: "${textCardId}". IDs must be unique and are never reused.`, 1);
  }
  seenIds.add(textCardId);

  if (STRUCTURED_CATEGORIES.includes(category)) {
    fail(
      "structured_category_in_csv",
      `Card ${textCardId}: category "${category}" is a persistent/structured category managed directly in ` +
        `content-registry.json, not textcards.csv — its content is a structured entries array, not plain text. ` +
        `Remove this row and add/edit it in the JSON registry instead.`,
      1
    );
  }
  if (!SIMPLE_CATEGORIES.includes(category)) {
    fail("unknown_category", `Card ${textCardId}: category "${category}" not recognized. Expected one of: ${SIMPLE_CATEGORIES.join(", ")}`, 1);
  }
  if (!STATUSES.includes(row.status)) {
    fail("unknown_status", `Card ${textCardId}: status "${row.status}" not recognized. Expected one of: ${STATUSES.join(", ")}`, 1);
  }

  const publishedDate = toISODate(row.publishedDate, "publishedDate", textCardId);
  const updatedDate = toISODate(row.updatedDate, "updatedDate", textCardId) || publishedDate;
  const expiresAt = row.expiresAt ? toISODate(row.expiresAt, "expiresAt", textCardId) : null;

  return {
    textCardId,
    category,
    persistent: false,
    headline: row.headline,
    subheadline: row.subheadline || null,
    content: row.content,
    publishedDate,
    updatedDate,
    status: row.status,
    expiresAt,
    tags: splitTags(row.tags),
    featured: toBool(row.featured),
    priority: toInt(row.priority, 0),
    author: row.author || null,
    media: {},
    relationships: {},
  };
}

// ---- Main ---------------------------------------------------------------
function loadExistingRegistry(outputPath) {
  if (!fs.existsSync(outputPath)) return { cards: [] };
  try {
    return JSON.parse(fs.readFileSync(outputPath, "utf8"));
  } catch (err) {
    fail("bad_existing_registry", `Could not parse existing ${outputPath}: ${err.message}`, 1);
  }
}

function main() {
  const args = process.argv.slice(2);
  const outFlagIndex = args.indexOf("--out");
  const outputPath = outFlagIndex !== -1 && args[outFlagIndex + 1] ? path.resolve(args[outFlagIndex + 1]) : DEFAULT_OUTPUT_PATH;

  log({ status: "start", outputPath });

  if (!fs.existsSync(CSV_PATH)) {
    fail("csv_not_found", `CSV not found at ${CSV_PATH}`, 1);
  }

  const { rows } = readCsv(CSV_PATH);
  if (rows.length === 0) {
    log({ status: "info", message: "textcards.csv has no data rows — nothing to publish from CSV this run (persistent cards, if any, are unaffected)." });
  }

  const seenIds = new Set();
  const csvCards = rows.map((row) => validateAndNormalizeRow(row, seenIds));

  const existing = loadExistingRegistry(outputPath);
  const existingCards = Array.isArray(existing.cards) ? existing.cards : [];

  const byId = new Map();
  existingCards.forEach((card) => byId.set(card.textCardId, card));

  let added = 0;
  let updated = 0;
  csvCards.forEach((card) => {
    if (byId.has(card.textCardId)) updated++;
    else added++;
    byId.set(card.textCardId, card);
  });

  const mergedCards = Array.from(byId.values()).sort((a, b) => a.textCardId.localeCompare(b.textCardId));
  const persistentCount = mergedCards.filter((c) => c.persistent).length;

  log({
    status: "plan",
    csvRows: csvCards.length,
    cardsAdded: added,
    cardsUpdated: updated,
    persistentCardsPreserved: persistentCount,
    totalCards: mergedCards.length,
  });

  const registry = {
    generatedAt: new Date().toISOString(),
    cards: mergedCards,
  };

  fs.writeFileSync(outputPath, JSON.stringify(registry, null, 2), "utf8");
  log({ status: "info", message: `Wrote content registry to ${outputPath}` });

  const frontendPublicDir = path.dirname(FRONTEND_PUBLIC_PATH);
  if (fs.existsSync(frontendPublicDir)) {
    fs.writeFileSync(FRONTEND_PUBLIC_PATH, JSON.stringify(registry, null, 2), "utf8");
    log({ status: "info", message: `Also copied content registry to ${FRONTEND_PUBLIC_PATH}` });
  } else {
    log({
      status: "warning",
      message: `frontend/public/ not found at ${frontendPublicDir} — copy ${path.basename(outputPath)} into your frontend's static assets manually, or pass --out pointing at it directly.`,
    });
  }

  log({
    status: "success",
    message: `Content registry generated: ${mergedCards.length} card(s) total (${added} added, ${updated} updated from CSV, ${persistentCount} persistent card(s) preserved).`,
  });
  process.exit(0);
}

try {
  main();
} catch (err) {
  log({ status: "failure", reason: "unhandled_error", message: err.message });
  process.exit(1);
}
