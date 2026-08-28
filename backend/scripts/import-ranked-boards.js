#!/usr/bin/env node
/**
 * scripts/import-ranked-boards.js
 *
 * The general case. import-community-boards.js handles the participant
 * leaderboard, where four sorts, provisional handling, evidence and
 * reconciliation all matter. This handles everything else — and "everything
 * else" turns out to be almost every board both Ledgers publish.
 *
 * WHY ONE SCRIPT COVERS THEM ALL:
 *   Every ranked export from either app has the same shape.
 *
 *     Games      Position, Date, Matchup, Winner, WinScore, Spread, Total, FinalValue
 *     Racing     Position, Track, Race, Date, Win, Place1, ..., Combined
 *     Poker      Position, Name|Country, TotalContribution, Entries, AvgPerEntry
 *     Custom     Position, <label>, Date, <formula>
 *     Category   Position, Name, Total, Music, Movies, TV, ...
 *
 *   Position first, a label column, a value column, extras after. So a board is
 *   a declaration — which file, which column is the name, which is the score,
 *   which extras to carry — rather than a bespoke importer per board type.
 *
 * IT COMPUTES NOTHING.
 *   Rank comes from the export's own Position column, already competition-ranked
 *   by the source. Score is copied. Nothing here can change a standing; the only
 *   derived value is movement, and that is positional rather than arithmetic.
 *
 * MOVEMENT IS REPLAYED, per board, exactly as the community importer does it:
 *   dated exports read in order, positions compared between consecutive rounds.
 *   A first round shows every entry as new, which is correct.
 *
 * Exit codes:
 *   0 = success
 *   1 = validation failure
 *
 * Usage:
 *   node scripts/import-ranked-boards.js
 *   node scripts/import-ranked-boards.js --input ../some/other/dir
 */
"use strict";

const fs = require("fs");
const path = require("path");

// ---- Paths ----------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const STANDINGS_DIR = path.join(BACKEND_DIR, "standings");
const DEFAULT_INPUT_DIR = path.join(STANDINGS_DIR, "_input");
const BOARDS_SUBDIR = "boards";
const BOARDS_DECL = "boards.json";
const CONFIG_FILENAME = "import-config.json";
const RULESETS_FILENAME = "rulesets.json";
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

const DATE_IN_NAME = /(\d{4}-\d{2}-\d{2})/;
const TRACKS = ["subject", "consensus", "prediction", "reporting"];

const KINDS = {
  baseline: { suppressesMovement: false },
  "rule-change": { suppressesMovement: true },
  "bug-fix": { suppressesMovement: false },
  "export-only": { suppressesMovement: false },
};

/* Same rule as the community importer: a boundary that skips a version can hide
   a rule change between its endpoints, so suppression asks about the interval
   rather than the arriving version alone. */
function orderedVersions(rulesets) {
  return Object.keys(rulesets).sort((a, b) => {
    const fa = String(rulesets[a].effectiveFrom || "");
    const fb = String(rulesets[b].effectiveFrom || "");
    return fa < fb ? -1 : fa > fb ? 1 : a.localeCompare(b);
  });
}

function versionsCrossed(rulesets, fromVersion, toVersion) {
  const order = orderedVersions(rulesets);
  const i = order.indexOf(fromVersion);
  const j = order.indexOf(toVersion);
  if (i === -1 || j === -1 || j <= i) return [toVersion];
  return order.slice(i + 1, j + 1);
}

function suppressingVersion(rulesets, fromVersion, toVersion) {
  return (
    versionsCrossed(rulesets, fromVersion, toVersion).find(
      (v) => rulesets[v] && KINDS[rulesets[v].kind] && KINDS[rulesets[v].kind].suppressesMovement
    ) || null
  );
}


// ---- Logging --------------------------------------------------------------
function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}
function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "import-ranked-boards", ...event };
  const line = JSON.stringify(entry);
  console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, "import-ranked-boards.log"), line + "\n");
}
function fail(reason, message, exitCode) {
  log({ status: "failure", reason, message });
  process.exit(exitCode);
}

// ---- CSV ------------------------------------------------------------------
function parseCsvRows(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && next === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

function readCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const parsed = parseCsvRows(raw);
  if (parsed.length < 2) return { header: [], rows: [] };
  const header = parsed[0].map((h) => h.trim());
  const rows = parsed.slice(1).map((cols) => {
    const row = {};
    header.forEach((k, i) => { row[k] = cols[i] !== undefined ? cols[i].trim() : ""; });
    return row;
  });
  return { header, rows };
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) fail("missing_file", `${label} not found at ${filePath}`, 1);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^﻿/, ""));
  } catch (err) {
    fail("bad_json", `Could not parse ${label}: ${err.message}`, 1);
  }
}

