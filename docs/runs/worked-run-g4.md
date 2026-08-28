# Worked run — G4, export a Ledger board for a collection

**Driven by prompt G4** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and `import-ranked-boards.js` disagree, the
script wins.

**Applicable projects: `Dashboards\Sports Ledger` → `TEMPLATE-TEST-LEDGER`.** G4 spans
two projects by definition — a Ledger on one side, a collection on the other.

> **A note on the canonical header.** The worked-headers appendix runs this into
> `my-new-collection`, and **that collection has no `backend/standings/` directory, no
> `_input/`, and none of the five scripts that would import an export** (see the A4
> run). Following the appendix today produces a runbook whose second step has nowhere
> to move the file to. The test rig has the whole receiving side, so this run uses it.

---

## SAMPLE HEADER

### G4 — Export a Ledger board for a collection

```
I want to export a board from a Ledger into a collection's standings.

SOURCE DASHBOARD:  Sports Ledger (v3.5)
COLLECTION:        TEMPLATE-TEST-LEDGER
BOARD:             nfl-games
ROUND DATE:        2026-08-30
```

---

## PART 1 — RUNBOOK

### 1. Where the Ledger writes, and what shape a ranked export has

Sports Ledger writes into its own **`Dashboards\Sports Ledger\exports\`**. Files land
in the project folder directly — never through Downloads, where a collision becomes
`_1` and Storage Sense may clear the folder.

A ranked export is always the same shape:

> **`Position` first, a label column, a value column, extras after.**

For the Games board that is
`Position, Date, Matchup, Winner, WinScore, Spread, Total, FinalValue`, plus
`AppVersion` since this tool stamps its build.

**`Position` must be present and named literally that.** It is not configurable, rank
is taken from it rather than recomputed, and **rows lacking it are dropped rather than
reported** — the one failure in this runbook that is silent.

### 2. The move — manual, and the filename carries the round

```
Dashboards\Sports Ledger\exports\nfl-ranked-2026-08-30.csv
  →  TEMPLATE-TEST-LEDGER\backend\standings\_input\boards\nfl-ranked-2026-08-30.csv
