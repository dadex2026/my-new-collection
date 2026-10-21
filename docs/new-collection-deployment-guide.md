# Launching a Collection from TEMPLATE-OPEN-EDITION

**The one guide.** Copy the template, configure it, mint it on chain, put it on the
web, and run it. Start to finish, in the order the steps must happen. Nothing here
sends you to another document to complete a step.

Everything through **Stage 6** is free and reversible. **Stage 7 spends money and writes
the chain permanently.** The boundary is marked, and it is the only one that matters.

---

## Contents

| Stage | What it does | Reversible? |
|---|---|---|
| **0** | Decide the four permanent things | — |
| **1** | Copy the template, strip what shouldn't travel | yes |
| **2** | Split into its own repo | yes |
| **3** | Set identity — the seven places the name lives | yes |
| **4** | Replace the sample content | yes |
| **5** | Point the RPC at the proxy | yes |
| **6** | Preflight — the gate | free, read-only |
| **7** | **The mint — spends, permanent** | **no** |
| **8** | Netlify site and environment variables | yes |
| **9** | Verify — chain, site, and drift | yes |
| **10** | Ongoing: text cards, rankings, methodology | yes |

Appendix A — the twenty-two preflight checks · Appendix B — known non-issues ·
Appendix C — reference documents (none of which you need to finish a launch)

---

# Stage 0 — Decide the four permanent things

None of these is a preflight check. That is exactly why they get missed. Settle all four
in writing before you copy anything.

### 1. `collectionName` — and it does not live where older docs said

**The on-chain name comes from `master.csv`'s `collectionName` column, first matching
row** — `deploy-collection.js:349`, `name: firstRow.collectionName || collectionSlug`. Not
renameable, ever. If rows disagree, the first row's value is the one minted and the others
are silently ignored.

> **Correction, 2026-08-28.** Every earlier version of this guide said the on-chain name
> came from `template-version.json` via `scripts/deployCoreAsset.ts`, falling back to
> `templateName`. That is wrong. `template-version.json`'s `collectionName` is now read
> by exactly one thing — `frontend/vite.config.ts`, which sets the site title and `<h1>`.
> The other reader, `deployCoreAsset.ts`, was invoked by nothing — no npm script, no code
> reference, no root `package.json` — and was **deleted on 2026-08-28**, so the confusion
> cannot recur. Set `template-version.json` for the website. Set `master.csv` for the
> chain. They should agree, and only one of them is permanent.

`collectionImage` on that same first row becomes the collection's permanent on-chain
`uri` (`deploy-collection.js:350`), defaulting to an empty string if blank.

### 2. The royalty rate

`sellerFeeBasisPoints` is **per-row in `master.csv` but collection-wide on chain**.
`deploy-collection.js` warns when rows disagree, then silently uses the first row's
value. The sample row ships `500` — 5%. Decide the number, then make it identical on
every row. `0` attaches no Royalties plugin at all.

### 3. The mint price, and which field actually sets it

**The price charged is `row.price` in `master.csv`** (`deploy-candy-machine.js:279`).
`config.json`'s `price` field is **required to be present** (`deploy-collection.js:171`)
but is **never read as the price**. Set both to the same number so nobody later trusts
the wrong one.

### 4. Deployer keypair custody

The deployer wallet is the collection's authority. Back it up somewhere that survives
this machine, **before** Stage 7. No check covers this, and it is unrecoverable.

> Also decide, if the launch will have them: **rewards** (holder campaigns draw a
> snapshot from `backend/scripts/get-holders.js` — see Stage 10) and
> **rankings** (`rulesetPrefix` ships as `CHANGE ME`; the feature is undeclared, not
> broken). Neither blocks a mint. Both block promising them.

---

# Stage 1 — Copy the template

> **Every command from here to Stage 9 runs in the *new collection's* folder, never in
> `TEMPLATE-OPEN-EDITION` itself.** Stage 1 is the exception that creates that folder —
> the `Copy-Item` runs from anywhere, everything after it runs inside the copy.
>
> This matters most for the `Remove-Item` block below. Run it in the template by mistake
> and you delete `backend/.env`, `backend/.env.admin` and `frontend/.env` — gitignored
> files holding a treasury address, a deployer key and RPC settings, which are in no
> commit and **cannot be restored with `git checkout`**.

### Copy with `.git`, not without

Keep `.git`. It is hard to reverse, so understand the trade:

- **With `.git`** — the copy shares history with the template. `origin` still points at
  the template's repo, which Stage 2 fixes. In exchange you can diff any file against
  the **fork point**, which is the only reliable way to pull in later template features
  without clobbering your own config.
- **Without `.git`** — a clean slate and `git init`. Simpler on day one; every future
  template upgrade becomes a manual read of two files, because there is no shared
  ancestor to diff against.

```powershell
Copy-Item -Recurse C:\Users\User\Desktop\TEMPLATE-OPEN-EDITION `
                   C:\Users\User\Desktop\my-collection
