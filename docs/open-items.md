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
| Fork history — the two forks differ | **`my-new-collection` shares the template's history** (same root commit `09827e2`); **`TEMPLATE-TEST-LEDGER` does not** (root `3c8bec0 "Fork of TEMPLATE-OPEN-EDITION@1.0.0"`, 21 commits, no shared hashes). A1's runbook preserves history — it copies `.git` and re-points the remote — so A1-forked collections have a fork point. The rig was made by discarding history instead. **A4's central instruction, "finding the fork-point commit the two repos share", therefore has no answer for the rig.** See #22. |
| Substitute for a missing fork point | Diff the two working trees directly (`diff -rq`, both clean at HEAD), then ask the fork's *own* history whether it ever touched each differing file: `git log <root>..HEAD -- <path>`. Zero commits means the difference is pure template drift and the file is safe to take wholesale. Caveat that cost time: a change made **in** the root commit does not appear in `<root>..HEAD`, so a zero count means "unchanged since fork", not "identical to the template at fork". `.gitignore` is exactly that case. |
| `TEMPLATE-TEST-LEDGER` vs template — actual gap | **One coherent feature plus the post generator**, not the scattered list item 9 described. Every code difference is card images + the `postUrl` back-link + full-width persistent cards: `generate-content-registry.js` (`normalizeImage`/`normalizePostUrl`), `types.ts` (`media` typed vs `Record<string, unknown>`), `ui.engine.ts` (`renderTextCardImage`/`renderTextCardPostLink`), `index.html` (`.textcard-image`, `.textcard-post-link`, `.textcard-wide`). The rig carries the empty placeholders `media: {}` and `relationships: {}` but no implementation, and its `textcards.csv` is **13 columns**. `vite.config.ts`, `generate-methodology.js` and `import-ranked-boards.js` are **identical** — item 9 listed them and is stale; the rig's two "Sync…" commits caught them up. |
| `docs/worked-run-d1.md` | **New.** D1 run end to end against the rig. Registered per H1's document branch: closing-table row, deployment-guide pointer, cited in D1's Reference block. D1 gained **`EXPORT FILE PREFIX`** and **`ID COLUMN`** from its own Missing inputs — `filePrefix` is one of the seven *required* declaration fields and step 4 writes `<filePrefix>-YYYY-MM-DD.csv`, yet the header never collected it; `idColumn` carries the prompt's loudest warning and had no field either. Appendix header updated. Verified against `c3f40cc`. |
| `TEMPLATE-TEST-LEDGER` `rulesetVersion` | Set to `"entertainment-ledger-v1.2"`. That key is the **fallback for unstamped exports**, and `import-config.json`'s own comment says leave it `null` once every export carries a stamp. Entertainment stamps `AppVersion`. Left as a real version it silently backstops a stamp failure with a two-versions-stale ruleset instead of refusing — the opposite of what the refusal is for. See #24. |
| Item 9 — **done**, and the substitute method works | A4 completed against the rig without a fork point. Wholesale-replaced `generate-content-registry.js`, `types.ts`, `ui.engine.ts`, `index.html` — safe because each had **zero rig-only lines** (the only rig-only content anywhere was the superseded `media: Record<string, unknown>` and the bare `media: {}` / `relationships: {}` placeholders). Added `compose-post.js`, `set-post-url.js`, `publish-round.js`, `scripts/lib/`, `post-templates/` and three docs. Migrated `textcards.csv` 13 → 16. Withheld `open-items.md`, `.netlify`, `.gitignore`, `deployment.json`, `template-version.json` and every generated JSON. |
| `baseline.js` — **first real use** | Verified green **before** the merge (7 artifacts from 9 unchanged inputs) and **green again after**, which is the correct result: the feature touches `content-registry.json`, which is not a baselined artifact. A failure would have meant the merge reached standings. Also confirmed `VOLATILE_FIELDS` works as designed — commit `e0a95c4` changed one line in each of `standings.json` and `methodology.json` (the `generatedAt` stamps) and the harness correctly ignored both. Post-merge: generator reported 6 updated / 5 persistent preserved / 11 total; `vite build` passed in 12.6s with only pre-existing warnings. |
| `TEMPLATE-TEST-LEDGER` remote | **Resolved this session.** Was: no remote at all, branch `master`, never pushed, four modified files uncommitted — two rounds of standings and the captured baseline on one disk. Now `dadex2026/template-test-ledger` (private), branch renamed `master` → `main`, full history pushed at `e0a95c4` (299 objects). Verified: `baseline.js`, `backend/baseline/` and all four community boards are in the pushed tree. |
| Card deletion is **inert** | `generate-content-registry.js` seeds its map from the existing `content-registry.json` and overlays the CSV rows — it only ever adds or updates. **Removing a row from `textcards.csv` leaves the card live.** `isTextCardVisible()` drops anything whose `status` is not `ACTIVE`, so status is the only lever short of hand-editing the JSON. True of the template and of the fork; checked in both. C1 and the deployment guide previously stated the convention without the mechanism — **both corrected**. |
| `my-new-collection/backend/campaigns.csv` | **Four malformed rows.** Rows 5–8 carry **14 fields against a 21-column header**, with literal `NEEDS_VALIDATION` in `price` and `allocation` (`campaign-eligibility-001-reward-001` and `-002` among them). Rows 1–4 are well-formed and reference three **deployed mainnet** campaign candy machines. |
| `my-new-collection` deployment reality | Four drops on **mainnet** with permanent Irys/Arweave URIs, three deployed campaign candy machines, treasury set, `config.json` active slug `test-mech-b`. Nothing here can be un-minted, which is why the collection's identity is fixed regardless of any content cleanup. |

