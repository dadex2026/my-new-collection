#!/usr/bin/env node
/**
 * scripts/import-community-boards.js
 *
 * Turns Handle Leaderboard exports from a Ledger app (Entertainment Ledger,
 * Sports Ledger — same board shape) into standings boards.
 *
 * WHY AN IMPORTER RATHER THAN A REIMPLEMENTATION:
 *   The Ledger apps already compute every value and export it. Their own
 *   calculations reference is explicit that "nothing is recomputed on the
 *   export path, and nothing downstream needs to reimplement any formula".
 *   So this script reimplements no scoring. Closeness, difficulty, bet
 *   adjustment, engagement, edge and totals arrive settled; the Ledger stays
 *   the calculation engine and this project is the publication layer. That
 *   makes divergence impossible rather than merely unlikely.
 *
 *   Two things it does compute, both ordering rather than scoring:
 *     - Competition ranks (1, 2, 2, 4) for the three sorts the export does not
 *       already order. Position in the file orders Points only.
 *     - Rank movement, by replaying the dated exports in order. See below.
 *
 * MOVEMENT IS REPLAYED, NEVER REMEMBERED:
 *   Every export stays in _input/, one per round, named with its date. This
 *   script reads all of them in date order and derives movement by comparing
 *   consecutive rounds. Nothing reads a previously written board to produce the
 *   next one, so standings never drift from the inputs that made them, and the
 *   whole history recomputes from the repository alone.
 *
 *   A first round therefore shows every handle as `new`, which is correct: there
 *   is no earlier position to move from. Arrows appear from the second export on.
 *
 * FOUR BOARDS, ONE EXPORT:
 *   Points, Edge, Average per pick and Hit rate are all columns in the same
 *   file. Points is volume-dependent; the other three are not, so they rank
 *   quite differently and are published as separate boards rather than folded
 *   into one number.
 *
 * PROVISIONAL HANDLES:
 *   The Ledger marks a handle with fewer than `minPicks` settled predictions as
 *   provisional, and sinks it to the bottom of every *skill-based* sort — not
 *   the Points sort. That ordering rule is reproduced here for the three skill
 *   boards, since the export gives the flag but not the resulting order.
 *
 * NULL IS NOT ZERO:
 *   An empty Edge means no consensus existed to compare against. Those handles
 *   are left off the Edge board entirely rather than ranked as zero, and the
 *   count of omissions is recorded on the board.
 *
 * Exit codes:
 *   0 = success
 *   1 = validation failure
 *
 * Usage:
 *   node scripts/import-community-boards.js
 *   node scripts/import-community-boards.js --input ../some/other/dir
 */
"use strict";

const fs = require("fs");
const path = require("path");

// ---- Paths ----------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const STANDINGS_DIR = path.join(BACKEND_DIR, "standings");
const DEFAULT_INPUT_DIR = path.join(STANDINGS_DIR, "_input");
const CONFIG_FILENAME = "import-config.json";
const RULESETS_FILENAME = "rulesets.json";
const ROWS_SUBDIR = "rows";

// The row layer. Required columns are the ones evidence cannot be built
// without; EffectiveActual and CountsTowardRanking arrived in Ledger v1.4, so
// an older export is refused with an instruction rather than silently producing
// evidence that says TBD next to a scored prediction.
const ROW_REQUIRED_COLUMNS = [
  "Handle",
  "Category",
  "Type",
  "Prediction",
  "EffectiveActual",
  "Date",
  "Url",
  "TotalPoints",
  "Pending",
  "Late",
  "CountsTowardRanking",
];

// Declared ruleset kinds, and whether crossing into one makes positions either
// side of the boundary incomparable.
const KINDS = {
  "baseline": { suppressesMovement: false, meaning: "First version imported here." },
  "rule-change": { suppressesMovement: true, meaning: "A new rule. Applies forward; earlier rounds keep their scoring and are never restated." },
  "bug-fix": { suppressesMovement: false, meaning: "Restores what the stated rules always meant. History recomputes and republishes as a correction." },
  "export-only": { suppressesMovement: false, meaning: "Changed what the export carries, not how anything is scored." },
};

