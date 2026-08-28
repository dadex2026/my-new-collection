# Worked run — E3, Index Portfolio path

**Driven by prompt E3** in `docs/generation-prompts.md`, on the branch where the
target *is* the scoring dashboard. The sibling of `docs/worked-run-e3.md`, which
runs the same prompt on the collection path.

**Not a source of truth.** Where this file and the tool disagree, the tool wins.
`Dashboards\Index Portfolio\prompts\leaderboard-paste-prompt.md`,
`CONTEST_RUNBOOK.md` and `scripts\leaderboard.py` are authoritative.

Every path, filename, field name and rule below was read from disk. Contest values
are read from the live `dashboard/public/data/contests/IDX_30D_0923.json`, whose
`field` array has **six** members — `CONTEST_RUNBOOK.md` Phase 1 and E2's worked
header both show a shorter illustrative field for the same id, and the JSON is the
only authority; the `X POST` URL
is the one invented value.

---

## SAMPLE HEADER

### E3 — Capture a thread and extract rows

The one step with a deadline, and the only one that cannot be redone. Everything else
is re-runnable; a thread captured three days late cannot be un-captured.

```
I want to capture an X contest thread and turn it into rows.

TARGET:            Index Portfolio
SCORING DASHBOARD: Index Portfolio
CONTEST ID:        IDX_30D_0923
CONTEST TYPE:      pick the winner
LOCK TIME:         2026-08-24T20:00:00-05:00
X POST:            https://x.com/dadex2026/status/1959876543210987654

 — fill the one that matches the path —
THE FIELD:         US_TECH_10, US_REIT_8, CRYPTO_L1, MULTI_STRATEGY_FUNDS_6,
                   MEME_COIN_5, COMMODITY_5

Give me the capture-and-extract runbook.
```

**Notes on the filled values:**

- **TARGET and SCORING DASHBOARD are the same value, and that is correct here.** This
  is the case E3's gloss means by *"same as TARGET only when the target IS the
  dashboard."* Index Portfolio scores its own contests; there is no second object.
  On the collection path they must differ.
- **CONTEST ID is the `id` inside the contest JSON**, character for character —
  `dashboard\public\data\contests\IDX_30D_0923.json`, whose filename must match the
  id inside it. Rows whose contest label doesn't match exactly are **rejected and
  reported**, not guessed at.
- **CONTEST TYPE is `pick the winner`** because the contest's `scoring_mode` is
  `categorical`. This decides whether `Predicted %` is scored or ignored — get it
  wrong and every row is still valid, just scored on the wrong axis.
- **LOCK TIME must equal the JSON's `lock_at`**, offset included. Two places now hold
  the same instant; the JSON is the one the engine reads, so a mismatch means the
  header is lying about what the engine will enforce.
- **THE FIELD is copied from the contest JSON's `field` array**, not retyped. It is
  the whitelist the extractor may pick from.
- **X POST is the invented value here** — and it is a *copy*: the contest JSON's
  `post_url` is the source of truth, written by E2's `--record-url`. If `post_url`
  is null, stop and finish E2 rather than typing a url into this header.

### Which line takes which value

The collection path's disambiguation inverts here. **Everything is in one project**:
the contest JSON, the extraction prompt, the CSV, the script and the outputs all live
under `Dashboards\Index Portfolio`. Nothing is read from a collection, because there
isn't one.

| What you notice | What happened |
|---|---|
| You are looking for a paste box | Wrong path. Rows are **saved to a file** here, not pasted into a tool. |
| The prompt asks for a Sport/Event label | Wrong prompt — that is the Sports Ledger's community leaderboard prompt, on the collection path. |
| You are about to type a result column | There isn't one. The project records index levels daily and settles the contest itself. |
| TARGET and SCORING DASHBOARD differ | Then this is not the Index Portfolio path. |

---

## PART 1 — RUNBOOK

**Path declaration: this is the INDEX PORTFOLIO path.** Vocabulary: *contest JSON*,
*the field*, *rows*, *CSV*, *the script*. Not the collection path — there is no Ledger,
no paste box, no Sport/Event label, and **re-running rebuilds rather than appends**.

### A. Before the lock

1. **Open the contest file** `dashboard\public\data\contests\IDX_30D_0923.json` and
   copy `field` and `lock_at` from it. These are the two values that must not be
   retyped: `field` is the extractor's whitelist, `lock_at` is the whole basis of
   lateness enforcement.

2. **Confirm `scoring_mode`** — `categorical` → CONTEST TYPE is `pick the winner`;
   a numeric contest is `call the number`, where a reply with no number is still
   extracted with the field left empty and scored zero *visibly*, which is fairer than
   dropping it.

