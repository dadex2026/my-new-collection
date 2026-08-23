#!/usr/bin/env node
/**
 * scripts/generate-methodology.js
 *
 * Publishes the methodology page's data: authored prose merged with facts
 * derived from the standings themselves.
 *
 * THE SPLIT IS THE POINT.
 *   methodology/methodology.json holds wording — how scoring works, what each
 *   board measures, what the integrity rules are. It changes when the
 *   explanation changes.
 *
 *   Everything that could go stale is DERIVED here instead: which boards exist,
 *   which ruleset produced each one, which export files they were built from,
 *   what the eligibility minimum currently is, and the full ruleset changelog.
 *   A methodology page that quietly describes last month's rules is worse than
 *   no methodology page, because it is trusted.
 *
 * WHAT IT DOES NOT DO.
 *   It states nothing the system cannot currently do. There is no reporting
 *   track, no crowd-submitted outcomes and no provenance tiers yet, so none are
 *   described. The page documents what is running, not what is planned.
 *
 * Exit codes:
 *   0 = success
 *   1 = validation failure
 *
 * Usage:
 *   node scripts/generate-methodology.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

// ---- Paths ----------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const METHODOLOGY_DIR = path.join(BACKEND_DIR, "methodology");
const SOURCE_PATH = path.join(METHODOLOGY_DIR, "methodology.json");
const OVERRIDES_PATH = path.join(METHODOLOGY_DIR, "overrides.json");
const STANDINGS_DIR = path.join(BACKEND_DIR, "standings");
const INPUT_DIR = path.join(STANDINGS_DIR, "_input");
const RULESETS_PATH = path.join(INPUT_DIR, "rulesets.json");
const CONFIG_PATH = path.join(INPUT_DIR, "import-config.json");
const FRONTEND_PUBLIC_DIR = path.join(BACKEND_DIR, "..", "frontend", "public");
const OUTPUT_PATH = path.join(FRONTEND_PUBLIC_DIR, "methodology.json");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

// ---- Logging --------------------------------------------------------------
function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}
function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "generate-methodology", ...event };
  const line = JSON.stringify(entry);
  console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, "generate-methodology.log"), line + "\n");
}
function fail(reason, message, exitCode) {
  log({ status: "failure", reason, message });
  process.exit(exitCode);
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) fail("missing_file", `${label} not found at ${filePath}`, 1);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^﻿/, ""));
  } catch (err) {
    fail("bad_json", `Could not parse ${label} at ${filePath}: ${err.message}`, 1);
  }
}

// ---- Template default + collection overrides ------------------------------
/* methodology.json is the template's default prose and is the same in every
   collection. Most of it genuinely is shared — where numbers come from, who is
   ranked, how to verify a position, the corrections policy.

   Two sections are not. How a prediction is scored differs by domain (a
   categorical contest compares against the most-predicted answer; a numeric one
   against a median, with a max-error distance), and which boards exist differs
   too. Fudging one paragraph to cover both would make the page vague, and vague
   is a defect on a page whose entire job is precision.

   So overrides.json belongs to the collection and is merged by section id:
   patch a section, add a domain-specific one, or drop one that does not apply.
   Template improvements to the shared sections then arrive on version bump,
   while the domain wording stays owned locally. Same split as everywhere else —
   template owns the mechanism, collection owns the vocabulary. */
