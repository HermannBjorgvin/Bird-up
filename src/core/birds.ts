import type { Region, Window, WindowBird } from "./types";

/**
 * Pure birding logic (spec 04) — no I/O, no clock. The eBird adapter supplies the taxonomy and the
 * normalized observations; this module resolves the user's seen-list to species codes, then attaches
 * the unseen/notable birds to each weather window by campsite proximity. Weather-only behavior is
 * untouched: callers that don't pass a seen-list or observations simply never call these.
 */

/** A taxonomy entry — the name→code bridge from eBird `/ref/taxonomy` (spec 04). */
export interface Taxon {
  speciesCode: string;
  comName: string;
  sciName: string;
}

/** A normalized eBird observation (adapter output). `notable` is set from the rarities endpoint. */
export interface Observation {
  speciesCode: string;
  comName: string;
  sciName: string;
  lastSeen: string; // YYYY-MM-DD (the date of eBird's obsDt)
  locName: string;
  lat: number;
  lng: number;
  howMany: number | "X"; // eBird reports "X" for present-but-uncounted
  notable: boolean;
}

/** An obs attaches to a window if within this of any of its campsites — a data heuristic, not policy. */
export const PROXIMITY_KM = 25;

export interface SeenMatch {
  seenCodes: Set<string>;
  warnings: string[];
}

/** Diacritic-fold + lowercase + trim, so "Brunnich's" matches "Brünnich's" and case never matters. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Resolve user-supplied `seen_species` to eBird species codes (spec 04 pipeline): each entry tries, in
 * order, exact species code → scientific name → common name — all case-insensitive and diacritic-folded.
 * Unmatched entries become `warnings` (never errors); each entry resolves independently of the others.
 */
export function resolveSeenSpecies(seen: string[], taxonomy: Taxon[]): SeenMatch {
  const byCode = new Map<string, string>();
  const bySci = new Map<string, string>();
  const byCom = new Map<string, string>();
  for (const t of taxonomy) {
    byCode.set(fold(t.speciesCode), t.speciesCode);
    bySci.set(fold(t.sciName), t.speciesCode);
    byCom.set(fold(t.comName), t.speciesCode);
  }

  const seenCodes = new Set<string>();
  const warnings: string[] = [];
  for (const raw of seen) {
    const key = fold(raw);
    if (key === "") continue;
    const code = byCode.get(key) ?? bySci.get(key) ?? byCom.get(key);
    if (code !== undefined) seenCodes.add(code);
    else warnings.push(`unrecognized species: "${raw.trim()}"`);
  }
  return { seenCodes, warnings };
}

/** Great-circle distance in km (haversine) — the obs↔campsite proximity test. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Attach observed birds to each window (spec 04): observations from the window's region within
 * `PROXIMITY_KM` of any of the window's campsites, deduped by species (most-recent sighting kept),
 * each flagged `unseenThisYear` (= its code is not in `seenCodes`) and `notable` (independent of
 * seen-ness), sorted unseen-first, then notable, then most-recent. A window that gains no birds is
 * returned unchanged (no empty `birds: []`), so weather-only windows are byte-identical.
 */
export function attachBirds(
  windows: Window[],
  obsByRegion: Map<Region, Observation[]>,
  seenCodes: Set<string>,
): Window[] {
  return windows.map((w) => {
    const regionObs = obsByRegion.get(w.region) ?? [];
    const near = regionObs.filter((o) => w.campsites.some((c) => distanceKm(o, c) <= PROXIMITY_KM));
    if (near.length === 0) return w;

    const bySpecies = new Map<string, Observation>();
    for (const o of near) {
      const prev = bySpecies.get(o.speciesCode);
      if (prev === undefined || o.lastSeen > prev.lastSeen) bySpecies.set(o.speciesCode, o);
    }

    const birds: WindowBird[] = [...bySpecies.values()]
      .map((o) => ({
        speciesCode: o.speciesCode,
        comName: o.comName,
        sciName: o.sciName,
        lastSeen: o.lastSeen,
        locName: o.locName,
        lat: o.lat,
        lng: o.lng,
        howMany: o.howMany,
        unseenThisYear: !seenCodes.has(o.speciesCode),
        notable: o.notable,
      }))
      .sort(byUnseenThenNotableThenRecent);

    return { ...w, birds };
  });
}

/** Unseen species rank highest (the whole point), then notable rarities, then most-recently seen. */
function byUnseenThenNotableThenRecent(a: WindowBird, b: WindowBird): number {
  if (a.unseenThisYear !== b.unseenThisYear) return a.unseenThisYear ? -1 : 1;
  if (a.notable !== b.notable) return a.notable ? -1 : 1;
  return a.lastSeen < b.lastSeen ? 1 : a.lastSeen > b.lastSeen ? -1 : 0;
}
