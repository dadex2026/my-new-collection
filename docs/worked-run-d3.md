# Worked run — D3, community leaderboard from a Ledger export

**Driven by prompt D3** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and the scripts disagree, the scripts win.
`backend/scripts/import-community-boards.js`, `_input/import-config.json` and
`backend/standings/README.md` are authoritative.

**Applicable project: `TEMPLATE-TEST-LEDGER`.** This is the one target with the whole
pipeline already exercised — two dated exports, a predictions file behind them, four
built community boards, and a real ruleset boundary with movement suppressed. Every
value below was read out of those files rather than imagined, including the outputs,
so this fixture shows what a *correct* result looks like as well as how to produce one.

---

## SAMPLE HEADER

### D3 — Community leaderboard from a Ledger export

```
I want to build the participant leaderboard from a Ledger export.

COLLECTION:        TEMPLATE-TEST-LEDGER
SOURCE DASHBOARD:  Entertainment Ledger (v1.4)
EXPORT FILE:       backend/standings/_input/community-leaderboard-2026-08-23.csv
EXPORT HEADER ROW: Position,Handle,Points,Edge,AvgPerPick,HitRatePct,Hits,Resolved,Contrarian,AvgDifficulty,PredictionPoints,EngagementPoints,Pending,Late,AvgVirtualBet,Provisional,AppVersion
```

---

## PART 1 — RUNBOOK

### 1. Four boards out of one export, and why they are four files

```
node backend/scripts/import-community-boards.js
```

| File | Board | Ranks by |
|---|---|---|
| `community-points.json` | Entertainment · Points | total points — accuracy and volume together |
| `community-avg.json` | Entertainment · Average | points per prediction |
| `community-hitrate.json` | Entertainment · Hit rate | share of predictions that hit |
| `community-edge.json` | Entertainment · Edge | performance against the field |

**They are separate files because they are separate leaderboards with separate
movement.** One document with four sorted views would give you one movement history;
four boards give each ranking its own, which is the thing participants actually argue
about. It also lets `minPicks` apply to the skill-based sorts and not to the volume
one — `community-points.json` records exactly that:

> *"Provisional handles are ranked normally on this board — the rule applies to
> skill-based sorts only."*

### 2. `columnMap` — and why this source needs none

`_input/import-config.json` for this collection carries **no `columnMap` entry at
all**, and that is correct: the logical names the importer reads *are* the
Entertainment Ledger's own headers.

| Logical name | Entertainment Ledger | Sports Ledger |
|---|---|---|
| `Points` | `Points` ✓ | `FinalPoints` |
| `Edge` | `Edge` ✓ | `SkillEdge` |
| `Resolved` | `Resolved` ✓ | `Predictions` |

**For this source:**

```json
"columnMap": {}
```

**Had the source been the Sports Ledger:**

```json
"columnMap": { "Points": "FinalPoints", "Edge": "SkillEdge", "Resolved": "Predictions" }
```

Mapping is **additive** — the original headers stay on the row — so a map never costs
you a column, and a source already using the logical names needs no entry.

### 3. `minPicks` and the provisional threshold

`minPicks: 3`. Below three resolved predictions a participant is **provisional** and
sinks to the bottom of the skill-ordered boards rather than topping them on one lucky
pick. It does not remove anyone. The built boards carry the rule and its consequences
in `eligibility`, alongside `omittedNoValue` and `unrankedHandles` — which in this
round names `@oldtimer`: *1 prediction, 0 counting, "Every prediction is outside the
ranking window."*

That is the difference between a participant who is ranked low and one who is not
ranked at all, stated in the published data rather than left to inference.

### 4. The evidence object

`attachEvidence()` hangs a per-prediction record off every entry, and it reaches
`frontend/public/standings.json`. From `@popcritic`'s first prediction, verbatim:

```json
{ "category": "Billboard 2026 - Hot 100 #1",
  "type": "Reply", "prediction": "Taylor Swift", "actual": "Taylor Swift",
  "actualStatedOnRow": "TBD",
  "date": "2026-08-14 11:30 -05:00",
  "url": "https://x.com/popcritic/status/1003",
  "bet": 0, "closeness": 1, "difficulty": 1.4,
  "initialScore": 140, "betAdj": 0, "engagement": 0, "total": 140 }
```

