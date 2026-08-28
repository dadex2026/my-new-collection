# A worked run — E1, opening a contest

One complete pass through prompt **E1** of `docs/generation-prompts.md`: a
filled header, and the five-part output it should produce. It exists because
the library describes a good answer in prose — *What a good run gives back*,
*The tell for a run you should not trust* — and prose is hard to compare an
answer against. This is the concrete form. Hold a real run next to it.

**It is an example of output, not a source of truth.** Where this document and
the scripts disagree, the scripts are right and this is stale. The authoritative
references are `backend/standings/README.md` for board format and
`docs/post-generator-spec.md` for the compose contract.

**Verified against** `template-open-edition` @ `f6a8eee`. Every refusal quoted
below was read out of the script that raises it, not inferred from the prompt.

---

## The target

`gridiron-genesis` — a hypothetical collection standing on a fresh A1 copy of
the template, so its files are the template's files. It is deliberately not one
of the registry's real collections: `my-new-collection` has no
`backend/standings/` and none of the standings scripts, so E1 cannot run
against it until A4 copies them across, and the template itself is the one place
you never run collection commands. Using a clean copy keeps the example about
E1 rather than about that gap.

---

## The filled header

```
I want to start a new X/Twitter contest for a collection.

COLLECTION:        gridiron-genesis
COLLECTION TITLE:  Gridiron Genesis
SCORING DASHBOARD: Sports Ledger (v3.5)
CONTEST NAME:      Highest Total Contest
BOARD ID:          weekly-total-contest
SEASON ID:         2026-NFL
RULESET PREFIX:    nfl-ledger
EXPORT FILE PREFIX:contest-ranked
EXPORT HEADER ROW: Position,Handle,Called,Pick,OffBy,AppVersion
THE QUESTION:      Which of this week's NFL games posts the highest combined
                   score, and what is that total?
CONTEST TYPE:      call the number / closest call
ENTRY FORMAT:      weekly-total-contest <GAME> <TOTAL>
ENTRY DEADLINE:    Sunday 31 Aug 2026, 12:00 ET
RESULTS DATE:      Tuesday 2 Sep 2026
RECURS?:           yes — weekly
MIN PICKS:         1
TIEBREAK:          earliest reply timestamp
ANNOUNCEMENT CARD ID: ANNOUNCEMENT-001
```

Everything from `Give me the opening runbook` onward is the prompt block,
appended unchanged.

---
---

# 1 · Runbook

## Once per contest series

### 1. `backend/standings/_input/import-config.json`

Ships with three placeholders, all three load-bearing.

```json
{
  "collectionTitle": "Gridiron Genesis",
  "seasonId": "2026-NFL",
  "rulesetPrefix": "nfl-ledger",
  "rulesetVersion": null,
  "promptVersion": null,
  "minPicks": 1,
  "cardLimit": 10,
  "columnMap": {}
}
```

`rulesetPrefix` is the one that bites. Sports Ledger stamps `AppVersion` as a
bare `v3.5`; the importer tries the stamp as given and then the stamp qualified
by the prefix, so it looks for `"v3.5"` and `"nfl-ledger-v3.5"`. Leave the
prefix as `CHANGE ME` and it looks for `"v3.5"` and `"CHANGE ME-v3.5"`, matches
neither, and stops.

`columnMap` stays empty because `EXPORT HEADER ROW` shows Sports Ledger writing
`Handle`, `Called`, `Pick`, `OffBy` — the names the declaration below uses. A
source writing different labels needs a mapping entry here rather than a renamed
file.

Keep the `_`-prefixed keys. They are documentation and nothing reads them.

### 2. `backend/standings/_input/rulesets.json`

Delete the `_example` block, declare the real first version:

```json
"rulesets": {
  "nfl-ledger-v3.5": {
    "kind": "baseline",
    "effectiveFrom": "2026-08-31",
    "note": "First version imported for this collection. Sports Ledger v3.5, closest-call scoring on OffBy."
  }
}
```

Skip this and round 1 refuses. That refusal is the point: an unfamiliar build
becomes a decision rather than something that slips through stamped with a
stale value.

### 3. `backend/standings/_input/boards.json` — **create it**

Neither this file nor `_input/boards/` exists in a fresh checkout. Create both
now; leave the directory empty until round 1.

```json
{
  "boards": [
    {
      "boardId": "weekly-total-contest",
      "title": "Highest Total Contest",
      "blurb": "Closest call on the week's highest-scoring game.",
      "track": "prediction",
      "entityType": "participant",
      "filePrefix": "contest-ranked",
      "idColumn": "Handle",
      "labelColumn": "Handle",
      "scoreColumn": "OffBy",
      "seasonId": "2026-NFL",
      "fields": ["Called", "Pick", "OffBy"],
      "columns": ["rank", "name", "Called", "OffBy", "movement"],
      "cardLimit": 10
    }
  ]
}
```

