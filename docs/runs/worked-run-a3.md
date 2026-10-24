# Worked run — A3, take a collection to production mint

**Driven by prompt A3** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** The scripts are. Every flag, exit code and check name below
was read out of `backend/scripts/`.

**NOTHING IN THIS RUN WAS EXECUTED.** A3 is the prompt whose steps buy permanent
artifacts, and three of its prerequisites cannot be verified from here — a funded
deployer, an Irys balance, and `DEPLOYER_PRIVATE_KEY` in `.env.admin`. This is the
runbook and the reading of the code; the confirmations are yours to make.

**Applicable project: `TEMPLATE-TEST-LEDGER`, on devnet.** It is the platform's test
rig — devnet, placeholder config, never deployed — so it is the one target where this
pipeline can be rehearsed without buying anything. `my-new-collection` is the mainnet
reference and is deliberately not used here.

---

## SAMPLE HEADER

### A3 — Take a collection to production mint

```
I want to take a collection to a production mint.

COLLECTION:   TEMPLATE-TEST-LEDGER
NETWORK:      devnet
DROPS:        all
```

---

## PART 1 — RUNBOOK

Eight scripts, in the only order they may run. Each entry: what it reads, what it
writes back into `master.csv`, whether re-running is safe, what `--force` overrides,
and its exit codes. **Exit codes are uniform across the pipeline — 0 success,
1 validation, 2 upload, 3 chain** — which is what lets you tell "I typed something
wrong" from "the network refused" without reading the logs.

### 1. `preflight.js` — the gate

```
node backend/scripts/preflight.js
node backend/scripts/preflight.js --slug founders
node backend/scripts/preflight.js --force            # allow re-deploying an already-deployed collection
node backend/scripts/preflight.js --allow-warnings   # downgrade reserved-prefix/placeholder failures
```

Reads `config.json`, `.env.admin`, `master.csv`, `campaigns.csv`. **Writes nothing.**
Re-running is always safe — it is a read-only audit, and it is the only step in this
pipeline that is.

**The checks, in five groups.** A3 calls them "ten"; the script actually runs
**sixteen** (see the appendix):

| Group | Checks | What each would have caught |
|---|---|---|
| **Project structure** | `config_exists`, `config_valid_json`, `collection_slug_present`, `collection_has_rows` | a missing or malformed `config.json`; a slug naming nothing in `master.csv` |
| **Environment** | `env_admin_exists`, `env_admin_gitignored`, `deployer_key_present`, `treasury_valid`, `rpc_valid`, `deployer_not_treasury` | **a deployer key about to be committed**; an invalid treasury; deployer and treasury being the same wallet, which makes proceeds indistinguishable from float |
| **Content validation** | `no_reserved_slug`, `no_reserved_drop_ids`, `no_placeholder_images`, `no_placeholder_uris` | test data reaching mainnet — `test-`/`demo-`/`sample-` slugs, `TEST-`/`DEMO-`/`SAMPLE-` ids — and **placeholder art or metadata about to be minted permanently** |
| **Campaign validation** | `no_reserved_campaign_ids` | the same test-prefix check on `campaigns.csv` |
| **Deployment state** | `not_already_deployed` | a second deploy over a live collection; `--force` is what overrides this one |

`env_admin_gitignored` is the check worth pausing on: it is the difference between a
key on your disk and a key in every clone of your repo forever.

### 2. `prepare-images.js` — local images into `backend/images/`

```
node backend/scripts/prepare-images.js
node backend/scripts/prepare-images.js --source ./incoming-images
node backend/scripts/prepare-images.js --source ./incoming-images --force
```

Reads the source folder and `master.csv`; writes files into `backend/images/`, not into
the CSV. Local only — **no SOL, nothing permanent.** `--force` overwrites images already
prepared. Re-running is safe.

### 3. `upload-images.js` — Irys/Arweave → `itemImage`

```
node backend/scripts/upload-images.js
node backend/scripts/upload-images.js --fund     # auto-fund any shortfall before uploading
node backend/scripts/upload-images.js --strict   # fail if any drop has no local image
```

Reads `backend/images/` and `master.csv`; **writes the resulting URL into `itemImage`
per row.**