3. **Open both capture surfaces now**, because they are two different URLs:
   - `https://x.com/<you>/status/<id>` — the replies
   - `https://x.com/<you>/status/<id>/quotes` — the quote posts

### B. At the lock — 2026-08-24T20:00:00-05:00

4. **Capture at the lock moment.** Here is the reason this path is *more* exposed than
   a sports thread, in `CONTEST_RUNBOOK.md`'s own words: a football result exists for
   one instant, but a 30-day index return is publicly checkable the entire time the
   window is open. Anyone can look up what `US_TECH_10` did and reply with the answer.

   The engine's defence is `lock_at` — a pick posted after it scores zero and forfeits
   its engagement bonus. But that defence rests on the post timestamps being real,
   which gives the shortcut the runbook states outright:

   > **Capture at the lock moment and everything in the capture is pre-lock by
   > construction.**

5. **Capture BOTH surfaces.** Quote posts do not appear in the replies view. Beyond
   losing those entrants outright, a handle who used *both* channels earns the **+20
   combined bonus**, and that can only be detected if both posts are in what you paste
   — so a replies-only capture specifically penalises the group you rewarded.

   Three ways, from `CONTEST_RUNBOOK.md` Phase 3:
   - **A. Manual copy-paste.** Expand everything in both views, select all, copy. The
     catch: copied text usually carries relative times ("2h"), so `Posted At` is left
     empty and lateness rests on capture timing.
   - **B. Chrome automation.** Reads each post's `<time datetime="…">` attribute, so
     `Posted At` carries real ISO timestamps and lateness becomes verifiable rather
     than assumed. Ask at the lock time, with the post URL.
   - **C. Save both pages** (Ctrl+S, "Webpage, Complete") for a durable record when
     you cannot capture live.

6. **Expand everything** — every "Show more replies," every "Show additional replies,
   including those that may contain offensive content," in both views, until nothing
   expands. Difficulty weighting divides hits by settled predictions; skipping replies
   you judge marginal shrinks that denominator and inflates everyone else's multiplier.
   A partial capture does not just lose those people, it distorts the scores of
   everyone who is in it.

7. **Optionally restrict replies on the X post** — manual, in X's interface, the only
   real close.

### C. Extraction

8. **Open `prompts\leaderboard-paste-prompt.md`. It has three blanks**, all filled
   before you paste anything:

   | Blank | Value | Why it is a blank |
   |---|---|---|
   | CONTEST ID | `IDX_30D_0923` | Character for character. A non-matching label is rejected and reported. |
   | THE FIELD | the six ids, one per line | The extractor may only output a pick from this list. |
   | CONTEST TYPE | `pick the winner` | Decides whether `Predicted %` is scored or ignored. |

   Both of the first two exist for one reason the prompt states plainly: to stop the AI
   inventing labels, *which is what silently splits one person's record in half.*

9. **The AI extracts only.** It never scores, never ranks, never decides who won.
   Closeness, difficulty, the virtual trade adjustment, the engagement bonus, edge and
   the standings all run in tested Python when you run the script, against this
   project's own recorded index history. The prompt's final validation refuses any
   score, rank, confidence or commentary column in the output.

10. **Row format — seven comma-separated fields, empty ones keeping their commas:**

    ```
    Handle, Contest, Pick, Predicted %, Post Type, Posted At, Virtual Trade
    ```

    ```
    @AlphaPicks, IDX_30D_0923, US_TECH_10, , quote, 2026-08-24T14:31:00-05:00, 50
    @SharpSam, IDX_30D_0923, CRYPTO_L1, , reply, 2026-08-24T15:02:00-05:00, 100
    @ValueHunter, IDX_30D_0923, US_REIT_8, , reply, 2026-08-24T15:40:00-05:00,
    @QuietCarl, IDX_30D_0923, COMMODITY_5, , reply, ,
    ```

    **The parser pads and truncates silently, so the seven-field rule is a
    convention the tool does not enforce.** `leaderboard.py` rejects a row with
    fewer than 3 fields and names the reason; **3 to 6 fields are padded with
    empties, and 8 or more are truncated to 7 — both without a word.** So a row
    that dropped `Virtual Trade` scores with the stake quietly gone, and a stray
    comma costs the last field. Count the fields before pasting; nothing
    downstream will.

    - **There is no result column, and that is the defining difference from the Ledger
      path.** The project records every index level and constituent price daily, so the
      script reads the real return over the window and settles the contest itself.
      Nothing to type, nothing to argue about.
    - **Predicted %** is empty on every row here because this is `pick the winner` —
      the commas stay. In a `call the number` contest it is a bare number: `6.5`, never
      `6.5%`, never `+6.5%`; negatives fine.
    - **Post Type** is exactly `reply` or `quote`. If you cannot tell, write `reply` —
      never award the quote bonus on a guess.
    - **Posted At** is `YYYY-MM-DDTHH:MM:SS+HH:MM`, or a bare date, or **empty**. Never
      estimated: an empty value is handled correctly, a made-up one is not. Empty rows
      score normally, flagged `TIME?` and unverified.
    - **Virtual Trade** is a bare integer 1–100, and only when the reply states an
      amount. "Conviction", "all in", "lock", "hammer", "easy money" and "size up" are
      not numbers.
    - **One handle, several picks:** output each on its own line in posting order. Do
      not choose. The engine keeps the **earliest** and marks the rest `SUPERSEDED` —
      a contest asks one question at one moment. (This is the opposite of the sentiment
      engine, where the latest call wins.)

