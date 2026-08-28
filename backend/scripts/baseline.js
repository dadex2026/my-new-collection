#!/usr/bin/env node
/**
 * scripts/baseline.js
 *
 * The golden-output baseline: a frozen record of what the pipeline produced,
 * and an assertion that it still produces it.
 *
 * WHY IT EXISTS, AND WHY NOW.
 *   The reconciliation gate proves a breakdown adds up to its own total. It
 *   cannot notice a change that moves *history* while remaining internally
 *   consistent — a reordered tie-break, a rounding change, an off-by-one in a
 *   window. Only a frozen reference catches that.
 *
 *   It is also what the eventual scoring-engine port gets verified against, and
 *   that only means something while the Ledger is still the authority. A
 *   baseline captured after the port would freeze whatever the port produced
 *   and prove nothing at all.
 *
 * INPUTS ARE HASHED, NOT JUST OUTPUTS.
 *   Adding a round legitimately changes every board, and a test that screams
 *   about it teaches you to ignore it. So the manifest records a hash of every
 *   input file. Different inputs means the baseline is simply stale — reported
 *   separately from a regression, with a different exit code, because they call
 *   for opposite responses: re-capture versus investigate.
 *
 * Exit codes:
 *   0 = outputs match the baseline
 *   1 = REGRESSION — same inputs, different outputs, or the baseline is missing
 *   2 = baseline is stale — inputs changed, so re-capture is expected
 *
 * Usage:
 *   node scripts/baseline.js --capture     freeze current outputs as the reference
 *   node scripts/baseline.js               verify current outputs against it
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ---- Paths ----------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const STANDINGS_DIR = path.join(BACKEND_DIR, "standings");
const INPUT_DIR = path.join(STANDINGS_DIR, "_input");
const ROWS_DIR = path.join(INPUT_DIR, "rows");
const METHODOLOGY_DIR = path.join(BACKEND_DIR, "methodology");
const FRONTEND_PUBLIC_DIR = path.join(BACKEND_DIR, "..", "frontend", "public");
const BASELINE_DIR = path.join(BACKEND_DIR, "baseline");
const ARTIFACTS_DIR = path.join(BASELINE_DIR, "artifacts");
const MANIFEST_PATH = path.join(BASELINE_DIR, "manifest.json");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

// Fields that legitimately differ between two runs of the same pipeline over
// the same data. Listed per artifact rather than stripped blanket-wide, so a
// timestamp that IS deterministic still gets checked — the board dates derive
// from their export date, and a change there would be a real regression.
const VOLATILE_FIELDS = {
  "standings.json": ["generatedAt"],
  "methodology.json": ["generatedAt"],
};

// ---- Logging --------------------------------------------------------------
function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
function log(event) {
  ensureDir(LOGS_DIR);
  const entry = { time: new Date().toISOString(), step: "baseline", ...event };
  const line = JSON.stringify(entry);
  console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, "baseline.log"), line + "\n");
}
function bail(reason, message, exitCode) {
  log({ status: exitCode === 0 ? "success" : "failure", reason, message });
  process.exit(exitCode);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^﻿/, ""));
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

// ---- What gets baselined --------------------------------------------------
/* The published rankings and the documents derived from them. Boards are the
   source of truth for every rank; standings.json and methodology.json are
   projections, and are included because a change in projection code would leave
   the boards identical while quietly altering what a reader actually sees. */
function collectArtifacts() {
  const artifacts = [];

  if (fs.existsSync(STANDINGS_DIR)) {
    fs.readdirSync(STANDINGS_DIR)
      .filter((f) => f.toLowerCase().endsWith(".json"))
      .sort()
      .forEach((f) => artifacts.push({ name: `standings/${f}`, filePath: path.join(STANDINGS_DIR, f) }));
  }

  ["standings.json", "methodology.json"].forEach((f) => {
    const p = path.join(FRONTEND_PUBLIC_DIR, f);
    if (fs.existsSync(p)) artifacts.push({ name: f, filePath: p });
  });

  return artifacts;
}

/* Every file the outputs were built from. Hashing these is what separates
   "someone added a round" from "something broke". */
function collectInputs() {
  const inputs = {};
  const add = (dir, prefix) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".csv") || f.toLowerCase().endsWith(".json"))
      .sort()
      .forEach((f) => {
        inputs[`${prefix}${f}`] = sha256(fs.readFileSync(path.join(dir, f)));
      });
  };
  add(INPUT_DIR, "_input/");
  add(ROWS_DIR, "_input/rows/");
  add(METHODOLOGY_DIR, "methodology/");
  return inputs;
}

function normalize(name, doc) {
  const volatile = VOLATILE_FIELDS[name] || [];
  if (!volatile.length) return doc;
  const copy = JSON.parse(JSON.stringify(doc));
  volatile.forEach((field) => {
    delete copy[field];
  });
  return copy;
}

