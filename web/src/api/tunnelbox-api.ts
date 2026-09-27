import type {
  Job,
  RequestLogEntry,
  SaveTunnelRequest,
  ServerSettings,
  TunnelDefinition,
  TunnelView,
} from "../../../server/types";

export type {
  Job,
  RequestLogEntry,
  SaveTunnelRequest,
  ServerSettings,
  TunnelDefinition,
  TunnelView,
};

export type SaveTunnelResponse = {
  tunnel: TunnelDefinition;
  job: Job | null;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export class TunnelboxApiClient {
  listTunnels() {
    return this.request<TunnelView[]>("/api/tunnels");
  }

  createTunnel(request: SaveTunnelRequest) {
    return this.request<SaveTunnelResponse>("/api/tunnels", {
      method: "POST",
      body: request,
    });
  }

  updateTunnel(id: string, request: SaveTunnelRequest) {
    return this.request<SaveTunnelResponse>(
      `/api/tunnels/${encodeURIComponent(id)}`,
      { method: "PUT", body: request }
    );
  }

  deleteTunnel(id: string) {
    return this.request<{ job: Job | null }>(
      `/api/tunnels/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
  }

  provisionTunnel(id: string) {
    return this.request<Job>(
      `/api/tunnels/${encodeURIComponent(id)}/provision`,
      { method: "POST" }
    );
  }

  startTunnel(id: string) {
    return this.request<void>(`/api/tunnels/${encodeURIComponent(id)}/start`, {
      method: "POST",
    });
  }

  stopTunnel(id: string) {
    return this.request<void>(`/api/tunnels/${encodeURIComponent(id)}/stop`, {
      method: "POST",
    });
  }

  getJob(id: string) {
    return this.request<Job>(`/api/jobs/${encodeURIComponent(id)}`);
  }

  getSettings() {
    return this.request<{ settings: ServerSettings | null }>("/api/settings");
  }

  saveSettings(settings: ServerSettings) {
    return this.request<{ settings: ServerSettings }>("/api/settings", {
      method: "PUT",
      body: settings,
    });
  }

  prepareServer() {
    return this.request<Job>("/api/server/prepare", { method: "POST" });
  }

  private async request<T>(
    path: string,
    { method = "GET", body }: RequestOptions = {}
  ): Promise<T> {
    const headers: Record<string, string> = {};

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (method !== "GET") {
      headers["x-tunnelbox-request"] = "1";
    }

    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      throw new ApiError(
        payload?.message ?? `Request failed (${response.status}).`,
        response.status
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

export const tunnelboxApi = new TunnelboxApiClient();
