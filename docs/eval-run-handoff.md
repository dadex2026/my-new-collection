# Handoff — finish the prompt-eval runs

**For a separate session.** Everything needed is in this file; nothing has to be
reconstructed from a prior chat.

**Method:** `docs/prompt-eval-protocol.md` in `TEMPLATE-OPEN-EDITION`. Read it before
scoring. This file is the work order, not a replacement for it.

---

## 1. Where things stand

**The prompt library is complete and evidenced.** All 28 prompts in
`docs/generation-prompts.md` (A1–A7, B1–B2, C1–C2, D1–D3, E1–E6, F1–F2, G1–G5, H1) have
a filled sample header and a full worked run in `docs/worked-run-*.md` — 29 files, the
extra being `worked-run-e3-index.md` for E3's second path. Those were built by reading
the code and comparing, which tests the **prompts as written**.

**The eval tests the other direction**: paste a prompt cold and see whether the answer
resembles its worked run. Where they diverge, the prompt is presumed at fault.

| Run | Status |
|---|---|
| E3 / mode A | **Non-conformant — re-run.** Findings stand; the row does not |
| E3 / mode B | **Non-conformant — re-run.** See below |
| **C1 / mode A** | **Not run** |
| **C1 / mode B** | **Not run** |
| **D1 / mode A** | **Not run** |
| **G5 / mode A** | **Not run** |

Four runs to go, and E3 wants redoing — see the next paragraph. The protocol's recording
table asks for C1 A+B, E3 A, G5 A; D1/A is an optional fifth that covers the two-folder
case.

**Why the E3 rows do not count.** Both ran inside one conversation — mode B first, then
the folder was granted and E3 was re-answered in the same chat. That breaks rule 1 and
the definition of mode A, and the mode A answer explicitly corrected the mode B answer,
which no fresh session could do. **The findings survive** and need no re-derivation:
`leaderboard.py` line 435's `parts += [""] * (len(EXPECTED_FIELDS) - len(parts))` was
read from the code, and the paste prompt's "two blanks" was three. **The rows do not
survive** — re-run both for conformant ones, or mark them non-conformant in the
recording table and leave them.

E3/B's finding was recorded as an *id-convention documentation gap*. `CONTEST_RUNBOOK.md`
now documents that convention at lines 32–36 — *"The id's date suffix is the resolve
date, not the lock date… an id whose suffix looks 'wrong' against `lock_at` is usually
right, and the only way to be sure is to read `resolve_date` in the file"* — because that
paragraph was written in response to the finding.

