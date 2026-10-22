export const CONFIG = {
  rpcUrl: import.meta.env.VITE_SOLANA_RPC_URL,

  network:
    import.meta.env.VITE_SOLANA_NETWORK || "mainnet-beta",
};
