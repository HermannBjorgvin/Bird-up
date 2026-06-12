# S12 — Launch readiness

**Epic:** polish · **Depends on:** S08, S10, S11 · **Spec refs:** [00-product](../specs/00-product.md), [03-api](../specs/03-api.md), [06 Slice 8](../specs/06-implementation-plan.md)

> As the project owner, I want the loose ends tied — attribution, errors, docs, the tjalda.is clearance — so that Tjaldur can be shared publicly without embarrassment or surprises.

## Description

The sweep before telling anyone about it: consistency of error envelopes, attribution everywhere, usage documentation replacing the "spec phase" README, the legal gate, and a sanity check of the free-tier budget against measured numbers.

## Acceptance criteria

- [ ] Schema-level test: `attribution[]` is non-empty on every JSON route; the website footer lists all active sources + Leaflet/OSM tiles; eBird's string appears verbatim when birds are served.
- [ ] Error-envelope sweep: every non-200 from `/api/*` matches the envelope schema with a code from spec 03 (test iterates the routes with bad inputs).
- [ ] `GET /api/health` returns `{ ok, dataAge }` and is documented as the owner's monitoring/alerts polling target alongside `/api/next-windows`.
- [ ] README rewritten from "spec phase" to usage docs: MCP setup snippet for common clients, REST examples with real responses, a screenshot, the DIY-alerts recipe (external cron → `/api/next-windows`).
- [ ] Free-tier budget table in spec 01 updated with the measured numbers from S04/S11 notes; any limit within 10× margin gets a written mitigation.
- [ ] **Launch gate:** if the tjalda.is adapter is active, the owner has confirmed clearance with tjalda.is and this is recorded in this story's notes; otherwise the adapter is verified absent from production config. *(Owner action item.)*
- [ ] localStorage key, KV keys and `policyVersion` all carry their `v1`/version suffixes as specced (grep-level audit).

## Demo

A stranger (or their agent) can discover, understand and use Tjaldur from the README alone — and nothing in production is unattributed, uncleaned or uncleared.

## Notes

(clearance record goes here)