cd C:\Users\User\Desktop\my-collection
pwd    # confirm you are in the copy before the next block
```

### Delete what should not have come along

```powershell
Remove-Item -Recurse -Force node_modules,backend\node_modules,frontend\node_modules,dist -EA SilentlyContinue
Remove-Item -Force backend\.env,backend\.env.admin,frontend\.env -EA SilentlyContinue
Remove-Item -Recurse -Force backend\logs,.netlify -EA SilentlyContinue
Remove-Item -Force backend\deploy-state.json,backend\registry.json -EA SilentlyContinue
```

`node_modules` matters more than it looks: the template's copy was built against this
machine's Node, and reinstalling per project is cheaper than debugging a stale native
binary later. The `.env` files hold live secrets belonging to the template, not to you.

### `deployment.json` is the trap

**This file is tracked, and it names an on-chain asset that is not yours.**

```json
{
  "assetAddress": "GSy11Cj6N8TtA5EeWYs7pUtAx3weXtxdBH6GLQJCyrK6",
  "treasury": "7XJJvj5N4aBMNyX9g5NZqSEzi9vY6vYxWydezMZvC4n9",
  ...
}
```

Left in place, the new collection *appears* to already have a deployed collection asset —
the template's. Nothing errors; it simply points at the wrong thing. Delete
`assetAddress` and `createdAt`, set `treasury` to your own wallet, and leave `rpc` for
Stage 5.

### `master.csv` and `campaigns.csv` carry addresses too

Both are **tracked**, and once a collection has been deployed they hold every on-chain
address it owns. Copying from `TEMPLATE-OPEN-EDITION` is safe — its `master.csv` is one
`SAMPLE-001` row with no addresses and its `campaigns.csv` sample row has the address
columns blank. **Copying from a collection you already launched is not**, and that is the
tempting thing to do once you have one you like.

Blank these columns in the copy, in every row:

| file | columns |
|---|---|
| `master.csv` | `collectionAddress`, `candyMachineAddress`, `candyGuardAddress`, `holderRequiredCollection`, `holderPrice`, `itemImage`, `uri` |
| `campaigns.csv` | `campaignCandyMachineAddress`, `eligibilityCollection`, `targetCollection`, `treasury`, `claimLimitId`, `assetLimitId` |

Delete campaign rows you are not running, rather than leaving them to be resolved later —
a fork carrying 24 rows whose `eligibilityDropItemId` matches nothing is a live example.

`holderRequiredCollection` is the one that bites hardest, because it fails *silently*: the
new collection's editions advertise a holder route backed by the **old** collection's
voucher, `mint.ts` sends `group: "holder"` with `assetBurn` args to a machine whose guard
has no groups, and the instruction fails to deserialize. It reads as "minting is broken"
with no cause attached. `preflight.js` now refuses it up front —
`holder_collection_is_local`, Appendix A — but blank the column anyway; a guard is a
backstop, not a substitute for not copying the value.

`itemImage` and `uri` fail silently too, and nothing refuses them. Copied, they hold the
**old** collection's real upload URLs. `upload-images.js` and `upload-metadata.js` skip any
row that already has a real URL, so the new collection would mint with the old art and the
old metadata, and every step would report success. Leave both blank: 7.2 and 7.4 fill them.

### Which `master.csv` columns end up on the card, and when they freeze

With generated cards (7.1), four columns are **printed on the image**: `collectionName`,
`itemName`, `attributes`, and `itemDescription` (only when a drop has no attributes).
`dropItemId` is printed too. `price` and `maxSupply` never are.

**They freeze at 7.2, the image upload, not at the deploy.** Before 7.2, edit them freely
and re-run 7.1: the card follows. After 7.2, an edit regenerates the local PNG and nothing
a buyer will ever see. `upload-images.js` skips a row whose `itemImage` is already real
(only `--force` re-uploads, and that pays again), and once 7.6 has deployed the drop its
`uri` is fixed on chain for good. Settle the wording before 7.2.

---

# Stage 2 — Split into its own repo

A folder copy still has `origin` pointing at the **template's** GitHub repo. Left alone,
a plain `git push` from this folder pushes your collection's config and CSVs into the
shared template repository, corrupting it for every future collection.

```powershell
git remote -v
```

If that shows the template's URL, continue. If it already names a repo for this
collection, skip to Stage 3.

```powershell
git add -A
git commit -m "Checkpoint: collection config before separating from template repo"
```

> `fatal: Unable to create '...\.git\index.lock': File exists.` is a stale lock, not a
> conflict. Confirm no git process is running, then `Remove-Item .git\index.lock -Force`
> and retry.

Create a **fully empty** repo at `github.com/new` — no README, `.gitignore` or license,
since you are pushing existing history into it. Then:

```powershell
git remote set-url origin https://github.com/<your-org>/<collection-repo>.git
git push -u origin main
```

From here, `git push` only ever affects this collection.

**Turn on the doc guard — one command, once per clone:**

```powershell
git config core.hooksPath .githooks
```

`.githooks/pre-push` runs `scripts/check-docs.js`, which refuses a push whose
documentation asserts something the code contradicts. It exists because the same class
of defect — a doc describing behaviour the scripts don't have — was found four separate
times in one week, each time by someone happening to notice. Git does not version
`.git/hooks/`, so without this command the committed hook is inert.

> **Forking an older collection rather than today's template?** Then you also need to
> merge newer template features in deliberately. Diff each file against the fork point —
> `git diff --ignore-space-at-eol -w <fork-point-commit> -- path/to/file` — and take the
> template's version wholesale only where there are no differences. Backend scripts are
> generic tooling and almost always safe to take wholesale; frontend files that render
> collection UI are not. Whole *directories* an older collection lacks
> (`backend/standings/`, `backend/methodology/` and their scripts) won't surface in a
> file diff at all — check for missing directories explicitly. **A fresh fork from
> today's `main` skips all of this.**

---

# Stage 3 — Set identity

There is no single rename. The collection's identity lives in **seven** places; four are
files:

| Where | Field | Ships as | Permanent? |
|---|---|---|---|
| **`backend/master.csv`** | **`collectionName`** (first row) | `Sample Collection` | **Yes — minted on chain** |
| **`backend/master.csv`** | **`collectionImage`** (first row) | a `placehold.co` URL | **Yes — the collection's on-chain `uri`** |
| `backend/master.csv` | `collectionSlug` | `sample-collection` | No, but it is the fallback name |
| `backend/config.json` | `collectionSlug` | `your-collection-slug` | No |
| `template-version.json` | `collectionName` | `Template Open Edition` | No — website title and `<h1>` only |
| `backend/standings/_input/import-config.json` | `collectionTitle`, `seasonId`, `rulesetPrefix` | `CHANGE ME` | No (only if you publish rankings) |

The other three are the folder name, the GitHub repo (Stage 2) and the Netlify site
(Stage 8).

**`collectionSlug` must be byte-identical in `config.json` and `master.csv`.** Preflight
matches rows on it; a mismatch fails `collection_has_rows` and four content checks never
run at all.

`collectionName` is also injected into `frontend/index.html` at build time by a Vite
`transformIndexHtml` plugin, so it becomes the browser tab title and the on-page `<h1>` —
*and* the name written on chain. A Netlify title is a one-line fix at any time; an
on-chain asset name is not.

Also set now, while you are editing identity:

- **`collectionExternalUrl`** in `master.csv` — the collection's real site URL. Every
  post composed by `compose-post.js` derives `{siteUrl}` from this field, and
  `{methodologyUrl}` appends `/#methodology`. Left as `https://example.com`, or left
  blank, both resolve to a placeholder and every post is wrong.
- **`.env.admin`** — present, gitignored, `DEPLOYER_PRIVATE_KEY` set. Confirm with
  `git check-ignore backend/.env.admin`. A key that is not gitignored is a key in every
  clone of the repo, forever, including forks.
- **`config.json`** — real `treasury`, and `network` set deliberately.
  `not_already_deployed` is **network-aware**, so a fork left on `devnet` will happily
  re-deploy something already live on mainnet.

