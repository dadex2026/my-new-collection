# Worked run — A1, generate a new collection from the template

**Driven by prompt A1** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and
`docs/new-collection-deployment-guide.md` disagree, the guide wins — A1 names it as
the source of truth for Steps 1–10.

**Applicable project: `TEMPLATE-OPEN-EDITION`**, as the thing being copied *from*.
Every placeholder value quoted below was read out of the template's own files, so the
"prove the placeholders are gone" checks are against real strings rather than
remembered ones.

Header values are the canonical ones from the worked-headers appendix.

---

## SAMPLE HEADER

### A1 — Generate a new collection from the template

What it creates: a standalone, deployable collection project — its own folder, its own
GitHub repo, its own Netlify project, its own on-chain identity. The longest runbook in
the file and the one with the most irreversible steps.

```
I want to generate a new collection from TEMPLATE-OPEN-EDITION.

COLLECTION NAME (human-readable, goes on-chain):  Gridiron Genesis
COLLECTION SLUG (lowercase, hyphenated):          gridiron-genesis
FOLDER NAME:                                      gridiron-genesis
GITHUB REPO:                                      smallen1967/gridiron-genesis
NETLIFY SITE NAME:                                gridiron-genesis
TREASURY WALLET:                                  7XJJvj5N4aBMNyX9g5NZqSEzi9vY6vYxWydezMZvC4n9
NETWORK (devnet | mainnet):                       devnet
WILL IT PUBLISH RANKINGS? (yes | no):             yes
SEASON ID (only if rankings):                     2026-NFL
RULESET PREFIX (only if rankings):                nfl-ledger
```

**`COLLECTION NAME` is the one with a deadline.** It is written on-chain by
`scripts/deployCoreAsset.ts` and cannot be renamed after a mint. Answer it as the name
you want permanently, not a working title.

---

## PART 1 — RUNBOOK

### 1. Copy, then delete — **in the new folder**

```powershell
Copy-Item -Recurse C:\Users\User\Desktop\TEMPLATE-OPEN-EDITION `
                   C:\Users\User\Desktop\gridiron-genesis
cd C:\Users\User\Desktop\gridiron-genesis
```

```powershell
Remove-Item -Recurse -Force node_modules,backend\node_modules,frontend\node_modules,dist -EA SilentlyContinue
Remove-Item -Force backend\.env,backend\.env.admin,frontend\.env -EA SilentlyContinue
Remove-Item -Recurse -Force backend\logs,.netlify -EA SilentlyContinue
Remove-Item -Force backend\deploy-state.json,backend\registry.json -EA SilentlyContinue
```

**The `Copy-Item` runs from anywhere; everything after it must run inside
`gridiron-genesis`.** Run the `Remove-Item` block in the template by mistake and you
strip the template's own installs, env files, logs and deploy state — the guide calls
this out as the block that matters most for exactly that reason. `cd` first, then
`pwd`, and read it before pasting anything else. The registry also says it outright:
*never run collection commands in the template.*

**Irreversible:** deleting `backend\.env.admin` in the template destroys the only copy
of a deployer key that is not in version control. Nothing warns you.

### 2. `deployment.json`

Ships as the template's own live values:

```json
{
  "assetAddress": "GSy11Cj6N8TtA5EeWYs7pUtAx3weXtxdBH6GLQJCyrK6",
  "treasury": "7XJJvj5N4aBMNyX9g5NZqSEzi9vY6vYxWydezMZvC4n9",
  "rpc": "https://rpc-proxy.smallen1967.workers.dev",
  "createdAt": "2026-06-26T20:52:48.712Z"
}
```

- **Remove `assetAddress`.** It points at the template's on-chain asset. **Nothing
  errors if you leave it** — this is the first of the three traps A1 exists to catch,
  and the new collection will quietly act against the template's asset.
- **Remove `createdAt`.** It is stamped on creation, not copied.
- **Set `treasury`** to `7XJJvj5N4aBMNyX9g5NZqSEzi9vY6vYxWydezMZvC4n9`.
- **Set `rpc`** to your Worker proxy from step 7.

### 3. The name, in every place it lives

| File | Ships as | Set to |
|---|---|---|
| `template-version.json` → `collectionName` | `"Template Open Edition"` | `Gridiron Genesis` |
| `backend/config.json` → `collectionSlug` | `"your-collection-slug"` | `gridiron-genesis` |
| `backend/config.json` → `treasury` | `"YOUR_TREASURY_ADDRESS"` | the treasury wallet |
| `backend/config.json` → `network`, `rpc` | `devnet`, `https://api.devnet.solana.com` | `devnet`, the Worker proxy |
| `backend/master.csv` | `sample-collection` rows | your collection's rows |
| `backend/standings/_input/import-config.json` | `collectionTitle: "CHANGE ME"`, `rulesetPrefix: "CHANGE ME"`, `seasonId: "2026"` | `Gridiron Genesis`, `nfl-ledger`, `2026-NFL` |