All seven required fields are present — `boardId`, `title`, `track`,
`entityType`, `filePrefix`, `labelColumn`, `scoreColumn`. The rest are optional
and each earns its place:

**`scoreColumn: "OffBy"`, and `score` absent from `columns`.** A closest-call
contest has no score; lower is better. The field is required, so it points at
the error column — and because `score` is left out of `columns` while `OffBy`
is listed in `fields`, the card renders a column headed **OffBy** rather than a
misleading **score**. A board cannot express direction, so a score column
reading 1, 5, 8 would otherwise look like the winner did worst.

**`idColumn: "Handle"`.** Matching defaults to `labelColumn`. Point identity at
the handle, not a display name, or someone who changes their label reads as one
entrant leaving and another arriving — a movement chain reset with no error and
no trace.

**`track: "prediction"`.** The importer accepts exactly `subject`, `consensus`,
`prediction`, `reporting`. Participants calling a number is `prediction`.

### 4. What this path will *not* carry

Three things do not survive the import, so do not plan around them:

| Declared | What reaches the board |
|---|---|
| `eligibility` | Dropped — the importer writes `eligibility: null` unconditionally |
| `minPicks` | Never read; it is a community-importer threshold |
| `capture.complete` | Forced `true`, with `method: "ledger-export"` |

The consequence for this contest: **`MIN PICKS: 1` changes nothing here**, and
the tiebreak has nowhere to publish from the declaration. It goes in the
announcement copy instead, which is why step 5 spells it out there. Full detail
in `backend/standings/README.md` → *What the ranked importer does not carry*.

## The opening

### 5. Append the ANNOUNCEMENT row to `backend/textcards.csv`

Header is 16 columns:

```
textCardId,category,headline,subheadline,content,publishedDate,updatedDate,status,expiresAt,tags,featured,priority,author,image,imageAlt,postUrl
```

```
ANNOUNCEMENT-001,ANNOUNCEMENT,Highest Total Contest — Week 1 Is Open,,"Call the highest combined score of any NFL game this weekend. Reply exactly: weekly-total-contest <GAME> <TOTAL>. First reply per handle counts. Locks Sun 31 Aug, 12:00 ET. Closest wins; ties to earliest reply.",2026-08-27,,ACTIVE,2026-09-05,contest|nfl|2026-NFL,TRUE,10,,,,
```

Four trailing commas — `author`, `image`, `imageAlt`, `postUrl` all empty.
`postUrl` is filled by step 8, never by hand. `tags` is pipe-delimited, not
comma. `content` contains commas so the whole field is double-quoted.

**`content` must be one physical line.** Embed a newline for readability and
`set-post-url.js` refuses the row outright — *"spans more than one line and will
not be rewritten safely"* — and the round-trip in step 8 is lost permanently for
that card.

The drafted copy carries four things, and each is there for a reason:

- **the board id `weekly-total-contest`, character for character** — it is what
  the extraction prompt keys on
- **the answer format spelled literally**, angle brackets intact
- **the deadline with a timezone** — this is the entire basis of every lateness
  decision later. Nothing enforces it, so a vague post leaves a dispute with
  nothing to resolve against
- **the tiebreak** — because `eligibility.note` is discarded on this path, this
  is the only place it reaches a reader

**`expiresAt: 2026-09-05`**, three days past the results date. The trap:
`expiresAt` only *hides the card*. It closes nothing, admits nothing, rejects
nothing. Set it to the entry deadline and the contest goes invisible precisely
while people wait for results. The alternative is to leave it empty and retire
the card by hand afterwards — status `INACTIVE`, never deletion, because
`textCardId` is permanent and never reused.

### 6. Compose the post

```
node backend/scripts/compose-post.js announcement --id ANNOUNCEMENT-001
```

Reads `textcards.csv` directly, not the registry, so it works before the
generator has run. Post text goes to **stdout**, the character report to
**stderr** — so `> post.txt` gives a clean file with the budget still on screen.
`--out` does the same without the redirect.

Add `--site https://gridiron-genesis.netlify.app` if `collectionExternalUrl` in
`master.csv` is still the placeholder; `{siteUrl}` resolves from row 1 of that
file, and an empty value fails as an empty required field rather than silently
producing a dangling line.

Expected report:

```
  announcement · textcards.csv · ANNOUNCEMENT-001
   38  Highest Total Contest — Week 1 Is Open
    0  ·
  210  Call the highest combined score of any NFL game th…
    0  ·
   23  https://gridiron-genesis.netlify.app
  ---
  275  total (limit 280)
         5 to spare
```