Verify:

```powershell
git grep -n "Template Open Edition"    # only template-version.json should hit
git grep -n "sample-collection"
git grep -n "CHANGE ME"
```

---

# Stage 4 — Replace the sample content

Five generated artifacts are tracked and will otherwise ship as your site's data:
`frontend/public/` holds `registry.json`, `campaigns.json`, `content-registry.json`,
`standings.json` and `methodology.json`. **Don't delete them** — replace the *sources*
and re-run the generators.

- `backend/master.csv` — replace the `sample-collection` / `SAMPLE-001` row with real
  drops: real `dropItemId`s, real images, real `itemExternalUrl`, the royalty and price
  settled in Stage 0.
- `backend/campaigns.csv` — the `sample-campaign-001` row.
- `backend/textcards.csv` — six sample cards.
- `backend/standings/EXAMPLE-participants-accuracy.json` — **delete it.** It publishes a
  visible card tagged `example` if left in place.
- `docs/open-items.md` — **delete it.** It tracks template maintenance, not collection
  content.

---

# Stage 5 — Point the RPC at the proxy

**Never commit a keyed RPC URL.** A URL of the form
`https://mainnet.helius-rpc.com/?api-key=<key>` is a live credential. Frontend builds
make it worse: Vite bakes `VITE_*` values into the shipped bundle, so a keyed URL in the
frontend env is readable by every visitor even if the repo is private.

The collection talks to a **Cloudflare Worker proxy** holding the Helius key server-side.
The Worker source lives in its own repo (a copy of `helius-labs/helius-rpc-proxy`); the
working checkout is `C:\Users\User\Desktop\rpc-proxy`.

```powershell
npx wrangler deploy src/index.ts   # or: npm run deploy
```

| Variable | Required | Notes |
|---|---|---|
| `HELIUS_API_KEY` | yes | The real key. Set it **encrypted** so it is hidden from the dashboard, the API and logs. Without it the Worker returns `500 Missing HELIUS_API_KEY`. |
| `CORS_ALLOW_ORIGIN` | no | Comma-separated allowed origins. **If unset, the Worker answers `Access-Control-Allow-Origin: *`** — any site on the internet can route Solana RPC through your key's quota. |

**The CORS behaviour is all-or-nothing per request.** If `CORS_ALLOW_ORIGIN` is set and
the incoming `Origin` isn't on the list, the Worker returns no
`Access-Control-Allow-Origin` header at all and the browser blocks the call. No partial
credit. The list must contain *every* origin that legitimately calls the proxy:

- production — `https://<your-site>.netlify.app`, plus any custom domain
- local dev — `http://localhost:5173`

Netlify deploy previews get generated subdomains
(`deploy-preview-12--your-site.netlify.app`) which cannot be enumerated in advance.
Either accept that RPC fails on previews, or leave the variable unset and rely on the
Helius-side IP allow-list. Decide deliberately; don't discover it mid-review.

**Put the Worker URL (no key, no query string) everywhere the collection reads an RPC:**

- `deployment.json` → `rpc`
- `backend/config.json` → `rpc`
- `frontend/.env` → `VITE_SOLANA_RPC_URL` (and the matching Netlify variable, Stage 8)
- `backend/.env` → `SOLANA_RPC_URL`, `VITE_SOLANA_RPC_URL`

This has to happen **before** Stage 7, because the deploy scripts read `config.json`'s
`rpc`.

> **Rotating a leaked key:** delete the exposed key in the Helius dashboard **first** —
> that is what stops the bleeding; scrubbing the repo does not. Create a replacement and
> update `HELIUS_API_KEY` on the Worker; the collection needs no redeploy because it
> never held the key. Then confirm the tip is clean with `git grep -n "api-key="`,
> remembering that a key committed at any point stays in history.

---

# Stage 6 — Preflight: the gate

```powershell
node backend/scripts/preflight.js
```

Reads `config.json`, `.env.admin`, `master.csv`, `campaigns.csv`. **Writes nothing.**
Re-running is always safe — it is the only step in the whole pipeline that is. Run it as
many times as it takes.

**Pass condition:** exit `0` with **`READY — all checks passed`**. Not
`READY WITH WARNINGS`, and **without `--allow-warnings`**.

> **A fresh fork fails here immediately, before you change anything.** `config.json`
> ships `collectionSlug: "your-collection-slug"` and the only `master.csv` row is
> `sample-collection`, so `collection_has_rows` fails and four content checks never run.
> That is preflight working, not preflight broken.

### The three verdicts, and why the exact wording matters

| Line | Exit | Meaning |
|---|---|---|
| `READY — all checks passed` | 0 | The only clean pass. |
| `READY — but N check(s) could not be verified` | 0 | Every check that ran, passed — but N did not run. Listed under **Could not verify**, and shown as `? UNVERIFIED` on the category line. |
| `READY WITH WARNINGS` | 0 | You passed `--allow-warnings` and something was downgraded. |
| `NOT READY — N failure(s)` | 1 | Stop. |

**Do not read an unverified check as a pass.** `deployer_not_treasury` cannot run when
`DEPLOYER_PRIVATE_KEY` is absent, is not a 64-byte secret key, or will not base58-decode —
and it is the check standing between your deploy key and your sale proceeds. It reports
`COULD NOT VERIFY — …` in each case. That does not block a deploy, because an underivable
key format is not itself grounds to refuse one; it does mean nobody has confirmed the two
wallets are different.

**If `campaigns.csv` exists, confirm `no_reserved_campaign_ids` appears in the output.**
That check runs only when the file is present. Its silence is not a pass.

### The flags, and what each one costs you

| Flag | What it does | When it is legitimate |
|---|---|---|
| `--slug <name>` | Check a slug other than `config.json`'s | Multi-collection repos |
| `--allow-warnings` | Downgrades the **seven** reserved-prefix, collection-placeholder, campaign and holder checks — see Appendix A | A deliberate test deployment. **On mainnet this is the flag that mints test data.** |
| `--force` | Overrides `not_already_deployed` | An intentional re-deploy. Nothing else. |

Preflight writes `force` and `allowWarnings` into `backend/logs/preflight.log` at start,
so a downgraded pass leaves an audit trail.

**Anything preflight refuses is fixed in the template, then pulled into the fork** — not
patched in the fork alone. A fix that lives only in a fork is a fix the next collection
does not get.

### Before you cross into Stage 7

