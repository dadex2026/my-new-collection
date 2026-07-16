export const CONFIG = {
  rpcUrl: import.meta.env.VITE_SOLANA_RPC_URL,

  backendApiUrl:
    import.meta.env.VITE_BACKEND_URL || "http://localhost:3001",

  registryUrl:
    import.meta.env.VITE_REGISTRY_URL || "/registry/registry.json",

  network:
    import.meta.env.VITE_SOLANA_NETWORK || "mainnet-beta",
};
