# Open Items

Cross-repo backlog for the TEMPLATE-OPEN-EDITION family. This file exists
because the recurring failure in this project is not bad work — it is finished
work that never lands anywhere durable. Process that lived only in chat had to
be rediscovered twice; commits have sat unpushed three times. A backlog kept in
a session transcript is the same disease applied to the todo list.

**Anchored at:** `template-open-edition` @ `ad212ea`.

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
| `standings.json` in the frontend | **Never loaded.** Zero references in `frontend/src` or `index.html`. Anything sourced from it needs a new fetch, types, and probably a new `VITE_*` var. |
| `frontend/src/styles.css` | **Dead.** Not imported anywhere. All real styling is the inline `<style>` block in `index.html`. |
| `backend/standings/_input/` | Holds `import-config.json` and `rulesets.json` only. No `boards.json`, no `boards/` directory — those are created when the first ranked board is declared. |

---

## Open — cheap, no design decisions

| # | Item | Repo | Notes |
|---|---|---|---|
| 1 | Full-width standings cards (`grid-column: 1 / -1`) | template | Best value-per-risk on this list. CSS only, independent of board count. A 5–6 column table currently renders in a third of the content width. Preferred over raising `PAGE_SIZE` — see verified state. |
| 2 | `project-files.txt` — regenerate or delete | template | UTF-16 PowerShell dump, 45 lines. Lists `backend/deploy.js`, `mint.js`, `server.js`, `state.json`, `registry-manager.js`, `frontend/src/ui.ts`, `render.ts` — none of which exist. Missing all of `backend/scripts/`, `backend/standings/`, `backend/methodology/`, `docs/`. |
| 3 | `backend/scripts/get-holders.js` — 0 bytes | both | Every sibling script is 7–33 KB. Fill or delete. Needed before any real holder snapshot. |
| 4 | `scripts/audit-production.ps1` — 0 bytes | template | Dated June 28; likely forgotten rather than deferred. |
| 5 | `frontend/src/styles.css` — delete | template | Dead file, see verified state. Leaving it invites someone to edit it and wonder why nothing changes. |
| 6 | `scripts/utils/` — empty directory | template | Cosmetic. |
| 7 | `backend/_to_delete/` — two staging CSVs | my-new-collection | Needs a manual `rm`; the device bridge cannot delete files on Windows. |

## Open — real work, clear scope

| # | Item | Repo | Notes |
|---|---|---|---|
| 8 | Remove placeholder content | my-new-collection | TEST-001, TEST-002–009 text cards, fake pagination-test campaigns. The site is **public and live** carrying these. Blocks any real launch. |
| 9 | Retrofit standings + nav/search | my-new-collection | Both were built in the template only and do not propagate automatically. Retrofit into a live deployment, not an inherited upgrade. |
| 10 | Realign the fork | TEMPLATE-TEST-LEDGER | Now behind on `ui.engine.ts`, `index.html`, `vite.config.ts`, plus `generate-methodology.js` and `import-ranked-boards.js` from `c484644`. |
| 11 | `IntersectionObserver` for nav active state | template | `.section-nav-link.active` is styled and now visually distinct (lighter purple + pale ring), but nothing sets the class. |
| 12 | `test-collection-01` — regenerate or retire | test-collection-01 | Predates the `collectionName` change, so it no longer matches the template. Decide which. |

## Holding — deliberately

| # | Item | Unblocked by |
|---|---|---|
| 13 | Group RANKINGS by `track` | Real Sports data. The right grouping (by track, by entity type, by sport) depends on what Sports actually produces. **Implementation trap:** the tab filters on `persistent === true`, so hand-authored cards carry no `track` and need a defined bucket or they vanish. |
| 14 | Board index | Genuinely large board counts. When built, source it from `content-registry.json` — `relationships` already carries everything needed and rank-1 is `content.entries[0]` — **not** from `standings.json`, which the frontend has no loader for. |
| 15 | Search over structured ranking entries | Nothing blocking; a deliberate v1 cut. Search currently matches prose fields only, not a card's Handle/Points/Rank rows. |

## Blocked on information

| # | Item |
|---|---|
| 16 | Two Sports-specific facts that shape the standings process — referenced in a session handoff that was truncated before stating them. They may move items 13 and 14. |

---

## Working notes for future sessions

- **Cloud sessions have no push rights.** The pattern that works: request device-bridge access to the real checkout, stage files in, edit, `SendUserFile` → `device_commit_files` back out, then hand the user exact `git add/commit/push` commands. Verify the push actually happened — this is where work has been lost three times.
- **Never run git write operations through `device_bash`.** It leaves a `.git/index.lock` that cannot be deleted from that side. Read-only inspection is fine with `git --no-optional-locks`.
- **Builds don't work over the bridge** — Linux VM against Windows-installed `node_modules`, so native binaries (Rollup, esbuild) fail. `tsc --noEmit --lib es2020,dom` is a usable substitute for files with only local imports.
- **`npm` needs `--prefix frontend`** or a `cd` into `frontend/`; there is no root `package.json`.
- **More than one session may share a checkout.** Push before handing off, and check `git log` against `origin/main` before assuming the tree matches what a handoff describes.