- [ ] `network` in `config.json` read back and said aloud.
- [ ] Preflight clean, no flags.
- [ ] `node backend/scripts/reconcile.js` exits 0, once anything is deployed. Preflight
      reads every cap from `master.csv` and never asks the chain, so its
      `campaign_eligibility_capped` pass says so. This is the check that does ask. It is
      read-only, takes no flags and repairs nothing. A row marked `<<` means the CSV and
      the chain disagree: decide which is right before deploying anything that trusts
      the CSV (open-items 51).
- [ ] `git check-ignore backend/.env.admin` confirms the key is ignored.
- [ ] Deployer funded; Irys balance sufficient for images **and** metadata.
- [ ] Deployer ≠ treasury, confirmed from the detail line.
- [ ] Every image in `backend/images/` is what you mean to mint — the generated card or
      your own art — **opened and checked by eye, not by flag** (7.1).
- [ ] The deployer keypair is backed up off this machine.

---

# Stage 7 — The mint

> ## ⚠ Everything below spends money and cannot be undone.
>
> Arweave storage is paid once and kept forever; there is no delete. Chain steps have no
> rename, no re-point, no undo. **Exit codes are uniform across this stage — `0` success,
> `1` validation, `2` upload, `3` chain** — which is what lets you tell "I typed
> something wrong" from "the network refused" without reading the logs.

Eight scripts, in the only order they may run.

### 7.1 `generate-images.js` — a text card per drop into `backend/images/`

> **⚠ Not yet cleared for a real mint.** No generated card has been minted and looked at
> on a marketplace. The image is uploaded permanently and its URL goes into metadata that
> a candy machine can never change, so "check it after the first real mint" is too late
> by construction. **Before any production drop uses a generated card, mint one throwaway
> on a TEST drop and look at it on the marketplaces that matter** (open-items 53). Until
> that is recorded, use your own art for anything real. The script existing is not
> approval.

```powershell
node backend/scripts/generate-images.js --dry-run   # what it would write
node backend/scripts/generate-images.js
```

**No artwork is required.** For every drop it composes a text card from that drop's own
`master.csv` row: the collection name, the item name, every `attributes` pair (up to ten,
two columns of five; more are counted as "+N more"), the `dropItemId`, and `config.json`'s
`symbol` if set. A drop with no attributes prints its `itemDescription` instead. Text too
long for the card is shortened with an ellipsis and reported; the metadata keeps it in
full.

**What ships is a PNG, not the SVG.** The card is composed as SVG and rasterised to a
1200 px `backend/images/<dropItemId>.png` using **only** the font in `backend/fonts/`
(Inter 4.1, SIL OFL), with system fonts switched off. The same row gives the same PNG
bytes on any machine, and no wallet or marketplace has to render SVG or have a font
installed. The `.svg` stays beside it as the readable source; `upload-images.js` uploads
the `.png`. `images/generated-images.json` records what was written, with the rasteriser
version and font hashes.

**A character the font cannot draw refuses the drop.** Emoji and CJK are not in Inter, and
would print as Inter's "NO GLYPH" box on a permanent image. The script writes nothing for
that drop, names the characters, and exits `1`. Change the text in `master.csv`, or use
your own art.

**Price and `maxSupply` are deliberately not printed.** Every edition of a drop shares
one image, and both values change after launch (a reprice, a cap raise). A printed
"edition of 8" would be wrong for ever the first time `update-candy-machine-supply.js`
raises the cap.

**Colours.** Each collection gets its own accent, derived from `collectionSlug`, on a
dark card. To choose your own, add to `backend/config.json`:

```json
"card": { "background": "#14161a", "foreground": "#f2f2f0", "accent": "#3fa7d6" }
```

Any key you leave out keeps its default. A colour that is not `#rrggbb` is refused rather
than written into a permanent image.

**Your own art still wins.** Put a `.png`, `.jpg`, `.jpeg`, `.gif` or `.webp` named for
the drop into `backend/images/`, by hand or with `prepare-images.js`, and that drop is
skipped here and uploaded as your file instead. A PNG this script did not write is
recognised as yours by its hash, so it is never overwritten:

```powershell
node backend/scripts/prepare-images.js --source ./incoming-images
node backend/scripts/prepare-images.js --source ./incoming-images --force
```

**Local only — no SOL, nothing permanent.** Safe to re-run. **Open the `.png` files and
look at them before 7.2.** Sample output is in `docs/runs/assets/generated-cards-2026-10-21/`.

### 7.2 `upload-images.js` — Irys/Arweave → `itemImage` ⚠ SPENDS

```powershell
node backend/scripts/upload-images.js --strict --dry-run   # ← do this first, always
node backend/scripts/upload-images.js --strict
node backend/scripts/upload-images.js --strict --fund      # auto-fund a shortfall first
```

**`--dry-run` is the last free look at a paid step. Use it every time.** It is available
here and on `upload-metadata.js`, and nowhere else in this stage. It writes nothing:
until 2026-10-21 both dry runs put fake gateway URLs into `master.csv`, which the real
run then took for finished uploads (open-items 52).

Reads `backend/images/`; **writes the resulting URL into `itemImage` per row.**

**Nothing here checks that the URL resolves.** A script on this project's machine cannot
read an upload back: Irys's read CDN refuses non-browser clients (open-items 56), and
`isPlaceholder()` only matches known patterns, so a dead URL that is none of them passes.
Until a verification step exists, check each new upload by hand: open
`https://uploader.irys.xyz/tx/<id>/status`, which should say `CONFIRMED`, and open the
`itemImage` URL in a browser and look at it. Do this before 7.3 bakes the URL into
metadata.

Re-running uploads *again* and pays again. A row that already carries a real `itemImage`
is what makes a re-run cheap instead of expensive. **`--strict` turns a missing local
image from a silent skip into a failure — use it for a real mint.** Exit `2` is an upload
failure, and the money question is whether it failed before or after payment; the log
answers that.

### 7.3 `generate-metadata.js` → `backend/metadata/<dropItemId>.json`

```powershell
node backend/scripts/generate-metadata.js --strict
```

Reads `master.csv`; writes JSON files. `backend/metadata/` **does not exist in a fresh
checkout — this script creates it.** Local, free, re-runnable; `--force` overwrites.

**The guardrail:** by default a row whose `itemImage` is still a placeholder is
**skipped**, because embedding a placeholder URL into metadata that then gets uploaded
and minted is unfixable. If rows are being skipped, run 7.2 first.