Rankings are **on** for this collection, so the `import-config.json` row is not
optional. `seasonId` becomes `2026-NFL`, overriding the shipped `2026`.

**The three proofs:**

```
git grep -n "Template Open Edition"
git grep -n "sample-collection"
git grep -n "CHANGE ME"
```

All three must come back empty. They are the only mechanical check that the
placeholders are gone; a missed one fails later, in published output.

### 4. Replace the sample content

| What | Where | Action |
|---|---|---|
| 1 drop row | `backend/master.csv` | Replace the `sample-collection` / `SAMPLE-001` row. |
| 1 campaign row | `backend/campaigns.csv` | Replace the `sample-campaign-001` row. |
| 6 card rows | `backend/textcards.csv` | Replace `NEWS-001`, `NEWS-005`, `UPDATE-002`, `ANALYSIS-003`, `ANNOUNCEMENT-004`, `ANNOUNCEMENT-010`. |
| Example board | `backend/standings/EXAMPLE-participants-accuracy.json` | Delete. |
| Backlog | `docs/open-items.md` | Delete — its own entry says *"Delete when forking."* |

### 5. Git

```
git remote -v
```

**`origin` still points at the template repo.** A plain `git push` here corrupts the
template for every future collection — trap two of three. So, in order:

```
git add -A
git commit -m "Fork template as gridiron-genesis"
# create the empty repo smallen1967/gridiron-genesis on GitHub first
git remote set-url origin https://github.com/smallen1967/gridiron-genesis.git
git remote -v          # confirm before pushing
git push -u origin main
```

Commit *before* changing the remote, so the checkpoint exists locally whatever happens
next. The new repo must be **empty** — no README, no .gitignore — or the first push is
a merge conflict.

### 6. `collectionName` before any mint

Set it in step 3 and confirm it now. `scripts/deployCoreAsset.ts` writes it on-chain,
and **it cannot be renamed after a mint** — trap three, and the single most permanent
step in this runbook. The ordering is not negotiable: name first, mint second. There is
no rename path, no migration, and no support ticket. A wrong name means a new
collection.

### 7. Point every `rpc` field at the Worker

Four places:

- `deployment.json` → `rpc`
- `backend/config.json` → `rpc`
- `frontend/.env` → `VITE_SOLANA_RPC_URL`
- `backend/.env` → `SOLANA_RPC_URL` **and** `VITE_SOLANA_RPC_URL`

**Never a keyed provider URL in a `VITE_*` value.** Vite bakes `VITE_*` into the
shipped bundle, so a key there is published to every visitor. Prove it:

```
git grep -n "api-key="
```

### 8. Netlify

From `netlify.toml`, already correct in the template:

```toml
[build]
  base = "frontend"
  command = "npm run build"
  publish = "../dist"

[build.environment]
  NODE_VERSION = "22"
```

Site name `gridiron-genesis`. Set project visibility deliberately — see
`docs/netlify-connection.md`.

