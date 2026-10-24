/**
 * scripts/lib/placeholder.js
 *
 * The one definition of "this URL is not a real upload yet". Every script that
 * guards itemImage, uri or collectionImage calls this; none may define its own.
 *
 * WHY IT IS SHARED
 *   Until 2026-10-21 nine scripts each carried a copy, and the copies had
 *   drifted: four did not reject the sample markers below, and get-holders.js
 *   did not reject a whitespace-only value. Closing item 52's hole then took
 *   nine edits, one per copy (open-items 52). Consolidating meant choosing a
 *   behaviour, and the choice was the UNION of what the copies rejected - every
 *   call site became stricter or stayed the same, none became more lenient,
 *   because these checks stand in front of permanent uploads and an immutable
 *   candy machine. The per-copy differences resolved are recorded in item 52.
 *
 * WHAT COUNTS AS A PLACEHOLDER
 *   - missing, empty or whitespace-only
 *   - a placehold.co or example.com URL (substring: "myexample.com" also
 *     matches - consistent across all nine copies before, kept, recorded)
 *   - the sample markers AbCdEf and ImageHash (added with the self-protecting
 *     sample row, 2026-07-15). "ImageHash" cannot occur in a real Irys id,
 *     which is base58 and has no "I"; "AbCdEf" can, at roughly one id in a
 *     billion, which is accepted.
 *   - an upload dry run's fake id: gateway.irys.xyz/ then 43 lowercase hex
 *     characters. A real id is base58, which has no "0".
 */
"use strict";

const SAMPLE_HOSTS = ["placehold.co", "example.com"];
const SAMPLE_MARKERS = ["AbCdEf", "ImageHash"];
const DRY_RUN_FAKE = /gateway\.irys\.xyz\/[0-9a-f]{43}$/;

function isPlaceholder(value) {
  if (value == null) return true;
  const url = String(value).trim();
  if (url === "") return true;
  if (SAMPLE_HOSTS.some((h) => url.includes(h))) return true;
  if (SAMPLE_MARKERS.some((m) => url.includes(m))) return true;
  if (DRY_RUN_FAKE.test(url)) return true;
  return false;
}

module.exports = { isPlaceholder };
