# Worked run — F2, write a new post template

**Driven by prompt F2** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** `docs/post-generator-spec.md` and
`backend/scripts/compose-post.js` are.

**Applicable project: `TEMPLATE-OPEN-EDITION`.** Its six shipped templates are the
house style, and its sample rows are what a new template is first tested against.

---

## SAMPLE HEADER

### F2 — Write a new post template

```
I want to write a new post template.

TARGET:      TEMPLATE-OPEN-EDITION
NAME:        ranking-movement
SOURCE:      standings
WHAT IT SAYS: Who moved this round — the top three by position change, with
              the ruleset that produced them and a link to the methodology.
```

A `standings` template deliberately, because that is the source with a per-board
schema and every rule below turns on it.

---

## PART 1 — RUNBOOK

### 1. The file, and its first line

`backend/post-templates/ranking-movement.txt`, opening with:

```
#source: standings
```

**That line tells the script which file to read and which column `--id`
addresses** — `standings` means `frontend/public/standings.json` and `--id` matches
`boardId`. Get it wrong and the template resolves against the wrong records without
any type error to catch it.

### 2. The placeholder rule

`{placeholders}` map **1:1 to source field names. No mapping layer, so nothing can
drift.**

**What you own is the wording *between* the braces.** Replacing `{collectionName}`
with literal text makes the template produce that one post forever — which is not a
template, it is a saved post that outlives the thing it described.

### 3. Entry addressing

Zero-indexed against the board's own `entries`:

```
{entry[0].name}   {entry[0].score}   {entry[1].name}
```

Board-level fields resolve bare: `{title}`, `{seasonId}`, `{throughRound}`,
`{rulesetVersion}`, `{entryCount}`.

### 4. **A board declares its own columns** — the rule that breaks templates

`projectEntry()` omits any field that is null or undefined, so one board's entry row is
`{rank, name, score, rate, entries, movement}` and another's is
`{rank, name, score, Winner, movement}`.

**A template hard-coding `{score}` breaks on a board that does not publish one.**
Resolve the available fields **from the board being rendered**, and check with the
unknown-placeholder trick before shipping: insert a placeholder that cannot exist, run
it, and read the error — it names the fields available *for that board*.

Two refinements the spec is explicit about and F2 does not mention:

- **Available fields come from the entry object, not from `columns`.** Entries also
  carry `entityId` and `previousRank`, which are not in `columns` — `columns` governs
  what the *card* displays, which is a narrower thing. A template may legitimately use
  a field the card does not show.
- **`movement` in `standings.json` is a raw object `{state, delta}`**, not the
  formatted string a card carries. The engine mirrors `formatMovement()` from
  `generate-standings-cards.js` so a post renders movement exactly as the site does —
  **and the two must be kept in step if either changes.** For a template *about*
  movement, that shared formatter is the dependency to know about.

### 5. Extra columns live in a nested `fields` object

They are **flattened onto the row**, exactly as `projectEntry()` spreads them onto a
card row. **This is how `Winner`, `Spread` and `Total` reach a post.**

Missing the flatten makes a Sports board's most post-worthy values invisible to every
template — which is precisely what the first implementation did, until a real ledger
board was run through it. **Flatten last**, so an extra column can never shadow `rank`
or `name`.

### 6. The methodology requirement

**Any template sourced from `standings` MUST contain `{methodologyUrl}`, and the engine
refuses to compose it otherwise.**

The reasoning is worth keeping: a free-text disclaimer goes stale silently; a link to a
generated page cannot. The generated page is rebuilt from the standings every time
`generate-methodology.js` runs, so the link is always current or visibly broken —
never quietly wrong.

### 7. The draft

```
#source: standings
{title} — movement through {throughRound}

{entry[0].name} {entry[0].movement}
{entry[1].name} {entry[1].movement}
{entry[2].name} {entry[2].movement}

{entryCount} ranked · ruleset {rulesetVersion}
How this is produced → {methodologyUrl}
```

House style, read off the six that ship: `#source:` first, a title line, a blank line
between blocks, a footer carrying `{entryCount}` and `{rulesetVersion}`, and the
methodology link last behind `→`. Note the arrow weighs **2** and `{methodologyUrl}`
weighs **23** — about a tenth of a 280 budget before any content.

