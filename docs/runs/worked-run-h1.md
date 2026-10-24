# Worked run — H1, register the worked-run corpus

**Driven by prompt H1** in `docs/generation-prompts.md`, document branch. One complete
run: the filled header, and all five parts of the output contract.

**This run was executed, not described.** The registration below was actually performed
against both copies of the library.

**Applicable target: the document library itself.** H1 is the maintenance prompt, so
its worked run is the registration of the other 22 worked runs — which also makes it
the only fixture whose subject is the fixtures.

---

## SAMPLE HEADER

### H1 — Register a new target or document

```
I want to register something new in docs/generation-prompts.md.

WHAT KIND:  document

IF A DOCUMENT:
  PATH:                 docs/runs/worked-run-*.md  (22 files)
  WHAT IT COVERS:       One complete run of one prompt — filled header and all
                        five parts of the output — built against real project
                        files, ending with findings about that prompt.
  WHEN TO REACH FOR IT: Running a prompt for the first time, or checking
                        whether an answer a prompt gave you is a real run or an
                        improvised one.
  COMPANION TO:         docs/generation-prompts.md — one file per prompt in it.
  DRIVEN BY A PROMPT?:  Yes — each is driven by the prompt it works.
```

---

## PART 1 — RUNBOOK

H1's document branch requires a document be **reachable from two directions**, and lists
four checks with an instruction never to skip one silently. All four, reported:

### 1. The closing table — **done, and deliberately not as 22 rows**

*"This is the index someone scans to learn what exists, so a document missing from it is
effectively invisible."*

Twenty-two rows would have made the table unscannable — defeating the check by
satisfying it. So the five existing per-prompt rows were **collapsed into one corpus
row** naming the set, the coverage (23 of 28 prompts, listed by id), the shape of each
file, and the *"not a source of truth"* clause the individual rows carried.

**`docs/runs/worked-run-e1.md` keeps its own row.** It predates this set, it is cited three
times in the file's prose, and it is the reference for *What a good run gives back* —
a different role from "one run per prompt."

### 2. The pointer back — **done**

*"A doc in `TEMPLATE-OPEN-EDITION/docs/` → a row in
`new-collection-deployment-guide.md`'s 'Where things are documented' table."*

Same collapse applied there: five per-prompt rows replaced by one corpus row, placed
directly after the E1 row and before `backend/standings/README.md`.

### 3. The prompt link — **done, 21 new pointers**

*"If a prompt drives this document, its Reference block must cite it, and the document
should say which prompt drives it."*

Both directions:

- **Prompt → document:** a pointer added after the `**Reference:**` line of every
  prompt that now has a worked run and lacked one — A1, A2, A4, A5, A6, A7, B2, C2, D2,
  D3, E2, E4, E5, E6, F1, F2, G1, G2, G3, G4, G5. B1, C1, D1 and E3 already had theirs.
- **Document → prompt:** every worked run opens *"Driven by prompt X in
  `docs/generation-prompts.md`."*

**A3 has no pointer, because it has no worked run** — deliberately skipped, since its
runbook spends real SOL when executed.

### 4. The reverse check — **one supersession, handled**

*"Does this document supersede or contradict anything already in the closing table?"*

- **`docs/runs/worked-run-e1.md`** — not superseded. Different role, kept.
- **The five per-prompt rows** — superseded by the corpus row, and removed rather than
  left to disagree.
- **`docs/open-items.md`** — the worked runs' findings appendices overlap its purpose.
  **Not resolved here, and worth your decision:** either the findings migrate into
  `open-items.md` as backlog, or `open-items.md` gains a line pointing at the appendices.
  Two records of what is wrong with the library, kept by different hands, is the exact
  shape H1's fourth check exists to catch.

### Either branch: every file changed

| File | Change |
|---|---|
| `TEMPLATE-OPEN-EDITION\docs\generation-prompts.md` | 21 prompt pointers; 5 rows collapsed to 1 |
| `TEMPLATE-TEST-LEDGER\docs\generation-prompts.md` | identical |
| `TEMPLATE-OPEN-EDITION\docs\new-collection-deployment-guide.md` | 5 rows collapsed to 1 |
| `…\docs\worked-run-*.md` (22 files, both projects) | written |

