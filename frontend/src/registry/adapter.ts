/**
 * frontend/src/registry/adapter.ts
 *
 * Replaces the live GET /registry call to server.js. Fetches the
 * static registry.json produced by scripts/generate-registry.js
 * instead — no backend involved at page-load time.
 *
 * CONFIRMED AGAINST THE REAL state.ts / normalize.ts / ui.engine.ts:
 *
 *   1. normalizeRegistry() returns two flat maps: {collections, drops}
 *      (collections keyed by slug, drops keyed by dropItemId). But
 *      ui.engine.ts expects state.registry to be an ARRAY, where each
 *      element is { collection, drops: RegistryDrop[] } — collections
 *      already grouped with their own nested drops, and each drop
 *      using a `key` field (not `dropItemId`) as its identity.
 *
 *      Nothing previously transformed one shape into the other — that
 *      was the actual bug causing "wallet connects but no cards show".
 *      groupForUI() below does that reshaping, kept here (not in
 *      normalize.ts) since it's UI-shape-specific, not a generic
 *      normalization concern.
 *
 *   2. setStatus(status: string) takes a plain string, not an object.
 *
 * STILL AN OPEN ITEM, not code:
 *
 *   3. frontend/.env's VITE_REGISTRY_URL must point at wherever
 *      registry.json is actually served (e.g. "/registry.json").
 */

import { normalizeRegistry } from "./normalize";
import type { NormalizedRegistry } from "./normalize";
import { setRegistry, setStatus } from "../state";

const REGISTRY_URL = import.meta.env.VITE_REGISTRY_URL as string;

/**
 * Reshapes the flat {collections, drops} maps normalizeRegistry()
 * produces into the array-of-collections-with-nested-drops shape
 * ui.engine.ts actually consumes, renaming each drop's identity field
 * from dropItemId (registry.json's name for it) to key (what
 * ui.engine.ts's buildDropCard/data-drop-id lookups expect).
 */
function groupForUI(normalized: NormalizedRegistry): any[] {
  const collectionsMap = normalized.collections as Record<string, any>;
  const dropsMap = normalized.drops as Record<string, any>;

  const dropsByCollectionSlug: Record<string, any[]> = {};
  for (const [dropItemId, dropRaw] of Object.entries(dropsMap)) {
    const drop = dropRaw as any;
    const slug = drop.collectionKey;
    const shaped = { ...drop, key: dropItemId };
    if (!dropsByCollectionSlug[slug]) dropsByCollectionSlug[slug] = [];
    dropsByCollectionSlug[slug].push(shaped);
  }

  return Object.entries(collectionsMap).map(([slug, collection]) => ({
    collection,
    drops: dropsByCollectionSlug[slug] ?? [],
  }));
}

/**
 * Fetches and normalizes the static registry, then pushes the
 * UI-shaped (grouped) version into app state. Returns the raw
 * NormalizedRegistry (flat maps) so refreshMintedCounts below can
 * still enrich it before re-grouping.
 */
export async function loadRegistry(): Promise<NormalizedRegistry | null> {
  try {
    const res = await fetch(REGISTRY_URL, { cache: "no-store" });

    if (!res.ok) {
      setStatus(
        `Could not load registry (HTTP ${res.status}). Check VITE_REGISTRY_URL and that registry.json was generated and deployed.`
      );
      return null;
    }

    const raw = await res.json();
    const normalized = normalizeRegistry(raw);
    setRegistry(groupForUI(normalized));
    return normalized;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Registry fetch failed: ${message}`);
    return null;
  }
}

/**
 * OPTIONAL enrichment: registry.json's `minted` count is a snapshot
 * from whenever generate-registry.js last ran — it can go stale
 * between deploys. This fetches the live itemsRedeemed count directly
 * from each drop's on-chain candy machine account, merges it into the
 * raw (flat-map) registry, then re-groups and re-pushes to state.
 *
 * NOT called automatically inside loadRegistry() — one RPC call per
 * drop with a candy machine deployed, fine for a handful of drops but
 * shouldn't block the initial page render for a large catalog. Call
 * this after the first render (e.g. from ui.engine.ts), passing the
 * NormalizedRegistry that loadRegistry() returned.
 */
export async function refreshMintedCounts(registry: NormalizedRegistry): Promise<void> {
  const dropsWithCandyMachine = Object.values(registry.drops).filter(
    (d: any) => d.candyMachineAddress && d.network
  );

  if (dropsWithCandyMachine.length === 0) return;

  const [{ createUmi }, { mplCandyMachine, safeFetchCandyMachine }, { publicKey }] = await Promise.all([
    import("@metaplex-foundation/umi-bundle-defaults"),
    import("@metaplex-foundation/mpl-core-candy-machine"),
    import("@metaplex-foundation/umi"),
  ]);

  const rpcByNetwork: Record<string, string | undefined> = {
    devnet: import.meta.env.VITE_SOLANA_RPC_URL_DEVNET as string,
    mainnet: import.meta.env.VITE_SOLANA_RPC_URL as string,
  };

  const umiByNetwork: Record<string, ReturnType<typeof createUmi>> = {};

  for (const drop of dropsWithCandyMachine as any[]) {
    const rpc = rpcByNetwork[drop.network];
    if (!rpc) continue;

    if (!umiByNetwork[drop.network]) {
      umiByNetwork[drop.network] = createUmi(rpc).use(mplCandyMachine());
    }
    const umi = umiByNetwork[drop.network];

    try {
      const account = await safeFetchCandyMachine(umi, publicKey(drop.candyMachineAddress));
      if (account) {
        drop.minted = Number(account.itemsRedeemed);
      }
    } catch {
      // Best-effort only — leave the static snapshot value in place
      // rather than surfacing an error for a non-critical enrichment.
    }
  }

  setRegistry(groupForUI({ ...registry, drops: { ...registry.drops } }));
}