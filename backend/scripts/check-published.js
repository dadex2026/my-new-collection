#!/usr/bin/env node
/**
 * scripts/check-published.js
 *
 * Compares what the live site publishes against what this repo holds, and
 * exits non-zero if they disagree.
 *
 * WHY THIS EXISTS: every endpoint can return 200 while the content is weeks
 * stale. The generators write backend/*.json AND frontend/public/*.json, and
 * the site serves the frontend copies — so a row added to a CSV without a
 * re-run and a push is invisible to any check built on status codes. That
 * drift ran for weeks once: 1 published card against 9 CSV rows, 3 published
 * campaigns against 8 deployed. Prompt A7 documents the check; this is it,
 * runnable.
 *
 * It reads. It never writes, generates, commits or pushes.
 *
 * Every request carries a cache-busting query string, because a cached
 * response is indistinguishable from a live one and will report the old
 * counts minutes after a good deploy.
 *
 * Usage:
 *   node backend/scripts/check-published.js --site https://example.netlify.app
 *   node backend/scripts/check-published.js            (uses collectionExternalUrl)
 *
 * Exit codes:
 *   0 = published matches source
 *   1 = drift, or a real failure (registry.json missing)
 *   2 = could not run (no site url, unreachable, unreadable source)
 *
 * As a pre-push hook, .git/hooks/pre-push:
 *   node backend/scripts/check-published.js --site <url> || exit 1
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const BACKEND_DIR = path.join(__dirname, "..");
const bust = () => `?v=${Date.now()}`;

function fail(msg, code = 2) {
  process.stderr.write(`\n✗ ${msg}\n\n`);
  process.exit(code);
}

// Quote-aware enough for these files: a field may contain commas inside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}

function readCsv(file) {
  const p = path.join(BACKEND_DIR, file);
  if (!fs.existsSync(p)) return null;
  const rows = parseCsv(fs.readFileSync(p, "utf8"));
  const header = rows.shift();
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const isSolanaAddress = v => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v || "");

// When master.csv last CHANGED, not when the file was last touched. A git
// checkout rewrites mtimes, so comparing against the mtime reports drift after
// an innocent branch switch — a false alarm in the one check whose whole job is
// telling real staleness from a green status code. Fall back to mtime only
// where git cannot answer (no repo, git absent, file never committed).
function lastChanged(file) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cI", "--", file],
      { cwd: BACKEND_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (out) return out;
  } catch { /* not a repo, or git unavailable */ }
  const p = path.join(BACKEND_DIR, file);
  return fs.existsSync(p) ? fs.statSync(p).mtime.toISOString() : "";
}

async function getJson(url) {
  try {
    const res = await fetch(url, { headers: { "cache-control": "no-cache" } });
    return { status: res.status, body: res.ok ? await res.json() : null };
  } catch (err) {
    return { status: 0, body: null, error: err.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flag = n => { const i = args.indexOf(`--${n}`); return i !== -1 ? args[i + 1] : null; };

  let site = flag("site");
  if (!site) {
    const master = readCsv("master.csv");
    site = master && master.length ? (master[0].collectionExternalUrl || "").trim() : "";
    if (site.startsWith("http") === false) site = "";
  }
  if (!site) fail("No site url. Pass --site <url>, or set collectionExternalUrl in master.csv.");
  site = site.replace(/\/+$/, "");

  const cards = readCsv("textcards.csv");
  const campaigns = readCsv("campaigns.csv");
  if (!cards || !campaigns) fail("Could not read textcards.csv / campaigns.csv.");

  const expectedCards = cards.length;
  // Only rows with a genuinely deployed candy machine are published, by design.
  const expectedCampaigns = campaigns.filter(r => isSolanaAddress(r.campaignCandyMachineAddress)).length;

  const [content, camp, registry] = await Promise.all([
    getJson(`${site}/content-registry.json${bust()}`),
    getJson(`${site}/campaigns.json${bust()}`),
    getJson(`${site}/registry.json${bust()}`),
  ]);

  // A network failure must never read as drift — it is a different answer.
  if (content.status === 0 && camp.status === 0 && registry.status === 0) {
    fail(`Could not reach ${site} — ${content.error || "network error"}. ` +
         `This is not a drift result: nothing was compared.`, 2);
  }

  const rows = [];
  let drift = false;

  const publishedCards = content.body?.cards?.length ?? null;
  const publishedCamps = camp.body?.campaigns?.length ?? null;

  const verdict = (pub, src, note404) => {
    if (pub === null) return note404;   // unreachable or 404 — reported, not counted as drift
    if (pub === src) return "ok";
    drift = true;
    return `DRIFT — ${pub} published, ${src} in source`;
  };

  rows.push(["content-registry.json", publishedCards, expectedCards,
    verdict(publishedCards, expectedCards, content.status === 404 ? "404 — nothing published yet" : `status ${content.status}`)]);
  rows.push(["campaigns.json", publishedCamps, expectedCampaigns,
    verdict(publishedCamps, expectedCampaigns, camp.status === 404 ? "404 — nothing deployed yet" : `status ${camp.status}`)]);

  // registry.json is the one whose absence is always a fault.
  if (registry.status === 0) {
    rows.push(["registry.json", "unreachable", "—", `not compared — ${registry.error || "network error"}`]);
  } else if (registry.status !== 200) {
    drift = true;
    rows.push(["registry.json", `status ${registry.status}`, "—",
      "REAL FAILURE — usually the missing VITE_REGISTRY_URL env var"]);
  } else {
    const gen = registry.body?.generatedAt || "";
    const edited = lastChanged("master.csv");
    const stale = gen && edited && gen < edited;
    if (stale) drift = true;
    rows.push(["registry.json", gen.slice(0, 10) || "?", edited.slice(0, 10) || "?",
      stale ? "DRIFT — generated before master.csv last changed" : "ok"]);
  }

  const w = [22, 12, 12];
  process.stdout.write(`\n  ${site}\n\n`);
  process.stdout.write(`  ${"endpoint".padEnd(w[0])}${"published".padEnd(w[1])}${"source".padEnd(w[2])}verdict\n`);
  process.stdout.write(`  ${"-".repeat(w[0] + w[1] + w[2] + 40)}\n`);
  for (const [a, b, c, d] of rows) {
    process.stdout.write(`  ${String(a).padEnd(w[0])}${String(b).padEnd(w[1])}${String(c).padEnd(w[2])}${d}\n`);
  }

  // Absent features 404 identically to unpublished ones; the remedies differ.
  const missing = ["standings", "methodology"].filter(d => !fs.existsSync(path.join(BACKEND_DIR, d)));
  if (missing.length) {
    process.stdout.write(`\n  note: backend/${missing.join(", backend/")} ${missing.length > 1 ? "do" : "does"} not exist here, ` +
      `so those endpoints 404 because the feature was never merged in (prompt A4), not because nothing is published.\n`);
  }

  if (drift) {
    process.stdout.write(`\n✗ Published output is behind this repo. Re-run the generators, then commit and push:\n` +
      `    node backend/scripts/generate-registry.js\n` +
      `    node backend/scripts/generate-content-registry.js\n` +
      `    node backend/scripts/generate-campaigns-registry.js\n` +
      `    git add backend frontend/public && git commit && git push\n\n`);
    process.exit(1);
  }
  process.stdout.write(`\n✓ Published output matches this repo.\n\n`);
}

main().catch(err => fail(err.message));
