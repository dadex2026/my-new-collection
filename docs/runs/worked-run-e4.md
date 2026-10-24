# Worked run — E4, score and publish contest results

**Driven by prompt E4** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and the scripts disagree, the scripts win.
`scripts/leaderboard.py`, `scripts/compose_post.py` and
`post-templates/contest-result.txt` are authoritative.

**Path declared up front, as E4 requires: this is the INDEX PORTFOLIO branch.**
Applicable project: `Dashboards\Index Portfolio`, using `TECH_NUM_EXAMPLE` — the one
contest in the platform with a complete recorded run, engine report and scored board,
so the numbers below are the real ones rather than plausible ones. The collection
branch is contrasted where E4 asks for it.

---

## SAMPLE HEADER

### E4 — Score and publish contest results

```
I want to score and publish the results of a contest.

TARGET:      Index Portfolio
CONTEST ID:  TECH_NUM_EXAMPLE
ROUND DATE:  2026-08-20
```

The contest, from `examples/contests/TECH_NUM_EXAMPLE.json`: `scoring_mode: numeric`,
field `US_TECH_10` / `CRYPTO_L1`, `window: 30d`, `lock_at 2026-07-21T20:00:00-05:00`,
`resolve_date 2026-08-20`.

---

## PART 1 — RUNBOOK

### 1. Settle it

```
py scripts\leaderboard.py
```

On or after `resolve_date`, run it again to settle. The engine reports:

```
[TECH_NUM_EXAMPLE] settled
    winner: US_TECH_10   rows: 8 (6 settled, 0 pending, 1 late, 1 superseded, 1 invalid)
    difficulty ×1.50   consensus: —
    ! line 6: stripped a symbol from the predicted % ('-3%')
    ! line 6: stripped a symbol from the virtual trade ('$40')
    ✗ line 9: 'SPY' is not in this contest's field (CRYPTO_L1, US_TECH_10)
```

**Read every line before publishing.** Eight rows produced six settled ones: one late,
one superseded, one invalid. The two `!` lines are repairs the engine made and told you
about; the `✗` line is a row that did not count. Fix the CSV and re-run — **re-running
is always safe here**, every output being rebuilt from the contest file and the CSV.

Actual returns over the window: `US_TECH_10 +6.0%`, `CRYPTO_L1 −3.0%`.

### 2. Read the board before you write about it

```
HANDLE       PICK          PRED      STATUS  CLOSE     INIT   TRADE  ENG    TOTAL     EDGE
@DollarDave  CRYPTO_L1     -3.0     settled   1.00   150.00   40.00    0   190.00     0.00
@AlphaPicks  US_TECH_10    +6.5     settled   0.90   135.00   33.33   10   178.33    82.50
@SharpSam    CRYPTO_L1     -2.0     settled   0.80   120.00   33.33    0   153.33   -30.00
@LateLarry   US_TECH_10    +6.0        late      —     0.00    0.00    0     0.00        —
@QuietCarl   US_TECH_10   +12.0     settled   0.00     0.00    0.00    0     0.00   -52.50
@ValueHunter US_TECH_10       —     settled   0.00     0.00    0.00    0     0.00   -52.50
@Switcher    CRYPTO_L1     -8.0     settled   0.00     0.00  -20.00    0   -20.00  -150.00
@Switcher    US_TECH_10    +5.0  superseded      —        —       —    —        —        —
```

**The headline is a trap, and this is the one thing to get right before composing:
the winner of the board picked the losing index.** `winner: US_TECH_10` is the
contest's answer. `@DollarDave` tops the board on 190 having picked `CRYPTO_L1` —
because this is `scoring_mode: numeric`, where the score is the accuracy of the
*number*, not whether you picked the winner. He called −3.0 against an actual −3.0.

A post that says "@DollarDave called US_TECH_10" would be wrong in a way the data
contradicts on its face. Three more to keep straight:

- **`@LateLarry` called +6.0 against a +6.0 actual — a perfect call — and scores
  zero**, posted 21:06 against a 20:00 lock, quote bonus forfeited too.
- **`@Switcher`'s second row is `superseded`.** The **earliest** call counts in a
  contest; a contest asks one question at one moment. (The sentiment engine is the
  opposite — latest wins.)
- **`@ValueHunter` scores zero visibly**, with the page note *"no predicted % supplied
  in a numeric contest"* — included and shown, rather than silently dropped.

### 3. Compose the result post

```
py scripts\compose_post.py contest-result --id TECH_NUM_EXAMPLE
```

**It refuses until the contest is scored**, and the refusal names which of the two
states it is in:

- no result file yet → *"no scored output yet — run `py scripts\leaderboard.py` first"*
- a result that is not settled → *"contest is not settled (\<status_reason\>)"*

Either way the result-only placeholders — `winner`, `entrants`, `hit_share_pct`,
`difficulty`, `top_lines`, `top_handle`, `top_points`, `consensus_pick` — are marked
unavailable rather than rendered blank. The template is
`post-templates/contest-result.txt`, and its own comment says the same: *"Only composes
once leaderboard.py has settled the contest."* It closes with the line that is the
whole point of the split:

> *Every number computed from recorded closes, not typed in.*

### 4. Post it, then record the url

Nothing here posts to X. Read the draft, post it **as a reply to the announcement
thread** — it closes the loop where people are already looking — then:

```
py scripts\compose_post.py --id TECH_NUM_EXAMPLE --record-url <url>
```

which writes `post_url` into the contest JSON. That is the single home for it on this
path; it refuses to overwrite a different url without `--force`.

### 5. Keep the daily run going

