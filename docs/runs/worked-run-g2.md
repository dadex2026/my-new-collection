# Worked run — G2, ship a new dashboard build

**Driven by prompt G2** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and `Dashboards\README.md` or the project's
own `README.md` disagree, those win.

**Applicable project: `Dashboards\Entertainment Ledger`.** It has the fullest shipping
history in the platform — `_superseded/` holds v1.0 through v1.3, v1.4 is live — and it
is the one tool whose builds are already declared downstream in a collection's
`rulesets.json`, so the last cover item has something real to check.

---

## SAMPLE HEADER

### G2 — Ship a new dashboard build

```
I want to ship a new build of a dashboard.

DASHBOARD:     Entertainment Ledger (v1.4)
NEW VERSION:   v1.5
WHAT CHANGED:  Community leaderboard export gains a Combined column so the
               post-type split is visible in the export, not only in the tool.
               No scoring formula changed.
```

---

## PART 1 — RUNBOOK

### 1. Write the new `.html` into the project folder

`Dashboards\Entertainment Ledger\entertainment-ledger-v1.5.html` — **written there
directly, never through Downloads.** A browser resolves a filename collision by
appending `_1`, and Downloads is the folder Windows Storage Sense may auto-empty.

### 2. Move the previous build to `_superseded/` the **same day**

```
entertainment-ledger-v1.4.html  →  _superseded\entertainment-ledger-v1.4.html
```

`_superseded/` then reads v1.0, v1.1, v1.2, v1.3, v1.4, and the folder has exactly one
loose `.html` again. **Two loose builds is the failure the whole structure exists to
prevent** — every document in the folder names a version, and with two candidates you
cannot tell which file it means.

"Same day" is the rule because the gap is where the ambiguity lives, not because
tomorrow is too late.

### 3. The build stamp

The masthead prints version and date — this project's current stamp is
`2026-08-22 · v1.4`, so v1.5 gets its own. **A tool that carries no stamp puts the date
in the filename instead**, which is what `github-evaluator-2026-08-17.html` does.

### 4. Update every document in the folder, in place

This project has four, and **each must open by naming the build it describes**:

| Document | Update because |
|---|---|
| `README.md` | Opens *"Current build: `entertainment-ledger-v1.4.html`"* with the stamp quoted — **two edits, not one**. |
| `entertainment-ledger-guide.md` | User-facing behaviour. |
| `entertainment-ledger-calculations-reference.md` | Formulas — unchanged here, but its build line is not. |
| `entertainment-ledger-extraction-summary.md` | Describes the paste/export contract, which **is** what changed. |

**Never versioned.** One copy of each, updated in place, always matching the loose
`.html`. If a document and the masthead disagree, believe the tool.

### 5. The prompt check

**Did anything about an input or output format change?** Here, yes — the export gains a
column.

Re-verify **`prompts\entertainment-paste-prompt.md`**, this project's only prompt file,
and update its verified-build line to v1.5.

And apply the corollary that has bitten this exact project: **a scoring change is not
shipped until the prompt that feeds it can produce the input.** v1.3 added a Combined
post type the tool scored and no prompt emitted, leaving the feature unreachable for
two builds. This change is the mirror image — an *export* column rather than an input —
so the check is that the prompt's documented output still matches what the tool now
writes. Ship the pair.

### 6. The test-data pass

This project keeps expected values:

```
test-data\entertainment-community-test-1-billboard.md
test-data\entertainment-community-test-2-emmys.md
```

Paste each set into v1.5 and compare against the recorded expectations. **No formula
changed in this build, so every number must match exactly** — a difference is a
regression, not an update. (When a formula *does* change, the expected values are part
of the build: update them deliberately and say so in `WHAT CHANGED`.)

`backups\entertainment-ledger-backup-2026-08-20.json` carries the version that wrote
it; restoring it into v1.5 is the other half of the pass.

### 7. Downstream: does a collection's standings import care?

Two separate questions, and this build trips the second:

**A changed column label** needs a `columnMap` entry in the consuming collection's
`_input/import-config.json`. Adding a *new* column is safer than renaming one —
mapping is additive and the importer reads by logical name — but confirm the new
`Combined` column does not collide with a name already mapped.

**A changed `AppVersion` needs a `rulesets.json` declaration on the collection side**,
and this is not hypothetical. `TEMPLATE-TEST-LEDGER` declares exactly three:

```
entertainment-ledger-v1.2  baseline
entertainment-ledger-v1.3  rule-change
entertainment-ledger-v1.4  export-only
```

**An export stamped `v1.5` imported before a v1.5 entry exists is refused** —
*"ruleset not declared in rulesets.json — tried "v1.5" and "entertainment-ledger-v1.5""*.
The `kind` is the consequential part: this build changes what the export carries and no
number moves, so it is **`export-only`**, and movement is retained. Declaring it
`rule-change` would suppress movement across a boundary where nothing actually changed.