### 9. Environment variables

- `VITE_SOLANA_RPC_URL` — the **Worker proxy URL** from step 7, never a keyed URL.
- **`VITE_REGISTRY_URL` → `/registry.json`. This is the one with no fallback in
  code.** Unlike `VITE_CAMPAIGNS_URL` and `VITE_CONTENT_REGISTRY_URL`, leaving it
  unset makes the frontend fetch a URL literally named `/undefined`, which 404s and
  silently breaks the site.
- `VITE_SOLANA_RPC_URL_DEVNET`, `VITE_CAMPAIGNS_URL`, `VITE_CONTENT_REGISTRY_URL` if
  set locally.

### 10. Live verification — and which 404s are normal

| Endpoint | 404 means |
|---|---|
| `registry.json` | **A real failure** — almost always the missing `VITE_REGISTRY_URL` from step 9. A request for `/undefined` is the same fault. |
| `campaigns.json` | Normal before the first campaign. |
| `content-registry.json` | Normal before the first card. |
| `standings.json` | Normal before the first published round. |
| `methodology.json` | Normal before the first published round. |

Four of the five 404 harmlessly on a brand-new collection and are handled as an empty
state in the frontend code. Only `registry.json` is a fault.

---

## PART 2 — DISPOSITION TABLE

| # | File | Path | Disposition | What goes where |
|---|---|---|---|---|
| 1 | The project | `Desktop\gridiron-genesis\` | **Created** by `Copy-Item` | A full copy of the template. |
| 2 | Installs, envs, logs, state | `node_modules`, `backend\.env*`, `frontend\.env`, `backend\logs`, `.netlify`, `deploy-state.json`, `registry.json` | **Deleted** — in the new folder only | Nothing carried from the template. |
| 3 | `deployment.json` | project root | **Edited** | `assetAddress` and `createdAt` removed; `treasury` and `rpc` set. |
| 4 | `template-version.json` | project root | **Edited** | `collectionName` → `Gridiron Genesis`. |
| 5 | `backend/config.json` | | **Edited** | `collectionSlug`, `treasury`, `network`, `rpc`. |
| 6 | `backend/master.csv` | | **Edited** | Sample drop row replaced. |
| 7 | `backend/campaigns.csv` | | **Edited** | `sample-campaign-001` replaced. |
| 8 | `backend/textcards.csv` | | **Edited** | Six sample rows replaced. |
| 9 | `backend/standings/_input/import-config.json` | | **Edited** (rankings on) | `collectionTitle`, `seasonId: 2026-NFL`, `rulesetPrefix: nfl-ledger`. |
| 10 | Example board | `backend/standings/EXAMPLE-participants-accuracy.json` | **Deleted** | |
| 11 | Backlog | `docs/open-items.md` | **Deleted** | Its own entry instructs this. |
| 12 | `frontend/.env`, `backend/.env` | | **Created** | RPC values; no keyed URL in any `VITE_*`. |
| 13 | Git remote | `.git/config` | **Edited** | `origin` re-pointed at the new repo *after* the checkpoint commit. |
| 14 | GitHub repo | `smallen1967/gridiron-genesis` | **Created** — empty | |
| 15 | Netlify project | `gridiron-genesis` | **Created** | base `frontend`, build `npm run build`, publish `../dist`, Node 22. |
| 16 | Netlify env vars | Netlify UI | **Created** | `VITE_REGISTRY_URL=/registry.json` is the one with no fallback. |
| 17 | `netlify.toml` | project root | **Read only** | Already correct as shipped. |

---

## PART 3 — REFUSALS

1. **Do not run the `Remove-Item` block anywhere but the new folder.** In the template
   it deletes the only local copy of `.env.admin`.
2. **Do not `git push` before `remote set-url`.** `origin` is the template's repo.
3. **Do not mint before `collectionName` is final.** On-chain, permanent.
4. **Do not leave `assetAddress` in `deployment.json`.** It points at the template's
   asset and nothing errors.
5. **Do not put a keyed RPC URL in any `VITE_*` variable.** Vite bakes it into the
   public bundle.
6. **Do not treat a `registry.json` 404 as a normal empty state.** It is the missing
   `VITE_REGISTRY_URL`.
7. **Do not create the GitHub repo with a README or .gitignore.** It must be empty.
8. **Do not skip the three `git grep` proofs** because the substitutions "look done."

---

## PART 4 — VERIFICATION CHECKLIST

**Before touching anything**

- [ ] `pwd` shows `gridiron-genesis`, not `TEMPLATE-OPEN-EDITION`.
- [ ] Treasury wallet copied from a trusted source, character for character.
- [ ] `COLLECTION NAME` is the permanent name, not a working title.

**After the substitutions**

- [ ] `git grep -n "Template Open Edition"` → empty.
- [ ] `git grep -n "sample-collection"` → empty.
- [ ] `git grep -n "CHANGE ME"` → empty.
- [ ] `git grep -n "api-key="` → empty.
- [ ] `deployment.json` has no `assetAddress` and no `createdAt`.
- [ ] `backend/config.json` carries no `your-collection-slug` and no `YOUR_TREASURY_ADDRESS`.
- [ ] `import-config.json` shows `seasonId: "2026-NFL"` and `rulesetPrefix: "nfl-ledger"`.
- [ ] `EXAMPLE-participants-accuracy.json` and `docs/open-items.md` are gone.

**Git**

- [ ] Checkpoint commit exists **before** the remote changed.
- [ ] `git remote -v` shows `gridiron-genesis`, not the template.
- [ ] The GitHub repo was empty at first push.

**Live**

- [ ] `registry.json` resolves — not 404, and no request for `/undefined`.
- [ ] 404s on `campaigns.json`, `content-registry.json`, `standings.json`, `methodology.json` are expected on day one.
- [ ] The shipped bundle contains no API key (`api-key=` grep, and spot-check the built JS).

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `RPC PROXY URL` | Step 7 points four fields at "the Worker proxy," but A1's header never collects the URL. The template ships `https://rpc-proxy.smallen1967.workers.dev`, which is the *template's* — reusing it silently is exactly the `assetAddress` mistake in a different field. Proposed A1 field. |
| `PRICE` | `backend/config.json` ships `0.01` and A1 never mentions it, so the sample price survives into a real collection unless someone notices. |
| `NETLIFY VISIBILITY` | Step 8 says "project visibility" without collecting the choice. |
| `SELLER FEE BASIS POINTS` | Not collected; the template's `master.csv` sample ships `500`. |
| `GITHUB ACCOUNT` | Implied by `GITHUB REPO`, but the "must already exist" table lists a GitHub account and a Netlify account as prerequisites. |

---

## APPENDIX — FINDINGS

Not applied.

| Where | Finding |
|---|---|
| A1 header | Collects no **RPC proxy URL**, though step 7 sets four fields to it. The template's own Worker URL is sitting in `deployment.json` as a plausible default, which is the same failure mode as the `assetAddress` trap A1 already warns about. |
| A1 cover item 2 | Says "which keys to remove, which to set" — worth naming `createdAt` explicitly alongside `assetAddress`; it is a stamped value, not a copied one, and it is easy to leave. |
| A1 cover item 3 | The three `git grep` proofs are excellent. A fourth — `git grep -n "api-key="` from Step 7 of the guide — belongs with them, since a leaked key in a `VITE_*` value is the most expensive miss in the runbook. |
| A1 cover item 9 | `VITE_REGISTRY_URL` is called out correctly. Worth adding the symptom, which the guide gives and A1 does not: a request for a URL **literally named `/undefined`**. That is what someone will actually see in the network tab. |
| A1, `backend/config.json` | `price: 0.01` ships as a live default and no step mentions it. Either A1 collects a price or item 3 adds `config.json`'s `price` to the substitution table. |
