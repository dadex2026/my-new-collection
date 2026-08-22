#!/usr/bin/env node
/**
 * scripts/generate-standings-cards.js
 *
 * The mirror image of generate-content-registry.js.
 *
 * That script publishes textcards.csv as the SIMPLE cards (NEWS, UPDATE,
 * ANNOUNCEMENT, ANALYSIS) and deliberately leaves every persistent card
 * alone, because a structured entries array doesn't fit a CSV cell. This
 * script owns the other half: it publishes backend/standings/*.json as the
 * PERSISTENT cards (RANKING, LEADERBOARD, SCOREBOARD, STANDINGS, STATS) and
 * leaves every non-persistent card alone.
 *
 * Between them the two scripts own content-registry.json completely, with no
 * overlap: this one only ever writes cards it generated (id prefix
 * STANDINGS-), and carries everything else through untouched.
 *
 * WHY A SEPARATE SOURCE OF TRUTH:
 *   The board files in backend/standings/ are the real artifact. A text card
 *   is a *projection* of a board — a summary suitable for the news grid. The
 *   full board (per-entry breakdown, provenance, version stamps) is published
 *   separately to frontend/public/standings.json so richer views, and anyone
 *   wanting to check the arithmetic, can read it directly. Never hand-edit the
 *   generated cards: edit the board and re-run.
 *
 * THIS SCRIPT DOES NOT SCORE ANYTHING.
 *   It formats boards that were already computed. Ranks, movement and scores
 *   arrive settled; nothing here can change a standing. Keeping projection
 *   free of arithmetic is what makes a published card reproducible from its
 *   board file.
 *
 * INCOMPLETE CAPTURES ARE A HARD FAILURE.
 *   A board with capture.complete === false is refused. A participant whose
 *   response was never captured is indistinguishable from one who did not play,
 *   so a partial round must never reach a published standing. Pass
 *   --allow-incomplete to override deliberately (it marks affected cards
 *   INACTIVE rather than publishing them as final).
 *
 * Exit codes:
 *   0 = success
 *   1 = validation failure
 *
 * Usage:
 *   node scripts/generate-standings-cards.js
 *   node scripts/generate-standings-cards.js --out ../frontend/public/content-registry.json
 *   node scripts/generate-standings-cards.js --allow-incomplete
 */
"use strict";

const fs = require("fs");
const path = require("path");

// ---- Paths ----------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const STANDINGS_DIR = path.join(BACKEND_DIR, "standings");
const DEFAULT_OUTPUT_PATH = path.join(BACKEND_DIR, "content-registry.json");
const FRONTEND_PUBLIC_DIR = path.join(BACKEND_DIR, "..", "frontend", "public");
const FRONTEND_PUBLIC_CARDS = path.join(FRONTEND_PUBLIC_DIR, "content-registry.json");
const FRONTEND_PUBLIC_STANDINGS = path.join(FRONTEND_PUBLIC_DIR, "standings.json");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

// ---- Schema ---------------------------------------------------------------
const STRUCTURED_CATEGORIES = ["RANKING", "LEADERBOARD", "SCOREBOARD", "STANDINGS", "STATS"];
// `subject` ranks the things being predicted about — games, races, titles,
// players — by a value the source computed. `consensus` is reserved for the
// different case of ranking those same subjects by what participants
// collectively predicted, which no source produces yet.
const TRACKS = ["subject", "consensus", "prediction", "reporting"];
const MOVEMENT_STATES = ["up", "down", "hold", "new", "returning"];
const CARD_ID_PREFIX = "STANDINGS-";

// Default card category per track, overridable per board via `cardCategory`.
const DEFAULT_CATEGORY_BY_TRACK = {
  subject: "RANKING",
  consensus: "RANKING",
  prediction: "LEADERBOARD",
  reporting: "LEADERBOARD",
};

// ---- Logging --------------------------------------------------------------
function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}
function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "generate-standings-cards", ...event };
  const line = JSON.stringify(entry);
  console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, "generate-standings-cards.log"), line + "\n");
}
function fail(reason, message, exitCode) {
  log({ status: "failure", reason, message });
  process.exit(exitCode);
}

