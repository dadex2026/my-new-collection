# Generation Prompts

The AI prompt library for this platform. One block per thing that can be
created — a collection, a drop, a campaign, a text card, a ranked board, an
X contest, a dashboard, a post. Copy a block into a fresh AI chat, fill its
blanks, and it returns a step-by-step runbook naming every file it touches.

**Written generic on purpose.** No prompt names a specific collection or
dashboard in its body; targets come from the registry below and are pasted
into the blanks. When a new collection or dashboard is created, you add a row
to the registry — the prompts themselves do not change. Prompt **H1** is the
one that does that, and it is the last block in this file.

---

## The two rules that govern every prompt

**The AI extracts, drafts and explains. The tools compute, mint and publish.**
No prompt here asks a model to score a contest, rank a board, compute a total,
or decide a winner. Ranks and scores arrive already settled from a Ledger or
from `leaderboard.py`; the projection side of this platform is formatting, not
arithmetic. A model producing dozens of plausible, unchecked numbers is the
failure mode this split exists to prevent. If a prompt ever appears to be
calculating something, that is a bug in the prompt.

**Nothing here posts, mints or pushes on your behalf.** Every prompt stops at
the point where a human reads the output and acts. Six steps in the contest
loop alone carry human judgment and none of them collapse into a command: the
capture decision, the scoring, reading each post before sending it, and both
git pushes.

---

## Three kinds of prompt, and why this file is only one of them

**This file does not replace the `prompts/` folders in the dashboards.** They
are a different layer, they talk to a different reader, and they fail in
different ways. Nothing here supersedes them; two prompts here exist precisely
to serve them.

| | **Extraction prompt** | **Generation prompt** | **System prompt** |
|---|---|---|---|
| Lives in | `Dashboards\<tool>\prompts\` | this file | inside an Evaluator's HTML, plus a portable `.txt` |
| You paste | the prompt **plus raw source** beneath it | the prompt alone | nothing — the tool sends it |
| Returns | data lines in a fixed field order | a runbook for a human | a scored judgment |
| Read by | a parser in the tool | you | the tool, which re-derives the total |
| Verified against | a **build stamp** — `v3.5` | the file layout on disk | the rubric it encodes |
| Changes when | the tool's paste format changes | scripts or conventions change | the rubric changes |
| Fails by | malformed lines the parser rejects | an improvised runbook | a plausible wrong score |

**Extraction prompts turn prose into rows.** Their entire job is reformatting
a messy chart page or X thread into clean lines. They name no file, run no
command and explain nothing — and they must not, because they are the
"AI extracts" half of *the AI extracts, the tool scores*. One per paste
target, each opening by naming the build it was verified against.

**Generation prompts turn a filled header into instructions.** They produce
no data row. They tell you which commands to run, which file each block goes
into, what will refuse and why.

**System prompts are the exception to the governing rule** — the one place a
model produces judgment rather than reformatting. That is why the Evaluator
always recomputes `total_score` rather than trusting the model's own stated
total, and why those prompts carry an explicit accuracy ceiling: *research and
format is not the same as verification.*

### Where the layers meet

Two prompts in this file are about extraction prompts rather than being ones.

- **E3** points you at the right extraction prompt and names its blank. It
  does not extract. That is why it carries a `SCORING DASHBOARD` field
  separate from `TARGET` — a collection has no `prompts/` folder, so the
  library has to know whose folder to send you to.
- **G3** *writes* extraction prompts. Its output is a new file in a
  dashboard's `prompts/` folder, in house style, stamped against a build.

### The rule that binds them

**A scoring change is not shipped until the prompt that feeds it can produce
the input.** Entertainment v1.3 added a `Combined` post type the tool scored
but no prompt emitted; the feature was unreachable for two builds, and anyone
who both replied and quote-posted was silently paid the smaller bonus.

So when a tool's paste format changes, its extraction prompt changes in the
same build — and if that changes what a runbook must say, this file changes
too, via **H1**. Three layers, one direction of travel: the tool defines the
contract, the extraction prompt satisfies it, the generation prompt routes
around it.

---

## The output contract

Every prompt in this file ends with the same five-part contract, so what comes
back is always the same shape:

1. **A numbered runbook** — every step, in order, with the exact command.
2. **A disposition table** — every file the task touches, by its real path,
   marked **created / edited / generated by a script**, and for every piece of
   material the answer *lands in*: which file, and where inside it — which
   column, which JSON key, which array. A block of JSON with no home is the
   most common way a correct answer produces a wrong result.
3. **The refusals** — what will stop the run, and what the error will say.
4. **A verification checklist** — how you know it worked, including what to
   check on the live site.
5. **Missing inputs** — every value the run needed that the header did not
   collect, named as the field it should become. Usually empty. When it is
   not, that is a bug in the prompt, and prompt **H1** is how you fix it.

If a prompt returns prose without those five parts — or hands you a block of
JSON without saying which file it belongs in — say *"return it in the
five-part output contract, with the disposition table"* and it will.

**The fifth part is what keeps this file honest.** A prompt that asks for a
finished artifact while not collecting a value that artifact requires produces
a confident answer built on an invented input. Seven such gaps were found by
hand before this element existed — `MIN PICKS`, `IMAGE ALT` and
`EXPORT HEADER ROW` among them. Now the model reports them itself, on every
run, at the moment it knows exactly which values it wished it had.

---

## Filling a prompt before you paste it

Every block has two parts. **The header** — the lines carrying `<___>` — is
yours to fill. **Everything from the first instruction line down is written
for the model and travels unchanged.** Trimming it for brevity is how a prompt
quietly stops enforcing the thing it was written to enforce; the refusals and
the traps live in exactly the lines that look like padding.

Seven rules, six of which are not obvious the first time:

**1 · Registry values verbatim.** Copy the name from the registry table, not
from memory. `my-new-collection` and `My New Collection` are a folder and a
display name, and a prompt told the wrong one will build a runbook around a
path that does not exist.

**2 · Carry the build stamp where the target has one.** Write
`Sports Ledger (v3.5)`, not `Sports Ledger`. The version is what lets the
model resolve the source's `AppVersion` into a ruleset id — `v3.5` joined to
`rulesetPrefix` gives `nfl-ledger-v3.5`, and that exact string is what must be
declared in `_input/rulesets.json`. Drop the version and the model can only
tell you to declare *something*.

**3 · Angle brackets are not always blanks.** In `ENTRY FORMAT`,
`weekly-total-contest <GAME> <TOTAL>` is the literal format entrants type.
Leave those brackets in — the model has to reproduce them verbatim in the
announcement copy. Only the `<___>` and `<a | b | c>` markers are yours.

**4 · Give the model the files it is told to read.** Every prompt names a
source of truth and expects to open it. In a session with access to the
project folder that happens by itself; **in a plain chat it does not**, and a
model with no file access will improvise a plausible runbook from the prompt
alone — which is the single most damaging failure available here, because the
output looks exactly like a correct one. Either run the prompt where the
folder is reachable, or attach the files named in that prompt's **Reference**
line before you send it.

**5 · Spell out the output contract on the last line.** Replace
any short reference to *"the output contract"* with the full sentence:

> Return it in the five-part output contract: numbered runbook; a
> disposition table naming every file, its path, whether it is created,
> edited or script-generated, and where each piece of material goes inside
> it; refusals; verification checklist; and Missing inputs — any value you
> needed that I did not give you, named as the field it should become.

The phrase is defined once at the top of this file. A pasted block travels
without that definition, and a fresh chat has no idea what it means.

**6 · Mark unknowns; never guess them.** Write `UNKNOWN — tell me what to
check` in a field you cannot fill. The scripts refuse rather than assume, and
the prompts are written to do the same — a plausible wrong value defeats both,
because nothing downstream can tell it apart from a real one.

**7 · Read the Missing inputs section, even though it is usually empty.**
You do not have to spot these yourself — part 5 of the contract makes the
model report any value it needed and was not given. Your job is only to act on
it: anything listed is a field that prompt should collect, and **H1** adds it.
`MIN PICKS`, `IMAGE ALT`, `EXPORT HEADER ROW` and four others were found by
hand before part 5 existed. There should be no eighth.

**8 · One prompt per chat.** These runbooks are long and the refusals matter.
Two prompts in one conversation produces a merged answer where the second
quietly inherits the first's assumptions.

### A completed header

Prompt **E1**, filled. The header is everything down to
`ANNOUNCEMENT CARD ID`; from `Give me the opening runbook` onward the real
block is appended unchanged:

```
I want to start a new X/Twitter contest for a collection.

COLLECTION:        TEMPLATE-OPEN-EDITION
COLLECTION TITLE:  Sample Collection
SCORING DASHBOARD: Sports Ledger (v3.5)
CONTEST NAME:      Highest Total Contest
BOARD ID:          weekly-total-contest
SEASON ID:         2026
RULESET PREFIX:    nfl-ledger
EXPORT FILE PREFIX:contest-ranked
EXPORT HEADER ROW: Position,Handle,Called,Pick,OffBy,AppVersion
THE QUESTION:      Which of this week's NFL games posts the highest combined
                   score, and what is that total?
