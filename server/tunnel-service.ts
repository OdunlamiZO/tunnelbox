import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { ConfigurationStore, nextRemotePort } from "./configuration-store";
import { JobRunner } from "./job-runner";
import type { RemoteRunner } from "./remote-runner";
import { domainPointsToServer } from "./dns-check";
import { TunnelManager, expandHomeDirectory } from "./tunnel-manager";
import type {
  Job,
  SaveTunnelRequest,
  ServerSettings,
  TunnelDefinition,
  TunnelView,
} from "./types";
import { ValidationError } from "./validation";
import {
  changeDomainScript,
  deprovisionTunnelScript,
  prepareServerScript,
  provisionTunnelScript,
} from "./vps-scripts";

export class NotFoundError extends Error {}

export class ConflictError extends Error {}

export type SaveTunnelResult = {
  tunnel: TunnelDefinition;
  job: Job | null;
};

export class TunnelService {
  constructor(
    private readonly store: ConfigurationStore,
    private readonly manager: TunnelManager,
    private readonly jobs: JobRunner,
    private readonly runRemoteScript: RemoteRunner
  ) {}

  listTunnels(): TunnelView[] {
    return this.store.get().tunnels.map((tunnel) => ({
      ...tunnel,
      status: this.manager.status(tunnel.id),
    }));
  }

  settings(): ServerSettings | null {
    return this.store.get().server;
  }

  async saveSettings(settings: ServerSettings): Promise<ServerSettings> {
    await this.store.update((configuration) => ({
      ...configuration,
      server: settings,
    }));

    return settings;
  }

  job(id: string): Job {
    const job = this.jobs.get(id);

    if (!job) {
      throw new NotFoundError("Job not found.");
    }

    return job;
  }

  async createTunnel(request: SaveTunnelRequest): Promise<SaveTunnelResult> {
    this.requireSettings();
    this.assertUnique(request);

    const tunnel: TunnelDefinition = {
      id: randomUUID(),
      name: request.name,
      domain: request.domain,
      localPort: request.localPort,
      remotePort: nextRemotePort(this.store.get()),
      nginxSiteName: `tunnelbox-${request.domain}`,
      provisioned: false,
    };

    await this.store.update((configuration) => ({
      ...configuration,
      tunnels: [...configuration.tunnels, tunnel],
    }));

    return { tunnel, job: this.startProvisioning(tunnel) };
  }

  provisionTunnel(id: string): Job {
    const tunnel = this.requireTunnel(id);

    this.assertNoRunningJob(id);

    if (tunnel.provisioned) {
      throw new ConflictError("This tunnel is already set up on the VPS.");
    }

    return this.startProvisioning(tunnel);
  }

  async updateTunnel(
    id: string,
    request: SaveTunnelRequest
  ): Promise<SaveTunnelResult> {
    const settings = this.requireSettings();
    const current = this.requireTunnel(id);

    this.assertNoRunningJob(id);
    this.assertUnique(request, id);

    const renamed = await this.replaceTunnel({
      ...current,
      name: request.name,
      localPort: request.localPort,
    });

    if (renamed.localPort !== current.localPort && this.manager.isActive(id)) {
      this.manager.restart(renamed, settings);
    }

    if (request.domain === current.domain) {
      return { tunnel: renamed, job: null };
    }

    const moved: TunnelDefinition = {
      ...renamed,
      domain: request.domain,
      nginxSiteName: `tunnelbox-${request.domain}`,
    };

    if (!current.provisioned) {
      return { tunnel: await this.replaceTunnel(moved), job: null };
    }

    const job = this.jobs.start("change-domain", id, async (log) => {
      await this.assertDomainPointsToServer(moved.domain, settings, log);
      await this.runRemoteScript(
        settings,
        changeDomainScript(renamed, moved, settings),
        log
      );

      const saved = await this.replaceTunnel(moved);

      if (this.manager.isActive(id)) {
        this.manager.restart(saved, settings);
      }
    });

    return { tunnel: renamed, job };
  }

  async deleteTunnel(id: string): Promise<Job | null> {
    const tunnel = this.requireTunnel(id);

    this.assertNoRunningJob(id);
    this.manager.stop(id);

    if (!tunnel.provisioned) {
      await this.removeTunnel(id);

      return null;
    }

    const settings = this.requireSettings();

    return this.jobs.start("deprovision", id, async (log) => {
      const publicKey = await this.readPublicKey(settings);
      const remainingPorts = this.provisionedPorts().filter(
        (port) => port !== tunnel.remotePort
      );

      await this.runRemoteScript(
        settings,
        deprovisionTunnelScript(tunnel, settings, publicKey, remainingPorts),
        log
      );
      await this.removeTunnel(id);
    });
  }