/* A round can skip a version. If one round was produced by v1.2 and the next by
   v1.4, the boundary spans v1.3 — and if v1.3 was a rule-change, movement across
   that boundary measures the rule change even though neither endpoint is one.
   Suppression therefore asks about the whole interval, not just the version that
   arrived. Ordered by effective date so "between" means what a reader means by
   it, with the id as a tiebreak so the order is total. */
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

/* Returns the first version in the interval that suppresses movement, or null.
   Naming it lets the published board say which rule change is responsible
   rather than only naming the two endpoints, one of which may be innocent. */
function suppressingVersion(rulesets, fromVersion, toVersion) {
  return (
    versionsCrossed(rulesets, fromVersion, toVersion).find(
      (v) => rulesets[v] && KINDS[rulesets[v].kind] && KINDS[rulesets[v].kind].suppressesMovement
    ) || null
  );
}

const LOGS_DIR = path.join(BACKEND_DIR, "logs");

// ---- Expected export shape ------------------------------------------------
// The header the Ledger's Handle Leaderboard export writes. Matched loosely:
// every one of these must be present, extra columns are carried into `fields`.
const REQUIRED_COLUMNS = [
  "Position",
  "Handle",
  "Points",
  "Edge",
  "AvgPerPick",
  "HitRatePct",
  "Hits",
  "Resolved",
  "Provisional",
];

// The four sorts. `skillBased` drives the provisional-sinks rule; `higherIsBetter`
// is true throughout — every one of these reads better when larger.
const SORTS = [
  {
    key: "points",
    column: "Points",
    title: "Points",
    skillBased: false,
    blurb: "Total points across every prediction — rewards accuracy and volume together.",
  },
  {
    key: "edge",
    column: "Edge",
    title: "Skill Edge",
    skillBased: true,
    blurb: "Pick quality measured against the crowd's consensus, independent of bet size and volume.",
  },
  {
    key: "avg",
    column: "AvgPerPick",
    title: "Average Per Pick",
    skillBased: true,
    blurb: "Prediction points divided by settled picks. Excludes engagement points.",
  },
  {
    key: "hitrate",
    column: "HitRatePct",
    title: "Hit Rate",
    skillBased: true,
    blurb: "Share of settled predictions that landed within the hit threshold.",
  },
];

// ---- Logging --------------------------------------------------------------
function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}
function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "import-community-boards", ...event };
  const line = JSON.stringify(entry);
  console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, "import-community-boards.log"), line + "\n");
}
function fail(reason, message, exitCode) {
  log({ status: "failure", reason, message });
  process.exit(exitCode);
}

