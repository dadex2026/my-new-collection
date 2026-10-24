#!/usr/bin/env node
/**
 * scripts/mint-throwaway-card.js
 *
 * The one-off observation open-items 53 requires before any production drop
 * uses a generated card: mint ONE generated card as a Core asset into a TEST
 * collection, then look at it in a wallet and on the marketplaces that matter.
 *
 * PLAN ONLY UNLESS --write --yes. The plan composes the card, quotes the
 * upload, checks the target, and sends nothing. It writes nothing but its log.
 *
 * WHAT --write --yes DOES, in order, each step permanent:
 *   1. uploads the PNG to Irys (Content-Type image/png)
 *   2. uploads the metadata JSON to Irys, image pointing at step 1
 *   3. creates one Core asset in the target collection with that uri
 *   Cost: two small uploads (a few thousand lamports) plus the asset's rent,
 *   measured at 3,469,680 lamports for a Core asset; about 0.0035 SOL.
 *
 * TARGET SAFETY - refused, whatever the flags:
 *   - TEST-001's collection 7DayQZfb... (the live voucher) and TEST-003/004's
 *     DWGTLJUE... (TEST-004 is mid-verification at a cut cap)
 *   - any collection the signer is not update authority of
 *   - any collection a LIVE campaign gates: an asset there is a fresh key to
 *     that campaign. "Live" is read from the chain, not from campaigns.csv - on
 *     2026-10-21 five of the fork's eight "deployed" campaign rows had no
 *     account on chain (open-items 57). CSV-only gating rows are listed as
 *     warnings.
 *   - a second mint: once a success is logged, --again is required
 *
 * Usage (run against the fork, which holds the key and the TEST collections):
 *   node scripts/mint-throwaway-card.js --backend <dir> --collection <addr> [--owner <addr>]
 *   node scripts/mint-throwaway-card.js --backend <dir> --collection <addr> --write --yes
 *
 * Exit codes:
 *   0 = plan printed, or minted and read back
 *   1 = refused (target, flags, config)
 *   2 = upload failure
 *   3 = chain failure
 */
"use strict";

const fs = require("fs");
const path = require("path");
const gi = require("./generate-images.js");
const { parseCsvRecords } = require("./lib/csv");

const FORBIDDEN = {
  "7DayQZfbPCXz5xMpkFG3RsPdsWL4hwWX9ea3EjKj2xVP": "TEST-001's collection - the live voucher",
  "DWGTLJUEyGUH33dLut6JLLbPqpHnPm8tLW2ejnj6EEcw": "TEST-003/TEST-004's collection - TEST-004 is mid-verification",
};
const ASSET_RENT_LAMPORTS = 3469680; // measured on mainnet (open-items 45)
const UPLOADER = "https://uploader.irys.xyz";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

let LOG_PATH = null;
function log(event) {
  const line = JSON.stringify({ time: new Date().toISOString(), step: "mint-throwaway-card", ...event });
  console.log(line);
  if (LOG_PATH) fs.appendFileSync(LOG_PATH, line + "\n");
}
function fail(reason, message, code) {
  log({ status: "failure", reason, message });
  process.exit(code);
}
function flag(args, name) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
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

