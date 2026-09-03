#!/usr/bin/env node
/**
 * scripts/tx-cost.js
 *
 * What did a transaction actually cost the fee payer? Reads the chain and
 * reports the payer's net lamport change, split into transaction fee and
 * everything else (which for a mint is account rent).
 *
 * WHY THIS EXISTS
 *   airdrop.js's own header estimated "a few thousand lamports per recipient"
 *   for months. Measured on 2026-09-02 the real figure was 3,479,680 lamports
 *   - the estimate had described the FEE and omitted the rent, understating
 *   the cost by roughly 350x. Nobody had run the number, and the number is
 *   what decides whether an airdrop or a claim campaign is the cheaper way to
 *   distribute anything. This script exists so the answer is measured.
 *
 * Read-only. No keys, no writes, no chain state changed.
 *
 * Exit codes:
 *   0 = every signature reported
 *   1 = bad usage
 *   3 = RPC failure, or a signature the RPC would not return
 *
 * Usage:
 *   node scripts/tx-cost.js <signature>
 *   node scripts/tx-cost.js <sig> <sig> <sig>      (totals them)
 *   node scripts/tx-cost.js --json <signature>     (machine-readable)
 */
"use strict";

const fs = require("fs");
const path = require("path");

const BACKEND_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(BACKEND_DIR, "config.json");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");
const LAMPORTS_PER_SOL = 1e9;

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "tx-cost", ...event };
  console.log(JSON.stringify(entry));
  fs.appendFileSync(path.join(LOGS_DIR, "tx-cost.log"), JSON.stringify(entry) + "\n");
}

function fail(reason, message, exitCode) {
  log({ status: "failure", reason, message });
  process.exit(exitCode);
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fail("missing_config", `backend/config.json not found at ${CONFIG_PATH}`, 1);
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    fail("invalid_config_json", `config.json is not valid JSON: ${err.message}`, 1);
  }
  if (!config.rpc) fail("incomplete_config", "config.json is missing required field: rpc", 1);
  return config;
}

async function fetchTransaction(rpc, signature) {
  let response;
  try {
    response = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "tx-cost",
        method: "getTransaction",
        params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
      }),
    });
  } catch (err) {
    fail("rpc_unreachable", `Could not reach ${rpc}: ${err.message}`, 3);
  }
  if (!response.ok) fail("rpc_error", `RPC returned HTTP ${response.status}`, 3);

  let body;
  try {
    body = await response.json();
  } catch (err) {
    fail("rpc_bad_json", `RPC returned a non-JSON body: ${err.message}`, 3);
  }
  if (body.error) fail("rpc_error", `RPC error: ${JSON.stringify(body.error)}`, 3);

  // A transaction outside the RPC's retention window returns null with no error.
  // Reporting that as a zero cost would be worse than saying nothing.
  if (!body.result) {
    fail(
      "transaction_not_found",
      `${signature} was not returned by ${rpc}. It may be outside this RPC's history retention, ` +
        "or the proxy may not forward getTransaction.",
      3
    );
  }
  return body.result;
}

function describe(signature, tx) {
  const meta = tx.meta;
  const keys = tx.transaction.message.accountKeys;
  const payer = keys[0].pubkey || keys[0];
  const net = meta.preBalances[0] - meta.postBalances[0];
  return {
    signature,
    slot: tx.slot,
    feePayer: payer,
    status: meta.err ? JSON.stringify(meta.err) : "success",
    netLamports: net,
    netSol: net / LAMPORTS_PER_SOL,
    feeLamports: meta.fee,
    rentLamports: net - meta.fee,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const signatures = args.filter((a) => !a.startsWith("--"));

  if (signatures.length === 0) {
    fail("missing_signature", "Required: at least one transaction signature. See the header for usage.", 1);
  }

  const config = loadConfig();
  const results = [];

  for (const signature of signatures) {
    const tx = await fetchTransaction(config.rpc, signature);
    const r = describe(signature, tx);
    results.push(r);

    if (asJson) {
      log({ status: "measured", ...r });
      continue;
    }

    console.log(`
signature       ${r.signature}
slot            ${r.slot}
fee payer       ${r.feePayer}
status          ${r.status}
payer net cost  ${r.netLamports.toLocaleString()} lamports  =  ${r.netSol.toFixed(9)} SOL
  transaction fee   ${r.feeLamports.toLocaleString()} lamports
  rent + remainder  ${r.rentLamports.toLocaleString()} lamports`);
  }

  const total = results.reduce((sum, r) => sum + r.netLamports, 0);
  if (signatures.length > 1 && !asJson) {
    console.log(
      `\ntotal across ${signatures.length}: ${total.toLocaleString()} lamports = ` +
        `${(total / LAMPORTS_PER_SOL).toFixed(9)} SOL`
    );
  }

  log({
    status: "success",
    measured: results.length,
    totalLamports: total,
    totalSol: total / LAMPORTS_PER_SOL,
  });
}

main().catch((err) => {
  fail("unexpected_error", err && err.stack ? err.stack : String(err), 3);
});
