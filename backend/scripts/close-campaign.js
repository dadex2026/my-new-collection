#!/usr/bin/env node
/**
 * scripts/close-campaign.js
 *
 * Closes a deployed campaign: deletes its candy machine and candy guard in one
 * transaction, returning their rent to the authority, then marks the row in
 * campaigns.csv as closed. The campaign stops accepting claims at once.
 *
 * PLAN ONLY UNLESS --write --yes. The plan reads the chain and sends nothing;
 * it needs no key (without one it cannot confirm the signer is the authority,
 * and says so).
 *
 * WHY IT EXISTS
 *   The pipeline could deploy a campaign and not close one. The one close so far
 *   (open-items 50) was a one-off script, so nothing cleared or marked the row,
 *   and a closed campaign would leave a permanently misleading
 *   campaignCandyMachineAddress (open-items 57).
 *
 * WHAT IT WRITES TO campaigns.csv - and why it keeps the address
 *   campaignStatus = closed, closedSignature = <the close transaction>. The
 *   address stays as history. reconcile.js accepts "no account at this address"
 *   only for a row marked closed AND whose address has transaction history on
 *   chain - which tells a closed campaign from one that never existed, from the
 *   chain rather than from the CSV. generate-campaigns-registry.js leaves closed
 *   campaigns off the site.
 *
 * Exit codes:
 *   0 = plan printed, or closed and confirmed gone
 *   1 = refused (unknown campaign, no address, other network, not the authority,
 *       already closed, nothing on chain)
 *   3 = chain failure
 *
 * Usage:
 *   node scripts/close-campaign.js --campaign <campaignId>
 *   node scripts/close-campaign.js --campaign <campaignId> --write --yes
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { parseCsvRecords, serializeRow } = require("./lib/csv");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env.admin") });

const BACKEND_DIR = path.join(__dirname, "..");
const CAMPAIGNS_CSV_PATH = path.join(BACKEND_DIR, "campaigns.csv");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function log(event) {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
  const line = JSON.stringify({ time: new Date().toISOString(), step: "close-campaign", ...event });
  console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, "close-campaign.log"), line + "\n");
}
function fail(reason, message, code) {
  log({ status: "failure", reason, message });
  process.exit(code);
}
function decodeBase58(str) {
  const bytes = [0];
  for (const ch of str) {
    let carry = B58.indexOf(ch);
    if (carry < 0) throw new Error("bad base58");
    for (let i = 0; i < bytes.length; i++) { carry += bytes[i] * 58; bytes[i] = carry & 0xff; carry >>= 8; }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (const ch of str) { if (ch === "1") bytes.push(0); else break; }
  return new Uint8Array(bytes.reverse());
}

// Pure: the campaigns.csv content with one row marked closed. New columns are
// appended to the header when absent; every other row and value is unchanged.
function markClosed(text, campaignId, signature) {
  const { header, records } = parseCsvRecords(text);
  const cols = [...header];
  for (const c of ["campaignStatus", "closedSignature"]) if (!cols.includes(c)) cols.push(c);
  let found = 0;
  const rows = records.map((r) => {
    if (r.campaignId !== campaignId) return r;
    found++;
    return { ...r, campaignStatus: "closed", closedSignature: signature };
  });
  if (found !== 1) throw new Error(`expected one row for ${campaignId}, found ${found}`);
  return [serializeRow(cols), ...rows.map((r) => serializeRow(cols.map((k) => (r[k] !== undefined ? r[k] : ""))))].join("\n") + "\n";
}

async function main() {
  const args = process.argv.slice(2);
  const ci = args.indexOf("--campaign");
  const campaignId = ci !== -1 ? args[ci + 1] : null;
  const write = args.includes("--write");
  const yes = args.includes("--yes");
  if (!campaignId) fail("usage", "--campaign <campaignId> is required", 1);
  if (write !== yes) fail("usage", "--write and --yes go together; neither alone sends anything", 1);

  const config = JSON.parse(fs.readFileSync(path.join(BACKEND_DIR, "config.json"), "utf8"));
  const csvText = fs.readFileSync(CAMPAIGNS_CSV_PATH, "utf8");
  const row = parseCsvRecords(csvText).records.find((r) => r.campaignId === campaignId);
  if (!row) fail("unknown_campaign", `no campaigns.csv row has campaignId ${campaignId}`, 1);
  if ((row.campaignStatus || "").trim().toLowerCase() === "closed") fail("already_closed", `${campaignId} is already marked closed (${row.closedSignature || "no signature recorded"})`, 1);
  const address = (row.campaignCandyMachineAddress || "").trim();
  if (!address) fail("no_address", `${campaignId} has no campaignCandyMachineAddress - nothing deployed to close`, 1);
  if ((row.network || "").trim() && row.network.trim() !== config.network) fail("other_network", `${campaignId} is on ${row.network}, config.json is ${config.network}`, 1);

  const { createUmi } = await import("@metaplex-foundation/umi-bundle-defaults");
  const cmLib = await import("@metaplex-foundation/mpl-core-candy-machine");
  const umiLib = await import("@metaplex-foundation/umi");
  const umi = createUmi(config.rpc).use(cmLib.mplCandyMachine());

  let key;
  try { key = umiLib.publicKey(address); } catch { fail("invalid_address", `${address} is not a valid key - nothing can be deployed there; delete the row instead`, 1); }
  let cm, guard, guardKey, cmAcct, guardAcct;
  try {
    cm = await cmLib.safeFetchCandyMachine(umi, key);
    if (!cm) fail("nothing_on_chain", `no candy machine at ${address}. If it was never deployed, delete the row; reconcile.js tells closed from never-deployed by the address's history.`, 1);
    guardKey = cmLib.findCandyGuardPda(umi, { base: key })[0];
    guard = await cmLib.safeFetchCandyGuard(umi, guardKey);
    [cmAcct, guardAcct] = await umi.rpc.getAccounts([key, guardKey]);
  } catch (err) { fail("rpc_error", err.message, 3); }

  const secret = (process.env.DEPLOYER_PRIVATE_KEY || "").trim();
  const kp = secret ? umi.eddsa.createKeypairFromSecretKey(decodeBase58(secret)) : null;
  const signer = kp ? String(kp.publicKey) : null;
  const lamports = (a) => (a && a.exists ? Number(a.lamports.basisPoints) : 0);

  console.log("\n" + "=".repeat(72) + `\nCLOSE CAMPAIGN - ${write ? "WRITING" : "PLAN"}\n` + "=".repeat(72));
  console.log(`  campaign        ${campaignId}  (${config.network})`);
  console.log(`  candy machine   ${key}  ${lamports(cmAcct)} lamports`);
  console.log(`  candy guard     ${guardKey}  ${guard ? lamports(guardAcct) + " lamports" : "none at the PDA - only the machine is deleted"}`);
  console.log(`  claimed         ${cm.itemsRedeemed} of ${cm.data.itemsAvailable}  - closing ends claims immediately`);
  console.log(`  authority       ${cm.authority}${guard ? `  (guard ${guard.authority})` : ""}`);
  console.log(`  signer          ${signer || "(no DEPLOYER_PRIVATE_KEY - the plan cannot confirm authority)"}`);
  console.log(`  rent returned   ~${lamports(cmAcct) + (guard ? lamports(guardAcct) : 0)} lamports, less one fee`);
  console.log(`  campaigns.csv   ${campaignId}: campaignStatus=closed, closedSignature=<sig>; the address is kept as history`);

  if (signer && (String(cm.authority) !== signer || (guard && String(guard.authority) !== signer))) {
    fail("not_authority", `signer ${signer} is not the authority of both accounts`, 1);
  }
  if (!write) {
    log({ status: "plan", campaignId, address: String(key), claimed: `${cm.itemsRedeemed}/${cm.data.itemsAvailable}` });
    console.log("\nPlan only - nothing was sent. Re-run with --write --yes to close it.\n");
    process.exit(0);
  }
  if (!kp) fail("missing_deployer_key", "DEPLOYER_PRIVATE_KEY not set in backend/.env.admin", 1);

  umi.use(umiLib.keypairIdentity(kp));
  let builder = cmLib.deleteCandyMachine(umi, { candyMachine: key });
  if (guard) builder = builder.add(cmLib.deleteCandyGuard(umi, { candyGuard: guardKey }));
  let sig;
  try {
    const res = await builder.sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
    sig = (await import("@metaplex-foundation/umi/serializers")).base58.deserialize(res.signature)[0];
  } catch (err) { fail("chain_failure", `${err.message} - read the chain before retrying; it may have landed`, 3); }

  const gone = await umi.rpc.getAccounts([key, guardKey]);
  if (gone.some((a) => a.exists)) fail("still_exists", `sent ${sig}, but an account still exists - campaigns.csv NOT changed`, 3);
  fs.writeFileSync(CAMPAIGNS_CSV_PATH, markClosed(fs.readFileSync(CAMPAIGNS_CSV_PATH, "utf8"), campaignId, sig), "utf8");
  log({ status: "success", campaignId, signature: sig, message: "Closed and confirmed gone; campaigns.csv marked closed. Run generate-campaigns-registry.js to take it off the site." });
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => fail("unhandled_error", err.message, 3));
}

module.exports = { markClosed };
