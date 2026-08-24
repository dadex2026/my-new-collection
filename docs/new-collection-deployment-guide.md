# Spinning Up a New Collection from TEMPLATE-OPEN-EDITION

This is the operational playbook for taking a copy of `TEMPLATE-OPEN-EDITION`,
turning it into a standalone, deployable NFT collection project, and getting
it live on its own Netlify site. It was written from the process used to
stand up `my-new-collection`, and applies to any future collection started
the same way (a folder copy of the template, customized with real config).

## Where things are documented

This file is the front door, not the whole manual. It covers standing a
collection up and the day-to-day content loop; two other files carry detail
that would swamp it. If you are looking for something and it is not below,
it is in one of these.

| File | Covers | Reach for it when |
|---|---|---|
| **`docs/new-collection-deployment-guide.md`** (this file) | Copying and naming the collection, repo split, display name, RPC proxy, Netlify, env vars, live verification. Then the ongoing loops: Text Cards, Rankings, Methodology. | Standing up a collection, or publishing a news/update/announcement card. |
| **`backend/standings/README.md`** | Board file format field by field, the two importers, `_input/` layout, **running a contest**, rank order, ties, score direction. | Anything ranked — leaderboards, standings, contests. |
| **`docs/post-generator-spec.md`** | The `compose-post.js` contract: sources, placeholder resolution, the refusal rules, weighted character counting, the six templates. | Writing or debugging a post template. |
| **`docs/netlify-connection.md`** | Logging into and confirming the Netlify project. | Deploy access questions. |
| **`docs/open-items.md`** | Backlog, plus a **verified state** table of facts checked against the code. | Picking up work, or before trusting a claim in an inherited handoff. |

Two of those are easy to miss and worth naming outright. **Contests are not
documented here** — the whole workflow, from board file to results post, lives
in `backend/standings/README.md`. And **`docs/open-items.md` records several
claims that earlier handoffs got confidently wrong**; check it before acting on
anything a previous session asserted.

Delete `docs/open-items.md` when forking — it tracks template maintenance, not
collection content.

## Why this needs a deliberate process, not just "copy and deploy"

A collection folder that started life as a copy of the template usually still
has `git`'s `origin` remote pointing at the **template's own GitHub repo**,
not a repo of its own. If that's left as-is:

- A plain `git push` from inside the collection folder pushes that
  collection's config, CSVs, and generated data straight into the shared
  template repository — corrupting the template for every future collection
  built from it.
- There is no dedicated place for this collection's own deploy history,
  issues, or collaborators.

So step one, always, is separating the collection into its own repo before
doing anything else with git or Netlify.

## Step 1 — Copy the template and name the collection

> **Every command in Steps 1–10 runs in the *new collection's* folder, never in
> `TEMPLATE-OPEN-EDITION` itself.** Step 1 is the exception that creates that
> folder — the `Copy-Item` below runs from anywhere, and everything after it
> runs inside the copy.
>
> This matters most for the `Remove-Item` block. Run it in the template by
> mistake and you delete `backend/.env`, `backend/.env.admin` and
> `frontend/.env` — gitignored files holding a treasury address, a deployer key
> and RPC settings, which are in no commit and cannot be restored with
> `git checkout`.

### Copy with `.git`, not without

Copy the whole `TEMPLATE-OPEN-EDITION` folder, keeping `.git`. That is the
choice this guide assumes, and it is worth understanding why before you make
it, because it is hard to reverse:

- **With `.git`** — the copy shares history with the template. `origin` still
  points at the template's repo, which Steps 2–4 exist to fix. In exchange,
  Step 5 can diff any file against the **fork point** to tell customization
  apart from drift. That comparison is the only reliable way to pull in later
  template features without clobbering your own config.
- **Without `.git`** — a clean slate and `git init`. Simpler on day one, and
  Step 5 becomes impossible: with no shared ancestor there is nothing to diff
  against, so every future template upgrade is a manual read of both files.

In PowerShell:

```powershell
Copy-Item -Recurse C:\Users\User\Desktop\TEMPLATE-OPEN-EDITION `
                   C:\Users\User\Desktop\my-collection
