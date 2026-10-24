# Worked run — G3, generate a new extraction prompt for a paste target

**Driven by prompt G3** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and the target tool's own parser disagree,
the parser wins — which turns out to be the finding this run produced.

**Applicable project: `Dashboards\Sports Ledger`.** Header values are the canonical
ones from the worked-headers appendix.

---

## SAMPLE HEADER

### G3 — Generate a new extraction prompt

```
DASHBOARD:     Sports Ledger
BUILD:         sports-ledger-v3.5.html
PASTE TARGET:  Horse Racing → Meetings
FIELD ORDER:   Horse | Jockey | Track | Finish | Field Size | Date
SOURCE:        published race cards and results pages
```

---

## ⚠ BEFORE WRITING: the separator is a per-tool fact, not a house style

G3 instructs: *"pipe-delimited (commas and tabs parse but pipes are the only separator
safe when a value contains a comma)."*

**That is Entertainment Ledger's rule, and it is not the platform's.** Read off the
prompt files that exist:

| Project | Its prompts say |
|---|---|
| **Entertainment Ledger** | *"Pipe-delimited. Commas and tabs also parse, but pipes are the only separator guaranteed safe when a title contains a comma."* |
| **Sports Ledger** | *"Comma-separated, five fields per line"* (games) · *"one line per player, comma-separated"* (poker) · seven comma-separated fields (community leaderboard) |
| **Index Portfolio** | *"seven comma-separated fields, with empty fields still holding their commas"* |

So a prompt written for **this** target in G3's stated house style would emit pipes into
a tool whose every other prompt emits commas — and whose community-leaderboard
validation explicitly demands comma-separated fields. **Check the target box's parser
and match the tool, not the prompt library.**

For `Horse Racing → Meetings`, the existing Sports Ledger horse-racing format is
comma-separated and nine fields wide, so this new prompt is **comma-separated** too.
The `FIELD ORDER` in the header is written with pipes as *notation*, which is a second
reason to state the separator explicitly rather than infer it from the header.

---

## PART 1 — RUNBOOK

### 1. Confirm the contract against the tool

Open `sports-ledger-v3.5.html`, find the **Horse Racing → Meetings** box, and read what
its parser accepts: field count, order, separator, and whether the date is optional.
The header's `FIELD ORDER` is what you were told; the parser is what is true.

### 2. Write `prompts/sports-ledger-horse-meetings-prompt.md`

Following the house style of the four prompt files already in that folder:

**a. Open by naming the build and the date.**

> **Verified against build v3.5 (2026-08-24).**

A later reader can then tell whether the file is current — and if the masthead disagrees
with this line, the tool wins.

**b. State the one rule up front.**

> The AI extracts, the tool scores. This prompt never asks for points, totals,
> positions, percentages or rank changes. **If a prompt appears to calculate something,
> that is a bug in the prompt.**

**c. The output contract as a table.**

| Box | Field order |
|---|---|
| Horse Racing → Meetings | `Horse, Jockey, Track, Finish, Field Size, Date` |

**d. Format rules, explicitly:**

- Comma-separated (see the note above), **six fields per line**.
- One line per horse.
- No header row, no numbering, no bullets, no commentary, **no code fence**.
- `Date` as `YYYY-MM-DD` and **optional** — omit the field entirely for that line
  rather than leaving it blank.
- Numbers plain: `3`, not `3rd`; `12`, not `12 runners`.
- Output only the data lines — nothing before them and nothing after.

**e. Where the AI may add information it was not given — and the guardrail on each.**

Three places, each with a rule:

| Allowed addition | Guardrail |
|---|---|
| `Field Size` when the card states runners but not a count | Count the listed runners; if the list is partial or ambiguous, skip the line. |
| `Track` when a page groups races under one meeting header | Take it from the header only when it is unambiguous for that race; never carry it across pages. |
| Normalising a horse's name (case, trailing country codes) | Never invent or expand an abbreviation; if the name is not printed in full, output what is printed. |

Nothing else. **A jockey not named on the source is not inferable from the horse** —
say so, because it is the plausible-looking guess someone will otherwise make.

**f. A worked example** — a realistic snippet and the exact lines it should produce.
The parent folder already models this: `sports-ledger-paste-sample-output.md` exists
precisely so the expected output can be read next to the input.

**g. What the tool does with a malformed line.** For this family: **a line with the
wrong field count is cleanly rejected, not partially read** — so a bad line loses one
horse rather than shifting a whole meeting. Say it plainly, because a prompt that does
not is a prompt whose users assume the opposite.

### 3. Update the sample-output file

