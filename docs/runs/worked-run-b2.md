# Worked run — B2, airdrop to a wallet list

**Driven by prompt B2** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and `backend/scripts/airdrop.js` disagree,
the script wins.

**Applicable project: `my-new-collection`.** It is the only target that has actually
run an airdrop — `backend/airdrop-history.csv` holds two successful mints — so the
idempotency behaviour below is demonstrated rather than described.

> Mainnet, real SOL, paid by the deployer. Rehearse on devnet.

---

## SAMPLE HEADER

### B2 — Airdrop to a wallet list

```
I want to airdrop assets to a list of wallets.

COLLECTION:   my-new-collection
DROP ITEM ID: TEST-001
RECIPIENTS:   backend/recipients.csv
NETWORK:      mainnet
```

---

## PART 1 — RUNBOOK

### 1. `recipients.csv`

```
wallet,quantity
<address>,1
<address>,3
```

**`quantity` is optional — omit the column entirely for "1 each".** The live file in
this collection does exactly that:

```
wallet
FDLfcGUGT9ZTNo6eQminuprHkJLTSWhCo95RmDDmXSDR
```

Neither `recipients.csv` nor `airdrop-history.csv` exists in a fresh template checkout.
**You create the first; the script creates the second.**

### 2. Two consequences of not going through the candy machine

`airdrop.js` uses mpl-core's `create()` to mint a standalone asset straight into the
collection. It does not touch the candy machine or its `solPayment` guard at all.

**1 · Airdropped assets do not count against `itemsAvailable` / `itemsRedeemed`.** An
airdropped asset and a publicly-minted one both belong to the same on-chain
Collection and are otherwise indistinguishable, but only public mints run through the
candy machine's supply tracking. So a 5-supply drop can end up with more than 5 assets
in circulation, and the candy machine will still report what it sold. If your public
copy quotes a supply number, airdrops are outside it.

**2 · The deployer pays everything** — every transaction fee and every asset's rent.
There is no payment step, by design.

**Cost basis.** The script's own guidance is *"a few thousand lamports per recipient,
not the drop's listed price"* — the fee. The larger component is **asset rent**, which
is a real per-asset cost paid by the deployer, and its size depends on account size and
current rent parameters rather than anything in this project. **Get the real number
before budgeting a large list**: run `--dry-run`, then a two-wallet batch, and read the
deployer's balance before and after. A rehearsed number beats an estimate, and this is
the step where a 500-wallet list turns an assumption into a bill.

### 3. Every asset shares the drop's name and uri

Matching the open-edition convention already used by `hiddenSettings` in
`deploy-candy-machine.js` — everyone gets the same metadata. There is no per-recipient
customisation, and asking for one is a different feature.

### 4. Idempotency and resumability — demonstrated

Every attempt, success **or** failure, is logged to `backend/airdrop-history.csv`:

```
date,dropItemId,wallet,assetAddress,signature,status
2026-08-11T15:33:45.719Z,TEST-001,4hGRvfHbhAjkn46ATggGHgefsHGKeCi4jxcL6BcDpDU7,GbP7zuC…,3FcYWHL…,success
2026-08-11T16:14:55.504Z,TEST-001,FDLfcGUGT9ZTNo6eQminuprHkJLTSWhCo95RmDDmXSDR,62FPZVz…,3AsyHfi…,success
```

**A re-run only processes recipients without a successful entry for this exact drop**,
and partial quantities resume correctly — 3 requested with 1 already sent sends 2.

Concretely, in this collection today: `recipients.csv` lists
`FDLfcGUGT9ZTNo6eQminuprHkJLTSWhCo95RmDDmXSDR`, and the history already has a
`success` for that wallet on `TEST-001`. **Re-running `--drop TEST-001` right now
sends nothing and exits 0** — *"nothing left to airdrop"*. That is the safety property
working, not a failure: a script that must be safe to re-run after a partial failure
has to be a no-op when there is nothing outstanding.

Note the scope of the key: **wallet + dropItemId**. The same wallet is outstanding
again for a *different* drop, which is correct and worth knowing before reusing a list.

### 5. Rehearse before the real list

```
node backend/scripts/airdrop.js --drop TEST-001 --recipients recipients.csv --dry-run
node backend/scripts/airdrop.js --drop TEST-001 --recipients recipients.csv
node backend/scripts/airdrop.js --drop TEST-001 --recipients recipients.csv --slug founders
```

`--dry-run` first, then a two- or three-wallet file, then the real list. Exit codes:

- `0` success, **including "nothing left to airdrop"**
- `1` validation failure — bad CSV, invalid addresses, missing drop data
- `3` blockchain failure — one or more mints failed; **the log names which recipients
  still need a retry**, and re-running picks up exactly those

Exit `3` is the case the history file exists for. Do not rebuild the recipient list by
hand after a partial failure; re-run the same file.

---

## PART 2 — DISPOSITION TABLE

| # | File | Path | Disposition | What goes where |
|---|---|---|---|---|
| 1 | Recipient list | `backend/recipients.csv` | **Created by hand** | `wallet[,quantity]`. Omit the column for one each. |
| 2 | Drop row | `backend/master.csv` → `TEST-001` | Read only | Supplies the name and uri every airdropped asset carries. |
| 3 | Airdrop script | `backend/scripts/airdrop.js` | Run | `--drop`, `--recipients`, `--dry-run`, `--slug`. |
| 4 | History | `backend/airdrop-history.csv` | **Created / appended by the script** | Every attempt, success or failure. The resume key is wallet + dropItemId. |
| 5 | Deployer key | `backend/.env.admin` | Read only | Pays every fee and every asset's rent. |
| 6 | On-chain assets | the Collection | **Created** | Do **not** appear in `itemsRedeemed`. |
| 7 | `registry.json` | `backend/`, `frontend/public/` | **Unchanged** | Airdrops do not alter the drop's registry entry — the minted count the site shows comes from the candy machine. |

---

## PART 3 — REFUSALS

1. **Airdropped assets are never counted by the candy machine.** Do not reconcile a
   supply number against `itemsRedeemed` after an airdrop.
2. **There is no payment step.** The deployer pays; a recipient cannot contribute.
3. **No per-recipient metadata.** Every asset carries the drop's name and uri.
4. **A re-run will not re-send** to a wallet with a success for that drop — and that is
   not something to work around by editing the history file.
5. **Exit 1 sends nothing** — validation is up front.
6. **Exit 3 means partial.** Read the log, re-run the same file; do not hand-build a
   remainder list.
7. **Do not budget from the drop's listed price.** It is fees plus rent, paid by you.

---

## PART 4 — VERIFICATION CHECKLIST

**Before**

- [ ] `recipients.csv` has a `wallet` column; `quantity` present for all rows or omitted entirely.
- [ ] Every address checked — an invalid one is a validation failure, so the whole run stops.
- [ ] `--drop` names a real `dropItemId` in `master.csv` with metadata already uploaded.
- [ ] Deployer funded for **fees + rent × recipients**, from a rehearsed number rather than an estimate.
- [ ] `--dry-run` output read.
- [ ] Small batch sent and confirmed on chain before the full list.

**After**

- [ ] Exit code noted — `0`, `1`, or `3`.
- [ ] `airdrop-history.csv` has one row per attempt; every `success` carries an `assetAddress` and a `signature`.
- [ ] Any `failure` rows re-run with the **same** file.
- [ ] A spot-checked recipient wallet actually holds the asset.
- [ ] Nobody is expecting `itemsRedeemed` to have moved.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `SLUG` | `airdrop.js` takes `--slug`, and B2 neither collects it nor mentions it — in a `master.csv` with three `collectionSlug`s, as here, that is the flag that says which one. |
| `EXPECTED RECIPIENT COUNT` | The only way to confirm a run did what you intended; the history file makes it checkable, and nothing says to check. |
| `DEPLOYER BALANCE` | The cost basis B2 asks for is per-recipient, but the decision is total-versus-balance. |
| `RETRY POLICY` | On exit `3`, whether to re-run immediately or investigate first. The script is safe either way; the intent is not stated. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| B2 cover items | Asks for "a rough cost basis per recipient". The script gives the **fee** figure — a few thousand lamports — but the larger component is **asset rent**, which is not a number this project can supply. B2 should ask the runbook to say so and to get the real figure from a rehearsal, rather than inviting an invented per-recipient cost. |
| B2 cover items | The idempotency key is **wallet + dropItemId**, so the same list is outstanding again for a different drop. Worth stating: it is exactly what makes "re-run the same file" safe, and exactly what surprises someone reusing a list. |
| B2 header | No `SLUG`, though `airdrop.js` accepts `--slug` and this collection holds three `collectionSlug`s in one `master.csv`. |
| B2 cover items | Nothing says airdrops leave `registry.json` and the site's minted count untouched. That is the visible consequence of consequence #1, and the first question someone asks after an airdrop appears to have done nothing. |