// An empty cell is null, never 0 — the same rule the community importer holds.
function num(v) {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ---- Declarations ---------------------------------------------------------
function loadDeclarations(inputDir) {
  const p = path.join(inputDir, BOARDS_DECL);
  if (!fs.existsSync(p)) return [];
  const doc = readJson(p, BOARDS_DECL);
  const boards = Array.isArray(doc.boards) ? doc.boards : [];

  const seen = new Set();
  boards.forEach((b, i) => {
    ["boardId", "title", "track", "entityType", "filePrefix", "labelColumn", "scoreColumn"].forEach((f) => {
      if (!b[f]) fail("bad_declaration", `${BOARDS_DECL}: board ${i} is missing "${f}".`, 1);
    });
    if (!TRACKS.includes(b.track)) {
      fail("unknown_track", `${BOARDS_DECL}: board "${b.boardId}" has track "${b.track}". Expected one of: ${TRACKS.join(", ")}`, 1);
    }
    if (seen.has(b.boardId)) fail("duplicate_board", `${BOARDS_DECL}: boardId "${b.boardId}" declared twice.`, 1);
    seen.add(b.boardId);
  });

  return boards;
}

/* Exports for a board are matched by filename prefix and ordered by the date in
   the name. Reading the round from the name rather than file mtime keeps the
   replay deterministic — a file copied or restored keeps its round. */
function listBoardExports(inputDir, decl) {
  const dir = path.join(inputDir, BOARDS_SUBDIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".csv") && f.startsWith(decl.filePrefix))
    .map((f) => {
      const m = DATE_IN_NAME.exec(f);
      if (!m) {
        fail("undated_export", `${BOARDS_SUBDIR}/${f}: no YYYY-MM-DD date in the filename, so it cannot be placed in the replay.`, 1);
      }
      return { fileName: f, filePath: path.join(dir, f), date: m[1] };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.fileName.localeCompare(b.fileName)));
}

// ---- Movement -------------------------------------------------------------
/* What a board matches on between rounds. A declared idColumn wins, because a
   display label is not an identity: a startup rebrands on exactly the round its
   rank moves most, and matching on the label would read that as one entity
   leaving and another arriving — resetting a standing with no error and no
   trace. owner/repo needs none of this; a company name does. Normalised, so a
   casing or spacing change in the export cannot silently break the chain. */
function keyFor(row, decl) {
  const raw = decl.idColumn ? row[decl.idColumn] : row[decl.labelColumn];
  return String(raw || "").trim().toLowerCase();
}

function movementFor(key, rank, previous, seenEver) {
  if (!previous) return null;
  const prev = previous.get(key);
  if (prev === undefined) return seenEver.has(key) ? { state: "returning" } : { state: "new" };
  if (prev === rank) return { state: "hold", delta: 0 };
  return prev > rank ? { state: "up", delta: prev - rank } : { state: "down", delta: rank - prev };
}

// ---- Board building -------------------------------------------------------
function rankMapFor(rows, decl) {
  const m = new Map();
  rows.forEach((r) => {
    const key = keyFor(r, decl);
    const rank = num(r.Position);
    if (key && rank !== null) m.set(key, rank);
  });
  return m;
}

