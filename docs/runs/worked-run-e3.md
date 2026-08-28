# Worked run — E3, collection path (round scored in a Ledger)

**Driven by prompt E3** in `docs/generation-prompts.md`. One complete run of that
prompt on the collection path: the filled header, and all five parts of the output
contract it returns.

**Not a source of truth.** Where this file and the tool disagree, the tool wins.
`Dashboards\Sports Ledger\sports-ledger-v3.5.html` and its
`prompts\sports-ledger-community-leaderboard-prompt.md` are authoritative for the
field contract; E3 itself is authoritative for the header fields.

Every path, filename, field name and build stamp below was read from disk. The one
invented value is the `X POST` URL, marked where it appears.

---

## SAMPLE HEADER

### E3 — Capture a thread and extract rows

The one step with a deadline, and the only one that cannot be redone. Everything else
is re-runnable; a thread captured three days late cannot be un-captured.

```
I want to capture an X contest thread and turn it into rows.

TARGET:            my-new-collection
SCORING DASHBOARD: Sports Ledger (v3.5)
CONTEST ID:        weekly-total-contest
CONTEST TYPE:      call the number
LOCK TIME:         Sunday 31 Aug 2026, 12:00 ET
X POST:            https://x.com/dadex2026/status/1961234567890123456

 — fill the one that matches the path —
EVENT LABEL:       NFL

Give me the capture-and-extract runbook.
```

*(E3's coverage bullets and the five-part output contract are appended from the
prompt block unchanged.)*

**Notes on the filled values:**

- **TARGET is the registry value verbatim** — `my-new-collection`, the Target column
  of the collection registry table. Not `My New Collection`, which is the display
  title `import-config.json` ships as `CHANGE ME`.
- **SCORING DASHBOARD carries its build stamp** — `Sports Ledger (v3.5)`, per Rule 2.
  The version is not decoration: it resolves the source's `AppVersion` into a ruleset
  id, and it is what tells you which extraction prompt is current.
- **CONTEST ID is the boardId** — the same string declared as `BOARD ID` in E1. It is
  not derived from the collection slug; `my-new-collection` and
  `weekly-total-contest` are unrelated strings and both are correct.
- **LOCK TIME carries date, time and timezone.** A bare "12:00" is the silent
  hour-off error on the one step that cannot be redone.
- **X POST is the invented value here** — a placeholder for the real thread URL.

### Which line takes which value

**Every action happens at the SCORING DASHBOARD. The TARGET is read once, for the
contest id, and is not opened again.**

The extraction prompt, the paste box, the Resolve results box, the `capture.complete`
assertion and the G4 export all live at `Dashboards\Sports Ledger`. The collection
`my-new-collection` contributes the contest id and nothing else. Navigating to the
collection to *do* something means the two are the wrong way round.

| What you notice | What happened |
|---|---|
| "There's no `prompts/` folder here." | You are at the TARGET. Collections have no `prompts/` folder and never will. |
| "I can't find the paste box." | Same — the Community Leaderboard tab is in `sports-ledger-v3.5.html`. |
| "The prompt wants a contest id." | Wrong prompt. This path's prompt asks for Sport/Event labels. A contest-id blank belongs to `Index Portfolio\prompts\leaderboard-paste-prompt.md`. |
| "I'm about to save a CSV." | Wrong path. Nothing is written to a file until G4. |
| TARGET and SCORING DASHBOARD hold the same value | Either a mis-fill or you are on the Index Portfolio path, where both read `Index Portfolio`. |

---

## PART 1 — RUNBOOK

**Path declaration: this is the COLLECTION path.** The target is a collection; the
round is scored in the Sports Ledger. Vocabulary: *Sport/Event label*, *rows*, *paste
box*, *Resolve results*, *export*. Not the Index Portfolio path — no CSV, no
`leaderboard.py`, and re-pasting here **adds** rows rather than rebuilding them.

### A. Before the lock (T-15)

1. **Open and leave open:** the X post; its Quotes view; `sports-ledger-v3.5.html` on
   the **Community Leaderboard** tab; and
   `Dashboards\Sports Ledger\prompts\sports-ledger-community-leaderboard-prompt.md`.

