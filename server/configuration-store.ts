import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { Configuration, TunnelDefinition } from "./types";

export function defaultConfigurationPath(): string {
  const base = process.env.TUNNELBOX_HOME ?? join(homedir(), ".tunnelbox");

  return join(base, "configuration.json");
}

export class ConfigurationStore {
  private configuration: Configuration = { server: null, tunnels: [] };

  constructor(private readonly path: string) {}

  async load(): Promise<Configuration> {
    try {
      const raw = await readFile(this.path, "utf-8");
      const parsed = JSON.parse(raw) as Partial<Configuration>;

      this.configuration = {
        server: parsed.server ?? null,
        tunnels: parsed.tunnels ?? [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    return this.configuration;
  }

  get(): Configuration {
    return this.configuration;
  }

  findTunnel(id: string): TunnelDefinition | undefined {
    return this.configuration.tunnels.find((tunnel) => tunnel.id === id);
  }

  async update(
    change: (configuration: Configuration) => Configuration
  ): Promise<Configuration> {
    const next = change(structuredClone(this.configuration));
    const temporaryPath = `${this.path}.tmp`;

    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temporaryPath, this.path);

    this.configuration = next;

    return next;
  }
}

export function nextRemotePort(configuration: Configuration): number {
  const firstPort = configuration.server?.firstRemotePort ?? 9080;
  const usedPorts = new Set(
    configuration.tunnels.map((tunnel) => tunnel.remotePort)
  );
  let port = firstPort;

  while (usedPorts.has(port)) {
    port += 1;
  }

  return port;
}
