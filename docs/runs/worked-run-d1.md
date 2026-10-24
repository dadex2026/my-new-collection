# Worked run — D1, declare a new ranked board

**Driven by prompt D1** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and the scripts disagree, the scripts win.
`backend/scripts/import-ranked-boards.js`, `backend/standings/README.md` and the two
`_input/` config files are authoritative.

**Built on `TEMPLATE-OPEN-EDITION`**, whose `_input/` folder is in its shipped state —
`import-config.json` and `rulesets.json` only, both carrying placeholders, and no
`boards.json` and no `_input/boards/`. That is exactly the starting position D1
describes, which makes the template the honest place to show this. The registry calls
it *the source — never run collection commands here*, so read this as the shape to
copy into your collection.

---

## SAMPLE HEADER

### D1 — Declare a new ranked board

What it creates: a recurring board. Declared once; every future round is one dated
export file.

```
I want to declare a new ranked board.

COLLECTION:        TEMPLATE-OPEN-EDITION
SOURCE DASHBOARD:  Sports Ledger (v3.5)
BOARD ID:          nfl-games
TITLE:             NFL · Games by Final Value
WHAT IS RANKED:    games
TRACK:             subject
ENTITY TYPE:       game
SEASON ID:         2026
EXPORT FILE PREFIX:nfl-ranked
LABEL COLUMN:      Matchup
SCORE COLUMN:      FinalValue
ID COLUMN:         none — this export has no stable id column
EXPORT HEADER ROW: Position,Date,Matchup,Winner,WinScore,Spread,Total,FinalValue,AppVersion

Give me the runbook for adding this to the import path.
```

**Notes on the filled values:**

- **SOURCE DASHBOARD carries its build stamp** — `Sports Ledger (v3.5)`, per Rule 2.
  That `v3.5` is not decoration here: it becomes half of the ruleset id in step 2.
- **`TRACK: subject`** because Final Value is a number the Ledger computed about the
  game itself. `consensus` would mean ranking those same games by what participants
  collectively predicted, which no source produces yet.
- **EXPORT HEADER ROW is the Sports Ledger's Games shape**, as
  `import-ranked-boards.js` documents it — `Position, Date, Matchup, Winner,
  WinScore, Spread, Total, FinalValue` — plus `AppVersion`, which the Ledger stamps.
  Paste your own export's real first line rather than copying this.
- **SEASON ID `2026`** matches what `import-config.json` already ships.
- **EXPORT FILE PREFIX is `nfl-ranked`, not `nfl-games`.** D1's gloss used to call the
  prefix "conventionally the same as BOARD ID"; **it now says the opposite** — *"often
  NOT the same as BOARD ID: the board is named for what it ranks, the prefix for what
  the source exports"*, citing the same `backend/standings/README.md` example that
  pairs `boardId: nfl-games` with `filePrefix: nfl-ranked`. Say which you are using; do
  not assume they match.
- **LABEL COLUMN is `Matchup` and SCORE COLUMN is `FinalValue`.** Both are required
  fields of the board declaration, and both are now collected by D1's header rather
  than inferred from the export header row. A game has no name of its own, so the
  matchup is the label; `FinalValue` is the number the TITLE says the board ranks by.
- **ID COLUMN is `none` here, and that is a decision rather than a default** — the
  Sports Ledger's Games export has no stable id column. See the warning below.

---

## PART 1 — RUNBOOK

### 1. `backend/standings/_input/import-config.json`

The file exists. Three fields ship as placeholders and all three matter:

| Field | Ships as | Set to | Why |
|---|---|---|---|
| `collectionTitle` | `"CHANGE ME"` | your collection's display title | Appears in board titles and on the methodology page. Set it **before the first import** — it is baked into what gets published. |
| `seasonId` | `"2026"` | `"2026"` | A season is a scope, not a reset. Every board states which season it belongs to, and a season boundary is the cleanest effective date for a rules change. |
| `rulesetPrefix` | `"CHANGE ME"` | `"nfl-ledger"` | Qualifies the source's bare build stamp into a ruleset id. `v3.5` alone is unambiguous inside the Ledger but not here — another source could also reach v3.5. |

Leave `rulesetVersion: null` while every export carries an `AppVersion` stamp; it is
the fallback for exports taken before the source began stamping. `minPicks`,
`cardLimit` and `columnMap` are untouched by this board — `columnMap` stays `{}`
because the Sports Ledger already uses the logical names the importer reads.

