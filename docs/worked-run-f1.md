# Worked run — F1, compose a post

**Driven by prompt F1** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and `backend/scripts/compose-post.js` or
`docs/post-generator-spec.md` disagree, those win.

**Applicable project: `TEMPLATE-OPEN-EDITION`.** Its sample rows exercise the sourcing
rule, and its `collectionExternalUrl` is the shipped placeholder — which makes the
`--site` case real rather than hypothetical.

---

## SAMPLE HEADER

### F1 — Compose a post

```
I want to compose a post.

TARGET:    TEMPLATE-OPEN-EDITION
TEMPLATE:  mint-live
RECORD ID: SAMPLE-001
BUDGET:    280
```

---

## PART 1 — RUNBOOK

### 1. The command, and the sourcing rule that decides what `--id` means

```
node backend/scripts/compose-post.js mint-live --id SAMPLE-001 --site https://your-site.example
```

**There is no universal id field.** The template's `#source:` line decides which file
is read and therefore what `--id` addresses:

| Template `#source:` | File | `--id` matches |
|---|---|---|
| `master` — mint / drop | `backend/master.csv` | `dropItemId` |
| `campaigns` | `backend/campaigns.csv` | `campaignId` |
| `textcards` | `backend/textcards.csv` | `textCardId` |
| `standings` | `frontend/public/standings.json` | `boardId` |

**Authored content is sourced from its CSV; generated content from its published
artifact.** That asymmetry is the rule worth remembering: a standings post reads the
*published* JSON, so composing before publishing reads the previous round — and in
`my-new-collection`, where `TEST-001` is both a `dropItemId` and a `textCardId`, the
same `--id` addresses different records depending on the template.

`mint-live` is `#source: master`, so `SAMPLE-001` here is a drop.

### 2. stdout for the post, stderr for the report

```
node backend/scripts/compose-post.js mint-live --id SAMPLE-001 --site <url> > post.txt
```

The post goes to **stdout**, the character report to **stderr** — so a redirect gives a
clean file with the budget still on screen. `--out <path>` does the same without the
redirect.

### 3. `--limit`, and the count that is weighted rather than counted

Default **280**. Pass `--limit 25000` for Premium.

**The count is weighted, the way X counts:**

| Thing | Weight |
|---|---|
| a URL | **23**, whatever its real length |
| emoji, CJK | 2 |
| most Latin | 1 |
| an em dash `—` | 1 |
| a right arrow `→` | **2** |

So shortening a link saves nothing, and a decorative arrow costs twice a dash. The
`mint-live` template ends `Mint → {itemExternalUrl}` — that arrow is 2 and that URL is
23, whatever it resolves to.

### 4. Over budget

**It prints the post, names the line to cut, and writes nothing.** Exit `2`. So a file
produced by `--out` is by definition a post that fits, and the way to fix an over-budget
post is to shorten the named line — not to trim the template, which is shared.

### 5. The refusals

| Refusal | Meaning |
|---|---|
| **unknown placeholder** | the template names a field the record does not offer — the error lists **every available field**, which is also the trick for discovering what a record offers |
| **empty required field** | the record has the field and it is blank |
| **unmatched `--id`** | no record with that id in that source, and the error lists the available ids |
| **`example: true` board** | needs `--allow-example`, so a sample board cannot be posted as real by accident |
| **standings template with no `{methodologyUrl}`** | refused outright — a published ranking must carry the link that explains it |

Each names the valid options rather than only failing.

### 6. The discovery trick

**Put a placeholder that does not exist into the template and read the error** — it
lists every available field, and on a standings board it lists **that board's** entry
fields. Faster than reading the source file, and correct by construction.

### 7. `--site`

Needed whenever `collectionExternalUrl` in `master.csv` is still the placeholder —
which in this project it is: **`https://example.com`**. `resolveSiteUrl()` reads it from
the **first row** of `master.csv`, so without `--site` the post composes successfully
and points at example.com. Not a failure; a silently wrong link.

### 8. Then read it, post it, record the url

Nothing here posts to X. Read the draft, post it yourself, and record the url where the
record keeps it — `set-post-url.js <textCardId>` for a text card, `--record-url` for an
Index Portfolio contest.

---

## PART 2 — DISPOSITION TABLE

| # | Path | Disposition | What goes where |
|---|---|---|---|
| 1 | `backend/post-templates/mint-live.txt` | **Read only** | `#source: master` decides the sourcing. |
| 2 | `backend/master.csv` | **Read only** | The `SAMPLE-001` row; also row 1's `collectionExternalUrl` for `{siteUrl}`. |
| 3 | `backend/scripts/compose-post.js` | Run | `--id`, `--site`, `--out`, `--limit`, `--allow-example`. |
| 4 | `post.txt` | **Generated**, only if within budget | Or stdout. |
| 5 | The X post | **Created by hand** | Nothing automates it. |
| 6 | `textcards.csv` → `postUrl` *or* a contest JSON → `post_url` | **Edited afterwards** | Only for templates whose record keeps a url. |

---

## PART 3 — REFUSALS

1. **No universal `--id`.** The template's source decides what it addresses.
2. **Over budget writes nothing** and exits `2`.
3. **Unknown placeholder, empty required field, unmatched id** — each fails and lists
   the valid options.
4. **An `example: true` board needs `--allow-example`.**
5. **A standings template without `{methodologyUrl}` is refused.**
6. **Nothing posts to X.**
7. **A composed post is a draft** — the character report is advice about length, not
   about accuracy.

---

## PART 4 — VERIFICATION CHECKLIST

- [ ] Template chosen, and its `#source:` line matches the kind of `RECORD ID` you have.
- [ ] `--id` exists in **that** source — not merely somewhere in the project.
- [ ] For a standings template: the round is **published** first, since it reads `frontend/public/standings.json`.
- [ ] `--site` passed, or `collectionExternalUrl` row 1 is a real URL.
- [ ] Report read on stderr: total under limit, "to spare" line present.
- [ ] Any URL counted as 23 when estimating — shortening it saves nothing.
- [ ] Draft read in full before posting.
- [ ] Url recorded afterwards, if this record keeps one.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `SITE URL` | F1 covers `--site` and never collects it; the shipped state of every fresh collection needs it. |
| `OUT PATH` | `--out` is covered; whether you want a file is a real choice. |
| `ALLOW EXAMPLE?` | A deliberate override with a publishing consequence. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| F1 cover items | The sourcing table is the best thing in this prompt, and it stops one step short: **a standings post reads the published artifact**, so composing before `publish-round.js` silently composes the *previous* round. Worth stating as a sequencing rule, not only a sourcing one. |
| F1 header | Collects `RECORD ID` without saying its kind is decided by `TEMPLATE`. In a collection where the same string is a `dropItemId` and a `textCardId` — `my-new-collection` has exactly that — the pair is ambiguous to a reader and not to the tool. |
| F1 header | No `SITE URL`, though the runbook needs `--site` in every collection whose `collectionExternalUrl` is unset — the shipped state. |
| F1 cover items | The weighted-count explanation is precise. Worth adding the consequence people act on: **shortening a URL saves nothing**, so budget by cutting words, not links. |
