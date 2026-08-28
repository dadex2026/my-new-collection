# Production readiness — gates before the first mainnet collection

**What this is.** The ordered list of things that must be true before a collection
minted from this template goes to mainnet, and what "passed" looks like for each. It is
not a substitute for `docs/new-collection-deployment-guide.md` — that guide is the
authority for *how*; this file is the authority for *whether you are ready to start*.

**What it is not.** It does not gate on the prompt-eval runs in
`docs/eval-run-handoff.md`. Those test whether the instruction library produces good
runbooks for a stranger; they are quality work on the documents, they can run in
parallel, and no mint waits on them.

**State it assumes** (verified 2026-08-28): the template is canonical for
`generation-prompts.md`, the worked runs, the protocol and this file; `config.json` ships
`network: devnet`, **which a real launch must change to `mainnet` before A2** — the
`not_already_deployed` check is network-aware, so a fork left on devnet will happily
re-deploy something already live; `master.csv` holds one row, `SAMPLE-001`, with
`collectionExternalUrl: https://example.com`; `backend/standings/_input/` holds
placeholders and no board is declared.

---

## Gate 1 — A clean preflight on a real fork ◆ the remaining gate

**Correction, 2026-08-28.** An earlier draft of this file said preflight had never been
executed. **It has**, and the whole deploy path with it — the logs are on disk and this
gate is narrower than it looked.

**What the logs prove.** `my-new-collection/backend/logs/preflight.log` holds **123
entries from 2026-07-16 to 2026-08-14**: four failures, correctly refusing to deploy on
`treasury_valid` and `collection_has_rows`, then four passes, then a final refusal on
`not_already_deployed` — the check doing its job after the fact. Alongside it,
`deploy-collection.log`, `deploy-candy-machine.log`, `deploy-campaign.log`,
`airdrop.log`, `prepare-images.log`, `upload-images.log`, `upload-metadata.log` and
`generate-metadata.log`, all **on mainnet**, with signatures and Solscan links, and
`master.csv` carrying real `collectionAddress` and `candyMachineAddress` values. The
template-copy → configure → preflight → deploy → mint path is **exercised, on chain, not
theoretical.** `TEMPLATE-OPEN-EDITION/backend/logs/preflight.log` also shows a run on
2026-08-10 that failed on its own placeholders, which is the template behaving correctly.

**What the logs do not prove, and this is the gate:**

1. **Preflight has never passed clean.** Every success reads *"passed with 5 warning(s)
   downgraded via `--allow-warnings`"* — `no_reserved_campaign_ids`, `no_reserved_slug`,
   `no_reserved_drop_ids`, `no_placeholder_images`, `no_placeholder_uris`. Correct for a
   test deployment; not what a real collection should look like. The deployed slug was
   `test-mech-b` with drop `TEST-002`.
2. **The exercised path is not today's path.** That run predates the 16-column
   `textcards.csv`, the `collectionName` guard, `check-published.js` and the A4 merge. A
   fork taken today follows a route no deployment has taken end to end.

**So the rehearsal is narrower than a full dry run:** fork today's template, configure it
with a **real slug, real drop ids and real images**, and get `preflight.js` to exit clean
**without `--allow-warnings`**. Follow `new-collection-deployment-guide.md` Steps 1–10;
**A1** → **A3** → **A2** is the same path in prompt form.

**Run it on mainnet, deliberately — decided 2026-08-28.** A test network is the
conventional place for a rehearsal, but faucet SOL has repeatedly been unavailable here
across several attempts, and a rehearsal that cannot be funded is not a gate, it is a
queue. Two facts make mainnet the reasonable choice:

- **The gate itself is free.** `preflight.js` reads files and validates strings. It
  signs nothing, sends nothing and costs nothing. Run it as many times as it takes to
  reach a clean exit **before** any deploy command is typed. Nothing is spent until A2.
- **The August run is the cost estimate.** That deployment — collection, candy machine,
  campaign, airdrop, image and metadata uploads — is on chain with signatures in
  `backend/logs/`. Read the wallet's history for those signatures and you have the real
  figure for this template's pipeline, rather than an estimate.

**What changes when the rehearsal is on mainnet:** it stops being a rehearsal. A clean
preflight on real ids followed by A2 *is* the first collection, permanently, under a name
that cannot be changed. So treat it as launch one rather than a practice run: one drop to
bound the cost, `collectionName` settled before the mint, and `not_already_deployed`
respected rather than `--force`d. The rest of this file's gates apply to it because it is
real, not because it is a test.

**The sixteen checks, so you can tell a real failure from a nuisance:**