Timestamp, post type, the prediction, the settled actual **and** what the row itself
said (`actualStatedOnRow: "TBD"` — settled later by the Results Register), the link
back to the post, and every term of the score.

**So a disputed late entry is settleable from published data.** Someone claiming they
posted before the cut-off is answered with a timestamp and a URL that anyone can open,
not with an assertion. The board also records where the evidence came from —
`evidenceSource: rows/community-predictions-2026-08-23.csv, 48 rows` — and its own
`capture` block: `complete: true, method: ledger-export`, with the note *"Values
computed by the source Ledger and exported verbatim. Nothing is recomputed here."*

### 5. The boundary — and this round crossed one

**The Ledger is the only place a score is computed.** This side derives exactly two
positional values: **movement**, replayed across the dated exports, and
**competition ranks** where the export did not supply them.

This round is the case that proves it. `rulesets.json` declares three versions, and
the built board records:

```json
"rulesetChanged": { "from": "entertainment-ledger-v1.2",
                    "to":   "entertainment-ledger-v1.4",
                    "kind": "export-only",
                    "movementSuppressed": true,
                    "suppressedBy": "entertainment-ledger-v1.3" }
```

The subtitle says it in prose on the card:

> *"Movement is not shown for this round: entertainment-ledger-v1.3 changed the
> scoring rules between entertainment-ledger-v1.2 and entertainment-ledger-v1.4, so
> positions either side were produced under different rules."*

Note what happened there. The move from v1.2 to v1.4 is `export-only` — no number
moved — but **v1.3 sits between them and is a `rule-change`**, which added the
Combined post type and a `combinedBonus` of 20. So movement is suppressed by a version
neither end of the comparison names. The importer looked at the span, not the
endpoints. A delta across it would have measured the rule change as much as the
participant.

**And the two exports resolve their versions differently.** The 2026-08-23 export
carries `AppVersion` (`v1.4`); the 2026-08-20 export has **no `AppVersion` column** —
v1.4 is the version that added it. That older round resolves through
`import-config.json`'s `rulesetVersion: "entertainment-ledger-v1.2"` fallback, which
is exactly what that field is for and why it is still set here rather than left null.

### 6. Publish and push

```
node backend/scripts/publish-round.js
```

which runs `import-ranked-boards.js` → `generate-standings-cards.js` →
`generate-methodology.js` in order, stopping at the first failure. Then commit
`backend/standings`, `backend/content-registry.json` and `frontend/public`, push, and
confirm the deploy finished.

---

## PART 2 — DISPOSITION TABLE

| # | File | Path | Disposition | What goes where |
|---|---|---|---|---|
| 1 | The export | `backend/standings/_input/community-leaderboard-2026-08-23.csv` | **Created** (by hand, from the Ledger) | 17 columns, `Position` first, `AppVersion` last. Its filename date places the round. |
| 2 | Earlier round | `_input/community-leaderboard-2026-08-20.csv` | Read | 16 columns — no `AppVersion`. Resolves via the config fallback. |
| 3 | Evidence rows | `_input/rows/community-predictions-2026-08-23.csv` | **Created** | 48 rows. Feeds `attachEvidence()`. |
| 4 | Import config | `_input/import-config.json` | **Edited** once per collection | `collectionTitle: Entertainment`, `rulesetPrefix: entertainment-ledger`, `minPicks: 3`, `cardLimit: 10`, `rulesetVersion` fallback. No `columnMap` for this source. |
| 5 | Rulesets | `_input/rulesets.json` | **Edited** when a build changes | v1.2 `baseline`, v1.3 `rule-change`, v1.4 `export-only`. |
| 6 | Importer | `backend/scripts/import-community-boards.js` | Run | Reads #1–#5. |
| 7–10 | The four boards | `backend/standings/community-{points,avg,hitrate,edge}.json` | **Generated — output only** | Entries, `evidence`, `eligibility`, `unrankedHandles`, `rulesetChanged`, subtitle. Overwritten every run. |
| 11 | Cards | via `generate-standings-cards.js` | **Generated** | `STANDINGS-` cards. Never hand-edited. |
| 12 | Methodology | via `generate-methodology.js` | **Generated** | Publishes `rulesets.json` as the changelog. |
| 13 | Published artifact | `frontend/public/standings.json` | **Generated** | Carries the evidence objects. |