**⚠ SPENDS — and permanently.** Arweave storage is paid once and kept forever; there is
no delete. Re-running uploads *again* and pays again, so a row that already carries a
real `itemImage` is the thing that makes re-running safe or expensive. `--strict` turns
a missing local image from a skip into a failure, which is what you want before a real
mint. Exit `2` is an upload failure — the money question is whether it failed before or
after payment, and the log is where that is answered.

### 4. `generate-metadata.js` → `backend/metadata/<dropItemId>.json`

```
node backend/scripts/generate-metadata.js
node backend/scripts/generate-metadata.js --force
node backend/scripts/generate-metadata.js --strict            # fail on any placeholder image
node backend/scripts/generate-metadata.js --allow-placeholder # local testing only
```

Reads `master.csv`; writes JSON files. `backend/metadata/` **does not exist in a fresh
checkout — this script creates it.** Local, free, re-runnable; `--force` overwrites
existing metadata files.

**The guardrail, in the script's own words:** by default a row whose `itemImage` is
still a placeholder is **skipped**, because embedding a placeholder image URL into
metadata that then gets uploaded and minted is an *unfixable* mistake. Run
`upload-images.js` first.

**`--allow-placeholder` must never be used against mainnet.** The reason it is a flag
at all is local testing. What it buys you on mainnet is a permanent on-chain asset
pointing at a picture that says "placeholder", and the only remedy is minting a new
collection.

### 5. `upload-metadata.js` — Irys/Arweave → `uri`

```
node backend/scripts/upload-metadata.js
node backend/scripts/upload-metadata.js --fund
node backend/scripts/upload-metadata.js --strict   # fail if any drop has no generated metadata
```

Reads `backend/metadata/`; **writes `uri` per row in `master.csv`.**

**⚠ SPENDS — permanently.** Same economics as step 3. This is the last step before
anything reaches the chain, and the last point at which a wrong image is still only an
Arweave receipt rather than an on-chain asset.

### 6. `deploy-collection.js` — the Core collection

```
node backend/scripts/deploy-collection.js
node backend/scripts/deploy-collection.js --slug founders
```

Reads `config.json` and `master.csv`; **writes `collectionAddress` and `network` back
into every matching row.**

**⚠ SPENDS. ⚠ PERMANENT.** The collection exists on chain from here. Re-running against
rows that already carry a `collectionAddress` is what `preflight`'s
`not_already_deployed` is protecting; deploying twice produces two collections and no
error.

### 7. `deploy-candy-machine.js` — one per drop

```
node backend/scripts/deploy-candy-machine.js
node backend/scripts/deploy-candy-machine.js --drop OE-001
node backend/scripts/deploy-candy-machine.js --slug founders
```

Reads the deployed collection and each drop row; **writes `candyMachineAddress`,
`candyGuardAddress` and `treasury` back into `master.csv`.**

**⚠ SPENDS. ⚠ PERMANENT.**

**Why one candy machine per drop rather than one per collection:** each machine carries
its own `itemsAvailable` / `itemsRedeemed` counter, and a drop is the thing that has a
supply. One machine for the collection would mean every drop drawing from a single
counter — and it is the same structural fact B1 relies on when a campaign gets its own
dedicated machine against the same collection: several machines may reference one
Collection, each with independent supply.

**Hidden settings, for an open edition:** every item shares one name and one `uri`, so
the machine does not carry a per-item config line. That is what makes an open edition
open — there is no item list to exhaust, and an airdropped asset (B2) and a publicly
minted one are indistinguishable afterwards because both belong to the same Collection.

### 8. `generate-registry.js` → `frontend/public/registry.json`

Reads `master.csv`; writes `backend/registry.json` and copies to
`frontend/public/registry.json`. Free, re-runnable, and the only step here that is
reversible by re-running. `minted` is `null` unless `--fetch-minted`.

Then commit and push — the site shows nothing until the built copy ships.

---

## PART 2 — DISPOSITION TABLE

