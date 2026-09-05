#!/usr/bin/env node
/**
 * scripts/update-candy-machine-supply.js
 *
 * Changes itemsAvailable on a DEPLOYED candy machine - the cap on how many
 * assets it can ever mint.
 *
 * WHY THIS EXISTS
 *   For a supply model where editions start capped and the cap GROWS as
 *   rewards are earned, this is the whole mechanism: one machine, one
 *   counter, and a number that goes up. The alternative is a separate candy
 *   machine per reward path, which is what campaigns already do and which
 *   costs a deploy per edition.
 *
 * WHAT IS UNVERIFIED, AND WHY THIS SCRIPT IS FIRST A TEST
 *   `updateCandyMachine` rewrites the whole CandyMachineData struct, and
 *   itemsAvailable is a field in it, so the INSTRUCTION shape permits an
 *   increase. Whether the PROGRAM accepts one is a different question, and
 *   nothing in the package answers it. With hiddenSettings there are no
 *   config lines, so the account size does not depend on itemsAvailable and
 *   an increase ought to be allowed - but "ought to" is exactly the reasoning
 *   this repo has been wrong with before. The read-back below is the answer;
 *   run it against a machine nobody depends on first.
 *
 * WHAT IT PRESERVES
 *   Everything except itemsAvailable is read off the chain and written back
 *   verbatim: maxEditionSupply, isMutable, configLineSettings, hiddenSettings.
 *   hiddenSettings carries the name and uri every mint from this machine uses,
 *   so re-deriving it from master.csv rather than reading it would silently
 *   repoint a live drop at whatever the CSV says today.
 *
 * Exit codes:
 *   0 = read-only report, plan printed, or write confirmed and read back correct
 *   1 = validation failure (bad args, not the authority, decrease below minted)
 *   2 = chain failure (fetch or transaction failed)
 *   3 = read-back mismatch - THE WRITE LANDED AND itemsAvailable IS NOT WHAT WAS ASKED
 *
 * Usage:
 *   node scripts/update-candy-machine-supply.js --drop TEST-004
 *   node scripts/update-candy-machine-supply.js --drop TEST-004 --items-available 8
 *   node scripts/update-candy-machine-supply.js --drop TEST-004 --items-available 8 --write --yes
 *   node scripts/update-candy-machine-supply.js --candy-machine <address> --items-available 8
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { parseCsvRecords, serializeRow } = require("./lib/csv");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env.admin") });

const BACKEND_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(BACKEND_DIR, "config.json");
const MASTER_CSV_PATH = path.join(BACKEND_DIR, "master.csv");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function bigintSafe(_k, v) {
  return typeof v === "bigint" ? v.toString() : v;
}

function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "update-candy-machine-supply", ...event };
  const line = JSON.stringify(entry, bigintSafe);
  console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, "update-candy-machine-supply.log"), line + "\n");
}

function fail(reason, message, exitCode) {
  log({ status: "failure", reason, message });
  process.exit(exitCode);
}

function decodeBase58(str) {
  const bytes = [0];
  for (const char of str) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value < 0) throw new Error("Invalid base58 character: " + char);
    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (const char of str) { if (char === "1") bytes.push(0); else break; }
  return new Uint8Array(bytes.reverse());
}

function encodeBase58(buffer) {
  const digits = [0];
  for (let i = 0; i < buffer.length; i++) {
    let carry = buffer[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let result = "";
  for (let k = 0; buffer[k] === 0 && k < buffer.length - 1; k++) result += "1";
  for (let i = digits.length - 1; i >= 0; i--) result += BASE58_ALPHABET[digits[i]];
  return result;
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) fail("missing_config", `backend/config.json not found at ${CONFIG_PATH}`, 1);
  let config;
  try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")); }
  catch (err) { fail("invalid_config_json", `config.json is not valid JSON: ${err.message}`, 1); }
  for (const k of ["network", "rpc"]) if (!config[k]) fail("incomplete_config", `config.json is missing ${k}`, 1);
  return config;
}

function findDropRow(dropItemId) {
  if (!fs.existsSync(MASTER_CSV_PATH)) fail("missing_master_csv", `backend/master.csv not found`, 1);
  const { records } = parseCsvRecords(fs.readFileSync(MASTER_CSV_PATH, "utf8"));
  const matches = records.filter((r) => r.dropItemId === dropItemId);
  if (matches.length === 0) fail("unknown_drop", `No row in master.csv has dropItemId "${dropItemId}"`, 1);
  if (matches.length > 1) {
    fail("ambiguous_drop",
      `dropItemId "${dropItemId}" appears in ${matches.length} rows (${matches.map((r) => r.collectionSlug).join(", ")}). Pass --candy-machine instead.`, 1);
  }
  return matches[0];
}

// master.csv's maxSupply is what the card renders and what a future
// deploy-candy-machine.js would use. Raising the on-chain cap without it
// leaves the site advertising the old number.
function writeMaxSupply(dropItemId, itemsAvailable) {
  const { header, records } = parseCsvRecords(fs.readFileSync(MASTER_CSV_PATH, "utf8"));
  const target = records.find((r) => r.dropItemId === dropItemId);
  if (!target) {
    console.log(`  ! Could not find "${dropItemId}" in master.csv to record the new cap.`);
    return;
  }
  target.maxSupply = String(itemsAvailable);
  const lines = [serializeRow(header)];
  for (const r of records) lines.push(serializeRow(header.map((k) => (r[k] !== undefined ? r[k] : ""))));
  fs.writeFileSync(MASTER_CSV_PATH, lines.join("\n") + "\n", "utf8");
  console.log(`  master.csv updated: ${dropItemId}.maxSupply = ${itemsAvailable}`);
  console.log("  Run `node scripts/generate-registry.js` and redeploy for the site to show it.\n");
  log({ status: "info", message: "master.csv maxSupply written", dropItemId, maxSupply: itemsAvailable });
}

async function getUmi(rpc, requireSigner) {
  const umiBundleDefaults = await import("@metaplex-foundation/umi-bundle-defaults");
  const mplCore = await import("@metaplex-foundation/mpl-core");
  const mplCandyMachine = await import("@metaplex-foundation/mpl-core-candy-machine");
  const umiCore = await import("@metaplex-foundation/umi");

  const umi = umiBundleDefaults.createUmi(rpc).use(mplCore.mplCore()).use(mplCandyMachine.mplCandyMachine());

  const secret = process.env.DEPLOYER_PRIVATE_KEY;
  if (!secret) {
    if (!requireSigner) return { umi, umiCore, mplCandyMachine, signer: null };
    fail("missing_deployer_key", "DEPLOYER_PRIVATE_KEY not set in backend/.env.admin", 1);
  }
  let keypair;
  try { keypair = umi.eddsa.createKeypairFromSecretKey(decodeBase58(secret.trim())); }
  catch (err) { fail("invalid_deployer_key", `Could not derive keypair: ${err.message}`, 1); }
  umi.use(umiCore.keypairIdentity(keypair));
  return { umi, umiCore, mplCandyMachine, signer: keypair.publicKey.toString() };
}

function describeData(data) {
  return JSON.stringify(
    {
      itemsAvailable: data.itemsAvailable,
      maxEditionSupply: data.maxEditionSupply,
      isMutable: data.isMutable,
      configLineSettings: data.configLineSettings,
      hiddenSettings: data.hiddenSettings,
    },
    bigintSafe,
    2
  );
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(name);
    return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
  };

  const dropItemId = flag("--drop");
  const candyMachineFlag = flag("--candy-machine");
  const itemsRaw = flag("--items-available");
  const write = args.includes("--write");
  const confirmed = args.includes("--yes");

  const config = loadConfig();

  let row = null;
  let candyMachineAddress = candyMachineFlag;
  if (!candyMachineAddress) {
    if (!dropItemId) fail("missing_target", "Pass --drop <dropItemId> or --candy-machine <address>", 1);
    row = findDropRow(dropItemId);
    candyMachineAddress = row.candyMachineAddress;
    if (!candyMachineAddress) fail("not_deployed", `Drop "${dropItemId}" has no candyMachineAddress`, 1);
  }
  if (!ADDRESS_PATTERN.test(candyMachineAddress)) {
    fail("invalid_candy_machine", `"${candyMachineAddress}" does not look like a Solana address`, 1);
  }

  const wantsChange = itemsRaw !== null;
  let itemsAvailable = null;
  if (wantsChange) {
    itemsAvailable = Number(itemsRaw);
    if (!Number.isInteger(itemsAvailable) || itemsAvailable < 0) {
      fail("invalid_items_available", `--items-available "${itemsRaw}" must be a non-negative whole number`, 1);
    }
  }

  log({
    status: "start",
    network: config.network,
    candyMachineAddress,
    dropItemId: dropItemId || null,
    itemsAvailable,
    mode: !wantsChange ? "read-only" : write ? "write" : "plan",
  });

  const { umi, umiCore, mplCandyMachine, signer } = await getUmi(config.rpc, wantsChange && write);

  let cm;
  try {
    cm = await mplCandyMachine.fetchCandyMachine(umi, umiCore.publicKey(candyMachineAddress));
  } catch (err) {
    fail("fetch_failed", `Could not fetch candy machine ${candyMachineAddress}: ${err.message}`, 2);
  }

  const current = Number(cm.data.itemsAvailable);
  const redeemed = Number(cm.itemsRedeemed);

  console.log("\n" + "=".repeat(72));
  console.log("CANDY MACHINE AS IT STANDS");
  console.log("=".repeat(72));
  console.log(`  address         ${candyMachineAddress}`);
  console.log(`  network         ${config.network}`);
  console.log(`  authority       ${cm.authority.toString()}`);
  console.log(`  signer          ${signer || "(none - read-only)"}`);
  console.log(`  itemsAvailable  ${current}`);
  console.log(`  itemsRedeemed   ${redeemed}`);
  console.log(`  remaining       ${current - redeemed}`);
  console.log("\n" + describeData(cm.data));

  if (!wantsChange) {
    log({ status: "success", message: "Read-only: printed current supply, wrote nothing." });
    process.exit(0);
  }

  if (itemsAvailable === current) {
    fail("no_change", `itemsAvailable is already ${current}. Nothing to do.`, 1);
  }
  // Below what has already been minted is not a smaller cap, it is an
  // inconsistent account: itemsRedeemed would exceed itemsAvailable.
  if (itemsAvailable < redeemed) {
    fail(
      "below_redeemed",
      `Refusing to set itemsAvailable to ${itemsAvailable} when ${redeemed} have already been minted.`,
      1
    );
  }
  if (signer && cm.authority.toString() !== signer) {
    fail("not_authority", `Signing key ${signer} is not this machine's authority (${cm.authority.toString()}).`, 1);
  }

  console.log("\n" + "=".repeat(72));
  console.log("CHANGE");
  console.log("=".repeat(72));
  console.log(`  itemsAvailable  ${current}  ->  ${itemsAvailable}   (${itemsAvailable > current ? "+" : ""}${itemsAvailable - current})`);
  console.log(`  everything else read from the chain and written back unchanged`);
  if (itemsAvailable < current) {
    console.log(`\n  ! This REDUCES the cap. Remaining drops from ${current - redeemed} to ${itemsAvailable - redeemed}.`);
  }

  if (!write) {
    console.log("\nPlan only - nothing was sent. Re-run with --write --yes to apply it.\n");
    log({ status: "success", message: "Plan printed; no transaction sent." });
    process.exit(0);
  }
  if (!confirmed) {
    fail("not_confirmed", `--write requires --yes. This changes a deployed candy machine on ${config.network}.`, 1);
  }

  let signature;
  try {
    const builder = mplCandyMachine.updateCandyMachine(umi, {
      candyMachine: umiCore.publicKey(candyMachineAddress),
      data: { ...cm.data, itemsAvailable },
    });
    const result = await builder.sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
    signature = encodeBase58(Buffer.from(result.signature));
  } catch (err) {
    // A refusal here is the ANSWER, not a bug: it means the program does not
    // permit this change on this machine, and the growing-cap supply model
    // has to be built from separate candy machines instead.
    fail(
      "update_rejected",
      `updateCandyMachine failed: ${err.message}\n\n` +
        "If this rejected an INCREASE, the one-machine growing-cap model is not available " +
        "and supply must grow by adding candy machines (the way campaigns already do).",
      2
    );
  }

  log({ status: "info", message: "updateCandyMachine confirmed", signature });
  console.log(`\nTransaction confirmed: ${signature}`);
  console.log(`  node scripts/tx-cost.js ${signature}   # what it cost`);

  // Poll, for the reason recorded on 2026-09-03: a re-fetch immediately after
  // "confirmed" returned the PRE-WRITE account and reported a correct write as
  // a mismatch. A check that cries wolf teaches people to ignore it.
  const ATTEMPTS = 6;
  const DELAY_MS = 2500;
  let after = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, DELAY_MS));
    try {
      after = await mplCandyMachine.fetchCandyMachine(umi, umiCore.publicKey(candyMachineAddress));
    } catch (err) {
      fail("read_back_failed", `Wrote, but could not re-fetch to verify: ${err.message}`, 2);
    }
    if (Number(after.data.itemsAvailable) === itemsAvailable) {
      if (attempt > 1) console.log(`\n  (read-back agreed on attempt ${attempt} - earlier reads were stale)`);
      break;
    }
    if (attempt < ATTEMPTS) console.log(`  read-back attempt ${attempt} still shows ${Number(after.data.itemsAvailable)}, retrying...`);
  }

  console.log("\n" + "=".repeat(72));
  console.log("RE-FETCHED FROM CHAIN");
  console.log("=".repeat(72));
  console.log(`  itemsAvailable  ${Number(after.data.itemsAvailable)}`);
  console.log(`  itemsRedeemed   ${Number(after.itemsRedeemed)}`);
  console.log("\n" + describeData(after.data));

  if (Number(after.data.itemsAvailable) !== itemsAvailable) {
    console.log(`\n  READ-BACK MISMATCH - asked for ${itemsAvailable}, chain says ${Number(after.data.itemsAvailable)}.\n`);
    log({ status: "failure", reason: "read_back_mismatch", signature, asked: itemsAvailable, got: Number(after.data.itemsAvailable) });
    process.exit(3);
  }

  // hiddenSettings carries the name and uri of every asset this machine mints.
  // Confirming it survived is the difference between raising a cap and
  // silently repointing a live drop.
  const beforeHidden = JSON.stringify(cm.data.hiddenSettings, bigintSafe);
  const afterHidden = JSON.stringify(after.data.hiddenSettings, bigintSafe);
  if (beforeHidden !== afterHidden) {
    console.log("\n  ! hiddenSettings CHANGED across the update. Every future mint from this machine\n" +
                "    would carry different metadata. This should not happen - investigate before minting.\n");
    log({ status: "failure", reason: "hidden_settings_changed", signature, before: cm.data.hiddenSettings, after: after.data.hiddenSettings });
    process.exit(3);
  }

  console.log(`\n  Cap changed and read back correctly. hiddenSettings unchanged.\n`);
  console.log(`  ANSWER: this program DOES permit itemsAvailable to be ${itemsAvailable > current ? "increased" : "decreased"} on a live machine.\n`);

  if (row) writeMaxSupply(row.dropItemId, itemsAvailable);
  else console.log("  ! Target given as --candy-machine, so master.csv was NOT updated.\n");

  log({ status: "success", signature, itemsAvailable, message: "Supply updated and read back matching." });
}

main().catch((err) => fail("unexpected_error", err && err.stack ? err.stack : String(err), 2));
