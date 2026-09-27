import { type ChildProcess, spawn } from "node:child_process";
import { homedir } from "node:os";

import { RequestProxy } from "./request-proxy";
import type {
  RequestLogEntry,
  ServerSettings,
  TunnelDefinition,
  TunnelState,
  TunnelStatus,
} from "./types";

export type SpawnTunnelProcess = (argumentsList: string[]) => ChildProcess;

export type LocalProxy = {
  start(): Promise<number>;
  close(): void;
};

export type CreateLocalProxy = (
  targetPort: number,
  logRequest: (entry: RequestLogEntry) => void
) => LocalProxy;

const MAXIMUM_LOG_LINES = 100;

const MAXIMUM_REQUEST_ENTRIES = 100;

const DEFAULT_RETRY_DELAYS_MILLISECONDS = [
  2_000, 5_000, 10_000, 30_000, 60_000,
];

const ERROR_MARKERS = [
  "Permission denied",
  "remote port forwarding failed",
  "Connection refused",
  "Connection timed out",
  "Operation timed out",
  "Could not resolve hostname",
  "No route to host",
  "Host key verification failed",
  "Connection closed",
];

const FATAL_MARKERS = ["Permission denied", "Host key verification failed"];

type Entry = {
  status: TunnelStatus;
  desiredRunning: boolean;
  child: ChildProcess | null;
  retryTimer: NodeJS.Timeout | null;
  tunnel: TunnelDefinition;
  settings: ServerSettings;
  proxy: LocalProxy | null;
  proxyPort: number | null;
};

export function expandHomeDirectory(path: string): string {
  return path.startsWith("~/") ? `${homedir()}${path.slice(1)}` : path;
}

export function tunnelSshArguments(
  tunnel: TunnelDefinition,
  settings: ServerSettings,
  proxyPort: number
): string[] {
  return [
    "-N",
    "-v",
    "-i",
    expandHomeDirectory(settings.tunnelKeyPath),
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "BatchMode=yes",
    "-o",
    "ExitOnForwardFailure=yes",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-R",
    `127.0.0.1:${tunnel.remotePort}:127.0.0.1:${proxyPort}`,
    `${settings.tunnelUser}@${settings.host}`,
  ];
}

function stoppedStatus(): TunnelStatus {
  return {
    state: "stopped",
    since: new Date().toISOString(),
    lastError: null,
    retryAttempt: 0,
    logLines: [],
    requests: [],
  };
}

