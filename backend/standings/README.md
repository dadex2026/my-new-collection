# backend/standings/

One JSON file per **board**. A board is a single ranked list — teams by
consensus, players by consensus, participants by prediction accuracy,
participants by reporting contribution. Four boards, one engine; they are kept
as separate files rather than one document because they are separate
leaderboards with separate movement.

`scripts/generate-standings-cards.js` reads every `*.json` here and publishes
two things:

- **`frontend/public/standings.json`** — the boards themselves, in full. This is
  the artifact. It carries every entry, not just the ones the card shows, so a
  reader can check a rank rather than take it on trust.
- **persistent cards in `content-registry.json`** — a *projection* of each board
  into the news grid's RANKINGS tab.

Never hand-edit a generated card. Edit the board and re-run the script; the
generator owns every card whose id starts with `STANDINGS-` and carries every
other card through untouched.

## The rules the generator enforces

**It never scores anything.** Ranks, scores and movement arrive already settled.
Projection is formatting, not arithmetic — which is what makes a published card
reproducible from its board file.

**Movement is rendered, never computed.** An entry without a `movement` object
gets a blank cell, not an invented one. `state` must be one of `up`, `down`,
`hold`, `new`, `returning` — a first-round participant shows *new*, not a
fabricated jump from nowhere.

**Entries must already be in rank order.** Ranks that jump around usually mean
the list was re-sorted by score after ranking, which quietly breaks the movement
column.

**An incomplete capture is a hard failure.** A board with
`capture.complete: false` is refused, because a response that was never captured
is indistinguishable from a participant who did not play. Fix the capture and
re-run, or pass `--allow-incomplete` to publish it `INACTIVE` for review rather
than as a final standing.

**Boards are retired, not deleted.** Remove a board file and its card is marked
`ARCHIVED` on the next run rather than disappearing, so its history survives.

**A card never cuts a tie in half.** `cardLimit` bounds how many rows reach the
card, but the slice extends through the whole tie group at the cut line — under
competition ranking (1, 2, 2, 4) a plain slice at 10 could show one of three
entries sharing rank 10 and drop the other two. A limit of 10 may therefore
publish 12 rows.

**Truncation is stated, not silent.** When a card shows fewer rows than its board
holds, it renders *Showing top N of M* beneath the table. The full list reaches
`standings.json` regardless of `cardLimit`.

## Board fields

| Field | Required | Notes |
|---|---|---|
| `boardId` | yes | Unique. Becomes the card id, uppercased, prefixed `STANDINGS-`. |
| `title` | yes | Card headline. |
| `track` | yes | `consensus`, `prediction` or `reporting`. Sets the default card category. |
| `entityType` | yes | `participant`, `team`, `player`, … Kept as a dimension so teams and players stay separate boards. |
| `seasonId` | yes | A season is a scope, not a reset — every board states which one it belongs to. |
| `rulesetVersion` | yes | Stamped so a standing always traces to the rules that produced it. |
| `entries` | yes | Rank-ordered. Each needs `rank` and `name`. |
| `subtitle` | no | Defaults to `Season <id> · through <round>`. |
| `throughRound` | no | Used in the default subtitle. |
| `promptVersion` | no | Which extraction prompt version produced the underlying parses. |
| `capture` | no | `{ complete, method, capturedAt }`. Absent is treated as complete. |
| `eligibility` | no | e.g. `{ minEntries: 3 }`. Published for transparency; not enforced here. |
| `columns` | no | Which fields the card shows, in order. Defaults to rank, name, score, movement. |
| `cardLimit` | no | How many rows reach the card. Default 10. The full list still reaches `standings.json`. |
| `cardCategory` | no | Override the default category for the track. |
| `priority`, `featured` | no | Ordering within the news grid. |
| `example` | no | Marks sample data. Tagged `example` on the card. |

Per-entry, `rank` and `name` are required; `score`, `rate`, `entries`,
`previousRank` and `movement` are optional, and anything else goes in a
`fields` object to appear as an extra column.

## Where boards come from

Two importers produce them, and both write the same board format.

**`import-community-boards.js`** handles the participant leaderboard, where four
sorts, provisional handling, per-prediction evidence and the reconciliation gate
all matter. One export in, four boards out.

