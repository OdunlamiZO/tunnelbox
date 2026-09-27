import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
  request as httpRequest,
} from "node:http";
import { type AddressInfo, type Socket, connect } from "node:net";

import type { RequestLogEntry } from "./types";

type LogRequest = (entry: RequestLogEntry) => void;

function clientAddress(request: IncomingMessage): string | null {
  const forwarded =
    request.headers["x-real-ip"] ?? request.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;

  return value?.split(",")[0]?.trim() || null;
}

export class RequestProxy {
  private server: Server | null = null;

  constructor(
    private readonly targetPort: number,
    private readonly logRequest: LogRequest
  ) {}

  async start(): Promise<number> {
    const server = createServer((request, response) =>
      this.forward(request, response)
    );

    // Streaming responses (server-sent events) stay open indefinitely.
    server.requestTimeout = 0;
    server.on("upgrade", (request, socket, head) =>
      this.forwardUpgrade(request, socket as Socket, head)
    );

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    this.server = server;

    return (server.address() as AddressInfo).port;
  }

  close() {
    this.server?.closeAllConnections();
    this.server?.close();
    this.server = null;
  }

  private requestLogger(request: IncomingMessage) {
    const startedAt = Date.now();

    return (status: number | null, error: string | null) =>
      this.logRequest({
        time: new Date(startedAt).toISOString(),
        method: request.method ?? "GET",
        path: request.url ?? "/",
        status,
        durationMilliseconds: Date.now() - startedAt,
        clientAddress: clientAddress(request),
        error,
      });
  }

  private forward(request: IncomingMessage, response: ServerResponse) {
    const targetPort = this.targetPort;
    const log = this.requestLogger(request);

    const upstream = httpRequest(
      {
        host: "localhost",
        port: targetPort,
        method: request.method,
        path: request.url,
        headers: request.headers,
      },
      (upstreamResponse) => {
        log(upstreamResponse.statusCode ?? null, null);
        response.writeHead(
          upstreamResponse.statusCode ?? 502,
          upstreamResponse.headers
        );
        upstreamResponse.pipe(response);
      }
    );

    upstream.on("error", (error) => {
      const unreachable =
        (error as NodeJS.ErrnoException).code === "ECONNREFUSED";
      const message = unreachable
        ? `nothing is listening on localhost:${targetPort}`
        : error.message;

      log(502, message);

      if (!response.headersSent) {
        response.writeHead(502, {
          "Content-Type": "text/plain; charset=utf-8",
        });
      }

      response.end(`tunnelbox: ${message}\n`);
    });

    request.pipe(upstream);
  }

  private forwardUpgrade(
    request: IncomingMessage,
    socket: Socket,
    head: Buffer
  ) {
    const targetPort = this.targetPort;
    const log = this.requestLogger(request);

    const upstream = connect({ host: "localhost", port: targetPort }, () => {
      const headerLines: string[] = [];

      for (let index = 0; index < request.rawHeaders.length; index += 2) {
        headerLines.push(
          `${request.rawHeaders[index]}: ${request.rawHeaders[index + 1]}`
        );
      }

      upstream.write(
        `${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headerLines.join("\r\n")}\r\n\r\n`
      );
      upstream.write(head);
      log(101, null);
      socket.pipe(upstream).pipe(socket);
    });

    upstream.on("error", (error) => {
      log(502, error.message);
      socket.destroy();
    });
    socket.on("error", () => upstream.destroy());
  }
}
