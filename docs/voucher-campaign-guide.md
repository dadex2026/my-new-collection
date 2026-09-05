# Vouchers as a campaign reward

**A holder of one open edition claims a voucher, first come first served. The voucher is
then redeemable for any one open edition in the collection, chosen by the holder.**

This is the inversion of the original voucher design, where a voucher was airdropped to
establish eligibility. Here the voucher *is* the reward, and it carries the choice.

**Status.** Stage C is verified on mainnet (2026-09-03, `docs/runs/rehearsal-test-004.md`).
Stages A and B use `deploy-collection.js` and `deploy-campaign.js` unchanged, both of which
have run on mainnet before — but **this particular combination has never been run**, and
the honest gap is named at the end.

---

## The shape

Two collections and two candy machines. The voucher sits between them.

| | What it is | Guards | Who pays |
|---|---|---|---|
| **Claim** | A campaign candy machine minting a voucher into the **voucher collection** | `assetGate` on the open edition's collection, plus `assetMintLimit` | the claimer |
| **Redeem** | Each open edition's own candy machine, `holder` group | `assetBurn` on the **voucher collection** | the redeemer |

`deploy-campaign.js`'s header states it directly: eligibility is cross-collection **by
design** — the collection that establishes who qualifies need not be the collection the
reward comes from. That seam is what makes this work with no new deployment code.

### Why a voucher rather than a direct reward

A campaign can already mint a specific reward to eligible holders. A voucher is worth the
extra layer only when the reward is **a choice among N editions**, because no guard can
express "one of these, then no more":

- `assetGate` checks that a wallet still *holds* something. It consumes nothing, so one
  asset admits unlimited claims across unlimited campaigns.
- `assetMintLimit` caps claims per asset **per candy machine**. N editions means N
  machines, so it caps nothing across them.
- `assetBurn` **consumes** the asset. That is the only mechanism in this codebase that
  makes a second redemption impossible, and it works because the thing being spent is a
  token whose whole purpose is to be spent.

All 31 guards were enumerated when this was first investigated; nothing reads which drop
minted an asset. The voucher exists to turn an off-chain eligibility decision into an
on-chain bucket the guards can see.

---

## Per collection — the checklist

Run this once in each collection copied from the template. **Nothing is shared between
collections:** each deploys its own voucher collection, its own campaign machine and its own
claim counters, and `assetBurn` names one exact `requiredCollection` address, so one
collection's voucher is not spendable in another. Slugs are local — `collectionSlug` reaches
the chain only as the fallback for `collectionName` (`deploy-collection.js:349`) — so the
same two slugs can be reused in every collection. Set `collectionName` and it never matters.

**Two slugs.**

| slug | rows | candy machine? |
|---|---|---|
| `<name>` | the open editions, including whichever one gates eligibility | one per drop |
| `<name>-voucher` | one row, `mintStatus: voucher` | **never** — `deploy-candy-machine.js` refuses it |

**Three numbers.** The only part that is not mechanical.

| | set to | why |
|---|---|---|
| eligibility drop's `maxSupply` | the guest list | bounds total claims; preflight refuses blank or `unlimited` |
| **every** redeemable drop's `maxSupply` | public sales **+** outstanding vouchers | the holder picks which drop, so each one carries the whole liability, not a share of it |
| `allocation` in `campaigns.csv` | how many vouchers exist | the real ceiling is `min(allocation, eligibility cap)` |

**Build order**, all in the new collection's folder:

```
node scripts/preflight.js
node scripts/deploy-collection.js --slug <name>
node scripts/deploy-collection.js --slug <name>-voucher
node scripts/deploy-candy-machine.js --slug <name>          # editions only
node scripts/deploy-campaign.js --campaign <campaignId>
# then per redeemable drop, read-only first, every time:
node scripts/update-candy-guard.js --drop <id> --burn-collection <voucher collectionAddress> --read-only
node scripts/update-candy-guard.js --drop <id> --burn-collection <voucher collectionAddress> --write --yes
node scripts/generate-registry.js
node scripts/generate-campaigns-registry.js
```