cd C:\Users\User\Desktop\my-collection
```

### Delete what should not have come along

A folder copy carries things a `git clone` would not. **Confirm you are in the
new folder first** — `pwd` should show `my-collection`, not
`TEMPLATE-OPEN-EDITION`:

```powershell
Remove-Item -Recurse -Force node_modules,backend\node_modules,frontend\node_modules,dist -EA SilentlyContinue
Remove-Item -Force backend\.env,backend\.env.admin,frontend\.env -EA SilentlyContinue
Remove-Item -Recurse -Force backend\logs,.netlify -EA SilentlyContinue
Remove-Item -Force backend\deploy-state.json,backend\registry.json -EA SilentlyContinue
```

`node_modules` matters more than it looks: the template's copy was built
against this machine's Node, and reinstalling per project is cheaper than
debugging a stale native binary later. The `.env` files hold live secrets that
belong to the template, not to you.

### `deployment.json` is the trap

**This file is tracked, and it names an on-chain asset that is not yours.**

```json
{
  "assetAddress": "GSy11Cj6N8TtA5EeWYs7pUtAx3weXtxdBH6GLQJCyrK6",
  "treasury": "7XJJvj5N4aBMNyX9g5NZqSEzi9vY6vYxWydezMZvC4n9",
  ...
}
```

Left in place, the new collection appears to already have a deployed collection
asset — the template's. Nothing errors; it simply points at the wrong thing.
Delete `assetAddress` and `createdAt`, set `treasury` to your own wallet, and
keep `rpc` pointing at the proxy (Step 7).

### Where the name actually lives

There is no single rename. The collection's identity appears in seven places,
and the first four are files:

| Where | Field | Ships as |
|---|---|---|
| `template-version.json` | `collectionName` | `Template Open Edition` |
| `backend/config.json` | `collectionSlug` | `your-collection-slug` |
| `backend/master.csv` | `collectionSlug`, `collectionName` | `sample-collection`, `Sample Collection` |
| `backend/standings/_input/import-config.json` | `collectionTitle`, `seasonId`, `rulesetPrefix` | `CHANGE ME` (only if you publish rankings) |

The remaining three are the folder name, the GitHub repo (Step 4) and the
Netlify site (Step 8).

**`collectionName` is the one with a deadline.** It is also written on-chain by
`scripts/deployCoreAsset.ts`, and an on-chain asset name cannot be changed
after minting. Step 6 covers it in full — but set it now, while you are already
editing identity, rather than discovering it after a mint.

Verify with:

```powershell
git grep -n "Template Open Edition"
git grep -n "sample-collection"
git grep -n "CHANGE ME"
```

### Replace the sample content

Five generated artifacts are tracked and will otherwise ship as your site's
data: `frontend/public/` holds `registry.json`, `campaigns.json`,
`content-registry.json`, `standings.json` and `methodology.json`. Don't delete
them — replace the *sources* and re-run the generators:

- `backend/master.csv` — the `sample-collection` row
- `backend/campaigns.csv` — the `sample-campaign-001` row
- `backend/textcards.csv` — six sample cards
- `backend/standings/EXAMPLE-participants-accuracy.json` — delete it
- `docs/open-items.md` — delete it; it tracks template maintenance

Then continue to Step 2.

## Step 2 — Check whether the collection folder is already a separate repo

From inside the collection's folder in PowerShell:

```powershell
git remote -v
```

If this shows the template's own repo URL (e.g.
`https://github.com/<org>/template-open-edition.git`) rather than a repo
named for this collection, proceed to Step 3. If it already points at a
dedicated repo for this collection, skip to Step 5.

## Step 3 — Checkpoint the collection's current state

Before touching the remote, commit whatever customization already exists
locally (config, CSVs, any partially-integrated features) so nothing is at
risk during the repo split:

```powershell
git add -A
git commit -m "Checkpoint: collection config before separating from template repo"
```

If `git add`/`git commit` fails with something like:

```
fatal: Unable to create '...\.git\index.lock': File exists.
```

that's a stale lock file, not a real conflict (confirm no other git process
is actually running, e.g. via Task Manager, then):

```powershell
Remove-Item .git\index.lock -Force
```

and retry the add/commit.