2. **Check the masthead reads `build 2026-08-24 · v3.5 · baked-in data <date>`.** The
   prompt states its formulas are verified against that build. If the masthead says
   something else, the scoring explainers in the prompt may not describe the tool you
   are about to paste into. The six extraction fields themselves have not changed
   since v2.6 and are version-independent; it is the explainers that go stale.

3. **Confirm the `max error for this category` value for `NFL` before you capture,
   not after.** It defaults to 30 and is stored against that exact label. Widening it
   makes closeness more forgiving, raises the share of hits, and therefore *lowers*
   everyone's difficulty multiplier in that category. Changing it mid-season
   re-scales rows already banked under that label.

4. **Put the EVENT LABEL on the clipboard, copied not retyped:** `NFL`.

5. **Decide the reference team now if this contest involves a margin or spread.** The
   prompt has a second fill-in block for it, and fixing it once here is what keeps
   the sign convention identical across every row. `call the number` on a game total
   does not need one; a margin contest does.

### B. At the lock

6. **Capture AT Sunday 31 Aug 2026, 12:00 ET.** Not after. X offers no snapshot of a
   past state: between the lock and "later today," entrants delete replies, edit
   posts, protect accounts, and the thread re-paginates so "Show more replies" returns
   a different set. New replies arrive that are not entries. A late capture is not a
   worse capture of the same population — it is a capture of a different one.

   The prompt is blunt about the same thing from the scoring side: nothing in the tool
   prevents a row being added after a result is filled in. *"If you are running a
   contest where this matters, close the reply window and capture the thread before
   the result is public."*

7. **Collect both surfaces.** Replies sit under the post. Quote posts do not appear
   there at all — they are behind the post's Quotes view. Entrants use both without
   knowing there is a difference. A capture missing the quotes is a partial capture,
   and this prompt is explicitly built for both: its title is *"replies and quote
   posts,"* and the seventh field exists to record which one each row came from.

8. **Expand EVERYTHING** — every "Show more replies," every "Show additional replies,
   including those that may contain offensive content," every collapsed sub-thread,
   every truncated reply, and the same passes again in the Quotes view. Stop when a
   full pass adds nothing new.

   **Why skipping the marginal ones is not a small error:** difficulty weighting
   divides hits by settled predictions. Dropping replies shrinks the denominator,
   which makes the surviving predictions look rarer and inflates everyone else's
   multiplier. A partial capture does not quietly lose the people you dropped — it
   changes the scores of everyone still in it.

9. **Optional, and only you can do it: restrict replies on the X post.** The only real
   close. Manual, in X's own interface, from the account that owns the post. The
   deadline in the announcement is a promise enforced by nobody; a reply at 12:01 is
   excluded because you closed your capture.

### C. Extraction

10. **Run `sports-ledger-community-leaderboard-prompt.md`** over the combined replies
    and quotes.

11. **It has two fill-in blocks, not one.**
    - **SPORT/EVENT LABEL(S)** → `NFL`, pasted from the clipboard. One label for the
      whole batch, used identically on every row.
    - **REFERENCE TEAM FOR SPREAD/MARGIN PREDICTIONS** → fill only if predictions are
      margins or spreads; name the team every Prediction and Actual is measured from.
      Leave it out for a total.

    *(E3's collection-path bullet says the prompt's "one blank is the EVENT LABEL."
    That is true for a totals contest and wrong for a margin contest — see the
    appendix.)*

12. **The median is computed per label.** `NFL`, `NFL Week 1` and `nfl` are three
    labels, three populations, three medians, three error scales. Nothing errors,
    nothing warns, both pastes succeed. If the batch spans several events or several
    prop categories, list every exact label in the block up front and let the prompt
    match replies to them — listing props ahead of time is the strongest prevention,
    because props are where the same category gets worded two ways.

13. **The AI extracts only.** It never scores, ranks, or decides who won. The prompt
    enforces this from its own side: its final validation refuses any confidence,
    error, score or ranking field in the output.