**`import-ranked-boards.js`** handles everything else — games, racing, poker,
player stats, category rankings. It works because every ranked export from
either Ledger has the same shape: `Position` first, a label column, a value
column, extras after. So a board is a *declaration* rather than a bespoke
importer.

Declare them in `_input/boards.json` and put dated exports in `_input/boards/`:

```json
{ "boards": [
  { "boardId": "nfl-games",
    "title": "NFL · Games by Final Value",
    "blurb": "Close, competitive games weight up; blowouts weight down.",
    "track": "subject", "entityType": "game",
    "filePrefix": "nfl-ranked",
    "labelColumn": "Matchup", "scoreColumn": "FinalValue",
    "fields": ["Date", "Winner", "Spread", "Total"],
    "columns": ["rank", "name", "score", "Winner", "movement"] } ] }
```

Rank comes from the export's own `Position` column — already competition-ranked
by the source — so nothing is recomputed here either. Movement replays across
the dated exports matching `filePrefix`, exactly as the community importer does.

`track` is one of `subject`, `consensus`, `prediction`, `reporting`. Use
**`subject`** for things ranked by a value the source computed — a game by its
final value, an artist by total points. **`consensus`** is reserved for ranking
those same subjects by what participants collectively predicted, which no source
produces yet.

### A worked import, start to finish

Four files, then one command. This example was run end to end; the numbers
below are what it actually produced.

**1 — `_input/import-config.json`.** Three values ship as placeholders and all
three matter:

```json
"collectionTitle": "Sports Ledger",
"seasonId": "2026-NFL",
"rulesetPrefix": "nfl-ledger",
```

**2 — `_input/rulesets.json`.** Delete the `_example` block and declare the
version the exports carry:

```json
"rulesets": {
  "nfl-ledger-v1.0": {
    "kind": "baseline",
    "effectiveFrom": "2026-08-01",
    "note": "First imported version."
  }
}
```

Skip this and the import stops with *ruleset not declared in rulesets.json —
tried "v1.0" and "nfl-ledger-v1.0"*. The importer tries the bare stamp first,
then the prefixed form, and names both — which also tells you whether
`rulesetPrefix` is set the way you think it is. That refusal is the point: an unfamiliar build becomes
a decision rather than something stamped with a stale value.

**3 — `_input/boards.json`.** Seven fields are required: `boardId`, `title`,
`track`, `entityType`, `filePrefix`, `labelColumn`, `scoreColumn`. Optional:
`blurb`, `idColumn`, `fields`, `columns`, `seasonId`. (The example above shows
all of them together, which does not distinguish the two.)

**4 — `_input/boards/nfl-ranked-2026-08-23.csv`.** One file per round:

```
Position,GameId,Matchup,Date,Winner,Spread,Total,FinalValue,AppVersion
1,g-1305,Bills at Chiefs,2026-08-23,Chiefs,-1.5,48.5,71,v1.0
```

Three requirements the prose above implies without stating:

- **A column named literally `Position`.** Not configurable. Rows lacking it
  are dropped **silently** — unlike every other failure here, nothing is
  reported, so the check is comparing the export's row count against the
  published board's entry count. Note also that the example row above carries a
  `GameId`; the Sports Ledger's documented Games export does not include one, so
  a stable id is something to ask the source for rather than assume.
- **A `YYYY-MM-DD` in the filename.** No date is a hard error — the round is
  read from the name rather than file mtime, so a copied or restored export
  keeps its place in the replay.
- **`AppVersion`**, if the export stamps its build. It is joined to
  `rulesetPrefix`, so `v1.0` resolves to `nfl-ledger-v1.0`. Without the column
  the importer falls back to `config.rulesetVersion`, which must also be
  declared.

Then:

```powershell
node backend/scripts/publish-round.js
```

`publish-round.js` runs `import-ranked-boards.js`, then
`generate-standings-cards.js`, then `generate-methodology.js` — the order they
must run in, stopping at the first failure. Every step's log still prints.
Run them individually if you want to inspect the board between steps.

Two dated exports produced `nfl-games.json` — *3 entries from 2 rounds* — with
movement `up 1`, `up 1`, and `new` for the game that had not appeared before.

**Movement needs two rounds.** A single export marks everything `new`, which is
correct and looks empty. Arrows appear from the second round on.