`prompts/sports-ledger-paste-sample-output.md` exists in this project, so add the
meetings example to it — same input, same expected lines.

### 4. What to add to `test-data/`

**Sports Ledger has no `test-data/` folder.** Entertainment Ledger does
(`entertainment-community-test-1-billboard.md`, `-2-emmys.md`), and this project earns
one as soon as it has a prompt worth verifying. Create it with two files:

- **A clean case** — a normal race card, with expected output lines.
- **A hostile case** — a comma inside a horse's name, an abbreviated track, a race with
  no date, and one malformed line, with the expected result for each *including which
  line is rejected*.

The hostile case is the one that earns its keep: it is where the separator decision and
the guardrails in §2e get proved rather than asserted.

---

## PART 2 — DISPOSITION TABLE

| # | Path | Disposition | What goes where |
|---|---|---|---|
| 1 | `Sports Ledger\sports-ledger-v3.5.html` | **Read only** | The parser is the contract. |
| 2 | `prompts\sports-ledger-horse-meetings-prompt.md` | **Created** | Build line, the one rule, the contract table, format rules, guardrails, worked example, malformed-line behaviour. |
| 3 | `prompts\sports-ledger-paste-sample-output.md` | **Edited** | The meetings example appended. |
| 4 | `test-data\` | **Created** — the folder does not exist yet | Clean case + hostile case, with expected output. |
| 5 | `Sports Ledger\README.md` | **Edited** | Names the new prompt file. |
| 6 | `sports-ledger-extraction-summary.md` | **Edited** | It summarises this project's paste contracts; a new one belongs in it. |

---

## PART 3 — REFUSALS

1. **The prompt never asks for a computed value** — no points, totals, positions,
   percentages or rank changes.
2. **No header row, no numbering, no commentary, no code fence.**
3. **No invented values.** Each permitted addition carries a guardrail, and everything
   else is copied or skipped.
4. **A malformed line is rejected, not partially read** — and the prompt says so.
5. **The separator is the tool's, not the library's** — pipes here would be wrong.
6. **A prompt that appears to calculate is a bug in the prompt**, not a feature of the
   model.

---

## PART 4 — VERIFICATION CHECKLIST

- [ ] Field order, count and separator confirmed **against the tool**, not the header.
- [ ] File opens with `Verified against build v3.5 (2026-08-24)`.
- [ ] The extract-not-score rule is in the first screen.
- [ ] Contract table names the box and the field order.
- [ ] Format rules cover: separator, field count, one line per entity, no header/numbering/commentary/fence, date format and optionality.
- [ ] Every permitted inference is listed **with** a guardrail; the not-inferable cases are named.
- [ ] Worked example present, and its output really is what the rules produce.
- [ ] Malformed-line behaviour stated.
- [ ] Sample-output file updated.
- [ ] `test-data/` created with a clean case and a hostile case, expected results recorded.
- [ ] Pasted through the real tool once, end to end, before the prompt is called done.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `SEPARATOR` | G3 assumes one house rule; the platform has two. It should be read off the target tool and recorded in the header. |
| `MALFORMED-LINE BEHAVIOUR` | The prompt must state it, and it is a property of the tool's parser that G3 never collects. |
| `OPTIONAL FIELDS` | Which fields may be omitted, and whether omission means dropping the field or leaving it empty — the two are different contracts and both exist in this platform. |
| `PROMPT FILENAME` | G3 says "save it as `prompts/<name>.md`" without collecting the name; the folder's convention is `<project>-<target>-prompt.md`. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| G3 cover items | **The separator rule is wrong as a universal.** G3 mandates pipe-delimited; Entertainment Ledger uses pipes, Sports Ledger and Index Portfolio use commas, and the Index prompt requires empty fields to keep their commas. A prompt written to G3's house style for a Sports Ledger box would emit output its sibling prompts' validation forbids. Make it "match the target tool's parser, and record which." |
| G3 header | `FIELD ORDER` is written with pipes as notation in the worked header, which reads as the separator. Two reasons to collect the separator explicitly. |
| G3 cover items | "Say what the tool does with a malformed line" asks the prompt to state a fact about the **tool** that G3 never collects. In this family a wrong field count is cleanly rejected; the Sports Ledger community-leaderboard case is the opposite — a short row still parses and silently loses a field's meaning. The answer differs per box. |
| G3 cover items | "Tell me what to add to `test-data/`" assumes the folder exists. Sports Ledger has none. Worth saying that creating it is part of the job, and that the hostile case — embedded separator, missing optional field, one malformed line — is the part that proves the prompt. |