export class TunnelManager {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly spawnTunnelProcess: SpawnTunnelProcess = (argumentsList) =>
      spawn("ssh", argumentsList, { stdio: ["ignore", "ignore", "pipe"] }),
    private readonly retryDelays: number[] = DEFAULT_RETRY_DELAYS_MILLISECONDS,
    private readonly createLocalProxy: CreateLocalProxy = (
      targetPort,
      logRequest
    ) => new RequestProxy(targetPort, logRequest)
  ) {}

  status(id: string): TunnelStatus {
    return this.entries.get(id)?.status ?? stoppedStatus();
  }

  isActive(id: string): boolean {
    return this.entries.get(id)?.desiredRunning ?? false;
  }

  start(tunnel: TunnelDefinition, settings: ServerSettings) {
    const existing = this.entries.get(tunnel.id);

    if (existing?.desiredRunning) {
      return;
    }

    const entry: Entry = {
      status: {
        ...stoppedStatus(),
        logLines: existing?.status.logLines ?? [],
        requests: existing?.status.requests ?? [],
      },
      desiredRunning: true,
      child: null,
      retryTimer: null,
      tunnel,
      settings,
      proxy: null,
      proxyPort: null,
    };

    this.entries.set(tunnel.id, entry);
    void this.startProxyAndLaunch(entry);
  }

  stop(id: string) {
    const entry = this.entries.get(id);

    if (!entry) {
      return;
    }

    entry.desiredRunning = false;

    if (entry.retryTimer) {
      clearTimeout(entry.retryTimer);
      entry.retryTimer = null;
    }

    entry.child?.kill("SIGTERM");
    entry.child = null;
    entry.proxy?.close();
    entry.proxy = null;
    entry.proxyPort = null;
    this.setState(entry, "stopped");
    this.appendLog(entry, "Stopped.");
  }

  restart(tunnel: TunnelDefinition, settings: ServerSettings) {
    this.stop(tunnel.id);
    this.start(tunnel, settings);
  }

  forget(id: string) {
    this.stop(id);
    this.entries.delete(id);
  }

  stopAll() {
    for (const id of this.entries.keys()) {
      this.stop(id);
    }
  }

  private async startProxyAndLaunch(entry: Entry) {
    const proxy = this.createLocalProxy(entry.tunnel.localPort, (request) =>
      this.appendRequest(entry, request)
    );

    try {
      const proxyPort = await proxy.start();

      if (!entry.desiredRunning) {
        proxy.close();

        return;
      }

      entry.proxy = proxy;
      entry.proxyPort = proxyPort;
      this.launch(entry);
    } catch (error) {
      entry.desiredRunning = false;
      entry.status.lastError = `Could not start the request proxy: ${(error as Error).message}`;
      this.setState(entry, "error");
      this.appendLog(entry, entry.status.lastError);
    }
  }

  private launch(entry: Entry) {
    if (entry.proxyPort === null) {
      return;
    }

    this.setState(
      entry,
      entry.status.retryAttempt > 0 ? "retrying" : "connecting"
    );
    this.appendLog(
      entry,
      `Connecting ${entry.tunnel.domain} → localhost:${entry.tunnel.localPort}…`
    );

    const child = this.spawnTunnelProcess(
      tunnelSshArguments(entry.tunnel, entry.settings, entry.proxyPort)
    );
    entry.child = child;

    child.stderr?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        this.handleOutputLine(entry, line.trim());
      }
    });

    child.on("error", (error) => {
      entry.status.lastError = error.message;
      this.appendLog(entry, `Error: ${error.message}`);
    });

    child.on("exit", (code) => {
      if (entry.child !== child) {
        return;
      }

      entry.child = null;

      if (!entry.desiredRunning) {
        return;
      }

      this.appendLog(entry, `SSH exited with code ${code}.`);

      const lastError = entry.status.lastError ?? "";

      if (FATAL_MARKERS.some((marker) => lastError.includes(marker))) {
        entry.desiredRunning = false;
        this.setState(entry, "error");
        this.appendLog(
          entry,
          "Not retrying — fix the SSH access, then start again."
        );

        return;
      }

      this.scheduleRetry(entry);
    });
  }

  private handleOutputLine(entry: Entry, line: string) {
    if (line.length === 0) {
      return;
    }

    if (line.includes("remote forward success")) {
      entry.status.retryAttempt = 0;
      entry.status.lastError = null;
      this.setState(entry, "connected");
      this.appendLog(entry, `Connected: https://${entry.tunnel.domain}`);

      return;
    }

    const isError = ERROR_MARKERS.some((marker) => line.includes(marker));

    if (isError) {
      entry.status.lastError = line.replace(/^debug\d: /, "");
    }

    if (isError || !line.startsWith("debug")) {
      this.appendLog(entry, line.replace(/^debug\d: /, ""));
    }
  }

  private scheduleRetry(entry: Entry) {
    const delay =
      this.retryDelays[
        Math.min(entry.status.retryAttempt, this.retryDelays.length - 1)
      ] ?? 0;

    entry.status.retryAttempt += 1;
    this.setState(entry, "retrying");
    this.appendLog(entry, `Retrying in ${Math.round(delay / 1000)}s…`);

    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = null;

      if (entry.desiredRunning) {
        this.launch(entry);
      }
    }, delay);
  }

  private setState(entry: Entry, state: TunnelState) {
    if (entry.status.state !== state) {
      entry.status.state = state;
      entry.status.since = new Date().toISOString();
    }
  }

  private appendRequest(entry: Entry, request: RequestLogEntry) {
    entry.status.requests.push(request);

    if (entry.status.requests.length > MAXIMUM_REQUEST_ENTRIES) {
      entry.status.requests.shift();
    }
  }

  private appendLog(entry: Entry, line: string) {
    const time = new Date().toLocaleTimeString("en-GB", { hour12: false });

    entry.status.logLines.push(`${time}  ${line}`);

    if (entry.status.logLines.length > MAXIMUM_LOG_LINES) {
      entry.status.logLines.shift();
    }
  }
}