**Set `idColumn` whenever a label can change.** Matching defaults to
`labelColumn`, so a rename or relocation reads as one entity leaving and another
arriving — resetting a standing with no error and no trace.

**The board file is output, not input.** Every run overwrites it, so anything
hand-added is lost on the next import. Even the subtitle is generated
(`blurb` + `Round N · date`) — edit the declaration, not the board.

## When the source uses different column names

The two Ledgers agree on board shape but not on labels. Sports writes
`FinalPoints`, `SkillEdge` and `Predictions` where Entertainment writes `Points`,
`Edge` and `Resolved`. Add a `columnMap` to `import-config.json` and the
community importer reads either:

```json
"columnMap": { "Points": "FinalPoints", "Edge": "SkillEdge", "Resolved": "Predictions" }
```

Mapping is additive — original headers stay on the row — and a collection whose
source already uses the logical names needs no entry at all.

## Running a contest

A contest is a board, and the first decision is **whether it recurs** — because
that decides which of the two paths above produces the board file, and it is
awkward to change later.

### Recurring: declare it once, drop a file each round

**This is the default.** A weekly contest goes through `import-ranked-boards.js`
like any other repeating board. Declare it once in `_input/boards.json`:

```json
{ "boardId": "weekly-total-contest",
  "title": "Highest Total Contest",
  "blurb": "Closest call on the week's highest-scoring game.",
  "track": "prediction", "entityType": "participant",
  "filePrefix": "contest-ranked",
  "idColumn": "Handle", "labelColumn": "Handle", "scoreColumn": "OffBy",
  "fields": ["Called", "Pick", "OffBy"],
  "columns": ["rank", "name", "Called", "OffBy", "movement"] }
```

Then each round is one dated export in `_input/boards/`:

```
Position,Handle,Called,Pick,OffBy,AppVersion
1,@overunder_owen,58,Jets at Patriots,2,v1.0
2,@gridiron_gwen,54,Jets at Patriots,6,v1.0
3,@newcomer_nate,49,Bears at Vikings,11,v1.0
```

**Movement is the reason.** Replaying the dated exports produces `▲ 1`,
`▼ 1`, `new` without you stating any of it. Hand-writing means looking up every
entrant's previous rank and typing `previousRank` and `movement` yourself, every
round — tolerable for three entrants, miserable for thirty, and a fresh
opportunity to be wrong each time.

Two contest-specific notes on the declaration:

- **`scoreColumn` is required, but a closest-call contest has no score** —
  lower is better. Point it at `OffBy` to satisfy the requirement, then leave
  `score` out of `columns` and list `OffBy` in `fields`. The card then shows a
  column headed **OffBy** rather than a misleading **score**.
- **`idColumn`** should be the handle, not a display name, so a participant who
  changes their display label keeps their movement chain.

### One-off: write the board by hand

For a contest that genuinely does not repeat, the scaffolding above is more work
than the result. Write a board file directly in this folder — see *A worked
import* above for the required fields, and *Writing the entries* below for rank
order and ties.

The filename is yours; `boardId` is the identity. The card it produces is
`STANDINGS-` plus the boardId uppercased, so `nfl-w14-total-contest.json`
becomes `STANDINGS-NFL-W14-TOTAL-CONTEST`.

Everything shows as `new`, which is correct — there is no earlier round.

### Don't hand-write round 1 and import from round 2

The seam does not join. `import-ranked-boards.js` replays only across exports it
can see, so if round 1 was a hand-written board and round 2 arrives as an export,
round 2 shows **every** entrant as `new` — as though the contest had never run.

If a contest might recur, start it on the import path even for the first round.
If you have already hand-written round 1, either back-fill it as a dated export
so the replay has both, or accept one round of missing arrows and let it correct
itself from round 3.

### Whichever path

Reuse the `boardId` across rounds. A folder of `week-1`, `week-2`, `week-3`
boards produces a wall of cards, none of which can show movement.

Removing a contest's file marks its card `ARCHIVED` on the next run rather
than deleting it, so a finished contest stays readable.

Fields that earn their keep in a contest specifically:

