# 00 — Product

Status: accepted · Last updated: 2026-06-12

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Audience & scale | Hobbyists; ~100–200 searches/day | Sized for friends-and-birders, not a startup |
| Frontends | Public authless MCP server + website, over one shared core | Agents and humans get the same answers |
| Accounts | None | localStorage + per-call MCP arguments cover the only personal data (seen-bird list) |
| Alerts | Not in v1; REST API stays externally pollable | Owner runs his own cron; door stays open |
| Language | English only | Bird names from eBird are English/Latin anyway |
| Commercial | Never (v1) | Keeps eBird API terms satisfied |

## The problem

Camping in Iceland is gated on weather that is only honestly predictable a few days out, and checking forecasts daily across the whole country is a chore. Birders additionally want to know *where* to camp: a campsite next to reported species they haven't seen this year beats an equally sunny one without them.

## The core loop

1. **Find weather windows.** Scan the 16-day forecast for every known campsite and find runs of days worth camping in — warm *relative to the surrounding two weeks*, with a hard floor on peak temperature, penalized by rain and wind gusts. (Definition: [02-scoring-policy.md](02-scoring-policy.md) — explicitly designed to be tweaked.)
2. **Recommend campsites** inside each window, with facilities and a booking link.
3. **Optionally overlay birds.** Recent eBird observations near those campsites, diffed against the user's seen-this-year list so unseen species rank highest.

Step 3 is **fully optional**: weather + campsites is the default mode, and birds are only computed when asked (`include_birds`).

## Surfaces

- **MCP** (`/mcp`): two tools — get windows for a specific date range, or list the next window candidates over the coming 1–2 weeks. JSON response (windows → campsites → birds) plus a `mapUrl` linking to a rendered weather map of Iceland. See [03-api.md](03-api.md).
- **Website** (`/`): interactive map of Iceland showing windows, score-colored campsites, and the bird layer. See [05-website.md](05-website.md).
- **REST** (`/api/*`): the website's backend, public and CORS-open, mirroring the MCP tools — this is the future-alerts door.

## Seen-bird list (no accounts, by design)

eBird has no API for personal lists, so the user supplies theirs:

- **Website**: paste species names or upload the eBird `MyEBirdData.csv` export. Parsed **entirely client-side**; only the resulting species list is sent with API calls; persisted in browser localStorage.
- **MCP**: the client passes `seen_species` as a tool argument on every call (agents keep it in their own context/config).

**Privacy:** seen lists are never persisted server-side, the raw CSV never leaves the browser, and v1 has no analytics.

## Non-goals for v1

- Alerts/notifications (external cron can poll `/api/next-windows` instead)
- User accounts or server-side personal data
- Booking integration (deep links to tjalda.is only)
- Icelandic localization
- Inline PNG images in MCP responses (image-via-URL instead; see [01-architecture.md](01-architecture.md))
- Anything beyond Iceland

## Design principle: do not over-engineer

This constraint has teeth and recurs in every spec: prefer one KV blob over a database, two MCP tools over five, a fixed nearest-anchor area grouping over a runtime clustering algorithm, and the Workers free tier over anything that needs ops.

## Success criteria

- An agent with the MCP server configured answers *"when and where should I camp in the next two weeks, and which birds I haven't seen this year will be there?"* with one or two tool calls.
- A human gets the same answer from the website map in under a minute, without signing up for anything.
- The owner can change his mind about what "good camping weather" means by editing one config object and one test table.
