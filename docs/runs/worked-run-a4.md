# Worked run — A4, pull newer template features into an existing collection

**Driven by prompt A4** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and
`docs/new-collection-deployment-guide.md` Step 5 disagree, the guide wins.

**Applicable project: `my-new-collection`.** The gap below is real — it was measured by
listing both projects, not estimated — and two earlier worked runs already tripped over
it: C1's step E cannot run in this collection at all, because its `textcards.csv`
predates the `postUrl` column.

> It is the mainnet reference. The merge itself is local and safe; the *test pass*
> before pushing is the step that matters here.

---

## SAMPLE HEADER

### A4 — Pull newer template features into an existing collection

```
I want to pull newer TEMPLATE-OPEN-EDITION features into an existing
collection without losing its customization.

COLLECTION:       my-new-collection
FEATURES WANTED:  everything since the fork
```

---

## PART 1 — RUNBOOK

### 1. Find the fork point

```
git log --oneline --all
git merge-base <this-collection-branch> <template-remote>/main
```

The fork-point commit is what every comparison below is measured against. Without it
`git diff` compares two divergent tips and reports every intentional customization as
a difference.

### 2. Compare per file, and read the rule out of the result

```
git diff --ignore-space-at-eol -w <fork-point> -- <path>
```

- **No differences** → the collection never touched this file. **Safe to replace
  wholesale.**
- **Real differences** → the collection customized it. **Hand-merge**, never overwrite.

`-w` and `--ignore-space-at-eol` matter because a CRLF checkout otherwise reports every
line of every file as changed, which turns the whole exercise into noise.

### 3. Which files are which

| Take whole (generic tooling) | Hand-merge (carries collection identity) |
|---|---|
| `backend/scripts/*.js` — the deploy and upload scripts | `frontend/index.html` |
| `backend/scripts/lib/` | `frontend/src/ui.engine.ts`, `state.ts`, `types.ts`, `main.ts` |
| `backend/post-templates/*.txt` | `backend/config.json` |
| | `backend/master.csv` |

The split is about ownership, not risk appetite: the tooling is the same in every
collection and the identity files are the reason this collection exists.

### 4. Missing directories — what a diff loop will never surface

**This is the important step for this collection, and a per-file diff will not find
any of it**, because you cannot diff a path that does not exist on one side. Measured
today:

**Whole directories absent from `my-new-collection`:**

| Path | Consequence |
|---|---|
| `backend/standings/` | No ranked or community boards. D1, D2, D3, E4, E5 have nothing to run against. |
| `backend/methodology/` | No methodology page, so C2 has no source and `generate-methodology.js` has nothing to publish. |
| `backend/post-templates/` | **All six templates missing** — `announcement.txt`, `campaign-launch.txt`, `contest-result.txt`, `mint-live.txt`, `ranking-highlight.txt`, `ranking-highlight-noscore.txt`. |

**Scripts absent from `backend/scripts/`** — nine of them:

```
baseline.js                 compose-post.js
generate-methodology.js     generate-standings-cards.js
import-community-boards.js  import-ranked-boards.js
lib/                        publish-round.js
set-post-url.js
```

So in this collection today: **no post can be composed** (`compose-post.js` and every
template are missing), **no post url can be recorded** (`set-post-url.js`), and **no
round can be published** (`publish-round.js` and both importers). Nothing errors — the
commands simply do not exist, which reads as a typo rather than a missing feature.

**Two more gaps that are files rather than directories:**

- **`backend/textcards.csv` has 13 columns, not 16** — no `image`, `imageAlt` or
  `postUrl`. This is the one that blocks C1 step E, and it is a *header* difference, so
  a wholesale replace would destroy the collection's card rows. **Hand-merge: append
  the three column names to the header and a trailing `,,` to every existing row.**
- **`template-version.json` has no `collectionName` key at all.** The template ships
  one. A1 step 6 makes it a pre-mint decision, and this collection is already minted —
  so add the key with the name that is *already on chain*, never a corrected one.

**Check for missing directories explicitly**, before and after:

```
diff <(ls TEMPLATE-OPEN-EDITION/backend) <(ls my-new-collection/backend)
diff <(ls TEMPLATE-OPEN-EDITION/backend/scripts) <(ls my-new-collection/backend/scripts)
```

### 5. Delete what should not have come across

- `docs/open-items.md` — its own entry says *"Delete when forking."*
- `backend/standings/EXAMPLE-participants-accuracy.json` — arrives with
  `backend/standings/` in step 4; delete it once the directory is in.

`docs/` in this collection is missing `generation-prompts.md`, `open-items.md`,
`post-generator-spec.md` and the worked runs. **Those are documentation, not template
features** — copy them if you want them locally, but note that `generation-prompts.md`
already exists in two places, and a third copy is a third thing to keep in sync.

### 6. Test pass, before pushing

In order, because each depends on the last:

```
node backend/scripts/generate-registry.js
node backend/scripts/generate-content-registry.js
node backend/scripts/generate-campaigns-registry.js
node backend/scripts/compose-post.js announcement --id <a real textCardId> --site <url>
node backend/scripts/publish-round.js            # only once standings/ has content
```

