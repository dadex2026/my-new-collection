/**
 * scripts/lib/csv.js
 *
 * Minimal RFC4180 read and write. Written out rather than pulled in as a
 * dependency — the backend has no CSV library and two scripts do not justify
 * adding one.
 *
 * Shared by compose-post.js (reads) and set-post-url.js (reads one row and
 * rewrites it). They were duplicating a parser, which is the point where two
 * copies start to disagree about quoting.
 */
"use strict";

// Handles quoted fields, embedded commas, doubled quotes and CRLF.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Header row plus data rows, as objects keyed by column name.
function parseCsvRecords(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { header: [], records: [] };
  const header = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((cells) => {
    const record = {};
    header.forEach((key, i) => { record[key] = (cells[i] ?? "").trim(); });
    return record;
  });
  return { header, records };
}

// One physical line. Returns null when the line's quotes do not close, which
// means the row wraps onto the next line — the caller must decide what to do
// rather than getting a silently truncated field list.
function parseLine(line) {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (inQuotes && line[i + 1] === '"') { i++; continue; }
      inQuotes = !inQuotes;
    }
  }
  if (inQuotes) return null;
  const rows = parseCsv(line);
  return rows.length ? rows[0] : null;
}

// Quote only when the value would otherwise change meaning. Keeping quoting
// minimal matters for set-post-url.js: it rewrites one line in place, and a
// rule that quoted everything would make that line differ from its neighbours
// for no reason.
function serializeField(value) {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function serializeRow(fields) {
  return fields.map(serializeField).join(",");
}

module.exports = { parseCsv, parseCsvRecords, parseLine, serializeField, serializeRow };
