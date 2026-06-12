import { Hono } from "hono";
import { restRoutes } from "./delivery/rest";
import { dispatchCron } from "./jobs/dispatch";

const app = new Hono<{ Bindings: Env }>();

app.route("/api", restRoutes);
app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  scheduled: (ctrl, env, ctx) => dispatchCron(ctrl.cron, env, ctx),
} satisfies ExportedHandler<Env>;
