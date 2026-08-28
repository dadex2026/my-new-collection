# Worked run — C1, new text card

**Driven by prompt C1** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and the scripts disagree, the scripts win.
`backend/scripts/generate-content-registry.js`, `compose-post.js`, `set-post-url.js`
and `backend/textcards.csv` are authoritative.

Column names, flags, exit codes, statuses, error text and existing card ids were read
from disk. The display order in §H is the one C1 states; `frontend/src/ui.engine.ts`
was not readable in this session, so treat that one item as unverified.

**Built on `TEMPLATE-OPEN-EDITION`**, which carries the current 16-column
`textcards.csv` and the `sample-campaign-001` row this card announces. The registry
calls it *the source — never run collection commands here*, so read this as the shape
to copy into your own collection rather than a sequence to execute in the template.
§0 covers what to check on arrival there.

---

## SAMPLE HEADER

### C1 — Generate a new text card

What it creates: one card in the site's news grid, announced on X, with the post
linked back so the thread is findable months later.

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

The card announces `sample-campaign-001` from `backend/campaigns.csv` — the
holder-reward campaign B1 creates — so the two worked runs chain.

---

## §0 — CHECK THIS FIRST IN ANY REAL COLLECTION

The template's header is the current one, all 16 columns:

```
textCardId,category,headline,subheadline,content,publishedDate,updatedDate,status,expiresAt,tags,featured,priority,author,image,imageAlt,postUrl
```

**A collection copied before those columns existed will not have them.**
`my-new-collection`, for one, is still on a 13-column header ending at `author` — no
`image`, no `imageAlt`, no `postUrl`. Both consequences are silent:

- `IMAGE` and `IMAGE ALT` have nowhere to go.
- **Step E cannot run.** `set-post-url.js` writes the `postUrl` column; a file without
  that column cannot record the link back, which is the whole point of the last step.

The remedy is **prompt A4 — pull newer template features into an existing
collection** — not a hand-edited header row. So the first action of any C1 run is:

```
head -1 backend/textcards.csv
```

and count. Sixteen, or run A4 first.

---

## PART 1 — RUNBOOK

### A. The `backend/textcards.csv` row

The row to append:

```
ANNOUNCEMENT-011,ANNOUNCEMENT,Sample Campaign Rewards Are Live,Ten rewards — one per wallet,"Holders of SAMPLE-001 can now claim their reward free, ten available, one per wallet. Connect the wallet holding your SAMPLE-001 and the claim button appears on the site.",2026-08-28T00:00:00Z,2026-08-28T00:00:00Z,ACTIVE,,campaign|holder-reward|sample-001,TRUE,10,System,/images/announcements/sample-campaign.png,Sample Item artwork beside a Claim Reward button,
```

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `textCardId` | `ANNOUNCEMENT-011` | **Unique, never reused.** Required. See the numbering note below. |
| 2 | `category` | `ANNOUNCEMENT` | Required. NEWS / UPDATE / ANNOUNCEMENT / ANALYSIS. |
| 3 | `headline` | Sample Campaign Rewards Are Live | Required. First line of the post. |
| 4 | `subheadline` | Ten rewards — one per wallet | Optional. |
| 5 | `content` | *(quoted — see below)* | Required. |
| 6 | `publishedDate` | `2026-08-28T00:00:00Z` | Required. Existing rows use this exact ISO shape. |
| 7 | `updatedDate` | `2026-08-28T00:00:00Z` | Optional; defaults to `publishedDate`. |
| 8 | `status` | `ACTIVE` | Required. DRAFT / SCHEDULED / ACTIVE / INACTIVE / EXPIRED / ARCHIVED. |
| 9 | `expiresAt` | *(empty)* | EXPIRES: none. |
| 10 | `tags` | `campaign\|holder-reward\|sample-001` | **Pipe-delimited, never comma-delimited.** |
| 11 | `featured` | `TRUE` | |
| 12 | `priority` | `10` | Integer, defaults to 0. Existing rows are all `0`. |
| 13 | `author` | `System` | Matches every existing row. |
| 14 | `image` | `/images/announcements/sample-campaign.png` | Site-relative. |
| 15 | `imageAlt` | Sample Item artwork beside a Claim Reward button | **Required because `image` is set.** |
| 16 | `postUrl` | *(empty)* | Filled by step E. The trailing comma holds its place. |

**The id numbering is global, not per-category.** The file already holds `NEWS-001`,
`NEWS-005`, `UPDATE-002`, `ANALYSIS-003`, `ANNOUNCEMENT-004`, `ANNOUNCEMENT-010` — one
shared sequence with the category as a prefix. So the next id is `ANNOUNCEMENT-011`,
not `ANNOUNCEMENT-005` and not `ANNOUNCEMENT-001`, which reads free but sits in a slot
`NEWS-001` already used. A duplicate fails the generator with `duplicate_id`; a
*confusing* id fails nothing and confuses everyone later.

