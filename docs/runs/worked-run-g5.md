# Worked run — G5, build the tool itself

**Driven by prompt G5** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** `Dashboards\new-dashboard-build-guide.md` is — G5 names it
as such, and every rule below is quoted or summarised from it rather than invented.

**Applicable project: `Desktop\Dashboards\`.** Header values are the canonical
`Racing Ledger` from the worked-headers appendix.

**G5 is the one prompt that stops for answers.** The guide's Part 11 order has
decision points, and a runbook that silently picks for you has done the wrong thing.
The stops are marked **◆ YOUR CALL** below.

---

## SAMPLE HEADER

### G5 — Build the tool itself

```
I want to build the tool itself, from the build guide.

NAME:              Racing Ledger
KIND:              Ledger
SHAPE:             single-file HTML
WHAT IT SCORES:    Race meetings — horses by finish, jockeys by strike rate
PASTE TARGETS:     Meetings (Horse, Jockey, Track, Finish, Field Size, Date)
RANKS?:            yes — rounds, seasons, movement
JOINS?:            jockey rows must find their horse rows
RE-RUN SEMANTICS:  rebuild
DOWNSTREAM:        a collection's standings
```

**Notes on the filled values:**

- **`RE-RUN SEMANTICS: rebuild` against `KIND: Ledger` is deliberate.** The kinds' own
  conventions run the other way — Part 7 of the guide says *"Sports Ledger appends.
  Re-pasting adds rows"* — and the two are not in conflict here: rows still append to
  the store, while every derived output is recomputed from them. It is written this way
  because Part 7's instruction is to **choose it and write it down**, which makes this
  the first field the answer has to stop on. Step 1 does. Do not "correct" it to
  `append`; that removes the probe.
- **`JOINS?: yes` against a single paste target is also deliberate.** Horse and Jockey
  are columns of the same Meetings row, so Part 5's better answer — *design the join
  away with a per-row outcome field* — is available, and the run is scored on whether
  the answer reaches that call **before** building a matcher. A fixture with two paste
  targets would make the join unavoidable and test less.
- **No separator is declared**, though step 2's field contract table requires one for
  every paste target. That is a finding against the prompt rather than an omission
  here — see the appendix.

---

## PART 1 — RUNBOOK

Working in the guide's **Part 11** order.

### 1. The README first ◆ YOUR CALL

Name the **kind**, the **shape**, the **re-run semantics**, and the **AI/tool
boundary**. *"If you cannot write that page, the design is not settled."*

Drafted for approval before anything else is written:

> **Racing Ledger** — a Ledger: it scores and ranks from pasted input. Single-file
> HTML, offline, no build step. **Re-run semantics: rebuild** — every output is
> recomputed from the stored rows, so a correction replaces a result rather than
> adding one. **The AI extracts; the tool scores.** Every number is computed in tested
> JavaScript from rows you can see and edit.

**◆ Stop here.** `RE-RUN SEMANTICS: rebuild` is declared in the header, and Part 7
says to choose it *and write it down* — because the collection side has both
behaviours and the difference is invisible until someone re-pastes.

### 2. The field contract for every paste target — before any parser

*"The contract is the interface between the model and the tool."*

| Box | Field order | Separator | Malformed line |
|---|---|---|---|
| Meetings | `Horse, Jockey, Track, Finish, Field Size, Date` | comma | rejected whole, naming the line — never partially read |

Date `YYYY-MM-DD`, optional: omit the field rather than leaving it blank. **◆ YOUR
CALL on the separator** — the platform is split (Entertainment uses pipes, Sports and
Index use commas), so this is a decision, not a default. Whatever you pick, the prompt
written in step 8 must state it.

### 3. Data model and persistence — before any scoring

`gatherCurrentState()` / `saveState()` / `loadState()`, and the export payload
carrying its own provenance. Sports Ledger's shape:

```
{ format, label, exportedAt, appVersion, appBuildDate, state, templates }
```

The version fields exist because **a backup that cannot say which build produced it
cannot be safely imported by a later one.**

Import is **additive and recoverable, not destructive**: rows append, never replace.
One exception — a built-in tab whose rows still match the untouched sample data
byte-for-byte is cleared first. A backup carrying no tab definition is **reported as
skipped with the reason**, never dropped silently.

### 4. The restricted arithmetic parser

**Everything routes through it. No `eval` anywhere.** Formulas are data in this
architecture, and data that reaches `eval` is an execution path with a paste box in
front of it.

### 5. One `calcXxx()` end to end

Pure reader → parser → rendering, on **one** tab. *"Prove the loop on one tab before
multiplying it."* For this tool: `calcHorseFinish()`.

### Then write the initial `.html`

Steps 3, 4 and 5 working, plus the bootstrap block, the masthead build stamp, and
enough of the Meetings tab to open the file and paste real input.

**Seed data** goes in a `<script type="application/json">` island **replayed through
the same import path** — a *seed, not an override*, with `localStorage` winning after
first open. Seeding through a different path than real input means the seeded state is
the one state never exercised by the importer.

### Carried in without asking — each is something that already went wrong here

- **The baseline and the rendered board come from the SAME pure reader.** Two readers
  drift, and the drift shows up as a movement column nobody can reproduce.
- **If it ranks** — and this one does: competition ranking, **ties stand**, movement
  **rendered and never invented**, and **the MANUAL-ADD path re-snapshots**, not just
  the paste path. Every clear path takes **explicit snapshot keys, never
  prefix-derived**.
- **If it joins** — and this one does, jockeys to horses: **exact matching with case,
  spacing and punctuation normalised, never fuzzy. Nothing auto-matches.** An unmatched
  row is **named back to you with a suggested fix**.
  **◆ YOUR CALL, and take it first:** can the join be designed away with a per-row
  outcome field instead of two tables? For this tool it probably can — a jockey's
  result is a property of the ride, so one row per ride carrying both names removes the
  join entirely. **Answer this before building a matcher**; the guide's Part 5 exists
  because the matcher is where loud failure gets negotiated away.
- **Settings as standalone variables plus one plain overrides object.** Never
  `Object.assign` over a defaults object containing a nested object — the nested
  object is replaced wholesale, not merged, and the missing keys are silent.
- **Companion files prefixed with the project name, from the first file** —
  `racing-ledger-*`. Retrofitting prefixes after three files is how two projects end up
  with a `guide.md`.
- **Validate syntax and diff the function list after every edit.** In a single-file
  tool an edit that drops a function produces a file that still loads.

### What remains after the first `.html`

| Remaining | Prompt |
|---|---|
| Integrity controls — dedupe, restore baked-in, reset | Guide Part 11 step 6 |
| The other tabs | — |
| The prompts | **G3** |
| The test-data set | Guide step 9 |
| Calculations reference + extraction summary, with an honest *Outstanding* section | Guide step 10 |
| Build stamp, then move any previous build to `_superseded/` | Guide step 11 |
| Registry row | **H1** |

**Verify dedupe against a deliberately doubled dataset**, the way the guide records it
being verified: importing a snapshot into an already-full copy doubled Football
120 → 240 and produced 698 duplicates; **one dedupe run restored it to exactly 120.**
Note the known limit — only exact matches are caught, so a doubleheader with an
identical score reads as a duplicate, while the same teams and date with *different*
scores is correctly left alone as a conflict.

---

## PART 2 — DISPOSITION TABLE

| # | Path | Disposition | What goes where |
|---|---|---|---|
| 1 | `Dashboards\Racing Ledger\README.md` | **Created first** | Kind, shape, re-run semantics, AI/tool boundary. |
| 2 | `racing-ledger-v0.1.html` | **Created** | Bootstrap, masthead stamp, state layer, arithmetic parser, one `calcXxx()`, one tab, seed island. |
| 3 | `prompts\racing-ledger-meetings-prompt.md` | **Created later, via G3** | Must state the separator chosen in step 2. |
| 4 | `test-data\` | **Created later** | Paste sets with verified expected values, plus the doubled-dataset dedupe case. |
| 5 | `racing-ledger-calculations-reference.md` | **Created later** | With an honest *Outstanding* section. |
| 6 | `racing-ledger-extraction-summary.md` | **Created later** | The paste contracts. |
| 7 | `backups\`, `exports\`, `_superseded\` | **Created empty** | Earned per G1. |
| 8 | `Dashboards\README.md` | **Edited** | New row. |
| 9 | `docs/generation-prompts.md` | **Edited via H1** | Registry row + assumption check. |
| 10 | A collection's `_input/` | **Later** | `DOWNSTREAM: a collection's standings` means D1 declares a board and G4 moves the export. |