11. **Save to `data-input\predictions\IDX_30D_0923.csv`** — named exactly after the
    contest id. A header row is fine; the parser recognises and skips it.

### D. Running it

12. **Run the script:**

    ```
    py scripts\leaderboard.py --id IDX_30D_0923
    ```

13. **Nothing is dropped in silence.** Per contest you get counts of rows settled,
    pending, late, superseded and invalid, then a line per problem row naming the line
    number and the reason — a pick not in the field, a contest label that doesn't
    match, a `$` in the trade column. Fix those lines in the CSV and run again.

14. **Re-running is always safe, and this is the OPPOSITE of the Ledger path.** Every
    output is rebuilt from the contest definition and the CSV each time, so correcting
    a row and re-running *replaces* the old result. On the collection path, re-pasting
    *adds* rows and the duplicates land inside the median and the difficulty
    denominator. Same prompt, opposite reflex — carrying the Ledger's caution here
    wastes time, carrying this path's confidence there corrupts a round.

15. **Keep the daily run going and re-run on `resolve_date` (2026-09-23).** The window
    resolves only when there is a recorded close on or before both ends of it, for
    every member of the field.

### E. Completeness

16. **There is no `capture.complete` flag on this path.** It does not exist anywhere in
    Index Portfolio — it belongs to the collection/standings side. What stands in for
    it here is weaker and worth stating plainly: `lock_at` scores late picks zero, and
    the run summary tells you what it rejected. Neither can know about a reply you
    never captured. The completeness of the capture is still your assertion; it simply
    has nowhere to be recorded, so if the capture was partial, say so wherever the
    standing is published rather than assuming the engine will flag it.

---

## PART 2 — DISPOSITION TABLE