// ---- Quote-aware CSV parser ----------------------------------------------
// Same parser as generate-content-registry.js, for the same reason: a contest
// label ("NFL - Cowboys vs Eagles - Total") routinely contains characters a
// naive split would shear on.
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
  // Strip a UTF-8 BOM if one survived the trip out of the browser — JSON.parse
  // and header matching both choke on it, and it is invisible in an editor.
  const raw = fs.readFileSync(filePath, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const parsed = parseCsvRows(raw);
  if (parsed.length < 2) return { header: [], rows: [] };
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

// ---- Column mapping -------------------------------------------------------
/* The Ledgers agree on the board's SHAPE but not on its labels. Sports writes
   FinalPoints, SkillEdge and Predictions where Entertainment writes Points,
   Edge and Resolved. Without translation a Sports export is simply refused —
   honest, but useless.

   Rather than teach every function about both vocabularies, rows are renamed to
   logical names once at read time. Everything downstream then reads one
   vocabulary, and supporting a third source becomes a config entry rather than
   a code change.

   Additive, never destructive: the original headers stay on the row, so a
   column that happens to share a name with a logical one is not clobbered. */
function applyColumnMap(parsed, columnMap) {
  const pairs = Object.entries(columnMap || {});
  if (!pairs.length) return parsed;

  const header = parsed.header.slice();
  pairs.forEach(([logical, actual]) => {
    if (parsed.header.includes(actual) && !header.includes(logical)) header.push(logical);
  });

  const rows = parsed.rows.map((r) => {
    const copy = { ...r };
    pairs.forEach(([logical, actual]) => {
      if (actual in r && !(logical in r)) copy[logical] = r[actual];
    });
    return copy;
  });

  return { header, rows };
}

// ---- Value parsing --------------------------------------------------------
// An empty cell is null, never 0. The Ledger writes an empty Edge to mean "no
// consensus existed to compare against", and scoring that as zero would invent
// a comparison that never happened.
function num(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}
function bool(value) {
  return String(value).trim().toLowerCase() === "yes";
}

// ---- Input discovery ------------------------------------------------------
// The round key is the date in the filename, which is how the Ledger names its
// dated exports. Reading it from the name rather than from file mtime keeps the
// replay deterministic — a file copied or restored keeps its round.
const DATE_IN_NAME = /(\d{4}-\d{2}-\d{2})/;

function listExports(inputDir) {
  if (!fs.existsSync(inputDir)) return [];
  return fs
    .readdirSync(inputDir)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .map((f) => {
      const match = DATE_IN_NAME.exec(f);
      if (!match) {
        fail(
          "undated_export",
          `${f}: no YYYY-MM-DD date in the filename. Rounds are ordered by that date, so an undated ` +
            `export cannot be placed in the replay. Rename it to match the Ledger's dated export name.`,
          1
        );
      }
      return { fileName: f, filePath: path.join(inputDir, f), date: match[1] };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.fileName.localeCompare(b.fileName)));
}

function loadConfig(inputDir) {
  const configPath = path.join(inputDir, CONFIG_FILENAME);
  if (!fs.existsSync(configPath)) {
    fail(
      "missing_config",
      `No ${CONFIG_FILENAME} in ${inputDir}. It names the collection, season and source app so a board ` +
        `can state which rules produced it. See standings/README.md.`,
      1
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^﻿/, ""));
  } catch (err) {
    fail("bad_config", `Could not parse ${configPath}: ${err.message}`, 1);
  }
  for (const field of ["collectionTitle", "seasonId", "rulesetVersion"]) {
    if (!parsed[field]) fail("missing_config_field", `${CONFIG_FILENAME} is missing "${field}".`, 1);
  }
  return parsed;
}

// Every version that has produced an export here must be declared. An
// undeclared build is refused rather than stamped with the config's fallback,
// because "which rules produced this number" is exactly the question a
// published standing has to be able to answer.
function loadRulesets(inputDir) {
  const rulesetsPath = path.join(inputDir, RULESETS_FILENAME);
  if (!fs.existsSync(rulesetsPath)) {
    fail(
      "missing_rulesets",
      `No ${RULESETS_FILENAME} in ${inputDir}. It declares each ruleset version and whether a change to it ` +
        `was a rule change (forward-only) or a bug fix (restates history). See standings/README.md.`,
      1
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(rulesetsPath, "utf8").replace(/^﻿/, ""));
  } catch (err) {
    fail("bad_rulesets", `Could not parse ${rulesetsPath}: ${err.message}`, 1);
  }
  if (!parsed.rulesets || typeof parsed.rulesets !== "object") {
    fail("bad_rulesets", `${RULESETS_FILENAME} has no "rulesets" object.`, 1);
  }

  // Only a rule change makes positions either side of it incomparable. A bug
  // fix restores what the rules always meant; an export-only or baseline
  // version did not touch scoring at all. An unrecognised kind fails rather
  // than defaulting, because either default is wrong half the time — silently
  // dropping real movement, or silently publishing a meaningless delta.
  Object.keys(parsed.rulesets).forEach((id) => {
    const kind = parsed.rulesets[id].kind;
    if (!KINDS.hasOwnProperty(kind)) {
      fail(
        "unknown_ruleset_kind",
        `${RULESETS_FILENAME}: ruleset "${id}" has kind "${kind}". Expected one of: ${Object.keys(KINDS).join(", ")}.`,
        1
      );
    }
  });

  return parsed.rulesets;
}

