console.log("🔥 DEPLOY SCRIPT BOOTING...");

import fs from "fs";
import dotenv from "dotenv";

// IMPORTANT: load correct env file
dotenv.config({ path: ".env.admin" });

const bs58 = require("bs58");

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { keypairIdentity, generateSigner } from "@metaplex-foundation/umi";
import { create, mplCore } from "@metaplex-foundation/mpl-core";

async function main() {
  console.log("🟢 Script started");

  // -----------------------------
  // ENV CHECK
  // -----------------------------
  const rpc = process.env.SOLANA_RPC_URL;
  const secret = process.env.DEPLOYER_PRIVATE_KEY;
  const treasury = process.env.TREASURY_ADDRESS || "";

  console.log("🔵 ENV CHECK:");
  console.log("RPC:", rpc ? "OK" : "MISSING");
  console.log("KEY:", secret ? "OK" : "MISSING");
  console.log("TREASURY:", treasury ? "OK" : "MISSING");

  if (!rpc || !secret) {
    throw new Error("Missing required env vars in .env.admin");
  }

  // -----------------------------
  // INIT UMI
  // -----------------------------
  console.log("🟡 Initializing UMI...");

  const umi = createUmi(rpc).use(mplCore());

  const keypair = umi.eddsa.createKeypairFromSecretKey(
    bs58.decode(secret)
  );

  umi.use(keypairIdentity(keypair));

  // -----------------------------
  // CREATE CORE ASSET
  // -----------------------------
  console.log("🚀 Creating Core Asset...");

  const asset = generateSigner(umi);

  await create(umi, {
    asset,
    name: "Template Open Edition",
    uri: "https://example.com/metadata.json",
  }).sendAndConfirm(umi);

  const assetAddress = asset.publicKey.toString();

  // -----------------------------
  // SUCCESS OUTPUT
  // -----------------------------
  console.log("\n==============================");
  console.log("✅ DEPLOY SUCCESS");
  console.log("==============================");
  console.log("Asset Address:", assetAddress);
  console.log("==============================\n");

  // -----------------------------
  // WRITE DEPLOYMENT FILE
  // -----------------------------
  const deployment = {
    assetAddress,
    treasury,
    rpc,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    "deployment.json",
    JSON.stringify(deployment, null, 2)
  );

  console.log("💾 Saved deployment.json");
  console.log("📦 READY FOR MINT PIPELINE");
}

// -----------------------------
// SAFE EXECUTION WRAPPER
// -----------------------------
main()
  .then(() => {
    console.log("🏁 DONE");
  })
  .catch((err) => {
    console.error("❌ DEPLOY FAILED:");
    console.error(err);
  });