// ---- Board loading --------------------------------------------------------
function listBoardFiles() {
  if (!fs.existsSync(STANDINGS_DIR)) return [];
  return fs
    .readdirSync(STANDINGS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .sort()
    .map((f) => path.join(STANDINGS_DIR, f));
}

function readBoard(filePath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    fail("bad_board_json", `Could not parse ${path.basename(filePath)}: ${err.message}`, 1);
  }
  return parsed;
}

function validateBoard(board, fileName, seenBoardIds) {
  const required = ["boardId", "title", "track", "entityType", "seasonId", "rulesetVersion", "entries"];
  for (const field of required) {
    if (board[field] === undefined || board[field] === null || board[field] === "") {
      fail("missing_field", `${fileName}: board missing required field "${field}"`, 1);
    }
  }

  if (seenBoardIds.has(board.boardId)) {
    fail("duplicate_board", `${fileName}: boardId "${board.boardId}" already used by another board file. Board ids must be unique.`, 1);
  }
  seenBoardIds.add(board.boardId);

  if (!TRACKS.includes(board.track)) {
    fail("unknown_track", `${fileName}: track "${board.track}" not recognized. Expected one of: ${TRACKS.join(", ")}`, 1);
  }

  const category = board.cardCategory || DEFAULT_CATEGORY_BY_TRACK[board.track];
  if (!STRUCTURED_CATEGORIES.includes(category)) {
    fail(
      "unknown_category",
      `${fileName}: cardCategory "${category}" not recognized. Expected one of: ${STRUCTURED_CATEGORIES.join(", ")}`,
      1
    );
  }

  if (!Array.isArray(board.entries)) {
    fail("bad_entries", `${fileName}: "entries" must be an array.`, 1);
  }

  board.entries.forEach((entry, i) => {
    if (typeof entry.rank !== "number") {
      fail("bad_entry", `${fileName}: entry ${i} is missing a numeric "rank".`, 1);
    }
    if (!entry.name) {
      fail("bad_entry", `${fileName}: entry ${i} (rank ${entry.rank}) is missing "name".`, 1);
    }
    const state = entry.movement && entry.movement.state;
    if (state !== undefined && !MOVEMENT_STATES.includes(state)) {
      fail(
        "bad_movement",
        `${fileName}: entry "${entry.name}" has movement.state "${state}". Expected one of: ${MOVEMENT_STATES.join(", ")}`,
        1
      );
    }
  });

  // Ranks should be non-decreasing when read in order. Ties are fine; a board
  // whose ranks jump around usually means the entries were sorted by score
  // after ranking, which quietly breaks the movement column.
  for (let i = 1; i < board.entries.length; i++) {
    if (board.entries[i].rank < board.entries[i - 1].rank) {
      fail(
        "unsorted_entries",
        `${fileName}: entries are not in rank order (rank ${board.entries[i].rank} follows rank ${board.entries[i - 1].rank}). ` +
          `Emit entries already sorted by rank so the published order matches the ranking.`,
        1
      );
    }
  }

  return category;
}

// ---- Projection: board -> text card --------------------------------------
// Movement is rendered, never computed. A board that did not supply movement
// for an entry gets a blank cell rather than an invented one.
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

// Rows are flat Record<string, string | number>, which is what the frontend's
// renderTextCardContent() expects for a structured card. `columns` on the board
// controls which fields appear and in what order; without it, a sensible
// default is used so a minimal board still renders.
const DEFAULT_COLUMNS = ["rank", "name", "score", "movement"];

function projectEntry(entry, columns) {
  const source = {
    rank: entry.rank,
    name: entry.name,
    score: entry.score,
    rate: entry.rate,
    entries: entry.entries,
    movement: formatMovement(entry.movement),
    ...(entry.fields || {}),
  };

  const row = {};
  columns.forEach((col) => {
    const value = source[col];
    if (value === undefined || value === null) return;
    row[col] = value;
  });
  return row;
}

function buildSubheadline(board) {
  if (board.subtitle) return board.subtitle;
  const parts = [`Season ${board.seasonId}`];
  if (board.throughRound) parts.push(`through ${board.throughRound}`);
  return parts.join(" · ");
}