CONTEST TYPE:      call the number / closest call
ENTRY FORMAT:      weekly-total-contest <GAME> <TOTAL>
ENTRY DEADLINE:    Sunday 31 Aug 2026, 12:00 ET
RESULTS DATE:      Tuesday 2 Sep 2026
RECURS?:           yes — weekly
MIN PICKS:         1
TIEBREAK:          earliest reply timestamp
ANNOUNCEMENT CARD ID: ANNOUNCEMENT-001
```

Read against the rules above: the collection is the folder name and
`COLLECTION TITLE` the display name, because `import-config.json` needs the
second and ships it as `CHANGE ME`; the dashboard carries its build, which is
what `RULESET PREFIX` joins to; `<GAME>` and `<TOTAL>` stayed as literal
brackets because they are the reply format, not blanks; and every field is
answered rather than left hopeful.

`EXPORT HEADER ROW` is the one that looks optional and is not. The declaration
names a label column, a score column and an id column, and nothing checks they
exist until the first round imports — weeks of replies later. Paste a real
export's first line, or write `UNKNOWN — tell me what to check`.

A full worked run from this header, output and all, is in
`docs/runs/worked-run-e1.md`.

### What must already exist

The prompt headers make everything look like a decision. Many of the fields
are not — `EXPORT DATE` reads like something you choose, and is actually an
assertion that a file exists carrying that date in its name. This table lists
only the **artifacts**: files, wallets, captures and credentials that must be
in place before you paste, and which no prompt can conjure. The decisions are
in the prompt's own header, ten lines further down.

| Prompt | Must already exist |
|---|---|
| **A1** New collection | Treasury wallet address · a GitHub account · a Netlify account |
| **A2** New drop | The artwork file, if the drop goes live rather than being staged · `master.csv`'s **actual header row**, which may not be the template's 16 columns |
| **A3** Production mint | Real images in `backend/images/` · `DEPLOYER_PRIVATE_KEY` in `.env.admin` · a funded deployer wallet · an Irys balance |
| **A4** Template merge | The fork-point commit, found with `git log` |
| **A5** RPC proxy | A Helius API key · the `rpc-proxy` checkout · Cloudflare access |
| **A6** Netlify project | The repo pushed · Netlify's GitHub App scoped to it |
| **A7** Verify deploy | The site URL · a real browser, not an automated fetch |
| **B1** Campaign | Both drops deployed · a funded deployer |
| **B2** Airdrop | `recipients.csv`, written by you · a funded deployer |
| **C1** Text card | The image file, committed under `frontend/public/` if the path is site-relative **and its alt text**, if using one |
| **C2** Methodology | `methodology.json` · at least one published board |
| **D1** Declare board | The source dashboard **and its build stamp** · one sample export, to read its column labels |
| **D2** Publish round | **The dated export file** · its ruleset declared in `rulesets.json` |
| **D3** Community board | The Ledger export · its column labels, for `columnMap` |
| **E1** Open a contest | One sample export from the scoring dashboard, to read its column labels for `EXPORT HEADER ROW` — only when declaring a new series. An existing series needs nothing; it is otherwise the one phase with no artifact |
| **E2** Index contest | Enough recorded history to resolve the window — check `leaderboard.py --dry-run` first |
| **E3** Capture a thread | **The captured replies *and* quote posts** · the extraction prompt from the **scoring dashboard's** `prompts/` — never the collection's, which has none · the post itself, named by URL rather than assumed |
| **E4** Score and publish | The scored export, or a settled `leaderboard.py` run |
| **E5** One-off board | The scored entries, already in rank order |
| **E6** Close a contest | The announcement's `textCardId` · results published |
| **F1** Compose a post | **The record** the `--id` points at — the CSV row or the published board |
| **F2** New template | A real record to test against |
| **G1** New dashboard | The parent tool, if forking |
| **G2** Ship a build | The new `.html` · the current build, to supersede |
| **G3** Extraction prompt | The build it is verified against · a realistic source snippet for the worked example |
| **G4** Export to a collection | **The export, with `Position` and a `YYYY-MM-DD` filename** · `AppVersion` declared |
| **G5** Build the tool | The build guide · the nearest existing tool's `*-extraction-summary.md` |
| **H1** Register | The thing itself, on disk |

**Three of these are the usual blockers.** A3 stops dead without a funded
deployer and an Irys balance. E3 cannot proceed at all from a partial capture —
and a partial capture does not merely lose those entrants, it distorts every
other participant's difficulty multiplier. D2 and G4 both refuse an export
whose filename carries no `YYYY-MM-DD`, because the round is read from the
name rather than the file's timestamp.

### Where `capture.complete` can actually be set

Three prompts lean on this flag — **E3**, **D2** and **E6** — and it is not
available on all three paths. Checked against the importers, not inferred:

| Path | `capture.complete` |
|---|---|
| Hand-written board (**E5**) | **Authorable.** You write it; `false` refuses a final standing. |
| Community board (**D3**) | **Set from the export.** Refusal applies. |
| Ranked import (**D1/D2**) | **Not authorable.** `import-ranked-boards.js` writes `true` unconditionally, and `publish-round.js` runs the import and the card generator back to back, so there is no seam to change it in. |
| Index Portfolio (**E2/E3/E4**) | **Does not exist.** Nothing in that project reads or writes it; `lock_at` plus the run report is what stands in, and neither can see a reply you never captured. |

So on the path most contests use, the flag is not a safeguard you are choosing
to trust — it is a value you cannot set. Say so rather than implying a control
that isn't there.

**What a good run gives back**, so you can tell a real answer from an
improvised one: the finished `boards.json` declaration with all seven required
fields present; drafted `content` for the announcement row that names the
board id, the answer format and the deadline with a timezone; `expiresAt` set
past the results date with the reason stated; a disposition table that names
the file and the position inside it for every block it hands you, and
distinguishes *edited* from *created*; and the exact refusal text for a ruleset that is not
declared. An answer with no refusals section did not read the files.

That paragraph is a description; `docs/runs/worked-run-e1.md` is the thing itself —
E1 run end to end, so a real answer can be held next to a known-good one rather
than against prose.

---

## What the output is, and what to do with it

**The prompts generate instructions and material. They never generate
artifacts.** Nothing that comes back has been written to a file, run,
committed or posted — and that is the design, not a limitation. Six steps in
the contest loop alone carry human judgment, and none of them collapse into a
command.

What comes back sorts into three kinds, and they go to different places.

**Material — paste it into the file the manifest names.** Finished JSON
declarations, CSV rows, drafted prose. The `boards.json` block, the
`rulesets.json` entry, the `content` field of a text card. This is the bulk of
the output, and it is why the prompts ask for *the finished declaration*
rather than an explanation of the fields.

**Commands — run them one at a time and read the log.** Those log lines are
the audit trail. `publish-round.js` deliberately does not swallow its
children's output for a tidier terminal, because a wrapper that hid them would
trade away the thing that makes the pipeline checkable.

**Findings — act on them, then write them down.** Blockers, traps, and
decisions the prompt surfaced that you had not made. This is the only part of
the output with a life beyond the session. See *Where findings go* below.

---

### The draft is not the post

When a prompt drafts post copy, that draft is for the **`content` field of the
CSV row** — not for X.

The post itself comes from `compose-post.js`, which reads the row and applies
the template, the placeholder resolution and the weighted character count.
Paste a drafted paragraph straight to X and you have bypassed the budget check,
the `{methodologyUrl}` requirement on anything sourced from standings, and
every refusal the engine performs.

Same shape as the rule one level up: the AI extracts and drafts; the tools
compute and publish.

**The whole chain, stated once here because no single prompt states it end to
end:**

```
CSV row (content) → compose-post.js → you read the draft → you post it on X
→ set-post-url.js → push again
```

**Nothing in this project posts to X.** No script holds a credential or touches
an API; the step between drafting and recording is a person reading the draft
and posting it by hand. `set-post-url.js` exists precisely because that step
happens outside the project — it takes the URL back afterwards. Automating it
would mean putting credentials in the repo and giving up the read-before-post
checkpoint, which is a decision to make deliberately, not a gap to fill.

**And the url comes back to exactly one place** — the record the post belongs
to: `postUrl` in `backend/textcards.csv` for a text card, written by
`set-post-url.js`; `post_url` in the contest JSON for an Index Portfolio
contest, written by `compose_post.py --record-url`. A prompt that asks for a
post url in its header — **E3** does — is asking you to copy it from there, not
to keep a second copy of it. If it is empty at that end, the launch step was
never finished, and that is the thing to fix rather than to work around.

---

### What each part of the contract is for

| Part | What you do with it |
|---|---|
| **Runbook** | Execute it. Material gets pasted; commands get run; stop at anything marked as your decision. |
| **Disposition table** | Where the material goes, and your commit list. It should tell you the file, the path, and the position inside it — which column, which key. Diff against it: a file you changed that is not listed, or a listed file you did not touch, is a step gone wrong. |
| **Refusals** | Read *before* running, not after something fails. It is the error dictionary for this task, and it tells you which failures are the system working correctly. |
| **Verification** | Tick it. It includes the live-site checks, which is where a silent failure shows up — a broken fetch hides behind a normal-looking page. |
| **Missing inputs** | Usually empty — read it anyway. Anything listed is a field the prompt should have collected and did not, so this run was built on a value you never supplied. Fix the prompt with **H1** before the next run. |

---

### Where findings go

The runbook itself is disposable. The durable artifacts are the files you
changed. **The findings are not disposable**, and losing them in a closed chat
is how the same discovery gets made twice.

| Finding | Where it belongs |
|---|---|
| A fact about how something behaves | The relevant `README.md` or reference doc |
| Work that needs doing later | `docs/open-items.md` |
| A prompt that should have asked something | Prompt **H1** — it may need a header field, a row in *What must already exist*, or an appendix update |
| A new collection, dashboard or document | Prompt **H1** |

`MIN PICKS` reached E1 exactly this way: a run surfaced a decision the prompt
had not asked for, and the prompt gained a field rather than the knowledge
staying in one person's head.

---

### The tell for a run you should not trust

**No refusals section.** Every prompt asks for one, and a model that
improvised from the prompt text alone has nothing to put there — it cannot
know what the scripts refuse, because it never opened them.

**A Missing inputs section reading "none" on a run that built a file from a
value you never gave.** Check it against the disposition table: a JSON block
containing a key your header never mentioned means that key was invented and
should have been reported.

Two more, in the same family: a runbook with no *created* versus *edited*
distinction in its manifest, and one that never names a file that does not
exist yet. Both mean the model described the template's shape from the prompt
rather than reading the collection in front of it.

---

## Target registry

Update this table when a collection or dashboard is created. Everything else
in the file reads from it.

### Collection projects

Copies of `TEMPLATE-OPEN-EDITION`. Same layout, same scripts, own data.

| Target | Folder | Repo/site | Notes |
|---|---|---|---|
| **TEMPLATE-OPEN-EDITION** | `Desktop\TEMPLATE-OPEN-EDITION` | template | The source. Never run collection commands here. |
| **my-new-collection** | `Desktop\my-new-collection` | own Netlify project | **The mainnet reference.** Not a rig and not a launch candidate — its four drops carry permanent on-chain `Mechanics Test` names. Kept live deliberately as the one place with real deployed candy machines, real Arweave URIs and a working claim UI to check behaviour against when devnet is not enough. The deployment guide was written from it. |
| **TEMPLATE-TEST-LEDGER** | `Desktop\TEMPLATE-TEST-LEDGER` | `dadex2026/template-test-ledger` (private) | **The test rig.** Where template updates are exercised before they reach live collection projects. Devnet, placeholder config, never deployed, so nothing here costs SOL or is publicly visible — and its name cannot be mistaken for production, which is why it holds this role rather than `my-new-collection`. Carries real standings coverage: four community boards, two dated rounds, a ruleset boundary with movement suppressed, and a captured `backend/baseline/`. |
| **test-collection-01** | `Desktop\test-collection-01` | test | Scratch. |
| *(add new rows here)* | | | |

### Dashboards and ledgers

Scoring and evaluation tools. Six are single-file HTML; Index Portfolio is a
source tree.

| Target | Folder | Live file | Feeds |
|---|---|---|---|
| **Sports Ledger** | `Desktop\Dashboards\Sports Ledger` | `sports-ledger-v3.7.html` | Ranked + community exports → any collection's `backend/standings/` |
| **Entertainment Ledger** | `Desktop\Dashboards\Entertainment Ledger` | `entertainment-ledger-v1.6.html` | Same, different column labels — needs `columnMap` |
| **Index Portfolio** | `Desktop\Dashboards\Index Portfolio` | `dashboard/` (needs a build) | Its own contest + leaderboard pipeline, in Python |
| **VC Fund Evaluator** | `Desktop\Dashboards\VC Fund Evaluator` | `vc-fund-evaluator-v2.2.html` | Standalone evaluation; six paired prompts |
| **Github Evaluator** | `Desktop\Dashboards\Github Evaluator` | `github-evaluator-v2.3.html` | Standalone. Scores one software asset (repo/commit/PR/developer/org/npm package) 0-100. Copy-out/paste-back: the tool builds the audit prompt, you run it in a chat with web search, it parses the report back. System rubric also in `prompts/github-evaluator-system-prompt.txt` |
| **Sports Poker League Ranker** | `Desktop\Dashboards\Sports Poker League Ranker` | `sports-poker-league-ranker-v1.5.html` | Standalone. Poker Club League / Nations League / community Leaderboard, duplicated from Sports Ledger's Poker League tab (v3.7) at v1.0 and deliberately diverged since: v1.1 added export ids and a CSV formula guard, v1.2 made Nations a top-5 board and valued a player at their most recent refresh, v1.3 imputes a missing Top 100 list at its cutoff rather than omitting it, v1.4 reports how much of each row and each country's score that imputation accounts for, and v1.5 makes the Leaderboard's canonical handle follow the date rather than the table position. Two fixtures in `test-data/` — a sealed 20-case parity record against superseded v1.0, and a living 33-case regression fixture. **That tab is frozen; this tool owns the question and only one of the two may ever export into a collection.** Exports carry an `spl-` filename prefix and `AppVersion` joins to `rulesetPrefix`. No collection has adopted it yet, and four inherited defects listed in its README must be fixed before one does |
| **YouTube Ranker** | `Desktop\Dashboards\YouTube Ranker` | `youtube-ranker-v2.8.html` | Standalone. Channel relevance ranking, any category. Ranked exports use the logical column names, so **no `columnMap`**; one category per file; `AppVersion` joins to a collection's `rulesetPrefix`. No collection has adopted it yet |
| *(add new rows here)* | | | |

**The YouTube Ranker row breaks no prompt assumption**, checked when it was added:
logical column names so no `columnMap`, settled positions so it is a **D1**/**D2**
source like the two Ledgers, one dated ranked CSV which **G4** covers, and its own
`prompts/` folder so **G3** needs nothing. It carries only the ordinary precondition
on any source — whichever collection adopts it declares the version its exports
stamp as `<prefix>-<build>` in `_input/rulesets.json` before the first import, or
the import stops. None has adopted it yet. Detail lives in that tool's folder.

### Shared infrastructure

| Thing | Where | Notes |
|---|---|---|
| RPC proxy Worker | `Desktop\rpc-proxy` | Cloudflare Worker holding the Helius key. Every collection points at it. |
| Marketplace frontend | `Desktop\MARKETPLACE` | Separate frontend, own build. |

### Not in this registry

Checked and deliberately excluded, so the question does not get re-opened.
None carries `template-version.json` or `backend/scripts/`, so no prompt in
this file applies to any of them.

| Folder | What it actually is |
|---|---|
| `buyback-platform` | Standalone multi-collection buyback platform — own Express backend, own Vite frontend. Not template-based. |
| `digital-asset-dex` | Solana program work — `programs/`, a local validator, its own factory and registry. Not template-based. |
| `genesis-project` | Predecessor project with `expansion-001..003`. Not template-based. |
| `item-exchange` | Database-backed digital item exchange, PayPal payments, `schema.sql`. Explicitly not a blockchain project. |
| `nfttest1-backend` | Earlier NFT backend experiment, own architecture. |
| `nfttest2-frontend`, `sportsdex1-backend`, `sportsdex2-frontend` | **Empty folders.** |
| `TEMPLATE-OPEN-EDITION-BACKUP-2026-08-17`, `TEMPLATE-OPEN-EDITION-downloads`, `_legacy_archive` | Archives, not live targets. |

If one of these is ever rebuilt on the template, it becomes a registry row
like any other — use prompt **H1**.

---

## Prompt index

| # | Prompt | Creates | Primary output |
|---|---|---|---|
| **A1** | New collection from the template | A standalone collection project | Folder, repo, Netlify project |
| **A2** | New drop in an existing collection | An open-edition row | `master.csv` row → `registry.json` |
| **A3** | Take a collection to production mint | On-chain collection + candy machines | Arweave URIs, addresses in `master.csv` |
| **A4** | Pull newer template features in | An upgraded collection | Merged files, no lost customization |
| **A5** | Stand up or rotate the RPC proxy | A Worker endpoint | `rpc` fields + env vars |
| **A6** | Create the Netlify project | A live site | Build settings + env vars |
| **A7** | Verify a live deploy | Confidence | Endpoint + console check |
| **B1** | New holder-reward campaign | A campaign | `campaigns.csv` → `campaigns.json` |
| **B2** | Airdrop to a wallet list | Free mints | `recipients.csv` → `airdrop-history.csv` |
| **C1** | New text card | A NEWS/UPDATE/ANNOUNCEMENT/ANALYSIS card | `textcards.csv` → `content-registry.json` |
| **C2** | Refresh the methodology page | A current rules page | `methodology.json` |
| **D1** | Declare a new ranked board | A recurring board | `_input/boards.json` |
| **D2** | Publish a round | Updated standings | `standings.json` + `STANDINGS-` card |
| **D3** | Community leaderboard from a Ledger export | Four participant boards | `import-community-boards.js` output |
| **E1** | Open an X contest on a collection | An announcement + a declared board | `textcards.csv` + `boards.json` |
| **E2** | Open an X contest on Index Portfolio | A contest record | `contests/<ID>.json` |
| **E3** | Capture a thread and extract rows | Parseable entries | A dated CSV |
| **E4** | Score and publish contest results | A standings card + result post | `publish-round.js` / `leaderboard.py` |
| **E5** | One-off contest, hand-written | A single board | `standings/<boardId>.json` |
| **E6** | Close a contest | A clean close | Card retirement + result post |
| **F1** | Compose a post | Post text within budget | stdout / `--out` |
| **F2** | Write a new post template | A reusable template | `post-templates/<name>.txt` |
| **G1** | New dashboard project — from scratch or forked | A conventional project | Folder tree + README |
| **G2** | Ship a new dashboard build | A clean version bump | New `.html`, old to `_superseded/` |
| **G3** | New extraction prompt for a paste target | A prompt file | `prompts/<name>.md` |
| **G4** | Export a Ledger board for a collection | A dated export | `_input/boards/<prefix>-YYYY-MM-DD.csv` |
| **G5** | Build the tool itself | A working first build | `<name>-v0.1.html` + README |
| **H1** | Register a new target or document | An updated registry, and cross-references that resolve | This file |

---
---

# A — Collection and project lifecycle

## A1 — Generate a new collection from the template

> **What it creates:** a standalone, deployable collection project — its own
> folder, its own GitHub repo, its own Netlify project, its own on-chain
> identity. This is the longest runbook in the file and the one with the most
> irreversible steps.

```
I want to generate a new collection from TEMPLATE-OPEN-EDITION.

COLLECTION NAME (human-readable, goes on-chain):  <___>
COLLECTION SLUG (lowercase, hyphenated):          <___>
FOLDER NAME:                                      <___>
GITHUB REPO:                                      <___>
NETLIFY SITE NAME:                                <___>
TREASURY WALLET:                                  <___>
RPC PROXY URL (the Worker from A5):               <___ — never the template's own,
                                                  which ships in deployment.json>
NETWORK (devnet | mainnet):                       <___>
WILL IT PUBLISH RANKINGS? (yes | no):             <___>
SEASON ID (only if rankings):                     <___>
RULESET PREFIX (only if rankings):                <___>

Source of truth: docs/new-collection-deployment-guide.md, Steps 1–10.
Read it and produce the runbook for THIS collection with every placeholder
already substituted — I should not have to translate anything.

Cover, in order:
 1. The Copy-Item from the template, and the delete list that follows it
    (node_modules, the three .env files, backend/logs, .netlify,
    deploy-state.json, registry.json). State plainly that these commands
    must run in the NEW folder, and what happens if they run in the
    template by mistake.
 2. deployment.json — which keys to remove (assetAddress, and createdAt, which
    is stamped on creation rather than copied), which to set.
 3. The name in every place it lives: template-version.json collectionName,
    backend/config.json collectionSlug, backend/master.csv, and
    backend/standings/_input/import-config.json if rankings are on. Include
    backend/config.json's price, which ships as a live 0.01 and is easy to
    leave. Give me the four git grep commands that prove nothing survives:
    the three placeholder strings, and api-key= — a keyed RPC URL in a VITE_
    value is baked into the public bundle.
 4. Replacing the sample content: the master.csv row, the campaigns.csv row,
    the six textcards.csv rows, deleting the EXAMPLE standings board and
    docs/open-items.md.
 5. git remote -v, the checkpoint commit, the new empty repo, remote set-url,
    push -u.
 6. Setting collectionName BEFORE any mint, and why that ordering is not
    negotiable. Say what happens if it is simply absent: deploy-collection.js
    falls back to the collection slug, so the slug is what mints on chain —
    permanently, with no error. The name comes from master.csv, first matching
    row; template-version.json's collectionName drives only the site title.
 7. Pointing every rpc field at the Worker proxy — deployment.json,
    backend/config.json, frontend/.env, backend/.env.
 8. The Netlify project: base directory frontend, build npm run build,
    publish ../dist, and project visibility.
 9. The environment variables, with VITE_REGISTRY_URL called out as the most
    common first-deploy failure — and name the symptom, because that is what I
    will actually see: config.ts falls back to /registry/registry.json, which
    is not where the generator publishes, so the browser 404s on that path and
    the drops grid is silently empty.
10. Live verification of all five JSON endpoints, and which 404s are normal.

Flag every step that cannot be undone, and say what makes it permanent.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece of
material goes inside it); refusals; verification checklist; and Missing inputs
— any value you needed that I did not give you, named as the field it should
become.
```

**Reference:** `docs/new-collection-deployment-guide.md` · `docs/netlify-connection.md` · `template-version.json` · `schema.json`

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-a1.md`.

**Traps this prompt exists to catch:** `deployment.json` ships pointing at the
template's own on-chain asset and nothing errors if you leave it; `origin`
still points at the template repo, so a plain `git push` corrupts the template
for every future collection; and the on-chain name is `master.csv`'s
`collectionName`, first matching row, which cannot be renamed after a mint.

---

## A2 — Add a new drop to an existing collection

