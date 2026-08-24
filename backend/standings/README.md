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

A contest is a board. There is no separate contests file and nothing to
register it in — **one JSON file in this folder is one contest**, and dropping
it here is the whole act of creating it.

The filename is yours; `boardId` is the identity. The card it produces is
`STANDINGS-` plus the boardId uppercased, so `nfl-w14-total-contest.json`
becomes `STANDINGS-NFL-W14-TOTAL-CONTEST`.

**For a new contest, the decision that matters is whether to reuse the
boardId.**

- **A new `boardId`** — a new board, a new card, its own history. Everyone
  shows as `new`, because there is no earlier position to move from. Right for
  a one-off, or for contests that don't compare to each other.
- **The same `boardId`, entries replaced each round** — one board that updates,
  one card, and movement arrows work from the second round on because
  positions are compared against the previous run. Right for a weekly contest
  with recurring participants.

Reusing the id is usually what you want for anything recurring; a folder of
`week-1`, `week-2`, `week-3` boards produces a wall of cards, none of which
can show movement.

Removing a contest's file marks its card `ARCHIVED` on the next run rather
than deleting it, so a finished contest stays readable.

Fields that earn their keep in a contest specifically:

| Field | Why |
|---|---|
| `eligibility.minEntries` | The provisional threshold defaults to 3 via `import-config.json`'s `minPicks`. A single-round contest wants `1`, or the whole field is provisional and sinks. |
| `eligibility.note` | This publishes. Put the tiebreak here — competition ranking will happily show three people at rank 1 and will not choose between them. |
| `entries[].fields` | Where contest detail lives: what someone picked, what they called, what the result was. `columns` controls the card; `fields` carries everything else through to `standings.json` and to posts. |
| `capture.complete` | Set `false` if any entry went uncaptured, and the run is refused — which is correct, since a missed entry is indistinguishable from someone who didn't play. |

### Writing the entries

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
node backend/scripts/generate-standings-cards.js
node backend/scripts/generate-methodology.js
node backend/scripts/compose-post.js contest-result --id <boardId>
```

The announcement that *opens* a contest is not a board — there are no entries
yet, so there is nothing to rank. That is a row in `backend/textcards.csv`,
posted with the `announcement` template. See `docs/post-generator-spec.md`.

## Delete the example

`EXAMPLE-participants-accuracy.json` exists to prove the pipeline end to end.
Delete it once real boards land.