```

Two things the filename must satisfy, and neither is checked before you move it:

- **It starts with the declaration's `filePrefix`** — the importer selects files by
  `startsWith(filePrefix)` and `.csv`. For `boardId: nfl-games` the prefix is
  `nfl-ranked`, which is *not* the board id; the board is named for what it ranks, the
  prefix for what the source exports.
- **It carries `YYYY-MM-DD`.** No date is a **hard error** — `undated_export`, exit 1,
  *"so it cannot be placed in the replay."* The date is read from the **name**, not the
  file's mtime, so a copied or restored export keeps its position in the movement
  replay. That is the whole reason it lives in the filename.

**This step is manual on purpose.** Nothing automates a file crossing from a tool's
folder into a repo, and nothing will tell you that you moved yesterday's export.

### 3. The column-name check

Does this source use the labels the board declaration expects?

| Logical name | Sports Ledger writes | Entertainment Ledger writes |
|---|---|---|
| `Points` | `FinalPoints` | `Points` |
| `Edge` | `SkillEdge` | `Edge` |
| `Resolved` | `Predictions` | `Resolved` |

**If they differ, the fix is a `columnMap` in `_input/import-config.json` — not a
renamed file and not a renamed column in the tool.** Renaming the file changes nothing;
renaming columns in the Ledger breaks every other consumer of that export and every
prompt verified against it.

```json
"columnMap": { "Points": "FinalPoints", "Edge": "SkillEdge", "Resolved": "Predictions" }
```

Key is the logical name, value is the source's header. Mapping is **additive** — the
original headers stay on the row.

**For this board specifically the mapping is not needed**, because a ranked Games board
is declared with `labelColumn: Matchup` and `scoreColumn: FinalValue` — names the
export already uses. The three-way rename above bites on the **community** boards,
where the logical names are fixed. Check the declaration, not the tool's reputation.

### 4. `AppVersion`, and the exact refusal

The column joins to `rulesetPrefix`, so `v3.5` resolves to `<prefix>-v3.5`. That
version must be declared in `_input/rulesets.json`, or the import stops:

```
nfl-ranked-2026-08-30.csv: ruleset not declared in rulesets.json — tried "v3.5" and "nfl-ledger-v3.5".
```

Exit `1`, `undeclared_ruleset`. **The importer tries the bare stamp first, then the
prefixed form, and names both** — which also tells you whether `rulesetPrefix` is set
the way you think it is.

This collection currently declares `entertainment-ledger-v1.2 / v1.3 / v1.4` and
nothing for a Sports build, so a first Sports export needs a new declaration with a
deliberately chosen `kind` — `baseline` for the first.

**Without an `AppVersion` column at all**, the importer falls back to
`import-config.json`'s `rulesetVersion`, which must also be declared. That is the path
an older export takes, and it is why the fallback field is still set here.

### 5. Publish on the collection side

```
node backend/scripts/publish-round.js
```

`import-ranked-boards.js` → `generate-standings-cards.js` → `generate-methodology.js`,
stopping at the first failure. From here it is D2's runbook.

---

## PART 2 — DISPOSITION TABLE

| # | Path | Disposition | What goes where |
|---|---|---|---|
| 1 | `Dashboards\Sports Ledger\exports\nfl-ranked-2026-08-30.csv` | **Created** by the tool | `Position` first, label, value, extras, `AppVersion`. |
| 2 | `…\_input\boards\nfl-ranked-2026-08-30.csv` | **Moved by hand** | Prefix matches `filePrefix`; date places the round. |
| 3 | `_input/boards.json` | Read | `filePrefix`, `labelColumn`, `scoreColumn` — what the export must satisfy. |
| 4 | `_input/import-config.json` | **Edited only if labels differ** | `columnMap`; `rulesetPrefix`; `rulesetVersion` fallback. |
| 5 | `_input/rulesets.json` | **Edited** for a new build | New id with a deliberate `kind`. |
| 6 | `backend/scripts/publish-round.js` | Run | Three steps. |
| 7 | `backend/standings/nfl-games.json` | **Generated** | Output only. |
| 8 | `frontend/public/standings.json` | **Generated** | The published artifact. |

---

## PART 3 — REFUSALS

1. **No `YYYY-MM-DD` in the filename** — hard error, exit 1.
2. **An undeclared ruleset** — refused, naming both candidates tried.
3. **A missing declared column** (`Position`, `labelColumn`, `scoreColumn`, `idColumn`)
   — refused, naming which.
4. **Rows without `Position` are dropped silently** — the one failure here with no
   message.
5. **A label mismatch is fixed with `columnMap`**, never by renaming the file or the
   tool's columns.
6. **Nothing is recomputed on the collection side.** Rank is the export's `Position`.
7. **The move is manual**, and nothing detects a stale export.

---

## PART 4 — VERIFICATION CHECKLIST

**Before moving**

- [ ] Export written into the Ledger's `exports\` folder, not Downloads.
- [ ] `Position` present, spelled exactly, and every intended row has one.
- [ ] Filename starts with the declaration's `filePrefix` (`nfl-ranked`, not the board id).
- [ ] Filename carries `2026-08-30` — and it is **this round's** date.
- [ ] Row count in the file matches the board in the tool.

**Before importing**

- [ ] Column labels checked against the declaration; `columnMap` added if they differ.
- [ ] `AppVersion` value declared in `rulesets.json`, with a chosen `kind` — or the `rulesetVersion` fallback is declared.
- [ ] `rulesetPrefix` set, so the prefixed candidate resolves.

**After**

- [ ] `publish-round.js` completed all three steps.
- [ ] Board entry count matches the export's row count — a gap means dropped `Position` rows.
- [ ] Movement is absent on round one and present after.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `EXPORT FILE` | The runbook's core step is moving a named file, and G4 collects only `ROUND DATE`. |
| `FILE PREFIX` | What the filename must start with, and it is not the `BOARD` id — the two differ in the platform's own example (`nfl-games` / `nfl-ranked`). |
| `RULESET KIND` | Required for the declaration a new build forces, and it decides whether movement survives the boundary. |
| `APPVERSION` | The stamp the export carries; everything in §4 turns on it and it is inferred from `SOURCE DASHBOARD`'s build stamp rather than collected. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| G4 worked header | Targets `my-new-collection`, which **has no `backend/standings/`, no `_input/`, and none of the importing scripts**. The canonical example cannot be executed. Either point it at the test rig or note the A4 prerequisite. |
| G4 cover items | The move step says "with the `filePrefix` and the `YYYY-MM-DD`" without warning that **`filePrefix` is usually not the board id** — the platform's own example pairs `nfl-games` with `nfl-ranked`, and G4 collects `BOARD` but not the prefix. |
| G4 cover items | The column-name section implies Sports Ledger always needs a `columnMap`. It depends on the **board**: a ranked Games board declares `labelColumn: Matchup` / `scoreColumn: FinalValue`, which the export already uses; the three-way rename bites on community boards where the logical names are fixed. Worth saying "check the declaration". |
| G4 cover items | **Rows lacking `Position` are dropped rather than reported** — worth stating in the refusals, since every other failure in this runbook announces itself and this one does not. The check is a row-count comparison, which nothing currently asks for. |