| # | Path | Disposition | What goes where |
|---|---|---|---|
| 1 | `backend/config.json` | Read | slug, network, rpc, treasury, price. |
| 2 | `backend/.env.admin` | Read | `DEPLOYER_PRIVATE_KEY`. Must be gitignored. |
| 3 | `backend/images/` | **Created / filled** | By `prepare-images.js`. |
| 4 | `backend/metadata/` | **Created** | By `generate-metadata.js`; absent in a fresh checkout. |
| 5 | `backend/master.csv` | **Edited by scripts** — never by hand at this stage | `itemImage` (3), `uri` (5), `collectionAddress` + `network` (6), `candyMachineAddress` + `candyGuardAddress` + `treasury` (7). |
| 6 | Arweave/Irys | **Created — permanent, paid** | Images (3), metadata (5). |
| 7 | The chain | **Created — permanent, paid** | Collection (6), candy machines (7). |
| 8 | `backend/registry.json`, `frontend/public/registry.json` | **Generated** | The only outputs here that a re-run can fix. |
| 9 | `scripts/audit-production.ps1`, `backend/scripts/get-holders.js` | **Not used** | Both are empty files. Do not build a step on either. |

---

## PART 3 — REFUSALS

1. **`preflight.js` is a gate, not a report.** Sixteen checks; a failure means stop.
2. **`--allow-warnings` downgrades the reserved-prefix and placeholder failures.** It
   is not a fix, and on mainnet it is the flag that mints test data.
3. **`--allow-placeholder` must never touch mainnet.** Placeholder art in uploaded
   metadata is unfixable.
4. **`--force` on `preflight` overrides `not_already_deployed`** — the check that stops
   a second collection being created over a live one.
5. **Every upload is paid and permanent.** Arweave has no delete.
6. **Every chain step is permanent.** There is no rename, no re-point, no undo.
7. **`deployer_not_treasury`** — deploying from the treasury wallet makes proceeds and
   float indistinguishable.
8. **A key that is not gitignored is a key in every clone**, including forks.
9. **Nothing here is safe to re-run blind.** Steps 1, 2, 4 and 8 are; 3, 5, 6 and 7
   spend money or write the chain each time.

---

## PART 4 — VERIFICATION CHECKLIST

**Before anything**

- [ ] `NETWORK` matches `config.json`, and you have said it aloud.
- [ ] `preflight.js` passes **all sixteen** checks, with no `--allow-warnings`.
- [ ] `.env.admin` present and gitignored; `git check-ignore backend/.env.admin` confirms it.
- [ ] Deployer funded; Irys balance sufficient for images **and** metadata.
- [ ] Deployer ≠ treasury.
- [ ] Every `itemImage` is real art, not a placeholder — checked by eye, not by flag.

**Through the pipeline**

- [ ] Images prepared, then uploaded; `itemImage` now an Arweave URL on every row.
- [ ] Metadata generated **after** the images uploaded; no row skipped for a placeholder.
- [ ] `uri` populated on every row.
- [ ] `collectionAddress` and `network` written; exactly one collection created.
- [ ] One candy machine per drop; `candyMachineAddress`, `candyGuardAddress`, `treasury` written.
- [ ] Exit code read at every step — `1` validation, `2` upload, `3` chain.

**After**

- [ ] `generate-registry.js` run; both registry copies updated.
- [ ] Committed and pushed; site shows the drops.
- [ ] `check-published.js` reports no drift.
- [ ] A test mint from a wallet that is not the deployer.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `IRYS BALANCE` | Two steps pay for storage, and A3 collects nothing about funding. `--fund` exists precisely because the shortfall is normal, and whether you want auto-funding is a decision. |
| `IMAGE SOURCE` | `prepare-images.js --source` names a folder that A3 never asks about. |
| `PRICE` | `config.json` ships `0.01`; nothing in A3 confirms it before a mint sets it. |
| `DEPLOYER WALLET` | Named only inside `.env.admin`; the runbook cannot check `deployer_not_treasury` without knowing which it is. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| A3 cover items | Says *"List preflight's ten checks."* The script runs **sixteen**, in five groups. A runbook that lists ten will either invent six or drop them — and the six most likely to be dropped are the Environment group, which contains `env_admin_gitignored` and `deployer_not_treasury`, the two checks that protect a key and a wallet. |
| A3 cover items | `--allow-warnings` is not mentioned anywhere in the prompt, though it is the flag that downgrades the reserved-prefix and placeholder failures — the exact failures that stand between test data and a mainnet mint. It deserves the same treatment `--allow-placeholder` gets. |
| A3 header | Collects no funding information, while two steps pay Irys and three spend SOL. `--fund` exists because a shortfall is the normal case. |
| A3 note | Correctly warns that `audit-production.ps1` and `get-holders.js` are empty. Worth adding that this makes the *post-mint audit* step undocumented: there is no scripted way to verify a mint after the fact, and A7 checks the site rather than the chain. |