| Field | Why |
|---|---|
| `eligibility.minEntries` | **Hand-written boards only.** `import-ranked-boards.js` hardcodes `eligibility: null`, so nothing you declare in `boards.json` reaches an imported board. `import-config.json`'s `minPicks` is a *community-importer* threshold and is never read by the ranked importer either — see *What the ranked importer does not carry* below. |
| `eligibility.note` | Publishes from a hand-written or community board; **discarded on the ranked import path**. Put the tiebreak here *and* in the announcement `content`, because competition ranking will happily show three people at rank 1 and will not choose between them — and on the import path the announcement is the only place the tiebreak survives. |
| `entries[].fields` | Where contest detail lives: what someone picked, what they called, what the result was. `columns` controls the card; `fields` carries everything else through to `standings.json` and to posts. |
| `capture.complete` | **Hand-written and community boards.** Set `false` if any entry went uncaptured and `generate-standings-cards.js` refuses the run — correct, since a missed entry is indistinguishable from someone who didn't play. The ranked importer writes `complete: true` unconditionally; see below. |

### What the ranked importer does not carry

`import-ranked-boards.js` builds each board from the declaration plus the dated
export, and three things you might reasonably expect to survive that trip do
not. Checked against the importer, not inferred:

| Declared | What actually reaches the board |
|---|---|
| `eligibility` (any shape) | **Dropped.** The importer writes `eligibility: null` unconditionally. A declared `minEntries` or `note` never publishes. |
| `minPicks` in `import-config.json` | **Never read.** The ranked importer reads only `seasonId`, `cardLimit`, `rulesetPrefix` and `rulesetVersion`. `minPicks` is a community-importer threshold. |
| `capture.complete` | **Forced to `true`**, with `method: "ledger-export"`. Not authorable from the declaration. |

The `minPicks` one has a second half worth stating plainly: **a ranked board is
the latest round, not a cumulative season table.** Every export is replayed to
compute movement, but the entries written are the last export's rows. There is
no accumulating count of settled predictions per handle for a provisional
threshold to act on — which is why the concept belongs to the community
importer, whose exports carry exactly that count.

The practical consequence for a contest: anything you want a reader to know
that is not a column in the export has to live in the announcement `content` or
in `entries[].fields`. Those are the two channels that survive.

### Writing the entries

Applies to a hand-written board. On the import path the exports carry rank and
the importer handles ordering — but the tie decision below is still yours,
because it is made in the source when you score the round.

Two things are your job before the file is valid, and only one of them is
checked.

**Rank order is enforced.** The generator refuses a board whose ranks go
backwards — *"entries are not in rank order (rank 1 follows rank 2)"* — because
that almost always means the list was re-sorted by score after ranking, which
quietly breaks the movement column. It does **not** sort for you, and it does
**not** check that your ranking is *correct*: nothing verifies rank 1 is
actually the best entry. The check catches a shuffled file, not a wrong one.

**Ties are yours to decide, and the decision is visible.** Ranking is
competition-style, so two entries sharing a position both take the lower
number and the next entry skips one: 1, 1, 3. Nothing will break that tie for
you. So before writing the file, decide which you are publishing:

- **A tie you accept** — give both entries the same `rank`. The card shows
  1, 1, 3, and `cardLimit` extends through the whole tie group rather than
  cutting it. Correct when the prize splits or there is no prize.
- **A tie you broke** — apply your declared tiebreak, give distinct ranks, and
  put the evidence in `fields` (the deciding timestamp, say). Correct when one
  prize has to go to one person.

What you must not do is leave a tie in the data while writing copy that names
a single winner. `contest-result.txt` renders `{entry[n].rank}` rather than
hardcoded positions precisely so a post cannot claim a sole winner the board
does not support — an unbroken tie posts as *1., 1., 3.*

**Score direction is a trap in closest-call contests.** Ranking is by error,
where lower is better, and a board cannot express direction — a `score` column
reading 1, 5, 8 looks like the winner scored worst. Don't force one. Put the
real quantities in `fields` under names that say what they are:

```json
"columns": ["rank", "name", "Called", "Off by", "movement"],
"entries": [
  { "rank": 1, "name": "@gridiron_gwen",
    "fields": { "Pick": "Dolphins at Chargers", "Called": "70", "Off by": "1" } }
]
```

and put the answer in `subtitle` — *"Actual highest total: 71 — Dolphins at
Chargers"* — so a reader can check the arithmetic.

