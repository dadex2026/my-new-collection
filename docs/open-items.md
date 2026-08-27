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

**Anchored at:** `template-open-edition` @ `fc337a7`. The anchor names the last
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
| `backend/scripts/` inventory | **21 scripts plus `lib/csv.js`**, as of the round wrappers. A handoff brief counted four. The ones it missed included the entire standings system. Count before trusting an inherited inventory. |
| Round orchestration | **`publish-round.js`** runs import → standings → methodology, `stdio: "inherit"` so every log line prints, stops at the first non-zero exit; `--from standings` skips the import for hand-written one-off contests and unknown flags pass through. **`set-post-url.js <cardId> <url>`** writes `postUrl` into `textcards.csv` and re-runs the registry generator — it rewrites one line, not the file. Both are pure orchestration with no per-collection config, so they copy wholesale into a collection. The RFC4180 parser now lives once in `backend/scripts/lib/csv.js`. |
| Post generator | **Built.** `compose-post.js` + `backend/post-templates/*.txt`, six templates. Sourcing rule: authored content from CSV, generated content from the published artifact. Budget is `--limit` (default 280), not a config key. `{siteUrl}` derives from `master.csv`'s `collectionExternalUrl`; `{methodologyUrl}` appends `/#methodology`. Contract in `docs/post-generator-spec.md`. |
| Character counting | **Weighted, matching X** — URLs cost 23 regardless of length, emoji and CJK cost 2. Shipped counting code points, which over-counted every post carrying a link and under-counted emoji; caught in review by the parallel session, fixed. Don't "simplify" it back to `[...text].length`. |
| Per-prediction evidence | **Present on community boards.** `attachEvidence()` in `import-community-boards.js` hangs `evidence: { predictions[], counting, excluded, pending, late }` off every entry, and each prediction carries `date`, `url`, `late`, `pending`, `counts`, `settledBy`, `excludedReason`. It reaches `frontend/public/standings.json`. A revision of this file's README section claimed the board format had no per-entry timestamp and that a disputed late entry could not be settled from published data — **both wrong**, corrected after a session with Ledger access pushed back. Absent on `import-ranked-boards.js` boards and hand-written ones. |
| `standings.json` entry shape | Entries are **raw** board entries — `movement` is `{state, delta}`, not the formatted string a card carries; they include `entityId` and `previousRank` which are not in `columns`; and a ranked export's extra columns (`Winner`, `Spread`, `Total`) sit in a nested `fields` object that has to be flattened. `compose-post.js` mirrors `formatMovement()` to match the site; keep the two in step. |
| Contest reward mechanism | **Current mechanism: ordinary holder campaigns** — hold this, buy that at a discount, using `campaigns.csv` and `deploy-campaign.js` exactly as they stand. Two alternatives were worked through and are **not being built now**: an `allowList` merkle guard (needs a two-transaction claim in the frontend) and a winner-badge collection (needs no new code, but adds a mint per winner and a collection-scoping decision). The `allowList` route stays open for later — see the holding table. |
| `backend/standings/_input/` | Holds `import-config.json` and `rulesets.json` only. No `boards.json`, no `boards/` directory — those are created when the first ranked board is declared. |

---

### Session 2026-08-27 — checked directly, this session

