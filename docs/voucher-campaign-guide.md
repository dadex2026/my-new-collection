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
   publicly mintable; the only way to get one is to claim it. `deploy-campaign.js` creates
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

## Five things that will bite

**`assetGate` is collection-granular, not drop-granular.** "Holders of open edition X" is
enforced as "holders of anything in X's *collection*" — `deploy-campaign.js` reads
`eligibilityDrop.collectionAddress` and nothing finer. If X shares a `collectionSlug` with
sibling drops, their holders qualify too. `TEST-003` and `TEST-004` share one today, which
is a live example rather than a hypothetical. Give any gating edition its own slug.

**`assetMintLimit` is per qualifying asset, not per wallet.** A wallet holding five open
editions claims five vouchers, one against each. One-per-person is not expressible on
chain: `mintLimit` is per wallet, and wallets are free.

**There are no cross-campaign limits.** Two voucher campaigns means two vouchers per
holder. If "one voucher ever" matters, that is one campaign.

**Migration rewrites a live machine.** Each `update-candy-guard.js --write` changes the
terms of a drop people may already be minting. Run `--read-only` first, every time; the
script re-reads the account afterwards and exits 3 if it disagrees with the plan.

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
