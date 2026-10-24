# Worked run — D2, publish a round

**Driven by prompt D2** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and the scripts disagree, the scripts win.
`publish-round.js`, `import-ranked-boards.js`, `generate-standings-cards.js` and
`generate-methodology.js` are authoritative.

**Applicable project: `TEMPLATE-TEST-LEDGER`.** It is the one target with rounds
already published, and it has a wrinkle worth showing rather than hiding: its
`boards.json` declares **three ranked boards with no exports behind them**, while its
four **community** boards are current. So this run exercises the case where part of the
declared set publishes nothing — which is a warning, not a failure, and looks alarming
the first time.

---

## SAMPLE HEADER

### D2 — Publish a round

```
I want to publish a round of standings.

COLLECTION:   TEMPLATE-TEST-LEDGER
BOARD(S):     all
EXPORT DATE:  2026-08-23
PATH:         import
```

---

## PART 1 — RUNBOOK

### 1. Move the export in, with its date in the filename

```
backend/standings/_input/boards/<filePrefix>-2026-08-23.csv
```

**This is a manual step, and the date in the filename is what places the round in the
movement replay** — not the file's mtime, so a copied or restored export keeps its
position. The prefix must match the declaration's `filePrefix` exactly;
`import-ranked-boards.js` selects files by `startsWith(filePrefix)` and `.csv`.

**In this collection right now, `_input/boards/` is empty.** The three declared ranked
boards — `music-ranking`, `movies-ranking`, `tv-ranking` — will each log:

> `No exports matching prefix "music-ranking" in boards/ — board not published this run.`

and the run ends with the hint *"Put dated exports in boards/ matching each
declaration's filePrefix."* Nothing failed. The four community boards
(`community-points`, `community-avg`, `community-hitrate`, `community-edge`) were
built by `import-community-boards.js` (prompt D3) and are picked up in step 2
regardless.

### 2. Run the wrapper

```
node backend/scripts/publish-round.js
```

It wraps three scripts, in the only order they may run:

```
import-ranked-boards.js  →  backend/standings/<boardId>.json
generate-standings-cards.js  →  content-registry.json + standings.json
generate-methodology.js  →  methodology.json
```

**Why a wrapper and not a checklist:** these three never run in a different order and
never run alone, and `generate-methodology.js` is the one people forget — which leaves
the site describing the previous round's rules while the standings are current. A step
that cannot be skipped beats a checklist item that can be ticked without being done.

**It does not swallow output.** Each step inherits stdio, so every JSON log line still
reaches the terminal; those lines are the audit trail.

**It stops at the first failure**, exiting with that step's own code — a refused import
must not flow into published artifacts.

`--from standings` skips the import, for a hand-written one-off with no export (prompt
E5). Other flags pass through to every step, so `--allow-incomplete` still reaches
`generate-standings-cards.js`.

### 3. Every artifact written

| Path | What |
|---|---|
| `backend/standings/<boardId>.json` | One per board with a matching export. |
| `backend/content-registry.json` | `STANDINGS-` cards rewritten; everything else carried through. |
| `frontend/public/content-registry.json` | The copy the site reads. |
| `frontend/public/standings.json` | The published boards, evidence objects included. |
| `frontend/public/methodology.json` | The rules the current round was scored under. |

### 4. The three refusals, and why each is right

**`capture.complete: false` is a hard failure.**

> `<file>: capture.complete is false. A response that was never captured is
> indistinguishable from a participant who did not play…`

Fix the capture and re-run, or pass `--allow-incomplete`, which publishes the affected
cards **`INACTIVE`** rather than as a final standing, logs a warning, and counts them
in `incompleteBoards`. The card still carries `captureComplete` so the state is visible
in the data. The refusal is right because the failure it prevents is invisible
downstream: a missing response and a non-participant look identical once published.

**Entries not in rank order are refused.**

> `<file>: entries are not in rank order (rank 4 follows rank 6)…`

That usually means the list was re-sorted by score after ranking, which breaks the
movement column. **Note the limit honestly: this catches a shuffled file, not a wrong
one.** Nothing verifies that rank 1 is actually the best entry — the check is that the
sequence is monotonic, not that it is correct.

**A ruleset the exports carry but `rulesets.json` does not declare** stops the import,
naming both candidates it tried. An unfamiliar build becomes a decision rather than
something stamped with a stale value.

### 5. Card ownership

`generate-standings-cards.js` rewrites **every card whose id starts with
`STANDINGS-`** and carries every other card through untouched.
`generate-content-registry.js` (prompt C1) does the mirror image: it owns the cards in
`textcards.csv` and leaves persistent cards alone. Between them the two scripts own
`content-registry.json` completely, with no overlap.

- **A `STANDINGS-` card must never be hand-edited** — the next run overwrites it,
  silently. Edit the board file and re-run.
- **A persistent card with any other id is yours to edit directly**, and no script
  touches it.

### 6. Two behaviours that look like bugs

**A `cardLimit` of 10 can publish 12 rows.** The card shows the top of a board, and the
slice **extends through the whole tie group** rather than cutting a tie in half. The
truncation note says so. Cutting a tie would publish a ranking the board does not
support.