```
I want to add a new drop (open edition) to an existing collection.

COLLECTION:        <target from the registry>
COLLECTION SLUG:   <which collectionSlug in master.csv this drop joins —
                    a collection's CSV can hold more than one>
DROP ITEM ID:      <___>
ITEM NAME:         <___>
DESCRIPTION:       <___>
PRICE (SOL):       <___>
MAX SUPPLY:        <number, or "unlimited" for open>
ATTRIBUTES:        <Trait:Value|Trait:Value>
ROYALTY (bps):     <500 = 5%>
ITEM EXTERNAL URL: <___, or none>
MINT STATUS:       <ready | paused>
IMAGE:             <local file, or "not yet">
SITE URL:          <___ — only if collectionExternalUrl is empty on the
                    existing rows; this is the value that would fix it>

Give me the runbook for appending this as a row to backend/master.csv and
getting it visible on the site.

Cover:
 - READ backend/master.csv's actual header row first and build the row from
   THAT, in its order. Do not assume a column count: the template ships 16
   columns, but a collection that has been through the deploy scripts carries
   more (collectionAddress, network, candyMachineAddress, candyGuardAddress,
   treasury). Tell me the count you found, and show the empty trailing commas.
 - The collection-level columns — slug, name, description, image, external
   url — must be byte-identical to the other rows sharing my COLLECTION SLUG.
   Show me those values copied from an existing row, not retyped.
 - If master.csv holds more than one collectionSlug, list them and say which
   one config.json names active, so I can confirm my choice.
 - Which columns must be left empty at this stage because a script writes
   them, and name the script for each: itemImage (upload-images.js), uri
   (upload-metadata.js), candyMachineAddress / candyGuardAddress / treasury
   (deploy-candy-machine.js).
 - collectionAddress and network are the exception, and getting this wrong
   costs a mainnet deploy. If my COLLECTION SLUG has never been deployed,
   leave both empty and let deploy-collection.js write them. If it HAS been
   deployed, copy both from an existing row in that slug and do NOT run
   deploy-collection.js: its idempotency check is
   matchingRows.every(r => r.collectionAddress && r.network === config.network),
   so one blank row makes a live collection look undeployed, and it will
   deploy a second collection and overwrite the address on every row sharing
   the slug. Tell me which case I am in, from the rows you actually read.
   Either way, run node backend/scripts/preflight.js --slug <slug> before any
   deploy — not_already_deployed is the check that catches this.
 - Whether collectionExternalUrl is populated on the existing rows. If it is
   empty, warn me that {siteUrl} and {methodologyUrl} cannot resolve and every
   compose-post.js run will need --site.
 - Whether my dropItemId or the collectionSlug would fail preflight.js — it
   refuses reserved test prefixes on both: test-, demo-, sample- for the slug
   and TEST-, DEMO-, SAMPLE- for the id. Name --allow-warnings as the
   downgrade and say plainly that it is not a fix.
 - maxSupply: how "unlimited" is represented, and that "∞" / "infinity" are
   forbidden values per schema.json.
 - Whether the drop is publishable now or needs the production pipeline in
   A3 first — decide from whether the image is real.
 - node backend/scripts/generate-registry.js, and what it writes: backend/
   registry.json by default, plus a best-effort copy into
   frontend/public/registry.json when that directory exists — the frontend
   reads the copy, so a missing one shows a stale site with no error. Note
   that minted is null unless --fetch-minted, and that null means "check
   on-chain", not zero.
 - The commit and push, and the hard refresh afterwards.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `backend/master.csv` · `schema.json` · `backend/scripts/generate-registry.js` · `frontend/public/registry.json`

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-a2.md`.

---

## A3 — Take a collection to production mint

> **What it creates:** permanent, paid-for, unfixable artifacts. Read the
> refusals section of whatever this returns before running anything.

```
I want to take a collection to a production mint.

COLLECTION:   <target from the registry>
NETWORK:      <devnet | mainnet>
DROPS:        <all, or the specific dropItemIds>

Give me the full production pipeline runbook, in the order the scripts must
run, with the purpose and the idempotency behaviour of each:

  backend/scripts/preflight.js            the gate — all sixteen checks
  backend/scripts/prepare-images.js       local images into backend/images/
  backend/scripts/upload-images.js        Irys/Arweave → itemImage in master.csv
  backend/scripts/generate-metadata.js    → backend/metadata/<dropItemId>.json
  backend/scripts/upload-metadata.js      Irys/Arweave → uri in master.csv
  backend/scripts/deploy-collection.js    the Core collection → collectionAddress
  backend/scripts/deploy-candy-machine.js one candy machine per drop
  backend/scripts/generate-registry.js    → frontend/public/registry.json

For each script tell me: what it reads, what it writes back into master.csv,
whether re-running is safe, what --force actually overrides, and its exit
codes (0 success, 1 validation, 2 upload, 3 chain).

Then specifically:
 - List preflight's checks and what each one would have caught. There are
   SIXTEEN, in five groups — project structure 4, environment 6, content
   validation 4, campaign validation 1, deployment state 1 — and the group
   most easily dropped is Environment, which holds env_admin_gitignored and
   deployer_not_treasury: a key about to be committed, and a deployer that is
   also the treasury.
 - --allow-warnings, which downgrades the reserved-prefix and placeholder
   failures. Treat it exactly as seriously as --allow-placeholder: it is the
   flag that lets test data reach a mainnet mint.
 - Explain why generate-metadata.js skips a row whose itemImage is still a
   placeholder, and why --allow-placeholder must never be used against
   mainnet.
 - Explain why there is one candy machine per drop rather than per
   collection, and what hidden settings mean for an open edition.
 - Name every step that spends real SOL and every step that is permanent
   once done.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `backend/scripts/preflight.js` · `prepare-images.js` · `upload-images.js` · `generate-metadata.js` · `upload-metadata.js` · `deploy-collection.js` · `deploy-candy-machine.js` · `backend/config.json` · `backend/.env.admin`

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-a3.md`. It was written and not executed:
the prerequisites it turns on cannot be verified without spending.

**Note:** `backend/scripts/get-holders.js` was written on 2026-09-02 and produces
a holder snapshot, collection-wide or for one drop via `--drop`. Verified against a
collection whose holders were already known, so its DAS query and field names are
confirmed. `scripts/audit-production.ps1` was empty in the same way and was deleted on
2026-08-28. `backend/metadata/` does not exist in a fresh checkout either —
`generate-metadata.js` creates it.

---

## A4 — Pull newer template features into an existing collection

```
I want to pull newer TEMPLATE-OPEN-EDITION features into an existing
collection without losing its customization.

COLLECTION:       <target from the registry>
FEATURES WANTED:  <or "everything since the fork">

Give me the runbook for Step 5 of the deployment guide.

Cover:
 - Finding the fork-point commit the two repos share.
 - The per-file comparison:
   git diff --ignore-space-at-eol -w <fork-point> -- <path>
   and the rule that reads out of it — no differences means safe to replace
   wholesale, real differences mean hand-merge.
 - Which files are generic tooling and can almost always be taken whole
   (the backend deploy/upload scripts) versus which carry collection
   identity and must be merged by hand (index.html, ui.engine.ts, state.ts,
   types.ts, main.ts, config.json, master.csv).
 - Whole directories a diff loop will never surface because the collection
   simply does not have them — currently backend/standings/,
   backend/methodology/, backend/post-templates/ (all six templates, without
   which nothing composes), and the scripts that serve them. Tell me to check
   for missing directories explicitly, with a directory-level diff of backend/
   and backend/scripts/.
 - A template feature that arrives INSIDE a file I must never replace
   wholesale: textcards.csv gaining image, imageAlt and postUrl takes the
   header from 13 columns to 16. The merge is mechanical — append the three
   names to the header and THREE trailing commas to every existing row, one
   per new column — and a wholesale replace destroys my card rows. Verify with
   a quote-aware parser afterwards, not by eye: content fields contain commas,
   so counting separators lies.
 - template-version.json gaining collectionName on an ALREADY-MINTED
   collection: add the key with the name that is already on chain, never a
   corrected one.
 - Deleting docs/open-items.md and the EXAMPLE standings board if they came
   across.
 - A test pass after the merge, before pushing.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `docs/new-collection-deployment-guide.md` Step 5 · `.gitattributes`

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-a4.md`.

---

## A5 — Stand up or rotate the RPC proxy

```
I want to <stand up | rotate the key on> the RPC proxy Worker.

COLLECTIONS IT SERVES:  <targets from the registry>
CUSTOM DOMAINS:         <___ or none>
REASON (if rotating):   <___>

Working checkout: Desktop\rpc-proxy (a copy of helius-labs/helius-rpc-proxy).

Give me the runbook.

Cover:
 - npx wrangler deploy, and the two variables: HELIUS_API_KEY (encrypted,
   required — without it the Worker returns 500) and CORS_ALLOW_ORIGIN.
 - The CORS logic in full: matching is EXACT STRING and all-or-nothing per
   request, so a trailing slash, a www. prefix or http versus https fails
   silently, and the list must contain every legitimate origin — production,
   any custom domain, and http://localhost:5173. Say plainly what an UNSET
   CORS_ALLOW_ORIGIN means: the Worker falls back to Access-Control-Allow-Origin
   '*', open to every site and every quota-spender, which is the state reached
   by doing nothing. Explain what happens to Netlify deploy previews,
   whose subdomains cannot be enumerated in advance, and give me the explicit
   choice rather than a default.
 - Every place the Worker URL has to be written, per collection:
   deployment.json rpc, backend/config.json rpc, frontend/.env
   VITE_SOLANA_RPC_URL, backend/.env SOLANA_RPC_URL and VITE_SOLANA_RPC_URL,
   and the matching Netlify environment variable.
 - If rotating: that deleting the key at Helius comes FIRST, before any repo
   work, and why scrubbing the repo does not stop the bleeding. Then
   git grep -n "api-key=" to confirm the tip is clean, and the fact that a
   key committed at any point stays in history.
 - Why the collections need no redeploy after a rotation.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `docs/new-collection-deployment-guide.md` Step 7 · `Desktop\rpc-proxy`

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-a5.md`.

---

## A6 — Create the Netlify project

```
I want to create the Netlify project for a collection.

COLLECTION:     <target from the registry>
REPO:           <___>
SITE NAME:      <___>
PUBLIC SITE?:   <yes | no>

Give me the runbook.

Cover:
 - Netlify's current vocabulary: the top-level entity is a Project, so it is
   "Add new project", not "Add new site".
 - Import from GitHub, and the fix when the repo does not appear in the list
   (github.com/settings/installations → Netlify → Configure → add the repo).
 - Build settings, which must match netlify.toml: base directory frontend,
   build command npm run build, publish directory ../dist.
 - Adding environment variables BEFORE the first full deploy, with
   VITE_REGISTRY_URL = /registry.json called out as the most common
   first-deploy failure — missing it, config.ts falls back to
   /registry/registry.json, a path the generator never writes, so the site
   loads and shows nothing.
 - The rest: VITE_SOLANA_RPC_URL (the Worker proxy, never a keyed Helius
   URL), VITE_SOLANA_RPC_URL_DEVNET, VITE_CAMPAIGNS_URL,
   VITE_CONTENT_REGISTRY_URL.
 - That Vite bakes env vars in at build time, so any change needs a fresh
   deploy to take effect.
 - Project visibility, if the deployed site returns 401.
 - First, whether the project already EXISTS: .netlify/state.json holds a
   siteId and `netlify status` from inside the folder names the linked site.
   Picking up an inherited collection is at least as common as creating one.
 - That publish is ../dist because it is relative to the BASE directory —
   setting dist produces a green build that publishes nothing.
 - Updating docs/netlify-connection.md, which ships with a
   <project-name>.netlify.app placeholder and is the file someone reads later
   to find the site.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `netlify.toml` · `docs/netlify-connection.md` · `.netlify/state.json`

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-a6.md`.

---

## A7 — Verify a live deploy

```
I want to verify a collection's live deploy.

COLLECTION:  <target from the registry>
SITE URL:    <___>

Give me the verification runbook. Do not let me stop at "the homepage looks
fine" — a broken fetch fails silently behind a normal-looking page.

Cover:
 - Fetching all five endpoints directly: /registry.json, /campaigns.json,
   /content-registry.json, /standings.json, /methodology.json.
 - Which 404s are the expected empty state (campaigns, content-registry,
   standings, methodology, when nothing has been published yet) and which
   mean something is actually broken (registry.json, or a 404 on
   /registry/registry.json — that is the VITE_REGISTRY_URL fallback firing).
 - The browser console pass: F12 → Console, every "Failed to load resource"
   line cross-referenced against the environment variables.
 - How to tell a CORS error apart — if it names the Worker URL the problem is
   CORS_ALLOW_ORIGIN on the Worker, not anything on Netlify.
 - The two known non-issues: the LF/CRLF warning on git add, and a 401 from
   an automated fetch when a real browser loads the site fine.
 - FRESHNESS, because every status code can be green while the content is
   weeks behind: compare the published card count against textcards.csv's
   rows, and the published campaign count against the rows carrying a deployed
   candy machine address. Neither needs a browser.
 - That a re-check after a deploy must bust the cache — append ?v=<anything>
   to the url. A cached response is indistinguishable from a live one and will
   happily report the old counts minutes after a successful build, which is
   the same confident-wrong-answer failure this whole prompt is about.
 - Before concluding a 404 is the expected empty state, check backend/ for the
   directory: a feature that was never forked in 404s identically to one that
   has simply not published yet, and the remedies differ (A4 versus publishing
   a round).

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `docs/new-collection-deployment-guide.md` Step 10

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-a7.md`.

---
---

# B — Campaigns

## B1 — Generate a new holder-reward campaign

> **What it creates:** a dedicated candy machine that lets holders of one drop
> claim another. Its allocation is genuinely independent of the target drop's
> public supply.

```
I want to start a new holder-reward campaign.

COLLECTION:              <target from the registry>
CAMPAIGN ID:             <___>
TITLE / HEADLINE:        <___>
WHO QUALIFIES:           <eligibility dropItemId or collection>
WHAT THEY RECEIVE:       <target dropItemId>
PRICE:                   <0 for free, or SOL>
ALLOCATION:              <how many rewards exist>
CLAIM LIMIT PER WALLET:  <___ — this is the --claim-limit flag on the deploy
                          command, not a column I fill; the CSV's claimLimit is
                          written back by the script>
NETWORK:                 <devnet | mainnet>

Give me the runbook, from CSV row to live claim button to announcement post.

Cover:
 1. The backend/campaigns.csv row — all 21 columns in header order, with my
    values placed and the display-text columns distinguished from the
    functional ones. I have given you two display values; DRAFT the other
    seven (description, eligibilityText, rewardText, priceText,
    allocationText, claimText, soldOutText) and show them to me to approve,
    because campaign-launch.txt composes the entire launch post out of them —
    and warn me that a priceText saying FREE beside a price of 0.001 deploys
    paid and announces free, with nothing erroring. Be explicit about which of eligibilityDropItemId,
    targetDropItemId, eligibilityCollection and targetCollection do the
    actual gating.
 2. Why eligibility and target are independent parameters — a campaign is not
    required to reward the same collection that establishes eligibility.
 3. node backend/scripts/deploy-campaign.js --campaign <campaignId>
    [--claim-limit N] — what it creates on chain, and
    why it is its own candy machine rather than a guard group on the target
    drop's existing one (the two supply pools must not share a counter).
 4. node backend/scripts/generate-campaigns-registry.js →
    frontend/public/campaigns.json, and what --fetch-claimed adds.
 5. Commit, push, and confirming the claim UI renders.
 6. The launch post: node backend/scripts/compose-post.js campaign-launch
    --id <campaignId>. Note that --id matches campaignId here and nothing
    else. Then post it, then set-post-url if I also wrote a text card.
 7. Whether this campaign also needs an ANNOUNCEMENT text card — recommend
    one and say why.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `backend/campaigns.csv` · `backend/scripts/deploy-campaign.js` · `generate-campaigns-registry.js` · `frontend/public/campaigns.json` · `backend/post-templates/campaign-launch.txt`

**A full worked run of this prompt** — filled header and all five parts
of the output — is in `docs/runs/worked-run-b1.md`.

---

## B2 — Airdrop to a wallet list

```
I want to airdrop assets to a list of wallets.

COLLECTION:   <target from the registry>
DROP ITEM ID: <which drop's metadata the airdropped assets carry>
RECIPIENTS:   <where the wallet list is coming from>
NETWORK:      <devnet | mainnet>

