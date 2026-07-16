export interface RawRegistry {
  collections?: Record<string, unknown>;
  drops?: Record<string, unknown>;
}

export interface NormalizedRegistry {
  collections: Record<string, unknown>;
  drops: Record<string, unknown>;
}

export function normalizeRegistry(raw: RawRegistry): NormalizedRegistry {
  const collectionsMap = raw.collections ?? {};
  const dropsMap = raw.drops ?? {};

  const collections: Record<string, unknown> = {};
  const drops: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(collectionsMap)) {
    collections[key] = value;
  }

  for (const [key, value] of Object.entries(dropsMap)) {
    drops[key] = value;
  }

  return { collections, drops };
}