**The finding is probably real and closed; the re-run confirms rather than adjudicates.**
No direct proof exists: `Dashboards` has a single commit, so git cannot date the lines,
and neither backup under `Index Portfolio\backups\` contains the file — the
`pre-utf8-fix-2026-08-23` folder holds three `.py` files, and the Aug-19 zip's only
markdown is `OPERATIONS_GUIDE.md`, `README.md` and `AI_RESEARCH_PROMPT.md`. The
circumstantial evidence points one way: `CONTEST_RUNBOOK.md`'s mtime is **2026-08-28
14:20**, while its siblings sit between 08-21 and 08-24 — the one exception being
`CAPTURE_RUNBOOK_IDX_30D_0923.md` at 14:18, **which that same E3/A pass created** (28.5 KB,
still in `Index Portfolio\`). Mode B ran before those writes and the mode A read came
after. That is consistent, not dispositive: an mtime dates the file, not the lines, and
both timestamps are artifacts of the run rather than independent witnesses to it.

**So E3/A is non-conformant on two counts, not one:** contaminated context *and* a mutated
target. Writing that capture runbook into the project folder is the same breach as the
G5 incident under rule 7, smaller and non-destructive — the file is a legitimate product
of that pass, and the objection is that a run produced it at all. So if the re-run complains against
the current text, book it as an answer fault; if it does not, the original finding stands
as real and closed.

---

## 2. Rules that decide whether a run is worth anything

1. **One prompt per chat, fresh.** A second prompt in the same conversation inherits the
   first's assumptions and the answer looks better than the prompt deserves.
2. **Paste the block below verbatim.** Each has been diffed against its worked run's
   SAMPLE HEADER, value for value. Do not improve the wording. **`docs/worked-run-*.md`
   is the fixture of record** — if `generation-prompts.md`'s worked-headers appendix ever
   shows a different fixture for the same prompt, the worked run wins for evaluation
   purposes and the disagreement is a backlog item, not something to reconcile mid-run.
   For D1 the two agreed as of 2026-08-28.
3. **Grant exactly the folders listed.** Grant one where a prompt spans two and you have
   run mode B without meaning to.
4. **Mode A ends with the do-not-open line; mode B omits that line.** The rule bars the
   instruction, **not header values** — `IMAGE: /images/announcements/sample-campaign.png`
   stays exactly as written, because it is one of the inputs under test. Stripping it
   would break rule 2. What must not appear in mode B is any sentence *pointing the
   model at repository files*, which tells it they exist and cues the refusal mode B is
   there to catch.
5. **Do not "fix" the two G5 tensions.** They are documented probes; see §4.
6. **Read the whole answer before opening the worked run.** Comparing as you go turns
   scoring into pattern-matching against a document you already believe.
7. **A run produces text, never a change.** The runner describes what it would do and
   edits nothing — no file written, created, moved or generated, no command run that
   changes state. What is being tested is the *runbook*, and a runner that carries the
   runbook out has destroyed the thing under test while also touching real files. If a
   run is delegated to anything that could act — an agent, a tool-using session, a
   sub-task — say so explicitly in the instruction: **describe, do not do.**

   **This has already happened once.** On 2026-08-28 a G5 run was delegated without that
   instruction and the runner built the tool: `Racing Ledger`, 66 KB of single-file HTML
   plus five documents and a test harness, written into `Dashboards\`. Nothing was
   overwritten and it was quarantined to `Dashboards\_to_delete\`, but the run was
   unscoreable and the folder needed cleaning up. G5 is the prompt most exposed to this,
   because *"I want to build the tool itself"* reads as a work order — which is now
   booked as a finding against G5 in `open-items.md`.

---

## 3. The four blocks

### C1 / mode A — grant `TEMPLATE-OPEN-EDITION`

```
I want to publish a new text card.

COLLECTION:   TEMPLATE-OPEN-EDITION
CATEGORY:     ANNOUNCEMENT
HEADLINE:     Sample Campaign Rewards Are Live
SUBHEADLINE:  Ten rewards — one per wallet
CONTENT:      Holders of SAMPLE-001 can now claim their reward free, ten
              available, one per wallet. Connect the wallet holding your
              SAMPLE-001 and the claim button appears on the site.
IMAGE:        /images/announcements/sample-campaign.png
IMAGE ALT:    Sample Item artwork beside a Claim Reward button
FEATURED:     TRUE
EXPIRES:      none

Do not open docs/worked-run-*.md or docs/prompt-eval-protocol.md.
```

### C1 / mode B — grant nothing

Same header, **without the last line**, in a chat with no folder access and nothing else
said:

```
I want to publish a new text card.

COLLECTION:   TEMPLATE-OPEN-EDITION
CATEGORY:     ANNOUNCEMENT
HEADLINE:     Sample Campaign Rewards Are Live
SUBHEADLINE:  Ten rewards — one per wallet
CONTENT:      Holders of SAMPLE-001 can now claim their reward free, ten
              available, one per wallet. Connect the wallet holding your
              SAMPLE-001 and the claim button appears on the site.
IMAGE:        /images/announcements/sample-campaign.png
IMAGE ALT:    Sample Item artwork beside a Claim Reward button
FEATURED:     TRUE
EXPIRES:      none
```

**The only pass condition is that it says it cannot read the files.** Any confident
runbook is the failure, and it will look excellent — a plausible column list, a plausible
generator name, a plausible `set-post-url.js` invocation. Rule 4 of *Filling a prompt
before you paste it* calls an improvised runbook the single most damaging failure
available, because the output looks exactly like a correct one.

### D1 / mode A — grant `TEMPLATE-OPEN-EDITION` **and** `Dashboards\Sports Ledger`

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

Do not open docs/worked-run-*.md or docs/prompt-eval-protocol.md.
```

