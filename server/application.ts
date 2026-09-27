import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";

import { REQUEST_HEADER } from "./constants";
import {
  ConflictError,
  NotFoundError,
  type TunnelService,
} from "./tunnel-service";
import {
  ValidationError,
  validateServerSettings,
  validateTunnelRequest,
} from "./validation";

const LOCAL_HOSTNAMES = new Set([
  "127.0.0.1",
  "localhost",
  "[::1]",
  "tunnelbox",
  "tunnelbox.localhost",
]);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function hostnameOf(value: string): string {
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname;
  } catch {
    return "";
  }
}

export function isAllowedRequest(request: FastifyRequest): boolean {
  if (!LOCAL_HOSTNAMES.has(hostnameOf(request.headers.host ?? ""))) {
    return false;
  }

  const origin = request.headers.origin;

  if (origin && !LOCAL_HOSTNAMES.has(hostnameOf(origin))) {
    return false;
  }

  return (
    SAFE_METHODS.has(request.method) || request.headers[REQUEST_HEADER] === "1"
  );
}

type IdentifierParameters = { Params: { id: string } };

export function buildApplication(service: TunnelService): FastifyInstance {
  const application = Fastify({ logger: false });

  application.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/api/") && !isAllowedRequest(request)) {
      await reply.code(403).send({ message: "Request blocked." });
    }
  });

  application.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof ValidationError) {
      return reply.code(400).send({ message: error.message });
    }

    if (error instanceof NotFoundError) {
      return reply.code(404).send({ message: error.message });
    }

    if (error instanceof ConflictError) {
      return reply.code(409).send({ message: error.message });
    }

    const statusCode = (error as { statusCode?: number }).statusCode;

    if (statusCode && statusCode < 500) {
      return reply.code(statusCode).send({ message: (error as Error).message });
    }

    console.error(error);

    return reply
      .code(500)
      .send({ message: "Something went wrong. Check the server log." });
  });

  application.get("/api/settings", async () => ({
    settings: service.settings(),
  }));

  application.put("/api/settings", async (request) => ({
    settings: await service.saveSettings(validateServerSettings(request.body)),
  }));

  application.post("/api/server/prepare", async (_request, reply) =>
    reply.code(202).send(service.prepareServer())
  );

  application.get("/api/tunnels", async () => service.listTunnels());

  application.post("/api/tunnels", async (request, reply) =>
    reply
      .code(201)
      .send(await service.createTunnel(validateTunnelRequest(request.body)))
  );

  application.put<IdentifierParameters>("/api/tunnels/:id", async (request) =>
    service.updateTunnel(request.params.id, validateTunnelRequest(request.body))
  );

  application.delete<IdentifierParameters>(
    "/api/tunnels/:id",
    async (request, reply) => {
      const job = await service.deleteTunnel(request.params.id);

      return job
        ? reply.code(202).send({ job })
        : reply.code(200).send({ job: null });
    }
  );

  application.post<IdentifierParameters>(
    "/api/tunnels/:id/provision",
    async (request, reply) =>
      reply.code(202).send(service.provisionTunnel(request.params.id))
  );

  application.post<IdentifierParameters>(
    "/api/tunnels/:id/start",
    async (request, reply) => {
      service.startTunnel(request.params.id);

      return reply.code(204).send();
    }
  );

  application.post<IdentifierParameters>(
    "/api/tunnels/:id/stop",
    async (request, reply) => {
      service.stopTunnel(request.params.id);

      return reply.code(204).send();
    }
  );

  application.get<IdentifierParameters>("/api/jobs/:id", async (request) =>
    service.job(request.params.id)
  );

  return application;
}
