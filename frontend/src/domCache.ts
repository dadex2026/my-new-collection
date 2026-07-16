// Simple DOM cache for ultra-fast lookup
const cache = new Map<string, HTMLElement>();

export function getNode(id: string): HTMLElement {
  const existing = cache.get(id);
  if (existing) return existing;

  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing node: ${id}`);

  cache.set(id, el);
  return el;
}

export function clearCache() {
  cache.clear();
}