function mergeSections(defaults, overrides) {
  // The shape is a whitelist so a stray key cannot reach the page. The two
  // conditional variants are part of that shape: resolveConditionalBody folds
  // them into body once the changelog length is known.
  const carryVariants = (out, s) => {
    VARIANT_KEYS.forEach((k) => { if (s[k]) out[k] = s[k]; });
    return out;
  };
  const sections = defaults.map((s) =>
    carryVariants({ id: s.id, heading: s.heading, body: Array.isArray(s.body) ? s.body.slice() : [] }, s)
  );
  const indexOf = (id) => sections.findIndex((s) => s.id === id);
  const applied = { patched: [], added: [], removed: [] };

  (overrides.sections || []).forEach((o) => {
    if (!o.id) fail("override_no_id", `An override in ${OVERRIDES_PATH} has no "id".`, 1);
    const at = indexOf(o.id);

    if (o.remove) {
      // A remove that matches nothing is almost always a typo, and silently
      // ignoring it would leave a section published that was meant to be gone.
      if (at === -1) {
        fail("override_remove_missing", `Override removes section "${o.id}", which is not in the default methodology.`, 1);
      }
      sections.splice(at, 1);
      applied.removed.push(o.id);
      return;
    }

    if (at !== -1) {
      if (o.heading) sections[at].heading = o.heading;
      if (o.body) sections[at].body = Array.isArray(o.body) ? o.body : [String(o.body)];
      carryVariants(sections[at], o);
      applied.patched.push(o.id);
      return;
    }

    // Unknown id: only a complete section can be an addition. A partial one is
    // a misspelled patch, and would otherwise appear as a stray half-section.
    if (!o.heading || !o.body) {
      fail(
        "override_unknown_id",
        `Override "${o.id}" matches no default section, and is missing "heading" or "body" so it cannot be a new ` +
          `one either. Check the id against the defaults in methodology.json.`,
        1
      );
    }

    const newSection = carryVariants({ id: o.id, heading: o.heading, body: Array.isArray(o.body) ? o.body : [String(o.body)] }, o);
    if (o.after) {
      const afterAt = indexOf(o.after);
      if (afterAt === -1) fail("override_after_missing", `Override "${o.id}" asks to sit after "${o.after}", which does not exist.`, 1);
      sections.splice(afterAt + 1, 0, newSection);
    } else {
      sections.push(newSection);
    }
    applied.added.push(o.id);
  });

  return { sections, applied };
}

// ---- Derived facts --------------------------------------------------------
function listBoards() {
  if (!fs.existsSync(STANDINGS_DIR)) return [];
  return fs
    .readdirSync(STANDINGS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .map((f) => readJson(path.join(STANDINGS_DIR, f), f))
    .filter((b) => b && b.boardId)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0) || String(a.boardId).localeCompare(String(b.boardId)));
}

// The changelog is ordered by effective date so it reads as a history rather
// than as whatever order the file happened to be written in.
function buildChangelog(rulesets) {
  return Object.keys(rulesets)
    .map((id) => ({
      id,
      kind: rulesets[id].kind,
      effectiveFrom: rulesets[id].effectiveFrom || null,
      note: rulesets[id].note || "",
    }))
    .sort((a, b) => String(a.effectiveFrom || "").localeCompare(String(b.effectiveFrom || "")) || a.id.localeCompare(b.id));
}

// A section may carry a sentence that only makes sense once the changelog has
// entries, and a different one for when it does not. The template ships with an
// empty rulesets file by design, so without this every new collection would
// publish "every version is listed below" above nothing at all — a page whose
// argument is that any figure can be checked should not point at a list that
// is not there. Declared in the source rather than detected here, so a
// collection can override either variant like any other prose.
/* Each pair is one fact the page can only assert when the underlying data is
   actually there. Declared in the source rather than detected here, so a
   collection can override either variant like any other prose, and a section
   that states nothing conditional carries no extra keys at all. */
const CONDITIONAL_BODY = [
  { flag: "changelog", when: "bodyWhenChangelog", unless: "bodyWhenNoChangelog" },
  { flag: "evidence", when: "bodyWhenEvidence", unless: "bodyWhenNoEvidence" },
];

const VARIANT_KEYS = CONDITIONAL_BODY.flatMap((c) => [c.when, c.unless]);

function resolveConditionalBody(sections, conditions) {
  return sections.map((s) => {
    if (!VARIANT_KEYS.some((k) => s[k])) return s;
    const copy = { ...s };
    VARIANT_KEYS.forEach((k) => delete copy[k]);
    copy.body = Array.isArray(s.body) ? s.body.slice() : [];
    CONDITIONAL_BODY.forEach((c) => {
      const extra = conditions[c.flag] ? s[c.when] : s[c.unless];
      if (!extra) return;
      (Array.isArray(extra) ? extra : [extra]).forEach((t) => copy.body.push(t));
    });
    return copy;
  });
}

function describeBoards(boards) {
  return boards.map((b) => ({
    boardId: b.boardId,
    title: b.title,
    track: b.track,
    entityType: b.entityType,
    seasonId: b.seasonId,
    throughRound: b.throughRound || null,
    rulesetVersion: b.rulesetVersion || null,
    rankedCount: Array.isArray(b.entries) ? b.entries.length : 0,
    omittedNoValue: (b.eligibility && b.eligibility.omittedNoValue) || 0,
    omittedReason: (b.eligibility && b.eligibility.omittedReason) || null,
    movementShown: Array.isArray(b.entries) && b.entries.some((e) => e.movement),
    movementSuppressedReason:
      b.rulesetChanged && b.rulesetChanged.movementSuppressed
        ? `${b.rulesetChanged.suppressedBy || b.rulesetChanged.to} changed the scoring rules between ${b.rulesetChanged.from} and ${b.rulesetChanged.to}, so positions either side were produced under different rules.`
        : null,
  }));
}