**Afterwards, two read-only commands answer "where am I":**

```
node scripts/get-holders.js --slug <name>-voucher --counts --dry-run
node scripts/update-candy-machine-supply.js --drop <id>
```

The first is what you still owe — it skips `burnt` assets, so live vouchers *are* the
unredeemed liability. The second prints `itemsAvailable`, `itemsRedeemed` and `remaining`
for one drop. The invariant to hold, checked against **every** redeemable drop and not only
the gating one:

> `remaining` ≥ outstanding vouchers + public sales you still intend

**If the gating edition sits inside `<name>`** — which is the shape below — then eligibility
is "holds anything in `<name>`", a redeemed edition is itself eligible, and every supply
raise prompts for `--yes-widens-eligibility`. All three are consequences of one choice, and
all three are fine; they are listed so the choice is made rather than discovered. The
alternative is a third slug for the gating edition, which costs one more
`deploy-collection.js` and buys even distribution and unprompted raises.

---

## Stage A — the voucher collection (once)

A voucher is an NFT and needs everything an NFT needs.

1. **Give it its own `collectionSlug`** in `master.csv` — e.g. `founders-voucher` — with a
   single drop row, e.g. `VOUCHER-001`. Not a slug shared with anything else; see the
   traps.
2. `prepare-images.js` → `upload-images.js` → `generate-metadata.js` → `upload-metadata.js`
   for the voucher art and metadata.
3. **`collectionImage` on that row becomes the voucher collection's permanent on-chain
   `uri`, and no script uploads it** (open-items 35). It is typed in by hand, once, and
   cannot be changed afterwards.
4. `preflight.js`, then `deploy-collection.js`.
5. **Do not run `deploy-candy-machine.js` for the voucher drop.** A voucher must not be
   publicly mintable; the only way to get one is to claim it. Since 2026-09-03 this is
   enforced rather than remembered: that script refuses any slug whose rows declare
   `mintStatus: voucher`, or whose collection is named as another drop's
   `holderRequiredCollection`. Neither can undo a machine already deployed. `deploy-campaign.js` creates
   its own candy machine and mints into the target collection, so the voucher drop needs a
   deployed `collectionAddress` and a real `uri` and nothing else
   (`deploy-campaign.js:270-287, 336-348`).

## Stage B — the claim campaign

6. One row in `campaigns.csv`:

   | column | value |
   |---|---|
   | `eligibilityDropItemId` | the open edition whose holders qualify |
   | `targetDropItemId` | `VOUCHER-001` |
   | `price` | `0` for a free claim, or a small fee |
   | `allocation` | how many vouchers exist — this is the first-come cap |

   plus the display columns (`title`, `eligibilityText`, `rewardText`, `soldOutText`, …).

7. `deploy-campaign.js` builds the campaign candy machine with
   `assetGate: { requiredCollection: <eligibility collection> }`,
   `assetMintLimit: { id: 1, limit: claimLimit, requiredCollection }`, and
   `itemsAvailable: allocation`. `price` of 0 omits `solPayment` entirely rather than
   setting it to zero.
8. `generate-campaigns-registry.js`, rebuild, deploy the site.

**First come first served is enforced on chain, not in the interface.** When
`itemsRedeemed` reaches `allocation` the program returns `insufficientItemsRemaining` and
the card shows `soldOutText`. `assetGate` consumes nothing, so the claimer keeps the open
edition that qualified them.

## Stage C — redemption

9. For every open edition a voucher should be spendable on:

   ```
   node scripts/update-candy-guard.js --drop <id> --burn-collection <voucher collectionAddress> --read-only
   node scripts/update-candy-guard.js --drop <id> --burn-collection <voucher collectionAddress> --write --yes
   ```

   New drops instead deploy with
   `deploy-candy-machine.js --holder-collection <voucher collectionAddress>`.
