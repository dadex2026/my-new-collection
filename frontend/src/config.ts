export const CONFIG = {
  rpcUrl: import.meta.env.VITE_SOLANA_RPC_URL,

  backendApiUrl:
    import.meta.env.VITE_BACKEND_URL || "http://localhost:3001",

  // Dead: registry/loader.ts is the only reader and nothing imports it. The
  // registry is loaded by registry/adapter.ts:43, which has no fallback, so a
  // missing VITE_REGISTRY_URL requests /undefined (open-items 49). This line
  // is stale and misled the 2026-08-28 decision; delete it with loader.ts.
  registryUrl:
    import.meta.env.VITE_REGISTRY_URL || "/registry/registry.json",

  network:
    import.meta.env.VITE_SOLANA_NETWORK || "mainnet-beta",
};
