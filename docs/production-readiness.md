# Launch record — not a guide

> **Looking for how to launch a collection?** That is
> **`docs/new-collection-deployment-guide.md`**, and it is the only guide. It covers
> everything from the four permanent decisions through the mint, the site, and the
> ongoing content loops. Nothing in this file is needed to complete a launch.

This file holds two things the guide deliberately doesn't carry: **what has already been
proven on chain**, and **template-level fixes still outstanding**. Read the first once.
The second is work, not procedure.

An earlier version of this file was a second, competing set of launch instructions. That
split — a *how* guide and a *whether* guide, plus a mint pipeline that lived in neither —
is what made the process confusing enough to need consolidating. It has been folded into
the guide.

---

## What the deployment logs prove

**Correction, 2026-08-28.** An earlier draft said preflight had never been executed. **It
has**, and the whole deploy path with it.

`my-new-collection/backend/logs/preflight.log` holds **123 entries from 2026-07-16 to
2026-08-14**: four failures, correctly refusing to deploy on `treasury_valid` and
`collection_has_rows`; then four passes; then a final refusal on `not_already_deployed` —
the check doing its job after the fact. Alongside it, `deploy-collection.log`,
`deploy-candy-machine.log`, `deploy-campaign.log`, `airdrop.log`, `prepare-images.log`,
`upload-images.log`, `upload-metadata.log` and `generate-metadata.log`, all **on
mainnet**, with signatures and Solscan links, and `master.csv` carrying real
`collectionAddress` and `candyMachineAddress` values.

**The template-copy → configure → preflight → deploy → mint path is exercised, on chain,
not theoretical.** `TEMPLATE-OPEN-EDITION/backend/logs/preflight.log` also shows a run on
2026-08-10 that failed on its own placeholders, which is the template behaving correctly.

## What they do not prove

1. **Preflight has never passed clean.** Every success reads *"passed with 5 warning(s)
   downgraded via `--allow-warnings`"*. Correct for a test deployment; not what a real
   collection should look like. The deployed slug was `test-mech-b`, drop `TEST-002`.
2. **The exercised path is not today's path.** That run predates the 16-column
   `textcards.csv`, the `collectionName` guard, `check-published.js`, `publish-round.js`
   and the A4 merge.

## Why the first launch runs on mainnet — decided 2026-08-28

A test network is the conventional place for a rehearsal, but faucet SOL has repeatedly
been unavailable here, and a rehearsal that cannot be funded is not a gate, it is a queue.
Two facts settle it:

- **Everything before the mint is free.** `preflight.js` reads files and validates
  strings. It signs nothing, sends nothing, costs nothing. The guide's Stages 0–6 are all
  free, and `--dry-run` on both paid upload steps extends that by one more look.
- **The August run is the cost estimate.** That deployment is on chain with signatures in
  `backend/logs/`. Read the wallet's history for those signatures and you have the real
  figure rather than an estimate.

**What that means:** the first pass through the guide is not a rehearsal. A clean
preflight on real ids followed by a deploy **is** the first collection, permanently, under
a name that cannot be changed. One drop, to bound the cost.

## What it cost, from the logs

`upload-images.log` and `upload-metadata.log` record an Irys `price` of **3,208 lamports
per upload**, ten uploads across both steps — roughly **0.000032 SOL** for all image and
metadata storage. Arweave storage is not the expense.

The expense is Solana account rent: one collection plus one candy machine per drop. Those
signatures are in `deploy-collection.log` and `deploy-candy-machine.log`; read the wallet
against them for the exact figure.

## The duplicate-deploy hazard is not hypothetical — it already happened here

`deploy-collection.log` records **four successful mainnet collection deploys across three
slugs.** `test-mech` was deployed twice:

```
2026-08-11T15:18:11Z   GmKCivVHpjf8kQ3W3DZB4enZ4bs8cAHwX2ySAcbGVRM2
2026-08-14T14:07:16Z   DWGTLJUEyGUH33dLut6JLLbPqpHnPm8tLW2ejnj6EEcw
```

`master.csv` records only the second. **The first is paid for, live on mainnet, and
referenced by nothing** — orphaned three days later by a re-deploy that raised no error,
because there is no error to raise: deploying twice simply produces two collections.

This is what `not_already_deployed` exists to prevent and what `--force` silences. It is
also the single best argument in this file for the rule the guide states — treat
`--force` on preflight as an incident, not a flag.

---

# Template-level fixes still outstanding

These are changes to `TEMPLATE-OPEN-EDITION` itself. Each is worse after ten collections
have inherited it. None blocks a launch; the guide documents the mitigation for each.

## 1. ~~`deployer_not_treasury` can be downgraded, and passes when it cannot check~~ — **fixed 2026-08-28**