### 2. `backend/standings/_input/rulesets.json`

Declare the version the exports will carry. With `rulesetPrefix: "nfl-ledger"` and an
`AppVersion` of `v3.5`, the id is **`nfl-ledger-v3.5`**:

```json
{
  "rulesets": {
    "nfl-ledger-v3.5": {
      "kind": "baseline",
      "effectiveFrom": "2026-08-30",
      "note": "First version imported for this collection."
    }
  }
}
```

Delete the `_example` block as its own note instructs; `_note` and `_kinds` stay —
they are the changelog the methodology page publishes.

**The exact refusal if you skip it:**

```
nfl-ranked-2026-08-30.csv: ruleset not declared in rulesets.json — tried "v3.5" and "nfl-ledger-v3.5".
```

Exit `1`, `undeclared_ruleset`. The importer tries the bare stamp first and then the
prefixed form, and names both.

**Why that refusal is the point:** an unfamiliar build becomes a *decision* rather
than something that slips through stamped with a stale value. Silently accepting an
unknown version would mean a season's rows carrying a ruleset id nobody chose — and
`kind` is what decides whether movement across that boundary is suppressed
(`rule-change`), retained (`export-only`), or history is recomputed (`bug-fix`).
Getting that wrong is not recoverable by re-running.

### 3. `backend/standings/_input/boards.json`

**This file does not exist in a fresh checkout — you create it here**, along with
`_input/boards/`.

**Seven required:** `boardId`, `title`, `track`, `entityType`, `filePrefix`,
`labelColumn`, `scoreColumn`.
**Five optional:** `blurb`, `idColumn`, `fields`, `columns`, `seasonId`.

The finished file for this board:

```json
{ "boards": [
  { "boardId": "nfl-games",
    "title": "NFL · Games by Final Value",
    "blurb": "Close, competitive games weight up; blowouts weight down.",
    "track": "subject",
    "entityType": "game",
    "filePrefix": "nfl-ranked",
    "labelColumn": "Matchup",
    "scoreColumn": "FinalValue",
    "fields": ["Date", "Winner", "Spread", "Total"],
    "columns": ["rank", "name", "score", "Winner", "movement"] } ] }
```

Required fields carry the identity and the wiring; optional ones control what the
board *shows*. `fields` are the extra export columns carried onto each entry;
`columns` is the display order on the card. `seasonId` here would override
`import-config.json`'s for this board alone.

Missing any required field: `bad_declaration`, exit `1`, naming the board's index and
the field. An unrecognised `track`: `unknown_track`, listing the four valid values.
Two boards with one `boardId`: `duplicate_board`.

### 4. `backend/standings/_input/boards/nfl-ranked-2026-08-30.csv`

One file per round. `filePrefix` + `-` + the date:

```
Position,Date,Matchup,Winner,WinScore,Spread,Total,FinalValue,AppVersion
1,2026-08-30,Bills at Chiefs,Chiefs,27,-1.5,48.5,71,v3.5
2,2026-08-30,Ravens at Bengals,Ravens,24,-2.5,44.5,66,v3.5
```

Three requirements:

- **A column named literally `Position`.** Not configurable, and rank comes from it —
  the source has already competition-ranked the rows, and nothing is recomputed here.
  Rows lacking it are dropped.
- **A `YYYY-MM-DD` in the filename.** No date is a **hard error** —
  `undated_export`, exit `1`, *"so it cannot be placed in the replay."* The round is
  read from the name rather than the file's mtime, so a copied or restored export
  keeps its place.
- **`AppVersion`**, since the Ledger stamps its build. It joins `rulesetPrefix` into
  the ruleset id. Without the column the importer falls back to
  `config.rulesetVersion`, which must also be declared.

The importer also checks that `Position`, `labelColumn`, `scoreColumn` and
`idColumn` (if set) each exist as columns, naming the missing one and the declaration
that expects it. An export with a header and no data rows is `empty_export`.

Then:

```
node backend/scripts/publish-round.js
```

which runs `import-ranked-boards.js` → `generate-standings-cards.js` →
`generate-methodology.js`, in the order they must run, stopping at the first failure
while still printing every step's log. Run them individually to inspect the board
between steps.

### The four mistakes that cost a season

**`idColumn` whenever a label can change — and this board has a real problem here.**
Matching defaults to `labelColumn`, so a rename reads as one entity leaving and
another arriving, resetting a standing with no error and no trace. This board's label
is `Matchup` — *"Bills at Chiefs"* — and the Sports Ledger's Games export carries **no
stable id column**. So a relocation or rebrand mid-season silently splits the entity.
Two honest options, and no third:

