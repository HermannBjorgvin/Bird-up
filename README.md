# Tjaldur

**Find the next good camping weather window in Iceland — and the birds waiting for you there.**

*Tjaldur* is the Icelandic name of the Eurasian Oystercatcher, and a play on *tjald* — tent. Tjaldur watches the 16-day forecast for all of Iceland, finds the warm, calm, dry windows worth pitching a tent in, recommends campsites inside them, and (optionally) tells you which birds reported nearby you haven't seen yet this year.

> **Status: in development** (S01 scaffold). The documents in [`specs/`](specs/) define what is being built and in what order.

## Development

Requires Node ≥ 22. `npm install`, then:

```sh
npm test         # vitest, both projects (unit + workers pool)
npm run check    # tsc --noEmit && vitest run — must be green before any deploy
npx wrangler deploy   # manual deploy (no CI/CD, deliberate) — see specs/08 runbook
```

Until S02's `vite build` exists, `wrangler deploy` needs the (git-ignored) assets directory to exist: `mkdir -p dist/client`.

Local secrets go in `.dev.vars` (git-ignored — copy [`.dev.vars.example`](.dev.vars.example)); production secrets via `npx wrangler secret put <NAME>`. Never in config or code.

## What it will be

- **A public MCP server** (`/mcp`, authless, streamable HTTP) so AI agents can answer "when and where should I camp in the next two weeks?" with one tool call.
- **A website** with a map of Iceland: campsites colored by weather-window score, the windows themselves, and an optional eBird layer highlighting species you haven't ticked this year.
- **A plain JSON API** (`/api/*`) backing the website — and deliberately kept open so an external cron can poll it for DIY alerts.

Everything runs in a single Cloudflare Worker on the free tier, sized honestly for ~100–200 searches/day.

## Specs

| Doc | Contents |
|---|---|
| [00-product.md](specs/00-product.md) | What Tjaldur is, for whom, and what v1 deliberately is not |
| [01-architecture.md](specs/01-architecture.md) | Single-Worker architecture, module boundaries, KV schema, shared response shape, free-tier budget |
| [02-scoring-policy.md](specs/02-scoring-policy.md) | The weather-window definition — an explicitly replaceable, versioned, table-tested pure module |
| [03-api.md](specs/03-api.md) | MCP tools (2), REST endpoints, shared `Recommendation` schema, errors, staleness, CORS |
| [04-data-sources.md](specs/04-data-sources.md) | Open-Meteo, tjalda.is (+ OSM fallback), eBird: endpoints, cadence, normalization, attribution, failure handling |
| [05-website.md](specs/05-website.md) | Map UI, seen-list handling (localStorage, client-side CSV parsing), stack |
| [06-implementation-plan.md](specs/06-implementation-plan.md) | Eight vertical slices, each TDD-driven and demoable |
| [07-testing.md](specs/07-testing.md) | Test layers, fixture recording protocol, what is deliberately not tested |
| [08-tech-stack.md](specs/08-tech-stack.md) | Version pins, wrangler/vitest/MCP setup shapes, manual deploy runbook |

## Stories

The specs are broken down into vertically sliced user stories with acceptance criteria in [`stories/`](stories/) — [`stories/README.md`](stories/README.md) is the index and build order (S01 scaffold → S12 launch readiness). [`CLAUDE.md`](CLAUDE.md) carries the working context and hard rules for anyone (human or agent) implementing them.

## Data sources & attribution

- **Weather**: [Open-Meteo](https://open-meteo.com/) — forecast data under CC BY 4.0. "Weather data by Open-Meteo.com".
- **Birds**: [eBird](https://ebird.org/) — "Bird observation data from eBird.org, Cornell Lab of Ornithology". Non-commercial use under the eBird API Terms of Use.
- **Campsites**: [tjalda.is](https://tjalda.is/) (primary, pending clearance — see [04-data-sources.md](specs/04-data-sources.md)) and [OpenStreetMap](https://www.openstreetmap.org/) contributors under ODbL.
- **Map tiles** (website): © OpenStreetMap contributors.

Tjaldur is a free, non-commercial hobby project.
