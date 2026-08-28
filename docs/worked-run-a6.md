# Worked run — A6, create the Netlify project

**Driven by prompt A6** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and `docs/netlify-connection.md` or
`netlify.toml` disagree, those win.

**Applicable project: `my-new-collection`.** It is already deployed —
`my-new-collection.netlify.app`, with a `.netlify/state.json` holding its `siteId` — so
this run does two things A6's header implies but does not separate: the creation
sequence for a project that has none, and **the verification path for one that already
exists**, which is what you actually need when picking up an inherited collection and
not knowing whether it is linked.

---

## SAMPLE HEADER

### A6 — Create the Netlify project

```
I want to create the Netlify project for a collection.

COLLECTION:     my-new-collection
REPO:           smallen1967/my-new-collection
SITE NAME:      my-new-collection
PUBLIC SITE?:   yes
```

---

## PART 1 — RUNBOOK

### 0. First, check whether it already exists

```powershell
netlify status        # run from inside the collection folder
```

`.netlify/state.json` is the tell:

```json
{ "siteId": "45297865-dc70-4be9-8fc2-2cb5b6804c05" }
```

Present and current → the folder is linked, no `netlify link` needed, and the rest of
this runbook is verification rather than creation. Absent or stale → `netlify link`,
choosing **"Use current git remote"** or searching by site name.

`netlify login` authorizes the CLI against your **account**, once per machine.
`netlify status`, run inside a folder, is what tells you which **site** that folder is
linked to. The two are different questions and the second is the one people get wrong.

### 1. Netlify's current vocabulary

The top-level entity is a **Project**. It is **"Add new project"**, not "Add new
site". The docs, the UI and the CLI have drifted apart on this, and searching the UI
for "site" is how people conclude the button is missing.

### 2. Import from GitHub

Choose the repo `smallen1967/my-new-collection`.

**When the repo does not appear in the list** — the common case, and it looks like a
permissions failure with no message:

```
github.com/settings/installations → Netlify → Configure → add the repo
```

Netlify's GitHub App is scoped per-repository. A repo it has not been granted is
invisible rather than refused.

### 3. Build settings — must match `netlify.toml`

```toml
[build]
  base = "frontend"
  command = "npm run build"
  publish = "../dist"

[build.environment]
  NODE_VERSION = "22"
```

| Field | Value |
|---|---|
| Base directory | `frontend` |
| Build command | `npm run build` |
| Publish directory | `../dist` |

`publish = "../dist"` is relative to the **base**, so the built output lands one level
above `frontend/`. Setting `dist` in the UI instead of `../dist` produces a green build
that publishes nothing.

### 4. Environment variables — **before** the first full deploy

**`VITE_REGISTRY_URL = /registry.json` is the one with no fallback default in code.**
Missing it makes the app fetch a URL **literally named `/undefined`** — the site loads
and shows nothing, with no error that names the cause.

The rest:

| Variable | Value |
|---|---|
| `VITE_SOLANA_RPC_URL` | the **Worker proxy** URL — never a keyed Helius URL |
| `VITE_SOLANA_RPC_URL_DEVNET` | the devnet endpoint |
| `VITE_CAMPAIGNS_URL` | `/campaigns.json` |
| `VITE_CONTENT_REGISTRY_URL` | `/content-registry.json` |

**Never a keyed provider URL in any `VITE_*` value.** Vite bakes them into the shipped
bundle, so a key there is published to every visitor.

### 5. Vite bakes env vars in at build time

Changing a variable does **not** change a deployed site. Every change needs a **fresh
deploy** to take effect. This is the second-commonest false failure here: the variable
is right in the dashboard, the site still behaves as though it is missing, and nothing
in the UI suggests a rebuild is required.

### 6. Project visibility

If the deployed site returns **401**, that is visibility, not a build or code problem.
`PUBLIC SITE?: yes` here, so set the project to public.

---