## Step 4 — Create a dedicated GitHub repo and repoint origin

1. Go to `github.com/new`, name the repo after this collection, and leave it
   **fully empty** — no README, `.gitignore`, or license template, since
   you're pushing existing history into it.
2. Repoint the local repo's `origin` and push:

```powershell
git remote set-url origin https://github.com/<your-org>/<collection-repo>.git
git push -u origin main
```

This pushes the collection's full existing history (including whatever
commits it shares with the template up to the fork point) into its own,
independent repo. From this point on, `git push` from this folder only ever
affects this collection's own repo.

## Step 5 — Pull in newer template features, without losing customization

If the template has gained features since this collection's copy was made
(new content systems, security hardening, new minting logic, etc.), those
need to be merged in deliberately, not blindly overwritten — the collection
almost certainly has its own customized `config.json`, `master.csv`, branded
`index.html`, and similar files that must not be clobbered.

The reliable way to do this:

1. Identify the commit both repos share as a common ancestor (the fork
   point) — usually the collection's oldest/earliest commit if it was cloned
   directly from the template.
2. For each file that might have diverged, compare the collection's current
   version against that same file **at the fork-point commit**, ignoring
   line-ending and blank-line noise:

   ```powershell
   git diff --ignore-space-at-eol -w <fork-point-commit> -- path/to/file
   ```

   - If this shows **no differences**, the file hasn't been customized —
     it's safe to replace wholesale with the template's newer version.
   - If it shows real differences, the file has been customized and needs a
     manual/hand merge: take the template's new pieces (new functions, new
     imports, new config keys) and layer them into the collection's existing
     customized version, rather than overwriting it outright.
3. Backend scripts in particular (`deploy-candy-machine.js`,
   `deploy-collection.js`, `preflight.js`, `upload-images.js`,
   `upload-metadata.js`, and similar) are usually generic tooling, not
   collection-specific — if a collection's copy has drifted from the
   template's latest version, it's almost always safe to take the template's
   version wholesale, since these scripts don't normally carry
   collection-specific data (that lives in `config.json`/`master.csv`
   instead).
4. Frontend files that render collection-specific UI (`index.html`,
   `ui.engine.ts`, `state.ts`, `types.ts`, `adapter.ts`, `main.ts`) need the
   comparison-against-fork-point check above — a collection that's already
   had one feature (e.g. holder campaigns) wired in will differ from the
   template's pre-that-feature baseline in exactly the ways that feature
   added, and a later feature (e.g. Text Cards) needs to layer on top of
   that, not replace it.
5. Delete `docs/open-items.md` if it came across. That file is the template's
   own maintenance backlog, not collection content — the same rule as the
   example standings board below.
6. Newer template features also arrive as **whole directories that an older
   collection simply doesn't have** — currently `backend/standings/`,
   `backend/methodology/`, and the scripts that serve them
   (`import-ranked-boards.js`, `import-community-boards.js`,
   `generate-standings-cards.js`, `generate-methodology.js`). There is
   nothing to merge for these: copy the directory across, then delete the
   template's sample data (see the Rankings section below). A file-by-file
   diff won't surface them, so check for missing directories explicitly
   rather than relying on the diff loop above.

## Step 6 — Set the collection's display name (do this before minting)

`template-version.json` carries the collection's human-readable name:

```json
{
  "templateName": "TEMPLATE-OPEN-EDITION",
  "version": "1.0.0",
  "collectionName": "Template Open Edition"
}
```

`collectionName` is the single source for three separate things:

- the browser tab title and the on-page `<h1>` (injected into
  `frontend/index.html` at build time by a Vite `transformIndexHtml` plugin),
  and
- the **name written on-chain** by `scripts/deployCoreAsset.ts` when the
  collection asset is minted.

**Change it before you mint.** A Netlify title is a one-line fix at any time;
an on-chain asset name is not renameable after the fact. A collection minted
while this still says "Template Open Edition" carries that name permanently.

Grep for any lingering hardcoded name before minting:

```powershell
git grep -n "Template Open Edition"
```

The only hit should be `template-version.json` itself.

## Step 7 — Point the RPC at the proxy, not at a keyed endpoint