**Commas and quoting.** Any field containing a comma must be double-quoted as a whole
— here, `content`. This file is parsed differently from its siblings on purpose:
`generate-registry.js` and `generate-campaigns-registry.js` split on a plain `,`,
which is fine for addresses and ids, but `content` is prose and will routinely contain
commas. `generate-content-registry.js` uses a quote-aware parser instead, handling
`"quoted, with, embedded commas"` and `""` as an escaped quote. Quote the field anyway
rather than leaning on it — the parser exists to survive that mistake, not to license it.

**Trailing commas.** Optional columns still need their positions. This row ends
`…,Sample Item artwork beside a Claim Reward button,` — one trailing comma for the
empty `postUrl`. Count 15 commas outside quotes.

**The image file must exist and be committed.** `/images/announcements/sample-campaign.png`
resolves to:

```
frontend/public/images/announcements/sample-campaign.png
```

A path that is right in the CSV and missing from the repo **renders a broken image
with no error anywhere** — not in the generator, not in the build, not in the console.
Check `git status` before pushing and confirm the file is staged rather than untracked.

**Alt-text check, as C1 asks.** A candidate alt of *"Sample Campaign Rewards Are
Live"* would be rejected: that is the headline again, which a screen-reader user has
already heard, and it says nothing about the picture. The value above — *"Sample Item
artwork beside a Claim Reward button"* — describes what is visible. **It passes.**
Verify it against the actual file before publishing; if the image turns out to be a
plain wordmark, the alt must change to match. (The template's own rows model this:
`NEWS-001` carries *"Placeholder banner reading Genesis Live"*, which describes the
image rather than repeating *"Genesis Collection Is Live"*.)

### B. Compose the post

```
node backend/scripts/compose-post.js announcement --id ANNOUNCEMENT-011 --site https://your-site.example
```

**This reads `textcards.csv` directly, not the registry** — the `textcards` source is
`{ kind: "csv", file: backend/textcards.csv, idField: "textCardId" }` — so it works
before `generate-content-registry.js` has ever run. Drafting is not gated on
publishing.

**`--site` is required here, and this is exactly the case C1 warns about.** Without
it, `resolveSiteUrl()` reads `collectionExternalUrl` from the **first row** of
`master.csv`, and the template ships `https://example.com`. The template is
`{headline}` / `{content}` / `{siteUrl}`, so omitting `--site` produces a post
pointing at example.com — composed successfully, no error, wrong link.

**The character report on stderr.** The post text goes to **stdout**; the report goes
to **stderr** — so `… > post.txt` captures the post while you still see the report. It
prints each line's weighted length, then the total against the limit, then either
`N to spare` or:

```
✗ Over budget by 14. Nothing written — shorten a line above and re-run.
```

Over budget exits `2` and writes nothing to `--out`. **Weighted, not counted:** every
URL counts as 23 regardless of its real length. Default limit is 280 (X free tier);
pass `--limit 25000` for premium.

### C. Post it on X — by hand

**Nothing in this project posts to X.** No script holds a credential or touches an
API. Read the draft in full, post it yourself, and copy the resulting URL — that URL
is the argument step E takes, and it can only exist because a person did this step.

The reading is the point of the boundary, not a formality: it is the last place a
wrong `{siteUrl}`, a placeholder headline or an alt-text mismatch gets caught before
it is public.

### D. Publish the card

```
node backend/scripts/generate-content-registry.js
```

Writes `backend/content-registry.json`, and **also copies to
`frontend/public/content-registry.json`** when that directory exists — if it does not,
you get a warning telling you to copy it manually or pass `--out`.

**It merges; it does not replace.** Cards whose `textCardId` appears in the CSV are
inserted or updated; **every other card already in the registry is carried through
untouched.** The `plan` log line reports `csvRows`, `cardsAdded`, `cardsUpdated`,
`persistentCardsPreserved` and `totalCards` — confirm `cardsAdded: 1` rather than
`cardsUpdated: 1`, which would mean the id already existed.

Then:

```
git add backend/textcards.csv backend/content-registry.json frontend/public/content-registry.json
git add frontend/public/images/announcements/sample-campaign.png
git commit -m "Add ANNOUNCEMENT-011"
git push
```

Then **hard refresh** — the JSON is a static asset and a normal reload serves the
cached copy.

### E. Link the post back

```
node backend/scripts/set-post-url.js ANNOUNCEMENT-011 https://x.com/dadex2026/status/1961234567890123456
```

