import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TunnelManager, tunnelSshArguments } from "./tunnel-manager";
import type {
  RequestLogEntry,
  ServerSettings,
  TunnelDefinition,
} from "./types";

const settings: ServerSettings = {
  host: "203.0.113.10",
  administratorUser: "root",
  tunnelUser: "tunnel",
  tunnelKeyPath: "/keys/tunnelbox_tunnel",
  certificateEmail: "owner@example.com",
  firstRemotePort: 9080,
};

const tunnel: TunnelDefinition = {
  id: "tunnel-1",
  name: "Example API",
  domain: "api.example.org",
  localPort: 8080,
  remotePort: 9080,
  nginxSiteName: "tunnelbox-api.example.org",
  provisioned: true,
};

type FakeProcess = ChildProcess & {
  stderr: PassThrough;
  finish: (code: number) => void;
};

function fakeProcess(): FakeProcess {
  const emitter = new EventEmitter() as FakeProcess;

  emitter.stderr = new PassThrough();
  emitter.kill = vi.fn(() => {
    emitter.emit("exit", null);

    return true;
  });
  emitter.finish = (code) => emitter.emit("exit", code);

  return emitter;
}

describe("TunnelManager", () => {
  let processes: FakeProcess[];
  let logRequest: (entry: RequestLogEntry) => void;
  let closedProxies: number;
  let manager: TunnelManager;

  beforeEach(() => {
    vi.useFakeTimers();
    processes = [];
    closedProxies = 0;
    manager = new TunnelManager(
      () => {
        const process = fakeProcess();
        processes.push(process);

        return process;
      },
      [1_000],
      (_targetPort, logger) => {
        logRequest = logger;

        return {
          start: async () => 50_000,
          close: () => {
            closedProxies += 1;
          },
        };
      }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function startTunnel(expectedProcesses = 1) {
    manager.start(tunnel, settings);
    await vi.waitFor(() => expect(processes).toHaveLength(expectedProcesses));
  }

  it("forwards the VPS port to the local request proxy", () => {
    const argumentsList = tunnelSshArguments(tunnel, settings, 50_000);

    expect(argumentsList).toContain("127.0.0.1:9080:127.0.0.1:50000");
    expect(argumentsList.at(-1)).toBe("tunnel@203.0.113.10");
    expect(argumentsList).toContain("ExitOnForwardFailure=yes");
  });

  it("moves from connecting to connected when SSH reports the forward", async () => {
    await startTunnel();

    expect(manager.status(tunnel.id).state).toBe("connecting");

    processes[0].stderr.write(
      "debug1: remote forward success for: listen 127.0.0.1:9080, connect 127.0.0.1:50000\n"
    );
    await vi.waitFor(() =>
      expect(manager.status(tunnel.id).state).toBe("connected")
    );
  });

  it("records requests logged by the proxy", async () => {
    await startTunnel();

    logRequest({
      time: "2026-09-27T00:00:00.000Z",
      method: "GET",
      path: "/inbox",
      status: 200,
      durationMilliseconds: 12,
      clientAddress: "198.51.100.7",
      error: null,
    });

    expect(manager.status(tunnel.id).requests).toHaveLength(1);
    expect(manager.status(tunnel.id).requests[0].path).toBe("/inbox");
  });

  it("retries after an unexpected exit while switched on", async () => {
    await startTunnel();
    processes[0].stderr.write("Connection closed by 203.0.113.10 port 22\n");
    await vi.waitFor(() =>
      expect(manager.status(tunnel.id).lastError).toContain("Connection closed")
    );

    processes[0].finish(255);

    expect(manager.status(tunnel.id).state).toBe("retrying");

    vi.advanceTimersByTime(1_000);

    expect(processes).toHaveLength(2);
  });

  it("stops retrying when the key is rejected", async () => {
    await startTunnel();
    processes[0].stderr.write(
      "tunnel@203.0.113.10: Permission denied (publickey).\n"
    );
    await vi.waitFor(() =>
      expect(manager.status(tunnel.id).lastError).toContain("Permission denied")
    );

    processes[0].finish(255);
    vi.advanceTimersByTime(5_000);

    expect(manager.status(tunnel.id).state).toBe("error");
    expect(processes).toHaveLength(1);
  });

  it("does not restart after a deliberate stop, and closes the proxy", async () => {
    await startTunnel();
    manager.stop(tunnel.id);
    vi.advanceTimersByTime(5_000);

    expect(manager.status(tunnel.id).state).toBe("stopped");
    expect(processes[0].kill).toHaveBeenCalled();
    expect(processes).toHaveLength(1);
    expect(closedProxies).toBe(1);
  });
});
