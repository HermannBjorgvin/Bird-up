import { Hono } from "hono";
import { restRoutes } from "./delivery/rest";

const app = new Hono<{ Bindings: Env }>();

app.route("/api", restRoutes);
app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;

// Workflow classes (scheduled via their bindings in wrangler.jsonc)
export { RefreshWeather } from "./workflows/refresh-weather";
export { RefreshCampsites } from "./workflows/refresh-campsites";
