# New collection — decisions worksheet

**This is for a project copied *from* the template, not for the template itself.**
`TEMPLATE-OPEN-EDITION` is never launched as a collection; it is the thing you copy.
Every new collection project gets its own blank copy of this worksheet.

Fill in the blanks. The answers go into that project's `master.csv`, `config.json` and
`template-version.json` — not back into here. Each line names the document that *owns*
the fact, so this stays an index rather than a copy that drifts.

**Lives in `docs/`, tracked and registered (prompt H1), on purpose.** It makes factual
claims, and a document outside `scripts/check-docs.js` drifts silently: until
2026-10-22 it sat in the untracked `Claude outputs/`, and an unsourced Netlify figure
sat in it for weeks looking identical to the verified lines around it. Being policed is
the point. Prompt A1 cites it; Appendix C of the deployment guide points to it.

---

## Part 1 — The seven permanent decisions

Per collection, every time. 1–6 are ordered by **what happens if you get it wrong**, not
by the order they appear in Stage 0. 7 was added on 2026-10-22 and is not ranked against
them; a wrong answer to it sends every sale and every royalty to the wrong wallet. Five
of 1–6 are irreversible on chain. The first is worse.

### 1. Deployer key custody — before anything else

**Answer:** ______________________________________________

Back this collection's key up somewhere that survives the machine, before Stage 7.

**Why first:** every other decision here is survivable — a wrong name means launching a
different collection. A lost deployer key freezes this collection permanently: no guard
migration, no cap raise, no campaign close, no metadata update — **and everything
already minted is stranded with it.** The only failure on this page that harms anyone
other than you. Nothing checks it, nothing recovers it.
*Owner: deployment guide, Stage 0.*

### 2. Collection name

**Answer:** ______________________________________________

`master.csv`'s `collectionName`, first matching row (`deploy-collection.js:349`). Never
renameable. Set `template-version.json` to the same string so the site agrees.

**Watch:** blank `collectionName` makes the **slug** the permanent on-chain name. Set it
explicitly. (Slugs are otherwise local and may be reused across collections freely.)
*Owner: deployment guide, Stage 0.*

### 3. Mint price — permanent, which Stage 0 doesn't say

**Answer:** ______________________________________________

`master.csv`'s `price` is what's charged (`deploy-candy-machine.js:279`). Set
`config.json`'s `price` to the same number so nobody trusts the wrong field.

**Verified 2026-10-22: no script in this repo changes the public price after deploy.**
`buildPlan` copies existing guards into the `public` group verbatim; `buildRepricePlan`
edits only `holder`; there is no public-price flag anywhere; and the migration refuses a
guard that already has groups. `--set-holder-price` changes the *voucher* price only.

Treat `price` as permanent unless someone writes tooling that doesn't exist. The chain
permits rewriting a guard; this repo doesn't do it.
*Owner: deployment guide, Stage 0. Verified in `update-candy-guard.js`.*

### 4. Royalty rate

**Answer:** ______________________________________________

`sellerFeeBasisPoints`, **identical on every row**. The template ships `500` (5%).
*Owner: deployment guide, Stage 0.*

### 5. The collection's on-chain image — may create work

**Answer (image URL or metadata document):** ______________________________________

Whatever `collectionImage` holds becomes this collection's permanent `uri`
(`deploy-collection.js:350`), and **no script uploads it.** Typed by hand, once.

**This choice has an implementation cost.** An mpl-core collection `uri` is
conventionally a *metadata JSON document*, and **nothing generates collection-level
metadata.** Choosing the conventional shape creates work that does not exist. Choosing a
raw image URL is what the four August mainnet collections did, and consumers that fetch
and parse it get an image.
*Owner: `docs/open-items.md` item 35.*

### 6. The art — answer this before 5

**Answer:** ______________________________________________

Generated text card, or your own artwork? `generate-images.js` removes the image-file
requirement for `itemImage`; whether a text card is what you *ship* is a product
judgement, not a technical one.

**Interaction with 5:** generated cards make a generated collection image the consistent
choice — and there is still no uploader for it.

**Prerequisite:** generated cards are not yet cleared for a real mint anywhere — see
Part 4. If this collection ships them, that clearance has to happen first.
*Owner: deployment guide Stage 7.1; `docs/open-items.md` items 35, 53.*

### 7. Treasury — which wallet receives the proceeds

**Answer:** ______________________________________________

**`backend/config.json`'s `treasury` is the one that is read.** It becomes the `public`
group's `solPayment` destination on every candy machine (`deploy-candy-machine.js:313`),
every campaign's payment destination (`deploy-campaign.js:555`), and the collection's
Royalties creator at 100% (`deploy-collection.js:327`). Preflight refuses it if it is the
deployer's own wallet (`preflight.js:235`).