The worked-headers appendix in `generation-prompts.md` carries the same D1 fixture as of
2026-08-28 — it previously declared `COLLECTION: my-new-collection`, `SEASON ID:
2026-NFL` and an `ID COLUMN: GameId` the importer does not document, and was realigned
when *fixtures target the templates* was decided. Either copy will do; the block above is
the fixture of record.

Two folders because D1's vocabulary lives in one place and its destination in the other:
`backend/standings/` and the import path in the collection, `sports-ledger-v3.5.html` in
the dashboard — which is what makes the header's `v3.5` checkable rather than decorative.

### G5 / mode A — grant `Desktop\Dashboards`

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

Do not open docs/worked-run-*.md or docs/prompt-eval-protocol.md.
```

**Not the template.** The build guide is `Dashboards\new-dashboard-build-guide.md`, its
first instruction is to read `Dashboards\README.md`, and Part 0 draws on all five
existing tools in that folder. The template matters only for one cross-reference to
`docs/new-collection-deployment-guide.md`; grant it too if you want that reachable.

---

## 4. Known results — do not file these as new findings

**G5 collects no `SEPARATOR`.** Step 2's field contract table requires one per paste
target, and the platform does not answer it uniformly (Sports Ledger exports commas, G3
mandates pipes). Already booked in `worked-run-g5.md`'s appendix and in `open-items.md`.
If the fresh chat surfaces it, that is a **hit that confirms the method** — the eval
finding what code-reading found — not a new item. The fix is deliberately **held until
after this run**, because changing a prompt's header fields invalidates any fixture
filled from the old one.

**G5 does not say whether it wants a plan or a built tool** — and on 2026-08-28 a runner
took it as the latter and shipped one. Booked in `open-items.md` as a prompt fault; do
not re-file it. If your run also builds rather than describes, that reproduces the
finding — note it and move on. Rule 7 keeps it from costing anything.

**G5's two header tensions are deliberate probes**, documented in that worked run's
*Notes on the filled values*:

- `RE-RUN SEMANTICS: rebuild` against `KIND: Ledger`. The conventions run the other way
  (guide Part 7: *"Sports Ledger appends. Re-pasting adds rows"*), and they are not
  actually in conflict — rows append to the store while derived outputs recompute. The
  field is there because Part 7 says to **choose it and write it down**, making it the
  first thing the answer must stop on. Scored on stopping, not on which it picks.
- `JOINS?: yes` against a single paste target whose Horse and Jockey are columns of the
  same row. Part 5's better answer — *design the join away with a per-row outcome field*
  — is available. **Pass = reaching that call before building a matcher.** Deciding to
  build one anyway, having asked, still passes. Silently building one fails.

**C1's §H is now verified, not open.** Display order was previously flagged unverified;
it has been confirmed in `frontend/src/ui.engine.ts`, `getVisibleTextCards()` lines
785–789 — featured first, then priority descending, then `publishedDate` descending, and
the sort runs *after* the visibility, tab and search filters. An answer that contradicts
this is a check-5 miss, not an open question.

**D1 now collects `LABEL COLUMN` and `SCORE COLUMN`, and the worked run's Part 5 has
been corrected to match.** Both were added to the prompt after that run was written;
the fixture supplies them, so **a correct answer will not list them under Missing
inputs.** Until 2026-08-28 the worked run's Part 5 still reported both as gaps while its
own header supplied them — scoring check 6 against that copy would have booked a correct
answer as a divergence. If you are working from a copy whose Part 5 still lists
`LABEL COLUMN | Required. Guessable from the export header only by inference`, that copy
is stale; the corrected one carries a **No longer missing** note beneath the table.

---

## 5. Scoring

Seven checks, each pass/fail. The interesting output is *which* failed.

1. **All five parts of the output contract** — numbered runbook, disposition table,
   refusals, verification checklist, Missing inputs.
2. **The branch declared, where the prompt has one.** E3 only; C1, D1 and G5 are `—`.
3. **Every cover item addressed.** Count them in the prompt; find each in the answer.
4. **The named refusals present** — as refusals, not softened into advice.
5. **Exact strings correct** — file paths, flag names, exit codes, column counts, error
   text. **Check at least two against the code**, not against the worked run. This is
   where improvisation hides, and a plausible-looking error message is the tell.
6. **Missing inputs reports the real gaps.** Compare with the worked run's Part 5. A
   *different* set is worth reading twice; it may be right.
7. **Nothing invented.** Grep the repo for any command, flag or file you do not
   recognise.

**Where to point check 5**, so it lands on code rather than prose:

| Run | Check against |
|---|---|
| C1 | `frontend/src/ui.engine.ts` (`getVisibleTextCards`, 785–789) · `backend/scripts/generate-content-registry.js` · `backend/scripts/set-post-url.js` · the 16-column `backend/textcards.csv` header |
| D1 | `backend/scripts/import-ranked-boards.js` — it reads exactly four config keys: `seasonId`, `cardLimit`, `rulesetPrefix`, `rulesetVersion` · `backend/standings/README.md` lines 100–104, where `boardId: nfl-games` pairs with `filePrefix: nfl-ranked` |
| G5 | `Dashboards\new-dashboard-build-guide.md` — Part 5 (joins and loud failure), Part 7 (re-run semantics), Part 11 (the order step 1 works in) |

### Then bucket every divergence

| Bucket | Looks like | Do |
|---|---|---|
| **Prompt fault** | The answer omitted something the prompt never asked for, or invented a value the header never collected | Fix the prompt — register via **H1 step 4**, and add an `open-items.md` row if it is not applied immediately |
| **Answer fault** | The prompt asked, the files said, the answer got it wrong anyway | Note only. If it repeats across runs the prompt is ambiguous rather than the answer careless |
| **Worked-run fault** | The answer is right and the document is stale | Fix the worked run, then check whether the prompt quotes the same stale fact |

Only the first is worth acting on.

---

## 6. Record it

One row per run, appended to the table in `docs/prompt-eval-protocol.md`. The value is
the trend, not the prose.

| Date | Prompt | Mode | Parts | Branch | Cover | Refusals | Strings | Missing | Invented | Prompt faults found |
|---|---|---|---|---|---|---|---|---|---|---|

A clean run means the prompt is carrying its weight — worth knowing, not worth writing
up.

---

## 7. Constraints this session must respect

- **No test or fixture runs in `my-new-collection`.** It is the mainnet reference.
  Decided 2026-08-28. `rulesetPrefix` there stays `CHANGE ME` until a real board is
  declared; that is not an eval task.
- **Run git in `Desktop\Dashboards` from the user's own shell, never through the device
  bridge.** Deletion is not granted for that folder, so every bridge-side git command
  leaves undeletable `tmp_obj_*` files. 272 of them are already there from the initial
  commit (`7216a34`); they are inert, and removing them needs an elevated `takeown`,
  which the user declined. Read-only inspection with `git --no-optional-locks` is fine.
- **A3 is out of scope.** Its worked run exists but has never been executed — it needs
  devnet SOL.
- **`TEMPLATE-OPEN-EDITION` is canonical** for `generation-prompts.md`, the worked runs
  and the protocol. Do not edit a mirrored copy.
- **Two decisions taken 2026-08-28, after v3.** *Fixtures target the templates* — the
  worked-headers appendix in `generation-prompts.md` was realigned to `worked-run-d1.md`
  (template collection, `SEASON ID: 2026`, no stable id, and the header row the importer
  documents), so the two D1 fixtures no longer disagree. *The Sports Ledger will gain a
  stable id column* — agreed but **not built**: it needs a `GameId` column, a new build
  stamp and a new ruleset id, and only then do the fixtures move to `ID COLUMN: GameId`.
  Until it ships, `none` is the truthful value everywhere, and `import-config.json` in
  the template still reads `CHANGE ME` because a declaration change is not the fix.

---

## 8. Done when

- [ ] Four runs completed, one chat each, folders granted as listed.
- [ ] Each scored on the seven checks, with at least two strings per run checked against
      code rather than the worked run.
- [ ] Every divergence bucketed; prompt faults registered through **H1 step 4**.
- [ ] Four rows added to the protocol's recording table.
- [ ] **`SEPARATOR` added to G5's header** — the one held change, released once the G5
      run is scored, registered via H1 like any other prompt edit.
- [ ] Any worked-run fault corrected at the source in `TEMPLATE-OPEN-EDITION\docs`.