function buildBoard(decl, exportInfo, rows, previous, seenEver, config, versionInfo, roundIndex) {
  const entries = rows
    .map((r) => {
      const name = String(r[decl.labelColumn] || "").trim();
      const rank = num(r.Position);
      if (!name || rank === null) return null;

      const fields = {};
      (decl.fields || []).forEach((f) => {
        const v = r[f];
        if (v !== undefined && v !== "") fields[f] = num(v) === null ? v : num(v);
      });

      const key = keyFor(r, decl);
      const entry = { rank, entityId: key, name, score: num(r[decl.scoreColumn]), fields };
      const mv = versionInfo.suppressMovement ? null : movementFor(key, rank, previous, seenEver);
      if (mv) entry.movement = mv;
      return entry;
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank);

  const boundaryNote = versionInfo.suppressMovement
    ? ` Movement is not shown for this round: ${versionInfo.suppressedBy} changed the scoring rules between ${versionInfo.previousVersion} and ${versionInfo.version}, so positions either side were produced under different rules.`
    : "";

  return {
    boardId: decl.boardId,
    title: decl.title,
    subtitle: `${decl.blurb ? decl.blurb + " " : ""}Round ${roundIndex} · ${exportInfo.date}.${boundaryNote}`,
    track: decl.track,
    entityType: decl.entityType,
    seasonId: decl.seasonId || config.seasonId,
    throughRound: exportInfo.date,
    rulesetVersion: versionInfo.version,
    rulesetSource: versionInfo.stamped ? "export" : "config-fallback",
    rulesetChanged: versionInfo.changed
      ? { from: versionInfo.previousVersion, to: versionInfo.version, kind: versionInfo.kind, movementSuppressed: versionInfo.suppressMovement, suppressedBy: versionInfo.suppressedBy || null }
      : null,
    promptVersion: null,
    generatedAt: new Date(`${exportInfo.date}T00:00:00.000Z`).toISOString(),
    capture: {
      complete: true,
      method: "ledger-export",
      source: `${BOARDS_SUBDIR}/${exportInfo.fileName}`,
      note: "Values computed by the source Ledger and exported verbatim. Rank is the export's own Position column; nothing is recomputed here.",
    },
    eligibility: null,
    columns: decl.columns && decl.columns.length ? decl.columns : ["rank", "name", "score", "movement"],
    cardLimit: typeof decl.cardLimit === "number" ? decl.cardLimit : config.cardLimit || 10,
    priority: typeof decl.priority === "number" ? decl.priority : 0,
    featured: decl.featured === true,
    entries,
  };
}

function versionOfRound(rows, header, config, fileName, rulesets) {
  const stamped = header.includes("AppVersion") ? String(rows[0].AppVersion || "").trim() : "";
  let version = null;
  const tried = [];
  if (stamped) {
    const prefix = config.rulesetPrefix || "";
    const candidates = prefix ? [stamped, `${prefix}-${stamped}`] : [stamped];
    candidates.forEach((c) => tried.push(c));
    version = candidates.find((c) => rulesets[c]) || null;
  } else {
    tried.push(config.rulesetVersion);
    version = rulesets[config.rulesetVersion] ? config.rulesetVersion : null;
  }
  if (!version) {
    fail(
      "undeclared_ruleset",
      `${fileName}: ruleset not declared in ${RULESETS_FILENAME} — tried ${tried.map((t) => `"${t}"`).join(" and ")}.`,
      1
    );
  }
  return { version, stamped: Boolean(stamped) };
}

// ---- Main -----------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const inputFlag = args.indexOf("--input");
  const inputDir = inputFlag !== -1 && args[inputFlag + 1] ? path.resolve(args[inputFlag + 1]) : DEFAULT_INPUT_DIR;

  log({ status: "start", inputDir });

  const declarations = loadDeclarations(inputDir);
  if (declarations.length === 0) {
    log({
      status: "info",
      message:
        `No ${BOARDS_DECL} declarations found in ${inputDir} — nothing to import. Declare a board there and put its ` +
        `dated exports in ${BOARDS_SUBDIR}/ to publish it.`,
    });
    process.exit(0);
  }

  const config = readJson(path.join(inputDir, CONFIG_FILENAME), CONFIG_FILENAME);
  const rulesets = (readJson(path.join(inputDir, RULESETS_FILENAME), RULESETS_FILENAME) || {}).rulesets || {};

  if (!fs.existsSync(STANDINGS_DIR)) fs.mkdirSync(STANDINGS_DIR, { recursive: true });

  let written = 0;

  declarations.forEach((decl) => {
    const exports_ = listBoardExports(inputDir, decl);
    if (exports_.length === 0) {
      log({
        status: "warning",
        boardId: decl.boardId,
        message: `No exports matching prefix "${decl.filePrefix}" in ${BOARDS_SUBDIR}/ — board not published this run.`,
      });
      return;
    }

    let previous = null;
    let previousVersion = null;
    const seenEver = new Set();
    let finalBoard = null;

    exports_.forEach((exportInfo, i) => {
      const { header, rows } = readCsv(exportInfo.filePath);
      if (rows.length === 0) fail("empty_export", `${exportInfo.fileName}: no data rows.`, 1);

      ["Position", decl.labelColumn, decl.scoreColumn, decl.idColumn].filter(Boolean).forEach((c) => {
        if (!header.includes(c)) {
          fail(
            "unexpected_shape",
            `${exportInfo.fileName}: no "${c}" column. The declaration for "${decl.boardId}" expects Position, ` +
              `"${decl.labelColumn}" and "${decl.scoreColumn}". Header is: ${header.join(", ")}`,
            1
          );
        }
      });

      const { version, stamped } = versionOfRound(rows, header, config, exportInfo.fileName, rulesets);
      const changed = previousVersion !== null && previousVersion !== version;
      const kind = changed ? rulesets[version].kind : null;
      const suppressedBy = changed ? suppressingVersion(rulesets, previousVersion, version) : null;
      const suppressMovement = Boolean(suppressedBy);
      const versionInfo = { version, stamped, changed, previousVersion, kind, suppressMovement, suppressedBy };

      const isLast = i === exports_.length - 1;
      if (isLast) {
        finalBoard = buildBoard(decl, exportInfo, rows, previous, seenEver, config, versionInfo, i + 1);
      }

      rows.forEach((r) => {
        const k = keyFor(r, decl);
        if (k) seenEver.add(k);
      });
      previous = rankMapFor(rows, decl);
      previousVersion = version;
    });

    if (finalBoard) {
      const outPath = path.join(STANDINGS_DIR, `${decl.boardId}.json`);
      fs.writeFileSync(outPath, JSON.stringify(finalBoard, null, 2), "utf8");
      written++;
      log({
        status: "info",
        boardId: decl.boardId,
        message: `Wrote ${path.basename(outPath)} — ${finalBoard.entries.length} entr(ies) from ${exports_.length} round(s)`,
        ruleset: finalBoard.rulesetVersion,
      });
    }
  });

  log({
    status: "success",
    message:
      `Imported ${written} of ${declarations.length} declared board(s).` +
      (written === 0 ? " Put dated exports in boards/ matching each declaration's filePrefix." : ""),
  });
  process.exit(0);
}

try {
  main();
} catch (err) {
  log({ status: "failure", reason: "unhandled_error", message: err.message });
  process.exit(1);
}
