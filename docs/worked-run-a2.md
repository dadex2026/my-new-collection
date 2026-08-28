# Worked run — A2, add a new drop to an existing collection

**Driven by prompt A2** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and the scripts disagree, the scripts win.
`backend/master.csv`, `schema.json`, `backend/scripts/preflight.js` and
`generate-registry.js` are authoritative.

**Applicable project: `my-new-collection`, not the template.** A2 adds a drop to an
*existing* collection, and the template is not one — the registry's rule is *never run
collection commands there*. `my-new-collection` is also the collection that exercises
every warning A2 carries: 21 columns rather than 16, three `collectionSlug`s in one
CSV, an empty `collectionExternalUrl`, and ids that preflight refuses.

> **It is the mainnet reference.** Its drops carry permanent on-chain names. Read this
> as the shape to copy, and rehearse on a devnet rig.

---

## SAMPLE HEADER

### A2 — Add a new drop to an existing collection

```
I want to add a new drop (open edition) to an existing collection.

COLLECTION:        my-new-collection
COLLECTION SLUG:   test-mech-b
DROP ITEM ID:      OE-002
ITEM NAME:         Week One Commemorative
DESCRIPTION:       Open edition marking the opening weekend of the 2026 season.
PRICE (SOL):       0.05
MAX SUPPLY:        unlimited
ATTRIBUTES:        Season:2026|Week:1|Type:Commemorative
ROYALTY (bps):     500
ITEM EXTERNAL URL: none
MINT STATUS:       ready
IMAGE:             not yet
```

---

## PART 1 — RUNBOOK

### 1. Read the actual header row first — **21 columns, not 16**

```
head -1 backend/master.csv
```

```
collectionSlug,collectionName,collectionDescription,collectionImage,collectionExternalUrl,dropItemId,itemName,itemDescription,itemImage,itemExternalUrl,sellerFeeBasisPoints,attributes,maxSupply,price,mintStatus,uri,collectionAddress,network,candyMachineAddress,candyGuardAddress,treasury
```

**Count found: 21.** The template ships 16; this collection has been through the
deploy scripts, so it carries five more — `collectionAddress`, `network`,
`candyMachineAddress`, `candyGuardAddress`, `treasury`. Build the row from *this*
header, in *this* order. A 16-field row appended to a 21-column file is not an error;
it is five silently missing values.

### 2. Which `collectionSlug` — there are three

`master.csv` holds `test-mech`, `test-mech-a` and `test-mech-b`.

**`backend/config.json` names `test-mech-b` active** (`network: mainnet`, `price:
0.001`). The header above joins `test-mech-b`, which matches — confirm that is what
you intended, because the slug decides which collection name the drop inherits and
which on-chain collection it is minted into.

### 3. Copy the collection-level columns, do not retype them

Columns 1–5 must be **byte-identical** to the other rows sharing `test-mech-b`. From
the existing `TEST-002` row:

| # | Column | Value to copy |
|---|---|---|
| 1 | `collectionSlug` | `test-mech-b` |
| 2 | `collectionName` | `Mechanics Test B` |
| 3 | `collectionDescription` | `Target drop` |
| 4 | `collectionImage` | `https://placehold.co/400x400?text=B` |
| 5 | `collectionExternalUrl` | *(empty)* |

Retyping is how one collection becomes two in the registry.

### 4. `collectionExternalUrl` is empty — and that has a consequence

**Every row in this file has it blank.** So `{siteUrl}` and `{methodologyUrl}` cannot
resolve, and **every `compose-post.js` run against this collection needs `--site`**.
Not a failure — a silently wrong post pointing nowhere. Fix it at the source by
populating column 5 across the rows, or pass `--site` every time and never forget.

### 5. Columns a script writes — leave them empty