The count is **weighted, the way X counts**: every URL costs 23 whatever its
real length, emoji and CJK cost 2, most Latin costs 1. An em dash costs 1.
Five to spare is tight — dropping a worked `e.g.` line from `content` is what
got it under. Over budget exits 2, prints the post, names the line to cut and
**writes nothing**.

### 7. Read it, then post it

Nothing here posts on your behalf. This is a judgment step and it does not
collapse into a command.

### 8. Record the URL back

```
node backend/scripts/set-post-url.js ANNOUNCEMENT-001 https://x.com/…/status/…
```

Rewrites that one line in `textcards.csv` and re-runs
`generate-content-registry.js` itself. `https://` only — `http://` and relative
paths are refused on the argument, before anything is read.

### 9. Generate and publish

```
node backend/scripts/generate-content-registry.js
git add backend/textcards.csv backend/content-registry.json frontend/public/content-registry.json backend/standings/_input
git commit -m "Open weekly-total-contest: declare the board, announce it"
git push
```

Step 8 already ran the generator; this is belt-and-braces if the order slipped.
**The second push is the step most often skipped, and it is the entire reason
the `postUrl` column exists** — without it the card knows a contest was
announced but not where the replies are.

### 10. Stop

The announcement is **not a board.** There are no entries yet, so there is
nothing to rank, nothing in `backend/standings/`, and nothing in
`standings.json`. Do not run `publish-round.js`; it would report *"No exports
matching prefix `contest-ranked`"* and publish nothing, which is correct.

---
---

# 2 · Disposition table

| File | Path | Status | Where the material goes |
|---|---|---|---|
| import-config | `backend/standings/_input/import-config.json` | **edited** | Replace `collectionTitle`, `seasonId`, `rulesetPrefix`; set `minPicks`. Top-level keys. Keep the `_`-prefixed comments. |
| rulesets | `backend/standings/_input/rulesets.json` | **edited** | New key `"nfl-ledger-v3.5"` inside the `rulesets` object. Delete the `_example` block. |
| boards | `backend/standings/_input/boards.json` | **created** | Whole file. The declaration is one object in the `boards` array. |
| exports dir | `backend/standings/_input/boards/` | **created** | Empty directory. First file arrives at round 1 as `contest-ranked-2026-08-31.csv`. |
| text cards | `backend/textcards.csv` | **edited** | One row appended, 16 fields in header order. |
| — | ↳ `postUrl`, field 16 | **script-written** | Empty at step 5; `set-post-url.js` writes it at step 8. |
| content registry | `backend/content-registry.json` | **generated** | `generate-content-registry.js`. Never hand-edit. |
| public registry | `frontend/public/content-registry.json` | **generated** | Same run copies it here. This is what the site fetches. |
| post text | stdout, or `--out post.txt` | **transient** | Not committed. Not the card. |

**Not touched, and that is correct:** `backend/standings/*.json` (no board
yet), `frontend/public/standings.json`, `frontend/public/methodology.json`,
`master.csv`, `campaigns.csv`.

---

# 3 · Refusals

| Trigger | What stops the run |
|---|---|
| Any of the 7 required declaration fields omitted | `boards.json: board 0 is missing "scoreColumn".` — exit 1, `bad_declaration` |
| `track` outside the accepted set | `boards.json: board "weekly-total-contest" has track "contest". Expected one of: subject, consensus, prediction, reporting` |
| Same `boardId` declared twice | `boards.json: boardId "weekly-total-contest" declared twice.` |
| **Round 1** — ruleset not declared | `contest-ranked-2026-08-31.csv: ruleset not declared in rulesets.json — tried "v3.5" and "nfl-ledger-v3.5".` |
| **Round 1** — undated export filename | `boards/contest-ranked.csv: no YYYY-MM-DD date in the filename, so it cannot be placed in the replay.` |
| **Round 1** — export missing a declared column | `…: no "OffBy" column. The declaration for "weekly-total-contest" expects Position, "Handle" and "OffBy". Header is: …` |
| Category not one of the four simple ones | `Card ANNOUNCEMENT-001: category "CONTEST" not recognized. Expected one of: NEWS, UPDATE, ANNOUNCEMENT, ANALYSIS` |
| A `RANKING`/`LEADERBOARD`/`SCOREBOARD`/`STANDINGS` row in the CSV | `structured_category_in_csv` — managed in the JSON registry, not here |
| `status` outside the set | Expected one of `DRAFT, SCHEDULED, ACTIVE, INACTIVE, EXPIRED, ARCHIVED` |
| `image` set, `imageAlt` empty | `Card ANNOUNCEMENT-001: image needs imageAlt. Describe what the image shows…` — and alt-without-image is refused too |
| Duplicate `textCardId` | `Duplicate textCardId in CSV: "ANNOUNCEMENT-001". IDs must be unique and are never reused.` |
| `set-post-url.js` given `http://` | `postUrl must start with https:// — got "…"` |
| `set-post-url.js` on a wrapped row | `Row "ANNOUNCEMENT-001" spans more than one line and will not be rewritten safely.` |
| A placeholder the record has no field for | `Unknown placeholder: {foo}` — then lists **every available field** for that record |
| A required field empty | `Empty in this record: {content}` — a blank leaves a dangling line that still reads as a finished post |
| Post over budget | Exit 2, `✗ Over budget by N. Nothing written` |