**No `{score}`** — deliberately, since this template is about movement and hard-coding
score would break it on any board that does not publish one.

### 8. Test it against the shipped sample rows — and the one gap

Run it against `EXAMPLE-participants-accuracy.json`, then against a real board.

**The gap F2 names, and it is real:** `contest-result` **cannot be sanity-checked
before real contest data exists**, because it needs `Called` and `Pick`, which the
example board does not publish. **Build a throwaway contest board once rather than
shipping it untested** — E5 is the prompt that writes one by hand, which makes this a
twenty-minute job rather than a reason to skip the test.

The same trap applies to any new template using extra columns: the example board
publishes none, so a template that reads `Winner` passes review and fails on first use.

---

## PART 2 — DISPOSITION TABLE

| # | Path | Disposition | What goes where |
|---|---|---|---|
| 1 | `backend/post-templates/ranking-movement.txt` | **Created** | `#source: standings` first, placeholders, `{methodologyUrl}` mandatory. |
| 2 | `frontend/public/standings.json` | **Read only** | The board being rendered; the field list comes from its entries. |
| 3 | `backend/scripts/compose-post.js` | Run | To test; also the source of the unknown-placeholder field list. |
| 4 | `backend/scripts/generate-standings-cards.js` | **Read only** | `formatMovement()` — the formatter the engine mirrors. |
| 5 | `docs/post-generator-spec.md` | **Edited** | "Templates that ship" gains a row. |
| 6 | A throwaway board | `backend/standings/<id>.json` | **Created then removed** if the template needs columns the example board lacks. |

---

## PART 3 — REFUSALS

1. **A `standings` template without `{methodologyUrl}` is refused** by the engine.
2. **An unknown placeholder fails**, listing the fields available for that board.
3. **Hard-coding a literal where a placeholder belongs** produces one post forever —
   allowed by the engine, wrong by intent.
4. **`{score}` is not universal.** Boards declare their own columns.
5. **Extra columns are only reachable if flattened**, and flattening must come last so
   nothing shadows `rank` or `name`.
6. **Do not ship a template that has never rendered.** If the example board cannot
   exercise it, build a throwaway board.

---

## PART 4 — VERIFICATION CHECKLIST

- [ ] `#source:` is the first line and names the right source.
- [ ] Every placeholder is a real field of the board being rendered — checked with the unknown-placeholder trick, not by reading the spec.
- [ ] No literal text where a placeholder belongs.
- [ ] `{methodologyUrl}` present (standings source).
- [ ] No field assumed universal — `{score}`, `{rate}`, `{Winner}` all board-dependent.
- [ ] Extra columns confirmed reachable on a board that actually publishes them.
- [ ] Rendered against the example board **and** a real one.
- [ ] Weighted length checked with a real URL in place: `{methodologyUrl}` counts 23.
- [ ] `post-generator-spec.md` updated.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `TEST BOARD` | Which board this template will be rendered against — the field list is per-board, so "test it" is not actionable without one. |
| `REQUIRED FIELDS` | Which entry fields the template depends on, so the board choice can be checked before writing. |
| `BUDGET` | F1 collects it; F2 does not, yet template length is fixed at authoring time. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| F2 cover items | Says to resolve fields "from the board being rendered" but not that **available fields come from the entry object, not `columns`** — entries carry `entityId` and `previousRank` that `columns` never lists. As written, someone reads `columns` and concludes a legitimate field is unavailable. |
| F2 cover items | **`movement` is a raw `{state, delta}` object**, formatted by a mirror of `formatMovement()` from the card generator, and the two must be kept in step. For any template that renders movement this is the dependency, and F2 does not mention it. |
| F2 header | Collects no test board and no required-fields list, so the final cover item ("test it against the shipped sample rows") cannot be planned — the example board publishes no extra columns, which is the exact case that needs planning. |
| F2 cover items | The `contest-result` gap is well described. Worth naming **E5** as the cheap way to close it: a hand-written throwaway board is a twenty-minute job, which turns "ship it untested" into a choice rather than a constraint. |
