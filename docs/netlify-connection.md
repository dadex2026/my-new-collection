# Netlify Connection

How to log into and confirm the Netlify project tied to **this** folder, plus
the naming convention to use when this doc is sitting inside a freshly
copied, not-yet-deployed collection.

## This project's Netlify site

- **Site name:** `my-new-collection.netlify.app`
- **Live URL:** https://my-new-collection.netlify.app
- This folder is already linked to that site via the Netlify CLI (see
  `.netlify/state.json`) — `netlify status` run from inside this folder
  confirms it directly, no `netlify link` needed unless that file is
  missing or stale.

## Option A — Netlify CLI (local scripting/deploys)

```powershell
npm install -g netlify-cli   # skip if already installed globally
netlify login                # opens a browser tab to authorize the CLI
netlify status                # shows which account + which site THIS folder is linked to
```

`netlify login` authorizes the CLI against your Netlify **account**, not any
one project — you only need to run it once per machine (or after the token
expires/is revoked). `netlify status`, run from inside a given project
folder, is what tells you which *site* that folder is currently linked to.

If a folder has no `.netlify/state.json` (e.g. this is a brand-new copy that
was never linked), link it explicitly:

```powershell
netlify link
```

and choose "Use current git remote," or search by site name, when prompted.

## Option B — Netlify Dashboard (web)

1. Go to `app.netlify.com`.
2. Log in with **"Continue with GitHub,"** using the same GitHub account
   that owns this project's repo (per Step 5 of
   `docs/new-collection-deployment-guide.md`).
3. From the Sites list, select this project by the site name above.

## Placeholder convention for a freshly copied, undeployed project

If you're reading this inside a project folder that was just copied from
`TEMPLATE-OPEN-EDITION` (or from this collection) and hasn't gone through
Step 5 of `docs/new-collection-deployment-guide.md` yet (no dedicated
Netlify site created), the "This project's Netlify site" section above still
reflects the source it was copied from and is not yet accurate for this
collection. Update it to:

```
<project-name>.netlify.app (placeholder — update once deployed)
```

`.netlify/state.json` won't exist yet either in that state — `netlify link`
will fail with nothing to link to until the site is actually created.

Once Step 5 is complete and the site has a real name (see that step's
"Renaming the site" section), replace the placeholder line above with the
real site name and URL, then run `netlify link` in this folder to connect
the CLI to it.