**Do this before the first v1.5 export reaches a collection**, not after the import
stops.

---

## PART 2 — DISPOSITION TABLE

| # | Path | Disposition | What goes where |
|---|---|---|---|
| 1 | `entertainment-ledger-v1.5.html` | **Created** | Written into the folder directly; masthead stamped `… · v1.5`. |
| 2 | `_superseded\entertainment-ledger-v1.4.html` | **Moved** — same day | Leaves one loose `.html`. |
| 3 | `README.md` | **Edited in place** | Build name *and* stamp on the opening lines. |
| 4 | `entertainment-ledger-guide.md` | **Edited in place** | Build line; behaviour if changed. |
| 5 | `entertainment-ledger-calculations-reference.md` | **Edited in place** | Build line only — no formula changed. |
| 6 | `entertainment-ledger-extraction-summary.md` | **Edited in place** | The export contract — the substantive edit. |
| 7 | `prompts\entertainment-paste-prompt.md` | **Edited** | Verified-build line → v1.5; output shape re-checked. |
| 8 | `test-data\*.md` | **Read** (expected values unchanged) | Regression pass. |
| 9 | `backups\…-2026-08-20.json` | **Read** | Restore check. |
| 10 | `TEMPLATE-TEST-LEDGER\backend\standings\_input\rulesets.json` | **Edited — different project** | New `entertainment-ledger-v1.5` entry, `kind: export-only`. |
| 11 | `_input/import-config.json` (consuming collection) | **Possibly edited** | `columnMap`, only if a label changed rather than was added. |
| 12 | `Dashboards\README.md` | **Edited** | The live-file column for this project. |

---

## PART 3 — REFUSALS

1. **Never two loose `.html` files** — the move happens the same day.
2. **Never write a build through Downloads.**
3. **Never version a document.** One copy, in place.
4. **Never leave a document naming an older build.** Believe the tool, fix the doc.
5. **Never ship a scoring change whose input no prompt can produce.**
6. **Never let a new `AppVersion` reach a collection undeclared** — the import refuses,
   correctly.
7. **Never declare an `export-only` change as a `rule-change`** — it suppresses movement
   for no reason, and the suppression is permanent for that boundary.
8. **A test-data difference in a no-formula-change build is a regression**, not a new
   expectation.

---

## PART 4 — VERIFICATION CHECKLIST

**The build**

- [ ] `entertainment-ledger-v1.5.html` written into the folder directly.
- [ ] Masthead shows `v1.5` and today's date.
- [ ] v1.4 moved to `_superseded/`; exactly one loose `.html` remains.

**The documents**

- [ ] All four updated in place; each opens by naming v1.5.
- [ ] `README.md`'s quoted build **stamp** updated too, not only the filename.
- [ ] No document versioned or duplicated.

**Prompts and tests**

- [ ] `entertainment-paste-prompt.md` re-verified; its build line reads v1.5.
- [ ] The prompt can produce and describe every input and output the build now expects.
- [ ] Both test-data sets pasted; every number matches exactly.
- [ ] A backup restored into v1.5 successfully.

**Downstream**

- [ ] `rulesets.json` in every consuming collection declares `entertainment-ledger-v1.5`, `kind: export-only`.
- [ ] The new `Combined` column collides with no mapped logical name.
- [ ] `Dashboards\README.md` names the new live file.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `RULESET KIND` | The downstream declaration needs one, and `kind` decides whether movement is suppressed, retained, or history recomputed. G2 collects `WHAT CHANGED` as prose, from which a model must infer it. |
| `CONSUMING COLLECTIONS` | The `rulesets.json` edit happens in **another project**, possibly several. Nothing collects which. |
| `EFFECTIVE FROM` | Required alongside `kind` in the declaration. |
| `TEST EXPECTATIONS CHANGED?` | Whether a test-data difference is a regression or an intended new expectation — the same difference, opposite meanings. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| G2 cover items | The downstream item names the two triggers but not the **decision**: a new `AppVersion` needs a declaration *and a `kind`*, and choosing wrong is not neutral — `rule-change` suppresses movement across a boundary where nothing moved. Worth collecting `RULESET KIND` and `EFFECTIVE FROM`, since the runbook cannot write the declaration without them. |
| G2 cover items | The declaration lands in **another project's** repo, and G2 collects no list of consuming collections. On a platform where one Ledger feeds several collections, "update rulesets.json" is not one edit. |
| G2 cover items | The test-data pass is listed without its acceptance rule. In a no-formula build every number must match; in a formula build the expectations are part of the change. Same output, opposite conclusions. |
| G2 cover items | Worth naming what a document update actually touches: this project's `README.md` carries both the filename **and** the quoted build stamp, and updating one is the easy half-fix. |
