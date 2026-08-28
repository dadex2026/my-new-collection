# Worked run — B1, holder-reward campaign

**Driven by prompt B1** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and the scripts disagree, the scripts win.
`backend/scripts/deploy-campaign.js`, `generate-campaigns-registry.js`,
`compose-post.js` and `backend/campaigns.csv` are authoritative.

Every column name, flag, path and rule below was read from disk.

> **Read this before running anything in it.** The registry calls
> `my-new-collection` **the mainnet reference** — not a rig and not a launch
> candidate, kept live because it holds real deployed candy machines. Every command
> here is therefore a real mainnet action spending real SOL. Exercise the sequence on
> `TEMPLATE-TEST-LEDGER` (devnet, placeholder config, never deployed) first, and treat
> the values below as a shape to copy rather than a script to paste.

---

## SAMPLE HEADER

### B1 — Generate a new holder-reward campaign

What it creates: a dedicated candy machine that lets holders of one drop claim
another. Its allocation is genuinely independent of the target drop's public supply.

```
I want to start a new holder-reward campaign.

COLLECTION:              my-new-collection
CAMPAIGN ID:             mnc-test001-test002-05
TITLE / HEADLINE:        TEST-001 Holder Reward B / Claim Test Item B
WHO QUALIFIES:           TEST-001
WHAT THEY RECEIVE:       TEST-002
PRICE:                   0
ALLOCATION:              5
CLAIM LIMIT PER WALLET:  1
NETWORK:                 mainnet

Give me the runbook, from CSV row to live claim button to announcement post.
```

**Notes on the filled values:**

- **COLLECTION is the registry value verbatim** — `my-new-collection`, the folder
  name, not the display title.
- **WHO QUALIFIES / WHAT THEY RECEIVE are `dropItemId`s**, both already deployed:
  `TEST-001` (Test Item A, the eligibility drop) and `TEST-002` (Test Item B, the
  reward). Both resolve to rows in `backend/master.csv` carrying a real
  `collectionAddress`. B1's must-exist line is "both drops deployed · a funded
  deployer," and this is what "deployed" means in practice.
- **PRICE `0` is the functional value.** `priceText` is a separate, decorative column.
- **CLAIM LIMIT PER WALLET is not a CSV column you fill** — it is the
  `--claim-limit` flag on the deploy command, defaulting to `1`. The CSV's
  `claimLimit` column is written back by the script afterwards.
- **CAMPAIGN ID** follows `deploy-campaign.js`'s own usage shape
  (`MYCOL-OE001-OE002-132`): collection, eligibility, target, allocation. Note the
  live file already carries `test-combined-check` doing `TEST-001 → TEST-002` at
  0.001 SOL; a second campaign over the same pair is legal but wants a distinct id.

---

## PART 1 — RUNBOOK

### 1. The `backend/campaigns.csv` row — all 21 columns in header order

```
campaignId,title,headline,description,eligibilityText,rewardText,priceText,allocationText,claimText,soldOutText,eligibilityDropItemId,targetDropItemId,price,allocation,campaignCandyMachineAddress,eligibilityCollection,targetCollection,network,treasury,claimLimitId,claimLimit
```

The row to append, with the seven trailing fields left empty:

```
mnc-test001-test002-05,TEST-001 Holder Reward B,Claim Test Item B,Holders of TEST-001 can claim TEST-002,You must hold TEST-001 to participate.,Receive 1 TEST-002,FREE,5 available,Claim Reward,All rewards have been claimed.,TEST-001,TEST-002,0,5,,,,,,,
```

| # | Column | Kind | Value | Notes |
|---|---|---|---|---|
| 1 | `campaignId` | key | `mnc-test001-test002-05` | The `--campaign` argument and the `--id` for the launch post. |
| 2 | `title` | **display** | TEST-001 Holder Reward B | |
| 3 | `headline` | **display** | Claim Test Item B | First line of the launch post. |
| 4 | `description` | **display** | Holders of TEST-001 can claim TEST-002 | |
| 5 | `eligibilityText` | **display** | You must hold TEST-001 to participate. | In the post. **Does not gate anything.** |
| 6 | `rewardText` | **display** | Receive 1 TEST-002 | In the post. |
| 7 | `priceText` | **display** | FREE | In the post. **Does not set the price.** |
| 8 | `allocationText` | **display** | 5 available | In the post. **Does not set the cap.** |
| 9 | `claimText` | **display** | Claim Reward | Button label; registry defaults it to `Claim` if empty. |
| 10 | `soldOutText` | **display** | All rewards have been claimed. | Defaults to `Sold out` if empty. |
| 11 | `eligibilityDropItemId` | **functional, you author** | `TEST-001` | Looked up in `master.csv`; its **collection** establishes eligibility. |
| 12 | `targetDropItemId` | **functional, you author** | `TEST-002` | Looked up in `master.csv`; what gets minted. Must have real uploaded metadata. |
| 13 | `price` | **functional, you author** | `0` | SOL. `0` = genuinely free. |
| 14 | `allocation` | **functional, you author** | `5` | This campaign's own independent supply cap. |
| 15 | `campaignCandyMachineAddress` | **written by deploy** | *(empty)* | |
| 16 | `eligibilityCollection` | **written by deploy** | *(empty)* | Resolved from #11's `collectionAddress`. |
| 17 | `targetCollection` | **written by deploy** | *(empty)* | Resolved from #12's `collectionAddress`. |
| 18 | `network` | **written by deploy** | *(empty)* | From `config`. |
| 19 | `treasury` | **written by deploy** | *(empty)* | |
| 20 | `claimLimitId` | **written by deploy** | *(empty)* | Always `1`, matching the guard's `assetMintLimit.id`. |
| 21 | `claimLimit` | **written by deploy** | *(empty)* | From `--claim-limit`. |

