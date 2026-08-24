# Post Generator — Specification and Build Order

**Status:** built and passing. `backend/scripts/compose-post.js` plus three
templates in `backend/post-templates/`. This file remains the contract — the
Python twin is meant to be an implementation of *this*, not a port of the
JavaScript, so that neither is the other's source of truth.

**Verified against:** `backend/campaigns.csv`, `backend/master.csv`,
`backend/textcards.csv`, `backend/scripts/` (18 scripts),
`frontend/public/standings.json`, `backend/scripts/generate-standings-cards.js`,
`backend/config.json` — read 2026-08-23 at `6881db3`.

---

## The problem

A post repeats facts that already live in a config file — a mint price, an
eligibility rule, a rank. Retyping them lets the post and the site disagree
silently. Deriving the post from the file makes disagreement structurally
impossible.

The template's authored CSVs make this unusually strong: `campaigns.csv`
carries `eligibilityText`, `rewardText`, `priceText`, `allocationText`,
`claimText` — the *literal strings the frontend renders*. A post built from
those cannot paraphrase the site, because it is the site's own wording.

---

## The sourcing rule

This is the correction that matters most, and it generalises beyond posts.

> **Authored content is sourced from its CSV. Generated content is sourced
> from its published artifact.**

| Content | Authored or generated | Source of truth for a post |
|---|---|---|
| Mint / drop | authored | `backend/master.csv` |
| Campaign | authored | `backend/campaigns.csv` |
| Text card (news, update) | authored | `backend/textcards.csv` |
| **Standings / rankings** | **generated** | **`frontend/public/standings.json`** |

There is no `rankings.csv` and there should not be one. Rankings enter the
system through `backend/standings/*.json`, are projected by
`generate-standings-cards.js`, and are published complete to
`frontend/public/standings.json`. Reading a CSV for a ranking post would read
a layer that doesn't exist; reading the board files directly would bypass the
validation the generator performs. The published artifact is the correct
layer — it is what the site actually serves, so the same no-disagreement
guarantee applies.

`standings.json` carries `{ generatedAt, boards: [...] }`, and each board
carries the full entry list — not the truncated card slice — so a post can
cite a rank the card doesn't show.

---

## Placeholders

Plain text templates with `{placeholders}` mapping 1:1 to source field names.
No mapping layer, so nothing can drift.

### CSV sources: fixed schema

The header row is the field list. Available placeholders are known before the
run and identical for every row.

### Standings source: per-board schema

**This is the difference the engine has to handle.** A board declares its own
`columns` array, and `projectEntry()` omits any field that is null or
undefined. So one board's entry row is `{rank, name, score, rate, entries,
movement}` while another's is `{rank, name, score, Winner, movement}`. A
template hard-coding `{score}` breaks on a board that doesn't publish one.

Consequences for the engine:

- Resolve the available field list **at runtime from the board being
  rendered**, not from a static list.
- The "unknown placeholder" error must name the fields available *for that
  board*, otherwise the message misleads.
- `movement` in `standings.json` is a raw object `{state, delta}`, **not** the
  formatted string a card carries — `projectEntry()` formats it on the card
  path only. The engine therefore mirrors `formatMovement()` from
  `generate-standings-cards.js` so a post renders movement exactly as the site
  does. Keep the two in step if either changes.
- Entries also carry `entityId` and `previousRank`, which are not in `columns`.
  Available fields come from the entry object itself, not from `columns` —
  `columns` governs what the *card* displays, which is a narrower thing.

### Entry addressing

`{entry[0].name}`, `{entry[0].score}`, `{entry[1].name}` — zero-indexed
against the board's own `entries`. Board-level fields resolve bare:
`{title}`, `{seasonId}`, `{throughRound}`, `{rulesetVersion}`, `{entryCount}`.

---

## Engine contract

```
node backend/scripts/compose-post.js <template> --id <recordId> [--out <path>]
```

**Output goes to stdout by default.** It's a compose step feeding a human
paste, so stdout is the useful default and keeps it pipeable. `--out <path>`
writes to a file instead. Never write to a default path — a generator that
silently drops files somewhere is a generator whose output goes stale
unnoticed.

**Diagnostics go to stderr**, so `compose-post.js ... > post.txt` yields a
clean file and the character report still reaches the terminal.

### Hard errors — exit 1, nothing emitted

Matching the house style already set by `generate-standings-cards.js`, which
refuses an incomplete capture rather than publishing a partial standing.

| Condition | Why it must fail loudly |
|---|---|
| Unknown placeholder | A typo'd `{rewardTxt}` rendering as an empty line produces a post that reads complete but has lost its reward description. Name the available fields in the error. |
| Required field empty in the record | A blank `priceText` emits a dangling separator. |
| **`--id` matches no record** | Same class of failure. Never fall back to the first row, and never emit an empty post. Error, and list the ids that do exist. |
| Board tagged `example: true` | The sample board exists to prove the pipeline, not to be announced. Refuse unless `--allow-example` is passed. |
| Standings template with no methodology link | See below. |

### The methodology requirement

The brief proposed a mandatory disclaimer string on ranking posts. Prefer a
link to the real thing: the site already publishes a full methodology page,
generated by `generate-methodology.js`, stating which ruleset produced each
board and where movement is and isn't shown. A post citing a rank should
point at it.

So: any template sourced from `standings.json` must contain
`{methodologyUrl}`, and the engine refuses to compose it otherwise. A
free-text disclaimer can go stale silently; a link to a generated page
cannot.

### Character budget

Report, never truncate. Print the total, the limit, and a per-line breakdown
so an over-budget post shows *which* line to cut. A silently truncated field
list is worse than a long one, because people act on only what they can see.

Budget is a setting, not a constant — 280 free, ~25,000 Premium.

**Resolved: it's a flag, not a setting.** `--limit <chars>`, defaulting to 280.
The earlier draft treated this as a config decision blocking the build; it
isn't one. `backend/config.json` is still template placeholder
(`your-collection-slug`, `YOUR_TREASURY_ADDRESS`, `"network": "devnet"`), and
adding a key to a file nobody maintains would move the staleness somewhere
less visible rather than removing it.

### `{siteUrl}` — resolved from the record

No config key. `master.csv` already carries `collectionExternalUrl` and
`itemExternalUrl` per row, so:

- `{itemExternalUrl}` in a mint post resolves straight from the row — nothing
  global involved, and a per-row URL is right for a project shipping multiple
  drops.
- `{siteUrl}` and `{methodologyUrl}` are computed: `siteUrl` is
  `collectionExternalUrl` from the first `master.csv` row, overridable with
  `--site <url>`; `methodologyUrl` is `{siteUrl}/#methodology`, matching the
  anchor the section nav already links to.

