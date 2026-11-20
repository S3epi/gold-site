import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { isPeriod, INSTRUMENT_BY_ID } from "@mesghalyar/shared";
import { config } from "./config.js";
import type { Engine } from "./engine.js";

const historyQuery = z.object({
  instrument: z.string().min(1).max(40),
  period: z.string().refine(isPeriod, { message: "invalid period" })
});

const settingsBody = z
  .object({
    domesticIntervalMs: z.number().int().min(15_000).max(3_600_000).optional(),
    internationalIntervalMs: z.number().int().min(15_000).max(3_600_000).optional(),
    staleAfterMs: z.number().int().min(60_000).max(86_400_000).optional(),
    liveWithinMs: z.number().int().min(30_000).max(3_600_000).optional(),
    disputePct: z.number().min(0.1).max(50).optional()
  })
  .strict();

function webDistPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../web/dist");
}

export async function registerApi(app: FastifyInstance, engine: Engine): Promise<void> {
  await app.register(rateLimit, {
    max: 600,
    timeWindow: "1 minute",
    allowList: []
  });

  if (config.corsOrigins.length > 0) {
    await app.register(cors, { origin: config.corsOrigins });
  }

  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'"
    );
  });

  const pricesHandler = (category?: string) => async () => {
    const payload = engine.prices();
    if (!category) return payload;
    const items = payload.items.filter((i) => i.category === category);
    return {
      ...payload,
      items,
      ounce: items.find((i) => i.id === "xau") ?? null,
      usd: payload.usd
    };
  };

  app.get("/api/health", async () => ({
    ok: true,
    now: Date.now(),
    uptimeSec: Math.round(process.uptime())
  }));

  app.get("/api/v1/prices", pricesHandler());
  app.get("/api/v1/gold", pricesHandler("gold"));
  app.get("/api/v1/coins", pricesHandler("coin"));
  app.get("/api/v1/currencies", pricesHandler("currency"));
  app.get("/api/v1/ounce", pricesHandler("ounce"));
  app.get("/api/v1/calculations", async () => engine.prices().calculations);
  app.get("/api/v1/status", async () => engine.status());
  app.get("/api/v1/providers", async () => ({ providers: engine.providersView() }));

  app.get(
    "/api/v1/history",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = historyQuery.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: "invalid query", details: parsed.error.issues });
      }
      const { instrument, period } = parsed.data;
      if (!INSTRUMENT_BY_ID.has(instrument)) {
        return reply.code(404).send({ ok: false, error: "unknown instrument" });
      }
      const payload = engine.history(instrument, period as Parameters<Engine["history"]>[1]);
      if (!payload) return reply.code(404).send({ ok: false, error: "unknown instrument" });
      return payload;
    }
  );

  const adminGuard = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = request.headers["x-admin-token"];
    if (!config.adminToken || token !== config.adminToken) {
      await reply.code(403).send({ ok: false, error: "forbidden" });
    }
  };

  app.get("/api/v1/admin/settings", { preHandler: adminGuard }, async () => engine.settings());

  app.patch("/api/v1/admin/settings", { preHandler: adminGuard }, async (request, reply) => {
    const parsed = settingsBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "invalid body", details: parsed.error.issues });
    }
    if (Object.keys(parsed.data).length === 0) {
      return reply.code(400).send({ ok: false, error: "empty patch" });
    }
    try {
      return engine.updateSettings(parsed.data);
    } catch (err) {
      return reply.code(400).send({ ok: false, error: String((err as Error).message) });
    }
  });

  const dist = webDistPath();
  if (fs.existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist, prefix: "/", wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api")) {
        return reply.code(404).send({ ok: false, error: "not found" });
      }
      return reply.sendFile("index.html");
    });
  }
}
