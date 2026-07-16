let scheduled = false;
const queue = new Set<() => void>();

/**
 * Queue UI updates into a single microtask flush.
 * Prevents multiple signal triggers causing redundant DOM work.
 */
export function batch(fn: () => void) {
  queue.add(fn);

  if (scheduled) return;

  scheduled = true;

  queueMicrotask(() => {
    try {
      queue.forEach((fn) => fn());
    } finally {
      queue.clear();
      scheduled = false;
    }
  });
}