1. Have the source export a game id and set `idColumn` to it. `README.md`'s own
   example row shows a `GameId` column, so the shape is anticipated even though the
   Ledger's documented Games export does not currently include one.
2. Accept the risk knowingly for a board whose labels are stable within a season, and
   write that decision down.

What you must not do is leave `idColumn` unset without noticing — the failure is
invisible until someone asks why a team's standing restarted.

**The board file is OUTPUT, not input.** `backend/standings/nfl-games.json` is
overwritten on every run, subtitle included — the subtitle is generated from `blurb`
plus `Round N · date`. Anything hand-added is lost on the next import, silently. Edit
the declaration; never the board.

**Movement needs two rounds.** The first export marks everything `new`, which is
correct and looks broken. Arrows appear from the second round on. Do not go looking
for a bug in round one.

**`track: subject`, and why `consensus` is not it.** `subject` ranks things by a value
the source computed. `consensus` is reserved for ranking those same subjects by what
participants collectively predicted — nothing produces that yet, so choosing it now
declares a board no importer fills.

---

## PART 2 — DISPOSITION TABLE

| # | File | Path | Disposition | What goes where |
|---|---|---|---|---|
| 1 | Import config | `backend/standings/_input/import-config.json` | **Edited** | `collectionTitle`, `seasonId`, `rulesetPrefix` — the three placeholders. `rulesetVersion` stays `null`; `columnMap` stays `{}`. |
| 2 | Ruleset declarations | `backend/standings/_input/rulesets.json` | **Edited** | The `nfl-ledger-v3.5` entry inside `rulesets`; `_example` deleted; `_note` and `_kinds` kept. |
| 3 | Board declaration | `backend/standings/_input/boards.json` | **Created** — does not exist in a fresh checkout | The seven required fields plus `blurb`, `fields`, `columns`. |
| 4 | Export folder | `backend/standings/_input/boards/` | **Created** — does not exist in a fresh checkout | Holds one dated CSV per round. |
| 5 | Round export | `backend/standings/_input/boards/nfl-ranked-2026-08-30.csv` | **Created** (by hand, from the Ledger) | `Position` first, `Matchup`, `FinalValue`, `AppVersion`, extras. The filename's date places the round. |
| 6 | Importer | `backend/scripts/import-ranked-boards.js` | Run (via `publish-round.js`) | Reads #1–#5. |
| 7 | Board file | `backend/standings/nfl-games.json` | **Generated — output only** | Overwritten every run, subtitle included. Never edit. |
| 8 | Standings card | via `generate-standings-cards.js` | **Generated** | A `STANDINGS-` card in the content registry. Never hand-edited. |
| 9 | Methodology | via `generate-methodology.js` | **Generated** | Publishes `rulesets.json` as the changelog. |
| 10 | Published artifact | `frontend/public/standings.json` | **Generated** | What the site and `compose-post.js contest-result` read. |

---

## PART 3 — REFUSALS

1. **`undeclared_ruleset`** — *tried "v3.5" and "nfl-ledger-v3.5"*. Exit `1`.
2. **`undated_export`** — no `YYYY-MM-DD` in the filename, *"so it cannot be placed
   in the replay."* Exit `1`.
3. **`bad_declaration`** — a board missing one of the seven required fields, named.
4. **`unknown_track`** — anything outside `subject`, `consensus`, `prediction`,
   `reporting`, listing the valid values.
5. **`duplicate_board`** — one `boardId` declared twice.
6. **Missing column** — no `Position`, `labelColumn`, `scoreColumn` or `idColumn`
   column, naming which and the declaration that expects it.
7. **`empty_export`** — a file with no data rows.
8. **`missing_file` / `bad_json`** — a config that is absent or unparseable, named.
9. **Rows without `Position` are dropped**, not rescued.
10. **Nothing is recomputed.** Rank is the export's `Position`; values are the
    source's, exported verbatim. The importer will not reorder a board it thinks is
    wrong.

---

## PART 4 — VERIFICATION CHECKLIST

**Before the first import**