Give me the runbook for backend/scripts/airdrop.js.

Cover:
 - The recipients.csv format (wallet,quantity — quantity optional, omit the
   column for one each).
 - The two consequences of not going through the candy machine: airdropped
   assets do NOT count against itemsAvailable/itemsRedeemed, and the DEPLOYER
   wallet pays every fee and every asset rent. Give me a rough cost basis per
   recipient so I can budget.
 - That every airdropped asset shares the drop's name and uri, matching the
   open-edition convention.
 - Idempotency and resumability: backend/airdrop-history.csv logs every
   attempt, success or failure, and a re-run only processes what is
   outstanding.
 - A dry-run or small-batch rehearsal before the real list — and that the
   rehearsal is where the cost basis comes from. The fee is a few thousand
   lamports; the larger component is ASSET RENT, which is not a number this
   project can supply, so read the deployer balance before and after a
   two-wallet batch rather than multiplying an estimate by the list.
 - That the resume key is wallet + dropItemId, so the same list is outstanding
   again for a different drop.
 - --slug, which says which collectionSlug in master.csv this airdrop belongs
   to when the file holds more than one.
 - That airdrops leave registry.json and the site's minted count untouched,
   since only public mints run through the candy machine's supply tracking.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `backend/scripts/airdrop.js` · `backend/recipients.csv` · `backend/airdrop-history.csv`

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-b2.md`.

**Note:** `recipients.csv` and `airdrop-history.csv` do not exist in a fresh
template checkout — you create the first, the script creates the second.

---
---

# C — Content

## C1 — Generate a new text card

> **What it creates:** one card in the site's news grid, announced on X, with
> the post linked back so the thread is findable months later.

```
I want to publish a new text card.

COLLECTION:   <target from the registry>
TEXT CARD ID: <___ — permanent, never reused, and the number sequence is
               GLOBAL rather than per-category: read the file and take the next
               one, whatever the prefix>
CATEGORY:     <NEWS | UPDATE | ANNOUNCEMENT | ANALYSIS>
HEADLINE:     <___>
SUBHEADLINE:  <___ or none>
CONTENT:      <___>
IMAGE:        <https:// url, or a site-relative /path, or none>
IMAGE ALT:    <required if IMAGE is set — what the picture shows>
FEATURED:     <TRUE | FALSE>
PRIORITY:     <integer, default 0 — display order is featured, then priority
               descending, then publishedDate, so this is half the ordering>
PUBLISHED DATE: <ISO — required by the generator>
AUTHOR:       <___ or none>
TAGS:         <pipe|delimited|not|commas, or none>
SITE URL:     <___ — needed for compose-post's --site whenever
               collectionExternalUrl in master.csv is still a placeholder>
EXPIRES:      <ISO date, or none>

Give me the five-step lifecycle runbook — write the row, compose the post,
post it on X myself, publish the card, link the post back.

Cover:
 A. The backend/textcards.csv row: all 16 columns in header order, a unique
    textCardId that will never be reused, tags pipe-delimited not
    comma-delimited, and the trailing commas an optional-column row still
    needs. Start by counting the header: a collection copied before image,
    imageAlt and postUrl existed has 13 columns, not 16, and step E cannot run
    at all until A4 brings the newer schema. Tell me that a comma anywhere in
    my text requires the whole field double-quoted, and that imageAlt is
    required if image is set. If I gave a
    site-relative IMAGE path, tell me the file it must exist at under
    frontend/public/ and that it has to be committed — a path that is right in
    the CSV and missing from the repo renders a broken image with no error
    anywhere. And check my IMAGE ALT actually describes the picture rather
    than restating the headline; say so if it does not.
 B. node backend/scripts/compose-post.js announcement --id <textCardId>.
    Note that this reads textcards.csv directly, not the registry, so it works
    before the generator has run. Add --site if collectionExternalUrl in
    master.csv is still a placeholder. Explain the character report on stderr.
 C. Me posting it on X, by hand. Nothing here posts for me — no script holds
    a credential — so say so rather than leaving a runbook that jumps from a
    drafted post to a tweet url with no step in between. Tell me to read the
    draft before it goes out; that reading is the point of the boundary.
 D. node backend/scripts/generate-content-registry.js, then the git add of
    textcards.csv + backend/content-registry.json +
    frontend/public/content-registry.json, commit, push, hard refresh.
 E. node backend/scripts/set-post-url.js <textCardId> <tweet url>, then push
    again. Tell me plainly that this second push is the step most often
    skipped and it is the entire reason the postUrl column exists.

Also state:
 - Which categories are refused from this CSV (RANKING, LEADERBOARD,
   SCOREBOARD, STANDINGS, STATS) and where those come from instead.
 - The display order: featured, then priority descending, then publishedDate.
 - That a retired card gets status INACTIVE/EXPIRED/ARCHIVED, never deletion.
   Say plainly that this is mechanism, not etiquette: generate-content-registry.js
   seeds its map from the EXISTING registry and then overlays the CSV rows, so it
   only ever adds or updates. Removing a row from textcards.csv therefore leaves
   the card in content-registry.json and live on the site. Only status hides it —
   isTextCardVisible() drops anything whose status is not ACTIVE.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `backend/textcards.csv` · `backend/scripts/generate-content-registry.js` · `set-post-url.js` · `compose-post.js` · `backend/post-templates/announcement.txt` · `frontend/src/ui.engine.ts`

**A full worked run of this prompt** — filled header and all five parts
of the output — is in `docs/runs/worked-run-c1.md`.

**Card ownership — get this wrong and work is silently overwritten:**

| Card kind | Id prefix | Source of truth | Written by |
|---|---|---|---|
| Simple (NEWS/UPDATE/ANNOUNCEMENT/ANALYSIS) | any | `backend/textcards.csv` | `generate-content-registry.js` |
| Generated standings | `STANDINGS-` | a board file | `generate-standings-cards.js` |
| Hand-authored persistent (RANKING/LEADERBOARD/SCOREBOARD/STATS) | anything *except* `STANDINGS-` | the registry entry itself | nobody — edit by hand |

A `STANDINGS-` card must never be hand-edited; the next generator run
overwrites it. Edit the board and re-run.

---

## C2 — Refresh the methodology page

```
I want to refresh the methodology page.

COLLECTION:      <target from the registry>
WHAT CHANGED:    <the explanation | just the standings | both>

Give me the runbook for node backend/scripts/generate-methodology.js.

Cover:
 - The split: authored prose lives in backend/methodology/methodology.json,
   and everything that could go stale is re-derived from the standings
   themselves — which boards exist, which ruleset produced each, which export
   files they came from, the eligibility minimum, the ruleset changelog.
 - So: the authored half is TWO files. methodology.json is the TEMPLATE's —
   leave it alone in a collection, so template improvements to the shared
   sections keep arriving on version bump. Collection wording goes in
   methodology/overrides.json, merged by section id: patch by reusing an id,
   add with a new id (optionally "after": "<id>"), remove with "remove": true.
   The two sections expected to be collection-specific are how-scored and
   boards; editing any other one is a sign the change belongs upstream.
   Never hand-write a derived fact into either file.
 - That this must run after ANY standings change, and that publish-round.js
   already runs it for exactly that reason.
 - The output: frontend/public/methodology.json, reached from the site's
   Rankings nav link at #methodology.
 - Why a methodology page describing last month's rules is worse than none.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `backend/methodology/methodology.json` · `backend/scripts/generate-methodology.js` · `frontend/public/methodology.json`

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-c2.md`.

---
---

# D — Rankings and standings

## D1 — Declare a new ranked board

> **What it creates:** a recurring board. Declared once; every future round is
> one dated export file.

```
I want to declare a new ranked board.

COLLECTION:        <target from the registry>
SOURCE DASHBOARD:  <target from the registry>
BOARD ID:          <___>
TITLE:             <___>
WHAT IS RANKED:    <games | racing | poker | player stats | categories | …>
TRACK:             <subject | consensus | prediction | reporting>
ENTITY TYPE:       <game | player | team | participant | …>
SEASON ID:         <___>
EXPORT FILE PREFIX:<___ — what each round's export filename starts with, before
                    the YYYY-MM-DD. Required in the declaration, and often NOT
                    the same as BOARD ID: the board is named for what it ranks,
                    the prefix for what the source exports. standings/README.md
                    pairs boardId nfl-games with filePrefix nfl-ranked>
LABEL COLUMN:      <___ — the export column holding the entity's name. Required
                    in the declaration, and the default matching key>
SCORE COLUMN:      <___ — the export column holding the ranked value. Required.
                    A closest-call contest has no score; see the note below>
ID COLUMN:         <the column holding a stable identity, or "none — the label
                    is the identity". See the idColumn warning below: this is
                    the field that costs a season when it is wrong>
EXPORT HEADER ROW: <paste the export's first line, verbatim>

Give me the runbook for adding this to the import path.

Cover the four files, in order:
 1. backend/standings/_input/import-config.json — collectionTitle, seasonId,
    rulesetPrefix. All three ship as placeholders and all three matter.
 2. backend/standings/_input/rulesets.json — declare the version the exports
    will carry. Tell me the exact refusal if I skip it, and why that refusal
    is the point.
 3. backend/standings/_input/boards.json — the declaration. Distinguish the
    seven REQUIRED fields (boardId, title, track, entityType, filePrefix,
    labelColumn, scoreColumn) from the optional ones (blurb, idColumn,
    fields, columns, seasonId), and give me the finished JSON for my board.
 4. backend/standings/_input/boards/<filePrefix>-YYYY-MM-DD.csv — the export
    shape: a column named literally "Position" (not configurable), a
    YYYY-MM-DD in the filename (a hard error without it), and AppVersion if
    the source stamps its build.

Then explain, because these are the mistakes that cost a season:
 - Set idColumn whenever a label can change. Matching defaults to
   labelColumn, so a rename reads as one entity leaving and another arriving
   — resetting a standing with no error and no trace.
 - The board file is OUTPUT, not input. Every run overwrites it, subtitle
   included. Edit the declaration, never the board.
 - Movement needs two rounds. Round one is correctly all "new".
 - track: use "subject" for things ranked by a value the source computed.
   "consensus" is reserved for ranking those same subjects by what
   participants collectively predicted, which no source produces yet.

Note that boards.json and _input/boards/ do not exist in a fresh checkout —
I create them with the first board.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `backend/standings/README.md` · `_input/import-config.json` · `_input/rulesets.json` · `backend/scripts/import-ranked-boards.js`

**A full worked run of this prompt** — filled header and all five parts
of the output — is in `docs/runs/worked-run-d1.md`.

---

## D2 — Publish a round

```
I want to publish a round of standings.

COLLECTION:   <target from the registry>
BOARD(S):     <boardIds, or "all">
EXPORT FILE:  <___ — the file being moved into _input/boards/; the date alone
               does not name it>
EXPORT DATE:  <YYYY-MM-DD>
PATH:         <import | hand-written one-off>
ALLOW INCOMPLETE?: <no | yes — publishes affected cards INACTIVE for review
               instead of as a final standing>

Give me the runbook.

