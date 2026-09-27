import { type Server, createServer, request as httpRequest } from "node:http";
import { type AddressInfo, connect } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { RequestProxy } from "./request-proxy";
import type { RequestLogEntry } from "./types";

let target: Server | null = null;
let proxy: RequestProxy | null = null;

afterEach(() => {
  proxy?.close();
  target?.close();
  proxy = null;
  target = null;
});

async function startTarget(): Promise<number> {
  target = createServer((request, response) => {
    if (request.url === "/stream") {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write("data: first\n\n");

      return;
    }

    response.writeHead(201, {
      "Content-Type": "text/plain",
      "Set-Cookie": ["session=abc; Path=/", "theme=dark; Path=/"],
    });
    response.end(
      `${request.method} ${request.url} host=${request.headers.host}`
    );
  });

  target.on("upgrade", (_request, socket) => {
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n"
    );
    socket.on("data", (data) => socket.write(data));
  });

  await new Promise<void>((resolve) => target?.listen(0, "127.0.0.1", resolve));

  return (target.address() as AddressInfo).port;
}

async function startProxy(targetPort: number, entries: RequestLogEntry[]) {
  proxy = new RequestProxy(targetPort, (entry) => entries.push(entry));

  return proxy.start();
}

describe("RequestProxy", () => {
  it("forwards the request unchanged, including Host, and logs it", async () => {
    const entries: RequestLogEntry[] = [];
    const proxyPort = await startProxy(await startTarget(), entries);

    const response = await new Promise<{
      status: number;
      body: string;
      cookies: string[];
    }>((resolve, reject) => {
      const request = httpRequest(
        {
          host: "127.0.0.1",
          port: proxyPort,
          method: "POST",
          path: "/inbox?id=1",
          headers: { Host: "app.example.org", "X-Real-IP": "198.51.100.7" },
        },
        (incoming) => {
          let body = "";

          incoming.on("data", (chunk) => (body += chunk));
          incoming.on("end", () =>
            resolve({
              status: incoming.statusCode ?? 0,
              body,
              cookies: incoming.headers["set-cookie"] ?? [],
            })
          );
        }
      );

      request.on("error", reject);
      request.end("hello");
    });

    expect(response.status).toBe(201);
    expect(response.body).toBe("POST /inbox?id=1 host=app.example.org");
    expect(response.cookies).toEqual([
      "session=abc; Path=/",
      "theme=dark; Path=/",
    ]);
    expect(entries).toEqual([
      expect.objectContaining({
        method: "POST",
        path: "/inbox?id=1",
        status: 201,
        clientAddress: "198.51.100.7",
        error: null,
      }),
    ]);
  });

  it("answers 502 and logs why when nothing listens on the local port", async () => {
    const entries: RequestLogEntry[] = [];
    const unusedPort = await startTarget();
    target?.close();
    target = null;
    const proxyPort = await startProxy(unusedPort, entries);

    const response = await fetch(`http://127.0.0.1:${proxyPort}/`);

    expect(response.status).toBe(502);
    expect(entries[0]).toMatchObject({
      status: 502,
      error: `nothing is listening on localhost:${unusedPort}`,
    });
  });

  it("streams responses without waiting for them to finish", async () => {
    const entries: RequestLogEntry[] = [];
    const proxyPort = await startProxy(await startTarget(), entries);
    const controller = new AbortController();

    const response = await fetch(`http://127.0.0.1:${proxyPort}/stream`, {
      signal: controller.signal,
    });
    const reader = response.body!.getReader();
    const { value } = await reader.read();

    expect(new TextDecoder().decode(value)).toBe("data: first\n\n");
    expect(entries[0]).toMatchObject({ path: "/stream", status: 200 });

    controller.abort();
  });

  it("passes WebSocket upgrades through in both directions", async () => {
    const entries: RequestLogEntry[] = [];
    const proxyPort = await startProxy(await startTarget(), entries);
    const socket = connect(proxyPort, "127.0.0.1");
    const received: string[] = [];

    socket.on("data", (data) => received.push(data.toString()));
    socket.write(
      "GET /_next/webpack-hmr HTTP/1.1\r\nHost: app.example.org\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n"
    );

    await expect
      .poll(() => received.join(""))
      .toContain("101 Switching Protocols");

    socket.write("ping");

    await expect.poll(() => received.join("")).toContain("ping");
    expect(entries[0]).toMatchObject({
      path: "/_next/webpack-hmr",
      status: 101,
    });

    socket.destroy();
  });
});