| Group | Checks |
|---|---|
| Project Structure | `config_exists`, `config_valid_json`, `collection_slug_present`, `collection_has_rows` |
| Environment | `env_admin_exists`, `env_admin_gitignored`, `deployer_key_present`, `treasury_valid`, `rpc_valid`, `deployer_not_treasury` |
| Content Validation | `no_reserved_slug`, `no_reserved_drop_ids`, `no_placeholder_images`, `no_placeholder_uris` |
| Campaign Validation | `no_reserved_campaign_ids` |
| Deployment State | `not_already_deployed` |

`--allow-warnings` downgrades **only** the reserved-prefix and placeholder checks, and
only when you pass it deliberately. An Environment failure is never a warning.

**Passed when:**

- [ ] A fresh fork exists, named, with `collectionName` set **before** any mint — it is
      written on chain by `deployCoreAsset.ts` and cannot be renamed afterwards. Absent,
      it falls back to `templateName`, which is how a collection ends up minted as
      "TEMPLATE-OPEN-EDITION", permanently.
- [ ] `config.json` says `network: mainnet`, set deliberately and read back before A2.
- [ ] `node backend/scripts/preflight.js` exits clean **without `--allow-warnings`** —
      the one thing the August run never demonstrated.
- [ ] A mint completes and the asset is visible on an explorer.
- [ ] The site deploys, and `node backend/scripts/check-published.js --site <url>` exits
      **0**. Exit 1 is drift; exit 2 means nothing was compared — treat it as unknown,
      never as a pass.
- [ ] Anything the rehearsal broke is fixed **in the template**, not only in the fork.

---

## Gate 2 — Rewards, if the collection will have any

**`backend/scripts/get-holders.js` is 0 bytes.** Every sibling script is 7–33 KB. It
produces the holder snapshot that feeds reward campaigns.

This is a gate **only if** holder-gated rewards are in scope for the first collections.
Rewards here are opt-in discounted mints and similar — ordinary holder campaigns (B1) —
so the question is narrow: does the first launch promise anything to holders?

**Passed when:** either the file is written and produces a snapshot that B1 can consume,
or it is deliberately out of scope for launch one and nothing on the site promises
otherwise.

---

## Gate 3 — Standings, if the collection will publish them

`rulesetPrefix` is `CHANGE ME`, `_input/` holds placeholders, and no board is declared.
Nothing is broken — the feature is simply undeclared.

**Passed when:** either **D1** declares the first board (and the ruleset id it implies is
declared in `rulesets.json`), or the launch ships without rankings and the Rankings tab's
absence is intentional.

**Related decision, already taken and not yet built:** the Sports Ledger is to gain a
stable id column. Until it does, boards match on display labels, and a renamed label
silently resets a standing. That is a Ledger change — new column, new build stamp, new
ruleset id — and it only matters once a board is publishing rounds.

---

## Gate 4 — The public surface you already have

`my-new-collection` is the mainnet reference, its site is public, and it serves `TEST-`
cards under real on-chain names. Nothing blocks a new launch technically. But once real
collections exist, a stranger who finds that site reads it as one of them.

**Passed when:** either the Netlify project's visibility is restricted, or the decision to
leave it public is deliberate. If you hide cards, note that deleting CSV rows is inert —
set `status` to `INACTIVE` and re-run the generator.

---

## Gate 5 — The cheap ones, before you fork from it again

Each of these is minutes, and each is worse after ten collections have inherited it.

- [ ] `scripts/audit-production.ps1` — 0 bytes, dated June, named like a production check.
      Fill it or delete it; an empty file with that name is worse than no file.
- [ ] `frontend/src/styles.css` — dead. Deleting it stops someone editing it and
      wondering why nothing changes.
- [ ] `scripts/utils/` — empty directory.
- [ ] `project-files.txt` — regenerate or delete.
- [ ] `backend/_to_delete/` in `my-new-collection` — two staging CSVs awaiting a manual
      `rm`.

---

## Not gates — deliberately

**The prompt-eval runs.** Four unrun plus E3's re-runs, tracked in
`docs/eval-run-handoff.md`. They improve the instructions, not the code.

**`open-items.md`'s "Open — real work" entries** — surfacing `standings.json`,
the nav `IntersectionObserver`, carrying `eligibility` through the ranked importer,
`capture.complete` on the ranked path. Real, none load-bearing for a first mint.

**The rig's own gaps** — items 23, 24, 25, 26. They make `TEMPLATE-TEST-LEDGER` a better
rehearsal surface; they do not gate a launch.

---

## The order, in one line

Clean preflight on today's template, real ids, no `--allow-warnings` (Gate 1) → fix what
it finds, in the template → decide rewards (Gate 2) and standings (Gate 3) for launch one
→ tidy Gate 5 before the next fork → deploy, which on mainnet **is** launch one. Gate 4
whenever, but before the first collection is promoted anywhere public.

**After each launch:** run `check-published.js` before assuming the site shows what the
repo holds. That check exists because 1 published card ran against 9 CSV rows for weeks,
and every endpoint returned 200 the whole time.