Cover:
 - Moving the export into backend/standings/_input/boards/ with its
   YYYY-MM-DD in the filename — this is a manual step and the date is what
   places the round in the movement replay.
 - node backend/scripts/publish-round.js, and what it wraps:
   import-ranked-boards.js → generate-standings-cards.js →
   generate-methodology.js, in that order, stopping at the first failure,
   with every log line still printing. Use --from standings for a
   hand-written board with no export to import. Note that any other flag is
   passed through to every step, which is how --allow-incomplete reaches the
   card generator.
 - What a board declared in boards.json with no matching export does: it logs
   "No exports matching prefix ... — board not published this run" and the run
   ends with a hint about putting dated exports in boards/. That is a warning,
   not a failure, and it is the commonest state in a collection with more
   declarations than rounds — say so, because it reads as a failure.
 - Every artifact written: backend/standings/<boardId>.json,
   backend/content-registry.json, frontend/public/content-registry.json,
   frontend/public/standings.json, frontend/public/methodology.json.
 - The refusals, and why each one is correct:
   · capture.complete false is a hard failure — a response never captured is
     indistinguishable from a participant who did not play. --allow-incomplete
     publishes it INACTIVE for review instead of as a final standing. Tell me
     which path I am on: on the ranked import path the flag is written true
     unconditionally and this refusal cannot fire (see "Where
     capture.complete can actually be set").
   · Entries not in rank order are refused, because that usually means the
     list was re-sorted by score after ranking, which breaks the movement
     column. Note that this catches a shuffled file, not a wrong one —
     nothing verifies rank 1 is actually the best entry.
   · A ruleset the exports carry but rulesets.json does not declare.
 - Card ownership, because getting it wrong loses work silently: this
   generator rewrites every card whose id starts with STANDINGS- and carries
   every other card through untouched, while generate-content-registry.js
   leaves every persistent card alone. So a STANDINGS- card must never be
   hand-edited — the next run overwrites it. Edit the board file and re-run.
   A persistent card with any other id is mine to edit directly and no script
   will touch it.
 - Two behaviours that look like bugs and are not: a cardLimit of 10 can
   publish 12 rows, because the slice extends through the whole tie group
   rather than cutting a tie in half; and deleting a board file marks its
   card ARCHIVED rather than removing it.
 - The round checklist: ruleset declared, filename dated, all three steps
   report success, round count as expected, movement looks right, git add
   of backend/standings + content-registry + frontend/public, push, and
   confirm Netlify finished before checking the live site.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `backend/scripts/publish-round.js` · `import-ranked-boards.js` · `generate-standings-cards.js` · `generate-methodology.js` · `backend/standings/README.md`

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-d2.md`.

**A `STANDINGS-` card must never be hand-edited** — the next
`generate-standings-cards.js` run overwrites it. Edit the board file in
`backend/standings/` and re-run. The full ownership table, covering all three
kinds of card that share `content-registry.json`, is under **C1**.

---

## D3 — Community leaderboard from a Ledger export

```
I want to build the participant leaderboard from a Ledger export.

COLLECTION:        <target from the registry>
SOURCE DASHBOARD:  <Sports Ledger | Entertainment Ledger | other — with its
                    build stamp, which is what joins rulesetPrefix into a
                    declared ruleset id>
EXPORT FILE:       <___>
EVIDENCE ROWS FILE:<___ — _input/rows/community-predictions-YYYY-MM-DD.csv.
                    Without it the boards build and every entry silently loses
                    its evidence object>
EXPORT HEADER ROW: <paste the export's first line, verbatim>

Give me the runbook for node backend/scripts/import-community-boards.js —
one export in, four boards out.

Cover:
 - What the four boards are and why they are separate files rather than one
   document: they are separate leaderboards with separate movement.
 - The columnMap in _input/import-config.json, and exactly why it exists:
   Sports Ledger writes FinalPoints / SkillEdge / Predictions where
   Entertainment Ledger writes Points / Edge / Resolved. Give me the
   columnMap for MY source. The key is the logical name the importer reads and
   the value is the source's header, not the other way round. Note mapping is
   additive — original headers stay — and a source already using the logical
   names needs no entry.
 - That the export's ruleset must be declared here too: this importer refuses
   an undeclared version exactly as the ranked one does, and an export taken
   before the source stamped AppVersion resolves through import-config.json's
   rulesetVersion fallback.
 - That movement is suppressed by any rule-change in the SPAN, not just at the
   ends: a rule-change sitting between two export-only versions suppresses
   movement even though neither endpoint names it.
 - minPicks in import-config.json and the provisional threshold it sets.
 - The evidence object attachEvidence() hangs off every entry — per-prediction
   timestamp, late, pending, counts, settledBy, excludedReason, and a link to
   the source post — and that it lands in frontend/public/standings.json. So a
   disputed late entry is settleable from published data.
 - The boundary: the Ledger is the only place a score is computed. This side
   derives exactly two positional values — movement, replayed from the dated
   exports, and competition ranks where the export did not supply them.
 - Then publish-round.js and the push.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `backend/scripts/import-community-boards.js` · `_input/import-config.json` · `backend/standings/README.md`

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-d3.md`.

---
---

# E — X / Twitter contests

> A contest is a board. The first decision — before anything else — is
> **whether it recurs**, because that decides which path produces the board
> file and it is awkward to change later. Recurring is the default. Do not
> hand-write round 1 and import from round 2: the seam does not join, and
> round 2 will show every entrant as `new` as though the contest never ran.

## E1 — Open a new X contest on a collection

```
I want to start a new X/Twitter contest for a collection.

COLLECTION:        <target from the registry>
COLLECTION TITLE:  <as it should read in board titles and on the methodology
                    page — import-config.json ships this as "CHANGE ME">
SCORING DASHBOARD: <target from the registry — where the round gets scored>
CONTEST NAME:      <___>
BOARD ID:          <___>
SEASON ID:         <___ — only if this is a new contest series>
RULESET PREFIX:    <___ — only if new. Joins the dashboard's build stamp into
                    a ruleset id: nfl-ledger + v3.5 = nfl-ledger-v3.5>
EXPORT FILE PREFIX:<___ — only if new. What each round's export filename starts
                    with, before the YYYY-MM-DD>
EXPORT HEADER ROW: <paste a sample export's first line, verbatim — only if new.
                    The declaration's label, score and id columns must name
                    columns that actually exist>
THE QUESTION:      <what entrants are calling>
CONTEST TYPE:      <pick the winner | call the number / closest call>
ENTRY FORMAT:      <the exact reply format entrants must use>
ENTRY DEADLINE:    <date, time, timezone>
RESULTS DATE:      <___>
RECURS?:           <yes — weekly/monthly | no, genuinely one-off>
MIN PICKS:         <1 | 3 — community boards only; inert on this path, see below>
TIEBREAK:          <___>
ANNOUNCEMENT CARD ID: <the textCardId for the opening card. Permanent and never
                    reused — compose-post.js and set-post-url.js both address
                    the card by it>

Give me the opening runbook — everything up to the point where replies start
accumulating.

Cover:
 ONCE PER CONTEST SERIES (skip if the board is already declared):
  - _input/import-config.json, _input/rulesets.json, and the _input/boards.json
    declaration. Give me the finished declaration.
  - The two contest-specific notes on that declaration:
    · scoreColumn is required but a closest-call contest has no score — lower
      is better. Point it at the error column (e.g. OffBy), leave "score" out
      of columns, and list the error column in fields, so the card shows a
      column headed OffBy rather than a misleading "score".
    · idColumn should be the handle, not a display name, so someone who
      changes their display label keeps their movement chain.
  - Note that _input/boards.json and _input/boards/ do NOT exist in a fresh
    checkout — say so, and tell me to create both.
  - eligibility.minEntries and eligibility.note. Tell me plainly that on the
    import path BOTH ARE DISCARDED — import-ranked-boards.js writes
    eligibility: null unconditionally, so a tiebreak declared there never
    reaches the board and never publishes. It has to go in the announcement
    content instead, which is the only channel that survives. Set them anyway
    if this contest might later be written by hand (E5), where they do publish.
  - minPicks in _input/import-config.json is NOT read by
    import-ranked-boards.js. It is a community-importer threshold, and a
    ranked board is the latest round rather than a cumulative season table, so
    there is no per-handle count of settled predictions for it to act on. Tell
    me what my MIN PICKS answer does and does not change here, and do not build
    a runbook step on it.
  - Do not tell me to set capture.complete on this path either: the ranked
    importer forces it true, and publish-round.js runs the import and the card
    generator back to back with no seam to change it in. It is authorable on a
    hand-written board (E5) and set from the export on a community board (D3).

 THE OPENING:
  - The ANNOUNCEMENT row in backend/textcards.csv. The rules go in `content`.
    Draft that content for me, and make it prescriptive enough that the
    replies are parseable: the exact contest/board id entrants must include,
    the field or answer format spelled exactly, and the deadline WITH a
    timezone. Explain that the lock time in the post is the entire basis for
    any lateness decision later.
  - expiresAt: set it PAST the results date, not to the entry deadline.
    Explain the trap — expiresAt only hides the card, it closes nothing, so
    setting it to the deadline makes the contest invisible on the site
    precisely while people are waiting for results. The alternative is to
    leave it empty and retire the card by hand.
  - compose-post.js announcement --id <textCardId>, me reading it, me posting
    it, then set-post-url.js, then push.
  - State plainly that the announcement is NOT a board — there are no entries
    yet, so there is nothing to rank.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `backend/standings/README.md` "Running a contest" · `backend/textcards.csv` · `backend/post-templates/announcement.txt` · `contest-result.txt`

**A full worked run of this prompt** — filled header and all five parts of the
output — is in `docs/runs/worked-run-e1.md`. Compare a real answer against it; it is
the concrete form of *What a good run gives back* above.

---

## E2 — Open a new X contest on Index Portfolio

> Index Portfolio runs its own contest pipeline in Python. Do not mix its
> vocabulary with the collection standings pipeline — they are separate
> systems that happen to both be called contests.

```
I want to start a new X/Twitter contest on Index Portfolio.

CONTEST ID:      <___ — the date suffix is the RESOLVE date, not the lock
                  date: IDX_30D_0923 resolves 2026-09-23 and locks a month
                  earlier. Every contest in the project follows this; nothing
                  enforces it, and a reader who assumes otherwise will report
                  a mismatch that is not one>
TITLE:           <___ — put the distinguishing part BEFORE the em dash>
QUESTION:        <___>
KIND:            <index | constituent>
SCORING MODE:    <categorical | numeric>
FIELD:           <the exact ids entrants pick from>
WINDOW:          <1d | 1w | 30d | quarter | half_year | year | ytd>
RESOLVE DATE:    <___>
LOCK AT:         <ISO with offset>

Give me the runbook for phases 1 and 2 of CONTEST_RUNBOOK.md.

Cover:
 - The contest JSON in dashboard/public/data/contests/<ID>.json, with the
   filename matching the id inside it. Give me the finished file.
 - window versus start_date — set one or the other, never both; the script
   rejects a file carrying both rather than picking one.
 - What "when data available" actually means: a window resolves only if there
   is a recorded close on or before BOTH ends, for EVERY field member. One
   unpriceable member leaves the whole contest unresolvable. Check what
   history exists first with py scripts\leaderboard.py --dry-run.
 - Validation before posting: py scripts\leaderboard.py --id <ID>. I want
   "open — resolves on <date>".
 - The launch post: py scripts\compose_post.py contest-launch-compact
   --id <ID>. Tell me which template to use — compact for a free account,
   contest-launch-numeric for a numeric contest (a numeric contest needs a
   percentage, and a reply with only a pick scores zero).
 - Me reading the draft and posting it on X, by hand. Nothing here posts for
   me, so say so rather than jumping from a composed draft to a recorded url
   with no step between them.
 - The four things the post must contain and why each earns its place: the
   exact contest id, the field spelled exactly as in the JSON, the trade
   range, and the lock time with a timezone.
 - Recording the url back: py scripts\compose_post.py --id <ID> --record-url
   <url>. Without it the record knows a contest exists but not where its
   picks came from. This is the ONE home for that url on this path — the
   contest JSON's post_url, which leaderboard.py reads and the dashboard links
   from — and E3 reads its X POST value back from here rather than keeping a
   second copy. The script refuses to overwrite a different url without
   --force, on the stated grounds that losing the link to the thread the picks
   actually came from is worse than a stopped run.
 - Exit codes: 0 composed, 1 could not compose, 2 over budget. --out never
   writes an over-budget post.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `Dashboards\Index Portfolio\CONTEST_RUNBOOK.md` · `POST_GENERATOR.md` · `LEADERBOARD.md` · `scripts\leaderboard.py` · `scripts\compose_post.py` · `post-templates\`

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-e2.md`.

---

## E3 — Capture a thread and extract rows

> **The one step with a deadline, and the only one that cannot be redone.**
> Everything else is re-runnable; a thread captured three days late cannot be
> un-captured.

```
I want to capture an X contest thread and turn it into rows.

TARGET:            <target from the registry — the registry value verbatim,
                    not the display title>
SCORING DASHBOARD: <where the round is scored, with its build stamp — the
                    extraction prompt lives here, not with the collection.
                    Same as TARGET only when the target IS the dashboard>
CONTEST ID:        <___ — character for character. On the collection path
                    this is the boardId, the same string declared as BOARD ID
                    in E1>
CONTEST TYPE:      <pick the winner | call the number>
LOCK TIME:         <date, time, timezone>
X POST:            <url of the thread being captured — copied from where it is
                    already recorded, never invented here. Index Portfolio: the
                    contest JSON's post_url. Collection: the announcement
                    card's postUrl in textcards.csv. Empty there means the
                    launch step was never finished>

 — fill the one that matches the path —
EVENT LABEL:       <collection path: the exact Sport/Event label every row
                    carries, identically. Copy it, never retype it>
THE FIELD:         <Index Portfolio path: the exact ids entrants pick from,
                    or "numeric">

Give me the capture-and-extract runbook.

Cover, whichever path applies — and say which one you are on before you start,
because the two use different vocabulary and different destinations:
 - That the capture happens AT the lock time, and why it cannot be deferred.
 - That replies and quote posts live in two different places on X and both
   must be collected — a capture missing the quotes is a partial capture.
 - Expanding EVERYTHING, not just the replies I find interesting. Explain the
   distortion: difficulty weighting divides hits by settled predictions, so
   skipping marginal replies shrinks the denominator and inflates everyone
   else's multiplier. A partial capture does not just lose those people, it
   changes the scores of everyone who is in it.
 - That the AI extracts only — it never scores, never ranks, never decides
   who won.
 - Which surface each step happens at. Everything — the extraction prompt,
   the paste, the resolve, the flag, the export — happens at the SCORING
   DASHBOARD; the TARGET is read once, for the contest id, and is not opened
   again. Tell me what it looks like when I have the two the wrong way round.
 - capture.complete: that flag is MY assertion that I got everyone, and
   setting it false correctly refuses to publish a final standing. It exists
   on the COLLECTION path only — nothing in Index Portfolio has it — so on
   that path say what stands in instead (lock_at, plus the run report), and
   that neither can see a reply I never captured.
 - Optionally restricting replies on the X post, which is the only real close
   and is a manual action in X's own interface.

 COLLECTION PATH (the round is scored in a Ledger):
  - The extraction prompt from the SCORING DASHBOARD's own prompts/ folder —
    a collection has no prompts/ folder and never will. Name the file, and
    name the build it is verified against.
  - Its blanks are the EVENT LABEL, not a contest id — and check that prompt
    for a second block before you run it: the Sports Ledger's asks for a
    REFERENCE TEAM whenever the predictions are margins or spreads, so "one
    blank" holds for a total and not for a margin. Warn me that the median is
    computed per label, so two spellings split one contest into two
    populations and silently change everyone's error scale. Nothing errors.
  - The field contract, in order, and what a wrong field count does —
    including the case that does not error: a row missing the tool's newest
    field may still parse, take that field's default, and silently forfeit
    what it carried.
  - That the rows are PASTED INTO THE LEDGER'S paste box — they are not saved
    as a file at this step. No dated file exists until the export, which is
    prompt G4.
  - That the result column — `Actual`, in the Sports Ledger — stays TBD at
    capture time and is filled afterwards with the Ledger's bulk resolve
    control, its **Resolve results** box, which only ever fills a blank. Use
    the tool's own names for both, not paraphrases.

 INDEX PORTFOLIO PATH:
  - prompts/leaderboard-paste-prompt.md, and its three blanks: CONTEST ID
    character for character, THE FIELD copied from the contest JSON, and
    CONTEST TYPE.
  - The row format, and the destination file
    data-input/predictions/<CONTEST_ID>.csv.
  - That re-running leaderboard.py is always safe here — every output is
    rebuilt from the contest definition and the CSV, so a correction replaces
    the old result. State plainly that this is the OPPOSITE of the Ledger
    path, where re-pasting adds rows.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `Dashboards\Index Portfolio\CONTEST_RUNBOOK.md` Phases 3–4 · `Dashboards\<scoring dashboard>\prompts\` · `backend/standings/README.md`

**A full worked run of this prompt on the collection path** — filled header and
all five parts of the output — is in `docs/runs/worked-run-e3.md`. The Index Portfolio
path is worked separately in `docs/runs/worked-run-e3-index.md`, because the two use
different vocabulary and different destinations.

**The extraction prompt never lives with the collection.** Collections have no
`prompts/` folder — the prompt belongs to the tool that scores, and its blanks
are that tool's vocabulary. That is why `SCORING DASHBOARD` is a separate field
from `TARGET`, and why `EVENT LABEL` and `THE FIELD` are alternatives rather
than both being asked for.

---

## E4 — Score and publish contest results

```
I want to score and publish the results of a contest.

TARGET:      <collection or dashboard from the registry>
CONTEST ID:  <___>
ROUND DATE:  <YYYY-MM-DD>
POST URL:    <___ — recorded at the end, into postUrl or post_url; leave blank
              until the result post exists>

Give me the runbook for whichever pipeline this target uses, and say which
one it is before you start.

IF A COLLECTION (standings pipeline):
 - The Ledger computes the round. That is the only place scoring happens, and
   lateness is decided there, from timestamps.
 - Export → _input/boards/<prefix>-YYYY-MM-DD.csv, moved by hand.
 - node backend/scripts/publish-round.js — all three steps.
 - git add backend/standings backend/content-registry.json frontend/public,
   push, confirm Netlify finished.
 - node backend/scripts/compose-post.js contest-result --id <boardId>.
   Note --id matches boardId here, and that this template reads
   frontend/public/standings.json — the published artifact — not the card and
   not the board file.
 - Post it AS A REPLY to the announcement thread, not standalone. It closes
   the loop where people are already looking.

IF INDEX PORTFOLIO (Python pipeline):
 - py scripts\leaderboard.py, then read the console report: settled, pending,
   late, superseded, invalid, with a line per problem naming the line number.
 - Fix the flagged CSV lines and re-run. Re-running is always safe here —
   every output is rebuilt from the contest definition and the CSV, so a
   correction replaces the old result rather than adding to it. Say plainly
   that this is the OPPOSITE of the Sports Ledger, where re-pasting adds rows.
 - Keep py scripts\daily_update.py running, since that produces the closes
   the contest is measured against.
 - On or after resolve_date, run leaderboard.py again to settle it.
 - py scripts\compose_post.py contest-result --id <ID>, which refuses until
   the contest is scored — and there are TWO refusals, not one: no scored
   output at all ("run leaderboard.py first"), and a result whose status is not
   settled, which is what I hit running too early on the right day. Then me
   reading it and posting it AS A REPLY to the announcement thread, exactly as
   on the collection branch — nothing posts it for me.
 - Warn me off --mock: it writes synthetic rows into the real history,
   constituent-history and latest files and rewrites data-state, and contests
   resolve from exactly those files. Use --help to smoke-test instead.

EITHER WAY, before I write a word of the post:
 - In a NUMERIC contest the board's top scorer may have picked the losing
   option, because the score is the accuracy of the number and not the pick.
   The project's own worked example does exactly this. Check the winner
   sentence against the board before composing — it is the likeliest way a
   correct board produces a wrong post.

EITHER WAY, on ties:
 - Ranking is competition-style: two entries sharing a position both take the
   lower number and the next skips one — 1, 1, 3. Nothing breaks a tie for me.
 - So decide before publishing: a tie I accept (same rank, card extends
   through the whole tie group), or a tie I broke (distinct ranks, the
   deciding evidence in fields).
 - What I must not do is leave a tie in the data while writing copy that names
   a single winner. contest-result.txt renders {entry[n].rank} rather than
   hardcoded positions precisely so a post cannot claim a sole winner the
   board does not support.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `backend/scripts/publish-round.js` · `compose-post.js` · `backend/post-templates/contest-result.txt` · `Index Portfolio\scripts\leaderboard.py` · `compose_post.py`

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-e4.md`.

---

## E5 — One-off contest, hand-written

```
I want to run a genuinely one-off contest — it will not recur.

COLLECTION:       <target from the registry>
BOARD ID:         <___>
TITLE:            <___>
TRACK:            <subject | consensus | prediction | reporting>
ENTITY TYPE:      <participant | team | player | …>
SEASON ID:        <___>
RULESET VERSION:  <the declared version that scored this round>
CUT-OFF TIME:     <___ with timezone — goes in eligibility.note, and is what
                   any lateness decision rests on>
TIEBREAK:         <___ — competition ranking will show three people at rank 1
                   and will not choose between them>
SUBTITLE:         <the answer, so a reader can check the arithmetic>
ENTRIES:          <handle, what they called, what they picked, error>

Give me the runbook for writing the board by hand.

Cover:
 - That I am choosing this path deliberately, and the cost: if this contest
   ever recurs, starting it here means round 2 shows every entrant as "new".
   If there is any chance of recurrence, tell me to use the import path
   instead even for round one — and if I have already hand-written round one,
   give me the two repairs: back-fill it as a dated export so the replay sees
   both rounds, or accept one round of missing arrows and let it correct
   itself from round three.
 - The board file at backend/standings/<boardId>.json — every required field
   (boardId, title, track, entityType, seasonId, rulesetVersion, entries) and
   the optional ones worth setting for a contest (subtitle, eligibility.note,
   eligibility.minEntries: 1, columns, cardLimit, capture).
 - That the card id is STANDINGS- plus the boardId uppercased, so
   nfl-w14-total-contest.json becomes STANDINGS-NFL-W14-TOTAL-CONTEST.
 - Everything shows as "new", which is correct.
 - Score direction in a closest-call contest: a board cannot express
   direction, so a score column reading 1, 5, 8 looks like the winner scored
   worst. Do not force one. Put the real quantities in entry fields under
   names that say what they are — Pick, Called, "Off by" — and put the answer
   in subtitle.
 - Since a hand-written board carries no evidence object, if lateness could
   be contested put the posted time in fields ("Posted": "…") and state the
   cut-off in eligibility.note. Both publish and cost nothing either way.
 - That eligibility and capture publish from HERE and nowhere else on the
   ranked path: import-ranked-boards.js writes eligibility: null and
   capture.complete: true unconditionally, so a minEntries or note declared in
   boards.json never reaches an imported board — which is why the tiebreak
   must also go in the announcement content there.
 - node backend/scripts/publish-round.js --from standings — the flag exists
   for exactly this case, because there is no export to import.
 - Then compose-post.js contest-result --id <boardId>, me reading it, and me
   posting it as a reply to the announcement thread. Nothing posts it for me.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `backend/standings/README.md` "One-off" and "Writing the entries" · `backend/scripts/publish-round.js`

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-e5.md`.

---

## E6 — Close a contest

```
I want to close a contest cleanly.

TARGET:        <collection or dashboard from the registry>
CONTEST ID:    <___>
ANNOUNCEMENT:  <the textCardId of the opening card>
RESULTS DATE:  <___ — expiresAt goes PAST this, never on the entry deadline>
POST URL:      <___ — the result post, for set-post-url.js; blank until it
                exists>

Give me the closing runbook.

Start by telling me the thing that is easy to get wrong: nothing in this
project closes a contest. "Closed" is three separate things that do not line
up on their own —

 · Entries stop when I stop reading. The deadline is a promise made in the
   announcement's content, enforced by nobody. A reply at 12:01 is excluded
   because I closed my capture, not because anything rejected it.
 · capture.complete is my assertion that I got everyone, and setting it false
   correctly refuses to publish a final standing — but tell me whether this
   contest's path lets me set it at all. On the ranked import path it does not
   (see "Where capture.complete can actually be set").
 · expiresAt does not mean closed. It only hides the card — and afterwards
   the row still reads ACTIVE, so textcards.csv cannot tell me the card is
   hidden. Only the renderer knows. Tell me to check for a past expiresAt on
   an ACTIVE row before assuming the announcement is up.

Then the sequence:
 1. At the stated time, capture the replies — copy them somewhere before
    anything can change.
 2. Optionally restrict replies on the X post so late entries stop
    accumulating.
 3. Score the round.
 4. Publish: publish-round.js, then push.
 5. compose-post.js contest-result, read it, post it as a reply to the
    announcement thread.
 6. Retire the announcement card if I left expiresAt empty — status INACTIVE,
    never deletion, because textCardId is permanent. The six valid statuses are
    DRAFT, SCHEDULED, ACTIVE, INACTIVE, EXPIRED, ARCHIVED; anything else fails
    the generator with unknown_status.

And note that removing the contest's board file marks its card ARCHIVED on
the next run rather than deleting it, so a finished contest stays readable.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `backend/standings/README.md` "Closing a contest"

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-e6.md`.

---
---

# F — Posts

## F1 — Compose a post

```
I want to compose a post.

TARGET:    <collection or dashboard from the registry>
TEMPLATE:  <mint-live | campaign-launch | announcement | ranking-highlight |
            ranking-highlight-noscore | contest-result | a dashboard template>
RECORD ID: <___>
BUDGET:    <280 | Premium>

Give me the runbook.

Cover:
 - The command, and the sourcing rule that decides which file --id addresses:
   · mint / drop      → backend/master.csv        --id matches dropItemId
   · campaign         → backend/campaigns.csv     --id matches campaignId
   · text card        → backend/textcards.csv     --id matches textCardId
   · standings        → frontend/public/standings.json  --id matches boardId
   There is no universal id field. Authored content is sourced from its CSV;
   generated content is sourced from its published artifact — so a standings
   post composed before publish-round.js silently composes the PREVIOUS round.
   Note too that RECORD ID's kind is decided by TEMPLATE: where one string is
   both a dropItemId and a textCardId, the pair is ambiguous to a reader and
   not to the tool.
 - stdout for the post, stderr for the character report, so
   "> post.txt" gives a clean file with the budget still on screen. --out does
   the same without the redirect.
 - --limit for the budget, defaulting to 280. Explain that the count is
   WEIGHTED, the way X counts: every URL counts as 23 whatever its real
   length, emoji and CJK weigh 2, most Latin weighs 1. An em dash costs 1; a
   right arrow costs 2.
 - Over budget: it prints the post, names the line to cut, and writes nothing.
 - The refusals — unknown placeholder, empty required field, unmatched --id,
   a board tagged example: true (needs --allow-example), and a standings
   template with no {methodologyUrl}. Each one names the valid options.
 - The trick for discovering what a record offers: put a placeholder that does
   not exist in the template and read the error — it lists every available
   field, and on a standings board it lists THAT board's entry fields.
 - --site when collectionExternalUrl in master.csv is still the placeholder.
 - That what this produces is a DRAFT. Nothing in this project posts to X — no
   script holds a credential — so the last step is always me reading it and
   posting it by hand, then recording the url where that content type keeps
   it: set-post-url.js for a text card, --record-url for an Index Portfolio
   contest (which writes post_url into the contest JSON).

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `docs/post-generator-spec.md` · `backend/scripts/compose-post.js` · `backend/post-templates/`

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-f1.md`.

---

## F2 — Write a new post template

```
I want to write a new post template.

TARGET:      <collection or dashboard from the registry>
NAME:        <___>
SOURCE:      <master | campaigns | textcards | standings>
WHAT IT SAYS: <___>

Give me the runbook.

Cover:
 - The file at backend/post-templates/<name>.txt, and the "#source: <source>"
   first line that tells the script which file to read and which column --id
   addresses.
 - The placeholder rule: {placeholders} map 1:1 to source field names, no
   mapping layer, so nothing can drift. What I own is the wording BETWEEN the
   braces. Replacing {collectionName} with literal text makes the template
   produce that one post forever.
 - Entry addressing for a standings template: {entry[0].name},
   {entry[0].score}, zero-indexed, with board-level fields bare — {title},
   {seasonId}, {throughRound}, {rulesetVersion}, {entryCount}.
 - That a standings board declares its own columns, so a template hardcoding
   {score} breaks on a board that does not publish one. Resolve the available
   fields from the board being rendered, and check with the
   unknown-placeholder trick before shipping the template. Available fields
   come from the ENTRY OBJECT, not from columns — entries also carry entityId
   and previousRank, and columns governs only what the card displays.
 - That movement in standings.json is a raw {state, delta} object, not the
   formatted string a card carries: the engine mirrors formatMovement() from
   generate-standings-cards.js, and the two must be kept in step.
 - That an entry's extra columns live in a nested fields object and are
   flattened onto the row — this is how Winner, Spread, Total reach a post.
 - The methodology requirement: any template sourced from standings MUST
   contain {methodologyUrl}, and the engine refuses to compose it otherwise.
   A free-text disclaimer goes stale silently; a link to a generated page
   cannot.
 - Testing it against the shipped sample rows, and the one gap:
   contest-result cannot be sanity-checked before real contest data exists,
   because it needs Called and Pick, which the example board does not publish.
   Build a throwaway contest board once rather than shipping it untested.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `docs/post-generator-spec.md` · `backend/post-templates/`

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-f2.md`.

---
---

# G — Dashboards and ledgers

## G1 — Generate a new dashboard project folder

```
I want to create a new dashboard/ledger project.

NAME:           <___>
WHAT IT SCORES: <___>
SHAPE:          <single-file HTML | source tree needing a build>
STARTING FROM:  <from scratch | fork of a tool in the registry>
PASTE TARGETS:  <the boxes that take AI-extracted input>
EXPORTS:        <what it will export, and for whom>

Give me the runbook for standing it up to the conventions in
Desktop\Dashboards\README.md.

Cover:
 - The folder at Desktop\Dashboards\<Name>\, and which of the standard
   subfolders it actually needs: prompts/, test-data/, source-data/,
   templates/, samples/, backups/, exports/, _superseded/. Not every project
   uses every one — tell me which ones this project earns.
 - The one rule that matters: exactly one live .html at the top level, and
   the previous build moves to _superseded/ the same day. Explain the failure
   this prevents — a document describing a newer build than the file on disk,
   with nothing making that visible.
 - A build stamp in the masthead, printing version and date. All five existing
   tools now stamp themselves, but the Github Evaluator shipped without one
   through v1 and has already misled once because of it — a _1 suffix that read
   like a stale duplicate was actually the newer build. If this tool will not
   stamp itself, the date goes in the filename.
 - Files land in the project folder directly, never routed through Downloads.
   Two reasons: a browser resolves a filename collision by appending _1, and
   Downloads is the one folder Windows Storage Sense may auto-empty — where
   backups/ and _superseded/ would go first.
 - The README.md, which must open by naming the build it describes.
 - The AI/tool boundary, stated in the README: the AI extracts, the tool
   scores, and every number is computed in tested code from raw inputs the
   user can see and edit.
 - The corollary that has bitten before: a scoring change is not shipped
   until the prompt that feeds it can produce the input. Entertainment v1.3
   added a Combined post type the tool scored but no prompt emitted, so the
   feature was unreachable for two builds.
 - Finally, adding it to the registry in docs/generation-prompts.md — see
   prompt H1.

IF STARTING FROM A FORK, also cover — and put this BEFORE the folder steps,
because it changes what the folder contains:
 - There is no dashboard template. A fork copies a working tool, which means
   it arrives carrying that tool's subject matter, not a neutral skeleton.
   Say plainly what I am inheriting.
 - What to carry over: the scoring engine, the paste parsers, the export
   writers, the backup/restore format, the masthead and build stamp.
 - What to strip before the first build: the parent's saved state, its
   backups/ and _superseded/ contents, its test-data expected values, and
   every prompt in prompts/ — a prompt describes a field contract, and an
   inherited one describing the parent's contract is worse than none because
   it looks authoritative.
 - Rename the build immediately, to <new-name>-v0.1.html with its own stamp.
   A fork still carrying the parent's version string is the exact failure the
   one-live-.html rule exists to prevent, now across two folders.
 - THE VOCABULARY TRAP, which is the reason this branch exists. Sibling tools
   share words that do not share meanings. In Entertainment Ledger,
   "Community Edge" ranks and is measured in score points; in Sports Ledger
   the ranking metric is called "Skill Edge" and its "Community Edge" is
   display-only, in error units. So: for every term the fork inherits, decide
   whether it means the same thing here, and write the answer into the new
   README's own Sibling project section — in BOTH directions, so the parent
   gains a line about the child too.
 - The column-label consequence downstream: if this tool exports to a
   collection's standings, its labels must either match the logical names or
   get a columnMap entry in that collection's _input/import-config.json.
   Inheriting the parent's labels silently inherits the parent's columnMap
   requirement. Name which collections are affected, and give me the labels to
   decide now, while changing them is a text edit rather than a re-export.
 - Give me the inherited-term review as a TABLE I can paste into the README —
   term, what it means in the parent, what it means here — because that is the
   output of this branch and there is nowhere else to record it.
 - Re-verify every prompt against the fork before shipping, per the corollary
   above. An inherited prompt that still parses is not evidence it is right.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `Desktop\Dashboards\README.md` · the parent tool's own `README.md` and its *Sibling project* section

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-g1.md`.

**G1 stands the project up; it does not build the tool.** The architecture, the scoring boundary, ranking and snapshot timing, re-run semantics and the build order are in `Dashboards\new-dashboard-build-guide.md`, driven by prompt **G5**.

**There is no dashboard template**, which is why this prompt has two branches
where the collection side has only A1. Scratch and fork are genuinely
different runbooks: a fork inherits a working scoring engine and a subject
matter, and the vocabulary it also inherits is the part that bites.

---

## G2 — Ship a new dashboard build

```
I want to ship a new build of a dashboard.

DASHBOARD:     <target from the registry>
NEW VERSION:   <___>
WHAT CHANGED:  <___>

Give me the runbook.

Cover:
 - Writing the new .html straight into the project folder, never Downloads.
 - Moving the previous build to _superseded/ the SAME day, so there is never
   more than one loose .html.
 - Updating the masthead build stamp, or dating the filename if the tool
   carries no stamp.
 - Updating every document in the folder IN PLACE — they are never versioned,
   there is exactly one copy of each, and each must open by naming the build
   it describes. List which documents this project has.
 - The prompt check: did anything about an input format change? If a scoring
   change landed, the prompt that feeds it must be able to produce the input
   before the build ships. Name the prompt files to re-verify.
 - The test-data pass: paste sets with verified expected values, if this
   project keeps them.
 - Whether any downstream collection's standings import is affected — a
   changed column label needs a columnMap entry, and a changed AppVersion
   needs a rulesets.json declaration on the collection side, with a KIND and
   an effectiveFrom. The kind is the consequential part: export-only retains
   movement, rule-change suppresses it across that boundary permanently, and
   bug-fix recomputes history. Ask me which collections consume this tool —
   the declaration lands in another project's repo, possibly several.
 - The acceptance rule for the test-data pass: in a build where no formula
   changed, every number must match exactly and a difference is a regression;
   in a build where one did, the expected values are part of the change and I
   update them deliberately.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `Desktop\Dashboards\README.md` · the project's own `README.md` and `_superseded/`

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-g2.md`.

---

## G3 — Generate a new extraction prompt for a paste target

```
I want to write a new AI extraction prompt for a dashboard paste target.

DASHBOARD:     <target from the registry>
BUILD:         <the .html it is verified against>
PASTE TARGET:  <which box in the tool>
FIELD ORDER:   <the exact contract the tool parses>
SOURCE:        <what the user will be pasting in>

Give me the prompt file, written to the house style used in
Dashboards\<target>\prompts\.

It must:
 - Open by naming the build it is verified against and the date.
 - State the one rule up front: the AI extracts, the tool scores. No prompt
   ever asks for points, totals, positions, percentages or rank changes.
 - Give the output contract as a table: which box, which field order.
 - State the format rules explicitly. THE SEPARATOR IS THE TARGET TOOL'S, not
   a house rule: Entertainment Ledger's prompts are pipe-delimited (pipes being
   the only separator safe when a title contains a comma), while Sports Ledger
   and Index Portfolio are comma-separated, and the Index prompt requires empty
   fields to keep their commas. Read it off the box you are writing for and say
   which you chose. Then: one line per entity, no header row, no numbering, no
   bullets, no commentary, no code fence. Dates YYYY-MM-DD and optional.
 - Name every place the AI is allowed to add information it was not given,
   and put an accuracy guardrail on each. If there are none, say so.
 - Include a worked example: a realistic source snippet and the exact lines
   it should produce.
 - Say what the tool does with a malformed line.