**`deployment.json`'s `treasury` is inert:** no deploy script reads it, and it is
documentation only. The template's copy holds a stale value on purpose (prompt A1's
fixture, per its `_why`); setting it changes nothing on chain.

No script in this repo changes the `public` destination or the royalty creator after
deploy. `update-candy-guard.js` re-points only the voucher (`holder`) price's
destination, and only with an explicit `--treasury` or the drop's own row. Treat this
as permanent, like the price.
*Owner: `backend/config.json`. Deployment guide Stage 0 does not list it yet; its four
cover key custody but not this.*

### Two more, only if this collection uses vouchers or campaigns

| | Decision | Owner |
|---|---|---|
| **Item 41** | Cap the eligibility drop so campaign rewards can't be farmed. Preflight refuses an uncapped one, so it's forced — the *number* is yours. | `docs/voucher-campaign-guide.md` |
| **Item 47** | May a voucher holder buy at the public price instead of redeeming? Today `mint.ts` routes on holding alone, so their next mint always burns the voucher. | `docs/open-items.md` item 47 |

---

## Part 2 — This collection's real `master.csv`

Your actual drops: names, attributes, prices, `maxSupply`, and the same royalty on every
row.

**Leave blank — Stage 7 fills them:** `itemImage`, `uri`, and every address column.

**Copy from the template, not from a launched collection.** If you do copy a launched
one, blank every column Stage 1 lists — including `itemImage` and `uri`, which if copied
make both upload steps skip every row and ship the previous collection's art.
*Owner: deployment guide, Stage 1.*

---

## Part 3 — Per-collection setup

**Its own Netlify site**, and **its own domain added to `CORS_ALLOW_ORIGIN`** in
`rpc-proxy/wrangler.toml`. Miss the second and every browser mint on this collection
fails exactly as in item 36 — which presented as "RPC unavailable" and survived weeks
because that reads like somebody else's outage.

**Funding:** SOL in this collection's deployer wallet, plus an Irys balance for images
and metadata. **Uploads must be mainnet** — Irys devnet uploads don't work from this
machine (item 56).

**Account-level, not per collection: Netlify credit** (`docs/open-items.md` item 62).
`my-new-collection` had **27 deploys skipped** for *"account credit usage exceeded"*,
2026-08-28 to 09-06. Every push looked successful, and the live site kept serving the
previous build. The account is on the **Free plan at 300 credits per usage period**, and
**every project on it shares that one budget**, the template's own project included.
Four checks before launch:

1. Check this period's usage in the Netlify dashboard. The API does not show it.
2. Set a credit alert. None was set.
3. **Stop builds on the template's Netlify project.** It has no launch to protect, and it
   was 33 of the period's 37 deploys on the shared budget.
4. After the launch push, **confirm that commit's deploy shows *Published*** in the
   project's Deploys list. A green push is not evidence of a deploy.

*Owner: deployment guide, Stage 8.*

---

## Part 4 — Settled once in the template, inherited by every copy

**Not yours to answer per collection.** These are gaps in the template's own code, so
every copy inherits them until they're closed in the template. Listed here only so a
new project knows what it has inherited.

| | What | Blocks a new collection? |
|---|---|---|
| **3c.ii–3c.iv** | Nobody has watched the mint path work in a browser: the sold-out pre-check, a voucher surviving a refused mint, or the button staying disabled after a wallet connects (item 46). Items 36, 37, 39, 45 and 46 were *all* silent failures in this path. | **Yes** — every copy ships the same unverified code |
| **Item 53** | Generated cards have never been seen in a wallet or on a marketplace. Step 7.1 carries a "not yet cleared for a real mint" warning. | **Only if you ship generated cards** |

Both are closed by observation, not by review, and both are tracked in
`docs/open-items.md` and `docs/runs/chain-verification-2026-10-21.md`. Don't re-derive
them here.

---

## Part 5 — Then it's the guide, in order

| Stage | What happens |
|---|---|
| 0 | the seven decisions above |
| 1–5 | copy the template, repo, RPC proxy |
| 6 | preflight — **recount the check total before quoting it**; it moved when two checks went to 7.4a |
| 7.1–7.4 | generate images, upload, generate metadata, upload |
| **7.4a** | **the upload gate** — `check-upload-columns.js` and `verify-uploads.js` must both exit 0 |
| 7.5–7.7 | collection, then candy machines, then registry |
| 8 | Netlify |

Run `reconcile.js` after anything is deployed.

---

## The shortest path for a new collection

1. **Back up this collection's deployer key.** Nothing else matters if it's lost.
2. Answer 6, then 5, then 2, 3, 4 and 7.
3. Write the real `master.csv`.
4. Confirm Part 4's inherited gaps are closed — or that they don't apply to this
   collection.
5. Follow the guide.