**These documents are updated in place, never versioned — one copy of each, always
matching what is on disk.** Which is exactly the rule the next finding contradicts.

---

## PART 2 — DISPOSITION TABLE

| # | Path | Disposition | What went where |
|---|---|---|---|
| 1 | `generation-prompts.md` × 2 | **Edited** | Pointer after 21 `**Reference:**` lines; corpus row before the `open-items.md` row. |
| 2 | `new-collection-deployment-guide.md` | **Edited** | Corpus row after the E1 row. |
| 3 | `worked-run-a1/a2/a4/a5/a6/a7.md` | **Created** × 2 | A-series. |
| 4 | `worked-run-b2.md`, `worked-run-c2.md` | **Created** × 2 | |
| 5 | `worked-run-d2/d3.md` | **Created** × 2 | |
| 6 | `worked-run-e2/e4/e5/e6.md` | **Created** × 2 | |
| 7 | `worked-run-e3-index.md` | **Replaced** × 2 | Corrected: the live contest field has six members. |
| 8 | `worked-run-f1/f2.md` | **Created** × 2 | |
| 9 | `worked-run-g1/g2/g3/g4/g5.md` | **Created** × 2 | |
| 10 | `docs/open-items.md` | **Not touched** | Pending the decision in §4. |

---

## PART 3 — REFUSALS

1. **Would not add 22 rows to the closing table.** A table nobody scans fails the check
   it passes.
2. **Would not register A3**, which has no worked run.
3. **Would not silently skip a check** — all four reported, including the unresolved one.
4. **Would not retire `worked-run-e1.md`** to tidy the table; it has a distinct role.
5. **Would not resolve the `open-items.md` overlap unilaterally.** Which record owns
   the backlog is an editorial decision.
6. **Would not version any document.** In place, one copy.

---

## PART 4 — VERIFICATION CHECKLIST

- [x] 22 worked runs written to both projects' `docs/`.
- [x] Both `generation-prompts.md` copies byte-identical afterwards (`a6f31ebe…`).
- [x] 21 pointers added; B1/C1/D1/E3 not duplicated; A3 correctly absent.
- [x] Closing table has one corpus row plus E1's; the five per-prompt rows are gone.
- [x] Deployment guide matches.
- [x] Every worked run names its driving prompt in its first line.
- [ ] **`open-items.md` overlap decided** — yours.
- [ ] **The second findings batch applied** — roughly twenty items from runs 8–21.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `HOW MANY DOCUMENTS` | H1's document branch is written for **one** document. Registering a set is a different job: the closing table wants one row, the prompt links want twenty-one. Nothing in H1 says which shape to use. |
| `WHICH COPY IS CANONICAL` | Every edit here was applied twice, by hand, because `generation-prompts.md` exists in two projects. H1 ends by reminding you there is *"one copy of each"* — and there are two. |
| `BACKLOG OWNER` | Whether findings live in `open-items.md` or in the appendices. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| H1, document branch | Written for **one** document. A set of 22 needs one closing-table row and twenty-one prompt links, and following H1 literally produces 22 rows that make the index useless. Worth a line: *register a set as a set, and link each member from the prompt it serves.* |
| H1, closing instruction | *"these documents are updated in place, never versioned — one copy of each, always matching what is on disk"* — and `generation-prompts.md` has **two copies**, in TEMPLATE-OPEN-EDITION and TEMPLATE-TEST-LEDGER, kept in sync by hand. Every edit in this session was applied twice. H1 is the prompt that should name the canonical copy, and it is the one place the duplication is invisible. |
| H1, reverse check | Correctly catches supersession between documents. It does not ask about **overlap with a backlog**: `open-items.md` and 22 findings appendices now record the same class of fact. |
| H1, target branch | Step 4 says *"If I am here because a run reported something under Missing inputs, add that field to the prompt's header."* Twenty-two runs produced roughly sixty Missing-inputs entries. H1 handles them one at a time; nothing covers arriving with a batch, which is the normal case after a review pass. |