// Every file the published standings were actually built from. This is the
// provenance trail: a reader can ask which export produced a figure and get an
// answer, and anyone rebuilding the repository uses exactly these inputs.
function describeSources(boards) {
  const rounds = new Set();
  const evidence = new Set();
  boards.forEach((b) => {
    if (b.capture && b.capture.source) rounds.add(b.capture.source);
    if (b.evidenceSource && b.evidenceSource.file) evidence.add(b.evidenceSource.file);
  });
  return {
    roundExports: Array.from(rounds).sort(),
    evidenceExports: Array.from(evidence).sort(),
    captureMethod: "Collected by hand from public posts at the close of each round.",
  };
}

function collectUnranked(boards) {
  const pointsBoard = boards.find((b) => b.boardId === "community-points") || boards[0];
  if (!pointsBoard || !Array.isArray(pointsBoard.unrankedHandles)) return [];
  return pointsBoard.unrankedHandles;
}

// ---- Main -----------------------------------------------------------------
function main() {
  log({ status: "start", source: SOURCE_PATH, output: OUTPUT_PATH });

  const authored = readJson(SOURCE_PATH, "methodology source");
  if (!Array.isArray(authored.sections) || authored.sections.length === 0) {
    fail("no_sections", `${SOURCE_PATH} has no sections.`, 1);
  }

  // Overrides are optional. A collection whose domain matches the defaults
  // needs no file at all.
  const overrides = fs.existsSync(OVERRIDES_PATH) ? readJson(OVERRIDES_PATH, "methodology overrides") : { sections: [] };
  const { sections, applied } = mergeSections(authored.sections, overrides);

  if (sections.length === 0) {
    fail("no_sections_after_merge", "Every section was removed by overrides — nothing left to publish.", 1);
  }

  const rulesetsDoc = readJson(RULESETS_PATH, "rulesets");
  const changelog = buildChangelog(rulesetsDoc.rulesets || {});
  const config = readJson(CONFIG_PATH, "import config");
  const boards = listBoards();

  if (boards.length === 0) {
    log({
      status: "warning",
      message: "No boards found — the page will publish its prose with no rankings to describe.",
    });
  }

  /* A collection that does not export the row layer publishes totals with no
     breakdown behind them. The page must not then claim a reader can add a
     total up from its parts — a verification promise nothing is backing is
     worse than no promise, on a page whose whole argument is checkability. */
  const hasEvidence = boards.some((b) => b.evidenceSource);
  const resolvedSections = resolveConditionalBody(sections, {
    changelog: changelog.length > 0,
    evidence: hasEvidence,
  });

  const doc = {
    generatedAt: new Date().toISOString(),
    title: overrides.title || authored.title,
    intro: overrides.intro || authored.intro,
    collection: {
      title: config.collectionTitle,
      seasonId: config.seasonId,
      minPicks: config.minPicks || null,
      cardLimit: config.cardLimit || null,
    },
    sections: resolvedSections,
    boards: describeBoards(boards),
    unranked: collectUnranked(boards),
    changelog,
    kinds: rulesetsDoc._kinds || {},
    sources: describeSources(boards),
  };

  if (!fs.existsSync(FRONTEND_PUBLIC_DIR)) {
    fail(
      "no_public_dir",
      `frontend/public not found at ${FRONTEND_PUBLIC_DIR} — nowhere to publish the methodology.`,
      1
    );
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(doc, null, 2), "utf8");

  log({
    status: "success",
    message:
      `Methodology published: ${doc.sections.length} section(s), ${doc.boards.length} board(s) described, ` +
      `${doc.changelog.length} ruleset version(s) in the changelog, ${doc.unranked.length} unranked participant(s) explained.`,
    overrides: {
      patched: applied.patched,
      added: applied.added,
      removed: applied.removed,
    },
  });
  process.exit(0);
}

try {
  main();
} catch (err) {
  log({ status: "failure", reason: "unhandled_error", message: err.message });
  process.exit(1);
}