// ---- Diffing --------------------------------------------------------------
/* Reports paths, not a wall of JSON. "entries[3].score: 990 -> 995" is
   actionable; two thousand lines of context is not. */
function deepDiff(baseline, current, prefix, out) {
  out = out || [];
  if (out.length >= 40) return out;

  const bIsObj = baseline && typeof baseline === "object";
  const cIsObj = current && typeof current === "object";

  if (!bIsObj || !cIsObj) {
    if (JSON.stringify(baseline) !== JSON.stringify(current)) {
      out.push({ path: prefix || "(root)", baseline, current });
    }
    return out;
  }

  if (Array.isArray(baseline) !== Array.isArray(current)) {
    out.push({ path: prefix, baseline: Array.isArray(baseline) ? "array" : "object", current: Array.isArray(current) ? "array" : "object" });
    return out;
  }

  if (Array.isArray(baseline)) {
    if (baseline.length !== current.length) {
      out.push({ path: `${prefix}.length`, baseline: baseline.length, current: current.length });
    }
    const n = Math.min(baseline.length, current.length);
    for (let i = 0; i < n && out.length < 40; i++) {
      deepDiff(baseline[i], current[i], `${prefix}[${i}]`, out);
    }
    return out;
  }

  const keys = Array.from(new Set(Object.keys(baseline).concat(Object.keys(current)))).sort();
  keys.forEach((k) => {
    if (out.length >= 40) return;
    const p = prefix ? `${prefix}.${k}` : k;
    if (!(k in baseline)) {
      out.push({ path: p, baseline: "(absent)", current: summarize(current[k]) });
    } else if (!(k in current)) {
      out.push({ path: p, baseline: summarize(baseline[k]), current: "(absent)" });
    } else {
      deepDiff(baseline[k], current[k], p, out);
    }
  });
  return out;
}

function summarize(v) {
  if (v && typeof v === "object") return Array.isArray(v) ? `array(${v.length})` : "object";
  return v;
}

// ---- Cross-artifact consistency -------------------------------------------
/* standings.json embeds a copy of every board. If it was written before the
   boards were last rebuilt, the published rankings and the board files disagree
   — and the site ships the stale copy while everything on disk looks fine.
   This is not hypothetical: the first baseline capture caught exactly that,
   a standings.json missing every evidence block the boards already had.

   Checked at capture as well as verify, because freezing an inconsistent state
   would make the reference itself wrong. */
const PROJECTED_FIELDS = [
  "boardId", "title", "subtitle", "track", "entityType", "seasonId",
  "throughRound", "rulesetVersion", "promptVersion", "capture", "eligibility",
  "columns", "entries",
];

