import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ConfigurationStore, nextRemotePort } from "./configuration-store";
import type { Configuration, TunnelDefinition } from "./types";

const tunnel = (remotePort: number): TunnelDefinition => ({
  id: `tunnel-${remotePort}`,
  name: `Tunnel ${remotePort}`,
  domain: `t${remotePort}.example.org`,
  localPort: 8080,
  remotePort,
  nginxSiteName: `tunnelbox-t${remotePort}.example.org`,
  provisioned: true,
});

describe("ConfigurationStore", () => {
  it("starts empty when no file exists, then persists updates with private permissions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tunnelbox-"));
    const path = join(directory, "nested", "configuration.json");
    const store = new ConfigurationStore(path);

    expect(await store.load()).toEqual({ server: null, tunnels: [] });

    await store.update((configuration) => ({
      ...configuration,
      tunnels: [tunnel(9080)],
    }));

    const reloaded = new ConfigurationStore(path);

    expect((await reloaded.load()).tunnels).toHaveLength(1);
    expect(
      JSON.parse(await readFile(path, "utf-8")).tunnels[0].remotePort
    ).toBe(9080);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
});

describe("nextRemotePort", () => {
  it("returns the first port not used by any tunnel", () => {
    const configuration: Configuration = {
      server: null,
      tunnels: [tunnel(9080), tunnel(9082)],
    };

    expect(nextRemotePort(configuration)).toBe(9081);
  });
});