> **`--allow-placeholder` must never touch mainnet.** It exists for local testing. What
> it buys you on mainnet is a permanent on-chain asset pointing at a picture that says
> "placeholder", and the only remedy is minting a new collection.

**A deployed drop's metadata is frozen.** Once a row has a `candyMachineAddress`, its
`uri` is fixed on chain, and `metadata/<dropItemId>.json` is the only local record of what
holders own. This script will not rewrite or create that file. It reports the drop as
*Frozen* instead, which also tells you `master.csv` no longer matches what was minted.
`--force` does not override this. `--yes-rewrite-deployed` does, and changes nothing on
chain, only the local record. Before 2026-10-21 the files were rewritten silently, and two
of the fork's no longer match what was minted (open-items 59).

### 7.4 `upload-metadata.js` — Irys/Arweave → `uri` ⚠ SPENDS

```powershell
node backend/scripts/upload-metadata.js --strict --dry-run   # ← again, first
node backend/scripts/upload-metadata.js --strict
node backend/scripts/upload-metadata.js --strict --fund
```

Reads `backend/metadata/`; **writes `uri` per row.** Same economics as 7.2. This is the
last step before anything reaches the chain — the last point at which a wrong image is
still only an Arweave receipt rather than an on-chain asset.

### 7.4a The upload gate — required, before anything is permanent

```powershell
node backend/scripts/check-upload-columns.js   # offline: every itemImage and uri is real
node backend/scripts/verify-uploads.js         # networked: every upload confirmed
```

**Both must exit `0` before 7.5.** `check-upload-columns.js` is the check preflight used to
make as `no_placeholder_images` and `no_placeholder_uris`. It moved here on 2026-10-21
because Stage 7 fills those columns after Stage 6 runs, so in preflight it could only fail a
correct new collection. It is offline, so an unreachable Irys node cannot block it, and it
is as hard a gate as before: exit `1` names each unfilled drop. `deploy-candy-machine.js`
still refuses a placeholder `uri` on its own.

**`verify-uploads.js`, below, is the networked half.**

**Read-only: no key, no SOL.** For every drop it asks Irys's upload node for the record
of the `itemImage` and `uri` uploads, and checks each one is **confirmed**, has the **right
type** (`image/*`, `application/json`), and is **exactly the size of the local file that
was sent**. Exit `0` means proceed to 7.5. Exit `1` names what to fix, and is the reason
this step sits here: `uri` becomes permanent at 7.6, and this is the last point at which a
wrong one can still be re-uploaded. Exit `3` means the upload node did not answer, so
**nothing was concluded**. Fall back to the manual check in 7.2: open
`https://uploader.irys.xyz/tx/<id>/status` and look at the image in a browser.

**What it cannot check is content.** Irys's read service refuses scripts from this machine
(open-items 56), so it compares size, type and confirmation, not bytes. A **size mismatch
fails** for a drop not yet deployed: the local file changed after upload, so the `uri`
points at an older version. For a deployed drop the same mismatch is only a **warning**,
because nothing can change it any more. On 2026-10-21 the fork's TEST-002 and TEST-004
metadata showed exactly that: 583 and 586 bytes uploaded, 646 and 649 local, regenerated
after their deploys.

### 7.5 `deploy-collection.js` — the Core collection ⚠ SPENDS ⚠ PERMANENT

```powershell
node backend/scripts/deploy-collection.js
node backend/scripts/deploy-collection.js --slug founders
```

Reads `config.json` and `master.csv`; **writes `collectionAddress` and `network` back
into every matching row.** The collection exists on chain from here.

**Deploying twice produces two collections and no error.** That is what
`not_already_deployed` protects, and why `--force` on preflight is not a routine flag.

This is also where the royalty decision lands: rows that disagree on
`sellerFeeBasisPoints` produce a warning and the first row's value wins, collection-wide.

### 7.6 `deploy-candy-machine.js` — one per drop ⚠ SPENDS ⚠ PERMANENT

```powershell
node backend/scripts/deploy-candy-machine.js
node backend/scripts/deploy-candy-machine.js --drop OE-001
```

**Writes `candyMachineAddress`, `candyGuardAddress` and `treasury` back into
`master.csv`.**

Also accepts `--start-date`, `--mint-limit`, `--bot-tax` and `--mutable`. Each sets a
guard or a flag on the machine at creation time, so each is a decision made **once**, not
adjusted later — settle them before running this, not after.

**Why one machine per drop, not one per collection:** each machine carries its own
`itemsAvailable` / `itemsRedeemed` counter, and a *drop* is the thing that has a supply.
One machine per collection would mean every drop drawing from a single counter. It is the
same structural fact a holder campaign relies on when it gets a dedicated machine against
the same collection — several machines may reference one Collection, each with
independent supply.

**For an open edition** every item shares one name and one `uri`, so the machine carries
no per-item config line. That is what makes an open edition open: there is no item list
to exhaust, and an airdropped asset and a publicly minted one are indistinguishable
afterwards because both belong to the same Collection.

### 7.7 `generate-registry.js` → `frontend/public/registry.json`

```powershell
node backend/scripts/generate-registry.js
git add -A
git commit -m "Deploy <collection>: collection, candy machines, registry"
git push origin main
```

Free, re-runnable, and **the only output in this stage a re-run can fix.** `minted` is
`null` unless you pass `--fetch-minted`. The site shows nothing until the built copy
ships.

---

# Stage 8 — Netlify

Netlify's top-level entity is now a **Project**, not a "Site" — look for **Add new
project**.

1. Log in with the account that should permanently own this collection's infrastructure.
   "Continue with GitHub" using the account that owns the repo is simplest.
2. **Add new project → Import an existing project → GitHub** → select this repo.
   - If the repo isn't listed, Netlify's GitHub App is scoped to selected repositories.
     Fix at `github.com/settings/installations` → **Netlify** → **Configure** → add the
     repo → **Save**, then retry.
3. Confirm build settings match `netlify.toml`: base `frontend`, build
   `npm run build`, publish `../dist`.
4. **Add environment variables before the first full deploy** — see below.
5. Deploy.

### Environment variables — the step most likely to break a first deploy

`.env` files are gitignored by design, so **none of your local values are on Netlify.**
Add them under **Project configuration → Environment variables**:

- **`VITE_SOLANA_RPC_URL`** — the Worker proxy URL from Stage 5. Never a keyed Helius
  URL; Vite inlines this into the public bundle.
