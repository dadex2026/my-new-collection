# Worked run — G1, generate a new dashboard project folder

**Driven by prompt G1** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and `Dashboards\README.md` or
`Dashboards\new-dashboard-build-guide.md` disagree, those win.

**Applicable project: `Desktop\Dashboards\`.** The fork branch is taken, because it is
the branch with the traps — and the parent, `Sports Ledger (v3.5)`, is a real tool
whose folder layout, vocabulary and prompt set could be inspected rather than assumed.

---

## SAMPLE HEADER

### G1 — Generate a new dashboard/ledger project

```
I want to create a new dashboard/ledger project.

NAME:           Esports Ledger
WHAT IT SCORES: Competitive match results, and community predictions about them
SHAPE:          single-file HTML
STARTING FROM:  fork of Sports Ledger (v3.5)
PASTE TARGETS:  Match results per league section; community leaderboard replies
EXPORTS:        A ranked board export for a collection's backend/standings/,
                and a community leaderboard export
```

---

## PART 1 — RUNBOOK

## Because this is a fork, this comes first — it changes what the folder contains

### F1. What you are inheriting

**There is no dashboard template.** A fork copies a *working tool*, so it arrives
carrying that tool's subject matter, not a neutral skeleton. Concretely, forking
`Sports Ledger (v3.5)` means you start with a football/basketball/baseball/racing/poker
tool: its league sections, its stat templates, its five prompt files, its README's
sibling section. Every one of those is about a sport you are not scoring.

### F2. What to carry over

The scoring engine · the paste parsers · the export writers · the backup/restore
format · the masthead and build stamp. That is the machinery, and it is why forking
beats starting from scratch.

### F3. What to strip before the first build

- The parent's **saved state**.
- The contents of **`backups/`** and **`_superseded/`**.
- **`test-data/` expected values** — they encode the parent's scoring.
- **Every prompt in `prompts/`.** All five of Sports Ledger's:
  `sports-ledger-paste-prompt.md`, `sports-ledger-community-leaderboard-prompt.md`,
  `sports-ledger-baseball-game-prompt.md`, `sports-ledger-poker-league-prompt.md`,
  `sports-ledger-paste-sample-output.md`.

**A prompt describes a field contract**, and an inherited one describing the parent's
contract **is worse than none, because it looks authoritative**. Someone will paste it,
get clean-looking output in the wrong shape, and the tool will accept what it can parse.
Write the new ones with **G3**.

### F4. Rename the build immediately

`esports-ledger-v0.1.html`, with its own stamp. A fork still carrying
`sports-ledger-v3.5` in its masthead is the exact failure the one-live-`.html` rule
exists to prevent — now spread across two folders, where the usual check (one loose
build per folder) cannot see it.

### F5. The vocabulary trap — the reason this branch exists

**Sibling tools share words that do not share meanings.** The documented case, between
the two existing Ledgers:

| Term | Entertainment Ledger | Sports Ledger |
|---|---|---|
| **Community Edge** | **ranks**, measured in score points | **display-only**, measured in error units |
| the ranking metric | Community Edge | called **Skill Edge** |

Same two words, two meanings, two tools that look interchangeable. Forking from Sports
Ledger, you inherit *its* answer.

**So: for every term the fork inherits, decide whether it means the same thing here,
and write the answer into the new README's own *Sibling project* section — in BOTH
directions.** The parent gains a line about the child too. A one-way note is how the
next person reads the parent's README and concludes the child agrees with it.

### F6. The column-label consequence downstream

If this tool exports to a collection's standings, its labels must either match the
logical names the importer reads or get a `columnMap` entry in that collection's
`_input/import-config.json`. Sports Ledger writes `FinalPoints` / `SkillEdge` /
`Predictions` where the logical names are `Points` / `Edge` / `Resolved` — so
**inheriting the parent's labels silently inherits the parent's columnMap
requirement**, in a collection that may not have one. Decide the labels now, while
changing them is a text edit rather than a re-export.

---

## Then the folder

### 1. `Desktop\Dashboards\Esports Ledger\`, and which subfolders it earns

| Folder | Earned? | Why |
|---|---|---|
| `prompts/` | **Yes** | It has paste targets, so it needs extraction prompts — new ones, per F3. |
| `templates/` | **Yes** | Stat templates, as the parent has for football/baseball/NBA. |
| `exports/` | **Yes** | It exports to a collection's standings. |
| `backups/` | **Yes** | It holds state worth restoring. |
| `_superseded/` | **Yes** | Every project earns this the moment it has a second build. |
| `test-data/` | **Yes** | It has a scoring engine, so it needs expected values — its own, not the parent's. |
| `source-data/` | **Not yet** | Entertainment Ledger has one because it carries baked-in reference data; this tool takes pasted input. Add it if that changes. |
| `samples/` | **Not yet** | VC Fund Evaluator has one for paired sample runs. Add it when there is a run worth keeping. |

Not every project uses every folder, and an empty folder is a claim the project does
not yet support.

### 2. The one rule that matters

**Exactly one live `.html` at the top level, and the previous build moves to
`_superseded/` the same day.**

The failure it prevents: **a document describing a newer build than the file on disk,
with nothing making that visible.** Two loose builds and every README, guide and prompt
in the folder becomes ambiguous — they name a version, and you cannot tell which file
they mean.

### 3. The build stamp

The masthead prints **version and date**. Two of the five existing tools have none, and
the **Github Evaluator has already misled once because of it**: a `_1` suffix that read
like a stale duplicate was in fact the *newer* build. That is what an unstamped tool
costs — the filename becomes the only evidence, and filenames are assigned by whatever
wrote them.

**If this tool will not stamp itself, the date goes in the filename** —
`github-evaluator-2026-08-17.html` is the existing precedent.

### 4. Files land in the project folder directly

Never routed through Downloads. Two reasons, both concrete:

- **A browser resolves a filename collision by appending `_1`** — which is exactly the
  ambiguity in §3.
- **Downloads is the one folder Windows Storage Sense may auto-empty**, and
  `backups/` and `_superseded/` are what would go first — the two folders whose entire
  purpose is to still be there later.

### 5. `README.md`, opening with the build it describes

First line names `esports-ledger-v0.1.html`. If the README and the masthead disagree,
**believe the tool and treat the document as stale.** Documents are updated in place,
never versioned — one copy, always matching the loose `.html`.

It also carries the *Sibling project* section from F5, in both directions.

### 6. The AI/tool boundary, stated in the README

**The AI extracts; the tool scores.** Every number is computed in tested code from raw
inputs the user can see and edit. That is what makes the numbers checkable, and it is
why the extraction prompts refuse to emit a score, rank or confidence column.

### 7. The corollary that has bitten before

**A scoring change is not shipped until the prompt that feeds it can produce the
input.** Entertainment Ledger v1.3 added a Combined post type that the tool scored and
**no prompt emitted** — so the feature was unreachable for two builds. The tool was
correct, the tests passed, and nothing could reach the code.

Ship the pair: the scoring change and the prompt revision, with the prompt's verified
build stamp updated to match.

### 8. Register it

Add `Esports Ledger` to the dashboards table in `docs/generation-prompts.md` — via
**H1**, which also checks whether the new tool breaks an assumption an existing prompt
makes (new column labels, a new pipeline, an artifact no prompt mentions) and whether
it needs its own `prompts/` folder written with G3.

---

## PART 2 — DISPOSITION TABLE

| # | Path | Disposition | What goes where |
|---|---|---|---|
| 1 | `Dashboards\Esports Ledger\` | **Created** | Copied from `Sports Ledger`, then stripped per F3. |
| 2 | `esports-ledger-v0.1.html` | **Created** — renamed immediately | Own masthead stamp: version + date. |
| 3 | `prompts/` | **Created empty**, then filled by **G3** | Every inherited prompt deleted first. |
| 4 | `templates/` | **Created** | New stat templates; the parent's are football/baseball/NBA. |
| 5 | `test-data/` | **Created** | New expected values. |
| 6 | `exports/`, `backups/`, `_superseded/` | **Created empty** | Inherited contents deleted. |
| 7 | `README.md` | **Created** | Opens with the build name; carries the AI/tool boundary and the *Sibling project* section. |
| 8 | `Sports Ledger\README.md` | **Edited** | The other direction of the sibling note. |
| 9 | `Dashboards\README.md` | **Edited** | New row in the projects table. |
| 10 | `docs/generation-prompts.md` | **Edited via H1** | Registry row, plus the assumption check. |
| 11 | A collection's `_input/import-config.json` | **Possibly edited later** | A `columnMap` entry, if the labels do not match the logical names. |

---

## PART 3 — REFUSALS

1. **Never two live `.html` files** in one folder.
2. **Never keep an inherited prompt.** It looks authoritative and describes the wrong
   contract.
3. **Never keep the parent's version string** in a fork's masthead or filename.
4. **Never route files through Downloads.**
5. **Never ship a scoring change whose input no prompt can produce.**
6. **Never version a document.** One copy, updated in place.
7. **Never assume an inherited term means what it meant in the parent** — Community
   Edge is the proof.
8. **Never leave the sibling note one-directional.**

---

## PART 4 — VERIFICATION CHECKLIST

**Fork hygiene**

- [ ] Build renamed to `esports-ledger-v0.1.html`; no `sports-ledger` string in the masthead, filename or README.
- [ ] `prompts/` empty of inherited files; new ones planned via G3.
- [ ] `backups/`, `_superseded/`, saved state and `test-data/` expected values cleared.
- [ ] Every inherited term reviewed for meaning; decisions written into the README.
- [ ] Sibling note added in **both** directions.

**Folder**

- [ ] Exactly one `.html` at the top level.
- [ ] Only the subfolders this project earns exist.
- [ ] Masthead prints version and date — or the date is in the filename.
- [ ] `README.md` opens by naming the build.
- [ ] AI/tool boundary stated.

**Downstream**

- [ ] Export labels either match the logical names or a `columnMap` is planned for the consuming collection.
- [ ] H1 run: registry row added, assumption check answered, `prompts/` need recorded.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `EXPORT COLUMN LABELS` | F6 turns on them, and the header collects only "what it will export, and for whom". Whether a `columnMap` is needed is decided by the labels. |
| `CONSUMING COLLECTION` | "for whom" is prose; the `columnMap` lives in a specific collection's `import-config.json`. |
| `INHERITED TERMS` | The vocabulary review is the branch's whole reason, and the header has no place to list the terms or record the decisions. |
| `BUILD STAMP FORMAT` | Whether this tool stamps itself or takes the date-in-filename fallback — a decision with a permanent consequence for every document that names it. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| G1 header | Collects no export **labels** and no consuming collection, though the fork branch ends on a `columnMap` consequence that is decided by exactly those. |
| G1 fork branch | The vocabulary trap is well stated and has no field to record its output. A `INHERITED TERMS` list — term, parent meaning, meaning here — would make the README section writable rather than remembered. |
| G1 cover items | The build-stamp item gives the Github Evaluator precedent. Worth stating the fallback as a rule: **if the tool does not stamp itself, the date goes in the filename** — which is what `github-evaluator-2026-08-17.html` already does, so the convention exists and is unnamed. |
| G1 cover items | The subfolder list is "which ones this project earns", and the earning criteria are not given. From the five existing tools: `source-data/` for baked-in reference data, `samples/` for paired sample runs, `test-data/` wherever there is a scoring engine. Worth one line each. |
