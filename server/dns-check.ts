import { lookup } from "node:dns/promises";

import type { ServerSettings } from "./types";

async function resolveAddresses(hostname: string): Promise<string[]> {
  try {
    const results = await lookup(hostname, { all: true });

    return results.map((result) => result.address);
  } catch {
    return [];
  }
}

export async function domainPointsToServer(
  domain: string,
  settings: ServerSettings
): Promise<{ matches: boolean; addresses: string[] }> {
  const [domainAddresses, serverAddresses] = await Promise.all([
    resolveAddresses(domain),
    resolveAddresses(settings.host),
  ]);

  return {
    matches: domainAddresses.some((address) =>
      serverAddresses.includes(address)
    ),
    addresses: domainAddresses,
  };
}