**Deleting a board file marks its card `ARCHIVED`** — status set, `updatedDate`
stamped — rather than removing it. A finished contest stays readable, and a card
already `ARCHIVED` is left alone.

### 7. Commit and push

```
git add backend/standings backend/content-registry.json frontend/public
git commit -m "Publish round 2026-08-23"
git push
```

Then confirm Netlify finished **before** checking the live site — a hard refresh
against a build still running shows the previous round and looks like a failure.

---

## PART 2 — DISPOSITION TABLE

| # | File | Path | Disposition | What goes where |
|---|---|---|---|---|
| 1 | Round export | `backend/standings/_input/boards/<prefix>-2026-08-23.csv` | **Created** (moved in by hand) | `Position` first; the filename's date places the round. Empty in this collection today. |
| 2 | Board declarations | `_input/boards.json` | Read only | Three ranked declarations; `filePrefix` selects the exports. |
| 3 | Rulesets | `_input/rulesets.json` | Read only | v1.2 / v1.3 / v1.4. An undeclared version stops the run. |
| 4 | Wrapper | `backend/scripts/publish-round.js` | Run | Three steps, first-failure exit, flags passed through. |
| 5 | Ranked boards | `backend/standings/<boardId>.json` | **Generated** — output only | Only for boards with a matching export. |
| 6 | Community boards | `backend/standings/community-*.json` | Read here | Built by D3; picked up by step 2 of the wrapper. |
| 7 | Content registry | `backend/content-registry.json` | **Edited by generator** | `STANDINGS-` cards rewritten; all others untouched. |
| 8 | Frontend registry | `frontend/public/content-registry.json` | **Generated** (copy) | |
| 9 | Standings artifact | `frontend/public/standings.json` | **Generated** | Carries the evidence objects. |
| 10 | Methodology | `frontend/public/methodology.json` | **Generated** | The forgotten step the wrapper exists to force. |

---

## PART 3 — REFUSALS

1. **`capture.complete: false`** — hard failure; `--allow-incomplete` publishes
   `INACTIVE` for review instead.
2. **Entries out of rank order** — refused, naming the two ranks. Catches a shuffled
   file, not a wrong one.
3. **An undeclared ruleset** — refused, naming what it tried.
4. **The wrapper stops at the first failure** and exits with that step's code.
5. **A board with no matching export is skipped with a warning**, not an error — and
   not published this run.
6. **`STANDINGS-` cards are never hand-editable** in any lasting sense.
7. **A deleted board is archived, never deleted** — `textCardId` is permanent.
8. **The card slice never cuts a tie group**, even when that exceeds `cardLimit`.

---

## PART 4 — VERIFICATION CHECKLIST

**Before**

- [ ] Export filename carries `2026-08-23` and starts with the declaration's `filePrefix`.
- [ ] Its `AppVersion` — or the `rulesetVersion` fallback — is declared in `rulesets.json`.
- [ ] Board file entries are in ascending rank order.
- [ ] `capture.complete` is honestly `true`, or you have decided to use `--allow-incomplete`.

**During**

- [ ] All three steps report success — read the log lines, don't assume.
- [ ] Any "No exports matching prefix" warnings are boards you *expected* to skip.
- [ ] `incompleteBoards` is `0`, unless `--allow-incomplete` was deliberate.

**After**

- [ ] Round count on each published board is what you expect.
- [ ] Movement looks right — and is absent on round one, correctly.
- [ ] A card showing more rows than `cardLimit` is a tie group, and its truncation note says so.
- [ ] No `STANDINGS-` card was hand-edited before this run.
- [ ] `git add backend/standings backend/content-registry.json frontend/public`, commit, push.
- [ ] Netlify finished **before** you check the live site.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `EXPORT FILE` | D2 collects `EXPORT DATE` but not the file, and the runbook's first step is moving a specific file into `_input/boards/`. The date alone does not name it. |
| `ALLOW INCOMPLETE?` | A real decision with a published consequence (`INACTIVE` rather than final). Not collected, so the runbook can only describe the flag. |
| `RULESET VERSION` | Whether this round's export carries a new build. If it does and it is undeclared, the run stops at step one. |
| `SEASON ID` | Boards carry it; D2 does not collect it and does not need to when `import-config.json` is set — worth saying so rather than leaving it ambiguous. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| D2 header | Collects `EXPORT DATE` but not `EXPORT FILE`, though step one is moving a named file. |
| D2 cover items | Nothing covers the **board declared with no matching export** — the commonest state in a collection that has more declarations than rounds. It logs a warning and publishes nothing, which reads as failure. Worth one line naming the message. |
| D2 cover items | The refusal list is `capture.complete`, rank order and rulesets — worth adding that `--allow-incomplete` is **passed through by the wrapper** to the step that honours it, since the flag is documented on `generate-standings-cards.js` and typed on `publish-round.js`. |
| D2 cover items | The rank-order refusal already admits it "catches a shuffled file, not a wrong one" — the same honesty is worth extending to `capture.complete`, which is an assertion no script can verify. |
