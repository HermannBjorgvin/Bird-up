# Website manual checklist

Per-slice browser checks (spec 07 — no browser test automation in v1).
Run against the deployed site after each website story; record the run in the story's notes.

## S02 — scaffold

- [x] Page loads at `/` with the Tjaldur title and pitch
- [x] "API health: ok" renders (live `/api/health` from the same origin)
- [x] Attribution footer lists Open-Meteo and OpenStreetMap
- [x] `npm run dev`: editing a component hot-reloads without a full page refresh *(waived by owner at S02 — template-default behavior)*