| Column | Written by |
|---|---|
| `itemImage` | `upload-images.js` |
| `uri` | `upload-metadata.js` |
| `collectionAddress`, `network` | `deploy-collection.js` |
| `candyMachineAddress`, `candyGuardAddress`, `treasury` | `deploy-candy-machine.js` |

Seven of the 21. Filling them by hand fabricates on-chain state that does not exist.

### 6. The row

```
test-mech-b,Mechanics Test B,Target drop,https://placehold.co/400x400?text=B,,OE-002,Week One Commemorative,Open edition marking the opening weekend of the 2026 season.,,,500,Season:2026|Week:1|Type:Commemorative,unlimited,0.05,ready,,,,,,
```

21 fields, 20 commas. Empty: `collectionExternalUrl` (5), `itemImage` (9),
`itemExternalUrl` (10), `uri` (16), and the five deploy columns (17–21) — six trailing
commas at the end.

- **`ATTRIBUTES` uses pipes**, never commas: a comma anywhere in a field means the
  whole field needs quoting, which is exactly what the pipe separator avoids.
- **`MAX SUPPLY` is the word `unlimited`.** `∞`, `infinity` and `INF` are
  **forbidden values** per `schema.json`, where `maxSupply` is `["number", "null"]`
  and null means open.
- **`ROYALTY 500`** goes in `sellerFeeBasisPoints` = 5%.

### 7. Preflight — this collection cannot pass, by design

`preflight.js` refuses reserved prefixes on **both** identifiers:

```
DEFAULT_RESERVED_SLUG_PREFIXES = ["test-", "demo-", "sample-"]
DEFAULT_RESERVED_ID_PREFIXES   = ["TEST-", "DEMO-", "SAMPLE-"]
```

- `OE-002` passes.
- **`test-mech-b` does not.** Every slug in this collection starts with `test-`, and
  every existing drop id starts with `TEST-`:

  > `collectionSlug "test-mech-b" uses a reserved/test prefix (test-, demo-, sample-) — this looks like test data, not a real collection`

`--allow-warnings` downgrades it; `--reserved-slug-prefix` / `--reserved-id-prefix`
override the lists. **Do not reach for either reflexively.** In this collection the
refusal is correct — it *is* test data that happens to live on mainnet — and that is
precisely why A3 must not be run here.

### 8. Publishable now, or does it need A3 first?

`IMAGE: not yet` decides it. **This drop is not publishable.** Real images are an A3
prerequisite, and `itemImage`/`uri` stay empty until `upload-images.js` and
`upload-metadata.js` run. Add the row and the registry entry now; the mint waits.

### 9. Generate the registry

```
node backend/scripts/generate-registry.js
```

Writes `backend/registry.json`, with a best-effort convenience copy to
`frontend/public/registry.json` when that directory exists. It replaces what a
`GET /registry` endpoint used to serve — the frontend fetches the static file, so a
new drop is invisible until this runs *and* ships.

`minted` is `null` unless `--fetch-minted`; the frontend treats null as "check
on-chain" rather than zero.

### 10. Commit, push, hard refresh

```
git add backend/master.csv backend/registry.json frontend/public/registry.json
git commit -m "Add OE-002 to test-mech-b"
git push
```

Then hard refresh — `registry.json` is a static asset and a normal reload serves the
cached copy.

---

## PART 2 — DISPOSITION TABLE

| # | File | Path | Disposition | What goes where |
|---|---|---|---|---|
| 1 | Drop registry | `backend/master.csv` | **Edited** — one row appended | The 21-field row. Columns 1–5 copied from an existing `test-mech-b` row; seven script-written columns left empty. |
| 2 | Schema | `schema.json` | Read only | `maxSupply` rules and forbidden values. |
| 3 | Preflight | `backend/scripts/preflight.js` | Run | Refuses on the slug here; see §7. |
| 4 | Registry generator | `backend/scripts/generate-registry.js` | Run | Reads #1. |
| 5 | Backend registry | `backend/registry.json` | **Generated** | Default output. |
| 6 | Frontend registry | `frontend/public/registry.json` | **Generated** (copy) | What the site fetches. |
| 7 | Image pipeline | `upload-images.js`, `upload-metadata.js` | **Not run** | `IMAGE: not yet` — A3 territory. |
| 8 | Deploy scripts | `deploy-collection.js`, `deploy-candy-machine.js` | **Not run** | They own columns 17–21. |