Save it as prompts/<name>.md, and if the project keeps a sample-output file,
update that too. Then tell me what to add to test-data/ to verify it.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `Dashboards\<target>\prompts\` · `Dashboards\README.md` "Before trusting a number"

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-g3.md`.

---

## G4 — Export a Ledger board for a collection

```
I want to export a board from a Ledger into a collection's standings.

SOURCE DASHBOARD:  <target from the registry>
COLLECTION:        <target from the registry>
BOARD:             <boardId on the collection side>
ROUND DATE:        <YYYY-MM-DD>

Give me the runbook for getting the export from one side to the other.

Cover:
 - Where the Ledger writes its export (the project's exports/ folder) and
   what shape a ranked export has: Position first, a label column, a value
   column, extras after.
 - The move into <collection>\backend\standings\_input\boards\ with the
   filePrefix and the YYYY-MM-DD in the filename. Warn me that filePrefix is
   usually NOT the board id — the platform's own example pairs boardId
   nfl-games with filePrefix nfl-ranked — and that a wrongly-prefixed file is
   not an error, it is simply never selected.
 - That rows lacking Position are DROPPED SILENTLY, unlike every other failure
   here, so the check is comparing the export's row count against the
   published board's entry count. This is a manual step; the
   date places the round in the movement replay, which is why it is read from
   the name and not from file mtime.
 - The column-name check: does this source use the labels the board
   declaration expects? Sports writes FinalPoints / SkillEdge / Predictions,
   Entertainment writes Points / Edge / Resolved. If they differ, the fix is
   a columnMap in _input/import-config.json, not a renamed file. Check the
   BOARD declaration rather than the tool's reputation: a ranked Games board
   declares labelColumn Matchup and scoreColumn FinalValue, which the export
   already uses, so it needs no map — the three-way rename bites on community
   boards, where the logical names are fixed.
 - The AppVersion column: it joins to rulesetPrefix, so v1.0 resolves to
   <prefix>-v1.0, and that version must be declared in _input/rulesets.json
   or the import stops. Tell me the exact refusal.
 - Then publish-round.js on the collection side.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** `Dashboards\<target>\exports\` · `backend/standings/_input/` · `backend/scripts/import-ranked-boards.js`

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-g4.md`.