Then **commit and push again.**

**This second push is the step most often skipped, and it is the entire reason the
`postUrl` column exists.** Without it the card sits on the site with no route to the
thread, and in three months nobody can find the announcement that goes with it — the
exact failure the column was added to prevent.

`set-post-url` **re-runs the content registry generator by default**, so it changes
three files, not one: the CSV plus both registry JSONs. Exit `0` means *written and
regenerated*; `1` is validation failure with nothing written; any other code is the
generator's own. `--no-generate` writes only the CSV — then you must run the generator
yourself before pushing, or the site keeps the old registry.

### F. Categories refused from this CSV

`RANKING`, `LEADERBOARD`, `SCOREBOARD`, `STANDINGS`, `STATS` are rejected outright:

> `Card <id>: category "<CATEGORY>" is a persistent/structured category managed
> directly in content-registry.json, not textcards.csv — its content is a structured
> entries array, not plain text. Remove this row and add/edit it in the JSON registry
> instead.`

Exit `1`, nothing written. Their `content` is an entries array that does not fit a CSV
cell and gets revised often without a full regen. Where they come from instead:

| Card kind | Id prefix | Source of truth | Written by |
|---|---|---|---|
| Simple (NEWS/UPDATE/ANNOUNCEMENT/ANALYSIS) | any | `backend/textcards.csv` | `generate-content-registry.js` |
| Generated standings | `STANDINGS-` | a board file | `generate-standings-cards.js` |
| Hand-authored persistent (RANKING/LEADERBOARD/SCOREBOARD/STATS) | anything except `STANDINGS-` | the registry entry itself | nobody — edit by hand |

**A `STANDINGS-` card must never be hand-edited** — the next generator run overwrites
it. Edit the board and re-run.

### G. Retiring a card

A retired card gets `status` `INACTIVE`, `EXPIRED` or `ARCHIVED`. **Never deletion**,
because `textCardId` is permanent: the id is referenced by the post link, by anything
that recorded it, and by the uniqueness check that stops it being reused. Removing the
row does not free the id; it only makes the card's history unreadable.

### H. Display order

**Featured first, then priority descending, then `publishedDate`.** This card is
`featured: TRUE, priority: 10`, and every existing template row is `FALSE, 0`, so it
leads the grid until another featured card outranks it.

*Unverified in this session — `frontend/src/ui.engine.ts` was not readable. Confirm
there before relying on the priority tie-break.*

---

## PART 2 — DISPOSITION TABLE

| # | File | Path | Disposition | What goes where |
|---|---|---|---|---|
| 1 | Card source | `backend/textcards.csv` | **Edited** — one row appended | The 16-field row above, after `ANNOUNCEMENT-010`. `postUrl` left empty for step E. |
| 2 | Image asset | `frontend/public/images/announcements/sample-campaign.png` | **Created** | Must exist and be committed; a missing file renders broken with no error. |
| 3 | Registry generator | `backend/scripts/generate-content-registry.js` | Run | Reads #1, merges into the existing registry. |
| 4 | Backend registry | `backend/content-registry.json` | **Generated** | Default output. Merged, sorted by `textCardId`. |
| 5 | Frontend registry | `frontend/public/content-registry.json` | **Generated** (copy) | What the site reads. Warning if `frontend/public/` is absent. |
| 6 | Post template | `backend/post-templates/announcement.txt` | Read only | `#source: textcards` · `{headline}` / `{content}` / `{siteUrl}`. |
| 7 | Compose script | `backend/scripts/compose-post.js` | Run | `announcement --id ANNOUNCEMENT-011 --site … [--out …] [--limit …]`. Post → stdout, report → stderr. |
| 8 | Drop registry | `backend/master.csv` | Read only | Only for `collectionExternalUrl` (first row) when `--site` is omitted — `https://example.com` in the template. |
| 9 | Campaign row | `backend/campaigns.csv` | Read only | `sample-campaign-001`, the campaign this card announces. Not touched by C1. |
| 10 | Post-url script | `backend/scripts/set-post-url.js` | Run, after posting | `<textCardId> <url> [--no-generate]`. Edits #1 and re-runs #3. |
| 11 | The X post | x.com | Created by hand | Its URL becomes `postUrl`. |

---

## PART 3 — REFUSALS

1. **Structured category in the CSV** — RANKING / LEADERBOARD / SCOREBOARD /
   STANDINGS / STATS exit `1` with the message above. Nothing written.
2. **Unknown category** — anything outside the four simple categories, exit `1`.
3. **Unknown status** — anything outside DRAFT / SCHEDULED / ACTIVE / INACTIVE /
   EXPIRED / ARCHIVED, exit `1`.
