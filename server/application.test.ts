import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildApplication } from "./application";
import { ConfigurationStore } from "./configuration-store";
import { REQUEST_HEADER } from "./constants";
import { JobRunner } from "./job-runner";
import { TunnelManager } from "./tunnel-manager";
import { TunnelService } from "./tunnel-service";

async function application() {
  const store = new ConfigurationStore(
    join(await mkdtemp(join(tmpdir(), "tunnelbox-")), "c.json")
  );
  await store.load();

  return buildApplication(
    new TunnelService(
      store,
      new TunnelManager(),
      new JobRunner(),
      async () => {}
    )
  );
}

const settings = {
  host: "203.0.113.10",
  administratorUser: "root",
  tunnelUser: "tunnel",
  tunnelKeyPath: "~/.ssh/tunnelbox_tunnel",
  certificateEmail: "owner@example.com",
  firstRemotePort: 9080,
};

describe("request guard", () => {
  it("allows local reads", async () => {
    const response = await (
      await application()
    ).inject({
      method: "GET",
      url: "/api/tunnels",
      headers: { host: "localhost:4600" },
    });

    expect(response.statusCode).toBe(200);
  });

  it("allows the tunnelbox host alias", async () => {
    const response = await (
      await application()
    ).inject({
      method: "GET",
      url: "/api/tunnels",
      headers: { host: "tunnelbox:4600" },
    });

    expect(response.statusCode).toBe(200);
  });

  it("blocks a request whose Host is not local (DNS rebinding)", async () => {
    const response = await (
      await application()
    ).inject({
      method: "GET",
      url: "/api/tunnels",
      headers: { host: "evil.example.com" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("blocks changes without the tunnelbox header", async () => {
    const response = await (
      await application()
    ).inject({
      method: "PUT",
      url: "/api/settings",
      headers: { host: "127.0.0.1:4600" },
      payload: settings,
    });

    expect(response.statusCode).toBe(403);
  });

  it("blocks changes from another origin even with the header", async () => {
    const response = await (
      await application()
    ).inject({
      method: "PUT",
      url: "/api/settings",
      headers: {
        host: "127.0.0.1:4600",
        origin: "https://evil.example.com",
        [REQUEST_HEADER]: "1",
      },
      payload: settings,
    });

    expect(response.statusCode).toBe(403);
  });

  it("saves settings from the dashboard", async () => {
    const response = await (
      await application()
    ).inject({
      method: "PUT",
      url: "/api/settings",
      headers: {
        host: "127.0.0.1:4600",
        origin: "http://localhost:4600",
        [REQUEST_HEADER]: "1",
      },
      payload: settings,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().settings.host).toBe("203.0.113.10");
  });
});

describe("tunnels", () => {
  it("returns 400 with a message for invalid input", async () => {
    const app = await application();
    const headers = { host: "127.0.0.1:4600", [REQUEST_HEADER]: "1" };

    await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers,
      payload: settings,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/tunnels",
      headers,
      payload: { name: "API", domain: "not valid", localPort: 8080 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("Domain");
  });

  it("refuses to start a tunnel that is not set up on the VPS yet", async () => {
    const app = await application();
    const headers = { host: "127.0.0.1:4600", [REQUEST_HEADER]: "1" };

    await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers,
      payload: settings,
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/tunnels",
      headers,
      payload: {
        name: "API",
        domain: "unresolvable.invalid.example",
        localPort: 8080,
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/api/tunnels/${created.json().tunnel.id}/start`,
      headers,
    });

    expect(response.statusCode).toBe(409);
  });
});
