import { CONFIG } from "../config";

export async function fetchRegistryRaw(): Promise<unknown> {
  const res = await fetch(CONFIG.registryUrl, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Registry fetch failed: ${CONFIG.registryUrl}`);
  }

  return await res.json();
}