`py scripts\daily_update.py` produces the closes the contest is measured against.
**Never `--mock`** — it writes synthetic rows into the real `history`,
`constituent-history` and `latest` files and rewrites `data-state`, and contests
resolve from exactly those files. Use `--help` to smoke-test.

### 6. On ties — either branch

Ranking is **competition-style**: two entries sharing a position both take the lower
number and the next skips one — 1, 1, 3. **Nothing breaks a tie for you.** So decide
before publishing: a tie you accept (same rank, the card extends through the whole tie
group), or a tie you broke (distinct ranks, with the deciding evidence in `fields`).

What you must not do is leave a tie in the data while writing copy that names a single
winner. `contest-result.txt` renders `{entry[n].rank}` rather than hard-coded positions
precisely so a post cannot claim a sole winner the board does not support.

### The collection branch, for contrast

| | Index Portfolio (this run) | Collection / Ledger |
|---|---|---|
| Scoring | `leaderboard.py`, from recorded closes | The Ledger computes the round; lateness decided there, from timestamps |
| Round in | the predictions CSV | export → `_input/boards/<prefix>-YYYY-MM-DD.csv`, **moved by hand** |
| Publish | outputs rebuilt by the script | `publish-round.js` — all three steps |
| Compose | `compose_post.py contest-result --id <ID>` | `compose-post.js contest-result --id <boardId>`, reading `frontend/public/standings.json` — the published artifact, **not** the card and not the board file |
| Re-running | always safe; rebuilds | re-pasting **adds** rows |

---

## PART 2 — DISPOSITION TABLE

| # | File | Path | Disposition | What goes where |
|---|---|---|---|---|
| 1 | Contest definition | `dashboard/public/data/contests/TECH_NUM_EXAMPLE.json` | **Edited** at the end only | `post_url` written by `--record-url`. |
| 2 | Predictions CSV | `data-input/predictions/TECH_NUM_EXAMPLE.csv` | **Edited** to fix flagged rows | Line 6's symbols, line 9's out-of-field pick. |
| 3 | Engine | `scripts/leaderboard.py` | Run | Rebuilds every output from #1 and #2. |
| 4 | Recorded history | `history/`, `constituent-history/`, `latest/`, `data-state` | Read — **never** written by hand | `daily_update.py --mock` corrupts exactly these. |
| 5 | Scored result | the contest's result file | **Generated** | `status: settled`, `winners`, `difficulty`, `counts`. |
| 6 | Post template | `post-templates/contest-result.txt` | Read only | Result-only placeholders. |
| 7 | Compose script | `scripts/compose_post.py` | Run twice | Once to draft, once with `--record-url`. |
| 8 | The X post | x.com | Created by hand | A reply to the announcement thread. |

---

## PART 3 — REFUSALS

1. **`contest-result` refuses until settled**, naming which state blocks it.
2. **Result-only placeholders are marked unavailable, never rendered blank.**
3. **A late pick scores zero**, engagement bonus included — the timestamp decides, not
   the capture.
4. **The earliest call counts**; later ones are `superseded`, visibly.
5. **An out-of-field pick is reported and excluded**, naming the line and the valid
   field members.
6. **A numeric contest with no number scores zero and says why** rather than dropping
   the row.
7. **Nothing breaks a tie for you**, and the template cannot name a sole winner the
   board does not support.
8. **Nothing posts to X.**
9. **`--mock` is not a test mode** — it writes into the files contests resolve from.

---

## PART 4 — VERIFICATION CHECKLIST

**Before composing**

- [ ] Run is on or after `resolve_date` and the report says `settled`.
- [ ] Every `!` repair line read and accepted.
- [ ] Every `✗` line fixed in the CSV and the script re-run, or consciously left out.
- [ ] Counts reconcile: `8 rows = 6 settled + 1 late + 1 superseded` (+1 invalid row).
- [ ] **The contest's winner and the board's top scorer are understood separately** — in a numeric contest they need not be the same, and here they are not.
- [ ] Ties: accepted or broken, deliberately, before publishing.

**Composing and posting**

- [ ] Draft read in full; the winner sentence checked against the board.
- [ ] Character budget within limit.
- [ ] Posted as a reply to the announcement thread.
- [ ] `--record-url` run; `post_url` populated in the contest JSON.

**After**

- [ ] `daily_update.py` still running for the next contest.
- [ ] No `--mock` run has ever touched this project's history.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `POST URL` | The result post's url is recorded at the end, and E4 collects nothing for it — the same field E3 now carries. |
| `TIE DECISION` | E4 devotes a whole section to ties being yours to decide, and the header has nowhere to record the decision. |
| `ROUND DATE` semantics | Collected, but on this branch the round is decided by `resolve_date` in the contest JSON. Worth saying it is confirmation, not input. |
| `ALLOW INCOMPLETE?` | On the collection branch, publishing crosses `capture.complete`; E4 does not collect the decision. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| E4, Index branch | Says `compose_post.py contest-result` "refuses until the contest is scored". There are **two** distinct refusals — no result file at all, and a result whose status is not `settled` — and the second is the one that happens when you run too early on the right day. Worth naming both. |
| E4, either branch | Nothing warns that in a **numeric** contest the board's top scorer may have picked the losing option. It is the single most likely way for a correct board to produce a wrong post, and this project's own worked example is built around it. |
| E4, Index branch | The `--mock` warning is present and good. Worth adding that `leaderboard.py` re-runs are safe *because* outputs are rebuilt — the same sentence that makes re-running safe is what makes `--mock` unrecoverable. |
| E4 header | No `POST URL` field, though the last action of the runbook is recording one. |