---

## PART 3 — REFUSALS

1. **Nothing is scored here.** Points, edge, hit rate, difficulty and closeness all
   come from the Ledger, exported verbatim. This side derives movement and, where
   absent, competition ranks — nothing else.
2. **Movement is suppressed across a rule change**, even when the two endpoints
   compared are themselves `export-only`.
3. **An undeclared ruleset stops the import** rather than being stamped with a stale
   value.
4. **Board files are output.** Every run overwrites them, subtitle included.
5. **`minPicks` does not remove anyone** — provisional participants sink on
   skill-ordered boards and rank normally on the volume board.
6. **A handle whose predictions all fall outside the window is not silently dropped**
   — it appears in `unrankedHandles` with a reason.
7. **`STANDINGS-` cards are never hand-edited**; edit the board's source and re-run.

---

## PART 4 — VERIFICATION CHECKLIST

**Before importing**

- [ ] Export filename carries `YYYY-MM-DD`.
- [ ] `AppVersion` present — or, if absent, `rulesetVersion` in `import-config.json` names a declared version.
- [ ] Every version that has produced an export here is declared in `rulesets.json`, with a `kind` chosen deliberately.
- [ ] `columnMap` correct for the source: empty for Entertainment, the three-entry map for Sports.
- [ ] The matching `rows/community-predictions-YYYY-MM-DD.csv` is present, or evidence will be missing.

**After importing**

- [ ] All four board files rewritten.
- [ ] `throughRound` is the new date; `rulesetVersion` and `rulesetSource: export` look right.
- [ ] If a rule change lies anywhere in the span: `movementSuppressed: true`, `suppressedBy` names it, and the subtitle explains it in prose.
- [ ] Round one shows every entry as `new` — correct, not a bug.
- [ ] `eligibility.minPicks` matches config; `unrankedHandles` entries each carry a reason.
- [ ] Spot-check one entry's `evidence`: timestamp, URL, and `actualStatedOnRow` vs `actual`.
- [ ] `capture.complete` is `true` only if the underlying capture really was complete.

**After publishing**

- [ ] `publish-round.js` completed all three steps.
- [ ] Evidence objects present in `frontend/public/standings.json`.
- [ ] Committed, pushed, deploy finished.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `EVIDENCE ROWS FILE` | The boards' `evidenceSource` points at `rows/community-predictions-YYYY-MM-DD.csv`, and without it every entry loses its evidence object — the thing that makes a disputed entry settleable. D3 collects the leaderboard export and never mentions it. |
| `RULESET KIND` | If this export carries a version not yet declared, the import stops. D3 has no field for the version or its kind, and `kind` decides whether movement survives. |
| `MIN PICKS` | Set in `import-config.json` per collection; D3 explains the threshold without collecting it. |
| `CARD LIMIT` | `cardLimit: 10` decides how many rows reach the news card. Not collected. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| D3 cover items | The evidence bullet describes what `attachEvidence()` produces but never names its **input**: `_input/rows/community-predictions-YYYY-MM-DD.csv`. A run without that file produces boards that look complete and carry no evidence. Worth an `EVIDENCE ROWS FILE` field and a line in the runbook. |
| D3 cover items | Nothing tells the runbook to check whether the export's version is declared — that check lives in D1 and D2. Since D3 imports an export, an undeclared `AppVersion` stops it here too. |
| D3 cover items | Movement suppression is worth stating as this collection demonstrates it: the span is checked, not the endpoints, so a `rule-change` *between* two `export-only` versions suppresses movement even though neither endpoint names it. |
| D3 header | `SOURCE DASHBOARD` should carry the build stamp (Rule 2) — `Entertainment Ledger (v1.4)` — because the stamp is what joins `rulesetPrefix` into the declared id. The gloss lists bare names. |
| `import-config.json` `_columnMap` | The example reads `{ "Points": "FinalPoints" }`, which is only unambiguous once you know the key is the logical name and the value is the source's header. Worth stating the direction outright. |
