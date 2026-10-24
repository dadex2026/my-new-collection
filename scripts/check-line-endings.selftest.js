#!/usr/bin/env node
/**
 * scripts/check-line-endings.selftest.js
 *
 * Exercises check-line-endings.js's byte conversion and its verifier, offline.
 * The verifier is what makes --fix safe, so it is tested on the corruption it
 * exists to refuse.
 *
 *   node scripts/check-line-endings.selftest.js
 */
"use strict";

const assert = require("assert");
const path = require("path");
const { stripCrlf, onlyCrlfCrsRemoved } = require(path.join(__dirname, "check-line-endings.js"));

function ok(label, detail) {
  console.log(`  ok  ${label}${detail ? " — " + detail : ""}`);
}

const b = (...bytes) => Buffer.from(bytes);

(async () => {
  console.log("\n  check-line-endings.js — byte conversion, offline\n");

  const r = stripCrlf(Buffer.from("a\r\nb\r\nc"));
  assert.strictEqual(r.out.toString(), "a\nb\nc");
  assert.strictEqual(r.removed, 2);
  assert.strictEqual(r.loneCr, 0);
  ok("CRLF becomes LF, and the count is exact", "2 removed");

  // Windows-1252: 0x97 is an em dash there and invalid UTF-8 on its own.
  const w1252 = b(0x2f, 0x2f, 0x20, 0x97, 0x0d, 0x0a, 0x78, 0x0d, 0x0a);
  const c = stripCrlf(w1252);
  assert.ok(c.out.equals(b(0x2f, 0x2f, 0x20, 0x97, 0x0a, 0x78, 0x0a)));
  assert.ok(onlyCrlfCrsRemoved(w1252, c.out));
  const viaUtf8 = Buffer.from(w1252.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
  assert.ok(!onlyCrlfCrsRemoved(w1252, viaUtf8));
  ok("byte 0x97 survives; a UTF-8 round trip is caught as corruption", "the reason --fix never decodes");

  const lone = stripCrlf(Buffer.from("a\rb\r\n"));
  assert.strictEqual(lone.loneCr, 1);
  assert.strictEqual(lone.removed, 1);
  ok("a lone CR is counted, not removed", "--fix refuses such a file");

  const src = Buffer.from("x\r\ny\r\n");
  assert.ok(onlyCrlfCrsRemoved(src, Buffer.from("x\ny\n")));
  assert.ok(onlyCrlfCrsRemoved(src, src));
  assert.ok(!onlyCrlfCrsRemoved(src, Buffer.from("x\ny")));       // a byte lost
  assert.ok(!onlyCrlfCrsRemoved(src, Buffer.from("x\nz\n")));     // a byte changed
  assert.ok(!onlyCrlfCrsRemoved(src, Buffer.from("x\ny\n\n")));   // a byte added
  assert.ok(!onlyCrlfCrsRemoved(Buffer.from("a\rb"), Buffer.from("ab"))); // a lone CR removed
  ok("the verifier passes only CR-before-LF removals", "lost, changed, added bytes and a lone CR all refused");

  console.log("\n  All local assertions held.\n");
})().catch((err) => {
  console.error("\n  FAILED: " + err.message + "\n");
  process.exit(1);
});