---

## PART 3 — REFUSALS

1. **No code before the README.** If it cannot be written, the design is not settled.
2. **No parser before the field contract.**
3. **No scoring before the data model and persistence.**
4. **No `eval`, anywhere.** Everything routes through the restricted parser.
5. **No second tab before one `calcXxx()` works end to end.**
6. **No fuzzy matching, and nothing auto-matches** — an unmatched row is named back
   with a suggested fix.
7. **Movement is rendered, never invented**, and the manual-add path snapshots too.
8. **Snapshot keys are explicit, never prefix-derived.**
9. **No `Object.assign` over defaults containing a nested object.**
10. **Import is additive**; a skipped backup section is reported with its reason.
11. **A seed is not an override** — it replays through the import path and loses to
    `localStorage` after first open.

---

## PART 4 — VERIFICATION CHECKLIST

**Before code**

- [ ] README written and approved; re-run semantics stated in it.
- [ ] Field contract table complete for every paste target, separator included.
- [ ] The join question answered — designed away, or a matcher deliberately chosen.

**The first `.html`**

- [ ] Masthead prints version and date.
- [ ] `gatherCurrentState` / `saveState` / `loadState` work; export payload carries `appVersion` and `appBuildDate`.
- [ ] Every formula routes through the restricted parser; `eval` appears nowhere.
- [ ] One `calcXxx()` proven end to end on one tab.
- [ ] Real input pastes and scores.
- [ ] Seed island replays through the import path; `localStorage` wins after first open.
- [ ] Baseline and board read through the same pure reader.
- [ ] Function list diffed after each edit; file still parses.

