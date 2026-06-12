# S07 — Public MCP server

**Epic:** agents · **Depends on:** S04 (S06 enriches it but is not required) · **Spec refs:** [03-api](../specs/03-api.md), [06 Slice 4](../specs/06-implementation-plan.md)

> As an agent user, I want to add Tjaldur to my AI client and ask "when can I camp?", so that my agent answers with windows, campsites and (later) birds in one tool call.

## Description

`createMcpHandler` mounted at `/mcp` (authless, stateless streamable HTTP), exposing exactly two tools — `find_weather_windows` and `next_weather_windows` — as thin wrappers over the same `service.ts` call REST uses. Tool descriptions carry the agent-ergonomics text required by spec 03 (units, re-send `seen_species` every call, `mapUrl` meaning, confidence semantics). `mapUrl` is built absolute from `BASE_URL` (target lands in S11).

## Acceptance criteria

All MCP tests run the real handler in-process via the MCP SDK `Client` over a transport bound to the Worker's `exports.default.fetch` (no network):

- [ ] `tools/list` returns exactly 2 tools whose input schemas match spec 03 (names, required fields, enums, defaults).
- [ ] `next_weather_windows` called with **no arguments** returns a valid `Recommendation` (zod-validated), sorted by score then soonness.
- [ ] `find_weather_windows` with a valid `thresholds` override → `policyVersion` ends `+custom`; with an out-of-bounds override → tool result `isError: true` containing the `INVALID_PARAMS` envelope.
- [ ] `end_date` beyond today+16d → `isError: true`, not a protocol error.
- [ ] Both tool descriptions contain the spec-03 required hints (checked verbatim by test for the load-bearing phrases: units, seen_species re-send, mapUrl, confidence).
- [ ] Responses include non-empty `attribution[]`.
- [ ] Manual check recorded in story notes: the deployed `/mcp` endpoint added to a real MCP client (e.g. Claude) answers "when can I camp next week?" with one tool call.

## Demo

Add `https://tjaldur.<account>.workers.dev/mcp` to an agent and ask when to camp — one no-arg tool call answers.

## Notes

(manual client check goes here at implementation time)
