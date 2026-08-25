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
- **An entry's extra columns live in a nested `fields` object** and must be
  flattened, exactly as `projectEntry()` spreads them onto a card row. This is
  how a ranked export carries `Winner`, `Spread`, `Total` past the label and
  score. Missing it makes a Sports board's most post-worthy values invisible to
  every template — which is precisely what the first implementation did, until
  a real ledger board was run through it. Flatten last, so an extra column
  never shadows `rank` or `name`.

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

**Count the way X counts — weighted length, not characters.** The first
implementation counted code points, which is wrong in both directions:

- **Every URL counts as 23**, whatever its real length, because `t.co` rewrites
  it. Counting the real length over-counts, so a post that would fit gets
  refused. This is the common case — most templates carry a link — and it is
  the damaging direction, because a budget check that rejects valid posts is
  one people learn to override, at which point it has stopped being a check.
  Note it can also *under*-count: a URL shorter than 23 characters, such as a
  bare `https://example.com`, costs more once wrapped than it looks.
- **Emoji and CJK weigh 2**, most Latin weighs 1. X's weight-1 set is code
  points in `0–4351`, `8192–8205`, `8208–8223` and `8242–8247`; everything else
  weighs 2. Counting code points scores an emoji as 1, so an emoji-heavy post
  can pass here and be rejected by X.

Text is NFC-normalised first, as `twitter-text` does. Worth knowing the
weighting reaches further than it first appears: an em dash (`—`, U+2014) falls
inside a weight-1 range and costs 1, while a right arrow (`→`, U+2192) does not
and costs 2.

Known limitation: the URL pattern is `https?:\/\/\S+`, which claims trailing
punctuation where X's own extractor is stricter. Composed posts put links at
the end of a line, so this has not mattered — but a link followed by a comma
mid-sentence would be counted a unit or two short.

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

| File | Source | Weighted | Notes |
|---|---|---|---|
| `mint-live.txt` | `master.csv` | 162 | Uses `{itemExternalUrl}`, no config key. |
| `campaign-launch.txt` | `campaigns.csv` | 189 | Built from the `*Text` columns — the strongest case for the whole idea. |
| `ranking-highlight.txt` | `standings.json` | 182 | Carries `{methodologyUrl}`. Cites `{entry[0..2].score}` — correct for a board that publishes one. |
| `ranking-highlight-noscore.txt` | `standings.json` | 167 | Names only. For boards ranked on a value they don't publish as `score` — a games board ranked by final value, for instance. |
| `announcement.txt` | `textcards.csv` | 146 | Opens a contest or anything else. Deliberately not a board — before a contest runs there are no entries and nothing to rank. |
| `contest-result.txt` | `standings.json` | — | Closes one. Reads `{entry[n].Pick}` and `{entry[n].Called}` from each entry's `fields`, so the example board can't render it; measured at 203 against a hand-built contest board. |

Weighted lengths, measured against the template's own sample rows with no
`--site` override, all inside the 280 default. They are lower than the raw
character counts an earlier revision of this table recorded, because a URL now
costs 23 rather than its real length — except `campaign-launch`, which rose,
since its `https://example.com` is shorter than 23 and costs more once wrapped.

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
- **Real ledger exports.** The per-board schema handling has been exercised
  against two hand-built boards modelled on Entertainment Ledger (handles by
  points, with `score`/`rate`/`entries`) and Sports Ledger (games by final
  value, with `Winner`/`Spread` in `fields` and no `score`). Both composed
  correctly, and the mismatch case failed loudly as intended. But those boards
  were written to match the documented shape — they are not real exports, so
  they prove the engine against the spec rather than against the Ledger apps.

## The Python twin

Two ~60-line implementations sharing one format beats a cross-runtime
dependency for string formatting. That holds — but only if the format is
written down, which is what this file is for. Implement the Python side
against this spec, not against the JavaScript, so neither is the other's
source of truth.

## The companion: `set-post-url.js`

`compose-post.js` produces the text; `set-post-url.js` closes the loop
afterwards. Given a card id and the URL of the post you just published, it
writes `postUrl` into that `textcards.csv` row and re-runs
`generate-content-registry.js`, so the card gains its *Discussion →* link.

It shares this script's refusal style — `https://` only, unknown card id names
the ids that exist — and both now share one RFC4180 parser in
`backend/scripts/lib/csv.js` rather than carrying a copy each.

It rewrites a single line rather than reserialising the file, so rows it did not
match keep their exact bytes, and it refuses a row wrapping onto a second line
instead of half-rewriting it.

## Deliberately not automated

The generator produces text. It does not post. Reading a timeline is one
thing; publishing under your name is another, and an unattended poster can
publish the wrong contest. Generate → read → paste → post.

## Not checked

Whether `collectionExternalUrl` holds the real site URL in a live collection
(placeholder in the template's sample row). How the frontend renders campaign
text end to end. Behaviour against a genuine Ledger export, as opposed to a
board hand-built to the documented shape. Any claim
about the ranker projects — the counts in the original brief that referenced
an Index Portfolio contest post and a `rankings.csv` came from outside this
repo and are not reproduced here.
