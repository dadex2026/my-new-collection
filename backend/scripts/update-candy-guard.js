#!/usr/bin/env node
/**
 * scripts/update-candy-guard.js
 *
 * Rewrites the guards on an ALREADY DEPLOYED candy machine, in place, in
 * one transaction. This is the migration path for the holder/voucher
 * mechanic: drops deployed before guard groups existed carry a single
 * top-level solPayment and `groups: []`, and there is no way to add a
 * holder route to them except by rewriting the guard account.
 *
 * WHAT IT WRITES
 *
 *   default guards : {} — deliberately empty. See "the default trap".
 *   group "public" : whatever the guard already had at the top level,
 *                    carried over unchanged (solPayment, startDate,
 *                    botTax, mintLimit, ... — whatever is actually there).
 *   group "holder" : assetBurn { requiredCollection }, plus solPayment
 *                    only if --holder-price is given and non-zero.
 *
 * THE DEFAULT TRAP — why the default set is emptied
 *
 * With groups present, Candy Guard treats the top-level guard set as
 * DEFAULTS that every group inherits, and a group's own guards override
 * the same-named default. A group cannot *remove* an inherited default.
 * So leaving solPayment at the top level while adding a free holder group
 * would keep charging holders, and getting it backwards the other way
 * (moving solPayment only into holder) would let the public mint free.
 *
 * This script sidesteps the ambiguity instead of relying on it: the
 * default set is written empty and every guard is stated explicitly in
 * every group that needs it. Nothing is inherited, so nothing depends on
 * inheritance semantics being what the docs say.
 *
 * That claim is still unverified on chain as of 2026-09-03. It is exactly
 * what the TEST-004 rehearsal exists to settle, by observation:
 * mint through `public` and confirm it still charges, mint through
 * `holder` and confirm the asset is gone.
 *
 * READ-BACK IS THE POINT
 *
 * Default mode is read-only: it prints the guard as it stands on chain,
 * then the guard it would write, and stops. --write --yes sends the
 * transaction and then RE-FETCHES and prints the account, comparing it
 * against the plan. A malformed guard write does not error — it lands and
 * misbehaves at mint time. The read-back is what catches it before a mint
 * does, so it is not optional and cannot be skipped.
 *
 * Exit codes:
 *   0 = success (plan printed, or write confirmed and read back matching)
 *   1 = validation failure (bad config/CSV/args, drop not found, no key)
 *   2 = chain failure (fetch failed, transaction failed)
 *   3 = read-back mismatch — THE WRITE LANDED BUT IS NOT WHAT WAS PLANNED
 *
 * Usage:
 *   node scripts/update-candy-guard.js --drop TEST-004 --burn-collection <address>
 *   node scripts/update-candy-guard.js --drop TEST-004 --burn-collection <address> --write --yes
 *   node scripts/update-candy-guard.js --candy-machine <address> --burn-collection <address>
 *   node scripts/update-candy-guard.js --drop TEST-004 --read-only     (just print current state)
 *   node scripts/update-candy-guard.js --drop TEST-004 --burn-collection <a> --verify
 *                                                                       (the resume path: confirm an
 *                                                                        already-migrated guard and
 *                                                                        record it in master.csv,
 *                                                                        without touching the chain)
 *   node scripts/update-candy-guard.js --drop TEST-004 --burn-collection <a> --holder-price 0.005
 *
 * Dependencies (npm install):
 *   @metaplex-foundation/umi
 *   @metaplex-foundation/umi-bundle-defaults
 *   @metaplex-foundation/mpl-core
 *   @metaplex-foundation/mpl-core-candy-machine
 *   dotenv
 * (No bs58 dependency - base58 decoding is done inline below.)
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { parseCsvRecords, serializeRow } = require("./lib/csv");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env.admin") });

// ---- Paths --------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(BACKEND_DIR, "config.json");
const MASTER_CSV_PATH = path.join(BACKEND_DIR, "master.csv");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

// ---- Logging --------------------------------------------------------------

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "update-candy-guard", ...event };
  const line = JSON.stringify(entry, bigintSafe);
  console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, "update-candy-guard.log"), line + "\n");
}

function fail(reason, message, exitCode) {
  log({ status: "failure", reason, message });
  process.exit(exitCode);
}

// JSON.stringify throws on bigint, and every lamport amount coming back
// from the chain is one. Render them as decimal strings, not numbers -
// a lamport count can exceed Number.MAX_SAFE_INTEGER.
function bigintSafe(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

// ---- Base58 decoder (no external dependency) -----------------------------

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

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
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of str) {
    if (char === "1") bytes.push(0);
    else break;
  }
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
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let result = "";
  for (let k = 0; buffer[k] === 0 && k < buffer.length - 1; k++) result += "1";
  for (let i = digits.length - 1; i >= 0; i--) result += BASE58_ALPHABET[digits[i]];
  return result;
}

// ---- Config / CSV --------------------------------------------------------

const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fail("missing_config", `backend/config.json not found. Expected at ${CONFIG_PATH}`, 1);
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    fail("invalid_config_json", `config.json is not valid JSON: ${err.message}`, 1);
  }
  for (const key of ["network", "rpc"]) {
    if (!config[key]) fail("incomplete_config", `config.json is missing required field: ${key}`, 1);
  }
  if (!["devnet", "mainnet"].includes(config.network)) {
    fail("invalid_network", `config.json "network" must be "devnet" or "mainnet", got "${config.network}"`, 1);
  }
  return config;
}

function findDropRow(dropItemId) {
  if (!fs.existsSync(MASTER_CSV_PATH)) {
    fail("missing_master_csv", `backend/master.csv not found. Expected at ${MASTER_CSV_PATH}`, 1);
  }
  const { records } = parseCsvRecords(fs.readFileSync(MASTER_CSV_PATH, "utf8"));
  const matches = records.filter((r) => r.dropItemId === dropItemId);
  if (matches.length === 0) {
    fail("unknown_drop", `No row in master.csv has dropItemId "${dropItemId}"`, 1);
  }
  // dropItemId is unique per collection, not globally. Two collections in
  // one master.csv can both carry a TEST-001. Refusing here is the whole
  // safety of --drop: guessing which one the operator meant is how you
  // rewrite the guard on the wrong live candy machine.
  if (matches.length > 1) {
    const slugs = matches.map((r) => r.collectionSlug).join(", ");
    fail(
      "ambiguous_drop",
      `dropItemId "${dropItemId}" appears in ${matches.length} rows (collectionSlug: ${slugs}). Pass --candy-machine <address> instead.`,
      1
    );
  }
  return matches[0];
}

// Re-reads and rewrites master.csv rather than reusing the rows parsed at
// startup: the write above can take a while to confirm, and clobbering an
// edit made in the meantime would be a silent data loss in the file that
// defines what gets minted.
function writeHolderColumns(dropItemId, burnCollection, holderPrice) {
  const { header, records } = parseCsvRecords(fs.readFileSync(MASTER_CSV_PATH, "utf8"));
  for (const col of ["holderRequiredCollection", "holderPrice"]) {
    if (!header.includes(col)) {
      header.push(col);
      records.forEach((r) => { r[col] = r[col] || ""; });
    }
  }
  const target = records.find((r) => r.dropItemId === dropItemId);
  if (!target) {
    console.log(`  ! Could not find dropItemId "${dropItemId}" in master.csv to record the holder route.`);
    return;
  }
  target.holderRequiredCollection = burnCollection;
  target.holderPrice = String(holderPrice);

  const lines = [serializeRow(header)];
  for (const r of records) {
    lines.push(serializeRow(header.map((k) => (r[k] !== undefined ? r[k] : ""))));
  }
  fs.writeFileSync(MASTER_CSV_PATH, lines.join("\n") + "\n", "utf8");

  console.log(`  master.csv updated: ${dropItemId}.holderRequiredCollection = ${burnCollection}, holderPrice = ${holderPrice}`);
  console.log("  Run `node scripts/generate-registry.js` and redeploy the site for the holder route to appear.\n");
  log({ status: "info", message: "master.csv holder columns written", dropItemId, burnCollection, holderPrice });
}

// ---- Umi setup -----------------------------------------------------------

// requireSigner is false for --read-only. Inspecting a guard is a pure
// account read, and demanding the deploy key to perform one would mean
// loading a mainnet authority key to answer a question that touches
// nothing. The key is required the moment a write is possible.
async function getUmi(rpc, requireSigner) {
  const umiBundleDefaults = await import("@metaplex-foundation/umi-bundle-defaults");
  const mplCore = await import("@metaplex-foundation/mpl-core");
  const mplCandyMachine = await import("@metaplex-foundation/mpl-core-candy-machine");
  const umiCore = await import("@metaplex-foundation/umi");

  const umi = umiBundleDefaults
    .createUmi(rpc)
    .use(mplCore.mplCore())
    .use(mplCandyMachine.mplCandyMachine());

  const secret = process.env.DEPLOYER_PRIVATE_KEY;
  if (!secret) {
    if (!requireSigner) return { umi, umiCore, mplCandyMachine, signer: null };
    fail("missing_deployer_key", "DEPLOYER_PRIVATE_KEY not set in backend/.env.admin", 1);
  }

  let secretKeyBytes;
  try {
    secretKeyBytes = decodeBase58(secret.trim());
  } catch (err) {
    fail("invalid_deployer_key", `DEPLOYER_PRIVATE_KEY is not valid base58: ${err.message}`, 1);
  }

  let keypair;
  try {
    keypair = umi.eddsa.createKeypairFromSecretKey(secretKeyBytes);
  } catch (err) {
    fail("invalid_deployer_key", `Could not derive keypair from DEPLOYER_PRIVATE_KEY: ${err.message}`, 1);
  }

  umi.use(umiCore.keypairIdentity(keypair));

  return { umi, umiCore, mplCandyMachine, signer: keypair.publicKey.toString() };
}

// ---- Guard set rendering -------------------------------------------------

// Fetched guard sets come back with every slot present as an Option:
// { solPayment: { __option: 'Some', value: {...} }, botTax: { __option: 'None' }, ... }.
// Strip the None slots and unwrap the Some ones, so both the printed
// state and the args we hand back to updateCandyGuard are plain objects
// naming only the guards that are actually set.
function unwrapGuardSet(guardSet) {
  const out = {};
  for (const [name, slot] of Object.entries(guardSet || {})) {
    if (slot && typeof slot === "object" && "__option" in slot) {
      if (slot.__option === "Some") out[name] = slot.value;
    } else if (slot !== undefined && slot !== null) {
      out[name] = slot;
    }
  }
  return out;
}

// The groups come back with all 31 guard slots present, 29 of them None.
// Printing that raw buries the two that are set in 200 lines of noise -
// which is what the first real run of this script did, at the exact moment
// somebody needed to read the output carefully.
function unwrapGroups(groups) {
  return (groups || []).map((g) => ({ label: g.label, guards: unwrapGuardSet(g.guards) }));
}

function guardNames(guards) {
  const names = Object.keys(guards);
  return names.length > 0 ? names.join(", ") : "(none)";
}

function describe(value) {
  return JSON.stringify(value, bigintSafe, 2);
}

// A guard account is "already grouped" if it has any groups at all. The
// migration is written for the ungrouped shape and would silently discard
// existing groups, so it refuses rather than guessing how to merge.
function assertMigratable(current) {
  if (Array.isArray(current.groups) && current.groups.length > 0) {
    const labels = current.groups.map((g) => g.label).join(", ");
    fail(
      "already_grouped",
      `This candy guard already has ${current.groups.length} group(s): ${labels}. ` +
        `This script migrates the ungrouped shape only, and would discard them. Edit the guard deliberately instead.`,
      1
    );
  }
}

// ---- Plan ----------------------------------------------------------------

function buildPlan(currentDefaultGuards, options) {
  const { burnCollection, holderPrice, treasury, umiCore } = options;

  // Everything the guard had at the top level moves into `public`
  // verbatim. Not re-derived from master.csv: what is on chain is the
  // truth about what this drop currently enforces, and a CSV edited since
  // deploy would silently change the public terms during a migration
  // that is supposed to leave them alone.
  const publicGuards = { ...currentDefaultGuards };

  const holderGuards = {};

  // startDate and botTax apply to both routes, so they are restated in
  // holder rather than inherited - the default set is empty by design.
  if (publicGuards.startDate) holderGuards.startDate = publicGuards.startDate;
  if (publicGuards.botTax) holderGuards.botTax = publicGuards.botTax;

  // mintLimit is deliberately NOT carried into holder. It is a per-wallet
  // counter keyed by id, so reusing the same id would make public and
  // holder mints share one allowance. Burning is the holder's limit:
  // a wallet can redeem exactly as many vouchers as it holds.
  holderGuards.assetBurn = { requiredCollection: umiCore.publicKey(burnCollection) };

  if (holderPrice && holderPrice > 0) {
    holderGuards.solPayment = {
      lamports: umiCore.sol(holderPrice),
      destination: umiCore.publicKey(treasury),
    };
  }

  return {
    guards: {}, // see "the default trap" in the header
    groups: [
      { label: "public", guards: publicGuards },
      { label: "holder", guards: holderGuards },
    ],
  };
}

// ---- Read-back verification ----------------------------------------------

// Compares the guard account as re-fetched against the plan, by guard
// NAME per group. Deep-comparing values would fail on representational
// noise (bigint vs number, PublicKey wrappers) and teach the operator to
// ignore the check, which is worse than not having it. Names per group is
// the thing that actually goes wrong in a malformed write.
function verifyReadBack(plan, refetched) {
  const problems = [];

  const defaultNames = Object.keys(unwrapGuardSet(refetched.guards));
  if (defaultNames.length > 0) {
    problems.push(
      `default guard set should be empty but has: ${defaultNames.join(", ")} — ` +
        `these are inherited by EVERY group, including holder`
    );
  }

  const plannedLabels = plan.groups.map((g) => g.label);
  const actualLabels = (refetched.groups || []).map((g) => g.label);
  if (plannedLabels.join("|") !== actualLabels.join("|")) {
    problems.push(`groups are [${actualLabels.join(", ")}], expected [${plannedLabels.join(", ")}]`);
    return problems;
  }

  for (const planned of plan.groups) {
    const actual = refetched.groups.find((g) => g.label === planned.label);
    const plannedNames = Object.keys(planned.guards).sort();
    const actualNames = Object.keys(unwrapGuardSet(actual.guards)).sort();
    if (plannedNames.join("|") !== actualNames.join("|")) {
      problems.push(
        `group "${planned.label}" has guards [${actualNames.join(", ")}], expected [${plannedNames.join(", ")}]`
      );
    }
  }

  return problems;
}

// ---- --verify: confirm an already-migrated guard, then record it --------

// The resume path. A confirmed transaction plus a stale read leaves the chain
// correct and master.csv untouched, because the write of those columns sits
// after the read-back check by design. Re-running --write is not the fix -
// the script refuses a guard that already has groups, and rightly. This
// checks the guard that is actually there against what the migration was
// supposed to produce, and records it only if it holds.
//
// It re-derives the expectation from the arguments rather than from the
// account, so it cannot rubber-stamp whatever it happens to find.
function verifyMigrated(candyGuard, { burnCollection, holderPrice }) {
  const problems = [];

  const defaults = unwrapGuardSet(candyGuard.guards);
  if (Object.keys(defaults).length > 0) {
    problems.push(`default guard set is not empty: ${guardNames(defaults)} — every group inherits these`);
  }

  const groups = unwrapGroups(candyGuard.groups);
  const labels = groups.map((g) => g.label);
  if (labels.join("|") !== "public|holder") {
    problems.push(`groups are [${labels.join(", ")}], expected [public, holder]`);
    return problems;
  }

  const holder = groups.find((g) => g.label === "holder").guards;
  if (!holder.assetBurn) {
    problems.push(`holder group has [${guardNames(holder)}] — no assetBurn, so nothing is consumed on redemption`);
  } else {
    const required = String(holder.assetBurn.requiredCollection);
    if (required !== burnCollection) {
      problems.push(`holder assetBurn.requiredCollection is ${required}, expected ${burnCollection}`);
    }
  }

  const holderCharges = Boolean(holder.solPayment);
  if (holderPrice > 0 && !holderCharges) {
    problems.push(`--holder-price ${holderPrice} was given but the holder group has no solPayment`);
  }
  if (holderPrice === 0 && holderCharges) {
    problems.push(`holder group charges solPayment but --holder-price is 0 — redemption would not be free`);
  }

  const pub = groups.find((g) => g.label === "public").guards;
  if (!pub.solPayment) {
    problems.push(`public group has [${guardNames(pub)}] — no solPayment, so the public mint is FREE`);
  }

  return problems;
}

// ---- Main ---------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  const flagValue = (name) => {
    const i = args.indexOf(name);
    return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
  };

  const dropItemId = flagValue("--drop");
  const candyMachineFlag = flagValue("--candy-machine");
  const burnCollection = flagValue("--burn-collection");
  const holderPriceRaw = flagValue("--holder-price");
  const treasuryFlag = flagValue("--treasury");
  const readOnly = args.includes("--read-only");
  const verifyOnly = args.includes("--verify");
  const write = args.includes("--write");
  const confirmed = args.includes("--yes");

  const config = loadConfig();

  let row = null;
  let candyMachineAddress = candyMachineFlag;
  if (!candyMachineAddress) {
    if (!dropItemId) {
      fail("missing_target", "Pass --drop <dropItemId> or --candy-machine <address>", 1);
    }
    row = findDropRow(dropItemId);
    candyMachineAddress = row.candyMachineAddress;
    if (!candyMachineAddress) {
      fail("not_deployed", `Drop "${dropItemId}" has no candyMachineAddress in master.csv — nothing to update`, 1);
    }
  }
  if (!ADDRESS_PATTERN.test(candyMachineAddress)) {
    fail("invalid_candy_machine", `"${candyMachineAddress}" does not look like a Solana address`, 1);
  }

  const treasury = treasuryFlag || (row && row.treasury) || config.treasury;
  const holderPrice = holderPriceRaw === null ? 0 : Number(holderPriceRaw);
  if (holderPriceRaw !== null && !Number.isFinite(holderPrice)) {
    fail("invalid_holder_price", `--holder-price "${holderPriceRaw}" is not a number`, 1);
  }

  if (!readOnly) {
    if (!burnCollection) {
      fail("missing_burn_collection", "Pass --burn-collection <address> (the collection whose asset is burned to redeem), or --read-only to just inspect", 1);
    }
    if (!ADDRESS_PATTERN.test(burnCollection)) {
      fail("invalid_burn_collection", `--burn-collection "${burnCollection}" does not look like a Solana address`, 1);
    }
    if (holderPrice > 0 && !ADDRESS_PATTERN.test(treasury || "")) {
      fail("invalid_treasury", `--holder-price is set but no valid treasury address was found (got "${treasury}")`, 1);
    }
  }

  log({
    status: "start",
    network: config.network,
    candyMachineAddress,
    dropItemId: dropItemId || null,
    burnCollection: burnCollection || null,
    holderPrice,
    mode: readOnly ? "read-only" : verifyOnly ? "verify" : write ? "write" : "plan",
  });

  const { umi, umiCore, mplCandyMachine, signer } = await getUmi(config.rpc, !readOnly);

  // ---- Fetch the candy machine and locate its guard --------------------
  let candyMachine;
  try {
    candyMachine = await mplCandyMachine.fetchCandyMachine(umi, umiCore.publicKey(candyMachineAddress));
  } catch (err) {
    fail("fetch_candy_machine_failed", `Could not fetch candy machine ${candyMachineAddress}: ${err.message}`, 2);
  }

  const [candyGuardPda] = mplCandyMachine.findCandyGuardPda(umi, { base: umiCore.publicKey(candyMachineAddress) });

  // The candy machine's mintAuthority IS the candy guard for a machine
  // created through this pipeline. If the derived PDA and the recorded
  // mint authority disagree, this machine was not wrapped the way we
  // assume and writing to the derived PDA would edit a guard that
  // controls nothing. Stop rather than write into the void.
  if (candyMachine.mintAuthority.toString() !== candyGuardPda.toString()) {
    fail(
      "guard_mismatch",
      `Candy machine's mintAuthority (${candyMachine.mintAuthority.toString()}) is not the derived candy guard PDA ` +
        `(${candyGuardPda.toString()}). This machine is not guard-wrapped as expected — refusing to write.`,
      1
    );
  }

  let candyGuard;
  try {
    candyGuard = await mplCandyMachine.fetchCandyGuard(umi, candyGuardPda);
  } catch (err) {
    fail("fetch_candy_guard_failed", `Could not fetch candy guard ${candyGuardPda.toString()}: ${err.message}`, 2);
  }

  const currentDefaultGuards = unwrapGuardSet(candyGuard.guards);

  console.log("\n" + "=".repeat(72));
  console.log("CANDY MACHINE");
  console.log("=".repeat(72));
  console.log(`  address        ${candyMachineAddress}`);
  console.log(`  network        ${config.network}`);
  console.log(`  authority      ${candyMachine.authority.toString()}`);
  console.log(`  signer         ${signer || "(none - read-only)"}`);
  console.log(`  candy guard    ${candyGuardPda.toString()}`);
  console.log(`  itemsRedeemed  ${candyMachine.itemsRedeemed}`);

  if (signer && candyMachine.authority.toString() !== signer) {
    console.log(
      `\n  ! The signing key is not this candy machine's authority. The update will be rejected on chain.`
    );
  }
  if (Number(candyMachine.itemsRedeemed) > 0) {
    console.log(
      `\n  ! ${candyMachine.itemsRedeemed} item(s) have already been minted from this machine. ` +
        `Changing its terms now changes them for a live drop.`
    );
  }

  console.log("\n" + "=".repeat(72));
  console.log("GUARD AS IT STANDS ON CHAIN");
  console.log("=".repeat(72));
  console.log(`  default guards : ${guardNames(currentDefaultGuards)}`);
  const currentGroups = unwrapGroups(candyGuard.groups);
  console.log(
    `  groups         : ${currentGroups.length === 0 ? "(none)" : currentGroups.map((g) => `${g.label} [${guardNames(g.guards)}]`).join("  ")}`
  );
  console.log("\n" + describe({ guards: currentDefaultGuards, groups: unwrapGroups(candyGuard.groups) }));

  if (readOnly) {
    log({ status: "success", message: "Read-only: printed current guard state, wrote nothing." });
    process.exit(0);
  }

  if (verifyOnly) {
    const problems = verifyMigrated(candyGuard, { burnCollection, holderPrice });
    if (problems.length > 0) {
      console.log("\n  This guard is NOT the migration it was asked to verify:\n");
      problems.forEach((p) => console.log(`   - ${p}`));
      console.log("\n  master.csv was not touched.\n");
      log({ status: "failure", reason: "verify_mismatch", problems });
      process.exit(3);
    }
    console.log("\n  Verified on chain: empty defaults, public charges, holder burns.\n");
    if (row) {
      writeHolderColumns(row.dropItemId, burnCollection, holderPrice);
    } else {
      console.log("  ! Target was given as --candy-machine, so master.csv was NOT updated.\n");
    }
    log({ status: "success", message: "Verified an already-migrated guard and recorded it." });
    process.exit(0);
  }

  assertMigratable(candyGuard);

  const plan = buildPlan(currentDefaultGuards, { burnCollection, holderPrice, treasury, umiCore });

  console.log("\n" + "=".repeat(72));
  console.log("GUARD AS IT WOULD BE WRITTEN");
  console.log("=".repeat(72));
  console.log(`  default guards : ${guardNames(plan.guards)}   <- empty by design; nothing is inherited`);
  for (const g of plan.groups) {
    console.log(`  group "${g.label}"${" ".repeat(Math.max(0, 8 - g.label.length))}: ${guardNames(g.guards)}`);
  }
  console.log("\n" + describe(plan));

  if (!write) {
    console.log(
      "\nPlan only — nothing was sent. Re-run with --write --yes to apply it.\n"
    );
    log({ status: "success", message: "Plan printed; no transaction sent (--write not passed)." });
    process.exit(0);
  }

  if (!confirmed) {
    fail(
      "not_confirmed",
      "--write requires --yes as well. This rewrites the terms of a deployed candy machine on " +
        config.network + " and costs a transaction fee.",
      1
    );
  }

  // ---- Write ------------------------------------------------------------
  let signature;
  try {
    const builder = mplCandyMachine.updateCandyGuard(umi, {
      candyGuard: candyGuardPda,
      guards: plan.guards,
      groups: plan.groups,
    });
    const result = await builder.sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
    signature = encodeBase58(Buffer.from(result.signature));
  } catch (err) {
    fail("update_failed", `updateCandyGuard transaction failed: ${err.message}`, 2);
  }

  log({ status: "info", message: "updateCandyGuard confirmed", signature });
  console.log(`\nTransaction confirmed: ${signature}`);
  console.log(`  node scripts/tx-cost.js ${signature}   # what it cost`);

  // ---- Read back --------------------------------------------------------
  // Not a formality. A guard set can serialize, land, and still not be
  // what was intended; nothing errors until someone tries to mint.
  // Retry, because "confirmed" does not mean "every read node has it".
  // The first real run of this script re-fetched 124ms after the transaction
  // confirmed, got the pre-write account back, and reported a mismatch on a
  // migration that had in fact succeeded exactly as planned. A read-back that
  // cries wolf is worse than none: the next operator learns to re-run
  // --read-only and shrug, which is precisely the habit this check exists to
  // prevent. Poll until it agrees, and only call it a mismatch once it has
  // had long enough to be a real one.
  const READ_BACK_ATTEMPTS = 6;
  const READ_BACK_DELAY_MS = 2500;

  let refetched;
  let problems = [];
  for (let attempt = 1; attempt <= READ_BACK_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      await new Promise((r) => setTimeout(r, READ_BACK_DELAY_MS));
    }
    try {
      refetched = await mplCandyMachine.fetchCandyGuard(umi, candyGuardPda);
    } catch (err) {
      fail("read_back_failed", `Wrote the guard but could not re-fetch it to verify: ${err.message}`, 2);
    }
    problems = verifyReadBack(plan, refetched);
    if (problems.length === 0) {
      if (attempt > 1) {
        console.log(`\n  (read-back agreed on attempt ${attempt} — earlier reads were stale, not wrong)`);
      }
      break;
    }
    if (attempt < READ_BACK_ATTEMPTS) {
      console.log(`  read-back attempt ${attempt} disagrees; the node may not have the write yet, retrying...`);
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log("GUARD RE-FETCHED FROM CHAIN");
  console.log("=".repeat(72));
  console.log(describe({ guards: unwrapGuardSet(refetched.guards), groups: unwrapGroups(refetched.groups) }));

  if (problems.length > 0) {
    console.log(
      `\n  READ-BACK MISMATCH after ${READ_BACK_ATTEMPTS} attempts over ` +
        `${((READ_BACK_ATTEMPTS - 1) * READ_BACK_DELAY_MS) / 1000}s — the write landed but is not what was planned:\n`
    );
    problems.forEach((p) => console.log(`   - ${p}`));
    console.log(
      "\n  Do not mint against this machine until it is corrected.\n" +
        "  If a later --read-only shows the guard IS correct, this was a slow node, not a bad\n" +
        "  write: re-run with --verify to record it in master.csv without touching the chain.\n"
    );
    log({ status: "failure", reason: "read_back_mismatch", signature, problems });
    process.exit(3);
  }

  console.log("\n  Read-back matches the plan, group for group.\n");

  // The guard now has a holder route; master.csv is what tells
  // generate-registry.js, and therefore the frontend, that it exists.
  // Skipped when the target was named by --candy-machine, because
  // there is then no row to attribute it to.
  if (row) {
    writeHolderColumns(row.dropItemId, burnCollection, holderPrice);
  } else {
    console.log(
      "  ! Target was given as --candy-machine, so master.csv was NOT updated.\n" +
        "    Set holderRequiredCollection and holderPrice on that drop's row by hand,\n" +
        "    or the frontend will never offer the holder route.\n"
    );
  }

  console.log("  Still unverified by this script, and only observable by minting:");
  console.log("    1. mint through `public` — confirm it STILL CHARGES");
  console.log("    2. mint through `holder` — confirm the required asset is BURNED");
  console.log("  Run tx-cost.js on the holder mint to see who receives the burned asset's rent.\n");

  log({ status: "success", signature, message: "Guard updated and read back matching the plan." });
}

// Only run when invoked directly. Exporting the pure pieces lets the
// plan and the read-back comparison be exercised without a network, an
// RPC or a deploy key - which is the only part of this script that CAN
// be tested off chain. The rest is only ever proved by a settled
// transaction.
if (require.main === module) {
  main().catch((err) => {
    fail("unexpected_error", err && err.stack ? err.stack : String(err), 2);
  });
}

module.exports = { unwrapGuardSet, unwrapGroups, buildPlan, verifyReadBack, verifyMigrated, guardNames };
