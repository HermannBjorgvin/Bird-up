/**
 * Manual fixture recorder (spec 07) — run by hand, NEVER in CI/tests:
 *
 *   node scripts/record-fixtures.ts
 *
 * Records one real multi-point Open-Meteo response for the 10 seed campsites into
 * `test/fixtures/openmeteo/` with a sibling `.meta.json`. Re-record deliberately when the
 * upstream changes shape — a re-record is a reviewed diff, not an automatic refresh.
 * Nothing to scrub from Open-Meteo (no personal data).
 */
import { mkdirSync, writeFileSync } from "node:fs";
// .ts extensions: the script runs under plain `node` (native type-stripping), outside the bundler
import { buildForecastUrl } from "../src/adapters/openmeteo.ts";
import { SEED_CAMPSITES } from "../src/adapters/seed-campsites.ts";

const DIR = new URL("../test/fixtures/openmeteo/", import.meta.url);

const url = buildForecastUrl(SEED_CAMPSITES);
console.log(`GET ${url}`);
const res = await fetch(url);
if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
const body = await res.json();

mkdirSync(DIR, { recursive: true });
writeFileSync(new URL("forecast-10-sites.json", DIR), JSON.stringify(body, null, 1));
writeFileSync(
  new URL("forecast-10-sites.meta.json", DIR),
  JSON.stringify(
    {
      recordedAt: new Date().toISOString().slice(0, 10),
      request: { url, params: { sites: SEED_CAMPSITES.map((s) => s.id) } },
      notes: "10-site batch, daily + hourly cloud_cover, 16 days (spec 04 call shape)",
    },
    null,
    2,
  ),
);
console.log("wrote test/fixtures/openmeteo/forecast-10-sites.json (+ .meta.json)");