Then publish and post:

```powershell
node backend/scripts/publish-round.js --from standings
node backend/scripts/compose-post.js contest-result --id <boardId>
```

The announcement that *opens* a contest is not a board — there are no entries
yet, so there is nothing to rank. That is a row in `backend/textcards.csv`,
posted with the `announcement` template. See `docs/post-generator-spec.md`.

### Closing a contest

Nothing in this project closes one. "Closed" is three separate things that do
not line up on their own.

**Entries stop when you stop reading.** The deadline is a promise made in the
announcement's `content` — *"before Sunday 12:00 ET"* — enforced by nobody. A
reply posted at 12:01 is excluded because you closed your capture, not because
anything rejected it. On X itself the only real close is changing who can reply
on the post, which is a manual action in X's own interface.

**`capture.complete` is your assertion that you got everyone.** Set it `false`
and the generator refuses to publish a final standing, which is correct — a
reply you missed is indistinguishable from someone who did not play. This is
authorable on a hand-written board and set from the export on a community
board. It is **not** authorable on the ranked import path: that importer writes
`complete: true` unconditionally, and `publish-round.js` runs the import and the
card generator back to back, so there is no seam to change it in.

**`expiresAt` does not mean closed. It only hides the card.** This is the trap.
`isTextCardVisible()` drops any card whose `expiresAt` has passed, whether or
not you have scored anything. Set `expiresAt` to the entry deadline, publish
results on Monday, and there is a window where the announcement card has
vanished and the standings card does not exist yet — the contest is invisible
on the site precisely while people are waiting for results.

Two ways to avoid it:

- **Set `expiresAt` past the results date**, not to the deadline. The
  announcement stays up through scoring and goes when it is genuinely stale.
- **Leave `expiresAt` empty** and retire the card by hand once results are
  live, flipping `status` to `INACTIVE`.

The second is more deliberate; the first is fewer steps.

**The closing sequence in practice**

1. At the stated time, capture the replies — copy them somewhere before
   anything can change.
2. Optionally restrict replies on the X post so late entries stop accumulating.
3. Score the round.
4. Publish: `publish-round.js`, then push.
5. `compose-post.js contest-result`, read it, post it — **as a reply to the
   announcement thread**, not standalone. It closes the loop where people are
   already looking.
6. Retire the announcement card, if you left `expiresAt` empty.

**Lateness on a Ledger board is a scoring verdict, not a capture filter.** The
human decides what is captured; the Ledger decides what is late, from
timestamps. It compares absolute instants when both sides carry times, falls
back to calendar dates when they do not, and returns `unknown` rather than
guessing when a same-day comparison has a missing time — scoring the prediction
normally and flagging it instead of silently picking a side.

**And that verdict reaches published data.** `attachEvidence()` hangs an
`evidence` object off every entry on a community board, and it lands in
`frontend/public/standings.json`:

```json
{ "date": "2026-08-14 11:30 -05:00",
  "url": "https://x.com/popcritic/status/1003",
  "late": false, "pending": false, "counts": true,
  "settledBy": "register", "excludedReason": null }
```

Per-prediction timestamp, `late` and `counts` flags, an `excludedReason`, and a
link to the source post — plus per-entry totals for `counting`, `excluded`,
`pending` and `late`. So a disputed late entry **is** settleable from published
data: you point at the prediction's own timestamp and the announcement it was
measured against, not at your capture process.

**The real gap is reachability, not missing data.** A card shows rank, name,
score and movement. Nothing surfaces the evidence, so a reader looking only at
the card sees a rank with no way to check timing — the same problem as
`standings.json` being published and unlinked, one level down. Don't add a
duplicate timestamp field alongside one that is already there; the fix is to
surface what exists.

**Two cases where the evidence genuinely is absent:** boards from
`import-ranked-boards.js`, and hand-written one-off contests. Neither carries an
`evidence` object. There, if lateness could be contested, put the posted time in
`fields` (`"Posted": "2026-08-31T11:58Z"`) and state the cut-off in
`eligibility.note`. Note the asymmetry: on a board from
`import-ranked-boards.js` the `fields` entry **publishes** and `eligibility.note`
**does not**, because that importer discards eligibility. On a hand-written
board both publish. Either way `fields` is the one that always survives, so put
the posted time there.