**Never commit a keyed RPC URL.** A URL of the form
`https://mainnet.helius-rpc.com/?api-key=<key>` is a live credential, and a
public collection repo puts it in front of anyone. Frontend builds make this
worse: Vite bakes `VITE_*` values into the shipped bundle, so a keyed URL in
the frontend env is readable by every visitor even if the repo is private.

The collection therefore talks to a **Cloudflare Worker proxy** that holds
the Helius key server-side. The Worker source lives in its own repo (a copy
of `helius-labs/helius-rpc-proxy`); the working checkout for these
collections is `C:\Users\User\Desktop\rpc-proxy`.

### Deploying or redeploying the Worker

```powershell
npx wrangler deploy src/index.ts   # or: npm run deploy
```

### The two Worker variables

| Variable | Required | Notes |
|---|---|---|
| `HELIUS_API_KEY` | yes | The real Helius key. Set it as an **encrypted** variable so it's hidden from the dashboard, the API, and logs. Without it the Worker returns `500 Missing HELIUS_API_KEY`. |
| `CORS_ALLOW_ORIGIN` | no | Comma-separated list of allowed origins. **If unset, the Worker answers `Access-Control-Allow-Origin: *`** — any site on the internet can route Solana RPC through your key's quota. |

Set them under **Workers & Pages → your worker → Settings → Variables**, or
with `npx wrangler secret put HELIUS_API_KEY`.

### The CORS gotcha worth understanding before you set it

The Worker's logic is all-or-nothing per request: if `CORS_ALLOW_ORIGIN` is
set and the incoming `Origin` **isn't** on the list, it returns no
`Access-Control-Allow-Origin` header at all — and the browser blocks the
call. There is no partial credit. So the list must contain *every* origin
that legitimately calls the proxy:

- the production site — `https://<your-site>.netlify.app` (and any custom
  domain)
- local dev — `http://localhost:5173`

Netlify **deploy previews and branch deploys get generated subdomains**
(`deploy-preview-12--your-site.netlify.app`), which can't be enumerated in
advance. If you rely on previews for testing, either accept that RPC calls
fail there, or leave the variable unset and rely on the Helius-side IP
allow-list instead. Decide deliberately; don't discover it mid-review.

### Where the proxy URL goes

Set the Worker URL (no key, no query string) in each place the collection
reads an RPC endpoint:

- `deployment.json` → `rpc`
- `backend/config.json` → `rpc`
- `frontend/.env` → `VITE_SOLANA_RPC_URL` (and the matching Netlify
  environment variable — see Step 9)
- `backend/.env` → `SOLANA_RPC_URL`, `VITE_SOLANA_RPC_URL`

### Rotating a leaked key

1. Delete the exposed key in the Helius dashboard **first** — that's what
   actually stops the bleeding. Scrubbing the repo does not.
2. Create a replacement key and update `HELIUS_API_KEY` on the Worker.
   Cloudflare rolls out a new version on save; the collection needs no
   redeploy, because the collection never held the key.
3. Confirm the repo is clean at the current tip:

   ```powershell
   git grep -n "api-key="
   ```

   Remember that a key committed at any point remains in git history even
   after it's removed from the working tree — which is exactly why step 1 is
   deletion at the provider, not a rewrite.

## Step 8 — Create a dedicated Netlify site

Netlify terminology: the dashboard's top-level entity is now called a
**Project** (previously "Site") — look for **"Add new project"**, not "Add
new site."

1. Log into Netlify with the account that should permanently own this
   collection's infrastructure. Logging in via "Continue with GitHub" using
   the same GitHub account that owns the collection's repo is simplest.
2. **Add new project → Import an existing project → GitHub** → select this
   collection's repo.
   - If the repo doesn't appear in the list, Netlify's GitHub App access is
     probably scoped to "only selected repositories" and doesn't include
     this one yet. Fix at `github.com/settings/installations` → find
     **Netlify** → **Configure** → add the repo under "Repository access" →
     **Save**. Then retry the import.
3. Confirm build settings match `netlify.toml`:
   - Base directory: `frontend`
   - Build command: `npm run build`
   - Publish directory: `../dist`
4. **Before the first successful full deploy**, add environment variables
   (see Step 9 — this is the step most likely to be missed).
