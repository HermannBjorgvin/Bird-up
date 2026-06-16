/**
 * Manual fixture recorder (spec 07) — run by hand, NEVER in CI/tests:
 *
 *   npx vite-node scripts/record-fixtures.ts openmeteo   # 10-site weather forecast
 *   npx vite-node scripts/record-fixtures.ts overpass    # all Icelandic campsites (OSM)
 *
 * Run under vite-node (not plain `node`): it resolves the extensionless `src` import graph the same
 * way the bundler does, so the recorder can reuse the real adapter code (query strings, normalizers)
 * as the single source of truth. Records one real upstream response into `test/fixtures/<source>/`
 * with a sibling `.meta.json`. Re-record deliberately when the upstream changes shape — a re-record
 * is a reviewed diff, not an automatic refresh. Open-Meteo carries no personal data; OSM elements do
 * (contributor phone/email/operator/address tags), so the Overpass recorder whitelists only the tags
 * the normalizer reads before writing — the fixture never ships contributor PII.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { normalizeNotable, NOTABLE_URL } from "../src/adapters/ebird";
import { buildForecastUrl } from "../src/adapters/openmeteo";
import { OVERPASS_ENDPOINT, OVERPASS_QUERY, normalizeOverpass } from "../src/adapters/osm-overpass";
import { SEED_CAMPSITES } from "../src/adapters/seed-campsites";

async function recordOpenMeteo(): Promise<void> {
  const dir = new URL("../test/fixtures/openmeteo/", import.meta.url);
  const url = buildForecastUrl(SEED_CAMPSITES);
  console.log(`GET ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
  const body = await res.json();

  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL("forecast-10-sites.json", dir), JSON.stringify(body, null, 1));
  writeFileSync(
    new URL("forecast-10-sites.meta.json", dir),
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
}

/** The only tags the normalizer reads — everything else (phone/email/operator/addr:*) is scrubbed. */
const KEEP_TAGS = [
  "tourism", "name", "name:en", "toilets", "shower", "drinking_water",
  "power_supply", "kitchen", "opening_hours", "fee", "website",
];

type OverpassEl = Record<string, unknown> & { tags?: Record<string, string> };

function scrubTags(el: OverpassEl): OverpassEl {
  if (!el.tags) return el;
  const tags: Record<string, string> = {};
  for (const k of KEEP_TAGS) if (el.tags[k] !== undefined) tags[k] = el.tags[k];
  return { ...el, tags };
}

async function recordOverpass(): Promise<void> {
  const dir = new URL("../test/fixtures/overpass/", import.meta.url);
  console.log(`POST ${OVERPASS_ENDPOINT}`);
  const res = await fetch(OVERPASS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "tjaldur/0.1 (hermann3646@gmail.com)" },
    body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
  });
  if (!res.ok) throw new Error(`Overpass responded ${res.status}`);
  const raw = (await res.json()) as { elements: OverpassEl[] };
  const body = { ...raw, elements: raw.elements.map(scrubTags) }; // drop contributor PII before it ever lands
  const normalized = normalizeOverpass(body);

  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL("campsites-iceland.json", dir), JSON.stringify(body, null, 1));
  writeFileSync(
    new URL("campsites-iceland.meta.json", dir),
    JSON.stringify(
      {
        recordedAt: new Date().toISOString().slice(0, 10),
        request: { endpoint: OVERPASS_ENDPOINT, query: OVERPASS_QUERY },
        counts: { elements: body.elements.length, normalizedCampsites: normalized.length },
        notes: "all tourism=camp_site in Iceland, out center (spec 04 query)",
      },
      null,
      2,
    ),
  );
  console.log(
    `wrote test/fixtures/overpass/campsites-iceland.json (+ .meta.json): ` +
      `${body.elements.length} elements → ${normalized.length} campsites`,
  );
}

/** The obs fields the normalizer reads — everything else (subId, obsValid, locId, …) is scrubbed. */
const EBIRD_KEEP = ["speciesCode", "comName", "sciName", "obsDt", "locName", "lat", "lng", "howMany"];

function scrubObs(o: Record<string, unknown>): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const k of EBIRD_KEEP) if (o[k] !== undefined) kept[k] = o[k];
  return kept;
}

async function recordEbird(): Promise<void> {
  const key = process.env.EBIRD_API_KEY;
  if (!key) throw new Error("EBIRD_API_KEY env var required (e.g. EBIRD_API_KEY=$(grep ^EBIRD_API_KEY= .dev.vars | cut -d= -f2-) npx vite-node scripts/record-fixtures.ts ebird)");
  const dir = new URL("../test/fixtures/ebird/", import.meta.url);
  console.log(`GET ${NOTABLE_URL}`);
  const res = await fetch(NOTABLE_URL, { headers: { "X-eBirdApiToken": key } });
  if (!res.ok) throw new Error(`eBird responded ${res.status}`);
  const raw = (await res.json()) as Array<Record<string, unknown>>;
  const body = raw.map(scrubObs); // whitelist to the normalizer's reads — no subId/validity metadata lands
  const normalized = normalizeNotable(body);

  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL("notable-iceland.json", dir), JSON.stringify(body, null, 1));
  writeFileSync(
    new URL("notable-iceland.meta.json", dir),
    JSON.stringify(
      {
        recordedAt: new Date().toISOString().slice(0, 10),
        request: { url: NOTABLE_URL },
        counts: { records: body.length, normalized: normalized.length },
        notes: "Iceland-wide notable (rare) sightings; fields whitelisted to the normalizer's reads (PII-free)",
      },
      null,
      2,
    ),
  );
  console.log(`wrote test/fixtures/ebird/notable-iceland.json (+ .meta.json): ${body.length} records`);
}

const target = process.argv[2] ?? "openmeteo";
if (target === "openmeteo") await recordOpenMeteo();
else if (target === "overpass") await recordOverpass();
else if (target === "ebird") await recordEbird();
else throw new Error(`unknown fixture target: ${target} (expected: openmeteo | overpass | ebird)`);