### The whole round, as a run-sheet

Two halves, with the contest itself running between them. `generate-methodology.js`
used to be the step most often skipped — leaving the site describing the previous
round's rules — which is why `publish-round.js` now runs it rather than leaving it
to be remembered.

```text
═══ ONCE PER BOARD ═══════════════════════════════════════════════
                                                ▲ = human judgment
  _input/import-config.json     collectionTitle, seasonId, rulesetPrefix
  _input/rulesets.json          declare the version the exports carry
  _input/boards.json            declare the board (7 required fields)
                                └─ never again for this contest series


═══ OPENING ══════════════════════════════════════════════════════

  backend/textcards.csv               add the ANNOUNCEMENT row
        │                             rules in `content`
        │                             expiresAt PAST the results date
        ▼
  compose-post.js announcement        --id <textCardId>
        │                             reads the CSV, not the registry
        ▼
▲ you read it, you paste it to X      the script never posts
        │
        ▼
  set-post-url.js <cardId> <url> ─┬─→ writes postUrl into textcards.csv
        │                         └─→ runs generate-content-registry.js
        ▼
▲ git push ─→ Netlify                 card live, with Discussion → link


═══ THE CONTEST RUNS ═════════════════════════════════════════════
        nothing happens in the project; replies accumulate on X


═══ CLOSING ══════════════════════════════════════════════════════

▲ capture the replies                 THE LOCK — nothing enforces
        │                             the deadline but you
        ▼
▲ Ledger computes the round           the only place scoring happens
        │                             lateness decided here, from timestamps
        ▼
  CSV export
        │
        ▼
▲ _input/boards/<prefix>-YYYY-MM-DD.csv    you move the file by hand
        │                                  the date places it in the replay
        ▼
  publish-round.js ─┬─→ import-ranked-boards.js    ranks copied,
        │           │                              movement replayed
        │           │      ↓ backend/standings/<boardId>.json
        │           │
        │           ├─→ generate-standings-cards.js
        │           │      ↓ backend/content-registry.json
        │           │      ↓ frontend/public/content-registry.json
        │           │      ↓ frontend/public/standings.json
        │           │
        │           └─→ generate-methodology.js     re-derives boards,
        │                                           rulesets, sources
        │      stops at the first failure; every log line still prints
        ▼
▲ git push ─→ Netlify                 standings card live
        │
        ▼
  compose-post.js contest-result      --id <boardId>
        │                             reads standings.json, not the card
        ▼
▲ you read it, you paste it to X      as a reply to the announcement thread


═══ ONE-OFF VARIANT ══════════════════════════════════════════════

  hand-write backend/standings/<boardId>.json
        │      no declaration, no export, no _input/ scaffolding
        ▼
  publish-round.js --from standings
```

**Six steps carry a `▲`, and none of them collapse into a command.** Reading
each post before sending, the capture decision, scoring, and both pushes. The
capture step is the one that looks automatable and is not — it is where a person
decides what counts, and `capture.complete: true` is that assertion.

**Checklist for a round**

- [ ] Ruleset version the export carries is declared in `_input/rulesets.json`
- [ ] Export filename contains its `YYYY-MM-DD`
- [ ] `publish-round.js` — all three steps report success
- [ ] Import log reports the expected round count
- [ ] Movement looks right: round 1 all `new`, later rounds show arrows
- [ ] `git add backend/standings backend/content-registry.json frontend/public`
- [ ] Push, and confirm Netlify finished before checking the live site
- [ ] `compose-post.js contest-result` — read it before pasting
- [ ] Paste to X

**Where the boundary actually sits.** The Ledger is the only place a *score* is
computed, and nothing on this side ever recalculates one. Two ordering values
are derived here, both positional and neither able to change what anyone
scored: **movement**, replayed from the dated exports, and **competition ranks**
where the export did not supply them — `import-community-boards.js` assigns
1, 2, 2, 4 for the three sorts whose order the file's `Position` column does not
already fix. "The project never re-derives positions" is the wrong summary;
"the project never computes a score" is the right one.

## Delete the example

`EXAMPLE-participants-accuracy.json` exists to prove the pipeline end to end.
Delete it once real boards land.
