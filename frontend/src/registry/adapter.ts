/**
 * frontend/src/registry/adapter.ts
 *
 * Replaces the live GET /registry call to server.js. Fetches the
 * static registry.json produced by scripts/generate-registry.js
 * instead — no backend involved at page-load time.
 *
 * loadCampaigns() (new) does the same thing for campaigns.json,
 * produced by scripts/generate-campaigns-registry.js — a completely
 * separate static file, separate fetch, separate state field
 * (state.campaigns), kept independent of the drop registry the same
 * way deploy-campaign.js's on-chain supply is kept independent of a
 * drop's normal public candy machine.
 *
 * CONFIRMED AGAINST THE REAL state.ts / normalize.ts (not guessed):
 *
 *   1. The normalize function is named normalizeRegistry, not
 *      adaptRegistry. It types drops/collections values as `unknown`,
 *      not a concrete shape — so mint.ts casts to `any` when reading
 *      candyMachineAddress/collectionAddress/treasury off a drop.
 *
 *   2. setStatus(status: string) takes a plain string, not an object —
 *      there's no {type, message} shape in this codebase's state.ts.
 *
 *   3. groupForUI() reshapes normalizeRegistry()'s flat {collections,
 *      drops} maps into the array-of-{collection, drops} shape
 *      ui.engine.ts actually renders, renaming each drop's dropItemId
 *      to key. campaigns.json is NOT run through this — it's already
 *      a flat array of campaign objects, matching what a prospective
 *      renderCampaigns() in ui.engine.ts would iterate directly.
 *
 * STILL AN OPEN ITEM, not code:
 *
 *   4. frontend/.env's VITE_REGISTRY_URL must point at wherever
 *      registry.json is actually served (e.g. "/registry.json").
 *      campaigns.json needs the equivalent: VITE_CAMPAIGNS_URL,
 *      defaulting to "/campaigns.json" if not set, matching where
 *      generate-campaigns-registry.js actually copies it.
 */

import { normalizeRegistry } from "./normalize";
import type { NormalizedRegistry } from "./normalize";
import { setRegistry, setCampaigns, setStatus } from "../state";
import type { Campaign } from "../types";

const REGISTRY_URL = import.meta.env.VITE_REGISTRY_URL as string;
const CAMPAIGNS_URL = (import.meta.env.VITE_CAMPAIGNS_URL as string) || "/campaigns.json";

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
 * Fetches campaigns.json (produced by generate-campaigns-registry.js)
 * and pushes it into state.campaigns. Unlike loadRegistry(), there's
 * no reshaping needed — campaigns.json's `campaigns` array is already
 * the flat shape a campaign UI would iterate directly.
 *
 * A missing/404 campaigns.json is NOT treated as an error — most
 * collections won't have any campaigns running, and that's a normal,
 * expected state, not a failure. state.campaigns is just left empty.
 */
export async function loadCampaigns(): Promise<Campaign[]> {
  try {
    const res = await fetch(CAMPAIGNS_URL, { cache: "no-store" });

    if (!res.ok) {
      // Not found is expected/normal for a collection with no campaigns.
      // Only genuinely unexpected statuses get surfaced as a status message.
      if (res.status !== 404) {
        setStatus(`Could not load campaigns (HTTP ${res.status}).`);
      }
      setCampaigns([]);
      return [];
    }

    const raw = await res.json();
    const campaigns: Campaign[] = raw.campaigns || [];
    setCampaigns(campaigns);
    return campaigns;
  } catch (err) {
    // Log the real reason rather than fail completely silently — an
    // empty campaigns list IS a normal state (most collections won't
    // have any), so this deliberately doesn't call setStatus() and
    // interrupt the whole page over an optional feature. But a
    // genuine fetch failure (network blip, bad URL, CORS) should be
    // visible somewhere, not indistinguishable from "no campaigns
    // configured" — this exact silent-failure pattern is what turned
    // a one-line missing #campaigns div into a long debugging session.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Campaigns fetch failed: ${message}`);
    setCampaigns([]);
    return [];
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