  startTunnel(id: string) {
    const tunnel = this.requireTunnel(id);
    const settings = this.requireSettings();

    if (!tunnel.provisioned) {
      throw new ConflictError(
        "Finish setting up this tunnel on the VPS before starting it."
      );
    }

    this.manager.start(tunnel, settings);
  }

  stopTunnel(id: string) {
    this.requireTunnel(id);
    this.manager.stop(id);
  }

  prepareServer(): Job {
    const settings = this.requireSettings();

    return this.jobs.start("prepare-server", null, async (log) => {
      const publicKey = await this.readPublicKey(settings);

      await this.runRemoteScript(
        settings,
        prepareServerScript(settings, publicKey, this.provisionedPorts()),
        log
      );
    });
  }

  stopAll() {
    this.manager.stopAll();
  }

  private startProvisioning(tunnel: TunnelDefinition): Job {
    const settings = this.requireSettings();

    return this.jobs.start("provision", tunnel.id, async (log) => {
      await this.assertDomainPointsToServer(tunnel.domain, settings, log);

      const publicKey = await this.readPublicKey(settings);
      const ports = [...this.provisionedPorts(), tunnel.remotePort];

      await this.runRemoteScript(
        settings,
        provisionTunnelScript(tunnel, settings, publicKey, ports),
        log
      );
      await this.replaceTunnel({
        ...this.requireTunnel(tunnel.id),
        provisioned: true,
      });
    });
  }

  private async assertDomainPointsToServer(
    domain: string,
    settings: ServerSettings,
    log: (line: string) => void
  ) {
    log(`==> Checking ${domain} points to ${settings.host}`);

    const dns = await domainPointsToServer(domain, settings);

    if (!dns.matches) {
      const found =
        dns.addresses.length > 0 ? dns.addresses.join(", ") : "nothing";

      throw new Error(
        `${domain} resolves to ${found}, not ${settings.host}. Point its DNS at the VPS and try again.`
      );
    }
  }

  private async readPublicKey(settings: ServerSettings): Promise<string> {
    const path = `${expandHomeDirectory(settings.tunnelKeyPath)}.pub`;

    try {
      return (await readFile(path, "utf-8")).trim();
    } catch {
      throw new Error(`Could not read the tunnel public key at ${path}.`);
    }
  }

  private provisionedPorts(): number[] {
    return this.store
      .get()
      .tunnels.filter((tunnel) => tunnel.provisioned)
      .map((tunnel) => tunnel.remotePort);
  }

  private async replaceTunnel(
    tunnel: TunnelDefinition
  ): Promise<TunnelDefinition> {
    await this.store.update((configuration) => ({
      ...configuration,
      tunnels: configuration.tunnels.map((existing) =>
        existing.id === tunnel.id ? tunnel : existing
      ),
    }));

    return tunnel;
  }

  private async removeTunnel(id: string) {
    this.manager.forget(id);

    await this.store.update((configuration) => ({
      ...configuration,
      tunnels: configuration.tunnels.filter((tunnel) => tunnel.id !== id),
    }));
  }

  private requireSettings(): ServerSettings {
    const settings = this.store.get().server;

    if (!settings) {
      throw new ValidationError("Add your VPS settings first.");
    }

    return settings;
  }

  private requireTunnel(id: string): TunnelDefinition {
    const tunnel = this.store.findTunnel(id);

    if (!tunnel) {
      throw new NotFoundError("Tunnel not found.");
    }

    return tunnel;
  }

  private assertNoRunningJob(id: string) {
    if (this.jobs.runningJobForTunnel(id)) {
      throw new ConflictError("A VPS job is already running for this tunnel.");
    }
  }

  private assertUnique(request: SaveTunnelRequest, exceptId?: string) {
    const others = this.store
      .get()
      .tunnels.filter((tunnel) => tunnel.id !== exceptId);

    if (others.some((tunnel) => tunnel.domain === request.domain)) {
      throw new ConflictError(`Another tunnel already uses ${request.domain}.`);
    }

    if (
      others.some(
        (tunnel) => tunnel.name.toLowerCase() === request.name.toLowerCase()
      )
    ) {
      throw new ConflictError(
        `Another tunnel is already called "${request.name}".`
      );
    }
  }
}