**Which four columns actually gate — the question B1 asks explicitly.** Only
`eligibilityDropItemId` and `targetDropItemId` are inputs. `deploy-campaign.js`
validates exactly four required fields — `eligibilityDropItemId`, `targetDropItemId`,
`price`, `allocation` — finds each drop's row in `master.csv`, and fails with
`eligibility_drop_not_found` / `target_drop_not_found` if either is missing. The gate
it then writes on chain is:

```js
assetMintLimit: { id: 1, limit: claimLimit, requiredCollection: eligibilityDrop.collectionAddress }
```

So the value doing the gating at claim time is the eligibility drop's **collection
address** — and `eligibilityCollection` / `targetCollection` are *outputs* recording
what was resolved, written back after a successful deploy. Filling them by hand
achieves nothing: they are overwritten, and the guard reads the freshly resolved
address regardless.

**The display columns are the trap in the other direction.** Nothing functional reads
them, but the entire launch post is built from them —
`backend/post-templates/campaign-launch.txt` is `#source: campaigns` plus
`{headline}`, `{eligibilityText}`, `{rewardText} · {priceText} · {allocationText}`,
`{claimText} → {siteUrl}`. A row where `priceText` says FREE and `price` is `0.001`
deploys a paid campaign and announces a free one. Nothing errors.

### 2. Why eligibility and target are independent

A campaign is not required to reward the same collection that establishes
eligibility. `deploy-campaign.js` states this as design intent — the eligibility
collection (who must hold what) and the target collection (what gets minted) are
independent parameters, the explicit primary mode of this script rather than a
discount tier bolted onto an existing drop. The live file demonstrates it:
`test-combined-check` gates on collection `7DayQZ…` and mints from `4VKpPB…` — two
different collections in one campaign.

Here they happen to be different drops in the same project; cross-collection is the
same mechanism with a different pair.

### 3. Deploy

```
node backend/scripts/deploy-campaign.js --campaign mnc-test001-test002-05 --claim-limit 1
```

`--force` re-runs an already-deployed campaign. Exit codes: `0` success, including
*"already deployed, nothing to do"*; `1` validation failure (bad config, missing
prerequisite drops); `3` blockchain failure.

**Why its own candy machine, not a guard group on the target drop's existing one.**
Because the two supply pools must not share a counter: a campaign's allocation must
not consume the target drop's public-sale `itemsAvailable`. This is structurally
possible because each candy machine is its own freshly generated account — the
candyMachine is a **Signer**, not derived from the collection — so several
independent candy machines can reference the same Collection, each with its own
`itemsAvailable` / `itemsRedeemed`. Assets minted through either path belong to the
same Collection and are indistinguishable once created. A guard group would have had
to draw from one counter, which is exactly the property that must not hold.

On success the script writes the seven output columns back into the row.

### 4. Registry

```
node backend/scripts/generate-campaigns-registry.js
node backend/scripts/generate-campaigns-registry.js --fetch-claimed
```

Default output is `backend/campaigns.json`; the script **also copies to
`frontend/public/campaigns.json`** when that directory exists, and `--out <path>`
overrides the default.

**Only rows with a genuinely valid Solana address in `campaignCandyMachineAddress`
are published** — the filter is deliberate, guarding against a truthy-but-misaligned
field. An undeployed row is not an error and not a warning; it is simply absent from
the JSON, which is the answer to "why is my claim card missing." The `plan` log line
prints `totalCampaigns` against `deployedCampaigns`; a gap there is the tell.

Each published entry also carries `targetImage`, looked up from `master.csv` by
`targetDropItemId`, so the campaign card shows the reward's real image.

