# Spinning Up a New Collection from TEMPLATE-OPEN-EDITION

This is the operational playbook for taking a copy of `TEMPLATE-OPEN-EDITION`,
turning it into a standalone, deployable NFT collection project, and getting
it live on its own Netlify site. It was written from the process used to
stand up `my-new-collection`, and applies to any future collection started
the same way (a folder copy of the template, customized with real config).

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

## Step 1 — Check whether the collection folder is already a separate repo

From inside the collection's folder in PowerShell:

```powershell
git remote -v
```

If this shows the template's own repo URL (e.g.
`https://github.com/<org>/template-open-edition.git`) rather than a repo
named for this collection, proceed to Step 2. If it already points at a
dedicated repo for this collection, skip to Step 4.

## Step 2 — Checkpoint the collection's current state

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

## Step 3 — Create a dedicated GitHub repo and repoint origin

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

## Step 4 — Pull in newer template features, without losing customization

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

## Step 5 — Create a dedicated Netlify site

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
   (see Step 6 — this is the step most likely to be missed).
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

## Step 6 — Environment variables (the step most likely to break a first deploy)

`.env` files are gitignored by design (they hold live secrets like RPC API
keys) — which means **none of a collection's local `.env` values are
automatically present on Netlify.** They must be added manually:

**Project configuration → Environment variables**, matching whatever keys
exist in `frontend/.env` locally, at minimum:

- `VITE_SOLANA_RPC_URL`
- `VITE_REGISTRY_URL` — set this to `/registry.json`. If it is missing you get
  a **404 on `/registry/registry.json`**, and the collections/drops display is
  silently empty. This is the single most common cause of "the site loads but
  shows nothing."

  > **Correction, 2026-08-28.** Earlier revisions of this guide said this
  > variable has *no* fallback and that a missing value fetches a URL literally
  > named `/undefined`. Both were wrong. `frontend/src/config.ts:8` reads
  > `import.meta.env.VITE_REGISTRY_URL || "/registry/registry.json"`, and the
  > generator publishes to `frontend/public/registry.json` — there is no
  > `public/registry/` directory, so the fallback resolves to a path that does
  > not exist. The symptom is identical, but if you go looking for `/undefined`
  > in the console you will not find it and will chase the wrong thing.
- `VITE_SOLANA_RPC_URL_DEVNET`, `VITE_CAMPAIGNS_URL`,
  `VITE_CONTENT_REGISTRY_URL` if set locally.

Environment variable changes only take effect on a **new build** (Vite bakes
them into the bundle at build time, not read at runtime) — after adding or
changing one, trigger a fresh deploy: **Deploys tab → Trigger deploy →
Deploy site.**

## Step 7 — Verify the live deploy

Don't just eyeball the homepage — check the actual data endpoints directly,
since a broken fetch can fail silently behind a normal-looking page:

```
https://<your-site>.netlify.app/registry.json
https://<your-site>.netlify.app/campaigns.json
https://<your-site>.netlify.app/content-registry.json
```

A 404 on `campaigns.json` or `content-registry.json` is *normal* if that
collection has no campaigns or text cards published yet (both are handled
as an expected empty state, not an error, in the frontend code). A 404 on
`registry.json` — or on `/registry/registry.json`, which is where the code
falls back when the variable is unset — means something is actually broken,
almost always the missing `VITE_REGISTRY_URL` environment variable from
Step 6.

Also check the browser console (F12 → Console) on the live site for any
`Failed to load resource` lines and cross-reference them against the
environment variables above.

## Ongoing content workflow (Text Cards example)

Once the site is live, publishing new simple content (News/Update/
Announcement/Analysis cards) is a repeatable loop, not a one-time setup:

1. Add a row to `backend/textcards.csv`.
2. Run the generator:
   ```powershell
   node backend/scripts/generate-content-registry.js
   ```
   This writes `backend/content-registry.json` and copies it to
   `frontend/public/content-registry.json` automatically.
3. Commit and push:
   ```powershell
   git add -A
   git commit -m "Add <description of new card(s)>"
   git push origin main
   ```
4. Netlify auto-rebuilds on push; hard-refresh the live site once the build
   finishes to see the new content.

Persistent/structured cards (RANKING, LEADERBOARD, SCOREBOARD, STANDINGS,
STATS categories) are never managed through the CSV — they're hand-edited
directly in `content-registry.json`'s `cards` array and are never touched or
removed by the generator script. Each card has a permanent `textCardId` that
is never reused once assigned, even if the card is later retired — set
`status` to `INACTIVE`/`EXPIRED`/`ARCHIVED` instead of deleting the entry.
Simple cards (NEWS/UPDATE/ANNOUNCEMENT/ANALYSIS) are ordered for display by
`featured` (true first), then `priority` (descending), then `publishedDate`
(most recent first) — see `frontend/src/ui.engine.ts`'s
`getVisibleTextCards()` for the exact sort/filter logic.

## Known non-issues (safe to ignore)

- **`warning: ... LF will be replaced by CRLF ...`** during `git add` — this
  is Windows Git normalizing line endings on checkout. Cosmetic, not an
  error.
- **A 401 fetching your own site from an automated tool** while it loads
  fine in an actual browser (including incognito) — some hosts apply
  different handling to non-browser/automated requests at the edge. Trust
  real browser verification over an automated fetch in this case.

## Maintenance, 2026-08-28

Five things were removed from this repo as dead. Nothing referenced any of them
— they were fork leftovers carried over from the template.

- `scripts/deployCoreAsset.ts` — invoked by nothing: no npm script, no code
  reference, no root `package.json`. It read as though it wrote the collection's
  on-chain name, and three documents in the template repeated that for months.
  The name that actually reaches the chain is `master.csv`'s `collectionName`,
  first matching row (`deploy-collection.js:349`).
- `scripts/audit-production.ps1` — 0 bytes, named like a production check. An
  empty file with that name is worse than no file.
- `frontend/src/styles.css` — not imported anywhere. All real styling is the
  inline `<style>` block in `index.html`.
- `project-files.txt` — a stale directory dump listing files that do not exist.
- `scripts/utils/` — an empty directory, removed with `rmdir`. Git does not track
  empty directories, so nothing in the history records that it is gone; if it
  reappears in a fresh clone, it was never really removed.

`scripts/check-docs.js` was ported from the template at the same time. It fails a
push when a doc in this repo asserts something the code contradicts, and it holds
the four file names above so that a later template merge cannot quietly bring
them back. It is **inert until armed**, once per clone:

    git config core.hooksPath .githooks

Run `node scripts/check-docs.js` by hand at any time — it reports whether the
hook is armed, which the hook itself cannot do.