---

## PART 3 — REFUSALS

1. **Will not build the row from an assumed column count.** Read the header; this file
   has 21 columns.
2. **Will not retype the collection-level columns.** Copy them byte-for-byte.
3. **Will not fill `itemImage`, `uri`, or the five deploy columns by hand.**
4. **`preflight.js` refuses a reserved slug or id prefix**, and here it refuses the
   slug. `--allow-warnings` exists but is not a fix.
5. **`schema.json` forbids `∞`, `infinity`, `INF`** for `maxSupply`.
6. **Will not publish a drop with no real image** — that is A3.
7. **Will not use commas inside `attributes`.**

---

## PART 4 — VERIFICATION CHECKLIST

- [ ] `head -1 backend/master.csv` counted: **21** columns, and the new row has 21 fields (20 commas).
- [ ] `COLLECTION SLUG` matches the one `config.json` names active (`test-mech-b`), or the divergence is deliberate.
- [ ] Columns 1–5 are byte-identical to an existing row with that slug.
- [ ] `dropItemId` `OE-002` is unique across the whole file.
- [ ] `attributes` uses pipes; no commas anywhere unquoted.
- [ ] `maxSupply` is `unlimited` — not `∞`.
- [ ] `sellerFeeBasisPoints` is `500`.
- [ ] `itemImage`, `uri`, `collectionAddress`, `network`, `candyMachineAddress`, `candyGuardAddress`, `treasury` all empty.
- [ ] `preflight.js` run and its output *read* — the reserved-slug refusal is expected here.
- [ ] `generate-registry.js` run; the drop appears in **both** registry files.
- [ ] Pushed, then hard-refreshed.
- [ ] If a post is composed for this drop: `--site` passed, because `collectionExternalUrl` is empty.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `ITEM IMAGE FILE` | `IMAGE: not yet` is answered, but when it is a real file A2 does not collect its path or its alt text. |
| `SITE URL` | `collectionExternalUrl` is empty here, so every post needs `--site` — and A2 warns about it without collecting the value that would fix it. |
| `COLLECTION IMAGE` / `COLLECTION DESCRIPTION` | Copied from an existing row when joining a slug, but undefined if the drop starts a *new* slug in the same file — which A2's own second field allows. |
| `PREFLIGHT DECISION` | Whether a reserved-prefix refusal is being accepted, overridden, or fixed. In this collection it is guaranteed to fire. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| A2 header | `COLLECTION SLUG` allows joining a slug that does not yet exist in the file, but A2 collects none of the five collection-level values that a new slug would need. Either say the slug must already exist, or collect them. |
| A2 cover items | The `collectionExternalUrl` warning is there, but the fix is not: A2 never collects a `SITE URL`, so the runbook can only tell you to pass `--site` forever. |
| A2 cover items | The preflight item says the ids "would fail" — worth naming the three default prefixes (`test-`, `demo-`, `sample-` / `TEST-`, `DEMO-`, `SAMPLE-`) and the `--allow-warnings` escape, since the mainnet reference collection trips it on every row. |
| A2 cover items | Nothing says `generate-registry.js` writes **two** files (`backend/registry.json` plus the frontend copy) or that `minted` is `null` without `--fetch-minted`. A missing frontend copy is invisible until the site shows a stale registry. |
| "What must already exist" | The A2 row names the artwork file and the real header row. Worth adding: **the `collectionSlug` this drop joins must already exist in `master.csv`**, or its five collection-level values become new inputs. |