- **`VITE_REGISTRY_URL`** — set it to `/registry.json`. **This is the single most common
  cause of "the site loads but is empty."** It has **no fallback**: the registry is
  loaded by `frontend/src/registry/adapter.ts:43`, which reads
  `import.meta.env.VITE_REGISTRY_URL` and nothing else. A missing value makes the browser
  fetch a URL literally named **`/undefined`**, which 404s, and the drops grid is
  silently empty. Look for `/undefined` in the console.

  > From 2026-08-28 to 2026-10-21 this guide said the opposite: that the variable falls
  > back through `frontend/src/config.ts:8` to a path under `public/registry/`. That
  > fallback was real code that nothing ran - `config.ts`'s `registryUrl` was read only by
  > `registry/loader.ts`, which nothing imported - and both were deleted on 2026-10-21. A
  > build with the variable unset compiles the registry fetch to `fetch(void 0)`. **No
  > fallback is the decision, not an oversight** (open-items 49).
- `VITE_SOLANA_RPC_URL_DEVNET`, `VITE_CAMPAIGNS_URL`, `VITE_CONTENT_REGISTRY_URL` if set
  locally.

Variable changes take effect only on a **new build** — Vite bakes them in at build time.
After changing one: **Deploys → Trigger deploy → Deploy site.**

**Renaming:** Project configuration → General → Project details → Change site name. The
`<name>.netlify.app` namespace is shared across all Netlify users.

**If the site returns 401:** Project configuration → General → **Project visibility** —
set Production and Deploy Preview visibility to **Public**.

---

# Stage 9 — Verify

### The chain

- [ ] Exactly one collection created; `collectionAddress` and `network` written to every
      row.
- [ ] One candy machine per drop; `candyMachineAddress`, `candyGuardAddress` and
      `treasury` written.
- [ ] The asset is visible on an explorer **under the intended `collectionName`**.
- [ ] **A test mint from a wallet that is not the deployer.**

### The site

Check the data endpoints directly — a broken fetch fails silently behind a
normal-looking page:

```
https://<your-site>.netlify.app/registry.json
https://<your-site>.netlify.app/campaigns.json
https://<your-site>.netlify.app/content-registry.json
https://<your-site>.netlify.app/standings.json
https://<your-site>.netlify.app/methodology.json
```

A 404 on `campaigns.json`, `content-registry.json`, `standings.json` or
`methodology.json` is **normal** when the collection has no campaigns, cards or boards
yet — all are handled as expected empty states.

A 404 on `registry.json` is real breakage. So is any request for **`/undefined`** — that
is `VITE_REGISTRY_URL` missing from the build because it was never set on Netlify
(Stage 8), and it is the most common first-deploy failure there is.

Check the browser console (F12) for `Failed to load resource`. A CORS error naming the
Worker URL points at `CORS_ALLOW_ORIGIN` (Stage 5), not at Netlify.

### Drift

```powershell
node backend/scripts/check-published.js --site https://<your-site>.netlify.app
```

**Exit `0`** = the live site matches the repo. **Exit `1`** = drift. **Exit `2` means
nothing was compared — treat it as unknown, never as a pass.**

Run this after every publish, not just this one. It exists because one published card ran
against nine CSV rows for weeks and every endpoint returned `200` the whole time.

### Then

- [ ] Anything this launch broke or exposed is fixed **in the template**, not only here.

---

# Stage 10 — Ongoing

## Text cards

Four steps: write the row, compose the post, publish the card, link the post back.

### A. Write the row

Append to `backend/textcards.csv`. **Sixteen columns, in this order:**

```
textCardId,category,headline,subheadline,content,publishedDate,updatedDate,
status,expiresAt,tags,featured,priority,author,image,imageAlt,postUrl
```

| Column | Required | Notes |
|---|---|---|
| `textCardId` | yes | Unique, **never reused** once assigned. Duplicates are a hard error. |
| `category` | yes | `NEWS`, `UPDATE`, `ANNOUNCEMENT`, `ANALYSIS`. Structured categories are refused — see below. |
| `headline` | yes | |
| `subheadline` | no | |
| `content` | yes | The body prose. |
| `publishedDate` | yes | ISO 8601. A future date means written now, appears later. |
| `updatedDate` | no | Defaults to `publishedDate`. When it differs the card shows *Updated …*. |
| `status` | yes | `DRAFT`, `SCHEDULED`, `ACTIVE`, `INACTIVE`, `EXPIRED`, `ARCHIVED`. **Only `ACTIVE` renders.** |
| `expiresAt` | no | ISO 8601. Hides the card afterwards; enforces nothing else. |
| `tags` | no | Pipe-delimited (`a\|b\|c`), not comma. |
| `featured` | no | `TRUE`/`FALSE`. Sorts first. |
| `priority` | no | Integer, descending. Breaks ties among featured. |
| `author` | no | |
| `image` | no | `http(s)://` or a site-relative `/path`. Any other scheme is refused. |
| `imageAlt` | **yes, if `image` is set** | Refused without it. Backfilling alt text across a grown archive is far harder than writing one line now. |
| `postUrl` | no | Where the card was announced. `https://` only. Added in step D. |

Optional columns still need their commas, so a minimal row ends in a run of them. Two
things that bite: **a comma anywhere in your text requires the whole field in double
quotes** (which is why `tags` uses a pipe), and **structured categories — `RANKING`,
`LEADERBOARD`, `SCOREBOARD`, `STANDINGS`, `STATS` — are rejected from this CSV**, because
their content is an entries array, not prose. Those come from board files.

Display order is `featured`, then `priority` descending, then `publishedDate` newest
first.

### B. Compose the post

```powershell
node backend/scripts/compose-post.js announcement --id ANNOUNCEMENT-012
```

Reads `textcards.csv` **directly, not the registry**, so it works before the generator
has run and iterating on wording touches no published file. The post prints to stdout and
the character report to stderr, so `… > post.txt` gives a clean file with the budget
still on screen. Over budget, it prints the post, names the line to cut, and writes
nothing. It refuses rather than guessing — unknown placeholder, empty field, unmatched
`--id` — and always names the valid options. **It never posts; you paste.**

### C. Publish the card

```powershell
node backend/scripts/generate-content-registry.js
git add -A
git commit -m "Add <description of new card(s)>"
git push origin main
```

Netlify rebuilds on push. Hard-refresh the live site once the build finishes, or you will
be served the cached bundle and conclude nothing happened.

### D. Link the post back

```powershell
node backend/scripts/set-post-url.js ANNOUNCEMENT-012 https://x.com/you/status/123
```