// The export stamps its own build (AppVersion column, added in the Ledger at the
// single boundary every export passes through). Older exports predate the stamp,
// so the config value stands in — which is why it is still required.
function versionOfRound(rows, header, config, fileName, rulesets) {
  const stamped = header.includes("AppVersion")
    ? String(rows[0].AppVersion || "").trim()
    : "";

  // The Ledger stamps its own build ("v1.3"), which is the right name inside
  // that app but ambiguous here — two source apps could both reach v1.3. The
  // collection qualifies it with rulesetPrefix to produce a ruleset id that
  // means one thing globally. An already-qualified stamp is accepted as-is, so
  // a Ledger that later stamps its full name needs no change here.
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
      `${fileName}: ruleset not declared in ${RULESETS_FILENAME} — tried ${tried.map((t) => `"${t}"`).join(" and ")}. ` +
        `Add it, stating whether the change was a "rule-change" (applies forward, past rounds keep their scoring) ` +
        `or a "bug-fix" (history is recomputed and republished as a correction).`,
      1
    );
  }

  if (stamped && header.includes("AppVersion")) {
    const disagreeing = rows.filter((r) => String(r.AppVersion || "").trim() !== stamped);
    if (disagreeing.length) {
      fail(
        "mixed_versions",
        `${fileName}: rows carry more than one AppVersion (${stamped} and ${String(disagreeing[0].AppVersion).trim()}). ` +
          `One export is one build; a file mixing them was assembled by hand and cannot be attributed.`,
        1
      );
    }
  }

  return { version, stamped: Boolean(stamped) };
}

// ---- Evidence (the row layer) ---------------------------------------------
/* A board says a handle scored 990. The row layer says which predictions made
   up that 990 and links each to the post it came from, so a reader can check the
   claim instead of trusting it. That is the difference between publishing a
   ranking and publishing a verifiable one.

   Rows that did NOT count are carried through and flagged rather than dropped —
   an out-of-window prediction with real points is part of the record, and
   hiding it would make the evidence look complete when it isn't.

   The board export is a round snapshot; the row layer describes the ledger as it
   stood when exported. They are separate files taken at separate moments, so
   agreement is verified rather than assumed — see reconcile() below. */
function loadEvidence(inputDir, config) {
  const rowsDir = path.join(inputDir, ROWS_SUBDIR);
  if (!fs.existsSync(rowsDir)) return null;

  const files = fs
    .readdirSync(rowsDir)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .map((f) => {
      const match = DATE_IN_NAME.exec(f);
      if (!match) fail("undated_rows", `${ROWS_SUBDIR}/${f}: no YYYY-MM-DD date in the filename.`, 1);
      return { fileName: f, filePath: path.join(rowsDir, f), date: match[1] };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.fileName.localeCompare(b.fileName)));

  if (files.length === 0) return null;

  // Only the most recent row export is used. Earlier ones stay for the record
  // but describe a state that has since moved on.
  const latest = files[files.length - 1];
  const { header, rows } = applyColumnMap(readCsv(latest.filePath), config.columnMap);

  const missing = ROW_REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) {
    fail(
      "rows_too_old",
      `${ROWS_SUBDIR}/${latest.fileName}: missing column(s) ${missing.join(", ")}. ` +
        `EffectiveActual and CountsTowardRanking arrived in Ledger v1.4 — re-export the Community Entries ` +
        `row layer from v1.4 or later. Without them the evidence would show "TBD" beside settled ` +
        `predictions and give no reason for rows the board excludes.`,
      1
    );
  }

  const byHandle = new Map();
  rows.forEach((r) => {
    const handle = String(r.Handle || "").trim();
    if (!handle) return;
    if (!byHandle.has(handle)) byHandle.set(handle, []);
    byHandle.get(handle).push({
      category: r.Category,
      type: r.Type,
      prediction: r.Prediction,
      actual: r.EffectiveActual || null,
      actualStatedOnRow: r.Actual || null,
      date: r.Date,
      url: r.Url || null,
      bet: num(r.Bet),
      closeness: num(r.Closeness),
      difficulty: num(r.Difficulty),
      initialScore: num(r.InitialScore),
      betAdj: num(r.BetAdj),
      engagement: num(r.EngagementPoints),
      total: num(r.TotalPoints),
      edge: num(r.Edge),
      pending: r.Pending === "yes",
      late: r.Late === "yes",
      counts: r.CountsTowardRanking === "yes",
      settledBy: r.SettledBy || null,
      excludedReason:
        r.CountsTowardRanking === "yes" ? null : "Outside the ranking window — exported for the record, not ranked.",
    });
  });

  return { fileName: latest.fileName, date: latest.date, rowCount: rows.length, byHandle };
}