---

## Findings from the worked runs

`docs/worked-run-*.md` — one complete run per prompt — each ends with an
**Appendix** of findings about the prompt it works: fields the header does not
collect, behaviour the cover items do not name, and instructions that turned out
to be wrong. Those appendices are **evidence, not backlog**: they record what a
run against real files found, at the date it ran.

**This file owns the backlog.** When a finding is worth acting on, it becomes an
entry below and the appendix stays as the citation. Findings already applied to
the prompts are not carried here — the prompt is the record of its own text.

Still open at the end of the review pass:

| Item | Where |
|---|---|
| `backend/standings/README.md` differs between the template (29 KB) and the test rig (6.7 KB) — same opening, divergent bodies. Decide whether the rig's is an older partial copy to replace or a deliberately rig-specific file. | worked-run-d1, worked-run-g4 |
| ~~A3 has no worked run~~ — written 2026-08-28 as `docs/worked-run-a3.md`, against the devnet rig and **not executed**. | worked-run-a3 |
| `rulesetPrefix` in `my-new-collection` is still `CHANGE ME`. It depends on which Ledger will feed that collection, and once rounds publish under a ruleset id, changing it orphans them. Set it when D1 declares the first board there. | worked-run-d1 |
| `preflight.js` runs **sixteen** checks; A3 said ten. Corrected in the prompt — but worth confirming no other doc quotes the old count. | worked-run-a3 |
| `my-new-collection` is missing nine scripts, `post-templates/`, `backend/standings/` and `backend/methodology/`, and its `textcards.csv` is on the 13-column header. Until A4 runs there, C1 step E, D-series, E-series and G4 cannot. | worked-run-a4 |
| That collection's live site is stale: 1 published card against 9 CSV rows, 3 published campaigns against 8 deployed. | worked-run-a7 |

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
| 22 | A4 assumes a fork point that not every fork has | template | A4's method opens with *"finding the fork-point commit the two repos share"* and the per-file `git diff <fork-point>`. `TEMPLATE-TEST-LEDGER` shares no commit with the template, so that instruction is unrunnable against the project's own test rig. A4 needs a branch for unrelated histories — the substitute recorded in the verified-state table above, including the caveat that a zero commit count means "unchanged since fork" rather than "identical to the template". **The substitute has now been validated end to end** by item 9 — cross-tree diff, per-file "has the fork touched it since root", wholesale replacement where the rig-only line count is zero, and the baseline as the regression gate. Write A4's new branch from that. H1 step 5 applies: check *What must already exist* (A4's row says "The fork-point commit, found with `git log`") and the worked-headers appendix. |
| 23 | Sync `new-collection-deployment-guide.md` into the rig | TEMPLATE-TEST-LEDGER | Left out of item 9 deliberately, to keep that merge to the scope that was measured. Differs by 297 lines; the rig's 36 own lines are an older *Step 1–4* structure the template has since restructured — stale, not customization. One-line `cp` plus a commit. |
| 24 | Clear `rulesetVersion` to `null` on the rig | TEMPLATE-TEST-LEDGER | One key in `backend/standings/_input/import-config.json`, currently `"entertainment-ledger-v1.2"`. Every export now carries `AppVersion`, so the fallback should be off — otherwise a stamp failure imports silently under a stale ruleset rather than refusing. Re-run `publish-round.js` after, and expect the baseline to stay green (no board output changes). |
| 19 | Carry `eligibility` through the ranked importer | template | One line in `import-ranked-boards.js`: `eligibility: null` → `eligibility: decl.eligibility \|\| null`. Restores what `boards.json` declares and what E1 and the README originally promised. Small, but it is the importer — wants a round re-imported to confirm nothing downstream depends on the null, which **A4 on a real collection unblocks**. Docs now describe current behaviour, so this is an improvement, not a correction. |