async function main() {
  const args = process.argv.slice(2);
  const backend = flag(args, "--backend");
  const collection = flag(args, "--collection");
  const write = args.includes("--write");
  const yes = args.includes("--yes");
  if (!backend || !collection) fail("usage", "--backend <dir> and --collection <address> are both required", 1);
  if (write !== yes) fail("usage", "--write and --yes go together; neither alone sends anything", 1);
  const B = path.resolve(backend);
  const logsDir = path.join(B, "logs");
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  LOG_PATH = path.join(logsDir, "mint-throwaway-card.log");

  if (FORBIDDEN[collection]) fail("forbidden_collection", `${collection} is ${FORBIDDEN[collection]}. Not touched by this script.`, 1);
  if (fs.existsSync(LOG_PATH) && fs.readFileSync(LOG_PATH, "utf8").includes('"status":"minted"') && !args.includes("--again")) {
    fail("already_minted", "A throwaway was already minted (see logs/mint-throwaway-card.log). One is the point; pass --again only on purpose.", 1);
  }

  require(require.resolve("dotenv", { paths: [B] })).config({ path: path.join(B, ".env") });
  require(require.resolve("dotenv", { paths: [B] })).config({ path: path.join(B, ".env.admin") });
  const config = JSON.parse(fs.readFileSync(path.join(B, "config.json"), "utf8"));
  if (config.network !== "mainnet") fail("not_mainnet", `config.json network is ${config.network}; the marketplaces to check are mainnet`, 1);
  const secret = (process.env.DEPLOYER_PRIVATE_KEY || "").trim();
  if (!secret) fail("missing_deployer_key", "DEPLOYER_PRIVATE_KEY not set in <backend>/.env.admin", 1);

  // ---- The card: generated exactly as generate-images.js ships it ----------
  const { records } = parseCsvRecords(fs.readFileSync(path.join(B, "master.csv"), "utf8"));
  const row = records.find((r) => (r.collectionAddress || "").trim() === collection);
  if (!row) fail("no_row", `no master.csv row has collectionAddress ${collection}`, 1);
  const name = "Throwaway Render Test";
  const card = gi.composeCard({
    collectionName: row.collectionName || row.collectionSlug,
    itemName: name,
    dropItemId: "RENDER-TEST",
    attributes: [...gi.parseAttributes(row.attributes), { name: "Purpose", value: "Render check" }],
    description: "",
    symbol: config.symbol,
    palette: gi.resolvePalette(config.card, row.collectionSlug),
    fonts: gi.loadFonts(),
  });
  if (card.missingGlyphs.length) fail("glyph_not_in_font", JSON.stringify(card.missingGlyphs), 1);
  const png = gi.renderPng(card.svg);
  const preview = path.join(logsDir, "throwaway-card-preview.png");
  fs.writeFileSync(preview, png);

  // ---- Chain checks: authority and live gating -----------------------------
  const { createUmi } = await import("file:///" + require.resolve("@metaplex-foundation/umi-bundle-defaults", { paths: [B] }).replace(/\\/g, "/"));
  const mplCore = await import("file:///" + require.resolve("@metaplex-foundation/mpl-core", { paths: [B] }).replace(/\\/g, "/"));
  const cmLib = await import("file:///" + require.resolve("@metaplex-foundation/mpl-core-candy-machine", { paths: [B] }).replace(/\\/g, "/"));
  const umiLib = await import("file:///" + require.resolve("@metaplex-foundation/umi", { paths: [B] }).replace(/\\/g, "/"));
  const umi = createUmi(config.rpc).use(mplCore.mplCore()).use(cmLib.mplCandyMachine());
  const kp = umi.eddsa.createKeypairFromSecretKey(decodeBase58(secret));
  const signer = kp.publicKey.toString();
  const owner = flag(args, "--owner") || signer;

  let coll;
  try { coll = await mplCore.fetchCollection(umi, umiLib.publicKey(collection)); }
  catch (err) { fail("no_collection", `could not fetch collection ${collection}: ${err.message}`, 3); }
  if (coll.updateAuthority !== signer) fail("not_authority", `collection authority is ${coll.updateAuthority}, signer is ${signer}`, 1);

  const campaignsCsv = path.join(B, "campaigns.csv");
  const live = [];
  const csvOnly = [];
  if (fs.existsSync(campaignsCsv)) {
    for (const c of parseCsvRecords(fs.readFileSync(campaignsCsv, "utf8")).records) {
      if ((c.eligibilityCollection || "").trim() !== collection) continue;
      const addr = (c.campaignCandyMachineAddress || "").trim();
      let exists = false;
      try { exists = addr ? !!(await cmLib.safeFetchCandyMachine(umi, umiLib.publicKey(addr))) : false; } catch { exists = false; }
      (exists ? live : csvOnly).push(`${c.campaignId}${addr ? "" : " (no address)"}`);
    }
  }
  if (live.length) fail("gated_collection", `live campaign(s) gate ${collection}: ${live.join(", ")}. A new asset there is a fresh claim key.`, 1);

  // ---- Costs, read-only ------------------------------------------------------
  const metadataPreview = Buffer.byteLength(JSON.stringify(buildMetadata(row, config, name, "https://gateway.irys.xyz/" + "x".repeat(44)), null, 2));
  const priceOf = async (n) => Number(await (await fetch(`${UPLOADER}/price/solana/${n}`)).text());
  let pricePng, priceMeta, irysBalance;
  try {
    pricePng = await priceOf(png.length);
    priceMeta = await priceOf(metadataPreview);
    irysBalance = Number((await (await fetch(`${UPLOADER}/account/balance/solana?address=${signer}`)).json()).balance);
  } catch (err) { fail("irys_unreachable", `${UPLOADER} did not answer: ${err.message} (open-items 56)`, 2); }
  const solBalance = Number((await umi.rpc.getBalance(kp.publicKey)).basisPoints);
  const uploadTotal = pricePng + priceMeta;
  const fundNeeded = Math.max(0, uploadTotal - irysBalance);

  console.log("\n" + "=".repeat(72) + "\nTHROWAWAY CARD MINT - " + (write ? "WRITING" : "PLAN") + "\n" + "=".repeat(72));
  console.log(`  collection      ${collection}  (${row.collectionName}, slug ${row.collectionSlug})`);
  console.log(`  authority       ${coll.updateAuthority} = signer`);
  console.log(`  live gating     none`);
  console.log(`  CSV-only rows   ${csvOnly.length ? csvOnly.join(", ") + "  - in campaigns.csv, no account on chain" : "none"}`);
  console.log(`  owner           ${owner}${owner === signer ? "  (the signer; pass --owner to send it to your wallet)" : ""}`);
  console.log(`  card            ${png.length} bytes PNG, sha256 ${gi.sha256(png).slice(0, 16)}  preview: ${preview}`);
  console.log(`  name            "${name}"`);
  console.log(`  upload          image ${pricePng} + metadata ${priceMeta} = ${uploadTotal} lamports; Irys balance ${irysBalance}${fundNeeded ? `, funds ${fundNeeded} first` : ""}`);
  console.log(`  asset rent      ~${ASSET_RENT_LAMPORTS} lamports (measured), plus fees`);
  console.log(`  total           ~${uploadTotal + ASSET_RENT_LAMPORTS + 10000} lamports (uploads + rent + ~2 fees); signer SOL balance ${solBalance}`);

  if (!write) {
    log({ status: "plan", collection, owner, pngBytes: png.length, pngSha256: gi.sha256(png), uploadLamports: uploadTotal, fundNeeded, csvOnlyGating: csvOnly });
    console.log("\nPlan only - nothing was sent. Look at the preview, then re-run with --write --yes.\n");
    process.exit(0);
  }

  // ---- Write ---------------------------------------------------------------
  const { Uploader } = await import("file:///" + require.resolve("@irys/upload", { paths: [B] }).replace(/\\/g, "/"));
  const { Solana } = await import("file:///" + require.resolve("@irys/upload-solana", { paths: [B] }).replace(/\\/g, "/"));
  let imageUrl, uri;
  try {
    const irys = await Uploader(Solana).withWallet(secret).withRpc(process.env.SOLANA_RPC_URL || config.rpc).mainnet();
    if (fundNeeded > 0) { await irys.fund(fundNeeded); log({ status: "info", message: `funded Irys ${fundNeeded} lamports` }); }
    const img = await irys.upload(png, { tags: [{ name: "Content-Type", value: "image/png" }] });
    imageUrl = `https://gateway.irys.xyz/${img.id}`;
    log({ status: "info", message: "image uploaded", imageUrl });
    const meta = JSON.stringify(buildMetadata(row, config, name, imageUrl), null, 2);
    const m = await irys.upload(meta, { tags: [{ name: "Content-Type", value: "application/json" }] });
    uri = `https://gateway.irys.xyz/${m.id}`;
    log({ status: "info", message: "metadata uploaded", uri });
  } catch (err) { fail("upload_failed", err.message, 2); }

  umi.use(umiLib.keypairIdentity(kp));
  const asset = umiLib.generateSigner(umi);
  try {
    await mplCore.create(umi, { asset, collection: coll, name, uri, owner: umiLib.publicKey(owner) })
      .sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
  } catch (err) { fail("mint_failed", `${err.message} (uploads above are permanent and paid; the asset was not created)`, 3); }

  const back = await mplCore.fetchAsset(umi, asset.publicKey);
  log({ status: "minted", asset: asset.publicKey.toString(), owner: back.owner, uri: back.uri, imageUrl });
  console.log(`\nMinted ${asset.publicKey}. Look at it:\n  Solscan     https://solscan.io/token/${asset.publicKey}\n  Magic Eden  https://magiceden.io/item-details/${asset.publicKey}\n  Tensor      https://www.tensor.trade/item/${asset.publicKey}\n  and in the owner's wallet.\n`);
  process.exit(0);
}

// The metadata shape generate-metadata.js writes, for this one asset.
function buildMetadata(row, config, name, imageUrl) {
  return {
    name,
    symbol: config.symbol || "",
    description: "Throwaway render test of a generated card (open-items 53). Not part of any drop.",
    seller_fee_basis_points: 0,
    image: imageUrl,
    external_url: config.externalUrl || "",
    attributes: [...gi.parseAttributes(row.attributes).map((a) => ({ trait_type: a.name, value: a.value })), { trait_type: "Purpose", value: "Render check" }],
    properties: { files: [{ uri: imageUrl, type: "image/png" }], category: "image" },
    collection: { name: row.collectionName || row.collectionSlug, family: row.collectionSlug, address: row.collectionAddress },
  };
}

if (require.main === module) {
  main().catch((err) => fail("unhandled_error", err.message, 3));
}