5. Deploy.

### Renaming the site

Project configuration → General → Project details → **Change site name**.
The subdomain namespace (`<name>.netlify.app`) is shared across all Netlify
users — if your preferred name is taken, you'll need a variant.

### If the deployed site returns 401 / requires login

Newer Netlify projects can default to restricted visibility. Check:
**Project configuration → General → Project visibility**, and set both
**Production visibility** and **Deploy Preview visibility** to **Public** if
you want the site reachable without a Netlify login.

## Step 9 — Environment variables (the step most likely to break a first deploy)

`.env` files are gitignored by design (they hold live secrets like RPC API
keys) — which means **none of a collection's local `.env` values are
automatically present on Netlify.** They must be added manually:

**Project configuration → Environment variables**, matching whatever keys
exist in `frontend/.env` locally, at minimum:

- `VITE_SOLANA_RPC_URL` — the **Worker proxy URL** from Step 7, never a keyed
  Helius URL. Vite inlines this into the public bundle at build time.
- `VITE_REGISTRY_URL` — set this to `/registry.json`. Unlike
  `VITE_CAMPAIGNS_URL` and `VITE_CONTENT_REGISTRY_URL`, this one has **no
  fallback default in code** — if it's missing, the deployed app tries to
  fetch a URL literally named `/undefined`, which 404s and silently breaks
  the whole collections/drops display. This is the single most common cause
  of "the site loads but shows nothing."
- `VITE_SOLANA_RPC_URL_DEVNET`, `VITE_CAMPAIGNS_URL`,
  `VITE_CONTENT_REGISTRY_URL` if set locally.

Environment variable changes only take effect on a **new build** (Vite bakes
them into the bundle at build time, not read at runtime) — after adding or
changing one, trigger a fresh deploy: **Deploys tab → Trigger deploy →
Deploy site.**

## Step 10 — Verify the live deploy

Don't just eyeball the homepage — check the actual data endpoints directly,
since a broken fetch can fail silently behind a normal-looking page:

```
https://<your-site>.netlify.app/registry.json
https://<your-site>.netlify.app/campaigns.json
https://<your-site>.netlify.app/content-registry.json
https://<your-site>.netlify.app/standings.json
https://<your-site>.netlify.app/methodology.json
```

A 404 on `campaigns.json`, `content-registry.json`, `standings.json` or
`methodology.json` is *normal* if that collection has no campaigns, text
cards, or published boards yet (all are handled as an expected empty state,
not an error, in the frontend code). A 404 on `registry.json`, or a request
to a literal `/undefined` URL, means something is actually broken — almost
always the missing `VITE_REGISTRY_URL` environment variable from Step 9.

Also check the browser console (F12 → Console) on the live site for any
`Failed to load resource` lines and cross-reference them against the
environment variables above. A CORS error naming the Worker URL points at
`CORS_ALLOW_ORIGIN` (Step 7), not at Netlify.

## Ongoing content workflow — Text Cards

Once the site is live, publishing simple content (News/Update/Announcement/
Analysis cards) is a repeatable loop, not a one-time setup. The whole lifecycle
is four steps: **write the row, compose the post, publish the card, link the
post back.**

### Step A — Write the row

Append to `backend/textcards.csv`. Sixteen columns, in this order:

```
textCardId,category,headline,subheadline,content,publishedDate,updatedDate,
status,expiresAt,tags,featured,priority,author,image,imageAlt,postUrl
```

