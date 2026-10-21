#!/usr/bin/env node
/**
 * scripts/verify-uploads.js
 *
 * Step 7.4a: after the uploads (7.2, 7.4) and BEFORE the deploys (7.5, 7.6) -
 * while a drop's uri can still be changed - confirms that every itemImage and
 * uri in master.csv is a real, confirmed Irys upload of the right type and
 * exactly the size of the local file that was sent.
 *
 * WHY
 *   The uri goes into the candy machine's hiddenSettings, and the deploy makes
 *   that permanent. Nothing else checks it resolves: isPlaceholder() only
 *   matches known patterns, and Irys's read CDN refuses non-browser clients
 *   from this project's machine (open-items 56). The upload node itself does
 *   answer, and its records - /tx/<id> and /tx/<id>/status - carry the
 *   confirmation, the Content-Type tag and data_size.
 *
 * WHAT IT CANNOT CHECK: the content hash. /tx/<id>/data redirects to the CDN
 * that refuses scripts. Size, type and confirmation are what is checkable.
 *
 * READ-ONLY. No key, no signer, no writes beyond its log. Not part of
 * reconcile.js, deliberately: that one compares the CSVs with the chain and
 * should fail only on drift, not because an Irys node is unreachable.
 *
 * A size mismatch FAILS for a drop not yet deployed - the uri is about to be
 * frozen on something other than the local file - and is a WARNING for a
 * deployed drop, where nothing can change it any more and an alarm that can
 * never be cleared would only teach people to ignore this script.
 *
 * Exit codes:
 *   0 = every upload in scope verified (warnings allowed)
 *   1 = at least one upload is missing, unconfirmed, the wrong type, or not
 *       the file that was sent - for a drop not yet deployed
 *   3 = the upload node did not answer - nothing concluded; check by hand
 *       (guide 7.2: open https://uploader.irys.xyz/tx/<id>/status)
 *
 * Usage:
 *   node scripts/verify-uploads.js              (config.json's collectionSlug)
 *   node scripts/verify-uploads.js --slug founders
 *   node scripts/verify-uploads.js --all        (every row in master.csv)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { parseCsvRecords } = require("./lib/csv");
const { isPlaceholder } = require("./lib/placeholder");

const BACKEND_DIR = path.join(__dirname, "..");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");
const UPLOADER = "https://uploader.irys.xyz";
// The order upload-images.js picks a local image in.
const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
const IRYS_URL = /^https:\/\/gateway\.irys\.xyz\/([1-9A-HJ-NP-Za-km-z]{43,44})$/;

// ---- Pure (exported for verify-uploads.selftest.js) ------------------------

// kind: "itemImage" | "uri". record: the /tx/<id> JSON, or null for a 404.
// status: the /tx/<id>/status "status" string, or null. localSize: bytes of
// the local file sent, or null if there is none to compare.
function judge({ kind, url, record, status, localSize, deployed }) {
  const out = (s, ok, detail = "") => ({ kind, status: s, ok, warning: s === "drifted_after_deploy", detail });
  if (isPlaceholder(url)) return out("not_uploaded", !deployed, deployed ? "a deployed drop with a placeholder - see preflight" : "nothing uploaded yet");
  if (!IRYS_URL.test(String(url).trim())) return out("unverifiable", false, "not a gateway.irys.xyz/<id> URL - verify by hand");
  if (!record) return out("missing", false, "the upload node has no such transaction");
  if (status !== "CONFIRMED") return out("not_confirmed", false, `status is ${status || "unknown"}`);
  const tag = (record.tags || []).find((t) => String(t.name).toLowerCase() === "content-type");
  const type = tag ? String(tag.value) : "";
  const typeOk = kind === "uri" ? type === "application/json" : /^image\//.test(type);
  if (!typeOk) return out("wrong_type", false, `Content-Type is "${type || "(none)"}"`);
  const size = Number(record.data_size);
  if (localSize == null) return out("verified_no_local", true, `${type}, ${size} bytes; no local file to compare`);
  if (size !== localSize) {
    return deployed
      ? out("drifted_after_deploy", true, `uploaded ${size} bytes, local file now ${localSize} - the deployed uri is fixed; informational`)
      : out("size_mismatch", false, `uploaded ${size} bytes, local file is ${localSize} - re-upload before deploying`);
  }
  return out("verified", true, `${type}, ${size} bytes = local`);
}

function idOf(url) {
  const m = IRYS_URL.exec(String(url || "").trim());
  return m ? m[1] : null;
}

// ---- I/O ----------------------------------------------------------------------

function log(event) {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
  const line = JSON.stringify({ time: new Date().toISOString(), step: "verify-uploads", ...event });
  fs.appendFileSync(path.join(LOGS_DIR, "verify-uploads.log"), line + "\n");
  return line;
}

function localImageSize(dropItemId) {
  for (const ext of IMAGE_EXTS) {
    const p = path.join(BACKEND_DIR, "images", dropItemId + ext);
    if (fs.existsSync(p)) return fs.statSync(p).size;
  }
  return null;
}

function localMetadataSize(dropItemId) {
  const p = path.join(BACKEND_DIR, "metadata", dropItemId + ".json");
  return fs.existsSync(p) ? fs.statSync(p).size : null;
}

async function fetchRecord(id) {
  const rec = await fetch(`${UPLOADER}/tx/${id}`);
  if (rec.status === 404) return { record: null, status: null };
  if (!rec.ok) throw new Error(`${UPLOADER}/tx/${id} answered ${rec.status}`);
  const record = await rec.json();
  const st = await fetch(`${UPLOADER}/tx/${id}/status`);
  const status = st.ok ? (await st.json()).status : null;
  return { record, status };
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const si = args.indexOf("--slug");
  const config = JSON.parse(fs.readFileSync(path.join(BACKEND_DIR, "config.json"), "utf8"));
  const slug = si !== -1 && args[si + 1] ? args[si + 1] : config.collectionSlug;
  const { records } = parseCsvRecords(fs.readFileSync(path.join(BACKEND_DIR, "master.csv"), "utf8"));
  const rows = all ? records : records.filter((r) => r.collectionSlug === slug);
  console.log(log({ status: "start", scope: all ? "all" : slug, rows: rows.length }));
  if (rows.length === 0) {
    console.log(log({ status: "failure", reason: "no_rows", message: `no master.csv rows for ${all ? "any slug" : `collectionSlug "${slug}"`}` }));
    process.exit(1);
  }

  const results = [];
  for (const row of rows) {
    const deployed = !!(row.candyMachineAddress || "").trim();
    for (const kind of ["itemImage", "uri"]) {
      const url = row[kind];
      const id = idOf(url);
      let fetched = { record: null, status: null };
      if (id && !isPlaceholder(url)) {
        try { fetched = await fetchRecord(id); }
        catch (err) {
          console.log(log({ status: "failure", reason: "uploader_unreachable", message: `${err.message}. Nothing concluded - check by hand (guide 7.2).` }));
          process.exit(3);
        }
      }
      const localSize = kind === "uri" ? localMetadataSize(row.dropItemId) : localImageSize(row.dropItemId);
      results.push({ dropItemId: row.dropItemId, deployed, ...judge({ kind, url, record: fetched.record, status: fetched.status, localSize, deployed }) });
    }
  }

  const fmt = results.map((r) => `${r.ok ? (r.warning ? "!!" : "  ") : "<<"}  ${r.dropItemId.padEnd(12)} ${r.kind.padEnd(9)} ${r.deployed ? "deployed  " : "undeployed"}  ${r.status}${r.detail ? " - " + r.detail : ""}`);
  console.log("\n" + fmt.join("\n") + "\n");
  const bad = results.filter((r) => !r.ok);
  const warn = results.filter((r) => r.warning);
  console.log(log({
    status: bad.length ? "failure" : "success",
    checked: results.length,
    failures: bad.map((r) => `${r.dropItemId} ${r.kind}: ${r.status}`),
    warnings: warn.map((r) => `${r.dropItemId} ${r.kind}: ${r.status}`),
    message: bad.length ? `${bad.length} upload(s) need attention before any deploy.` : `All ${results.length} checked; ${warn.length} warning(s).`,
  }));
  process.exit(bad.length ? 1 : 0);
}

if (require.main === module) {
  main().catch((err) => { console.log(log({ status: "failure", reason: "unhandled_error", message: err.message })); process.exit(3); });
}

module.exports = { judge, idOf };