// A card shows the top of a board, not all of it — but it must never cut a tie
// in half. Under competition ranking (1, 2, 2, 4) a plain slice at 10 can show
// one of three entries sharing rank 10 and silently drop the other two, which
// reads as arbitrary to the two who vanished. Extend the slice through the whole
// tie group instead: the card then shows 12, and the truncation note says so.
function sliceWithTieGroup(entries, limit) {
  if (!Number.isFinite(limit) || limit <= 0) return entries;
  if (entries.length <= limit) return entries;
  const cutRank = entries[limit - 1].rank;
  let end = limit;
  while (end < entries.length && entries[end].rank === cutRank) end++;
  return entries.slice(0, end);
}

function projectBoardToCard(board, category, generatedAt, incomplete) {
  const columns = Array.isArray(board.columns) && board.columns.length ? board.columns : DEFAULT_COLUMNS;
  const limit = typeof board.cardLimit === "number" ? board.cardLimit : 10;
  const shown = sliceWithTieGroup(board.entries, limit);

  const tags = ["standings", board.track, board.entityType, `season-${board.seasonId}`];
  if (board.example) tags.push("example");

  return {
    textCardId: `${CARD_ID_PREFIX}${String(board.boardId).toUpperCase()}`,
    category,
    persistent: true,
    headline: board.title,
    subheadline: buildSubheadline(board),
    content: { entries: shown.map((e) => projectEntry(e, columns)) },
    publishedDate: board.generatedAt || generatedAt,
    updatedDate: board.generatedAt || generatedAt,
    // An incomplete board is published INACTIVE so it stays visible in the data
    // and in the operator view, but never renders as a final public standing.
    status: incomplete ? "INACTIVE" : "ACTIVE",
    expiresAt: null,
    tags,
    featured: board.featured === true,
    priority: typeof board.priority === "number" ? board.priority : 0,
    author: null,
    media: {},
    relationships: {
      boardId: board.boardId,
      track: board.track,
      entityType: board.entityType,
      seasonId: board.seasonId,
      rulesetVersion: board.rulesetVersion,
      promptVersion: board.promptVersion || null,
      entryCount: board.entries.length,
      shownCount: shown.length,
      captureComplete: board.capture ? board.capture.complete !== false : null,
    },
  };
}

// ---- Registry merge -------------------------------------------------------
function loadExistingRegistry(outputPath) {
  if (!fs.existsSync(outputPath)) return { cards: [] };
  try {
    return JSON.parse(fs.readFileSync(outputPath, "utf8"));
  } catch (err) {
    fail("bad_existing_registry", `Could not parse existing ${outputPath}: ${err.message}`, 1);
  }
}