Writes `postUrl` into that one row and re-runs the registry generator. It refuses a
non-`https://` URL and an unknown card id **before touching the file**, and rewrites only
the line it matched — every other row stays byte-identical. Then push again.

**This second push is the step most likely to be skipped, and it is the entire reason the
column exists.** The card renders a *Discussion →* link so readers can join the
conversation instead of hunting your timeline.

### Who owns which card

| Card kind | Id prefix | Source of truth | Written by |
|---|---|---|---|
| Simple (NEWS, UPDATE, ANNOUNCEMENT, ANALYSIS) | any | `backend/textcards.csv` | `generate-content-registry.js` |
| Generated standings | `STANDINGS-` | a board file in `backend/standings/` | `generate-standings-cards.js` |
| Hand-authored persistent (RANKING, LEADERBOARD, SCOREBOARD, STATS) | anything *except* `STANDINGS-` | the registry entry itself | nobody — edit by hand |

**A `STANDINGS-` card must never be hand-edited** — the next generator run overwrites it.
Edit the board file and re-run. A persistent card with any other id is yours and no script
touches it.

**Deleting a CSV row does not retire a card.** The generator seeds from the existing
registry and overlays the CSV, so it only ever adds or updates; an entry it no longer sees
is carried through untouched and stays live. **`status` is the only thing that hides a
card.** Retire, don't delete.

## Rankings and standings

One JSON file per board in `backend/standings/`. A generator projects each into a
`STANDINGS-` card for the RANKINGS tab and publishes the *complete* board — every entry,
not just the rows the card shows — to `frontend/public/standings.json`.

Boards are produced by importers, never written by hand. The whole round is one command:

```powershell
node backend/scripts/publish-round.js
```

That runs import → standings cards → methodology, in the only order they may run, with
every log line still printed, stopping at the first non-zero exit. `--from standings`
skips the import for a hand-written one-off contest. The individual scripts
(`import-ranked-boards.js`, `import-community-boards.js`,
`generate-standings-cards.js`, `generate-methodology.js`) still exist if you need one
alone.

Inputs live in `backend/standings/_input/`:

- `import-config.json` — importer settings, including `columnMap` when the source app's
  labels differ from the logical names.
- `rulesets.json` — the ruleset changelog; each board stamps the `rulesetVersion` that
  produced it.
- `boards.json` plus dated exports in `_input/boards/` — **neither exists in a fresh
  checkout.** Create them when you declare your first ranked board.

**Rules that stop a run, by design:** a board with `capture.complete: false` is a hard
failure, because a response that was never captured is indistinguishable from a
participant who didn't play — pass `--allow-incomplete` to publish it `INACTIVE` for
review instead. Entries must already be in rank order. And **nothing here scores
anything**: ranks, scores and movement arrive settled from the source, and projection is
formatting, not arithmetic. That is what makes a published card reproducible from its
board file.

**Two behaviours that look like bugs and aren't:** a `cardLimit` of 10 can publish 12
rows, because the slice extends through the whole tie group at the cut line rather than
splitting a tie; and deleting a board file marks its card `ARCHIVED` on the next run
rather than removing it, so history survives.

## The methodology page

`publish-round.js` runs this for you. Standalone:

```powershell
node backend/scripts/generate-methodology.js
```

It merges authored prose from `backend/methodology/methodology.json` with facts **derived
from the standings themselves** — which boards exist, which ruleset produced each, which
exports they came from, the eligibility minimum, the full changelog.

The split is the point: edit the prose when the *explanation* changes, and let everything
that could go stale be re-derived. A methodology page quietly describing last month's
rules is worse than none, because readers trust it.

## Rewards

Holder campaigns — hold this, buy that at a discount — run from `backend/campaigns.csv`
via `deploy-campaign.js`. `backend/scripts/get-holders.js` produces the holder snapshot
that feeds a reward campaign — `--drop <dropItemId>` narrows it to one edition, which is
the only way to target a single drop inside a shared collection, since `assetGate` sees
only collection membership. **Written and verified 2026-09-02** against a collection whose holders
were already known from `airdrop-history.csv`; it returned exactly them. If a launch promises nothing to holders,
confirm the site says nothing that implies otherwise.

---

# Appendix A — The twenty-two preflight checks

Sixteen until 2026-08-28, plus five when the permanent-value surface was enumerated (see
below), plus `not_a_mintable_voucher` on 2026-09-03, plus `campaign_eligibility_capped` and
`holder_collection_is_local` on 2026-09-05, minus `no_placeholder_images` and
`no_placeholder_uris`, which moved to the upload gate (7.4a) on 2026-10-21. Twenty-two is what
`grep -c results.push backend/scripts/preflight.js` reports; recount it rather than trusting
this sentence.

| Group | Check | Notes |
|---|---|---|
| Project Structure | `config_exists` | |
| | `config_valid_json` | **Failure-only** — recorded only when it fails |
| | `collection_slug_present` | **Failure-only** |
| | `collection_has_rows` | **Failure-only** |
| Environment | `env_admin_exists` | |
| | `env_admin_gitignored` | The difference between a key on your disk and a key in every clone forever |
| | `deployer_key_present` | |
| | `treasury_valid` | |
| | `rpc_valid` | |
| | `deployer_not_treasury` | **Never downgradable.** Reports `COULD NOT VERIFY` rather than passing when the key is absent, not 64 bytes, or undecodable |
| Content Validation | `no_reserved_slug` | Downgradable. Catches `test-`/`demo-`/`sample-` |
| | `no_reserved_drop_ids` | Downgradable. Catches `TEST-`/`DEMO-`/`SAMPLE-` |
| | *`no_placeholder_images`, `no_placeholder_uris`* | **Moved to 7.4a on 2026-10-21** (`check-upload-columns.js`). Stage 7 fills `itemImage` and `uri` after this gate runs, so here they could only fail on a correct new collection. Preflight's verdict says it does not check them |
| Campaign Validation | `no_reserved_campaign_ids` | Downgradable; **runs only if `campaigns.csv` exists** |
| | `campaign_eligibility_capped` | Downgradable; **runs only if `campaigns.csv` exists**. Fails when a campaign's `eligibilityDropItemId` resolves to a row whose `maxSupply` is blank, `unlimited`, or unparseable — an open edition, whose eligibility can be minted on demand for the price of one mint (open-items 41). Reports `COULD NOT VERIFY` when the eligibility drop is not in `master.csv` at all. Downgradable because accepting the leak is a real choice; `--allow-warnings` is how you record having made it |
| **Permanent Values** | `no_placeholder_collection_name` | Downgradable. The name minted on chain. Word-boundary match, so "Contest Winners" passes and "Mechanics Test B" does not |
| | `no_placeholder_collection_image` | Downgradable. Becomes the collection's permanent `uri` |
| | `prices_parse` | **Never downgradable.** `Number(price) \|\| 0` means a typo mints free, forever |
| | `item_names_fit_on_chain` | **Never downgradable.** `hiddenSettings.name` is `.slice(0, 32)` — over-length names are silently truncated |
| | `max_supply_parses` | **Never downgradable.** `parseMaxSupply` falls back to unlimited, so a typo makes an unbounded open edition |
| | `not_a_mintable_voucher` | **Never downgradable.** Fails when a burn currency already has a candy machine. A voucher collection must never get one: a candy machine is the public mint path, so anyone could mint vouchers and burn each for an edition. Detected two ways — `mintStatus` of `voucher` on the row, true from the moment it is typed, and the collection being named as some drop's `holderRequiredCollection`, true only after the first edition is migrated. `deploy-candy-machine.js` refuses on the same two signals, and that refusal is what actually prevents it |
| | `holder_collection_is_local` | Downgradable. Fails when a drop's `holderRequiredCollection` names a collection absent from this `master.csv` — almost always a CSV copied from a live collection, pointing these editions at another project's voucher. Checked across every row, not just the slug being deployed. Left alone it does not error: the card advertises a holder route and the mint fails to deserialize, which presents as "minting is broken" |
| Deployment State | `not_already_deployed` | Network-aware; overridden by `--force` |

