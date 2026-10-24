# Worked run — E2, open a new X contest on Index Portfolio

**Driven by prompt E2** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and `CONTEST_RUNBOOK.md`,
`scripts/leaderboard.py` or `scripts/compose_post.py` disagree, those win.

**Applicable project: `Dashboards\Index Portfolio`.** The contest below is the real
`examples/contests/IDX_30D_1023.json`, and the field, settings and template text are
read from that project rather than composed.

---

## SAMPLE HEADER

### E2 — Open a new X contest on Index Portfolio

```
CONTEST ID:      IDX_30D_1023
TITLE:           30-Day Index Showdown — October
QUESTION:        Which of these indexes posts the highest 30-day return by 23 October?
KIND:            index
SCORING MODE:    categorical
FIELD:           US_TECH_10, US_REIT_8, CRYPTO_L1, MULTI_STRATEGY_FUNDS_6, MEME_COIN_5, COMMODITY_5
WINDOW:          30d
RESOLVE DATE:    2026-10-23
LOCK AT:         2026-09-23T20:00:00-05:00
```

**Put the distinguishing part of `TITLE` before the em dash** — `title_short` cuts
there, so "30-Day Index Showdown — October" shortens to "30-Day Index Showdown", which
is what appears in a compact post.

---

## PART 1 — RUNBOOK

### 1. The contest JSON

`dashboard/public/data/contests/IDX_30D_1023.json` — **the filename must match the
`id` inside it.**

```json
{
  "id": "IDX_30D_1023",
  "title": "30-Day Index Showdown — October",
  "question": "Which of these indexes posts the highest 30-day return by 23 October?",
  "kind": "index",
  "scoring_mode": "categorical",
  "field": ["US_TECH_10", "US_REIT_8", "CRYPTO_L1", "MULTI_STRATEGY_FUNDS_6", "MEME_COIN_5", "COMMODITY_5"],
  "window": "30d",
  "resolve_date": "2026-10-23",
  "lock_at": "2026-09-23T20:00:00-05:00",
  "post_url": null
}
```

`post_url` starts `null` and is written in step 6 — it is the single home for that URL
on this path, and E3 reads it back rather than keeping a second copy.

### 2. `window` versus `start_date`

Set **one or the other, never both.** The script rejects a file carrying both rather
than picking one, because two sources for the same date can disagree. Named windows —
`1d`, `1w`, `30d`, `quarter`, `half_year`, `year`, `ytd` — count back from
`resolve_date`; `ytd` is named rather than typed precisely because its span changes
every day.

### 3. What "when data available" actually means

A window resolves only if there is a recorded close on or before **both** ends of it,
for **every** member of the field. **One unpriceable member leaves the whole contest
unresolvable** — and with six members this contest has six chances to be blocked by
one.

Check what history exists **before** posting:

```
py scripts\leaderboard.py --dry-run
```

It prints the summary and writes nothing.

### 4. Validation before posting

```
py scripts\leaderboard.py --id IDX_30D_1023
```

You want **"open — resolves on \<date\>"**. Anything else is a problem you would
otherwise discover after entrants have replied.

### 5. The launch post — and which template

```
py scripts\compose_post.py contest-launch-compact --id IDX_30D_1023
```

| Template | Use when |
|---|---|
| `contest-launch-compact` | a free account — it is built to fit 280 with a six-name field, which this contest has |
| `contest-launch-numeric` | a **numeric** contest |