`claimed` is `null` by default. **`--fetch-claimed` adds a live snapshot** — it reads
each campaign's candy machine account and sets `claimed` from `itemsRedeemed`. It is
a point-in-time number, not a subscription, and a fetch failure logs a per-campaign
warning rather than failing the run, so a `claimed: null` after `--fetch-claimed`
means the fetch failed, not that nobody claimed.

### 5. Commit, push, confirm

Commit `backend/campaigns.csv`, `backend/campaigns.json` and
`frontend/public/campaigns.json`, push, then load the site and confirm the claim card
renders with the button label from `claimText`, the reward image, and a claim that
succeeds from a wallet holding `TEST-001` and is refused from one that does not.

### 6. The launch post

```
node backend/scripts/compose-post.js campaign-launch --id mnc-test001-test002-05
```

**`--id` matches `campaignId` here and nothing else** — `compose-post.js` maps the
`campaigns` source to `{ kind: "csv", file: backend/campaigns.csv, idField: "campaignId" }`.
It is not a dropItemId and not a textCardId.

Read the draft, post it, then — **if you also wrote a text card** — attach the URL:

```
node backend/scripts/set-post-url.js <textCardId> https://x.com/... [--no-generate]
```

Note the argument is a **textCardId**, not the campaignId. `set-post-url` attaches an
X URL to a card; it has nothing to say about a campaign that has no card.

### 7. Does this campaign need an ANNOUNCEMENT text card?

**Yes — recommended.** Three reasons, in order of weight:

1. **The post is ephemeral; the card is the site's record.** `campaign-launch` composes
   a draft for X. Nothing about it appears on the site, so without a card a visitor
   who missed the post finds a claim button with no explanation of what it is or who
   qualifies.
2. **`set-post-url` needs a card to attach to.** Step 6's final action is a no-op
   without one, and the post then has no link back — the thread stops being findable
   from the site months later.
3. **A campaign has an end state a card can express.** When the allocation is claimed,
   `soldOutText` changes the button, but only a card can say *what happened*. Retire it
   with status `INACTIVE`, never deletion, because `textCardId` is permanent.

The one case for skipping it: a deliberately quiet campaign that exists only for
holders already following the account. Even then, write the card and leave
`expiresAt` empty rather than skipping it.

---

## PART 2 — DISPOSITION TABLE

| # | File | Path | Disposition | What goes where |
|---|---|---|---|---|
| 1 | Campaign config | `backend/campaigns.csv` | **Edited** — one row appended | The 21-field row above, appended below the last row. Columns 15–21 left empty for the deploy to fill. |
| 2 | Drop registry | `backend/master.csv` | **Read only** | Supplies each drop's `collectionAddress` (the gate) and the target's `itemImage` (the card). |
| 3 | Deploy script | `backend/scripts/deploy-campaign.js` | Run | `--campaign mnc-test001-test002-05 --claim-limit 1`. Creates the dedicated candy machine; writes columns 15–21 back into #1. |
| 4 | Registry script | `backend/scripts/generate-campaigns-registry.js` | Run | Reads #1 + #2. |
| 5 | Backend registry | `backend/campaigns.json` | **Generated** | Default output. Deployed campaigns only. |
| 6 | Frontend registry | `frontend/public/campaigns.json` | **Generated** (copy) | Written when the directory exists. This is what the claim UI reads. |
| 7 | Post template | `backend/post-templates/campaign-launch.txt` | Read only | `{headline}`, `{eligibilityText}`, `{rewardText} · {priceText} · {allocationText}`, `{claimText} → {siteUrl}` — all from #1's display columns. |
| 8 | Compose script | `backend/scripts/compose-post.js` | Run | `campaign-launch --id <campaignId>`. Emits a draft; posting is manual. |
| 9 | Text card | `backend/textcards.csv` | **Edited** — one ANNOUNCEMENT row | Recommended, per §7. Its `textCardId` is what `set-post-url` takes. |
| 10 | Post-url script | `backend/scripts/set-post-url.js` | Run, after posting | `<textCardId> <url>` — never the campaignId. |
| 11 | Deploy log | `backend/logs/` | Generated | The `start` / `plan` / `success` JSON lines; the `plan` line is where total-vs-deployed is visible. |

---

## PART 3 — REFUSALS

1. **Will not deploy against a drop that is not in `master.csv`** — exits `1` with
   `eligibility_drop_not_found` or `target_drop_not_found` rather than guessing.
2. **Will not accept a non-positive or non-numeric `--claim-limit`** — exits `1`.
3. **Will not run without `--campaign`** — exits `1`.
4. **Will not publish an undeployed campaign** — the registry filters on a valid
   Solana address, silently. Absence is the refusal.
5. **Will not draw the campaign's allocation from the target drop's public supply** —
   the separate candy machine is the mechanism that makes this impossible, not a
   convention.
6. **Will not repair a display column that contradicts a functional one.** `priceText:
   FREE` beside `price: 0.001` deploys paid and announces free. Nothing checks.
