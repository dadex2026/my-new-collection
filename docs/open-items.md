# Open Items

Cross-repo backlog for the TEMPLATE-OPEN-EDITION family. This file exists
because the recurring failure in this project is not bad work — it is finished
work that never lands anywhere durable. Process that lived only in chat had to
be rediscovered twice, and five separate batches of finished work sat unpushed
in a single session. A backlog kept in a session transcript is the same disease
applied to the todo list.

Its second job is to stop a stale claim being repeated. Several entries below
correct something an earlier handoff — or an earlier revision of this file —
asserted confidently and wrongly. Re-verify before quoting any of it.

**Anchored at:** `template-open-edition` @ `d36b6f1`. The anchor names the last
commit whose code was checked, which is never the commit containing this file —
a doc cannot cite itself.

**When forking this template into a new collection: delete this file.** It
tracks template maintenance, not collection content. Same rule as
`backend/standings/EXAMPLE-participants-accuracy.json`.

---

## Verified state (don't re-derive this)

Checked directly against the code, not inherited from a handoff doc. Several of
these correct claims that earlier handoffs got wrong.

| Claim | Status |
|---|---|
| `CORS_ALLOW_ORIGIN` on the Worker | **Set**, not `*`. Three origins: both Netlify sites plus `http://localhost:5173`. Active version `92ad0df7`. Earlier handoffs said this was unset — they were wrong; it was added days before. |
| `backend/standings/` board count | **One**, and it's `EXAMPLE-participants-accuracy.json`. Any advice premised on multiple boards (ordering, grouping, crowding) is a no-op here until real boards land. |
| `PAGE_SIZE` in `ui.engine.ts` | **3**, and deliberate — commit `aec3139` set it so each page is exactly one full grid row, paired with `.textcards-grid { repeat(3, 1fr) }`. Raising it breaks that property. |
| RANKINGS tab filter | `c.persistent === true` — shows *all* persistent cards, generated and hand-authored alike. |
| `track` / `entityType` on cards | Present twice: flattened into `tags`, and structured in `relationships` alongside `boardId`, `entryCount`, `shownCount`, `seasonId`, `rulesetVersion`. Grouping or a board index needs **no pipeline change**. |
| `standings.json` in the frontend | **Linked, not loaded.** The methodology page links it as a raw file (`737f8dd`), so it is discoverable — but `adapter.ts` has no `loadStandings` beside its registry/campaigns/textcards/methodology loaders, and nothing on the page renders its contents. Anything that displays a board beyond its card needs a fetch, types, state and a `VITE_STANDINGS_URL` with a `/standings.json` fallback, matching the existing pattern. An earlier revision of this file said "never fetched, zero references" — that was true before `737f8dd` landed mid-session and was repeated without rechecking. |
| `frontend/src/styles.css` | **Dead.** Not imported anywhere. All real styling is the inline `<style>` block in `index.html`. |
| Persistent card width | Cards with `persistent: true` get `.textcard-wide` (`grid-column: 1 / -1`) and span the full row — `4d71e86`. Keyed on `persistent`, the same field the RANKINGS tab filters on, so generated and hand-authored cards behave alike. Side effect: the ALL tab is now mixed-width and a wide card ends its row early. |
| `rankings.csv` | **Does not exist and should not.** The template has exactly three CSVs: `campaigns.csv`, `master.csv`, `textcards.csv`. Rankings are generated, not authored — they enter via `backend/standings/*.json` and are published to `frontend/public/standings.json`. A handoff brief proposed sourcing ranking posts from a `rankings.csv`; that file was from another project. |
| `backend/scripts/` inventory | **19 scripts** as of the post generator. A handoff brief counted four. The ones it missed included the entire standings system. Count before trusting an inherited inventory. |
| Post generator | **Built.** `compose-post.js` + `backend/post-templates/*.txt`, six templates. Sourcing rule: authored content from CSV, generated content from the published artifact. Budget is `--limit` (default 280), not a config key. `{siteUrl}` derives from `master.csv`'s `collectionExternalUrl`; `{methodologyUrl}` appends `/#methodology`. Contract in `docs/post-generator-spec.md`. |
| Character counting | **Weighted, matching X** — URLs cost 23 regardless of length, emoji and CJK cost 2. Shipped counting code points, which over-counted every post carrying a link and under-counted emoji; caught in review by the parallel session, fixed. Don't "simplify" it back to `[...text].length`. |
| `standings.json` entry shape | Entries are **raw** board entries — `movement` is `{state, delta}`, not the formatted string a card carries; they include `entityId` and `previousRank` which are not in `columns`; and a ranked export's extra columns (`Winner`, `Spread`, `Total`) sit in a nested `fields` object that has to be flattened. `compose-post.js` mirrors `formatMovement()` to match the site; keep the two in step. |
| `backend/standings/_input/` | Holds `import-config.json` and `rulesets.json` only. No `boards.json`, no `boards/` directory — those are created when the first ranked board is declared. |

