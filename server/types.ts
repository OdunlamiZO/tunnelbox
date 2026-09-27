export type ServerSettings = {
  host: string;
  administratorUser: string;
  tunnelUser: string;
  tunnelKeyPath: string;
  certificateEmail: string;
  firstRemotePort: number;
};

export type TunnelDefinition = {
  id: string;
  name: string;
  domain: string;
  localPort: number;
  remotePort: number;
  nginxSiteName: string;
  provisioned: boolean;
};

export type Configuration = {
  server: ServerSettings | null;
  tunnels: TunnelDefinition[];
};

export type TunnelState =
  "stopped" | "connecting" | "connected" | "retrying" | "error";

export type RequestLogEntry = {
  time: string;
  method: string;
  path: string;
  status: number | null;
  durationMilliseconds: number;
  clientAddress: string | null;
  error: string | null;
};

export type TunnelStatus = {
  state: TunnelState;
  since: string;
  lastError: string | null;
  retryAttempt: number;
  logLines: string[];
  requests: RequestLogEntry[];
};

export type TunnelView = TunnelDefinition & {
  status: TunnelStatus;
};

export type JobKind =
  "provision" | "deprovision" | "change-domain" | "prepare-server";

export type JobState = "running" | "succeeded" | "failed";

export type Job = {
  id: string;
  kind: JobKind;
  tunnelId: string | null;
  state: JobState;
  logLines: string[];
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type SaveTunnelRequest = {
  name: string;
  domain: string;
  localPort: number;
};