The `compose-post.js` run is the one that proves the merge: it exercises a new script,
a new template directory, and `--site` — which this collection needs on every run,
because `collectionExternalUrl` is empty on every row of its `master.csv`.

Then check the three registry JSONs still list what they listed before the merge. A
tooling upgrade that quietly drops a campaign or a card is the failure this pass exists
to catch.

---

## PART 2 — DISPOSITION TABLE

| # | Path | Disposition | Notes |
|---|---|---|---|
| 1 | `backend/scripts/*.js` (nine missing) | **Created** — copied whole | Generic tooling; no differences to merge. |
| 2 | `backend/scripts/lib/` | **Created** — copied whole | |
| 3 | `backend/post-templates/` (six files) | **Created** — copied whole | Nothing composes without them. |
| 4 | `backend/standings/` | **Created** — copied whole, then pruned | Delete `EXAMPLE-participants-accuracy.json`; `_input/` placeholders then need A1-style substitution and D1 to declare a board. |
| 5 | `backend/methodology/` | **Created** — copied whole | |
| 6 | `backend/textcards.csv` | **Edited by hand** | Header gains `image,imageAlt,postUrl`; every existing row gains `,,`. Never replaced wholesale. |
| 7 | `template-version.json` | **Edited by hand** | Add `collectionName` — the name already on chain. |
| 8 | `frontend/index.html`, `src/*.ts` | **Hand-merged** if the diff shows differences | Collection identity. |
| 9 | `backend/config.json`, `backend/master.csv` | **Hand-merged** | Identity and data. |
| 10 | `docs/open-items.md` | **Deleted** if it arrived | |
| 11 | `backend/registry.json`, `content-registry.json`, `campaigns.json` | **Regenerated** in the test pass | Compare against pre-merge contents. |

---

## PART 3 — REFUSALS

1. **Do not replace `textcards.csv`, `master.csv`, `config.json` or any frontend
   source wholesale.** A header-shape upgrade is a hand-merge, not a copy.
2. **Do not rely on a per-file diff to find missing features.** A directory that does
   not exist produces no diff at all.
3. **Do not correct `collectionName` while adding it.** It is on chain; the file must
   match what was minted, not what you would prefer.
4. **Do not push before the test pass.** This is the mainnet reference.
5. **Do not copy `docs/open-items.md`** into a collection — it is the template's
   backlog.
6. **Do not treat the absence of `compose-post.js` as a broken command.** The feature
   was never forked in.

---

## PART 4 — VERIFICATION CHECKLIST

**Before merging**

- [ ] Fork-point commit identified with `git merge-base`, not guessed.
- [ ] Working tree clean; a checkpoint commit exists.
- [ ] Directory-level diffs run for `backend/`, `backend/scripts/`, `docs/`, `frontend/src/`.

**After merging**

- [ ] Nine scripts and `lib/` present.
- [ ] All six post templates present.
- [ ] `backend/standings/` and `backend/methodology/` present; the EXAMPLE board deleted.
- [ ] `textcards.csv` header shows **16** columns and every pre-existing row gained two trailing commas — row count unchanged.
- [ ] `template-version.json` has `collectionName`, matching the on-chain name exactly.
- [ ] `config.json`, `master.csv` and the frontend sources still carry this collection's identity.

**Test pass**

- [ ] All three registry generators run clean.
- [ ] Registry contents match pre-merge (no dropped drop, card or campaign).
- [ ] `compose-post.js announcement --id <real id> --site <url>` composes and reports a character count.
- [ ] Only then: commit and push.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `FORK POINT` | A4 tells the runbook to find it but collects nothing; if `git merge-base` fails — separate histories, a squashed import — there is no fallback stated. |
| `ON-CHAIN COLLECTION NAME` | Needed to add `collectionName` to `template-version.json` for an already-minted collection. It cannot be derived from the folder. |
| `SITE URL` | The test pass needs `--site` in this collection, because `collectionExternalUrl` is empty. |
| `TEST CARD ID` | The `compose-post.js` smoke test needs a real `textCardId` from the collection. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| A4 cover items | The missing-directories bullet names `backend/standings/`, `backend/methodology/` "and the scripts that serve them". In this collection it is **nine scripts, `lib/`, and the entire `post-templates/` directory** — the last of which is not mentioned and is what actually makes every compose command impossible. Worth naming it. |
| A4 cover items | Nothing covers a **header-shape upgrade to a data file**. `textcards.csv` gaining three columns is a template feature that arrives inside a file you must never replace wholesale, and the merge is mechanical: append the names, append `,,` to each row. It is the exact case C1 now tells people to come here for. |
| A4 cover items | Nothing covers `template-version.json` gaining `collectionName` on an **already-minted** collection, where the value is dictated by the chain rather than chosen. |
| A4 header | Collects no `SITE URL` or test card id, though a test pass is a required step and in this collection it cannot run without both. |
| A4 cover items | The test pass is "a test pass after the merge, before pushing" — worth naming the commands and the acceptance test (registries unchanged, one compose succeeds), since a merge that silently drops a card looks identical to a clean one. |
