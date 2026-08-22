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

## Delete the example

`EXAMPLE-participants-accuracy.json` exists to prove the pipeline end to end.
Delete it once real boards land.
