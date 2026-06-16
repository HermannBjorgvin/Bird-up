// Secrets come from `.dev.vars` locally / `wrangler secret put` in prod (hard rule 9), and `wrangler
// types` doesn't pick them up — so they're declared here by merging into the generated global `Env`.

interface Env {
  /** eBird API token for the `X-eBirdApiToken` header (spec 04). Free key from ebird.org/api/keygen. */
  readonly EBIRD_API_KEY?: string;
}