10. `generate-registry.js`, rebuild, deploy.
11. The holder opens any migrated drop and mints. `assetBurn` consumes the voucher — one
    voucher, one edition, chosen by them.

---

## Sample rows

A worked example, `Founders Voucher`. Card previews of exactly these rows are in
`Claude outputs/voucher-preview.html`.

**`master.csv` — the voucher's own collection.** Its own slug, one drop, no candy machine.

| column | value |
|---|---|
| `collectionSlug` | `founders-voucher` |
| `collectionName` | `Founders Voucher` |
| `collectionDescription` | One voucher, redeemable for any single edition in the Founders collection |
| `collectionImage` | **pasted by hand** — becomes the permanent on-chain `uri`, and no script uploads it |
| `dropItemId` | `VOUCHER-001` |
| `itemName` | `Founders Voucher` |
| `itemDescription` | Burn to mint any one edition. One voucher, one edition, your choice. |
| `itemImage` | written by `upload-images.js` |
| `sellerFeeBasisPoints` | `500` |
| `attributes` | `Type:Voucher\|Redeems:Any one edition` |
| `maxSupply` | `250` |
| `price` | `0` — never publicly minted; the campaign sets what a claim costs |
| `mintStatus` | **`voucher`** — not `ready`. This is a declaration, not a status: `deploy-candy-machine.js` refuses to deploy a candy machine for any slug carrying it, and preflight's `not_a_mintable_voucher` reports it. True from the moment the row is typed, which is the window the derived check cannot cover |

**`campaigns.csv` — the claim.** `allocation` is the first-come cap and the only thing
enforcing it.

| column | value |
|---|---|
| `campaignId` | `founders-voucher-claim` |
| `title` | `Founders Voucher` |
| `headline` | `Holder Reward` |
| `description` | Hold a Founders Edition, claim a voucher redeemable for any one edition. |
| `eligibilityText` | You must hold a Founders Edition to claim |
| `rewardText` | Receive 1 Founders Voucher |
| `priceText` | Free — network costs only |
| `allocationText` | 250 available |
| `claimText` | Claim voucher |
| `soldOutText` | All 250 claimed |
| `eligibilityDropItemId` | `OE-001` — **its whole collection qualifies**, not just this drop |
| `targetDropItemId` | `VOUCHER-001` |
| `price` | `0` |
| `allocation` | `250` |

**Per edition, written by the migration**, and readable in `master.csv` afterwards:
`holderRequiredCollection` = the voucher collection's address, `holderPrice` = `0` for a
free redemption or e.g. `0.005` for a discount.

---

## Free or discounted, and changing your mind

`holderPrice` is the whole knob, per drop, independent of the public price on the same
machine.

| `holderPrice` | Holder group contains | Redeemer pays |
|---|---|---|
| `0` or blank | `assetBurn` alone — **no `solPayment` guard at all** | 2,482,840 lamports ≈ 0.0025 SOL |
| `0.005` | `assetBurn` + `solPayment` 0.005 | ≈ 0.0025 + 0.005 SOL |

Zero **removes** the guard rather than setting it to zero. A zero-lamport `solPayment` is
still a live guard with a destination account to satisfy, which is not the same thing.

Set it at migration with `--holder-price`, or at create time with
`deploy-candy-machine.js --holder-collection <a> --holder-price 0.005`.

**Changing it afterwards** needs `--set-holder-price`, because the migration deliberately
refuses a guard that already has groups:

```
node scripts/update-candy-guard.js --drop OE-001 --set-holder-price 0.005 --write --yes
node scripts/update-candy-guard.js --drop OE-001 --set-holder-price 0 --write --yes    # back to free
```

That mode edits **only** the holder group's `solPayment`. It reads the burn collection off
the chain rather than taking it from an argument, refuses a guard whose groups are not
exactly `[public, holder]`, refuses one whose holder group has no `assetBurn`, and refuses
one whose default set is not empty — so it cannot turn a paid drop into a redeemable one,
cannot repoint the burn, and cannot quietly reprice something that was never a voucher
route. Same read-back as the migration, same exit 3 on a mismatch.