14. **Field contract — exactly seven, in this order, comma-separated:**

    ```
    Handle, Sport/Event, Prediction, Actual, Date, Virtual Bet, Post
    ```

    ```
    @AlphaPicks, NFL, 47, TBD, 2026-08-31, 25, Reply
    @DallasDoubter, NFL, 44, TBD, 2026-08-31, , Quote
    @BearsDown85, NFL, 51, TBD, 2026-08-31, 100, Combined
    ```

    - **Handle** — the @username exactly as it appears; the display name only if no
      handle is visible. Never invented.
    - **Sport/Event** — only a label supplied in the block above, character for
      character. A reply whose event cannot be determined is skipped, not guessed.
    - **Prediction** — one plain number.
    - **Actual** — `TBD` at capture time. Never `0` as a stand-in for unknown.
    - **Date** and **Virtual Bet** — each individually optional, never reordered.
      Virtual Bet is an integer 1–100, no `$`, no decimal.
    - **Post** — exactly `Reply`, `Quote` or `Combined`.

    **One person who replied *and* quote posted is ONE `Combined` row, not two.** No
    handle may appear twice for the same Sport/Event, and a Virtual Bet must not be
    duplicated across rows that are really one entry.

    **What a wrong field count does — and it is not a clean error.** A six-field row
    still parses: `Post` was added in v3.5 and appended last precisely so older rows
    survive, and a row without it reads as `Reply` and earns no engagement. So
    dropping the seventh field does not fail; it silently forfeits engagement credit
    for every quote poster in the batch. Reordering is worse — the fields are
    positional, so a shifted row lands a date in `Prediction`. Count the fields, then
    check that field 3 is a number and field 7 is one of the three literals.

### D. Landing the rows

15. **Paste into the Community Leaderboard tab's paste box** in
    `sports-ledger-v3.5.html`. The rows are **not saved as a file at this step** —
    no CSV, nothing on disk. The first dated file for this round is the **G4** export,
    after settlement.

16. **Re-pasting ADDS rows.** Corrections are made by editing or removing rows in the
    tool, never by pasting a fixed copy over the old one — duplicates land inside the
    median and inside the difficulty denominator. This is the opposite of the Index
    Portfolio path, where every output is rebuilt from the contest definition and the
    CSV, so a correction replaces the old result.

17. **`Actual` stays `TBD` until the event settles**, then use the **Resolve results**
    box — one line per event, because a result belongs to the event, not to each
    prediction:

    ```
    NFL, 47
    ```

    First click previews: how many rows would be filled, how many already had results,
    and **any label that matched nothing, named back to you** — which is the one place
    a split label becomes visible. Second click applies. Three lines can resolve two
    hundred pending rows.

18. **Then stop accepting rows for that label.** Pending rows are excluded from every
    ranking until a number is entered; nothing in the tool prevents a row being added
    after the result is filled in. That defence is procedural and yours to enforce.

19. **Export with G4** once settled. That is what produces the dated file.

### E. The completeness assertion

20. **`capture.complete` is your assertion, not a finding.** Nothing here can know
    whether you reached the bottom of the Quotes view; the AI cannot know what it was
    never shown. Set it `false` for any thread you could not fully expand — and
    setting it `false` correctly **refuses to publish a final standing**. That refusal
    is the feature. A final standing computed on a known-partial denominator is wrong
    for everyone in it, in a way nothing downstream can detect.

---

## PART 2 — DISPOSITION TABLE

| # | File / surface | Path | Disposition | What goes where |
|---|---|---|---|---|
| 1 | Extraction prompt | `Dashboards\Sports Ledger\prompts\sports-ledger-community-leaderboard-prompt.md` | Read, not edited | Two fill-in blocks: SPORT/EVENT LABEL(S) → `NFL`; REFERENCE TEAM → only for margin/spread. Verified against build v3.5 (2026-08-24). |
| 2 | Collection | `Desktop\my-new-collection` | Read once, never edited | Supplies `CONTEST ID: weekly-total-contest`. No prompts, no paste box, no rows, no scoring, no export. |
| 3 | The X post | `https://x.com/dadex2026/status/…` | Captured; optionally edited by hand | Replies → thread surface. Quotes → Quotes view. Both feed one pool. The only edit is the manual reply restriction. |
| 4 | Captured material | in-session | Transient | Not a deliverable, not written to disk. |
| 5 | Extracted rows | in-session | Transient | Seven comma-separated fields per row; `Actual` = `TBD`; `Post` ∈ Reply/Quote/Combined. Goes straight to #6. |
| 6 | Community Leaderboard paste box | `Dashboards\Sports Ledger\sports-ledger-v3.5.html` | Edited — rows appended | Destination. Appends; never replaces. Rows group by Sport/Event, which is what the median is computed over. |
| 7 | `max error for this category` | inside #6, per label | Set before capture | Defaults to 30. Decides what counts as a hit, and hits are the denominator of difficulty. |
| 8 | Resolve results box | inside #6 | Used after settlement | `NFL, 47` — one line per event. Preview names any label that matched nothing. |
| 9 | `capture.complete` | round metadata | Set by you | `false` blocks a final standing. |
| 10 | Round export | produced by **G4** | Generated — first dated file | Everything before this lives in the tool, not in a file. |

