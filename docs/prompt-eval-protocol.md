# Testing whether a prompt produces its runbook

The worked runs in `docs/worked-run-*.md` establish what a good answer looks like.
They were built by reading the code and comparing — which tests the *prompts as
written*, not the *answers they produce*. This file is the other direction: paste a
prompt cold and see whether it yields something resembling its worked run.

**Where they diverge, the prompt is at fault.** That is the whole premise. A model
given a complete prompt and the files it names should not need to guess; if it guessed,
the prompt let it.

Run this on three prompts of different shapes rather than all 28. One procedural
(**C1**), one branching (**E3**), one that stops for decisions (**G5**) covers the
three ways these prompts can fail.

---

## The setup

**One prompt per chat.** A second prompt in the same conversation inherits the first's
assumptions, and the answer will look better than the prompt deserves.

**Fill the header from the worked run's SAMPLE HEADER, value for value.** Same
collection, same ids, same dates. A different header produces a different runbook and
the diff becomes an argument about inputs.

**Run it twice, in two modes.** They test different things:

| Mode | Session | What it tests |
|---|---|---|
| **A — with files** | Fresh session, folder access to the target project, nothing else in context | Whether the prompt plus the files produces the runbook |
| **B — plain chat** | No file access at all | Whether the prompt makes the model **say it cannot read the files** — or whether it improvises a plausible runbook instead |

Mode B is not a formality. *Filling a prompt before you paste it*, rule 4, names an
improvised runbook as **the single most damaging failure available here, because the
output looks exactly like a correct one.** A prompt that produces a confident answer
with no file access has a real defect, and mode B is the only way to see it.

---

## Scoring

**Read the whole answer before opening the worked run.** Comparing as you go turns the
exercise into pattern-matching against a document you already believe.

Then score seven things. Each is pass/fail; the interesting output is *which* failed.

1. **All five parts of the output contract** — numbered runbook, disposition table,
   refusals, verification checklist, Missing inputs.
2. **The branch declared, where the prompt has one.** E3 must say which path before it
   starts. An answer that blends the collection and Index Portfolio vocabularies has
   failed even if every sentence is individually true.
3. **Every cover item addressed.** Count them in the prompt; find each in the answer.
4. **The named refusals present** — and named as refusals, not softened into advice.
5. **Exact strings correct.** File paths, flag names, exit codes, column counts, error
   text. **Check at least two against the code**, not against the worked run — this is
   where improvisation hides, and a plausible-looking error message is the tell.
6. **Missing inputs reports the real gaps.** Compare against the worked run's Part 5.
   An empty Missing-inputs section on a prompt known to have gaps is a failure of the
   answer; a *different* set of gaps is worth reading twice, because it may be right.
7. **Nothing invented.** A command, flag or file that does not exist. Grep the repo for
   anything you do not recognise.

---

## Classifying a divergence

Every difference lands in one of three buckets, and only the first is worth acting on:

| Bucket | Looks like | What to do |
|---|---|---|
| **Prompt fault** | The answer omitted something the prompt never asked for, or invented a value the header never collected | Fix the prompt. A missing field goes in via **H1** step 4. |
| **Answer fault** | The prompt asked, the files said, and the answer got it wrong anyway | Nothing to change. Note it; if it repeats across runs, the prompt is probably ambiguous rather than the answer careless. |
| **Worked-run fault** | The answer is right and the worked run is stale — a build shipped, a file moved | Fix the worked run, and check whether the prompt quotes the same stale fact. |

The bucket that matters is the first. Two real examples from the pass that produced
these files: **G3 mandated pipe-delimited output** while two of the three tools it
serves use commas, and **C2 told you to edit the template-owned `methodology.json`**
rather than the collection's `overrides.json`. Both would have produced confident,
well-formatted, wrong runbooks — and neither is visible without comparing the prompt
against the code.

---

## Recording a run

Keep it to one row. The value is the trend, not the prose.

| Date | Prompt | Mode | Parts | Branch | Cover | Refusals | Strings | Missing | Invented | Prompt faults found |
|---|---|---|---|---|---|---|---|---|---|---|
| | C1 | A | | — | | | | | | |
| | C1 | B | | — | | | | | | |
| | E3 | A | | | | | | | | |
| | G5 | A | | — | | | | | | |

A prompt fault found is the point of the exercise; a clean run means the prompt is
carrying its weight, which is worth knowing and not worth writing up.

---

## When to re-run

- **After changing a prompt's header fields.** New fields are the commonest source of
  an answer that ignores them.
- **After a tool ships a build** (**G2**), for the prompts naming that build.
- **When a runbook in the wild produced a wrong answer.** Reproduce it here first: the
  question is always whether the prompt allowed it.

**Driven by no prompt.** This is a method, not a generator — the closest thing to it in
the library is **H1**, which registers what this finds.