**`SCORING MODE` decides the template.** This contest is `categorical`, so compact is
right. A numeric contest needs `contest-launch-numeric`, because a reply carrying only
a pick scores zero — the numeric template says so on its face (*"Closest call wins,
not the best pick"*, *"Off by {max_error}% or more scores nothing"*) and the compact
one does not ask for a percentage at all. Compose a numeric contest with the compact
template and you have invited exactly the replies that cannot score.

**The four things the post must contain, and why each earns its place:**

| Must contain | Why |
|---|---|
| the exact contest id | it is the first field of every reply, and a mismatched label is rejected, not guessed |
| the field spelled exactly as in the JSON | a pick outside it is skipped; entrants copy what they see |
| the trade range | `1-{max_trade}`, so nobody invents a number that will be dropped |
| the lock time with a timezone | it is the whole basis of lateness, and `lock_at` carries the offset |

The template supplies all four — `{id}`, `{field_list_wrapped}`, `Reply: {id} <pick>
<1-{max_trade}>`, `Locks {lock_short}` — plus `quotes +{quote_bonus}`, which is **10**
in `leaderboard-settings.json`: a nudge toward the behaviour that spreads the contest.

`post-settings.json` sets `post_char_budget: 280` and `field_per_line: 3`, so a
six-name field wraps to two lines. **`site_url` is empty**, so anything resolving
`{siteUrl}` needs it supplied.

### 6. Record the url back

```
py scripts\compose_post.py --id IDX_30D_1023 --record-url <url>
```

Without it the record knows a contest exists but not where its picks came from. It
refuses to overwrite a different url without `--force`, on the stated grounds that
losing the link to the thread the picks actually came from is worse than a stopped run.

Nothing here posts to X. Read the draft, post it yourself, then record.

### 7. Exit codes

`0` composed · `1` could not compose · `2` over budget. **`--out` never writes an
over-budget post** — so a file that exists is a post that fits.

---

## PART 2 — DISPOSITION TABLE

| # | File | Path | Disposition | What goes where |
|---|---|---|---|---|
| 1 | Contest definition | `dashboard/public/data/contests/IDX_30D_1023.json` | **Created**, then edited once | Filename matches `id`. `post_url` written by `--record-url`. |
| 2 | Recorded history | `history/`, `constituent-history/`, `latest/` | Read only | What `--dry-run` checks against. |
| 3 | Engine | `scripts/leaderboard.py` | Run twice | `--dry-run`, then `--id` for validation. |
| 4 | Settings | `leaderboard-settings.json`, `post-settings.json` | Read only | `quote_bonus: 10`, `max_error: 5`, budget 280, 3 field names per line, empty `site_url`. |
| 5 | Templates | `post-templates/contest-launch-compact.txt`, `-numeric.txt` | Read only | Choice driven by `scoring_mode`. |
| 6 | Compose script | `scripts/compose_post.py` | Run twice | Draft, then `--record-url`. |
| 7 | The X post | x.com | **Created by hand** | Its URL becomes `post_url`. |

---

## PART 3 — REFUSALS

1. **A file with both `window` and `start_date` is rejected** — not resolved by
   preference.
2. **A filename that does not match the `id` inside** is a mismatch waiting to happen
   downstream.
3. **An unresolvable window** — one unpriceable field member blocks the whole contest.
4. **`--record-url` refuses to overwrite a differing url** without `--force`.
5. **Over budget exits `2` and `--out` writes nothing.**
6. **Nothing posts to X.**
7. **A numeric contest composed with the compact template** invites replies that score
   zero — not a refusal the tool makes, which is why the template choice is a step.

---

## PART 4 — VERIFICATION CHECKLIST

**Before posting**

- [ ] Filename matches the `id` character for character.
- [ ] Exactly one of `window` / `start_date`.
- [ ] `scoring_mode` matches the template you are about to use.
- [ ] `lock_at` carries a timezone offset.
- [ ] `resolve_date` is after `lock_at`.
- [ ] `--dry-run` shows history for **every** field member across the whole window.
- [ ] `--id` reports **"open — resolves on 2026-10-23"**.
- [ ] `TITLE`'s distinguishing part is **before** the em dash.

**The post**

- [ ] Contains the exact id, the field as spelled in the JSON, the trade range, and the lock time with a timezone.
- [ ] Within budget — exit `0`, not `2`.
- [ ] Read in full before posting.

**After**

- [ ] Posted by hand; `--record-url` run; `post_url` no longer `null`.
- [ ] `daily_update.py` running, so closes accumulate for the window.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `MAX TRADE` | The post prints `1-{max_trade}` and the header never collects it; it comes from settings, and the runbook should say which file. |
| `SITE URL` | `post-settings.json` ships `site_url: ""`, so any template resolving `{siteUrl}` has nothing. |
| `POST URL` | Recorded in step 6; the header has no field, the same gap E3 closed with `X POST`. |
| `ACCOUNT TIER` | The compact template exists because a free account is 280 characters. A premium account can use the fuller template, and nothing asks. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| **Worked headers appendix + `CONTEST_RUNBOOK.md`** | The live `IDX_30D_0923.json` field array has **six** members. `CONTEST_RUNBOOK.md` Phase 1 and E2's worked header both show **four** for that same id. Illustrative snippets wearing a real contest's id is how a four-member whitelist gets pasted into a six-member contest — and the extractor then *skips* every reply naming the two missing indices, silently. Give examples a distinct id. |
| E2 cover items | The template choice is covered, but the failure mode is not stated: composing a numeric contest with the compact template invites bare picks, and a bare pick in a numeric contest scores zero. Nothing refuses it. |
| E2 cover items | "The four things the post must contain" is excellent and the templates already supply all four — worth saying so, so nobody hand-edits them back out to save characters. |
| E2 header | No `POST URL`, though step 6 records one; no `SITE URL`, though `post-settings.json` ships it empty. |
| E2 cover items | Worth naming `--dry-run` and `--id` as two different checks: the first asks whether the data exists, the second whether the contest is open. Running only the second passes on a contest that can never resolve. |