---

## The voucher's own card

The voucher needs a `master.csv` row, and `generate-registry.js` emits every row, so the
voucher appears in the drop grid as its own card with a Mint button that cannot work —
`mint.ts` answers *"This drop hasn't been deployed on-chain yet"*, which is true and
unhelpful. A voucher is never meant to be minted directly.

Giving the voucher its own `collectionSlug` (which you should anyway) means the collection
filter hides it. Making the grid skip drops with no `candyMachineAddress` would fix it
properly and would also hide editions that are genuinely not deployed yet. **That is a
decision, not an oversight** — it has not been made.

---

## What it costs, and who pays

Every figure measured on mainnet 2026-09-03.

| Step | Lamports | Paid by |
|---|---|---|
| Claim a voucher | 3,469,680 rent + 85,000 fee + price | the claimer |
| Redeem it | 3,469,680 rent + 85,000 fee − 1,071,840 burn refund = **2,482,840** | the redeemer |
| Migrate one drop to guard groups | **422,600**, once | you |
| Deploy the voucher collection | one `deploy-collection.js` | you |

**Claiming costs you nothing per participant.** Airdropping vouchers instead costs
0.00347968 SOL *per recipient* out of the treasury, and reaches people who never wanted
one. Pull beats push here on both counts.

**The voucher layer costs the holder about 2,397,840 lamports of pure friction** — the
voucher's rent minus what its burn returns (a burn reallocates the account rather than
closing it, and gives back about 31%). That is the price of expressing "choose one of N".
It buys real optionality; it is not free and it is not recovered.

---

## Seven things that will bite

(Six until 2026-09-05, and the heading said five over six items for as long as anyone
had been reading it. Recount the bold lines rather than trusting this parenthesis.)

**`assetGate` is collection-granular, not drop-granular.** "Holders of open edition X" is
enforced as "holders of anything in X's *collection*" — `deploy-campaign.js` reads
`eligibilityDrop.collectionAddress` and nothing finer. If X shares a `collectionSlug` with
sibling drops, their holders qualify too. `TEST-003` and `TEST-004` share one today, which
is a live example rather than a hypothetical. Give any gating edition its own slug.

**Both counters by default; one per person is still not achievable.** Since 2026-09-03
`deploy-campaign.js` attaches `mintLimit { id: 1 }` **and**
`assetMintLimit { id: 2, requiredCollection }`. Guards are conjunctive, so a claim needs
both to pass. They close different holes and neither closes both:

| guard | counter seeded by | stops | leaves open alone |
|---|---|---|---|
| `mintLimit` | payer + machine | one wallet claiming once per edition it holds | passing an edition to a fresh wallet and claiming again |
| `assetMintLimit` | the **NFT** + machine | recycling - the counter rides with the asset | a wallet claiming once against each edition it holds |

Together: **one claim per wallet and one per asset**, which is what people assume "one
reward per holder" means. `--per-wallet` and `--per-asset` each attach only one, and are
mutually exclusive.

The ids are fixed and written back so the frontend never assumes them: `claimLimitId` for
`mintLimit`, `assetLimitId` for `assetMintLimit`. In `--per-asset` mode `assetMintLimit`
keeps id 1, matching every campaign deployed before this change; those rows carry no
`assetLimitId`, so `campaign.ts` falls back to `claimLimitId` for exactly that reason.

The ceiling is worth stating plainly: this enforces one per **wallet**, and wallets are
free. Someone can move each edition to a fresh wallet and claim once from each. Nothing on
chain knows about people. If one per person is the real requirement, the lever is an
off-chain allowlist built from a snapshot you curate, not a guard.

Campaigns already deployed are unaffected — their guards were fixed at deploy time. Their
rows carry no `claimScope`, which reads as `asset`, which is what they are. The frontend
must send mint args matching the guard actually deployed (`mintLimit` takes `{ id }`,
`assetMintLimit` takes `{ id, asset }`), and `claimScope` in the registry is how
`campaign.ts` knows which.

