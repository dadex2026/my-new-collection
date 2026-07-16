const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, ".env.admin") });

function mustGet(name) {
  const v = process.env[name];
  if (!v || typeof v !== "string") {
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

module.exports = {
  RPC: mustGet("SOLANA_RPC_URL"),
  KEY: mustGet("DEPLOYER_PRIVATE_KEY"),
};