4. **Duplicate `textCardId`** — exit `1`: *"IDs must be unique and are never reused."*
5. **Missing a required field** — `textCardId`, `category`, `headline`, `content`,
   `publishedDate`, `status`.
6. **A post over budget** — exit `2`, nothing written to `--out`.
7. **`compose-post` on an unknown id** — fails and lists the available ids.
8. **Never delete a card**; retire it by status.
9. **Never hand-edit a `STANDINGS-` card**; the generator overwrites it.
10. **The generator will not touch cards absent from the CSV** — persistent cards are
    carried through untouched, which is also why it cannot repair one.
11. **Do not run this sequence in the template itself.** The registry's rule is *never
    run collection commands here*; copy the row shape into your collection instead.

---

## PART 4 — VERIFICATION CHECKLIST

**Before writing the row**

- [ ] `head -1 backend/textcards.csv` shows **16** columns. If 13, run A4 first — steps A (image) and E (postUrl) cannot work.
- [ ] `textCardId` appears nowhere in the file, including retired rows, and continues the **global** number sequence (next free after `ANNOUNCEMENT-010`).
- [ ] The id does not collide across namespaces — `--id` means a `textCardId` to `announcement` and a `dropItemId` to `mint-live`.
- [ ] Category is one of the four simple ones.
- [ ] 15 commas outside quotes; `content` double-quoted; `tags` pipe-delimited.
- [ ] `imageAlt` present because `image` is set, and it describes the picture rather than restating the headline.
- [ ] The image file exists under `frontend/public/…` and is staged, not untracked.

**Composing**

- [ ] `--site` passed — mandatory while `collectionExternalUrl` is `https://example.com`.
- [ ] stderr report read: total under limit, with the "to spare" line.
- [ ] Draft read in full before posting.

**Publishing**

- [ ] `plan` line shows `cardsAdded: 1` — not `cardsUpdated: 1`.
- [ ] `persistentCardsPreserved` matches what it was before.
- [ ] No "frontend/public/ not found" warning.
- [ ] All four paths staged: CSV, both registry JSONs, image.
- [ ] Hard refresh; card renders; image loads; alt text present in the DOM.

**Linking back**

- [ ] `set-post-url` exit `0` (written **and** regenerated).
- [ ] `postUrl` populated in the CSV **and** in both registry JSONs.
- [ ] **Second commit and push done** — the step most often skipped.
- [ ] Card links to the live post after a hard refresh.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `TEXT CARD ID` | C1 collects no id, yet the id is permanent, must be unique, is never reused, and continues a global sequence. Everything downstream (`compose-post --id`, `set-post-url`) takes it. I chose `ANNOUNCEMENT-011`. Proposed C1 field. |
| `SITE URL` | Needed for `--site` whenever `collectionExternalUrl` is a placeholder — which it is in the template, and in every collection until it is set. The post is silently wrong without it. Proposed C1 field. |
| `PRIORITY` | C1 collects `FEATURED` but not `priority`, and the display order runs featured → priority → date. I used `10`; every existing row is `0`. |
| `AUTHOR` | Not collected. I used `System`, matching every existing row. |
| `PUBLISHED DATE` | Not collected; required by the generator. I used today, in the ISO shape the file already uses. |
| `TAGS` | Not collected. I used `campaign\|holder-reward\|sample-001`. |
| `POST LIMIT` | Whether the account is on the 280 free tier or premium (`--limit 25000`) — decides whether a long card can be posted at all. |

---

## APPENDIX — FINDINGS FOR `docs/generation-prompts.md`

Not applied.

| Where | Finding |
|---|---|
| C1 header | Collects no `TEXT CARD ID`, though the id is permanent, unique, never reused, and follows a global number sequence rather than a per-category one. |
| C1 header | Collects no `PUBLISHED DATE`, `AUTHOR`, `TAGS` or `PRIORITY`; the first is required by the generator, and the last decides display order alongside `FEATURED`, which C1 does collect. |
| C1 item B | `--site` is described as conditional. While `collectionExternalUrl` is a placeholder — its shipped state — the post is silently wrong rather than failing, so it is closer to required. Worth a `SITE URL` field. |
| C1 item E | Says "push again" but not that `set-post-url` **re-runs the generator by default**, so the second push covers three files. Someone who stages only the CSV pushes a registry that still lacks the link. |
| C1 item A | Says "all 16 columns". A collection copied before those columns existed has 13 — `my-new-collection` still does. C1 should open with a column count and name **A4** as the remedy, since step E is impossible until then. |
| "What must already exist" | The C1 row names the image file and its alt text. Worth adding: **a `textcards.csv` carrying the 16-column header** — the prerequisite that stays invisible until step E fails. |