| # | File / surface | Path | Disposition | What goes where |
|---|---|---|---|---|
| 1 | Contest definition | `dashboard\public\data\contests\IDX_30D_0923.json` | **Read** (edited only to fill `post_url`) | Supplies `field`, `lock_at`, `scoring_mode`, `resolve_date`. Filename must match the `id` inside. |
| 2 | Extraction prompt | `prompts\leaderboard-paste-prompt.md` | Read, not edited | Three blanks: CONTEST ID, THE FIELD, CONTEST TYPE. |
| 3 | The X post | `https://x.com/…/status/<id>` and `…/status/<id>/quotes` | Captured; optionally edited by hand | Two separate surfaces, one pool. Only edit is the manual reply restriction. |
| 4 | Captured material | in-session | Transient | Replies + quotes combined before extraction. |
| 5 | Predictions CSV | `data-input\predictions\IDX_30D_0923.csv` | **Created** — this is the deliverable of the capture | Seven fields per row, empty fields keeping commas. Named exactly after the contest id. |
| 6 | `scripts\leaderboard.py` | run, not edited | Generates | Reads #1 and #5, settles from recorded history, rebuilds every output. Re-running replaces. |
| 7 | Run report | stdout | Generated | Settled / pending / late / superseded / invalid counts, then a line per problem row. |
| 8 | Overrides | `data-input\predictions\overrides\` | **Not touched** | Manual result files for data emergencies only. |

---

## PART 3 — REFUSALS

1. The AI extracts only — no closeness, difficulty, edge, points or ranking, and no
   score, confidence or comment column.
2. No pick outside THE FIELD, and no near-miss mapping — "the tech one" is a pick only
   if exactly one tech member exists and there is no ambiguity.
3. No invented handles; the display name if no handle is visible.
4. No estimated `Posted At`. Empty is safe, invented is not.
5. No Virtual Trade inferred from confidence language, and no `$` or units.
6. No choosing between one handle's multiple picks — that is the engine's rule to
   apply, visibly.
7. A reply quoting someone else's call without adopting it is context, not a
   prediction.
8. A replies-only capture is not a complete capture.
9. The capture is not deferred past the lock time — and here the answer is checkable
   the whole time the window is open.

---

## PART 4 — VERIFICATION CHECKLIST

**Before the lock**

- [ ] TARGET and SCORING DASHBOARD both read `Index Portfolio` — the one case where they match.
- [ ] CONTEST ID matches the JSON `id` and the JSON filename, character for character.
- [ ] LOCK TIME equals the JSON's `lock_at`, offset included.
- [ ] THE FIELD copied from the JSON's `field` array, not retyped.
- [ ] CONTEST TYPE matches `scoring_mode` (`categorical` → pick the winner).
- [ ] Both capture URLs open, including `/quotes`.

**During capture**

- [ ] Captured at `lock_at`, not after.
- [ ] Both views expanded until nothing expands.
- [ ] Capture method recorded — if manual copy-paste, expect empty `Posted At` and know lateness rests on capture timing.

**Before running**

- [ ] Seven comma-separated fields per row; empty fields kept their commas.
- [ ] Every `Contest` value identical and equal to the CONTEST ID.
- [ ] Every `Pick` appears in THE FIELD exactly as written.
- [ ] `Predicted %` and `Virtual Trade` are bare numbers or empty — no `%`, no `$`, no words, no decimal in Virtual Trade.
- [ ] `Post Type` is exactly `reply` or `quote`.
- [ ] Multiple picks by one handle are separate rows in posting order.
- [ ] No score, rank, confidence or commentary column anywhere.
- [ ] File saved as `data-input\predictions\IDX_30D_0923.csv`.

**After running**

- [ ] Run report read, not skimmed — every invalid and late row accounted for.
- [ ] Flagged rows fixed in the CSV and the script re-run (safe, rebuilds).
- [ ] Superseded rows are the ones you expect, and the **earliest** call is the one that counted.
- [ ] Re-run scheduled for `resolve_date` 2026-09-23.

---

## PART 5 — MISSING INPUTS

| Field | Status |
|---|---|
| `X POST` | The one invented value. Copy it from the contest JSON's `post_url`, which is the source of truth on this path; an empty `post_url` means the launch step (E2) was never finished. |
| `CAPTURE METHOD` | Not collected by E3. It determines whether `Posted At` is real or empty, which is the difference between verifiable and assumed lateness. Worth an E3 field. |
| `SCORING MODE` | Not collected; CONTEST TYPE must be derived from the JSON's `scoring_mode`. Fine, but the derivation is unstated. |
| `CAPTURE_COMPLETE_OWNER` | Moot here — no such flag exists on this path. See finding below. |

---

## APPENDIX — NEW FINDINGS FOR `docs/generation-prompts.md`

Not yet applied.

| Where | Finding |
|---|---|
| E3, shared coverage bullets | The `capture.complete` bullet is written as applying to both paths. **It does not exist in Index Portfolio** — no file, script or doc there mentions it. The bullet should be scoped to the collection path, or E3 should say what stands in for it here (`lock_at` plus the run report, neither of which can see an uncaptured reply). |
| E3, new `X POST` field | **Settled and applied.** The contest JSON's `post_url` is the single home on this path — written by `compose_post.py --record-url`, read by `leaderboard.py`, linked from the dashboard, and protected by a refusal to overwrite a differing url without `--force`. E3's `X POST` is copied from there, never a second copy. The rule is now stated in E3's gloss, in E2's record-url bullet, and once in § "The draft is not the post" alongside `postUrl` for the collection path. |
| E3 header, `LOCK TIME` | Same shape of problem: `lock_at` in the JSON is what the engine enforces. E3 should say the header value must equal it. |
| **Settled 2026-08-28.** The illustrative examples in `leaderboard-paste-prompt.md` and `CONTEST_RUNBOOK.md` Phase 1 now use `IDX_30D_EXAMPLE` and `EXAMPLE_INDEX_A/B/C`, so neither can be pasted as a live contest's field. | The live contest JSON for `IDX_30D_0923` has **six** field members. `CONTEST_RUNBOOK.md` Phase 1 and E2's worked header both show **four** for that same id. E3's appendix note (six) matches reality; the two shorter lists are illustrative snippets wearing a real contest's id, which is how someone ends up pasting a four-member whitelist into a six-member contest and silently skipping two indices' worth of replies. Give the illustrative examples a distinct id. |
| `leaderboard-paste-prompt.md` vs `leaderboard-worked-example-numeric.md` | The prompt says to **skip** a reply naming something outside the field; the worked example extracts `@Confused`'s `SPY` row and lets the engine reject it with a reason. Both are defensible — visible rejection beats silent skipping — but they cannot both be the rule. Worth settling in the prompt. |