## G5 — Build the tool itself

> **What it creates:** the actual dashboard — a first `.html` you can open and
> paste real input into, plus the decisions that shaped it. G1 makes the
> folder; this makes the tool.

```
I want to build the tool itself, from the build guide.

NAME:              <___>
KIND:              <Ledger | Evaluator | tracker with a pipeline>
SHAPE:             <single-file HTML | source tree with a build>
WHAT IT SCORES:    <___>
PASTE TARGETS:     <one per box, with the field contract if decided>
RANKS?:            <yes — rounds, seasons, movement | no>
JOINS?:            <does any record have to find another?>
RE-RUN SEMANTICS:  <rebuild | append>
DOWNSTREAM:        <standalone | a collection's standings | contests>

Source of truth: Dashboards\new-dashboard-build-guide.md. Read it and give me
the build for THIS tool — not a summary of the guide.

Work in the guide's Part 11 order, and stop for my answer wherever it says the
decision is mine:

 1. THE README FIRST — kind, shape, re-run semantics, the AI/tool boundary.
    If that page cannot be written the design is not settled, so draft it and
    show me before anything else.
 2. THE FIELD CONTRACT for every paste target, before any parser. Give each as
    a table: which box, which field order, which separator, what a malformed
    line does.
 3. THE DATA MODEL AND PERSISTENCE — gatherCurrentState / saveState /
    loadState, and the export payload carrying appVersion and appBuildDate.
    Before any scoring.
 4. THE RESTRICTED ARITHMETIC PARSER. Everything routes through it. No eval
    anywhere.
 5. ONE calcXxx() END TO END — its pure reader, its parser, its rendering.
    Prove the loop on one tab before multiplying it.

Then write the initial .html: steps 3, 4 and 5 working, the bootstrap block,
the masthead build stamp, and enough of one tab that I can open the file and
paste real input into it. Put sample seed data in a
<script type="application/json"> island replayed through the same import path
— a seed, not an override, with localStorage winning after first open.

Carry these in without me asking, because the guide records each as something
that already went wrong here:
 - The baseline and the rendered board come from the SAME pure reader.
 - If it ranks: competition ranking, ties stand, movement rendered and never
   invented, and the MANUAL-ADD path re-snapshots — not just the paste path.
   Every clear path takes explicit snapshot keys, never prefix-derived.
 - If it joins: FIRST tell me whether the join can be designed away with a
   per-row outcome field instead of two tables — that answer decides whether
   any of the matching rules are needed at all. If it cannot: exact matching
   with case, spacing and punctuation normalised, never fuzzy. Nothing
   auto-matches. An unmatched row is named back to me with a suggested fix.
 - Settings as standalone variables plus one plain overrides object. Never
   Object.assign over a defaults object containing a nested object.
 - Companion files prefixed with the project name, from the first file.
 - Validate syntax and diff the function list after every edit.

Then tell me what remains: the integrity controls (dedupe, restore baked-in,
reset), the other tabs, the prompts (prompt G3), the test-data set, and the
calculations reference and extraction summary.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece of
material goes inside it); refusals; verification; and Missing inputs — any
value you needed that I did not give you. Use the guide's pre-ship checklist
as the verification section.
```

**Reference:** `Dashboards\new-dashboard-build-guide.md` · `Dashboards\README.md` · the nearest existing tool's `*-extraction-summary.md`

**A full worked run of this prompt** — filled header and all five parts of
the output — is in `docs/runs/worked-run-g5.md`.

**Two things this prompt will make you decide, and both are expensive later:**
re-run semantics (rebuild like Index Portfolio, or append like Sports Ledger —
one, everywhere), and whether a join exists at all. Everything else in the
guide can be added to a working tool; those two are load-bearing.

---
---

# H — Keeping this file current

## H1 — Register a new target or document

> Run this **every time** a collection or dashboard is created, **and every
> time a document is added** to either project. It is the only maintenance
> this file needs — the prompt bodies stay generic.
>
> Two branches. A target gets a registry row; a document gets a row in the
> closing table *and* a pointer from whatever it is a companion to. The
> second branch exists because the first three documents added to this
> platform were each reachable from one direction only, and each had to be
> caught by hand afterwards.

```
I want to register something new in docs/generation-prompts.md.

WHAT KIND:  <target | document>

IF A TARGET:
  TYPE:                 <collection project | dashboard/ledger | infrastructure>
  NAME:                 <___>
  FOLDER:               <___>
  LIVE FILE / SITE:     <___>
  WHAT IT DOES / FEEDS: <___>

IF A DOCUMENT:
  PATH:              <___>
  WHAT IT COVERS:    <___>
  WHEN TO REACH FOR IT: <___>
  COMPANION TO:      <which existing doc or project it belongs beside>
  DRIVEN BY A PROMPT?: <which one, or none>

═══ TARGET BRANCH ═══

1. Add the row to the correct registry table in
   docs/generation-prompts.md, matching the existing columns exactly. If it
   is deliberately NOT a target — an archive, an empty folder, a project on
   its own architecture — put it in the "Not in this registry" table instead,
   with one line on what it actually is, so the question does not get
   re-opened.

2. Check whether this target breaks any assumption a prompt currently makes:
   - Does it use column labels no existing columnMap covers?
   - Does it introduce a new scoring pipeline, the way Index Portfolio's
     Python leaderboard sits beside the collection standings pipeline?
   - Does it produce an artifact no prompt currently mentions?
   If any is true, name the prompt that needs an edit and draft it. If none
   is, say so plainly — do not invent work.

3. Tell me whether it needs its own prompts/ folder, and if so which
   extraction prompts (use G3 to write them).

4. If I am here because a run reported something under Missing inputs, add
   that field to the prompt's header with a sensible marker, and say what a
   good answer to it looks like.

5. If this changed any prompt's header fields, check TWO places and say
   explicitly whether each needs an edit: "What must already exist" near the
   top of the file, since a new field often implies a new artifact, and that
   prompt's entry in the "Worked headers" appendix at the end.

═══ DOCUMENT BRANCH ═══

A document is not registered until it is reachable from TWO directions.
Check all four and report each as done or not needed — never silently skip
one:

1. THE CLOSING TABLE. Add a row to "The related documents" at the end of
   docs/generation-prompts.md: the path, what it covers, and the prompt that
   drives it if there is one. This is the index someone scans to learn what
   exists, so a document missing from it is effectively invisible.

2. THE POINTER BACK. Whatever this document is a companion to must name it:
   - a doc in TEMPLATE-OPEN-EDITION/docs/ → a row in
     new-collection-deployment-guide.md's "Where things are documented" table
   - a doc in Dashboards/ → a section in Dashboards/README.md
   - a doc inside one dashboard project → its own README.md
   Give me the exact row or section, matching that file's existing format.

3. THE PROMPT LINK. If a prompt drives this document, its Reference block
   must cite it, and the document should say which prompt drives it. If no
   prompt drives it, ask me whether one should — a document that has to be
   read rather than run is a document that gets skipped.

4. THE REVERSE CHECK. Does this document supersede or contradict anything
   already in the closing table? If it does, say which, and whether the older
   one should be retired rather than left to disagree.

═══ EITHER BRANCH ═══

End by listing every file you changed, and remind me that these documents are
updated in place, never versioned — one copy of each, always matching what is
on disk.

THE CANONICAL COPY IS `TEMPLATE-OPEN-EDITION\docs\`. That is where this file
and every companion document live and are edited. Any copy of them under
another project is a mirror, not a second original: it may be read, it must not
be edited, and where the two disagree the template's copy wins. If I ask you to
change a document, change it there — and if a mirror exists, say so rather than
editing both, because two copies kept in step by hand is the failure this
paragraph exists to prevent.

A prompt fault found by `docs/runs/prompt-eval-protocol.md` arrives here as a Missing
input or a cover item, and is registered the same way as any other.

If I am registering a BATCH — several documents at once, or a run that reported
many Missing inputs — register the set as a set: one row in the closing table
naming the collection, and one pointer from each prompt the set serves. A row
per file makes the index unscannable, which defeats the check by satisfying
it.

Return it in the five-part output contract: numbered runbook; disposition
table (every file, its path, created/edited/generated, and where each piece
of material goes inside it); refusals; verification checklist; and Missing
inputs — any value you needed that I did not give you, named as the field it
should become.
```

**Reference:** the registry tables and "The related documents" table in this file · `docs/new-collection-deployment-guide.md` · `Dashboards\README.md`

**Why the document branch is worth its length:** every gap found in this
platform's documentation so far has been the same shape — the content was
correct and the cross-reference was missing. The library pointed at the
deployment guide before the guide pointed back; the build guide was cited
inside two prompts while absent from the index of documents. Content errors
announce themselves the first time someone follows a wrong command. A missing
cross-reference never announces itself at all — the document simply goes
unread, and the work gets done the hard way.

---

## Appendix — worked headers

One filled header per prompt, with a note on the field most likely to be
filled wrong. **These show what good values look like, not what the fields
are** — the prompt block is authoritative for the field list. If an example
here is missing a field the prompt asks for, the prompt is right and this
appendix is stale.

Values are drawn from the registry so they read as real. Everything from the
first instruction line onward is appended from the prompt block unchanged.

---

### A1 — New collection

```
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

*`COLLECTION NAME` is the one with a deadline — it becomes `master.csv`'s
`collectionName` on the first matching row, which is what is written on chain
and cannot be renamed after a mint. Answer it as the name you want
permanently, not a working title.*

---

### A2 — New drop

```
COLLECTION:        gridiron-genesis
COLLECTION SLUG:   gridiron-genesis
DROP ITEM ID:      OE-002
ITEM NAME:         Week One Commemorative
DESCRIPTION:       Open edition marking the opening weekend of the 2026 season.
PRICE (SOL):       0.05
MAX SUPPLY:        unlimited
ATTRIBUTES:        Season:2026|Week:1|Type:Commemorative
ROYALTY (bps):     500
ITEM EXTERNAL URL: none
MINT STATUS:       ready
IMAGE:             not yet
```

*`COLLECTION SLUG` is separate from `COLLECTION` because one collection's
`master.csv` can hold several — `my-new-collection` carries three
(`test-mech-a`, `test-mech-b`, `test-mech`), and which one a drop joins
decides the collection name it inherits. Never assume the column count
either: that collection's CSV has 21 columns, not the template's 16.*

*`ATTRIBUTES` uses pipes, not commas — a comma anywhere in a CSV field means
the whole field needs quoting, which is why the separator is a pipe. And
`MAX SUPPLY` takes the word `unlimited`; `∞`, `infinity` and `INF` are
forbidden values per `schema.json`.*

---

### A3 — Production mint

```
COLLECTION:   gridiron-genesis
NETWORK:      mainnet
DROPS:        OE-001, OE-002
```

*`NETWORK` is the field that turns this from a rehearsal into money. Network
and slug together are the identity key, so a devnet deploy does not block a
later mainnet deploy of the same drop — but every Arweave upload from here is
paid and permanent.*

---

### A4 — Template merge

```
COLLECTION:       TEMPLATE-TEST-LEDGER
FEATURES WANTED:  everything since the fork
```

*`FEATURES WANTED` accepts "everything since the fork", and that is usually
the right answer — but say it deliberately. Whole directories the collection
never had (`backend/standings/`, `backend/methodology/`) will not appear in a
file-by-file diff, so the prompt has to be told to look for them. The rig shares
no commit with the template, so `git merge-base` cannot answer here — use the
unrelated-histories substitute recorded in `docs/open-items.md`, and read a zero
line count as "unchanged since the fork" rather than "identical to the template".*

---

### A5 — RPC proxy

```
I want to rotate the key on the RPC proxy.

COLLECTIONS IT SERVES:  my-new-collection, gridiron-genesis
CUSTOM DOMAINS:         none
REASON (if rotating):   key was committed to a public repo on 24 Aug
```

*`COLLECTIONS IT SERVES` becomes the `CORS_ALLOW_ORIGIN` list, and the Worker
is all-or-nothing per request — an origin missing from the list gets no
header at all and the browser blocks the call. List every site, plus
`http://localhost:5173`, or leave the variable unset deliberately.*

---

### A6 — Netlify project

```
COLLECTION:     gridiron-genesis
REPO:           smallen1967/gridiron-genesis
SITE NAME:      gridiron-genesis
PUBLIC SITE?:   yes
```

*`SITE NAME` shares a namespace with every Netlify user, so have a second
choice ready. `PUBLIC SITE? yes` matters more than it looks — newer projects
can default to restricted visibility and answer 401 to everyone.*

---

### A7 — Verify deploy

```
COLLECTION:  gridiron-genesis
SITE URL:    https://gridiron-genesis.netlify.app
```

*Both fields are trivial; the value is in the runbook. Do not substitute an
automated fetch for a real browser — a 401 from a tool while the site loads
fine in incognito is a known non-issue, not a finding.*

---

### B1 — Campaign

```
COLLECTION:              TEMPLATE-OPEN-EDITION
CAMPAIGN ID:             sample-campaign-002
TITLE / HEADLINE:        Sample Holders Claim Week One Free
WHO QUALIFIES:           SAMPLE-001
WHAT THEY RECEIVE:       SAMPLE-001
PRICE:                   0
ALLOCATION:              10
CLAIM LIMIT PER WALLET:  1
NETWORK:                 devnet
```

*`WHO QUALIFIES` and `WHAT THEY RECEIVE` are independent by design — a
campaign is not required to reward the same collection that establishes
eligibility. `ALLOCATION` funds a separate candy machine and does not consume
the target drop's public supply. The template ships one drop item, so this
fixture names `SAMPLE-001` on both sides — the independence is the point, not
the values.*

---

### B2 — Airdrop

```
COLLECTION:   TEMPLATE-OPEN-EDITION
DROP ITEM ID: SAMPLE-001
RECIPIENTS:   backend/recipients.csv, 48 wallets exported from get-holders
NETWORK:      devnet
```

*`RECIPIENTS` must already be a written file — `recipients.csv` does not exist
in a fresh checkout. `get-holders.js` writes one: `node scripts/get-holders.js
--slug <slug> [--drop <dropItemId>]`, which snapshots current holders.*