### Why these five exist

Until 2026-08-28 preflight checked `itemImage` and `uri` and **nothing else that becomes
permanent**. A project could pass every check, with no flags, and still mint under the
name "Sample Collection", at a price of zero, with unlimited supply, and a `placehold.co`
URL as the collection's on-chain metadata — none of it intended, none of it reversible.

That is not hypothetical. All four collections deployed to mainnet in August carry a
`placehold.co` URL as their permanent on-chain `uri`, and were named "Mechanics Test A"
through "D". The new checks, run against that same `master.csv`, refuse it on both counts.

The lesson generalises: the question to ask of this pipeline is not *"does it run?"* — it
demonstrably runs — but *"is every value it makes permanent one somebody chose?"*

**`--allow-warnings` downgrades seven checks** — every row marked *Downgradable* in the
table above, which is exactly `CONTENT_CHECK_NAMES`. (Nine until 2026-10-21, when the two
upload-column checks moved to 7.4a.) (This paragraph said *five* until
2026-09-03, having been written when the set was smaller and never recounted after the
permanent-value checks were added; the guard rule that now catches it was watching for the
word *six* and let *five* straight through. It said *seven* until 2026-09-05, when
`campaign_eligibility_capped` and then `holder_collection_is_local` joined the set — twice
in one session, which is the argument for recounting rather than adjusting by one.) Until 2026-08-28 the set also contained
`deployer_not_treasury`, an *Environment* check, which made the long-standing claim that
"an Environment failure is never a warning" false — and false about the check protecting
the deploy key. It has been removed from `CONTENT_CHECK_NAMES`, with a comment saying not
to put it back. Same date, its three un-runnable paths stopped reporting `pass` and started
reporting `COULD NOT VERIFY`.

**A category can pass without evaluating anything.** Every content, permanent-value and
deployment check runs inside the block that `collection_has_rows` guards, so a slug with no
matching rows skips eleven checks — including both art gates. Until 2026-09-03 the report
printed `Content Validation ✓ PASS` in that state and omitted the Permanent Values group
from the output altogether. It now marks a partly-skipped category `(partial)`, prints
`- NOT EVALUATED` for one that ran nothing, and names the checks that did not run in both
cases. **Read that line before you read the ticks.**

**Three checks are pushed to results only on failure** — `config_valid_json`,
`collection_slug_present` and `collection_has_rows`. So a clean run records **twenty-one**
named results, and still prints `READY — all checks passed`. With no `campaigns.csv` it
records **nineteen**, because *both* `no_reserved_campaign_ids` and
`campaign_eligibility_capped` sit inside that file's existence check. Watch that pair: when
`campaign_eligibility_capped` was added, the with-file number moved and the without-file one
did not, because both new-and-old campaign checks live behind the same gate;
`holder_collection_is_local` sits outside it, so it moved both. Recount, do not increment.
The conditions are genuinely evaluated — not a hole — but don't go looking for twenty-four
ticks.

---

# Appendix B — Known non-issues

- **`warning: … LF will be replaced by CRLF …`** during `git add` — Windows Git
  normalizing line endings. Cosmetic. (A diff of thousands of untouched lines is a
  *different* problem: the collection is missing the `.gitattributes` the template
  carries. Copy it over and renormalize.)
- **A 401 fetching your own site from an automated tool** while it loads fine in a real
  browser, including incognito — some hosts treat non-browser requests differently at the
  edge. Trust the browser.
- **A 404 on `standings.json` or `methodology.json`** before you've published any boards.
  Expected empty state, handled in the frontend.
- **`backend/metadata/` missing** in a fresh checkout. `generate-metadata.js` creates it.
- **`scripts/audit-production.ps1`** was an empty file and was deleted on 2026-08-28.
  There is currently no scripted post-mint chain audit. (`get-holders.js`, empty until
  2026-09-02, is no longer in this list — it was written.)

---

# Appendix C — Reference documents

None of these is needed to complete a launch. Reach for one when you want depth this
guide deliberately doesn't carry.

| File | Covers |
|---|---|
| `docs/generation-prompts.md` | The AI prompt library — one block per thing that can be created, plus the registry of every collection and dashboard. |
| `docs/runs/README.md` | 29 worked runs, one per prompt, each run against real files. The fixtures of record. |
| `backend/standings/README.md` | Board format field by field, the two importers, running and closing a contest, ties, score direction. |
| `docs/post-generator-spec.md` | The `compose-post.js` contract: sources, placeholders, refusals, weighted character counting, the six templates. |
| `docs/netlify-connection.md` | Logging into and confirming the Netlify project. |
| `docs/production-readiness.md` | The launch record — what the August deployment logs prove, why the first launch runs on mainnet, and template-level fixes still outstanding. **Not a guide.** |
| `docs/open-items.md` | Template maintenance backlog, plus a verified-state table. **Delete when forking.** |