---

## PART 3 — REFUSALS

1. The AI extracts only — no scoring, ranking, or winner. The prompt's own final
   validation rejects any confidence, error, score or ranking field.
2. No final standing while `capture.complete` is `false`.
3. No invented handles, no reconstructed replies, no guessed labels — a reply whose
   event cannot be determined is skipped.
4. A replies-only capture is not complete.
5. `Actual` is never `0` as a stand-in for unknown, and never guessed.
6. Two entries from one handle for one label are never two rows.
7. Label spellings are not silently normalised across pastes — merging populations is
   a human scoring decision.
8. A sportsbook's posted number is not extracted as somebody's prediction.
9. Replies are not restricted for you; that is manual, in X's interface.
10. The capture is not deferred past the lock time.

---

## PART 4 — VERIFICATION CHECKLIST

**Before the lock**

- [ ] TARGET (`my-new-collection`) and SCORING DASHBOARD (`Sports Ledger (v3.5)`) are different values, and TARGET is the registry value, not the display title.
- [ ] CONTEST ID matches E1's `BOARD ID` character for character.
- [ ] LOCK TIME carries date, time **and** timezone.
- [ ] Masthead reads `build 2026-08-24 · v3.5 · baked-in data <date>`.
- [ ] `max error` for `NFL` confirmed before any rows exist under it.
- [ ] Reference team decided, or confirmed not needed.

**During capture**

- [ ] Reply thread expanded until a full pass adds nothing.
- [ ] Quotes view opened separately and expanded to the same standard.
- [ ] Offensive-content and spam expansions clicked.
- [ ] Capture performed at the lock; start and end times noted.

**Before pasting**

- [ ] Seven fields per row, in order, comma-separated.
- [ ] Field 3 numeric; field 4 numeric or literal `TBD` (never `0`); field 7 exactly `Reply`, `Quote` or `Combined`.
- [ ] Virtual Bet, where present, an integer 1–100 with no `$`.
- [ ] Field 2 identical on every row and identical to the label in the prompt block.
- [ ] No handle twice for the same label; reply + quote merged to one `Combined`.
- [ ] No score, rank, error or confidence column anywhere.
- [ ] Row count reconciles against replies + quotes counted; any gap explained before pasting.

**After pasting**

- [ ] Row count rose by exactly the number pasted (append semantics — no double paste).
- [ ] One Sport/Event group for this round, not two.
- [ ] `capture.complete` set honestly; if `false`, reason recorded and no final standing published.

**After settlement**

- [ ] Resolve results previewed first; **no label reported as matching nothing**.
- [ ] Every `TBD` filled; no pre-existing result altered.
- [ ] New rows for that label stopped.
- [ ] G4 export produced — the first dated file for this round.

---

## PART 5 — MISSING INPUTS

| Field | Status |
|---|---|
| `X POST` | The one invented value in this fixture. Now a real E3 field — supply the thread URL. |
| `REFERENCE TEAM` | Not collected by E3's header, though the extraction prompt asks for it. Needed for any margin or spread contest. Proposed E3 field. |
| `MAX ERROR` | Not collected by E3's header. It is set per label in the tool and silently re-scales difficulty. Worth an E3 field, or at least a checklist line. |
| `VIRTUAL BET POLICY` | Whether this contest accepts Virtual Bets at all. The penalty branch doubles: a $100 bet on a 30-point miss costs 200 points. |
| `CAPTURE_COMPLETE_OWNER` | Who sets the flag and where a `false` reason is recorded. |
| `HANDLE_CHANGE_POLICY` | Identity key when a handle changes between capture and settlement. |
