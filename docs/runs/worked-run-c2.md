# Worked run — C2, refresh the methodology page

**Driven by prompt C2** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and
`backend/scripts/generate-methodology.js` disagree, the script wins.

**Applicable project: `TEMPLATE-TEST-LEDGER`.** It is the only target that satisfies
C2's prerequisites — published boards *and* a methodology folder — and it is also the
only one carrying an `overrides.json`, which turns out to be the part of this feature
C2 does not mention at all. (`my-new-collection` has no `backend/methodology/` and no
`generate-methodology.js`; C2 cannot run there until A4 does.)

---

## SAMPLE HEADER

### C2 — Refresh the methodology page

```
I want to refresh the methodology page.

COLLECTION:      TEMPLATE-TEST-LEDGER
WHAT CHANGED:    both
```

Both, because this collection's last round crossed a ruleset boundary — the derived
half changes on its own — and the Entertainment-specific scoring wording is authored.

---

## PART 1 — RUNBOOK

### 1. The split, and the file C2 does not name

**Authored prose** lives in `backend/methodology/`. **Everything that could go stale is
re-derived from the standings themselves**: which boards exist, which ruleset produced
each, which export files they came from, the eligibility minimum, and the ruleset
changelog. None of that is written by hand anywhere.

But the authored half is **two files, not one**, and this is the important correction:

| File | Whose | Edit it when |
|---|---|---|
| `methodology/methodology.json` | **The template's.** *"TEMPLATE DEFAULT prose — the same in every collection."* | Essentially never, in a collection. |
| `methodology/overrides.json` | **The collection's.** Merged over the defaults by section id. | Whenever this collection's wording changes. |

The template file says so itself:

> *"Two sections are domain-specific and expected to be overridden per collection:
> `how-scored` … and `boards` …. Put the precise wording in
> `methodology/overrides.json`, merged by section id. **Leave this file alone so
> template improvements to the shared sections keep arriving on version bump.**"*

**So C2's instruction — "edit `methodology.json` only when the explanation changes" —
points at the wrong file.** Editing it works, and it silently forfeits every future
template improvement to the shared sections, because A4's merge will now show
differences on a file that would otherwise have been safe to take whole.

### 2. How the merge works

`mergeSections()` applies `overrides.json` over the defaults by `id`:

- **Patch** — reuse an existing `id`; supply `heading`, `body`, or both.
- **Add** — a new `id` with both `heading` and `body`, optionally `"after": "<id>"` to
  place it.
- **Remove** — `"remove": true`.

This collection patches `how-scored`, replacing the generic closeness paragraph with
the Entertainment-specific one: categorical contests (a hit scores full marks, ties
count for any stated winner) versus numeric ones (closeness falls away with distance).
The template's `where-numbers-come-from`, `who-is-ranked` and the rest arrive
untouched.

### 3. Never hand-write a derived fact

Which boards exist, the ruleset changelog, the export filenames, `minPicks` — all
derived. Writing any of them into either JSON creates a second copy that will disagree
with the first the next time a round is published, and the page will show both.

For this collection the derived half currently includes the three declared ruleset
versions — `entertainment-ledger-v1.2` (baseline), `v1.3` (rule-change), `v1.4`
(export-only) — and their notes. That changelog is `rulesets.json`, published. It is
also why the last round's movement was suppressed.

### 4. Run it — and know that something else already does

```
node backend/scripts/generate-methodology.js
```

**This must run after any standings change**, and `publish-round.js` already runs it as
its third step for exactly that reason. So the manual run is for the case where the
*prose* changed and the standings did not. If you have just published a round, it has
already happened.

**Output:** `frontend/public/methodology.json`, reached from the site's Rankings nav
link at `#methodology`.

### 5. Why a stale methodology page is worse than none

A missing page says "not documented." A page describing last month's rules says "here
is how your score was computed" and is wrong — and it is wrong in the most expensive
place, because it is the page someone opens when they are already disputing a result.
It converts a scoring question into a credibility question.

This collection is a live example of the risk: the rules changed at `v1.3`, movement
was suppressed for that reason, and the page explaining why is generated. Had the
changelog been hand-written prose instead, it would now describe a two-version history
of a three-version collection.

---

## PART 2 — DISPOSITION TABLE

| # | File | Path | Disposition | What goes where |
|---|---|---|---|---|
| 1 | Template prose | `backend/methodology/methodology.json` | **Read only, in a collection** | Shared sections; leave alone so version bumps keep arriving. |
| 2 | Collection prose | `backend/methodology/overrides.json` | **Edited** — the authored half | Patches `how-scored` and `boards` by id; may add or remove sections. |
| 3 | Board files | `backend/standings/*.json` | Read | Which boards exist, their rulesets, their sources. |
| 4 | Rulesets | `_input/rulesets.json` | Read | The changelog, published verbatim. |
| 5 | Import config | `_input/import-config.json` | Read | `minPicks` — the eligibility minimum shown on the page. |
| 6 | Generator | `backend/scripts/generate-methodology.js` | Run | Merges #1 + #2, derives from #3–#5. |
| 7 | Published page | `frontend/public/methodology.json` | **Generated — output only** | Served at `#methodology`. Never hand-edited. |

---

## PART 3 — REFUSALS

1. **Never hand-write a derived fact** into either authored file.
2. **Do not edit `methodology.json` in a collection** — the override file exists so the
   shared sections stay mergeable.
3. **Do not edit `frontend/public/methodology.json`.** It is output.
4. **Do not skip this after a standings change** — and note `publish-round.js` makes
   skipping impossible on that path, deliberately.
5. **Do not publish a page describing rules that no longer apply.** Worse than none.

---

## PART 4 — VERIFICATION CHECKLIST

**Before**

- [ ] The change is prose, not fact — a fact belongs in the data.
- [ ] The edit is in `overrides.json`, patching by section `id`, not in `methodology.json`.
- [ ] A new section carries both `heading` and `body`, and an `after` if placement matters.

**After**

- [ ] `frontend/public/methodology.json` regenerated.
- [ ] The overridden sections show this collection's wording; the shared ones still show the template's.
- [ ] The ruleset changelog lists all three declared versions with their notes.
- [ ] The boards listed match the board files that actually exist.
- [ ] `minPicks` on the page matches `import-config.json`.
- [ ] `#methodology` renders from the Rankings nav.
- [ ] Committed and pushed with the standings change, not after it.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `WHICH SECTION` | `WHAT CHANGED` takes *the explanation / just the standings / both*, but the authored edit is per **section id** — `how-scored`, `boards`, or a new one. Without it the runbook cannot say which file region to touch. |
| `OVERRIDE MODE` | Patch, add or remove — three different shapes in `overrides.json`. |
| `SITE URL` | To check `#methodology` renders after publishing. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| C2 cover items | **`overrides.json` is never mentioned**, and C2's instruction to "edit `methodology.json` only when the explanation changes" points at the template-owned file. Both source files say the opposite: put collection wording in `overrides.json` and *leave `methodology.json` alone so template improvements keep arriving on version bump*. Following C2 costs you future template updates and turns a take-whole file into a hand-merge in A4. |
| C2 cover items | The merge mechanics are worth one line: patch by reusing an `id`, add with a new `id` (plus optional `after`), remove with `"remove": true`. Without them "edit the prose" is not actionable. |
| C2 header | `WHAT CHANGED` cannot express *which* section changed, which is the only thing the runbook needs in order to name a file region. |
| C2 cover items | Worth naming which sections are expected to be collection-specific — `how-scored` and `boards` — since editing any other section in an override is a sign the change belongs upstream in the template instead. |