**Before shipping**

- [ ] Dedupe verified against a deliberately doubled dataset, counts recorded.
- [ ] Manual-add path re-snapshots, tested separately from paste.
- [ ] Ties stand under competition ranking.
- [ ] Companion files all prefixed `racing-ledger-`.
- [ ] Prompts written via G3 and verified against this build.
- [ ] Test-data set with expected values.
- [ ] Calculations reference and extraction summary, with *Outstanding* filled in honestly.
- [ ] Registered via H1.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `SEPARATOR` | The field contract needs one and the platform is split. G5 collects the field order and not the separator. |
| `FIRST TAB` | Step 5 proves the loop on one tab; which one is a real choice when a tool has several. |
| `SEED DATA` | The `.html` ships with a seed island, and nothing collects what it should contain. |
| `VERSION` | The masthead stamp needs a starting version — `v0.1` by G1's fork rule, unstated for a from-scratch build. |
| `CONSUMING COLLECTION` | `DOWNSTREAM: a collection's standings` decides the export's column labels; which collection is uncollected. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| G5 cover items | The join instruction ends *"But first tell me whether the join can be designed away with a per-row outcome field instead of two tables"* — and that question is **last** in the bullet, after the matching rules. It is the decision that determines whether any of them are needed. Worth putting first, as the guide's Part 5 does. |
| G5 header | Collects `PASTE TARGETS ... with the field contract if decided` but never the **separator**, which step 2's contract table requires and which the platform does not answer uniformly. |
| G5 cover items | The dedupe verification is described in the guide with real numbers (120 → 240 → 698 duplicates → 120) **and its known limit** — exact matches only, so an identical-score doubleheader reads as a duplicate. G5 asks for the control without the limit, and the limit is what stops someone trusting dedupe as a conflict detector. |
| G5 cover items | Nothing states the starting version for a from-scratch build. G1's fork branch says `v0.1`; G5 says only "the masthead build stamp". |
| G5 cover items | Worth naming that the seed island's *purpose* is to exercise the import path — otherwise "sample seed data" reads as a convenience and gets loaded directly, which is precisely the case the rule prevents. |