| Column | Required | Notes |
|---|---|---|
| `textCardId` | yes | Unique, and **never reused** once assigned. Duplicates are a hard error. |
| `category` | yes | `NEWS`, `UPDATE`, `ANNOUNCEMENT` or `ANALYSIS`. The structured categories are refused here — see below. |
| `headline` | yes | |
| `subheadline` | no | |
| `content` | yes | The body prose. |
| `publishedDate` | yes | ISO 8601. A future date means the card is written now and appears later. |
| `updatedDate` | no | Defaults to `publishedDate`. When it differs, the card shows *Updated …*. |
| `status` | yes | `DRAFT`, `SCHEDULED`, `ACTIVE`, `INACTIVE`, `EXPIRED`, `ARCHIVED`. Only `ACTIVE` renders. |
| `expiresAt` | no | ISO 8601. Hides the card afterwards — it enforces nothing else. |
| `tags` | no | Pipe-delimited (`a\|b\|c`), not comma — same convention as `master.csv`'s `attributes`. |
| `featured` | no | `TRUE`/`FALSE`. Sorts first. |
| `priority` | no | Integer, descending. Breaks ties among featured. |
| `author` | no | |
| `image` | no | `http(s)://` or a site-relative `/path`. Any other scheme is refused. |
| `imageAlt` | **yes, if `image` is set** | Refused without it. An image with no alt text is invisible to a screen reader, and backfilling alt across a grown archive is far harder than writing one line now. |
| `postUrl` | no | Where this card was announced. `https://` only. Added in Step D. |

Optional columns still need their commas, so a minimal row ends in a run of
them. Two things that will bite:

- **A comma anywhere in your text requires the whole field in double quotes.**
  That is why `tags` uses a pipe separator instead.
- **Structured categories** — `RANKING`, `LEADERBOARD`, `SCOREBOARD`,
  `STANDINGS`, `STATS` — are rejected from this CSV, with an error saying why:
  their content is an entries array, not prose. Those come from board files.
  See the Rankings section below.

Display order is `featured` (true first), then `priority` (descending), then
`publishedDate` (most recent first) — see `frontend/src/ui.engine.ts`'s
`getVisibleTextCards()` for the exact sort/filter logic.

### Step B — Compose the post

```powershell
node backend/scripts/compose-post.js announcement --id ANNOUNCEMENT-012
```

**This reads `textcards.csv` directly, not the registry** — so it works before
the generator has run, and iterating on wording touches no published file. Add
`--site https://your-site.netlify.app` while `collectionExternalUrl` in
`master.csv` is still the template's placeholder.

The post prints to stdout and a character report to stderr, so
`… > post.txt` gives a clean file with the budget breakdown still on screen.
Over budget, it prints the post, names the line to cut, and writes nothing.

`compose-post.js` refuses rather than guessing — unknown placeholder, empty
field, unmatched `--id` — and always names the valid options. It never posts;
you paste. See `docs/post-generator-spec.md` for the full contract and the
other five templates.

### Step C — Publish the card

```powershell
node backend/scripts/generate-content-registry.js
git add backend/textcards.csv backend/content-registry.json frontend/public/content-registry.json
git commit -m "Add <description of new card(s)>"
git push origin main
```

The generator writes `backend/content-registry.json` and copies it to
`frontend/public/content-registry.json` automatically. Netlify rebuilds on
push; hard-refresh the live site once the build finishes, or you will be served
the cached bundle and conclude nothing happened.

### Step D — Link the post back

Post to X yourself, copy the tweet URL, and paste it into that row's `postUrl`.
Re-run the generator and push again.

The card now renders a *Discussion →* link in its meta row, so a reader can
join the conversation instead of hunting your timeline — and months later you
can find the thread without searching. This second push is the step most likely
to be skipped, and it is the entire reason the column exists.

### Who owns which card in `content-registry.json`

Two generators share the file and never overlap. Getting this wrong is how
work gets silently overwritten, so it's worth stating precisely:

| Card kind | Id prefix | Source of truth | Written by |
|---|---|---|---|
| Simple (NEWS, UPDATE, ANNOUNCEMENT, ANALYSIS) | any | `backend/textcards.csv` | `generate-content-registry.js` |
| Generated standings | `STANDINGS-` | a board file in `backend/standings/` | `generate-standings-cards.js` |
| Hand-authored persistent (RANKING, LEADERBOARD, SCOREBOARD, STATS) | anything *except* `STANDINGS-` | the registry entry itself | nobody — edit by hand |

`generate-content-registry.js` leaves every persistent card alone.
`generate-standings-cards.js` rewrites every card whose id starts with
`STANDINGS-` and carries everything else through untouched.

So: **a `STANDINGS-` card must never be hand-edited** — the next generator
run will overwrite it. Edit the board file in `backend/standings/` and re-run
the script instead. A persistent card with any other id is yours to edit
directly and no script will touch it.

