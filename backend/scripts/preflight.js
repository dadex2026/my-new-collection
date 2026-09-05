#!/usr/bin/env node
/**
 * scripts/preflight.js
 *
 * The single authoritative production-validation gate. Run this before
 * deploy-collection.js / deploy-candy-machine.js against mainnet. This
 * is the "Production Validation Mode" from the original template
 * hardening backlog — one place that catches the class of mistake that
 * actually happened during this project's own testing (test data
 * shipping alongside real collection data, a --force-able "already
 * deployed" guard, placeholder URLs reaching a deploy script).
 *
 * Checks performed (scoped to the active collection — config.json's
 * collectionSlug, or --slug):
 *   1. collectionSlug isn't a reserved/test prefix (e.g. "test-")
 *   2. No dropItemId uses a reserved/test prefix (e.g. "TEST-")
 *   3. No itemImage is still a placeholder URL
 *   4. No uri is still a placeholder/empty
 *   5. config.json's treasury is a plausible Solana address
 *   6. config.json's rpc is a well-formed URL
 *   7. backend/.env.admin exists locally
 *   8. .gitignore actually excludes .env.admin (so it can't leak)
 *   9. DEPLOYER_PRIVATE_KEY is present in the environment
 *  10. Every row for this collection isn't already deployed on the
 *      target network, unless --force is passed
 *
 * Exit codes:
 *   0 = all checks passed, safe to deploy
 *   1 = one or more checks failed — do not deploy
 *
 * Usage:
 *   node scripts/preflight.js
 *   node scripts/preflight.js --slug founders
 *   node scripts/preflight.js --force        (allow re-deploying an already-deployed collection)
 *   node scripts/preflight.js --allow-warnings   (deliberately downgrade reserved-prefix/placeholder
 *                                                  checks from failures to warnings — e.g. for an
 *                                                  intentional throwaway mainnet test. Never the
 *                                                  default; must be typed explicitly every time.
 *                                                  Structural checks like an invalid treasury address
 *                                                  or missing deployer key are NEVER downgradable.)
 *   node scripts/preflight.js --reserved-slug-prefix demo- --reserved-id-prefix DEMO-
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { parseCsvRecords, serializeRow } = require("./lib/csv");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env.admin") });

// ---- Paths --------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const PROJECT_ROOT = path.join(BACKEND_DIR, "..");
const CONFIG_PATH = path.join(BACKEND_DIR, "config.json");
const MASTER_CSV_PATH = path.join(BACKEND_DIR, "master.csv");
const CAMPAIGNS_CSV_PATH = path.join(BACKEND_DIR, "campaigns.csv");
const ENV_ADMIN_PATH = path.join(BACKEND_DIR, ".env.admin");
const GITIGNORE_PATH = path.join(PROJECT_ROOT, ".gitignore");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

// Default reserved patterns — anything used for local/mainnet testing
// should carry one of these, so preflight can reliably catch it before
// a real deploy. Override via CLI flags if your project uses different
// conventions.
const DEFAULT_RESERVED_SLUG_PREFIXES = ["test-", "demo-", "sample-"];
const DEFAULT_RESERVED_ID_PREFIXES = ["TEST-", "DEMO-", "SAMPLE-"];

// ---- Logging --------------------------------------------------------------

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "preflight", ...event };
  console.log(JSON.stringify(entry));
  fs.appendFileSync(path.join(LOGS_DIR, "preflight.log"), JSON.stringify(entry) + "\n");
}

// ---- CSV helpers (same format as the rest of the pipeline) ---------------

// RFC4180 via lib/csv.js. This was an inline split(",") in eleven scripts until
// 2026-09-02 - no quote handling, and quoting did not help, because `"a, b"`
// split into `"a` and ` b"` with the quotes retained. One comma in any prose
// column shifted every field after it: a comma added to a campaigns.csv
// description made eligibilityDropItemId read "All Bronze Pennants have been
// claimed." and price read "REWARD-001". Signature and return shape are
// unchanged, so no call site moved. See open-items 28.
function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return { header: [], rows: [] };
  const { header, records } = parseCsvRecords(fs.readFileSync(filePath, "utf8"));
  return { header, rows: records };
}

function isPlaceholder(url) {
  if (!url || url.trim() === "") return true;
  if (url.includes("placehold.co")) return true;
  if (url.includes("example.com")) return true;
  if (url.includes("AbCdEf") || url.includes("ImageHash")) return true;
  return false;
}

function hasReservedPrefix(value, prefixes) {
  return prefixes.some((prefix) => value.toLowerCase().startsWith(prefix.toLowerCase()));
}

// ---- Individual checks ---------------------------------------------------
// Each returns { pass: boolean, detail: string }

function checkConfigExists() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { pass: false, detail: `backend/config.json not found at ${CONFIG_PATH}` };
  }
  return { pass: true, detail: "config.json found" };
}

function checkTreasuryValid(config) {
  const pattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  if (!config.treasury || !pattern.test(config.treasury)) {
    return { pass: false, detail: `config.json "treasury" is missing or not a plausible Solana address: "${config.treasury}"` };
  }
  return { pass: true, detail: `treasury looks valid: ${config.treasury}` };
}

function checkRpcValid(config) {
  try {
    const url = new URL(config.rpc);
    if (!["http:", "https:"].includes(url.protocol)) {
      return { pass: false, detail: `config.json "rpc" has an unexpected protocol: ${url.protocol}` };
    }
    return { pass: true, detail: `rpc URL is well-formed: ${config.rpc}` };
  } catch (err) {
    return { pass: false, detail: `config.json "rpc" is not a valid URL: "${config.rpc}"` };
  }
}

function checkEnvAdminExists() {
  if (!fs.existsSync(ENV_ADMIN_PATH)) {
    return { pass: false, detail: `backend/.env.admin not found at ${ENV_ADMIN_PATH}` };
  }
  return { pass: true, detail: ".env.admin exists locally" };
}

function checkEnvAdminGitignored() {
  if (!fs.existsSync(GITIGNORE_PATH)) {
    return { pass: false, detail: `.gitignore not found at ${GITIGNORE_PATH} — .env.admin could leak into version control` };
  }
  const content = fs.readFileSync(GITIGNORE_PATH, "utf8");
  const lines = content.split("\n").map((l) => l.trim());
  const covered = lines.some(
    (l) => l === ".env.admin" || l === "*.admin" || l === ".env*" || l === "backend/.env.admin"
  );
  if (!covered) {
    return { pass: false, detail: '.gitignore does not appear to exclude .env.admin — add a line containing ".env.admin"' };
  }
  return { pass: true, detail: ".env.admin is covered by .gitignore" };
}

function checkDeployerKeyPresent() {
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    return { pass: false, detail: "DEPLOYER_PRIVATE_KEY not set (checked backend/.env.admin)" };
  }
  return { pass: true, detail: "DEPLOYER_PRIVATE_KEY is present" };
}

// Derives a Solana keypair's public (base58) address directly from its
// base58-encoded 64-byte secret key — bytes[32:64] of a standard
// Solana secret key ARE the public key, verified directly against the
// real @metaplex-foundation/umi library before implementing this (a
// generated keypair's known public key matched byte-for-byte). No
// network call, no crypto library needed beyond base58 encode/decode.
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

// Content check, not structural: there ARE legitimate reasons to use
// the same wallet for both on a cheap throwaway test (the original
// test-drop mainnet test in this project deliberately did exactly
// this — "the tiny test payment just comes back to you"). This is a
// judgment call worth flagging loudly, not an unconditional block.
function checkDeployerNotTreasury(config) {
  const secret = process.env.DEPLOYER_PRIVATE_KEY;
  if (!secret || !config.treasury) {
    // Can't check without both values — other checks already cover
    // their individual presence/validity, so just pass here silently.
    return { pass: true, unknown: true, detail: "COULD NOT VERIFY — DEPLOYER_PRIVATE_KEY or config.treasury not available to compare" };
  }
  let derivedDeployerAddress;
  try {
    const secretKeyBytes = decodeBase58(secret.trim());
    if (secretKeyBytes.length !== 64) {
      return { pass: true, unknown: true, detail: "COULD NOT VERIFY — DEPLOYER_PRIVATE_KEY is not a standard 64-byte secret key, cannot derive its address" };
    }
    derivedDeployerAddress = encodeBase58(secretKeyBytes.slice(32, 64));
  } catch (err) {
    return { pass: true, unknown: true, detail: `COULD NOT VERIFY — could not decode DEPLOYER_PRIVATE_KEY to compare: ${err.message}` };
  }

  if (derivedDeployerAddress === config.treasury) {
    return {
      pass: false,
      detail: `config.json "treasury" (${config.treasury}) is the SAME wallet as DEPLOYER_PRIVATE_KEY. This mixes deployment funds with sale proceeds — recommended to use a separate treasury wallet for anything beyond a cheap throwaway test.`,
    };
  }
  return { pass: true, detail: "Deployer wallet and treasury wallet are different addresses" };
}

function checkNoReservedSlug(collectionSlug, reservedSlugPrefixes) {
  if (hasReservedPrefix(collectionSlug, reservedSlugPrefixes)) {
    return {
      pass: false,
      detail: `collectionSlug "${collectionSlug}" uses a reserved/test prefix (${reservedSlugPrefixes.join(", ")}) — this looks like test data, not a real collection`,
    };
  }
  return { pass: true, detail: `collectionSlug "${collectionSlug}" is not a reserved prefix` };
}

function checkNoReservedDropIds(rows, reservedIdPrefixes) {
  const offenders = rows
    .map((r) => r.dropItemId)
    .filter((id) => id && hasReservedPrefix(id, reservedIdPrefixes));
  if (offenders.length > 0) {
    return {
      pass: false,
      detail: `${offenders.length} drop(s) use a reserved/test ID prefix (${reservedIdPrefixes.join(", ")}): ${offenders.join(", ")}`,
    };
  }
  return { pass: true, detail: "No drops use a reserved test ID prefix" };
}

// campaigns.csv is optional — not every collection runs campaigns. If the
// file doesn't exist, this check is skipped entirely (not a failure) by
// the caller, rather than treating "no campaigns.csv" as an error.
// Checks campaignId against BOTH the slug-style and ID-style reserved
// prefix lists (combined), since campaign IDs don't have one fixed
// casing convention the way collectionSlug/dropItemId do.
function checkNoReservedCampaignIds(campaignRows, reservedPrefixes) {
  const offenders = campaignRows
    .map((r) => r.campaignId)
    .filter((id) => id && hasReservedPrefix(id, reservedPrefixes));
  if (offenders.length > 0) {
    return {
      pass: false,
      detail: `${offenders.length} campaign(s) use a reserved/test ID prefix (${reservedPrefixes.join(", ")}): ${offenders.join(", ")}`,
    };
  }
  return { pass: true, detail: "No campaigns use a reserved test ID prefix" };
}

function checkNoPlaceholderImages(rows) {
  const offenders = rows.filter((r) => isPlaceholder(r.itemImage)).map((r) => r.dropItemId);
  if (offenders.length > 0) {
    return {
      pass: false,
      detail: `${offenders.length} drop(s) still have a placeholder itemImage: ${offenders.join(", ")} — run upload-images.js`,
    };
  }
  return { pass: true, detail: "All drops have a real itemImage" };
}

function checkNoPlaceholderUris(rows) {
  const offenders = rows.filter((r) => isPlaceholder(r.uri)).map((r) => r.dropItemId);
  if (offenders.length > 0) {
    return {
      pass: false,
      detail: `${offenders.length} drop(s) still have a placeholder/missing uri: ${offenders.join(", ")} — run upload-metadata.js`,
    };
  }
  return { pass: true, detail: "All drops have a real metadata uri" };
}

// ---- Values that become permanent on chain -----------------------------
// Everything below guards a value that deploy-collection.js or
// deploy-candy-machine.js writes to the chain, where it cannot be changed.
// They exist because an enumeration of those writes (2026-08-28) found that
// preflight covered itemImage and uri and nothing else — so a project could
// pass every check and still mint under the name "Sample Collection", at a
// price of zero, with a supply of unlimited, none of it intended.

// Word-boundary, not prefix: the four collections deployed to mainnet in
// August were named "Mechanics Test A".."D" — a prefix match misses every
// one of them. \b keeps "Contest Winners" and "Protest Archive" clean.
const PLACEHOLDER_NAME = /\b(sample|test|testing|demo|template|untitled|placeholder|example|foo|bar)\b|^your /i;

// deploy-collection.js:349 — name: firstRow.collectionName || collectionSlug
function checkNoPlaceholderCollectionName(rows) {
  const name = (rows[0] && rows[0].collectionName || "").trim();
  if (!name) {
    return { pass: false, detail: 'master.csv has no collectionName — the on-chain collection would be named after the slug instead' };
  }
  if (PLACEHOLDER_NAME.test(name) || name === "Template Open Edition") {
    return { pass: false, detail: `collectionName "${name}" looks like placeholder text — this is the name written on chain and it cannot be changed` };
  }
  const disagree = [...new Set(rows.map((r) => (r.collectionName || "").trim()))];
  if (disagree.length > 1) {
    return { pass: false, detail: `Rows disagree on collectionName (${disagree.map((d) => JSON.stringify(d)).join(", ")}). The first row's value is the one minted.` };
  }
  return { pass: true, detail: `On-chain collection name will be "${name}"` };
}

// deploy-collection.js:350 — uri: firstRow.collectionImage || ""
// A voucher collection is a burn currency, and in this pipeline a candy
// machine IS the public mint path. So a candy machine on a voucher collection
// makes vouchers mintable by anyone, and each one redeems for an edition.
//
// Two signals: mintStatus "voucher" on the row, which is true from the moment
// it is typed, and the collection being named as some drop's
// holderRequiredCollection, which only becomes true after the first edition is
// migrated. The first protects day one; the second catches a voucher nobody
// marked. deploy-candy-machine.js refuses on the same two, which is the check
// that actually prevents it - this one is so you find out before you get there.
function checkNotAMintableVoucher(matchingRows, allRows) {
  const declared = matchingRows.filter(
    (r) => (r.mintStatus || "").trim().toLowerCase() === "voucher"
  );
  const slugAddresses = new Set(
    matchingRows.map((r) => (r.collectionAddress || "").trim()).filter(Boolean)
  );
  const burnedBy = allRows.filter((r) => {
    const target = (r.holderRequiredCollection || "").trim();
    return target && slugAddresses.has(target);
  });

  const isVoucher = declared.length > 0 || burnedBy.length > 0;
  if (!isVoucher) {
    return { pass: true, detail: "Not a burn currency - a candy machine here is expected" };
  }

  const why = declared.length > 0
    ? `declared by mintStatus "voucher" on ${declared.map((r) => r.dropItemId).join(", ")}`
    : `named as holderRequiredCollection by ${burnedBy.map((r) => r.dropItemId).join(", ")}`;

  const deployed = matchingRows.filter((r) => (r.candyMachineAddress || "").trim());
  if (deployed.length > 0) {
    return {
      pass: false,
      detail:
        `This is a burn currency (${why}) and ${deployed.length} row(s) already have a candy machine: ` +
        `${deployed.map((r) => r.dropItemId).join(", ")}. Vouchers are now publicly mintable, and each one ` +
        "redeems for an edition. A deployed candy machine cannot be undone from here.",
    };
  }

  return {
    pass: true,
    detail: `Burn currency (${why}) with no candy machine - correct. Never run deploy-candy-machine.js for this slug.`,
  };
}

function checkNoPlaceholderCollectionImage(rows) {
  const img = rows[0] && rows[0].collectionImage;
  if (isPlaceholder(img)) {
    return { pass: false, detail: `collectionImage is missing or a placeholder ("${img || ""}") — it becomes the collection's permanent on-chain uri` };
  }
  return { pass: true, detail: "Collection has a real collectionImage" };
}

// deploy-candy-machine.js:281 — solPayment from Number(row.price) || 0
function checkPricesParse(rows) {
  const bad = rows.filter((r) => {
    const raw = (r.price || "").trim();
    return raw === "" || !Number.isFinite(Number(raw)) || Number(raw) < 0;
  });
  if (bad.length > 0) {
    return { pass: false, detail: `${bad.length} drop(s) have a price that is missing or does not parse: ${bad.map((r) => `${r.dropItemId}="${r.price}"`).join(", ")} — Number(price) || 0 would mint these FREE, permanently` };
  }
  const free = rows.filter((r) => Number(r.price) === 0).map((r) => r.dropItemId);
  const note = free.length ? ` (${free.length} priced at 0 — free mint, intended?)` : "";
  return { pass: true, detail: `All drop prices parse${note}` };
}

// deploy-candy-machine.js:323 — hiddenSettings.name is .slice(0, 32)
function checkItemNamesFitOnChain(rows) {
  const over = rows
    .map((r) => ({ id: r.dropItemId, name: r.itemName || r.dropItemId }))
    .filter((x) => x.name.length > 32);
  if (over.length > 0) {
    return { pass: false, detail: `${over.length} item name(s) exceed the 32-character on-chain limit and would be SILENTLY TRUNCATED: ${over.map((x) => `${x.id} (${x.name.length})`).join(", ")}` };
  }
  return { pass: true, detail: "All item names fit the 32-character on-chain limit" };
}

// deploy-candy-machine.js:278 — parseMaxSupply falls back to UNLIMITED
function checkMaxSupplyParses(rows) {
  const bad = rows.filter((r) => {
    const raw = (r.maxSupply || "").trim().toLowerCase();
    if (raw === "" || raw === "unlimited") return false;
    const n = Number(raw);
    return !(Number.isFinite(n) && n > 0);
  });
  if (bad.length > 0) {
    return { pass: false, detail: `${bad.length} drop(s) have a maxSupply that does not parse: ${bad.map((r) => `${r.dropItemId}="${r.maxSupply}"`).join(", ")} — these would silently become UNLIMITED open editions` };
  }
  return { pass: true, detail: "All maxSupply values parse (or are deliberately unlimited)" };
}

// Mirrors parseMaxSupply in deploy-candy-machine.js:244 and
// generate-registry.js:98. A fourth copy is a cost, and it is paid
// deliberately: preflight must stay importable without a deployer key, and
// deploy-candy-machine.js reaches for one at module scope. These three move
// together - change one and change all three.
function isUncappedSupply(value) {
  const raw = (value || "").trim().toLowerCase();
  if (raw === "" || raw === "unlimited") return true;
  const n = Number(raw);
  return !(Number.isFinite(n) && n > 0);
}

// Item 41. assetGate asks only "is this asset in the eligibility collection",
// and assetMintLimit's counter is seeded by the qualifying asset - so a FRESH
// eligible asset arrives with a fresh counter. If the eligibility drop is an
// open edition, eligibility can be minted on demand: the allocation drains to
// whoever wants it most rather than to holders, which is a different campaign
// than the one anybody meant to run. No guard can tell a farmed asset from a
// genuine one, because on chain they are identical.
//
// The lever chosen 2026-09-05 is to cap the eligibility drop. That used to
// mean giving up the open edition; since update-candy-machine-supply.js it
// does not. Raising a live cap costs 5,000 lamports - fee only, no rent,
// because a machine with hiddenSettings does not grow when itemsAvailable
// does. A cap is no longer a commitment to scarcity. It is a commitment to
// deciding, one raise at a time.
//
// Why master.csv can be trusted by a check that never touches an RPC:
// update-candy-machine-supply.js writes maxSupply back to master.csv after a
// polled read-back (:148), so the column mirrors the chain rather than
// guessing at it. If that write-back is ever removed this check goes blind
// and says nothing, which is why the dependency is named here and there.
//
// Downgradable on purpose. Item 41's lever (d) - treat the allocation as a
// giveaway budget and accept the leak - is a real answer when the reward is
// worth less than the cost of farming it. --allow-warnings is how you say you
// weighed that, rather than never having met the question.
// A campaigns.csv can hold dozens of rows, and naming every one of them turns a
// report line into a paragraph nobody reads to the end. Name enough to act on,
// count the rest, and never hide the total.
function nameSome(list, cap) {
  if (list.length <= cap) return list.join(", ");
  return `${list.slice(0, cap).join(", ")}, and ${list.length - cap} more`;
}

function checkCampaignEligibilityCapped(campaignRows, allRows, reservedPrefixes) {
  const considered = [];
  const skipped = [];
  for (const c of campaignRows) {
    const id = (c.campaignId || "").trim();
    if (!id) continue;
    if (hasReservedPrefix(id, reservedPrefixes)) {
      skipped.push(id);
      continue;
    }
    considered.push(c);
  }

  // Name the skipped rows rather than quietly shrinking the denominator. A
  // pass that examined nothing is the failure mode this repo keeps meeting.
  const note =
    skipped.length > 0
      ? ` (${skipped.length} reserved/sample row(s) not examined: ${nameSome(skipped, 4)})`
      : "";

  if (considered.length === 0) {
    return { pass: true, detail: `No live campaigns to examine${note}` };
  }

  const uncapped = [];
  const unresolved = [];
  const capped = [];
  for (const c of considered) {
    const dropId = (c.eligibilityDropItemId || "").trim();
    if (!dropId) {
      unresolved.push(`${c.campaignId} (row has no eligibilityDropItemId)`);
      continue;
    }
    // Matches deploy-campaign.js:320 - the eligibility drop is looked up across
    // every master.csv row, not only the slug being deployed, because a
    // campaign may gate on a drop in another collection entirely.
    const drop = allRows.find((r) => r.dropItemId === dropId);
    if (!drop) {
      unresolved.push(`${c.campaignId} -> ${dropId} (no such dropItemId in master.csv)`);
      continue;
    }
    if (isUncappedSupply(drop.maxSupply)) {
      uncapped.push(`${c.campaignId} -> ${dropId} (maxSupply "${drop.maxSupply || ""}")`);
    } else {
      capped.push(`${c.campaignId} -> ${dropId} (${drop.maxSupply})`);
    }
  }

  if (uncapped.length > 0) {
    return {
      pass: false,
      detail:
        `${uncapped.length} of ${considered.length} campaign(s) gate on an UNCAPPED eligibility drop: ` +
        `${nameSome(uncapped, 5)}. An open edition can be minted on demand, so eligibility can be ` +
        `manufactured for the price of one mint and the allocation drains to farmers rather than holders. ` +
        `Fix: set maxSupply on that drop's master.csv row, or run update-candy-machine-supply.js if it is ` +
        `already deployed (5,000 lamports, and the cap can be raised again whenever you want more float). ` +
        `To accept the leak deliberately instead, pass --allow-warnings. See open-items 41.${note}`,
    };
  }

  if (unresolved.length > 0) {
    return {
      pass: true,
      unknown: true,
      detail:
        `COULD NOT VERIFY - ${unresolved.length} of ${considered.length} campaign(s) name an eligibility drop ` +
        `that is not in master.csv: ${nameSome(unresolved, 5)}. Farmability cannot be judged for these, and ` +
        `deploy-campaign.js will refuse them outright (it looks the drop up the same way), so they are broken ` +
        `rows rather than merely unverified ones. ${capped.length} of ${considered.length} confirmed capped${note}`,
    };
  }

  return {
    pass: true,
    detail: `All ${capped.length} campaign(s) gate on a capped eligibility drop: ${capped.join(", ")}${note}`,
  };
}

function checkNotAlreadyDeployed(rows, network, force) {
  const alreadyDeployed = rows.filter((r) => r.collectionAddress && r.network === network);
  if (alreadyDeployed.length > 0 && !force) {
    return {
      pass: false,
      detail: `${alreadyDeployed.length} drop(s) already have a collectionAddress recorded for network "${network}". Pass --force to proceed anyway (e.g. intentionally re-deploying).`,
    };
  }
  if (alreadyDeployed.length > 0 && force) {
    return { pass: true, detail: `${alreadyDeployed.length} drop(s) already deployed on "${network}" — proceeding due to --force` };
  }
  return { pass: true, detail: `No drops already deployed on network "${network}"` };
}

// ---- Check categorization --------------------------------------------
// STRUCTURAL checks are never warnings — a bad treasury address or a
// missing deployer key isn't a judgment call, it's just broken
// configuration that cannot safely proceed under any flag.
//
// CONTENT checks (reserved prefixes, placeholder data) ARE judgment
// calls — there's a legitimate case for a deliberate test deploy using
// a reserved prefix on purpose. These block by default, same as
// everything else, but --allow-warnings lets you consciously downgrade
// them to warnings instead of silently defaulting to permissive. The
// override must be typed explicitly — never the default behavior.
const CONTENT_CHECK_NAMES = new Set([
  "no_reserved_slug",
  "no_reserved_drop_ids",
  "no_placeholder_images",
  "no_placeholder_uris",
  "no_reserved_campaign_ids",
  "campaign_eligibility_capped",
  "no_placeholder_collection_name",
  "no_placeholder_collection_image",
]);
// deployer_not_treasury was in this set until 2026-08-28. It is an ENVIRONMENT
// check — it is what stands between the deploy key and the sale proceeds — and
// listing it here meant --allow-warnings could downgrade it, contradicting
// every doc that said an Environment failure is never a warning. Do not add it
// back.

// Recorded only when they fail, by design - a passing config.json does not
// push a config_valid_json result. Excluded from the "did not run" list so
// a clean report does not accuse itself of skipping three checks it was
// never going to print.
const FAILURE_ONLY_CHECKS = new Set([
  "config_valid_json",
  "collection_slug_present",
  "collection_has_rows",
]);

const CATEGORIES = [
  { name: "Project Structure", checks: ["config_exists", "config_valid_json", "collection_slug_present", "collection_has_rows"] },
  { name: "Environment", checks: ["env_admin_exists", "env_admin_gitignored", "deployer_key_present", "treasury_valid", "rpc_valid", "deployer_not_treasury"] },
  { name: "Content Validation", checks: ["no_reserved_slug", "no_reserved_drop_ids", "no_placeholder_images", "no_placeholder_uris"] },
  { name: "Permanent Values", checks: ["no_placeholder_collection_name", "no_placeholder_collection_image", "prices_parse", "item_names_fit_on_chain", "max_supply_parses", "not_a_mintable_voucher"] },
  { name: "Campaign Validation", checks: ["no_reserved_campaign_ids", "campaign_eligibility_capped"] },
  { name: "Deployment State", checks: ["not_already_deployed"] },
];

// ---- Main ---------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const allowWarnings = args.includes("--allow-warnings");
  const slugFlagIndex = args.indexOf("--slug");
  const reservedSlugFlagIndex = args.indexOf("--reserved-slug-prefix");
  const reservedIdFlagIndex = args.indexOf("--reserved-id-prefix");

  const reservedSlugPrefixes =
    reservedSlugFlagIndex !== -1 && args[reservedSlugFlagIndex + 1]
      ? [args[reservedSlugFlagIndex + 1]]
      : DEFAULT_RESERVED_SLUG_PREFIXES;
  const reservedIdPrefixes =
    reservedIdFlagIndex !== -1 && args[reservedIdFlagIndex + 1]
      ? [args[reservedIdFlagIndex + 1]]
      : DEFAULT_RESERVED_ID_PREFIXES;

  log({ status: "start", force, allowWarnings, reservedSlugPrefixes, reservedIdPrefixes });

  const results = [];

  // Checks that don't require config.json to already be valid
  results.push({ name: "config_exists", ...checkConfigExists() });
  results.push({ name: "env_admin_exists", ...checkEnvAdminExists() });
  results.push({ name: "env_admin_gitignored", ...checkEnvAdminGitignored() });
  results.push({ name: "deployer_key_present", ...checkDeployerKeyPresent() });

  // campaigns.csv is optional — only checked if it actually exists. Not
  // every collection runs campaigns, so its absence is not an error.
  if (fs.existsSync(CAMPAIGNS_CSV_PATH)) {
    const { rows: campaignRows } = readCsv(CAMPAIGNS_CSV_PATH);
    const combinedReservedPrefixes = [...new Set([...reservedSlugPrefixes, ...reservedIdPrefixes])];
    results.push({ name: "no_reserved_campaign_ids", ...checkNoReservedCampaignIds(campaignRows, combinedReservedPrefixes) });
    // master.csv is read again here rather than reused from the block below,
    // which is guarded by config.json and a collectionSlug this check does not
    // need: a campaign's eligibility drop can live in any collection. readCsv
    // returns empty rows for a missing file, so this stays quiet on a project
    // that has campaigns.csv and nothing else.
    const { rows: masterRowsForCampaigns } = readCsv(MASTER_CSV_PATH);
    results.push({
      name: "campaign_eligibility_capped",
      ...checkCampaignEligibilityCapped(campaignRows, masterRowsForCampaigns, combinedReservedPrefixes),
    });
  }

  let config = null;
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    } catch (err) {
      results.push({ name: "config_valid_json", pass: false, detail: `config.json is not valid JSON: ${err.message}` });
    }
  }

  if (config) {
    const collectionSlug =
      slugFlagIndex !== -1 && args[slugFlagIndex + 1] ? args[slugFlagIndex + 1] : config.collectionSlug;

    results.push({ name: "treasury_valid", ...checkTreasuryValid(config) });
    results.push({ name: "deployer_not_treasury", ...checkDeployerNotTreasury(config) });
    results.push({ name: "rpc_valid", ...checkRpcValid(config) });

    if (collectionSlug) {
      results.push({ name: "no_reserved_slug", ...checkNoReservedSlug(collectionSlug, reservedSlugPrefixes) });

      const { rows: allRows } = readCsv(MASTER_CSV_PATH);
      const matchingRows = allRows.filter((r) => r.collectionSlug === collectionSlug);

      if (matchingRows.length === 0) {
        results.push({
          name: "collection_has_rows",
          pass: false,
          detail: `No rows in master.csv match collectionSlug "${collectionSlug}"`,
        });
      } else {
        results.push({ name: "no_reserved_drop_ids", ...checkNoReservedDropIds(matchingRows, reservedIdPrefixes) });
        results.push({ name: "no_placeholder_images", ...checkNoPlaceholderImages(matchingRows) });
        results.push({ name: "no_placeholder_uris", ...checkNoPlaceholderUris(matchingRows) });
        results.push({ name: "no_placeholder_collection_name", ...checkNoPlaceholderCollectionName(matchingRows) });
        results.push({ name: "no_placeholder_collection_image", ...checkNoPlaceholderCollectionImage(matchingRows) });
        results.push({ name: "prices_parse", ...checkPricesParse(matchingRows) });
        results.push({ name: "item_names_fit_on_chain", ...checkItemNamesFitOnChain(matchingRows) });
        results.push({ name: "max_supply_parses", ...checkMaxSupplyParses(matchingRows) });
        results.push({ name: "not_a_mintable_voucher", ...checkNotAMintableVoucher(matchingRows, allRows) });
        results.push({ name: "not_already_deployed", ...checkNotAlreadyDeployed(matchingRows, config.network, force) });
      }
    } else {
      results.push({ name: "collection_slug_present", pass: false, detail: "config.json is missing collectionSlug" });
    }
  }

  // ---- Classify: hard failures vs. downgraded warnings -------------------
  // A failed CONTENT check becomes a warning ONLY if --allow-warnings was
  // explicitly passed. A failed STRUCTURAL check is ALWAYS a hard failure,
  // regardless of any flag — there is no override for broken config.
  const hardFailures = results.filter((r) => !r.pass && !(allowWarnings && CONTENT_CHECK_NAMES.has(r.name)));
  const warnings = results.filter((r) => !r.pass && allowWarnings && CONTENT_CHECK_NAMES.has(r.name));

  // A check that could not run is not a check that passed. It does not block —
  // an underivable key format is not itself a reason to refuse a deploy — but it
  // must never be reported as a pass, and it suppresses the "all checks passed"
  // line that operators are told to look for.
  const unknowns = results.filter((r) => r.unknown);

  for (const r of results) {
    const status = r.unknown ? "check_unknown" : r.pass ? "check_passed" : "check_failed";
    log({ status, check: r.name, detail: r.detail });
  }

  // ---- Categorized report -------------------------------------------------
  const byName = new Map(results.map((r) => [r.name, r]));

  console.log("\n=========================================");
  console.log("PRE-FLIGHT REPORT");
  console.log("=========================================\n");

  for (const category of CATEGORIES) {
    const inCategory = category.checks.map((n) => byName.get(n)).filter(Boolean);

    // A check that never ran is not a check that passed. Everything after
    // collection_has_rows fails is skipped, so on 2026-09-03 this report
    // printed "Content Validation  PASS" for a master.csv whose placeholder
    // images had not been looked at once, and dropped the Permanent Values
    // group from the output entirely rather than saying it was skipped.
    // Name what was not evaluated; a tick that means "nothing was tested"
    // is worse than no tick.
    const notEvaluated = category.checks.filter((n) => !byName.has(n) && !FAILURE_ONLY_CHECKS.has(n));

    if (inCategory.length === 0) {
      console.log(`${category.name.padEnd(24)}- NOT EVALUATED`);
      if (notEvaluated.length > 0) {
        console.log(`  - did not run: ${notEvaluated.join(", ")}`);
      }
      continue;
    }

    const categoryHardFail = inCategory.some(
      (r) => !r.pass && !(allowWarnings && CONTENT_CHECK_NAMES.has(r.name))
    );
    const categoryWarn = inCategory.some((r) => !r.pass && allowWarnings && CONTENT_CHECK_NAMES.has(r.name));
    const categoryUnknown = inCategory.some((r) => r.unknown);
    const status = categoryHardFail
      ? "✗ FAIL"
      : categoryWarn
      ? "⚠ WARN"
      : categoryUnknown
      ? "? UNVERIFIED"
      : "✓ PASS";

    console.log(`${category.name.padEnd(24)}${status}${notEvaluated.length > 0 ? "  (partial)" : ""}`);
    if (notEvaluated.length > 0) {
      console.log(`  - did not run: ${notEvaluated.join(", ")}`);
    }
    for (const r of inCategory) {
      if (r.unknown) {
        console.log(`  ? ${r.detail}`);
        continue;
      }
      if (!r.pass) {
        const isWarning = allowWarnings && CONTENT_CHECK_NAMES.has(r.name);
        console.log(`  ${isWarning ? "⚠" : "✗"} ${r.detail}`);
      }
    }
  }

  if (warnings.length > 0) {
    console.log("\nWarnings (downgraded via --allow-warnings — review before proceeding):");
    for (const w of warnings) {
      console.log(`  ⚠ ${w.detail}`);
    }
  }

  console.log("\nDeployment Readiness:");
  if (hardFailures.length > 0) {
    console.log(`  NOT READY — ${hardFailures.length} failure(s) must be resolved.\n`);
    log({
      status: "failure",
      message: `${hardFailures.length} check(s) failed — do not deploy until resolved.`,
      failedChecks: hardFailures.map((r) => r.name),
      warnings: warnings.map((r) => r.name),
    });
    process.exit(1);
  }

  if (unknowns.length > 0) {
    console.log("\nCould not verify (these did not run — do not read them as passes):");
    for (const u of unknowns) {
      console.log(`  ? ${u.name}: ${u.detail}`);
    }
  }

  if (warnings.length > 0) {
    console.log(`  READY WITH WARNINGS — proceeding is your explicit decision (--allow-warnings was set).\n`);
    log({
      status: "success",
      message: `Preflight passed with ${warnings.length} warning(s) downgraded via --allow-warnings.`,
      warnings: warnings.map((r) => r.name),
      unknowns: unknowns.map((r) => r.name),
    });
    process.exit(0);
  }

  if (unknowns.length > 0) {
    console.log(
      `  READY — but ${unknowns.length} check(s) could not be verified. Resolve them, or proceed knowing what was not checked.\n`
    );
    log({
      status: "success",
      message: `Preflight passed, but ${unknowns.length} check(s) could not be verified.`,
      unknowns: unknowns.map((r) => r.name),
    });
    process.exit(0);
  }

  console.log("  READY — all checks passed.\n");
  log({ status: "success", message: "All preflight checks passed. Safe to deploy." });
  process.exit(0);
}

main();