## PART 2 — DISPOSITION TABLE

| # | File / surface | Path | Disposition | What goes where |
|---|---|---|---|---|
| 1 | Netlify project | Netlify dashboard | **Created** | Named `my-new-collection`; imported from `smallen1967/my-new-collection`. |
| 2 | GitHub App scope | `github.com/settings/installations` | **Edited** if the repo is not listed | Add the repo to Netlify's installation. |
| 3 | Build config | `netlify.toml` | **Read only — already correct** | base `frontend`, command `npm run build`, publish `../dist`, Node 22. |
| 4 | Env vars | Netlify project settings | **Created** | Five values; `VITE_REGISTRY_URL` is the one with no code fallback. |
| 5 | CLI link | `.netlify/state.json` | **Created** by `netlify link`, or already present | Holds `siteId`. Not the same as being logged in. |
| 6 | Site doc | `docs/netlify-connection.md` | **Edited** | Replace the placeholder `<project-name>.netlify.app` with the real site name and live URL. |
| 7 | Deploy | Netlify build | **Generated** | Nothing is published until a build runs *after* the env vars exist. |

---

## PART 3 — REFUSALS

1. **No keyed RPC URL in any `VITE_*` variable** — it ships in the public bundle.
2. **Do not set env vars after the first full deploy and expect them to apply.** Vite
   bakes at build time; redeploy.
3. **Do not set the publish directory to `dist`.** It is `../dist`, relative to the
   base.
4. **Do not read a missing repo in the import list as a Netlify failure** — it is the
   GitHub App's per-repo scope.
5. **Do not treat `netlify login` as linking a folder.** Account and site are separate.
6. **Do not debug a 401 as a build problem.** It is project visibility.

---

## PART 4 — VERIFICATION CHECKLIST

**Before the first deploy**

- [ ] Repo visible in Netlify's import list, or added via GitHub App settings.
- [ ] Base `frontend`, command `npm run build`, publish `../dist` — matching `netlify.toml`.
- [ ] All five env vars set, `VITE_REGISTRY_URL = /registry.json` among them.
- [ ] No `VITE_*` value contains `api-key=`.

**After the deploy**

- [ ] Build succeeded **and** published something — a green build with an empty publish directory is possible.
- [ ] `registry.json` resolves on the live site; no request for `/undefined`.
- [ ] 404s on `campaigns.json`, `content-registry.json`, `standings.json`, `methodology.json` are expected before those features exist.
- [ ] No 401 — or visibility set deliberately.
- [ ] `netlify status` from the folder names the right site.
- [ ] `docs/netlify-connection.md` updated with the real site name, not the placeholder.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `RPC PROXY URL` | Step 4 sets `VITE_SOLANA_RPC_URL` to "the Worker proxy" and A6 never collects it — the same gap A1 had, and the same risk of inheriting the template's Worker by default. |
| `DEVNET RPC URL` | `VITE_SOLANA_RPC_URL_DEVNET` is listed and uncollected. |
| `NETLIFY ACCOUNT` | The "must already exist" table lists a Netlify account; A6 assumes it. |
| `LIVE URL` | Known only after creation, but `docs/netlify-connection.md` must be updated with it, and no step says so. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| A6 cover items | Nothing covers **checking whether the project already exists**. `.netlify/state.json` plus `netlify status` answers it in one command, and picking up an inherited collection is at least as common as creating a new one. |
| A6 cover items | The `publish = "../dist"` value is given but not explained. It is relative to the **base directory**, and setting `dist` produces a green build that publishes nothing — a failure with no error message. |
| A6 cover items | Nothing says to update `docs/netlify-connection.md`, which ships with a `<project-name>.netlify.app` placeholder and is the file someone reads later to find the site. In `my-new-collection` it is correctly filled in; in a fresh copy it is not. |
| A6 header | Collects no `RPC PROXY URL`, though step 5's first variable is exactly that. Same finding as A1. |