---

## Open — cheap, no design decisions

| # | Item | Repo | Notes |
|---|---|---|---|
| 1 | `project-files.txt` — regenerate or delete | template | UTF-16 PowerShell dump, 45 lines. Lists `backend/deploy.js`, `mint.js`, `server.js`, `state.json`, `registry-manager.js`, `frontend/src/ui.ts`, `render.ts` — none of which exist. Missing all of `backend/scripts/`, `backend/standings/`, `backend/methodology/`, `docs/`. |
| 2 | `backend/scripts/get-holders.js` — 0 bytes | both | Every sibling script is 7–33 KB. Fill or delete. Needed before any real holder snapshot. |
| 3 | `scripts/audit-production.ps1` — 0 bytes | template | Dated June 28; likely forgotten rather than deferred. |
| 4 | `frontend/src/styles.css` — delete | template | Dead file, see verified state. Leaving it invites someone to edit it and wonder why nothing changes. |
| 5 | `scripts/utils/` — empty directory | template | Cosmetic. |
| 6 | `backend/_to_delete/` — two staging CSVs | my-new-collection | Needs a manual `rm`; the device bridge cannot delete files on Windows. |

## Open — real work, clear scope

| # | Item | Repo | Notes |
|---|---|---|---|
| 7 | Remove placeholder content | my-new-collection | TEST-001, TEST-002–009 text cards, fake pagination-test campaigns. The site is **public and live** carrying these. Blocks any real launch. |
| 8 | Retrofit standings + nav/search | my-new-collection | Both were built in the template only and do not propagate automatically. Retrofit into a live deployment, not an inherited upgrade. |
| 9 | Realign the fork | TEMPLATE-TEST-LEDGER | Now behind on `ui.engine.ts`, `index.html`, `vite.config.ts`, plus `generate-methodology.js` and `import-ranked-boards.js` from `c484644`, and the full-width card change from `4d71e86`. |
| 10 | Link the truncation note to `/standings.json` | template | A card renders `Showing top 10 of 200` and that note is not a link, so a reader wanting rank 47 must find the methodology page, locate one paragraph, and read raw JSON. One anchor at the exact point the shortfall is admitted — no loader, no types, no env var. The cheapest thing on this list, and it closes most of the gap between "you can verify this" and actually being able to. |
| 11 | `IntersectionObserver` for nav active state | template | `.section-nav-link.active` is styled and now visually distinct (lighter purple + pale ring), but nothing sets the class. |
| 12 | Document the remaining post sources in the deployment guide | template | The Text Cards section now covers the full card lifecycle — column reference, compose step, `postUrl` round-trip. Still undocumented there: composing from `master.csv` (mint) and `campaigns.csv`, which have no equivalent walkthrough. Also outstanding: the Python twin per `docs/post-generator-spec.md`, and a run against a genuine Ledger export rather than a board hand-built to the documented shape. |
| 13 | `test-collection-01` — regenerate or retire | test-collection-01 | Predates the `collectionName` change, so it no longer matches the template. Decide which. |

## Holding — deliberately

| # | Item | Unblocked by |
|---|---|---|
| 14 | Group RANKINGS by `track` | Real Sports data. The right grouping (by track, by entity type, by sport) depends on what Sports actually produces. **Implementation trap:** the tab filters on `persistent === true`, so hand-authored cards carry no `track` and need a defined bucket or they vanish. |
| 15 | Board index | Genuinely large board counts. When built, source it from `content-registry.json` — `relationships` already carries everything needed and rank-1 is `content.entries[0]` — **not** from `standings.json`, which the frontend has no loader for. |
| 16 | Search over structured ranking entries | Nothing blocking; a deliberate v1 cut. Search currently matches prose fields only, not a card's Handle/Points/Rank rows. |

## Blocked on information

| # | Item |
|---|---|
| 17 | Two Sports-specific facts that shape the standings process — referenced in a session handoff that was truncated before stating them. They may move items 14 and 15. |

---

## Working notes for future sessions

- **Cloud sessions have no push rights.** The pattern that works: request device-bridge access to the real checkout, stage files in, edit, `SendUserFile` → `device_commit_files` back out, then hand the user exact `git add/commit/push` commands. Verify the push actually happened — this is where work has been lost three times.
- **Never run git write operations through `device_bash`.** It leaves a `.git/index.lock` that cannot be deleted from that side. Read-only inspection is fine with `git --no-optional-locks`.
- **Builds don't work over the bridge** — Linux VM against Windows-installed `node_modules`, so native binaries (Rollup, esbuild) fail. `tsc --noEmit --lib es2020,dom` is a usable substitute for files with only local imports.
- **`npm` needs `--prefix frontend`** or a `cd` into `frontend/`; there is no root `package.json`.
- **More than one session may share a checkout.** Push before handing off, and check `git log` against `origin/main` before assuming the tree matches what a handoff describes.
