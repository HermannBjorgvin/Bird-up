# Tjaldur — user stories

Vertically sliced: every story (except the spike) ends with something a user, agent or developer can see working. Build order = numeric order, with the noted exceptions. Each story file carries its own acceptance criteria; a story is **done** when all criteria boxes are checked, `npm run check` is green, and its Demo line is true.

Workflow per story: write the tests from the acceptance criteria first (red), implement (green), refactor, deploy manually if the story touches production behavior, check the boxes, fill in the *Notes* section where the story asks for measurements or manual-check records.

| # | Story | Epic | Depends on | Delivers |
|---|---|---|---|---|
| [S01](S01-project-scaffold.md) | Project scaffold | scaffolding | — | Typed, tested Worker skeleton; first manual deploy; `/api/health` live |
| [S02](S02-website-scaffold.md) | Website scaffold | scaffolding | S01 | Vite app served as Static Assets; one-command dev loop |
| [S03](S03-weather-windows-core.md) | Weather windows (fixture) | core value | S01 | Scoring core + `/api/windows`; the canonical policy test table passes |
| [S04](S04-live-weather.md) | Live forecasts | core value | S03 | Open-Meteo + KV + 2h cron; staleness; deployed with real data |
| [S05](S05-tjalda-spike.md) | tjalda.is spike | campsites | — (anytime before S06) | Findings note + campsite-source gate decision |
| [S06](S06-real-campsites.md) | Real campsites | campsites | S04, S05 | ~200 real sites with facilities/booking links in recommendations |
| [S07](S07-mcp-server.md) | Public MCP server | agents | S04 | `/mcp` with both tools; agents can ask "when can I camp?" |
| [S08](S08-website-map.md) | Website map | website | S02, S06 | Map of score-colored campsites, windows panel, threshold sliders |
| [S09](S09-birds-api.md) | Birding targets (API/MCP) | birds | S07 | eBird + seen-list diff in tools and REST |
| [S10](S10-website-birds.md) | Website birds | birds | S08, S09 | CSV upload, localStorage, bird layer with unseen-emphasis |
| [S11](S11-svg-map.md) | Weather map image | polish | S06 | `/api/map` SVG; real `mapUrl` everywhere |
| [S12](S12-launch-readiness.md) | Launch readiness | polish | S08, S10, S11 | Attribution/error sweeps, usage README, tjalda legal gate |

Sequencing notes (from [specs/06-implementation-plan.md](../specs/06-implementation-plan.md)): S01→S03→S04→S06→… is the critical path; S05 is the only external unknown and never blocks it (OSM is built regardless); S09's core work can start after S04, its MCP criteria need S07; after S07 ships, MCP tool schemas are public contracts — changes become breaking changes.

Post-v1 backlog (deliberately not stories): alerts, ensemble-spread confidence, inline PNG maps (paid plan), named scoring policies, tjalda availability data.
