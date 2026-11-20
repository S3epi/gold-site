import Fastify from "fastify";
import { config } from "./config.js";
import { Storage } from "./db.js";
import { Engine } from "./engine.js";
import { registerApi } from "./api.js";

const app = Fastify({
  logger: { level: config.logLevel },
  trustProxy: true
});

const storage = new Storage(config.dataDir);
const engine = new Engine(storage, {
  info: (msg) => app.log.info(msg),
  warn: (msg) => app.log.warn(msg),
  error: (msg) => app.log.error(msg)
});

await registerApi(app, engine);

engine.start();

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`MesghalYar API listening on http://localhost:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

const shutdown = async (signal: string): Promise<void> => {
  app.log.info(`shutting down (${signal})`);
  engine.stop();
  try {
    await app.close();
  } finally {
    storage.close();
    process.exit(0);
  }
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