/* The published breakdown must add up to the published total. If it does not,
   the two exports were taken from different states of the ledger and one of
   them is stale — which would put a rank next to a list of predictions that
   cannot produce it. Refused rather than published. */
function reconcile(pointsBoard, evidence, config) {
  const mismatches = [];
  pointsBoard.entries.forEach((entry) => {
    const rows = evidence.byHandle.get(entry.name) || [];
    const summed = rows.filter((r) => r.counts).reduce((acc, r) => acc + (r.total || 0), 0);
    if (Math.abs(summed - entry.score) > 0.02) {
      mismatches.push({ handle: entry.name, board: entry.score, rows: Math.round(summed * 100) / 100 });
    }
  });

  if (mismatches.length) {
    fail(
      "evidence_mismatch",
      `The row layer does not reconcile with the board for ${mismatches.length} handle(s): ` +
        mismatches.map((m) => `${m.handle} board=${m.board} rows=${m.rows}`).join("; ") +
        `. The two exports were taken from different states of the ledger. Re-export both from the same ` +
        `build at the same time and re-run.`,
      1
    );
  }

  // Handles present in the rows but absent from every board — their predictions
  // exist but none counted. Recorded so the omission is explained rather than
  // simply invisible.
  const ranked = new Set(pointsBoard.entries.map((e) => e.name));
  const unranked = [];
  evidence.byHandle.forEach((rows, handle) => {
    if (ranked.has(handle)) return;
    unranked.push({
      handle,
      predictions: rows.length,
      countingPredictions: rows.filter((r) => r.counts).length,
      reason: rows.some((r) => r.counts)
        ? `Below the ${config.minPicks || "minimum"} settled predictions needed to rank.`
        : "Every prediction is outside the ranking window.",
    });
  });

  return { checked: pointsBoard.entries.length, matched: true, unranked };
}

function attachEvidence(board, evidence) {
  board.entries.forEach((entry) => {
    const rows = evidence.byHandle.get(entry.name) || [];
    entry.evidence = {
      predictions: rows,
      counting: rows.filter((r) => r.counts).length,
      excluded: rows.filter((r) => !r.counts).length,
      pending: rows.filter((r) => r.pending).length,
      late: rows.filter((r) => r.late).length,
    };
  });
}

// ---- Ranking --------------------------------------------------------------
// Competition ranking: 1, 2, 2, 4. Ties share a position and the next position
// skips, matching how the Ledger itself ranks.
function assignCompetitionRanks(sorted, valueOf) {
  let lastValue = null;
  let lastRank = 0;
  return sorted.map((row, i) => {
    const value = valueOf(row);
    let rank;
    if (lastValue !== null && value === lastValue) {
      rank = lastRank;
    } else {
      rank = i + 1;
      lastValue = value;
      lastRank = rank;
    }
    return { row, rank };
  });
}

// Sorting is stable on handle so an unchanged input always produces an
// identical board — two handles tied on every value must not swap places
// between runs and register as movement.
function orderForSort(rows, sort) {
  const eligible = rows.filter((r) => num(r[sort.column]) !== null);
  const omitted = rows.length - eligible.length;

  const ranked = eligible.slice().sort((a, b) => {
    if (sort.skillBased) {
      const ap = bool(a.Provisional) ? 1 : 0;
      const bp = bool(b.Provisional) ? 1 : 0;
      if (ap !== bp) return ap - bp;
    }
    const av = num(a[sort.column]);
    const bv = num(b[sort.column]);
    if (av !== bv) return bv - av;
    return String(a.Handle).localeCompare(String(b.Handle));
  });

  return { ranked, omitted };
}

/* The identity a participant is matched on between rounds. X handles are
   case-insensitive, so @PopCritic and @popcritic are one account — keying on
   the raw string would make them two competitors, each with half a history.
   The display name keeps its original casing; only the key is normalised. */