Both are `https://example.com` in the template's sample row, so a real
collection needs a real value there — but that's a data problem in one CSV
cell, not an engine problem.

---

## Templates that ship

Three, working against the sample rows so a fresh copy runs one on day one.

All three live in `backend/post-templates/`, alongside `backend/standings/`
and `backend/methodology/` rather than at the repo root, since they are
backend data like everything else the scripts read.

| File | Source | Renders at | Notes |
|---|---|---|---|
| `mint-live.txt` | `master.csv` | 168 chars | Uses `{itemExternalUrl}`, no config key. |
| `campaign-launch.txt` | `campaigns.csv` | 184 chars | Built from the `*Text` columns — the strongest case for the whole idea. |
| `ranking-highlight.txt` | `standings.json` | 190 chars | Carries `{methodologyUrl}`. Cites `{entry[0..2].score}`, which is board-dependent — a board without a score column needs its own variant. |

Character counts are from real runs against the template's sample rows, all
within the 280 default.

A template declares its own source in a directive on the first line —
`#source: campaigns`. Self-describing beats a manifest: the template and its
source cannot drift apart when they are the same file.

Document deleting the samples, same discipline as
`backend/standings/EXAMPLE-participants-accuracy.json`.

---

## What was verified when it was built

Every rule above was exercised against real data, not asserted. Re-run these
after any change to the engine:

```
# the three templates
node backend/scripts/compose-post.js mint-live --id SAMPLE-001
node backend/scripts/compose-post.js campaign-launch --id sample-campaign-001
node backend/scripts/compose-post.js ranking-highlight --id example-participants-accuracy --allow-example

# the refusals — each should exit non-zero and emit nothing
node backend/scripts/compose-post.js ranking-highlight --id example-participants-accuracy
node backend/scripts/compose-post.js mint-live --id NOPE-999
node backend/scripts/compose-post.js campaign-launch --id sample-campaign-001 --limit 100
```

Observed: the example board is refused without `--allow-example`; an unmatched
id lists the ids that exist; an unknown placeholder lists the fields available
*for that record*, entry fields included; a blank field (`{uri}` on the sample
row) is refused; a standings template lacking `{methodologyUrl}` is refused;
and over budget the post prints, exit code is 2, and no `--out` file is
written.

## Still to do

- **Document it in `new-collection-deployment-guide.md`** — one subsection per
  source, next to the generator each pairs with. Not yet written.
- **The Python twin**, per the section below.
- **A no-score board variant** of `ranking-highlight.txt`. The shipped one
  cites `{entry[0].score}`, which is correct for the example board and wrong
  for any board whose `columns` omit score. The engine fails loudly on that,
  which is the intended behaviour, but a second template would save the next
  person writing one.

## The Python twin

Two ~60-line implementations sharing one format beats a cross-runtime
dependency for string formatting. That holds — but only if the format is
written down, which is what this file is for. Implement the Python side
against this spec, not against the JavaScript, so neither is the other's
source of truth.

## Deliberately not automated

The generator produces text. It does not post. Reading a timeline is one
thing; publishing under your name is another, and an unattended poster can
publish the wrong contest. Generate → read → paste → post.

## Not checked

Whether `collectionExternalUrl` holds the real site URL in a live collection
(placeholder in the template's sample row). How the frontend renders campaign
text end to end. Behaviour against a board whose `columns` omit `score`, or
against more than one board — there is only the example board to test with,
so the per-board schema handling is exercised but not stressed. Any claim
about the ranker projects — the counts in the original brief that referenced
an Index Portfolio contest post and a `rankings.csv` came from outside this
repo and are not reproduced here.