---

### C1 — Text card

```
COLLECTION:   TEMPLATE-OPEN-EDITION
CATEGORY:     ANNOUNCEMENT
HEADLINE:     Holder Claim Window Opens Friday
SUBHEADLINE:  none
CONTENT:      SAMPLE-001 holders can claim their reward free from Friday
              29 Aug. One per wallet, ten available, first come first served.
IMAGE:        /media/holder-claim-window.png
IMAGE ALT:    Banner reading "Holder Claim Window Opens Friday" over the
              Week One artwork, with ten available beneath it
FEATURED:     TRUE
EXPIRES:      2026-09-06T23:59:59Z
```

*`IMAGE` and `IMAGE ALT` are a pair — set one without the other and the row is
refused, because backfilling alt across a grown archive is far harder than
writing one line now. A site-relative path means the file must exist at
`frontend/public/media/…` and be committed; right in the CSV and missing from
the repo renders a broken image with no error anywhere. The alt text describes
the picture, not the announcement — a reader already has the headline.
`EXPIRES` only hides the card and enforces nothing, so set it past the date the
content stops being true, not to the deadline it describes.*

---

### C2 — Methodology

```
COLLECTION:    TEMPLATE-OPEN-EDITION
WHAT CHANGED:  just the standings
```

*"just the standings" is the common case and needs no edit to
`methodology.json` at all — everything derivable is re-derived. Answer "the
explanation" only when the prose itself is now wrong.*

---

### D1 — Declare a ranked board

```
COLLECTION:        TEMPLATE-OPEN-EDITION
SOURCE DASHBOARD:  Sports Ledger (v3.5)
BOARD ID:          nfl-games
TITLE:             NFL · Games by Final Value
WHAT IS RANKED:    games
TRACK:             subject
ENTITY TYPE:       game
SEASON ID:         2026
EXPORT FILE PREFIX:nfl-ranked
LABEL COLUMN:      Matchup
SCORE COLUMN:      FinalValue
ID COLUMN:         none — this export has no stable id column
EXPORT HEADER ROW: Position,Date,Matchup,Winner,WinScore,Spread,Total,FinalValue,AppVersion
```

*`SOURCE DASHBOARD` carries the build for a reason — `v3.5` joins to
`rulesetPrefix` to give `nfl-ledger-v3.5`, and that exact id must be declared
in `rulesets.json`. `TRACK` is `subject` for anything ranked by a value the
source computed; `consensus` is reserved for ranking those same subjects by
what participants collectively predicted, which no source produces yet.*

---

### D2 — Publish a round

```
COLLECTION:   TEMPLATE-TEST-LEDGER
BOARD(S):     music-ranking
EXPORT FILE:  music-ranking-2026-08-23.csv
EXPORT DATE:  2026-08-23
PATH:         import
ALLOW INCOMPLETE?: no
```

*This fixture had drifted from the header — it collected neither `EXPORT FILE`
nor `ALLOW INCOMPLETE?`, both of which D2 asks for. The named export does not
exist on the rig yet: `_input/boards/` is empty there, which is the gap
`docs/open-items.md` tracks as "the ranked import path has never run on the
rig". Filling it is what this fixture describes. `EXPORT DATE` is not a choice
— it asserts that a file exists whose name carries that date. The round is read from the filename rather than the file's
timestamp, so a copied or restored export keeps its place in the replay.*

---

### D3 — Community leaderboard

```
COLLECTION:        TEMPLATE-TEST-LEDGER
SOURCE DASHBOARD:  Entertainment Ledger (v1.4)
EXPORT FILE:       community-leaderboard-2026-08-23.csv
EXPORT HEADER ROW: Position,Handle,Points,Edge,Resolved,Category,AppVersion
```

*Entertainment writes `Points`, `Edge` and `Resolved` where Sports writes
`FinalPoints`, `SkillEdge` and `Predictions` — naming the dashboard is what
lets the prompt hand you the right `columnMap`. Get it wrong and the import
reads three columns as missing.*

---

### E1 — Open a contest on a collection

See **A completed header** near the top of this file.

---

### E2 — Open a contest on Index Portfolio

```
CONTEST ID:      IDX_30D_EXAMPLE
TITLE:           30-Day Index Showdown — September
QUESTION:        Which index posts the highest 30-day return by 23 September?
KIND:            index
SCORING MODE:    categorical
FIELD:           US_TECH_10, US_REIT_8, CRYPTO_L1, COMMODITY_5
                 (an illustrative field — a real contest's field is copied from
                  its own JSON, never from an example)
WINDOW:          30d
RESOLVE DATE:    2026-09-23
LOCK AT:         2026-09-16T20:00:00-05:00
```

*Put the distinguishing part of `TITLE` **before** the em dash — `title_short`
cuts there, so "US Tech 10 — Best Constituent" shortens to "US Tech 10", which
is not obviously different from the index contest. And `SCORING MODE` decides
the template: a numeric contest needs `contest-launch-numeric`, because a
reply carrying only a pick scores zero.*

---

### E3 — Capture a thread

```
TARGET:            TEMPLATE-OPEN-EDITION
SCORING DASHBOARD: Sports Ledger (v3.5)
CONTEST ID:        weekly-total-contest
CONTEST TYPE:      call the number
LOCK TIME:         Sunday 31 Aug 2026, 12:00 ET
X POST:            https://x.com/dadex2026/status/1961234567890123456

 — fill the one that matches the path —
EVENT LABEL:       NFL
```

*Two fields carry the weight. `SCORING DASHBOARD` is where the extraction
prompt lives — a collection has no `prompts/` folder, so naming only the
target leaves the model guessing. `EVENT LABEL` must be identical on every
row: the median is computed per label, so `NFL`, `NFL Week 1` and `nfl` split
one contest into three populations and quietly change everyone's error scale,
with nothing erroring.*

*On the Index Portfolio path the header reads
`TARGET: Index Portfolio` / `SCORING DASHBOARD: Index Portfolio` /
`CONTEST ID: IDX_30D_0923` / `THE FIELD: US_TECH_10, US_REIT_8, CRYPTO_L1,
MULTI_STRATEGY_FUNDS_6, MEME_COIN_5, COMMODITY_5` — copied from that contest
JSON's own `field` array, which is the only authority. Note that
`CONTEST_RUNBOOK.md` Phase 1 and E2's worked header both show a shorter,
illustrative field for this same id; copy from the JSON, never from an
example — `THE FIELD` instead of
`EVENT LABEL` beneath the same divider, because that pipeline picks from a
declared list rather than labelling one event.*

*`LOCK TIME` is the whole basis of any lateness decision either way, and this
is the one step that cannot be redone: a thread captured three days late
cannot be un-captured — so it carries date, time and timezone, never a bare
wall-clock time. `X POST` names the thread rather than leaving the runbook to
assume which post it is capturing.*

---

### E4 — Score and publish

```
TARGET:      TEMPLATE-OPEN-EDITION
CONTEST ID:  weekly-total-contest
ROUND DATE:  2026-08-31
```

*`TARGET` decides which pipeline runs — a collection goes through
`publish-round.js`, Index Portfolio through `leaderboard.py`, and the two
behave oppositely on a re-run. Name it precisely.*

---

### E5 — One-off board

```
COLLECTION:       TEMPLATE-TEST-LEDGER
BOARD ID:         nfl-w14-total-contest
TITLE:            Week 14 Highest Total
TRACK:            prediction
ENTITY TYPE:      participant
SEASON ID:        2026
RULESET VERSION:  entertainment-ledger-v1.4
SUBTITLE:         Actual highest total: 71 — Dolphins at Chargers
ENTRIES:          @gridiron_gwen called 70 on Dolphins at Chargers, off by 1
                  @overunder_owen called 66 on Bills at Chiefs, off by 5
                  @newcomer_nate called 63 on Bears at Vikings, off by 8
```

*`SUBTITLE` carries the answer so a reader can check the arithmetic — a board
cannot express score direction, so an `OffBy` column reading 1, 5, 8 otherwise
looks like the winner scored worst. `ENTRIES` must already be in rank order;
the generator refuses a board whose ranks go backwards but will not sort for
you, and does not check that your ranking is correct.*

---

### E6 — Close a contest

```
TARGET:        TEMPLATE-OPEN-EDITION
CONTEST ID:    weekly-total-contest
ANNOUNCEMENT:  ANNOUNCEMENT-001
```

*`ANNOUNCEMENT` is the `textCardId`, not the tweet URL — the runbook needs it
to tell you which card to retire. Nothing in the project closes a contest;
"closed" is three separate things that do not line up on their own.*

---

### F1 — Compose a post

```
TARGET:    TEMPLATE-OPEN-EDITION
TEMPLATE:  contest-result
RECORD ID: weekly-total-contest
BUDGET:    280
```

*`RECORD ID` matches a different column for every template — `dropItemId` for
`mint-live`, `campaignId` for `campaign-launch`, `textCardId` for
`announcement`, `boardId` for anything sourced from standings. There is no
universal id field.*

---

### F2 — New post template

```
TARGET:       TEMPLATE-OPEN-EDITION
NAME:         round-recap
SOURCE:       standings
WHAT IT SAYS: Top three plus the biggest mover, in one short paragraph.
```

*`SOURCE: standings` obliges the template to contain `{methodologyUrl}` — the
engine refuses to compose a standings template without it. It also means the
available fields come from the board being rendered, not a fixed list, so a
hardcoded `{score}` breaks on a board that publishes none.*

---

### G1 — New dashboard project

```
NAME:           Racing Ledger
WHAT IT SCORES: Horse racing meetings and participant predictions on them
SHAPE:          single-file HTML
STARTING FROM:  fork of Sports Ledger (v3.5)
PASTE TARGETS:  Meetings, Community entries, Results register
EXPORTS:        ranked meeting boards → TEMPLATE-OPEN-EDITION standings
```

*`STARTING FROM` changes the whole runbook. A fork inherits a working scoring
engine and a subject matter — and the vocabulary, which is the part that
bites: name every inherited term you intend to redefine.*

---

### G2 — Ship a build

```
DASHBOARD:     Sports Ledger
NEW VERSION:   v3.6
WHAT CHANGED:  Tie-aware ranking and movement arrows on custom stat tabs
```

*If `WHAT CHANGED` touches a scoring rule or an input format, the prompt will
tell you the build is not shippable until the prompt that feeds it can produce
the input. That is the Entertainment v1.3 failure, where a scored post type no
prompt emitted stayed unreachable for two builds.*

---

### G3 — New extraction prompt

```
DASHBOARD:     Sports Ledger
BUILD:         sports-ledger-v3.5.html
PASTE TARGET:  Horse Racing → Meetings
FIELD ORDER:   Horse | Jockey | Track | Finish | Field Size | Date
SOURCE:        published race cards and results pages
```

*`BUILD` is what the finished prompt file opens by naming, so a later reader
can tell whether it is current. `FIELD ORDER` is the contract the parser
enforces — a line with one extra field is cleanly rejected, not partially
read.*

---

### G4 — Export to a collection

```
SOURCE DASHBOARD:  Sports Ledger (v3.5)
COLLECTION:        TEMPLATE-TEST-LEDGER
BOARD:             nfl-games
ROUND DATE:        2026-08-30
```

*`ROUND DATE` must appear in the export's filename as `YYYY-MM-DD` — no date
is a hard error. The export must also carry a column named literally
`Position`; rows lacking it are dropped rather than reported.*

---

### G5 — Build the tool

```
NAME:              Racing Ledger
KIND:              Ledger
SHAPE:             single-file HTML
WHAT IT SCORES:    Horse racing meetings and predictions on them
PASTE TARGETS:     Meetings, Community entries, Results register
RANKS?:            yes — rounds, seasons, movement
JOINS?:            yes — predictions find results by meeting label
RE-RUN SEMANTICS:  append
DOWNSTREAM:        TEMPLATE-OPEN-EDITION standings
```

*`RE-RUN SEMANTICS` and `JOINS?` are the two answers that cannot be retrofitted.
Everything else in the build guide can be added to a working tool. And on
`JOINS? yes`, expect the prompt to push back before building one — a per-row
outcome field may remove the join entirely, which is how Sports Ledger avoided
the sibling's two-table hazard structurally rather than by being careful.*

---

### H1 — Register something

```
WHAT KIND:  document

PATH:                 Dashboards\Racing Ledger\racing-ledger-guide.md
WHAT IT COVERS:       The tabs, the flow, the settings
WHEN TO REACH FOR IT: Using the tool, or checking what a column means
COMPANION TO:         Racing Ledger's README.md
DRIVEN BY A PROMPT?:  none
```

*Answering `DRIVEN BY A PROMPT? none` is not the end of it — the prompt will
ask whether one should exist, because a document that has to be read rather
than run is a document that gets skipped.*

---

## Where this file lives, and why

`TEMPLATE-OPEN-EDITION\docs\generation-prompts.md`. It sits in the template so
that every collection copied from it carries the library, and it names
dashboards by registry row rather than by assumption so a collection that
never publishes rankings simply never opens section D.

The related documents, in the order you usually need them:

| File | Covers |
|---|---|
| `docs/new-collection-deployment-guide.md` | Standing a collection up, and the text-card, rankings and methodology loops |
| `backend/standings/README.md` | Board format, the two importers, **running a contest**, ties, score direction |
| `docs/post-generator-spec.md` | The `compose-post.js` contract: sources, placeholders, refusals, character budget |
| `docs/netlify-connection.md` | Deploy access |
| `docs/runs/worked-run-e1.md` | One complete E1 run — filled header and all five parts of the output. The concrete form of *What a good run gives back*; compare a real answer against it. **Not a source of truth** — where it and the scripts disagree, the scripts win |
| `docs/runs/worked-run-*.md` | **One complete run per prompt** — filled header and all five parts of the output, built against real files rather than examples. 23 of the 28 prompts have one (A3 and the four that predate this set aside): `worked-run-a1/a2/a4/a5/a6/a7`, `b1/b2`, `c1/c2`, `d1/d2/d3`, `e2/e3/e3-index/e4/e5/e6`, `f1/f2`, `g1/g2/g3/g4/g5`. Each names the project it was run against and ends with an **Appendix** of findings about its own prompt. **Not a source of truth** — where one and the scripts disagree, the scripts win |
| `docs/runs/prompt-eval-protocol.md` | How to test whether a prompt actually produces its worked run: paste it cold, score seven things, and classify each divergence as a prompt fault, an answer fault or a stale worked run. The worked runs say what a good answer looks like; this says how to find out whether the prompt yields one |
| `docs/open-items.md` | Backlog, plus a verified-state table. **Delete when forking** |
| `Dashboards\README.md` | The dashboard conventions and the AI/tool boundary |
| `Dashboards\new-dashboard-build-guide.md` | Building a new dashboard: kind and shape, the non-negotiables, ranking and snapshot timing, re-run semantics, build order. **Prompt G5 drives it** |
| `Dashboards\check-fsdest.js` | Drift check for `window.FSDEST`, the export-destination module carried inline by all five single-file tools. Run `node check-fsdest.js` from `Dashboards\`. No prompt drives it |
| `Dashboards\YouTube Ranker\*.md` | The YouTube Ranker document set — folder guide, user guide, calculations reference, migration document, session handoff. Indexed from that folder's own `README.md`; no prompt drives them |
| `Dashboards\YouTube Ranker\youtube-ranker-duplicator-handoff.md` | Reusing that architecture for other subjects: turning a dashboard's ranking tab into a standalone single-purpose Evaluator without losing its function or its pipeline into a collection. **YouTube Ranker itself is never forked** — YouTube influencer rankings for every dashboard are categories in its one ledger. Converted rankers keep their own shape, usually the X contest flow (**E1**-**E6**, **F1**). Sits under **G5**; no prompt drives it |
| `Dashboards\Index Portfolio\CONTEST_RUNBOOK.md` | The X-side contest loop, phase by phase |
| `Dashboards\Index Portfolio\POST_GENERATOR.md` | The Python post generator |

Two of those are easy to miss. **Contests are not documented in the
deployment guide** — the collection-side workflow lives in
`backend/standings/README.md`. And **`docs/open-items.md` records several
claims that earlier handoffs got confidently wrong**; check it before acting
on anything a previous session asserted.