function handleKey(v) {
  return String(v == null ? "" : v).trim().toLowerCase();
}

// ---- Movement -------------------------------------------------------------
// Derived by comparing this round's ranking to the previous round's, both
// computed in the same replay. A handle absent from the previous round is
// `new`; one that reappears after missing a round is `returning`. Neither gets
// a delta, because there is no honest number to put on it.
function movementFor(handle, rank, previousRanks, seenEver) {
  if (!previousRanks) return null;
  const prev = previousRanks.get(handle);
  if (prev === undefined) {
    return seenEver.has(handle) ? { state: "returning" } : { state: "new" };
  }
  if (prev === rank) return { state: "hold", delta: 0 };
  return prev > rank ? { state: "up", delta: prev - rank } : { state: "down", delta: rank - prev };
}

/* A rename is indistinguishable from a departure plus an arrival: the export
   carries no identifier, so nothing here can tell them apart. What it can do is
   say that both happened in the same round — the moment an operator can still
   recognise @old as @new, before the reset is buried in history.

   Silence is what made this a bug rather than a limitation. A standing that
   resets because someone renamed looks exactly like a standing that legitimately
   restarted, and no arrow, count or total anywhere says which it was. */
function reportChurn(previousKeys, keysThisRound, displayByKey, roundIndex) {
  if (!previousKeys) return;
  const left = [...previousKeys].filter((k) => !keysThisRound.has(k));
  const arrived = [...keysThisRound].filter((k) => !previousKeys.has(k));
  if (!left.length || !arrived.length) return;

  const name = (k) => displayByKey.get(k) || k;
  // Named while the list is short enough to read; on a large board the counts
  // are the signal and a wall of handles would bury it.
  const list = (ks) => (ks.length <= 10 ? ` (${ks.map(name).join(", ")})` : "");

  log({
    status: "warning",
    message:
      `Round ${roundIndex}: ${left.length} participant(s) left the board${list(left)} and ` +
      `${arrived.length} arrived${list(arrived)}. If any of those is one person under a new handle, ` +
      `their movement has reset — the export cannot tell a rename from a departure.`,
    left: left.map(name),
    arrived: arrived.map(name),
  });
}

// ---- Board construction ---------------------------------------------------
function buildBoard(sort, exportInfo, ranked, omitted, previousRanks, seenEver, config, roundIndex, versionInfo) {
  const entries = ranked.map(({ row, rank }) => {
    const handle = String(row.Handle).trim();
    const entry = {
      rank,
      entityId: handleKey(handle),
      name: handle,
      score: num(row[sort.column]),
      entries: num(row.Resolved),
      fields: {
        hits: num(row.Hits),
        hitRate: num(row.HitRatePct) === null ? "" : `${num(row.HitRatePct)}%`,
        avgDifficulty: num(row.AvgDifficulty),
        contrarian: num(row.Contrarian),
        pending: num(row.Pending),
        late: num(row.Late),
        provisional: bool(row.Provisional) ? "PROV" : "",
      },
    };
    // Movement is omitted entirely across a rule-change boundary. A delta
    // spanning two rulesets measures the rule change as much as the
    // participant, and a blank cell with an explanation on the board is more
    // honest than an arrow nobody can interpret.
    const movement = versionInfo.suppressMovement ? null : movementFor(handleKey(handle), rank, previousRanks, seenEver);
    if (movement) entry.movement = movement;
    return entry;
  });

  const columns = sort.key === "points"
    ? ["rank", "name", "score", "hitRate", "entries", "movement"]
    : ["rank", "name", "score", "entries", "provisional", "movement"];

  const boundaryNote = versionInfo.suppressMovement
    ? ` Movement is not shown for this round: ${versionInfo.suppressedBy} changed the scoring rules between ${versionInfo.previousVersion} and ${versionInfo.version}, so positions either side were produced under different rules.`
    : "";

  return {
    boardId: `community-${sort.key}`,
    title: `${config.collectionTitle} · ${sort.title}`,
    subtitle: `${sort.blurb} Round ${roundIndex} · ${exportInfo.date}.${boundaryNote}`,
    track: "prediction",
    entityType: "participant",
    seasonId: config.seasonId,
    throughRound: exportInfo.date,
    rulesetVersion: versionInfo.version,
    rulesetSource: versionInfo.stamped ? "export" : "config-fallback",
    rulesetChanged: versionInfo.changed
      ? { from: versionInfo.previousVersion, to: versionInfo.version, kind: versionInfo.kind, movementSuppressed: versionInfo.suppressMovement, suppressedBy: versionInfo.suppressedBy || null }
      : null,
    promptVersion: config.promptVersion || null,
    generatedAt: new Date(`${exportInfo.date}T00:00:00.000Z`).toISOString(),
    capture: {
      complete: true,
      method: "ledger-export",
      source: exportInfo.fileName,
      note: "Values computed by the source Ledger and exported verbatim. Nothing is recomputed here.",
    },
    eligibility: {
      minPicks: config.minPicks || null,
      note: sort.skillBased
        ? "Provisional handles (below minPicks settled predictions) sort to the bottom of this board."
        : "Provisional handles are ranked normally on this board — the rule applies to skill-based sorts only.",
      omittedNoValue: omitted,
      omittedReason: omitted > 0 ? `${omitted} handle(s) had no value for ${sort.column} and are not ranked here.` : null,
    },
    columns,
    cardLimit: config.cardLimit || 10,
    priority: sort.key === "points" ? 20 : 10,
    featured: false,
    entries,
  };
}