**The discovery trick:** put a placeholder that does not exist into a template
and read the error. It lists every field the record offers — and on a standings
board, that board's own entry fields.

**What will not refuse, and should worry you more.** Nothing validates that the
entry format is parseable, that the deadline written in the post is the one you
will enforce, or that `Handle`/`Called`/`OffBy` are the labels the dashboard
actually exports. `EXPORT HEADER ROW` exists to make that last one answerable
now rather than at round 1, four weeks of replies later.

---

# 4 · Verification

- [ ] `git grep -n "CHANGE ME" backend/standings/_input/` returns nothing
- [ ] `rulesets.json` has no `_example` block and `rulesets` is non-empty
- [ ] `boards.json` parses; `_input/boards/` exists and is empty
- [ ] `generate-content-registry.js` reports `1 added` and preserves persistent cards
- [ ] `frontend/public/content-registry.json` contains `ANNOUNCEMENT-001` with `persistent: false`
- [ ] The composed post is under 280 **weighted**, and reading it aloud you can tell exactly what to reply with
- [ ] The tiebreak is in the announcement `content` — it publishes nowhere else on this path
- [ ] **Live site:** hard refresh, card in the news grid, `postUrl` rendering as a link
- [ ] **Live site:** `/content-registry.json` fetches 200. A `/standings.json` 404 is the expected empty state at this stage
- [ ] Netlify finished building before you checked; a stale page is not a failure
- [ ] `backend/standings/` is still empty — confirms you stopped where you should
- [ ] `git status` diffs clean against the disposition table. A file changed but not listed, or listed but not changed, is a step gone wrong

---

# 5 · Missing inputs

**None.** Every value this run needed came from the header.

That was not true the first time this example was produced — the run reported
seven, and prompt **H1** added five of them to E1's header:
`COLLECTION TITLE`, `RULESET PREFIX`, `EXPORT FILE PREFIX`,
`EXPORT HEADER ROW` and `ANNOUNCEMENT CARD ID`. The remaining two,
`publishedDate` and card `priority`/`featured`, were left out deliberately:
today's date and a sensible default are honest answers, where an invented
ruleset prefix is not.

This is the section to read even when it says none. A run that built a file
from a value you never supplied, and reported nothing here, is a run to
distrust — check it against the disposition table.

---
---

## How this example was produced, and what it caught

Written by running E1 against the template's actual scripts rather than
describing the template's shape from the prompt text. That distinction is the
whole point of filling-rule 4, and it paid: three claims E1 and
`backend/standings/README.md` both made turned out to be false of the ranked
import path.

| Claim | Reality | Where it is now recorded |
|---|---|---|
| `eligibility.note` publishes — "put the tiebreak there" | `import-ranked-boards.js` writes `eligibility: null` unconditionally | Corrected in E1 and the README; open-items **#19** carries the one-line fix |
| `minPicks` makes entrants provisional for the first two rounds | Never read by the ranked importer; a ranked board is the latest round, not a cumulative season table | Corrected in E1 and the README |
| `capture.complete` is your assertion and can be set `false` | Forced `true` on this path, with no seam to change it in | Corrected in E1 and the README; open-items **#20** carries the design decision |

A model working from the prompt alone would have reproduced all three
confidently, because the prompt asserted them. That is the failure mode
*The tell for a run you should not trust* describes — an answer that looks
exactly like a correct one.

---

## Related

| File | Covers |
|---|---|
| `docs/generation-prompts.md` | The prompt library. **E1** is the prompt run here; the front matter defines the output contract this document instantiates |
| `backend/standings/README.md` | Board format, the two importers, running a contest, and *What the ranked importer does not carry* |
| `docs/post-generator-spec.md` | The `compose-post.js` contract — sources, placeholders, refusals, weighted counting |
| `docs/open-items.md` | Items **#19** and **#20**, the code changes these findings imply |
