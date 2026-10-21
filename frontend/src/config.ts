export const CONFIG = {
  rpcUrl: import.meta.env.VITE_SOLANA_RPC_URL,

  backendApiUrl:
    import.meta.env.VITE_BACKEND_URL || "http://localhost:3001",

  network:
    import.meta.env.VITE_SOLANA_NETWORK || "mainnet-beta",
};
