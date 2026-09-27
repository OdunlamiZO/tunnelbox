import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildApplication } from "./application";
import {
  ConfigurationStore,
  defaultConfigurationPath,
} from "./configuration-store";
import { DASHBOARD_HOST, DASHBOARD_PORT } from "./constants";
import { JobRunner } from "./job-runner";
import { runRemoteCommand } from "./remote-runner";
import { TunnelManager } from "./tunnel-manager";
import { TunnelService } from "./tunnel-service";

const webDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "web"
);

const store = new ConfigurationStore(defaultConfigurationPath());
await store.load();

const service = new TunnelService(
  store,
  new TunnelManager(),
  new JobRunner(),
  runRemoteCommand
);
const application = buildApplication(service);

if (existsSync(webDirectory)) {
  await application.register(fastifyStatic, { root: webDirectory });

  application.setNotFoundHandler((request, reply) =>
    request.url.startsWith("/api/")
      ? reply.code(404).send({ message: "Not found." })
      : reply.sendFile("index.html")
  );
}

const shutdown = async () => {
  service.stopAll();
  await application.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await application.listen({ host: DASHBOARD_HOST, port: DASHBOARD_PORT });

console.log(`tunnelbox is running at http://localhost:${DASHBOARD_PORT}`);
console.log(`Configuration: ${defaultConfigurationPath()}`);
