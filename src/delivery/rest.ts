import { Hono } from "hono";

export const restRoutes = new Hono<{ Bindings: Env }>();

restRoutes.get("/health", (c) => c.json({ ok: true }));