function checkConsistency() {
  const standingsPath = path.join(FRONTEND_PUBLIC_DIR, "standings.json");
  if (!fs.existsSync(standingsPath) || !fs.existsSync(STANDINGS_DIR)) return [];

  const published = readJson(standingsPath);
  if (!Array.isArray(published.boards)) return [];

  const onDisk = new Map();
  fs.readdirSync(STANDINGS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .forEach((f) => {
      const b = readJson(path.join(STANDINGS_DIR, f));
      if (b && b.boardId) onDisk.set(b.boardId, b);
    });

  const problems = [];

  published.boards.forEach((pub) => {
    const src = onDisk.get(pub.boardId);
    if (!src) {
      problems.push({ boardId: pub.boardId, detail: "published in standings.json but no board file exists" });
      return;
    }
    const projectedPub = {};
    const projectedSrc = {};
    PROJECTED_FIELDS.forEach((f) => {
      if (f in pub) projectedPub[f] = pub[f];
      if (f in pub) projectedSrc[f] = src[f];
    });
    const diffs = deepDiff(projectedSrc, projectedPub, pub.boardId, []);
    if (diffs.length) {
      problems.push({
        boardId: pub.boardId,
        detail: `${diffs.length} field(s) differ from the board file`,
        sample: diffs.slice(0, 5).map((d) => `${d.path}: board=${JSON.stringify(d.baseline)} published=${JSON.stringify(d.current)}`),
      });
    }
  });

  onDisk.forEach((b, id) => {
    if (!published.boards.some((p) => p.boardId === id)) {
      problems.push({ boardId: id, detail: "board file exists but is not in standings.json" });
    }
  });

  return problems;
}

function assertConsistent(mode) {
  const problems = checkConsistency();
  if (!problems.length) return;
  problems.forEach((p) => log({ status: "failure", boardId: p.boardId, message: p.detail, sample: p.sample }));
  bail(
    "inconsistent_artifacts",
    `standings.json disagrees with the board files for ${problems.length} board(s) — the published rankings are ` +
      `stale. Re-run the import and generate steps so every artifact comes from one pass, then ${mode} again.`,
    1
  );
}

// ---- Capture --------------------------------------------------------------
function capture() {
  const artifacts = collectArtifacts();
  if (artifacts.length === 0) {
    bail("nothing_to_capture", "No standings or published documents found. Run the import and generate steps first.", 1);
  }

  assertConsistent("capture");
  ensureDir(ARTIFACTS_DIR);

  const recorded = {};
  artifacts.forEach((a) => {
    const doc = normalize(a.name, readJson(a.filePath));
    const text = JSON.stringify(doc, null, 2);
    const outName = a.name.replace(/[\/]/g, "__");
    fs.writeFileSync(path.join(ARTIFACTS_DIR, outName), text, "utf8");
    recorded[a.name] = { file: outName, hash: sha256(text) };
  });

  const inputs = collectInputs();
  const manifest = {
    capturedAt: new Date().toISOString(),
    note:
      "Frozen reference for the standings pipeline. Verified by scripts/baseline.js. " +
      "Re-capture only when inputs change (a new round, a corrected export) — never to make a failing check pass.",
    inputs,
    artifacts: recorded,
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");

  log({
    status: "success",
    mode: "capture",
    message: `Baseline captured: ${Object.keys(recorded).length} artifact(s) from ${Object.keys(inputs).length} input file(s).`,
    artifacts: Object.keys(recorded),
  });
  process.exit(0);
}

// ---- Verify ---------------------------------------------------------------
function verify() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    bail(
      "no_baseline",
      `No baseline at ${MANIFEST_PATH}. Capture one with: node scripts/baseline.js --capture`,
      1
    );
  }

  assertConsistent("verify");

  const manifest = readJson(MANIFEST_PATH);
  const currentInputs = collectInputs();

  // Inputs first. A changed input makes every downstream difference expected,
  // and reporting those as regressions would train you to ignore the check.
  const inputChanges = [];
  Object.keys(manifest.inputs || {}).forEach((f) => {
    if (!(f in currentInputs)) inputChanges.push(`${f} (removed)`);
    else if (currentInputs[f] !== manifest.inputs[f]) inputChanges.push(`${f} (changed)`);
  });
  Object.keys(currentInputs).forEach((f) => {
    if (!(f in (manifest.inputs || {}))) inputChanges.push(`${f} (added)`);
  });

  if (inputChanges.length) {
    log({
      status: "stale",
      mode: "verify",
      message:
        `Baseline is stale — ${inputChanges.length} input file(s) differ from those it was captured from. ` +
        `Downstream differences are expected. Review the new standings, then re-capture with --capture.`,
      inputChanges,
    });
    process.exit(2);
  }

  const artifacts = collectArtifacts();
  const currentByName = new Map(artifacts.map((a) => [a.name, a]));
  const failures = [];

  Object.keys(manifest.artifacts).forEach((name) => {
    const record = manifest.artifacts[name];
    const baselinePath = path.join(ARTIFACTS_DIR, record.file);

    if (!fs.existsSync(baselinePath)) {
      failures.push({ artifact: name, problem: `baseline file missing at ${record.file}` });
      return;
    }
    if (!currentByName.has(name)) {
      failures.push({ artifact: name, problem: "artifact no longer produced" });
      return;
    }

    const baselineDoc = readJson(baselinePath);
    const currentDoc = normalize(name, readJson(currentByName.get(name).filePath));
    const diffs = deepDiff(baselineDoc, currentDoc, "", []);
    if (diffs.length) failures.push({ artifact: name, diffs });
  });

  artifacts.forEach((a) => {
    if (!(a.name in manifest.artifacts)) {
      failures.push({ artifact: a.name, problem: "new artifact not in the baseline" });
    }
  });

  if (failures.length) {
    failures.forEach((f) => {
      if (f.problem) {
        log({ status: "failure", artifact: f.artifact, message: f.problem });
        return;
      }
      log({
        status: "failure",
        artifact: f.artifact,
        message: `${f.diffs.length} difference(s) against the baseline${f.diffs.length >= 40 ? " (first 40 shown)" : ""}`,
        diffs: f.diffs.map((d) => `${d.path}: ${JSON.stringify(d.baseline)} -> ${JSON.stringify(d.current)}`),
      });
    });
    bail(
      "regression",
      `REGRESSION: inputs are unchanged but ${failures.length} artifact(s) differ from the baseline. ` +
        `Something in the pipeline moved published history. Do not re-capture to clear this — find the cause first.`,
      1
    );
  }

  log({
    status: "success",
    mode: "verify",
    message:
      `Baseline verified: ${Object.keys(manifest.artifacts).length} artifact(s) reproduce exactly from ` +
      `${Object.keys(currentInputs).length} unchanged input file(s). Captured ${manifest.capturedAt}.`,
  });
  process.exit(0);
}

// ---- Main -----------------------------------------------------------------
try {
  if (process.argv.slice(2).includes("--capture")) capture();
  else verify();
} catch (err) {
  log({ status: "failure", reason: "unhandled_error", message: err.message });
  process.exit(1);
}