Every card keeps a permanent `textCardId` that is never reused once assigned,
even if the card is later retired — set `status` to
`INACTIVE`/`EXPIRED`/`ARCHIVED` instead of deleting the entry.

## Ongoing content workflow — Rankings and standings

Ranked boards are a separate pipeline with its own source of truth. The full
reference is `backend/standings/README.md`; this is the operational summary.

**The shape of it:** one JSON file per board in `backend/standings/`. A
generator projects each board into a `STANDINGS-` card for the news grid's
RANKINGS tab, and publishes the complete board — every entry, not just the
rows the card shows — to `frontend/public/standings.json`.

Boards are produced by importers rather than written by hand:

```powershell
# Participant leaderboards from a Ledger export (one export → four boards)
node backend/scripts/import-community-boards.js

# Everything else — games, racing, poker, player stats, category rankings
node backend/scripts/import-ranked-boards.js

# Project the boards into cards + publish standings.json
node backend/scripts/generate-standings-cards.js
```

Inputs live in `backend/standings/_input/`:

- `import-config.json` — importer settings, including `columnMap` when the
  source app's column labels differ from the logical names (Sports Ledger
  writes `FinalPoints`/`SkillEdge`/`Predictions`; Entertainment Ledger writes
  `Points`/`Edge`/`Resolved`).
- `rulesets.json` — the ruleset changelog; each board stamps the
  `rulesetVersion` that produced it.
- `boards.json` plus dated exports in `_input/boards/` — the declarations
  `import-ranked-boards.js` reads. **Neither exists in a fresh template
  checkout**; create them when you add your first ranked board (the README
  has a worked example).

**Rules that will stop a run, by design:**

- A board with `capture.complete: false` is a hard failure. A response that
  was never captured is indistinguishable from a participant who didn't play,
  so a partial round is refused rather than published as final. Pass
  `--allow-incomplete` to publish it `INACTIVE` for review instead.
- Entries must already be in rank order. Ranks that jump around usually mean
  the list was re-sorted by score after ranking, which quietly breaks the
  movement column.
- Nothing here scores anything. Ranks, scores and movement arrive settled
  from the source; projection is formatting, not arithmetic. That's what
  makes a published card reproducible from its board file.

**Two behaviours that look like bugs but aren't:** a `cardLimit` of 10 can
publish 12 rows, because the slice extends through the whole tie group at the
cut line rather than cutting a tie in half; and deleting a board file marks
its card `ARCHIVED` on the next run rather than removing it, so history
survives.

**For a new collection:** delete `backend/standings/EXAMPLE-participants-accuracy.json`.
It exists only to prove the pipeline end to end, and it publishes a visible
card tagged `example` if left in place.

## Ongoing content workflow — the Methodology page

The Rankings link in the site's top navigation points at `#methodology`, and
that page is generated:

```powershell
node backend/scripts/generate-methodology.js
```

It merges authored prose from `backend/methodology/methodology.json` with
facts **derived from the standings themselves** — which boards exist, which
ruleset produced each one, which export files they were built from, the
current eligibility minimum, and the full ruleset changelog — and writes
`frontend/public/methodology.json`.

The split is the point: edit `methodology.json` when the *explanation*
changes, and let everything that could go stale be re-derived. A methodology
page quietly describing last month's rules is worse than no methodology page,
because readers trust it.

Practical consequence: **re-run this after any standings change.** The
ordinary sequence for a new round is import → generate standings cards →
generate methodology → commit → push.

## Known non-issues (safe to ignore)

- **`warning: ... LF will be replaced by CRLF ...`** during `git add` — this
  is Windows Git normalizing line endings on checkout. Cosmetic, not an
  error. (If you see a diff of thousands of untouched lines instead, that's a
  different problem: the collection is missing the `.gitattributes` file the
  template carries. Copy it over and renormalize.)
- **A 401 fetching your own site from an automated tool** while it loads
  fine in an actual browser (including incognito) — some hosts apply
  different handling to non-browser/automated requests at the edge. Trust
  real browser verification over an automated fetch in this case.
- **A 404 on `standings.json` or `methodology.json`** before you've published
  any boards. Expected empty state, handled in the frontend.