// ---- Main -----------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const outFlagIndex = args.indexOf("--out");
  const outputPath =
    outFlagIndex !== -1 && args[outFlagIndex + 1] ? path.resolve(args[outFlagIndex + 1]) : DEFAULT_OUTPUT_PATH;
  const allowIncomplete = args.includes("--allow-incomplete");

  log({ status: "start", outputPath, standingsDir: STANDINGS_DIR, allowIncomplete });

  const boardFiles = listBoardFiles();
  if (boardFiles.length === 0) {
    log({
      status: "info",
      message:
        `No board files found in ${STANDINGS_DIR} — nothing to publish this run. ` +
        `Cards already in the registry, persistent or not, are left untouched.`,
    });
  }

  const generatedAt = new Date().toISOString();
  const seenBoardIds = new Set();
  const boards = [];
  const generatedCards = [];
  let incompleteCount = 0;

  boardFiles.forEach((filePath) => {
    const fileName = path.basename(filePath);
    const board = readBoard(filePath);
    const category = validateBoard(board, fileName, seenBoardIds);

    const incomplete = board.capture ? board.capture.complete === false : false;
    if (incomplete) {
      if (!allowIncomplete) {
        fail(
          "incomplete_capture",
          `${fileName}: capture.complete is false. A response that was never captured is indistinguishable from ` +
            `a participant who did not play, so a partial round must not be published as a standing. Complete the ` +
            `capture and re-run, or pass --allow-incomplete to publish it INACTIVE for review.`,
          1
        );
      }
      incompleteCount++;
      log({ status: "warning", message: `${fileName}: incomplete capture published INACTIVE (--allow-incomplete).` });
    }

    boards.push(board);
    generatedCards.push(projectBoardToCard(board, category, generatedAt, incomplete));
  });

  const existing = loadExistingRegistry(outputPath);
  const existingCards = Array.isArray(existing.cards) ? existing.cards : [];

  const byId = new Map();
  existingCards.forEach((card) => byId.set(card.textCardId, card));

  // Any previously generated card whose board no longer exists is retired
  // rather than deleted — the registry is append-only by design, and a
  // vanished card would take its history with it.
  const generatedIds = new Set(generatedCards.map((c) => c.textCardId));
  let retired = 0;
  existingCards.forEach((card) => {
    if (
      card.textCardId.startsWith(CARD_ID_PREFIX) &&
      !generatedIds.has(card.textCardId) &&
      card.status !== "ARCHIVED"
    ) {
      byId.set(card.textCardId, { ...card, status: "ARCHIVED", updatedDate: generatedAt });
      retired++;
    }
  });

  let added = 0;
  let updated = 0;
  generatedCards.forEach((card) => {
    if (byId.has(card.textCardId)) updated++;
    else added++;
    byId.set(card.textCardId, card);
  });

  const mergedCards = Array.from(byId.values()).sort((a, b) => a.textCardId.localeCompare(b.textCardId));
  const carriedThrough = mergedCards.filter((c) => !c.textCardId.startsWith(CARD_ID_PREFIX)).length;

  log({
    status: "plan",
    boards: boards.length,
    cardsAdded: added,
    cardsUpdated: updated,
    cardsRetired: retired,
    incompleteBoards: incompleteCount,
    otherCardsCarriedThrough: carriedThrough,
    totalCards: mergedCards.length,
  });

  const registry = { generatedAt, cards: mergedCards };
  fs.writeFileSync(outputPath, JSON.stringify(registry, null, 2), "utf8");
  log({ status: "info", message: `Wrote content registry to ${outputPath}` });

  // The boards themselves are published as a first-class artifact, separately
  // from their card projections, so a reader can verify a rank rather than
  // just look at it.
  const standingsDoc = {
    generatedAt,
    boards: boards.map((b) => ({
      boardId: b.boardId,
      title: b.title,
      subtitle: buildSubheadline(b),
      track: b.track,
      entityType: b.entityType,
      seasonId: b.seasonId,
      throughRound: b.throughRound || null,
      rulesetVersion: b.rulesetVersion,
      promptVersion: b.promptVersion || null,
      capture: b.capture || null,
      eligibility: b.eligibility || null,
      columns: Array.isArray(b.columns) && b.columns.length ? b.columns : DEFAULT_COLUMNS,
      example: b.example === true,
      entries: b.entries,
    })),
  };

  if (fs.existsSync(FRONTEND_PUBLIC_DIR)) {
    fs.writeFileSync(FRONTEND_PUBLIC_CARDS, JSON.stringify(registry, null, 2), "utf8");
    fs.writeFileSync(FRONTEND_PUBLIC_STANDINGS, JSON.stringify(standingsDoc, null, 2), "utf8");
    log({ status: "info", message: `Also copied content registry and standings to ${FRONTEND_PUBLIC_DIR}` });
  } else {
    log({
      status: "warning",
      message: `frontend/public/ not found at ${FRONTEND_PUBLIC_DIR} — copy the outputs into your frontend's static assets manually, or pass --out pointing at it directly.`,
    });
  }

  log({
    status: "success",
    message:
      `Standings published: ${boards.length} board(s) -> ${added} card(s) added, ${updated} updated, ` +
      `${retired} retired, ${carriedThrough} other card(s) carried through untouched.`,
  });
  process.exit(0);
}

try {
  main();
} catch (err) {
  log({ status: "failure", reason: "unhandled_error", message: err.message });
  process.exit(1);
}