**The defect.** `CONTENT_CHECK_NAMES` — the set `--allow-warnings` downgrades — held
**six** members, and the sixth was `deployer_not_treasury`, an **Environment** check. An
earlier revision of this file said *"An Environment failure is never a warning."* That was
false, and false about the one check standing between the deploy key and the sale
proceeds. Separately, three paths returned `{ pass: true, detail: "Skipped — …" }` — no
`DEPLOYER_PRIVATE_KEY`, a key that is not 64 bytes, a key that will not decode — so a
clean exit was not proof the wallets were separate.

**The fix.** `deployer_not_treasury` is out of `CONTENT_CHECK_NAMES`, with a comment
saying why and not to put it back. The three skip paths now return `unknown: true` and
read `COULD NOT VERIFY — …`. Unknowns are logged as `check_unknown`, shown as
`? UNVERIFIED` on the category line, listed under *"Could not verify (these did not run —
do not read them as passes)"*, and carried in the success log line as `unknowns`.

**They do not block** — an underivable key format is not itself a reason to refuse a
deploy — **but they suppress the `READY — all checks passed` line.** That matters because
that exact string is the pass condition the guide tells operators to look for, so the
existing instruction now catches the case with no change to the instruction.

**Verified by running it, not by reading it.** Same inputs — a deployer wallet that *is*
the treasury, with `--allow-warnings`:

| | Verdict | Exit |
|---|---|---|
| Pre-fix | `READY WITH WARNINGS — proceeding is your explicit decision` | **0** |
| Post-fix | `NOT READY — 1 failure(s) must be resolved` | **1** |

And with an undecodable key and everything else clean: pre-fix `READY — all checks
passed`; post-fix `READY — but 1 check(s) could not be verified`, exit 0.

## 2. Unguarded placeholder in the on-chain path

`scripts/deployCoreAsset.ts:71` creates the Core Asset with a hardcoded
`uri: "https://example.com/metadata.json"`. `collectionName` beside it is guarded and
documented as permanent; the metadata URI is neither.

> **Resolved 2026-08-28 — and this heading was wrong.** `deployCoreAsset.ts` is invoked by
> nothing, so its hardcoded `uri` was never on the on-chain path. The permanent collection
> `uri` comes from `master.csv`'s `collectionImage`, first matching row
> (`deploy-collection.js:350`), and is now gated by `no_placeholder_collection_image`. The
> script was **deleted**, which closes this item by removal rather than by fix. Recorded
> rather than edited away: the finding was real about the file and wrong about its
> reach, and that distinction is the point.

## 3. Two apparent sources of truth for price

`config.json`'s `price` is **required to be present** (`deploy-collection.js:171`) but
**never read as the price** — the charged price is `row.price` in `master.csv`
(`deploy-candy-machine.js:279`). Either make config authoritative, or drop the field from
the required list. **Mitigation until then:** the guide's Stage 0 says to set both to the
same number.

## 4. Empty files that read as features

- `backend/scripts/get-holders.js` — 0 bytes. Produces the holder snapshot that reward
  campaigns consume. Fill it or delete it.
- `scripts/audit-production.ps1` — 0 bytes, dated June, named like a production check. An
  empty file with that name is worse than no file. **Deleted 2026-08-28.**

Together these mean **there is currently no scripted post-mint chain audit.**

## 5. The cheap ones

- `frontend/src/styles.css` — dead, not imported anywhere. **Deleted 2026-08-28.**
- `scripts/utils/` — empty directory. **Still open:** git never tracked it, so `git rm`
  cannot remove it; it needs a manual `rmdir` on the machine holding the clone.
- `project-files.txt` — stale; listed files that do not exist. **Deleted 2026-08-28.**
- `backend/_to_delete/` in `my-new-collection` — two staging CSVs awaiting a manual `rm`.

## 6. The public surface you already have

`my-new-collection` is the mainnet reference, its site is public, and it serves `TEST-`
cards under real on-chain names. Nothing blocks a new launch technically — but once real
collections exist, a stranger who finds that site reads it as one of them.

**Resolved when:** either the Netlify project's visibility is restricted, or leaving it
public is a deliberate decision. If you hide cards, note that deleting CSV rows is inert —
set `status` to `INACTIVE` and re-run the generator.

---

# Explicitly not blockers

**The prompt-eval runs**, tracked in `docs/runs/eval-run-handoff.md`. They test whether
the instruction library produces good runbooks for a stranger. That is quality work on the
documents; it runs in parallel and no mint waits on it.

**`open-items.md`'s "Open — real work" entries** — surfacing `standings.json`, the nav
`IntersectionObserver`, carrying `eligibility` through the ranked importer,
`capture.complete` on the ranked path. Real, none load-bearing for a mint.

**The rig's own gaps** — items 23–26. They make `TEMPLATE-TEST-LEDGER` a better rehearsal
surface; they do not gate a launch.