| Claim | Status |
|---|---|
| `docs/generation-prompts.md` | **Exists**, 2,625 lines. 32 prompts in eight families (A collections, B campaigns, C content, D rankings, E contests, F posts, G dashboards, H maintenance), plus front matter: three-kinds-of-prompt, five-part output contract, filling rules, *What must already exist*, *What the output is*, and a worked-headers appendix. Every prompt's closing line spells the contract out in full, because a pasted block travels without this file's definitions. |
| Output contract | **Five parts**, not four: runbook, disposition table, refusals, verification, **Missing inputs**. Part 5 makes the model report any value it needed and was not given — nine header fields have been added that way. Do not "simplify" it back to a file manifest. |
| `Dashboards/new-dashboard-build-guide.md` | **Exists**, 26 KB. Architecture recommendations distilled from all five tools; driven by prompt **G5**. `Dashboards/README.md` and `new-collection-deployment-guide.md` both point at the library. |
| `my-new-collection` — standings pipeline | **Absent.** No `backend/standings/`, no `backend/methodology/`, no `backend/post-templates/`. Missing `compose-post.js`, `set-post-url.js`, `publish-round.js`, `import-ranked-boards.js`, `import-community-boards.js`, `generate-standings-cards.js`, `generate-methodology.js`. **No contest or post prompt can run against it until A4 copies these across.** |
| `my-new-collection/backend/textcards.csv` | **13 columns**, not 16 — missing `image`, `imageAlt`, `postUrl`. `set-post-url.js` has nothing to write into. |
| `my-new-collection/backend/master.csv` | **21 columns**, not the template's 16 — adds `collectionAddress`, `network`, `candyMachineAddress`, `candyGuardAddress`, `treasury`. Holds **three** `collectionSlug` values (`test-mech-a`, `test-mech-b`, `test-mech`) across four rows. `collectionExternalUrl` and `sellerFeeBasisPoints` empty on all four, so every `compose-post.js` run needs `--site`. |
| `my-new-collection/backend/config.json` | `"collectionSlug": "test-mech-b"` against `"network": "mainnet"`. **Resolved:** deliberate. This is the mainnet reference, and `Mechanics Test B` is the drop whose candy machine is deployed. Not a leftover. |
| `my-new-collection` — `TEST-001` means two things | It is a **`textCardId`** in `textcards.csv` and a **`dropItemId`** in `master.csv`, for unrelated records. Since `--id` addresses a different column per template (F1: "there is no universal id field"), `compose-post.js announcement --id TEST-001` and `mint-live --id TEST-001` would resolve to different records without either erroring. **Latent, not live** — that collection has no `compose-post.js`, and item 8 closed the retrofit — but worth knowing before anyone runs a post command there. |
| `preflight.js` vs `my-new-collection` | **Fails checks 1 and 2** — slug prefix `test-` and all four `dropItemId`s prefixed `TEST-` are reserved test prefixes. |
| `backend/scripts/get-holders.js` and `scripts/audit-production.ps1` | **Empty files, 0 bytes.** No runbook step may depend on either. |
| Index Portfolio history | **One recorded close per index** (21–22 Aug), across all six registry entries. **Nothing can resolve at any window length** until `daily_update.py` has run enough days to price both ends. `IDX_30D_0923` is written and carries a `post_url` but cannot settle. |
| Index Portfolio `TECH_CONST_0923` | Title `US Tech 10 — Best Constituent, September` — `title_short` cuts at the em dash to **`US Tech 10`**, indistinguishable from the index contest in any generated post. Rename before a launch post. |
| Downloads folder | **Cleaned.** 3.8 GB → 44 MB; 3.76 GB of re-downloadable installers deleted. 123 project files moved to `Downloads\_superseded\` in six folders (`docs-duplicates`, `docs-unfiled`, `source`, `data`, `images`, `archives`). Personal and financial files untouched by request. |
| `Downloads\_superseded\docs-unfiled\DATA_FLOWS.md` | **Unique — no copy anywhere on Desktop.** A finished Index Portfolio document (map, per-pipeline prompt→CSV→output samples, settings, commands, "two things not built"). Worth filing into `Dashboards\Index Portfolio\`. |
| Three locked files in Downloads | `campaigns_2.csv`, `textcards_2.csv`, `community-leaderboard-2026-08-20.csv` — copied to `_superseded\data\`, originals could not be unlinked (Windows lock). Safe to delete manually. |
| A `.reg` file in Downloads | `01_OnlyFans_Full_DB_drive.google.com<~120 spaces>%r%r…(23).reg`, 1.2 MB. Filename padded to disguise the extension. **Not opened. Not a project file. Scan or delete.** |
| `eligibility` on the ranked import path | **Discarded.** `import-ranked-boards.js` writes `eligibility: null` unconditionally — a `minEntries` or `note` declared in `boards.json` never reaches the board and never publishes. `import-community-boards.js` builds a real eligibility object; the ranked importer does not. E1 said the note "publishes: put the tiebreak there", and `standings/README.md` said the same in two places. **All three corrected**; the tiebreak now goes in the announcement `content`. One-line fix below (#19). |
| `minPicks` on the ranked import path | **Never read.** `import-ranked-boards.js` reads exactly four config keys — `seasonId`, `cardLimit`, `rulesetPrefix`, `rulesetVersion`. `minPicks` is a community-importer threshold. E1 carried a paragraph on what it does to a recurring contest; that paragraph described the wrong importer and is **corrected**. Underlying reason: **a ranked board is the latest round, not a cumulative season table** — entries come from the last export's rows, with earlier exports replayed only for movement. There is no per-handle count of settled predictions for a provisional threshold to act on. |
| `capture.complete` on the ranked import path | **Forced `true`**, with `method: "ledger-export"`. Not authorable from the declaration, and `publish-round.js` runs import → cards back to back so there is no seam to change it in. The refusal itself is real and lives in `generate-standings-cards.js` (`--allow-incomplete` publishes INACTIVE) — it just cannot be reached from this path. E1 and `standings/README.md` **corrected**; **E3 and E6 still carry the unqualified claim** and should be fixed when #20 is decided. |
| E1's header | **Gained five fields** via H1, from the Missing inputs its own worked run reported: `COLLECTION TITLE`, `RULESET PREFIX`, `EXPORT FILE PREFIX`, `EXPORT HEADER ROW`, `ANNOUNCEMENT CARD ID`. `MIN PICKS` kept but re-marked *community boards only*. Both places H1 step 5 names were updated — *What must already exist* (E1 is no longer "nothing": a new series needs a sample export to read `EXPORT HEADER ROW` from) and the worked header near the top of the file. `publishedDate` and card `priority`/`featured` were reported too and deliberately **not** added — a sensible default is an honest answer there, where an invented ruleset prefix is not. |
| `docs/worked-run-e1.md` | **New**, ~19 KB. One complete E1 run: filled header plus all five parts, every refusal quoted from the script that raises it. Registered per H1's document branch — closing-table row in `generation-prompts.md`, pointer back from `new-collection-deployment-guide.md`, cited in E1's Reference block, and *What a good run gives back* now points at it. Verified against `f6a8eee`. |
| Which collection is the test rig | **`TEMPLATE-TEST-LEDGER`**, decided after inspecting both. It is devnet, placeholder config, never deployed, and its name cannot be mistaken for production. `my-new-collection` is the **mainnet reference** — kept live for real deployed candy machines and a working claim UI, never a launch candidate given its permanent `Mechanics Test A`–`D` on-chain names. An earlier revision of this table, one commit back, said `my-new-collection` was the rig; superseded. Both registry rows updated. |
| `baseline.js` | **Already in the template**, and in `TEMPLATE-TEST-LEDGER`, **byte-identical** (15,129 bytes). A session claim that it was unique to the fork and should be promoted was **wrong** — built from a remembered inventory rather than an `ls`, the exact error the `backend/scripts/` row above warns about. There is no fork-to-template promotion to do, and no evidence for a prompt covering that direction. The fork's `backend/baseline/` (manifest plus seven frozen artifacts) is captured *data* and correctly absent from the template. |
| `TEMPLATE-TEST-LEDGER` script gap | **Behind, not diverged.** 18 scripts against the template's 21 plus `lib/`. Missing exactly `compose-post.js`, `publish-round.js`, `set-post-url.js` and `lib/csv.js` — the post generator and round orchestration. Nothing in the fork is ahead of the template. |
| `TEMPLATE-TEST-LEDGER` remote | **Resolved this session.** Was: no remote at all, branch `master`, never pushed, four modified files uncommitted — two rounds of standings and the captured baseline on one disk. Now `dadex2026/template-test-ledger` (private), branch renamed `master` → `main`, full history pushed at `e0a95c4` (299 objects). Verified: `baseline.js`, `backend/baseline/` and all four community boards are in the pushed tree. |
| Card deletion is **inert** | `generate-content-registry.js` seeds its map from the existing `content-registry.json` and overlays the CSV rows — it only ever adds or updates. **Removing a row from `textcards.csv` leaves the card live.** `isTextCardVisible()` drops anything whose `status` is not `ACTIVE`, so status is the only lever short of hand-editing the JSON. True of the template and of the fork; checked in both. C1 and the deployment guide previously stated the convention without the mechanism — **both corrected**. |
| `my-new-collection/backend/campaigns.csv` | **Four malformed rows.** Rows 5–8 carry **14 fields against a 21-column header**, with literal `NEEDS_VALIDATION` in `price` and `allocation` (`campaign-eligibility-001-reward-001` and `-002` among them). Rows 1–4 are well-formed and reference three **deployed mainnet** campaign candy machines. |
| `my-new-collection` deployment reality | Four drops on **mainnet** with permanent Irys/Arweave URIs, three deployed campaign candy machines, treasury set, `config.json` active slug `test-mech-b`. Nothing here can be un-minted, which is why the collection's identity is fixed regardless of any content cleanup. |

---

## Open — cheap, no design decisions

| # | Item | Repo | Notes |
|---|---|---|---|
| 1 | `project-files.txt` — regenerate or delete | template + TEMPLATE-TEST-LEDGER | UTF-16 PowerShell dump, 45 lines. Lists `backend/deploy.js`, `mint.js`, `server.js`, `state.json`, `registry-manager.js`, `frontend/src/ui.ts`, `render.ts` — none of which exist. Missing all of `backend/scripts/`, `backend/standings/`, `backend/methodology/`, `docs/`. |
| 2 | `backend/scripts/get-holders.js` — 0 bytes | both | Every sibling script is 7–33 KB. Fill or delete. Produces a holder snapshot — **one reward input among several, not a blocker.** An earlier revision of this file called it the thing standing between a contest and paying its winners; that was wrong. Rewards are expected to be opt-in discounted mints and similar, for which rewards are ordinary holder campaigns — see the verified-state table. |
| 3 | `scripts/audit-production.ps1` — 0 bytes | template | Dated June 28; likely forgotten rather than deferred. |
| 4 | `frontend/src/styles.css` — delete | template | Dead file, see verified state. Leaving it invites someone to edit it and wonder why nothing changes. |
| 5 | `scripts/utils/` — empty directory | template | Cosmetic. |
| 6 | `backend/_to_delete/` — two staging CSVs | my-new-collection | Needs a manual `rm`; the device bridge cannot delete files on Windows. |
| 19 | Carry `eligibility` through the ranked importer | template | One line in `import-ranked-boards.js`: `eligibility: null` → `eligibility: decl.eligibility \|\| null`. Restores what `boards.json` declares and what E1 and the README originally promised. Small, but it is the importer — wants a round re-imported to confirm nothing downstream depends on the null, which **A4 on a real collection unblocks**. Docs now describe current behaviour, so this is an improvement, not a correction. |

## Open — real work, clear scope

| # | Item | Repo | Notes |
|---|---|---|---|
| 7 | Decide whether the mainnet reference should be publicly reachable | my-new-collection | **Rewritten twice; this is the settled version.** There is no real launch here, so the `TEST-` cards block nothing — but the site is public and serves "Pagination test card 7" under an on-chain name of `Mechanics Test B`. Either restrict the Netlify project's visibility, or accept it deliberately. **If you do hide the cards:** deleting CSV rows is inert — set `status` to `INACTIVE` and re-run the generator. |
| 8 | ~~Retrofit standings into `my-new-collection`~~ | my-new-collection | **Closed — not needed.** It is the mainnet reference, not the rig, so it does not need to track the template. It stays as deployed: 13-column `textcards.csv`, no standings pipeline, no post generator. If that ever changes, the work is A4 plus a 13→16 column migration of `textcards.csv`, without which `set-post-url.js` refuses with *"This collection predates the postUrl field."* |
| 9 | Realign the fork — **A4, and the rehearsal for every future A4** | TEMPLATE-TEST-LEDGER | **Now the primary maintenance item**, because a rig only earns its keep while it is current. Behind on `ui.engine.ts`, `index.html`, `vite.config.ts`, plus `generate-methodology.js` and `import-ranked-boards.js` from `c484644`, and the full-width card change from `4d71e86`. Also missing `compose-post.js`, `publish-round.js`, `set-post-url.js` and `lib/csv.js` outright. Unblocked — the checkout is now backed (`dadex2026/template-test-ledger`). Its `backend/baseline/` is the natural regression check for the merge: capture before, verify after, and any diff is the merge changing history. |
| 10 | Surface what `standings.json` already holds | template | Two layers of one reachability gap; neither is missing data. **(a)** A card renders `Showing top 10 of 200` and that note is not a link — a reader wanting rank 47 must find the methodology page, locate one paragraph and read raw JSON. One anchor at the point the shortfall is admitted: no loader, no types, no env var, and the cheapest thing on this list. **(b)** Community board entries carry full per-prediction `evidence` — timestamp, source URL, `late` and `counts` flags — and nothing on the site surfaces it, so a rank is visible with no way to check its timing. |
| 11 | `IntersectionObserver` for nav active state | template | `.section-nav-link.active` is styled and now visually distinct (lighter purple + pale ring), but nothing sets the class. |
| 12 | Document the remaining post sources in the deployment guide | template | The Text Cards section now covers the full card lifecycle — column reference, compose step, `postUrl` round-trip. Still undocumented there: composing from `master.csv` (mint) and `campaigns.csv`, which have no equivalent walkthrough. Also outstanding: the Python twin per `docs/post-generator-spec.md`, and a run against a genuine Ledger export rather than a board hand-built to the documented shape. |
| 13 | `test-collection-01` — regenerate or retire | test-collection-01 | Predates the `collectionName` change, so it no longer matches the template. Decide which. |
| 20 | Make an incomplete capture expressible on the ranked path | template | Today `import-ranked-boards.js` forces `capture.complete: true`, so a contest round known to be missing entrants publishes as final. **Not a one-line fix:** a declaration-level `capture.complete: false` would stick every round until someone remembered to clear it, which is a worse trap than the present gap. Likely shape is a per-export marker — a sidecar or a column — so the assertion travels with the round it describes. Decide the shape first. When it lands, fix E3 and E6, which still state the claim unqualified. |

## Holding — deliberately

| # | Item | Unblocked by |
|---|---|---|
| 14 | Group RANKINGS by `track` | Real Sports data. The right grouping (by track, by entity type, by sport) depends on what Sports actually produces. **Implementation trap:** the tab filters on `persistent === true`, so hand-authored cards carry no `track` and need a defined bucket or they vanish. |
| 15 | Board index | Genuinely large board counts. When built, source it from `content-registry.json` — `relationships` already carries everything needed and rank-1 is `content.entries[0]` — **not** from `standings.json`, which the frontend has no loader for. |
| 16 | Search over structured ranking entries | Nothing blocking; a deliberate v1 cut. Search currently matches prose fields only, not a card's Handle/Points/Rank rows. |

| 17 | `allowList` guard for reward claims | A reward that has to be gated on something with no on-chain representation, or holder campaigns proving too coarse. Kept open deliberately, not rejected. Shape if built: merkle root of eligible wallets as a guard on a campaign candy machine, stacking with `assetGate` since guards are conjunctive. Backend cost is small — read a list, compute a root, set the guard in `deploy-campaign.js`. The cost is frontend: `allowList` needs a `route` pre-validation call before `mintV1`, making a claim two transactions with a partial-failure state to design around. |

## Blocked on information

| # | Item |
|---|---|
| 18 | Two Sports-specific facts that shape the standings process — referenced in a session handoff that was truncated before stating them. They may move items 14 and 15. |

---

## Working notes for future sessions

- **Cloud sessions have no push rights.** The pattern that works: request device-bridge access to the real checkout, stage files in, edit, `SendUserFile` → `device_commit_files` back out, then hand the user exact `git add/commit/push` commands. Verify the push actually happened — this is where work has been lost three times.
- **Never run git write operations through `device_bash`.** It leaves a `.git/index.lock` that cannot be deleted from that side. Read-only inspection is fine with `git --no-optional-locks`.
- **Builds don't work over the bridge** — Linux VM against Windows-installed `node_modules`, so native binaries (Rollup, esbuild) fail. `tsc --noEmit --lib es2020,dom` is a usable substitute for files with only local imports.
- **`npm` needs `--prefix frontend`** or a `cd` into `frontend/`; there is no root `package.json`.
- **More than one session may share a checkout.** Push before handing off, and check `git log` against `origin/main` before assuming the tree matches what a handoff describes.
