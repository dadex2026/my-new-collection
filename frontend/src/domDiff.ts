type Key = string;

const registryNodes = new Map<Key, HTMLElement>();

// ------------------------------------------------------------
// REGISTER NODE
// ------------------------------------------------------------
export function registerNode(key: Key, el: HTMLElement) {
  registryNodes.set(key, el);
}

// ------------------------------------------------------------
// GET NODE
// ------------------------------------------------------------
export function getNode(key: Key) {
  return registryNodes.get(key);
}

// ------------------------------------------------------------
// REMOVE NODE
// ------------------------------------------------------------
export function removeNode(key: Key) {
  const el = registryNodes.get(key);
  if (!el) return;

  el.remove();
  registryNodes.delete(key);
}

// ------------------------------------------------------------
// CLEAR ALL NODES
// ------------------------------------------------------------
export function clearNodes() {
  for (const key of Array.from(registryNodes.keys())) {
    removeNode(key);
  }
  registryNodes.clear();
}

// ------------------------------------------------------------
// CLEAR MISSING KEYS (DIFF CLEANUP)
// ------------------------------------------------------------
export function reconcileKeys(validKeys: Set<Key>) {
  for (const key of registryNodes.keys()) {
    if (!validKeys.has(key)) {
      removeNode(key);
    }
  }
}