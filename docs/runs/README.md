# Worked runs, and how to use them

**What is in here.** Twenty-nine worked runs — one complete execution of each
prompt in `docs/generation-prompts.md`, against real files — plus the two
documents that govern how prompts get tested.

**What is not in here.** The prompt library itself. That is
`docs/generation-prompts.md`, one level up, deliberately: it is the document you
open when you are *starting* something, and it should not be filed among the
records of things already run. Every prompt in it points down here to its own
worked run.

---

## Why a worked run exists

A prompt is an instruction. A worked run is that instruction **executed once,
completely, and written down** — the filled header, and all five parts of the
output it returned.

That gives it two jobs, and the second is the one people forget:

1. **A shape to compare against.** When a prompt gives you an answer and you
   cannot tell whether it did the work or improvised something plausible, the
   worked run is what a real run looks like. Refusals quoted from the script that
   raises them; file paths that exist; counts that match.
2. **A finding about its own prompt.** Every run ends with what the prompt got
   wrong when a stranger followed it — a header field it never collected, a
   count it stated wrongly, an ambiguity in its first line. Several prompts were
   changed because their worked run exposed a gap. That is the point of running
   them.

**These are the fixtures of record.** Where a worked run and the worked-headers
appendix in `generation-prompts.md` disagree, the worked run wins. That rule was
set after two D1 fixtures diverged and one of them invented a column.

## What they are not

They are **not a launch gate**. Nothing in `docs/production-readiness.md` waits
on an eval run. These test whether the instruction library produces good runbooks
for someone who has never seen this project; that is quality work on the
documents, it runs in parallel, and no mint is blocked by it.

---

## The runs

Twenty-nine files covering twenty-eight prompts — E3 has two, because the Index
Portfolio path is worked separately from the general one.

| Family | Runs | Covers |
|---|---|---|
| **A** — Collection and project lifecycle | `a1` `a2` `a3` `a4` `a5` `a6` `a7` | New collection, new drop, production mint, template merge, RPC proxy, Netlify project, verify deploy |
| **B** — Campaigns | `b1` `b2` | Holder-reward campaign, airdrop to a wallet list |
| **C** — Content | `c1` `c2` | New text card, refresh the methodology page |
| **D** — Rankings and standings | `d1` `d2` `d3` | Declare a ranked board, publish a round, community leaderboard from a Ledger export |
| **E** — X / Twitter contests | `e1` `e2` `e3` `e3-index` `e4` `e5` `e6` | Open a contest, open one on Index Portfolio, capture a thread and extract rows (two paths), score and publish results, one-off hand-written contest, close a contest |
| **F** — Posts | `f1` `f2` | Compose a post, write a new post template |
| **G** — Dashboards | `g1` `g2` `g3` `g4` `g5` | New dashboard folder, ship a build, new extraction prompt, export a Ledger board, build the tool itself |
| **H** — Maintenance | `h1` | Register a new target or document |

Filenames are `worked-run-<id>.md` throughout.

## The two governing documents

| File | What it is for |
|---|---|
| `prompt-eval-protocol.md` | How to test a prompt **cold** against its worked run, and how to tell a prompt's fault from an answer's fault. Read this before judging that a prompt is broken. |
| `eval-run-handoff.md` | The state of the evaluation effort — which runs have been executed cold, what they found, what is queued. |

---

## When you touch anything in here

- **Changing a prompt's header fields invalidates the fixture filled from it.**
  A worked run is only a fixture while its header matches the prompt. If you add
  or rename a field in `generation-prompts.md`, the run has to be refilled or it
  will fail a cold test for the wrong reason.
- **Register new documents through H1.** `worked-run-h1.md` is the run for
  registering a target or document, and it has a document branch: a closing-table
  row in the library, a pointer from
  `docs/new-collection-deployment-guide.md`, and a citation in the prompt's own
  Reference block. A file dropped in here without those three is invisible.
- **Each run cites the commit it was verified against.** When the code moves, the
  citation is what tells you whether the run still describes reality.

## On forking

`docs/open-items.md` says to delete itself when forking this template into a
collection, because it tracks template maintenance rather than collection
content. **This folder is the opposite: keep it.** A fork inherits the prompt
library, and a library without its worked runs is a set of instructions with no
way to check whether an answer to one of them is real.