**There are no cross-campaign limits.** Two voucher campaigns means two vouchers per
holder. If "one voucher ever" matters, that is one campaign.

**Migration rewrites a live machine.** Each `update-candy-guard.js --write` changes the
terms of a drop people may already be minting. Run `--read-only` first, every time; the
script re-reads the account afterwards and exits 3 if it disagrees with the plan.

**Until 2026-09-03 the card never showed the holder price.** `ui.engine.ts` rendered
`price` alone, so an edition that was free to a voucher holder advertised the full price
and said otherwise only in the status line, after they had decided not to click. It now
renders "Free with a voucher" or "<n> SOL with a voucher" whenever the drop has a holder
route — shown to everyone, not only to wallets holding one, because the offer is the
argument for claiming a voucher in the first place.

**Raising the eligibility drop's cap re-opens the farming hole.** `assetGate` is written
against the eligibility drop's *collection*, and `assetMintLimit` gives every asset in it a
fresh claim counter, so the number of claims a campaign can ever serve is bounded by the
number of eligible assets that exist. Cap that drop at 500 and the ceiling is
`min(allocation, 500)`. Raise it to 5,000 mid-campaign and the ceiling moves with it — for
5,000 lamports, from a script whose whole purpose is that raising a cap should be cheap and
routine. `preflight.js` cannot catch this: `campaign_eligibility_capped` runs at *deploy*
time, and this happens afterwards. Since 2026-09-05
`update-candy-machine-supply.js` reads `campaigns.csv` and **refuses a raise on a drop any
live campaign gates on** unless `--yes-widens-eligibility` is passed; it names the campaigns
and how many claims the raise would add. A cut is never refused, and neither is a raise on a
drop nothing gates on. `--candy-machine <address>` is not a way around it — the drop is
resolved from the address.

That guard matches **by collection, not by drop id**, because `assetGate` does. With `OE-001`,
`OE-002` and `OE-003` sharing one `collectionSlug`, a campaign gating on `OE-001` is gating
on all three, and raising any of them widens it — so all three are refused, and the message
says which campaign it is and why a drop it never names is affected. The first version of
this guard compared drop ids and let the siblings through; it was corrected the same day
(item 42). **In the two-collection shape every redeemable drop is in the eligibility
collection, so every supply raise prompts.** That is accurate rather than noisy — but a
prompt answered yes every time is not a guard, which is the argument for putting the gating
edition in its own collection if even distribution matters. `update-candy-machine-supply.selftest.js` covers the decision
offline.

**The silent fallback is an unmade decision.** `mint.ts` routes a wallet with no
qualifying asset to the `public` group and charges full price, and
`findQualifyingHolderAsset` returns null on *any* network failure — not only on genuine
ineligibility. A voucher holder whose DAS query blips buys the edition at full price
instead of redeeming, and nothing tells them. On a reward campaign that is a support
ticket where the customer is right and there is no record. Decide it before this ships.

---

## Verified, and not

**Verified on mainnet 2026-09-03** (`docs/runs/rehearsal-test-004.md`): the redemption
half. Two mints on one candy machine, `holder` burning the voucher and charging nothing,
`public` charging 1,000,000 lamports and burning nothing, with an empty default guard set
leaking into neither.

**Not verified:** this combination end to end. `deploy-campaign.js` has deployed campaign
machines on mainnet before, but never one whose *target* is a voucher collection that is
itself the burn currency for other drops. Nothing in the code makes that special — the
campaign neither knows nor cares what its reward is later used for — but that reasoning is
exactly the kind this repo has been wrong about before. **Run it once on a throwaway
before running it on a launch**, and record what happened here.

Also unobserved: `deploy-candy-machine.js --holder-collection`, the create-time path. It
shares `buildPlan` with the migration so the guard shape is one object, but `create` and
`updateCandyGuard` are different instructions and only one of them has been watched.