- [ ] `collectionTitle` is no longer `CHANGE ME` — it is baked into published titles.
- [ ] `rulesetPrefix` is no longer `CHANGE ME`, and joined to the stamp it produces exactly the id declared in `rulesets.json`.
- [ ] `seasonId` matches the season this board belongs to.
- [ ] `rulesets.json` declares `nfl-ledger-v3.5` with a `kind` you chose deliberately — `baseline` for the first.
- [ ] `_example` block deleted.
- [ ] `boards.json` has all seven required fields; `track` is one of the four.
- [ ] `boardId` unique.
- [ ] **`idColumn` decision made and recorded** — set it, or write down why the label is safe.
- [ ] `labelColumn` and `scoreColumn` name columns that actually exist in the export header row.

**The export**

- [ ] Filename is `nfl-ranked-YYYY-MM-DD.csv` — prefix matches `filePrefix` exactly.
- [ ] A literal `Position` column, first.
- [ ] `AppVersion` present and matching a declared ruleset.
- [ ] Rows present.

**After the run**

- [ ] `publish-round.js` completed all three steps.
- [ ] `nfl-games.json` shows the entry count and round count you expect.
- [ ] Round one shows every entry as `new` — correct, not a bug.
- [ ] Nothing was hand-edited in the board file.
- [ ] From round two: movement arrows appear, and no entity restarted unexpectedly (the `idColumn` symptom).

---

## PART 5 — MISSING INPUTS

| Field | Why it is needed |
|---|---|
| `COLLECTION TITLE` | `import-config.json`'s `collectionTitle` must be set before the first import. D1 collects the collection slug, not its display title — E1 collects both. |
| `RULESET PREFIX` | Free choice, not derivable from the header. I used `nfl-ledger`. |
| `RULESET KIND` / `EFFECTIVE FROM` | `baseline` is right for the first declaration, but the field is a real decision on every later one. |
| `BLURB`, `FIELDS`, `COLUMNS` | Optional display fields; I filled them from `README.md`'s example so the board renders sensibly. |

**No longer missing:** `LABEL COLUMN` and `SCORE COLUMN` were listed here until
2026-08-28, when D1's header began collecting both. The SAMPLE HEADER above supplies
them. **A correct answer to this prompt will not report them as gaps** — an evaluation
scoring check 6 against an older copy of this table would book a correct answer as a
divergence.

---

## APPENDIX — FINDINGS

Not applied.

### For `docs/generation-prompts.md`

| Where | Finding |
|---|---|
| D1 header | **Closed.** `EXPORT FILE PREFIX` and `ID COLUMN` were added to D1's header by another hand while this fixture was being written; `LABEL COLUMN` and `SCORE COLUMN` — both required fields of the file D1 exists to produce, and both previously inferred by the model from the export header row — are now collected too. Verified in `generation-prompts.md` §D1. The SAMPLE HEADER above was refilled to match on 2026-08-28; a fixture that predates a header change tests the old prompt. |
| D1's `EXPORT FILE PREFIX` gloss | **Closed — the finding was acted on and this row now records the fix.** The gloss said the prefix was "conventionally the same as BOARD ID", contradicting `backend/standings/README.md`, whose only worked example pairs `boardId: nfl-games` with `filePrefix: nfl-ranked`. Current text says *"often NOT the same as BOARD ID"* and cites that pairing; the worked header in the prompt's appendix uses `nfl-ranked` for the prefix, not `nfl-games`. Verified 2026-08-28. |
| D1 header | Collects no `COLLECTION TITLE`, though item 1 requires setting `collectionTitle` before the first import. E1 already carries such a field, so the shape exists. |
| D1 header | Collects no `RULESET PREFIX`. It is a free choice, not derivable from `SOURCE DASHBOARD`, and item 2's refusal is unavoidable without it. |
| D1 item 2 | Says "declare the version the exports will carry" — worth adding that the id is `rulesetPrefix` joined to the stamp, and that `kind` is the consequential part, since it decides whether movement across the boundary is suppressed, retained, or history recomputed. |

### For `backend/standings/README.md`

| Where | Finding |
|---|---|
| The `undeclared_ruleset` example | README shows *tried "nfl-ledger-v1.0"* — one candidate. The script tries the **bare stamp first, then the prefixed form**, and the message names both. The example understates what you will actually see. |
| The step-4 example export | Shows `Position,GameId,Matchup,…`, but the Games export shape documented in `import-ranked-boards.js` is `Position, Date, Matchup, Winner, WinScore, Spread, Total, FinalValue` — no `GameId`. Since the `idColumn` advice depends on a stable id existing, the two should agree, or the README should say the id column is something the source must be asked to add. |
