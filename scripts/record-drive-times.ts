/**
 * Manual drive-time recorder (spec 04) — run by hand, NEVER in CI/tests:
 *
 *   npx vite-node scripts/record-drive-times.ts
 *
 * Drive times from Reykjavík don't change week-to-week, so we precompute them once with OSRM road
 * routing and bake the result into data/drive-times.json (id → minutes), which the weekly
 * refresh-campsites workflow merges onto the live OSM list. No routing service is called at runtime.
 *
 * Re-run when the campsite list changes materially (new sites get no drive time until then — the web
 * treats a missing time as "unknown"). The OSM road graph routes around the un-crossable interior, so
 * this is an honest ring-road time — far better than straight-line distance for Iceland. The standard
 * OSRM car profile may route highland F-roads; those sites are flagged `offroad` separately and the
 * website's family-car filter excludes them, so an optimistic 4x4 time there is harmless.
 *
 * Origin: the Reykjavík city campsite — where almost every camper actually starts. Future multi-origin
 * support (estimate from the user's location) is just more baked columns; the MVP is Reykjavík-only.
 */
import { writeFileSync } from "node:fs";
import type { DriveTimes } from "../src/core/drive-times";

const CAMPSITES_URL = process.env.CAMPSITES_URL ?? "https://tjaldur.9z.is/api/campsites";
const OSRM = process.env.OSRM_ENDPOINT ?? "https://router.project-osrm.org";
const REYKJAVIK: [number, number] = [-21.8731, 64.1466]; // [lng, lat] — Reykjavík city campsite
const BATCH = 90; // stay well under the OSRM public demo's per-request coordinate cap

type Site = { id: string; lat: number; lng: number };

/** OSRM table, one source (Reykjavík) → many destinations; returns durations in seconds. */
async function tableDurations(dests: Site[]): Promise<number[]> {
  const coords = [REYKJAVIK, ...dests.map((d) => [d.lng, d.lat] as [number, number])]
    .map(([lng, lat]) => `${lng},${lat}`)
    .join(";");
  const url = `${OSRM}/table/v1/driving/${coords}?sources=0&annotations=duration`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM responded ${res.status} for a ${dests.length}-dest batch`);
  const body = (await res.json()) as { code: string; durations: (number | null)[][] };
  if (body.code !== "Ok") throw new Error(`OSRM code ${body.code}`);
  return body.durations[0]!.slice(1); // drop the source→source 0
}

const res = await fetch(CAMPSITES_URL);
if (!res.ok) throw new Error(`campsites API responded ${res.status}`);
const sites = ((await res.json()) as { sites: Site[] }).sites;
console.log(`GET ${CAMPSITES_URL} → ${sites.length} sites; routing from Reykjavík via ${OSRM}`);

const out: DriveTimes = {};
let unreachable = 0;
for (let i = 0; i < sites.length; i += BATCH) {
  const batch = sites.slice(i, i + BATCH);
  const seconds = await tableDurations(batch);
  for (let j = 0; j < batch.length; j++) {
    const s = seconds[j];
    if (s === null || s === undefined) {
      unreachable++; // OSRM couldn't route (islet, disconnected node) — leave it absent
      continue;
    }
    out[batch[j]!.id] = Math.round(s / 60);
  }
  console.log(`  routed ${Math.min(i + BATCH, sites.length)}/${sites.length}`);
}

// Stable, sorted-by-id output keeps the committed diff readable across re-records.
const sorted: DriveTimes = {};
for (const id of Object.keys(out).sort()) sorted[id] = out[id]!;

const path = new URL("../data/drive-times.json", import.meta.url);
writeFileSync(path, JSON.stringify(sorted, null, 2) + "\n");
console.log(`wrote data/drive-times.json: ${Object.keys(sorted).length} sites (${unreachable} unreachable, left unknown)`);