// ---- Main -----------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const inputFlag = args.indexOf("--input");
  const inputDir = inputFlag !== -1 && args[inputFlag + 1] ? path.resolve(args[inputFlag + 1]) : DEFAULT_INPUT_DIR;

  log({ status: "start", inputDir, standingsDir: STANDINGS_DIR });

  const config = loadConfig(inputDir);
  const rulesets = loadRulesets(inputDir);
  const exports_ = listExports(inputDir);

  if (exports_.length === 0) {
    fail(
      "no_exports",
      `No dated .csv exports found in ${inputDir}. Export the Handle Leaderboard from the Ledger and place ` +
        `it here, keeping its dated filename.`,
      1
    );
  }

  // Replay every round in date order. Only the last round's boards are written,
  // but the earlier rounds have to be computed to know where each handle stood.
  const previousBySort = new Map();
  const seenEver = new Set();
  const displayByKey = new Map();
  let previousKeys = null;
  let previousVersion = null;
  let finalBoards = [];

  exports_.forEach((exportInfo, i) => {
    const { header, rows } = applyColumnMap(readCsv(exportInfo.filePath), config.columnMap);
    if (rows.length === 0) {
      fail("empty_export", `${exportInfo.fileName}: no data rows.`, 1);
    }
    const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
    if (missing.length) {
      fail(
        "unexpected_shape",
        `${exportInfo.fileName}: missing expected column(s) ${missing.join(", ")}. This importer targets the ` +
          `Handle Leaderboard export; a row-layer or per-dataset export has a different shape.`,
        1
      );
    }

    const { version, stamped } = versionOfRound(rows, header, config, exportInfo.fileName, rulesets);
    const changed = previousVersion !== null && previousVersion !== version;
    const kind = changed ? rulesets[version].kind : null;
    const suppressedBy = changed ? suppressingVersion(rulesets, previousVersion, version) : null;
    const suppressMovement = Boolean(suppressedBy);

    const versionInfo = { version, stamped, changed, previousVersion, kind, suppressMovement, suppressedBy };

    const isLast = i === exports_.length - 1;
    const roundIndex = i + 1;
    const boardsThisRound = [];
    const ranksThisRound = new Map();

    SORTS.forEach((sort) => {
      const { ranked, omitted } = orderForSort(rows, sort);
      const withRanks = assignCompetitionRanks(ranked, (r) => num(r[sort.column]));

      const rankMap = new Map();
      withRanks.forEach(({ row, rank }) => rankMap.set(handleKey(row.Handle), rank));
      ranksThisRound.set(sort.key, rankMap);

      if (isLast) {
        boardsThisRound.push(
          buildBoard(sort, exportInfo, withRanks, omitted, previousBySort.get(sort.key), seenEver, config, roundIndex, versionInfo)
        );
      }
    });

    // `seenEver` is updated only after the round is built, so a handle first
    // appearing in this round reads as `new` rather than `returning`.
    const keysThisRound = new Set();
    rows.forEach((r) => {
      const k = handleKey(r.Handle);
      keysThisRound.add(k);
      displayByKey.set(k, String(r.Handle).trim());
    });
    reportChurn(previousKeys, keysThisRound, displayByKey, roundIndex);
    previousKeys = keysThisRound;

    rows.forEach((r) => seenEver.add(handleKey(r.Handle)));
    SORTS.forEach((sort) => previousBySort.set(sort.key, ranksThisRound.get(sort.key)));
    previousVersion = version;

    log({
      status: "round",
      round: roundIndex,
      date: exportInfo.date,
      file: exportInfo.fileName,
      handles: rows.length,
      ruleset: version,
      rulesetSource: stamped ? "export" : "config-fallback",
      rulesetChanged: changed ? `${versionInfo.previousVersion} -> ${version} (${kind})` : null,
      movementSuppressed: suppressMovement,
      published: isLast,
    });

    if (changed) {
      log({
        status: "warning",
        message:
          `Ruleset changed between rounds: ${versionInfo.previousVersion} -> ${version} (${kind}). ` +
          KINDS[kind].meaning +
          (suppressMovement
            ? ` Movement is suppressed on this round: ${suppressedBy} (${rulesets[suppressedBy].kind}) falls between them. ` +
              KINDS[rulesets[suppressedBy].kind].meaning +
              " Positions either side were produced under different rules."
            : " Movement across the boundary is retained."),
      });
    }

    if (isLast) finalBoards = boardsThisRound;
  });

  // Evidence is attached after the boards are built, and only once they exist —
  // reconciliation needs a published total to check the breakdown against.
  const evidence = loadEvidence(inputDir, config);
  if (evidence) {
    const pointsBoard = finalBoards.find((b) => b.boardId === "community-points");
    if (!pointsBoard) {
      fail("no_points_board", "Evidence supplied but no points board was produced to reconcile it against.", 1);
    }
    const result = reconcile(pointsBoard, evidence, config);
    finalBoards.forEach((board) => {
      attachEvidence(board, evidence);
      board.evidenceSource = { file: `${ROWS_SUBDIR}/${evidence.fileName}`, date: evidence.date, rows: evidence.rowCount };
      board.unrankedHandles = result.unranked;
    });
    log({
      status: "info",
      message:
        `Evidence attached from ${ROWS_SUBDIR}/${evidence.fileName} — ${evidence.rowCount} prediction(s) across ` +
        `${evidence.byHandle.size} handle(s); every ranked total reconciles against its breakdown.`,
      unrankedHandles: result.unranked.map((u) => u.handle),
    });
  } else {
    log({
      status: "warning",
      message:
        `No row-layer export found in ${ROWS_SUBDIR}/. Boards publish totals with no breakdown, so a reader ` +
        `cannot check a rank. Export the Community Entries row layer to add evidence.`,
    });
  }

  if (!fs.existsSync(STANDINGS_DIR)) fs.mkdirSync(STANDINGS_DIR, { recursive: true });

  finalBoards.forEach((board) => {
    const outPath = path.join(STANDINGS_DIR, `${board.boardId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(board, null, 2), "utf8");
    log({
      status: "info",
      message: `Wrote ${path.basename(outPath)} — ${board.entries.length} entr(ies)`,
      omittedNoValue: board.eligibility.omittedNoValue,
    });
  });

  const rounds = exports_.length;
  log({
    status: "success",
    message:
      `Imported ${rounds} round(s) from ${path.basename(inputDir)}; published ${finalBoards.length} board(s) ` +
      `from ${exports_[rounds - 1].fileName}.` +
      (rounds === 1 ? " First round — every handle shows as new, since there is no earlier position to move from." : ""),
  });
  process.exit(0);
}

try {
  main();
} catch (err) {
  log({ status: "failure", reason: "unhandled_error", message: err.message });
  process.exit(1);
}