7. **Will not treat `--fetch-claimed` as authoritative on failure** — a fetch error
   logs a warning and leaves `claimed: null`.
8. **Will not delete a text card** — retire with `INACTIVE`; `textCardId` is permanent.
9. **This runbook will not paste mainnet commands for you.** `my-new-collection` is the
   mainnet reference; rehearse on the test rig.

---

## PART 4 — VERIFICATION CHECKLIST

**Before deploying**

- [ ] `COLLECTION` is the registry value (`my-new-collection`), not the display title.
- [ ] Row has exactly 21 fields — count the commas; the seven trailing ones are present and empty.
- [ ] `campaignId` is unique in `campaigns.csv` (note the existing `TEST-001 → TEST-002` campaign).
- [ ] `eligibilityDropItemId` and `targetDropItemId` each match a `dropItemId` in `master.csv`.
- [ ] Both drops are deployed — each row carries a real `collectionAddress` — and the target has uploaded metadata.
- [ ] `price` matches `priceText`; `allocation` matches `allocationText`. Read both pairs aloud.
- [ ] `NETWORK` matches `config`'s network, and matches where those drops actually live.
- [ ] Deployer wallet funded.

**After deploying**

- [ ] Exit code `0`, and it was a real deploy rather than "already deployed, nothing to do."
- [ ] Columns 15–21 now populated; `claimLimitId` is `1`; `claimLimit` matches `--claim-limit`.
- [ ] `eligibilityCollection` equals `TEST-001`'s `collectionAddress` in `master.csv`, character for character.
- [ ] `targetCollection` equals `TEST-002`'s.
- [ ] The target drop's own public-sale `itemsAvailable` is unchanged.

**After the registry run**

- [ ] `plan` log line: `deployedCampaigns` includes this one — if `totalCampaigns` is higher, know which rows are missing and why.
- [ ] The campaign appears in **both** `backend/campaigns.json` and `frontend/public/campaigns.json`.
- [ ] `targetImage` is the reward's image, not the eligibility drop's.
- [ ] `claimLimit` is a number, not a string; `claimed` is `null` unless `--fetch-claimed` ran.

**After push**

- [ ] Claim card renders; button reads `Claim Reward`.
- [ ] A wallet holding `TEST-001` can claim; one that does not is refused.
- [ ] Claim twice from one wallet is refused at the limit.
- [ ] Launch post drafted with `--id mnc-test001-test002-05`, read before posting.
- [ ] `set-post-url` run with the **textCardId**, and the card links to the live post.

---

## PART 5 — MISSING INPUTS

| Field | Why it is needed |
|---|---|
| `PRICE TEXT`, `ALLOCATION TEXT`, `ELIGIBILITY TEXT`, `REWARD TEXT`, `CLAIM TEXT`, `SOLD OUT TEXT`, `DESCRIPTION` | B1's header collects TITLE / HEADLINE but none of the other seven display columns — and the launch post is composed **entirely** from them. I drafted values above; they should be yours. |
| `ANNOUNCEMENT CARD ID` | Recommended in §7, and `set-post-url` needs it. Not collected by B1's header. |
| `SITE URL` | `{siteUrl}` in the post template — the claim page the post points at. |
| `TREASURY` | Written back by the deploy, but its source (config vs target drop) should be confirmed before a paid campaign. Irrelevant at `price: 0`. |
| `CAMPAIGN END` | Nothing here expresses "the campaign is over" except the allocation running out. If the campaign should close on a date, that lives in the card's `expiresAt` and nowhere else. |

---

## APPENDIX — FINDINGS FOR `docs/generation-prompts.md`

Not applied.

| Where | Finding |
|---|---|
| B1 header | Collects `TITLE / HEADLINE` but not the other seven display columns, which are exactly the ones `campaign-launch.txt` interpolates. The prompt's own cover-item 1 asks the model to distinguish display from functional columns — worth collecting the display ones too, or saying they are drafted for you. |
| B1 header | `CLAIM LIMIT PER WALLET` reads like a CSV column. It is the `--claim-limit` flag; the CSV's `claimLimit` is an output. The cover text should name the flag. |
| B1 cover item 3 | Names `deploy-campaign.js` without its required `--campaign <campaignId>` argument. |
| B1 cover item 4 | Says "→ `frontend/public/campaigns.json`". The script's default output is `backend/campaigns.json`, with the frontend copy made only when that directory exists. |
| B1 cover items | Nothing asks the runbook to explain that **only rows with a valid deployed address are published**. That silent filter is the most likely support question this feature generates. |
| B1 must-exist row | "Both drops deployed · a funded deployer" — worth adding that the target also needs **uploaded metadata**, which `deploy-campaign.js` calls out separately from being deployed. |
