# Worked run — E5, one-off contest written by hand

**Driven by prompt E5** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and the scripts disagree, the scripts win.
`backend/standings/README.md` ("One-off", "Writing the entries", "What the ranked
importer does not carry") and `publish-round.js` are authoritative.

**Applicable project: `TEMPLATE-TEST-LEDGER`.** Its declared ruleset versions are real,
so `rulesetVersion` below names a version that actually exists, and its entertainment
subject matter matches the boards already published there.

---

## SAMPLE HEADER

### E5 — One-off contest, hand-written

```
I want to run a genuinely one-off contest — it will not recur.

COLLECTION:       TEMPLATE-TEST-LEDGER
BOARD ID:         emmys-2026-drama-oneoff
TITLE:            Emmys 2026 · Outstanding Drama — closest call
TRACK:            prediction
ENTITY TYPE:      participant
SEASON ID:        2026
RULESET VERSION:  entertainment-ledger-v1.4
SUBTITLE:         The winner took 4 of 8 categories. Closest call takes it;
                  ties broken by earliest reply.
ENTRIES:          @popcritic called 4 (exact) · @showrunner called 5 (off by 1)
                  · @bingewatch called 5 (off by 1) · @latetothe called 4
                  (off by 0, posted after the cut-off)
```

---

## PART 1 — RUNBOOK

### 1. First, confirm this path is the right one

**You are choosing the hand-written path deliberately, and it has one cost that cannot
be paid later: if this contest ever recurs, round 2 shows every entrant as `new`.**
`import-ranked-boards.js` replays movement only across exports it can see, so a
hand-written round 1 followed by an imported round 2 leaves a seam that does not join —
as though the contest had never run.

**If there is any chance of recurrence, use the import path even for round one.**
Already hand-wrote round 1? Two repairs: back-fill it as a dated export so the replay
sees both rounds, or accept one round of missing arrows and let it correct itself from
round 3.

And whichever path: **reuse the `boardId` across rounds.** A folder of `week-1`,
`week-2`, `week-3` boards produces a wall of cards, none of which can show movement.

### 2. The board file

`backend/standings/emmys-2026-drama-oneoff.json` — the filename is yours; `boardId` is
the identity.

```json
{
  "boardId": "emmys-2026-drama-oneoff",
  "title": "Emmys 2026 · Outstanding Drama — closest call",
  "subtitle": "The winner took 4 of 8 categories. Closest call takes it; ties broken by earliest reply.",
  "track": "prediction",
  "entityType": "participant",
  "seasonId": "2026",
  "rulesetVersion": "entertainment-ledger-v1.4",
  "eligibility": {
    "minEntries": 1,
    "note": "Replies posted before 2026-08-23 20:00 -05:00 only. Ties broken by earliest reply timestamp."
  },
  "capture": { "complete": true },
  "cardLimit": 10,
  "columns": ["rank", "name", "Called", "Off by", "movement"],
  "entries": [
    { "rank": 1, "entityId": "@popcritic", "name": "@popcritic",
      "fields": { "Pick": "Outstanding Drama", "Called": 4, "Off by": 0, "Posted": "2026-08-23 18:42 -05:00" } },
    { "rank": 2, "entityId": "@showrunner", "name": "@showrunner",
      "fields": { "Pick": "Outstanding Drama", "Called": 5, "Off by": 1, "Posted": "2026-08-23 19:05 -05:00" } },
    { "rank": 2, "entityId": "@bingewatch", "name": "@bingewatch",
      "fields": { "Pick": "Outstanding Drama", "Called": 5, "Off by": 1, "Posted": "2026-08-23 19:51 -05:00" } }
  ]
}
```

**Required:** `boardId`, `title`, `track`, `entityType`, `seasonId`, `rulesetVersion`,
`entries` — and per entry, `rank` and `name`.
**Worth setting for a contest:** `subtitle`, `eligibility.note`,
`eligibility.minEntries: 1`, `columns`, `cardLimit`, `capture`.

`rulesetVersion` must name a version declared in `_input/rulesets.json`;
`entertainment-ledger-v1.4` is real in this collection.

### 3. The card id is derived, not chosen

`STANDINGS-` plus the boardId **uppercased**:

```
emmys-2026-drama-oneoff.json  →  STANDINGS-EMMYS-2026-DRAMA-ONEOFF
```

You do not write it anywhere. Removing the board file later marks that card
`ARCHIVED` on the next run rather than deleting it, so a finished contest stays
readable.

### 4. Everything shows as `new` — correct

There is no earlier round. Do not go looking for a bug.

### 5. Score direction — the trap in a closest-call contest

**A board cannot express direction.** A score column reading 1, 5, 8 looks like the
winner scored worst, because every ranked view in this system sorts highest-first.

**So do not force a score at all.** Note what the JSON above does *not* have: no
`score` key on any entry. The real quantities live in `entries[].fields` under names
that say what they are — `Called`, `Off by`, `Pick` — and the answer lives in
`subtitle`, so a reader can check the arithmetic themselves. `columns` shows `Called`
and `Off by` on the card; `fields` carries everything through to `standings.json` and
to posts.

### 6. Lateness, without an evidence object

**A hand-written board carries no evidence object** — that is generated on the import
and community paths, not here. So if lateness could be contested, do the two things
that cost nothing and both publish:

- put the posted time in `fields` (`"Posted": "2026-08-23 18:42 -05:00"`), and
- state the cut-off in `eligibility.note`.

`@latetothe` from the header is the case: an exact call, posted after the cut-off, so
not an entry. The note is what makes that decision checkable rather than asserted.

**And `eligibility` only publishes from here.** `import-ranked-boards.js` writes
`eligibility: null` unconditionally, so a `minEntries` or `note` declared in
`boards.json` never reaches an imported board — which is exactly why the tiebreak must
also go in the announcement `content` on that path. Same for `capture`: the ranked
importer writes `complete: true` unconditionally, so the `capture.complete` refusal can
only fire for hand-written and community boards. Here it can, and it is honest.

### 7. Publish

```
node backend/scripts/publish-round.js --from standings
```

**The flag exists for exactly this case** — there is no export to import, so without it
the wrapper cannot be used for a one-off at all. It still runs
`generate-standings-cards.js` and `generate-methodology.js` in order, stopping at the
first failure, with every log line printing.

Then `git add backend/standings backend/content-registry.json frontend/public`,
commit, push, and confirm the deploy finished.

### 8. The result post

```
node backend/scripts/compose-post.js contest-result --id emmys-2026-drama-oneoff
```

`--id` matches the `boardId`, and the template reads
`frontend/public/standings.json` — the published artifact, not the board file and not
the card. So compose **after** publishing, not before.

Then read it, and post it yourself as a reply to the announcement thread. **Nothing
posts it for you.** If you wrote an announcement card, `set-post-url.js <textCardId>
<url>` records the link, and that needs a second push.

**On the tie:** `@showrunner` and `@bingewatch` both sit at rank 2, and competition
ranking will happily show two people there without choosing between them. The
`eligibility.note` says earliest reply breaks it — so either break it in the data
(distinct ranks, with `Posted` as the deciding evidence) or accept it and let the post
name both. `contest-result.txt` renders `{entry[n].rank}` rather than hard-coded
positions precisely so a post cannot claim a sole winner the board does not support.

---

## PART 2 — DISPOSITION TABLE

| # | File | Path | Disposition | What goes where |
|---|---|---|---|---|
| 1 | Board file | `backend/standings/emmys-2026-drama-oneoff.json` | **Created by hand** — the only board file in this system that is an input | Required fields, `entries[].fields`, `eligibility`, `capture`, `subtitle`. |
| 2 | Rulesets | `_input/rulesets.json` | Read only | Must already declare `entertainment-ledger-v1.4`. |
| 3 | `_input/boards.json` | | **Not touched** | A hand-written board is not declared there; declarations drive the importer. |
| 4 | `_input/boards/` | | **Not touched** | No export exists — hence `--from standings`. |
| 5 | Wrapper | `backend/scripts/publish-round.js` | Run with `--from standings` | Skips the import step. |
| 6 | Content registry | `backend/content-registry.json` | **Edited by generator** | Adds `STANDINGS-EMMYS-2026-DRAMA-ONEOFF`. |
| 7 | Frontend registry | `frontend/public/content-registry.json` | **Generated** (copy) | |
| 8 | Standings artifact | `frontend/public/standings.json` | **Generated** | What `compose-post.js` reads. |
| 9 | Methodology | `frontend/public/methodology.json` | **Generated** | |
| 10 | Result post | stdout | **Generated** | Read, then posted by hand as a reply. |

---

## PART 3 — REFUSALS

1. **`capture.complete: false` refuses the run** — and on this path the flag is real,
   unlike the ranked import which writes `true` unconditionally.
2. **Entries not in ascending rank order are refused**, naming the two ranks.
3. **An undeclared `rulesetVersion`** stops the publish.
4. **Nothing breaks a tie for you.** Competition ranking shows 1, 1, 3 and waits.
5. **A board cannot express score direction** — do not add a score column to a
   closest-call contest.
6. **`eligibility` and `capture` do not survive the ranked import path**, so nothing
   written here transfers if this contest later becomes an imported one.
7. **Removing the board file archives its card**; it never deletes it.
8. **Nothing posts to X.**

---

## PART 4 — VERIFICATION CHECKLIST

**Before writing the file**

- [ ] This contest genuinely will not recur — otherwise use the import path for round one.
- [ ] `boardId` is the one you would reuse if it did recur.
- [ ] `rulesetVersion` names a version declared in `_input/rulesets.json`.

**The file**

- [ ] All required fields present; every entry has `rank` and `name`.
- [ ] Ranks ascend, competition-style (1, 2, 2, 4 — not 1, 2, 2, 3).
- [ ] **No `score` key** in a closest-call contest; quantities live in `fields`.
- [ ] `subtitle` states the answer so the arithmetic is checkable.
- [ ] `eligibility.note` states the cut-off and the tiebreak.
- [ ] `Posted` times in `fields` for anyone whose timing could be contested.
- [ ] `capture.complete` set honestly.

**Publishing**

- [ ] `publish-round.js --from standings` — the flag is not optional here.
- [ ] Card `STANDINGS-EMMYS-2026-DRAMA-ONEOFF` appears; nobody hand-edits it afterwards.
- [ ] Everything shows `new`.
- [ ] Pushed; deploy finished.

**Posting**

- [ ] Composed **after** publishing — the template reads the published artifact.
- [ ] The tie is either broken in the data or acknowledged in the copy.
- [ ] Posted by hand as a reply to the announcement thread.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `CUT-OFF TIME` | E5 tells the runbook to state the cut-off in `eligibility.note` and to put posted times in `fields`, but never collects the cut-off itself. It is the one value the lateness decision rests on. |
| `TIEBREAK` | Same shape: E5's own guidance says put the tiebreak in the note, and the header has no field for it. E1 collects `TIEBREAK`; E5 does not. |
| `ANNOUNCEMENT CARD ID` | The result post is a reply to the announcement thread, and `set-post-url.js` needs the card id. Not collected. |
| `CAPTURE COMPLETE` | The refusal is real on this path and the header never asks. |
| `COLUMNS` | Which fields show on the card versus which merely publish — a real display decision, uncollected. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| E5 header | Collects neither `CUT-OFF TIME` nor `TIEBREAK`, though its own cover items instruct the runbook to publish both. E1 already collects `TIEBREAK`, so the field shape exists. |
| E5 cover items | The `eligibility` bullet is right that a hand-written board carries no evidence object. Worth adding the sharper fact from `README.md`: `eligibility` is **dropped entirely** by the ranked importer (`eligibility: null`, unconditional), so this is the only path on which those fields publish at all. |
| E5 cover items | Same for `capture`: the ranked importer writes `complete: true` unconditionally, so `capture.complete` is a live control here and inert there. Worth saying, since E3 and D2 both treat the flag as universal. |
| E5 cover items | The "don't hand-write round 1" warning is present. The README also gives the two **repairs** — back-fill as a dated export, or accept one round of missing arrows and correct from round 3 — and those are what someone who already made the mistake needs. |