## Open — real work, clear scope

| # | Item | Repo | Notes |
|---|---|---|---|
| 7 | Decide whether the mainnet reference should be publicly reachable | my-new-collection | **Rewritten twice; this is the settled version.** There is no real launch here, so the `TEST-` cards block nothing — but the site is public and serves "Pagination test card 7" under an on-chain name of `Mechanics Test B`. Either restrict the Netlify project's visibility, or accept it deliberately. **If you do hide the cards:** deleting CSV rows is inert — set `status` to `INACTIVE` and re-run the generator. |
| 8 | ~~Retrofit standings into `my-new-collection`~~ | my-new-collection | **Closed — not needed.** It is the mainnet reference, not the rig, so it does not need to track the template. It stays as deployed: 13-column `textcards.csv`, no standings pipeline, no post generator. If that ever changes, the work is A4 plus a 13→16 column migration of `textcards.csv`, without which `set-post-url.js` refuses with *"This collection predates the postUrl field."* |
| 10 | Surface what `standings.json` already holds | template | Two layers of one reachability gap; neither is missing data. **(a)** A card renders `Showing top 10 of 200` and that note is not a link — a reader wanting rank 47 must find the methodology page, locate one paragraph and read raw JSON. One anchor at the point the shortfall is admitted: no loader, no types, no env var, and the cheapest thing on this list. **(b)** Community board entries carry full per-prediction `evidence` — timestamp, source URL, `late` and `counts` flags — and nothing on the site surfaces it, so a rank is visible with no way to check its timing. |
| 11 | `IntersectionObserver` for nav active state | template | `.section-nav-link.active` is styled and now visually distinct (lighter purple + pale ring), but nothing sets the class. |
| 12 | Document the remaining post sources in the deployment guide | template | The Text Cards section now covers the full card lifecycle — column reference, compose step, `postUrl` round-trip. Still undocumented there: composing from `master.csv` (mint) and `campaigns.csv`, which have no equivalent walkthrough. Also outstanding: the Python twin per `docs/post-generator-spec.md`, and a run against a genuine Ledger export rather than a board hand-built to the documented shape. |
| 25 | No declared board on the rig sets `idColumn` | TEMPLATE-TEST-LEDGER | `music-ranking`, `movies-ranking` and `tv-ranking` all match on `Artist`/`Actor` **display names**. Exactly the failure D1 warns about: a rename reads as one entity leaving and another arriving, resetting a standing with no error and no trace. **Latent** — none has ever imported — so it is free to fix now and expensive after the first real round. Needs to know whether the Entertainment Ledger exports a stable id column; if not, that is a Ledger change, not a declaration change. |
| 26 | The ranked import path has never run on the rig | TEMPLATE-TEST-LEDGER | `_input/boards/` is empty; no `music-ranking.json`, `movies-ranking.json` or `tv-ranking.json` exists. The importer logs *"No exports matching prefix … — board not published this run"* and moves on, so nothing is broken — but only the **community** path has real coverage. For a rig whose job is exercising template features before they reach live collections, that is the gap worth closing: one dated export through `publish-round.js`, then re-capture the baseline (expect exit 2, stale, which is correct). |
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
