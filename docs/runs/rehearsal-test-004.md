# Rehearsal — voucher redemption on TEST-004

**Status: written 2026-09-03, not yet run.** Nothing below has been observed. When it
runs, record what actually happened underneath each step rather than ticking it — a
worked run is a fixture, and its value is that it reports the day it was made.

This is the mainnet rehearsal for item 34. It exists because devnet SOL is currently
unobtainable, so the alternative to rehearsing here is deploying the voucher mechanic to
a real collection having never watched it work.

---

## Why this target

Everything is chosen so that a wrong answer costs a test asset and a few thousand
lamports, and nothing else.

| | |
|---|---|
| Repo | `my-new-collection` — the mainnet reference. **Every command here spends real SOL.** |
| Drop | `TEST-004` ("Mechanics Test D"), `slug test-mech` |
| Candy machine | `BLGGzRUgu5KQKJCkTM7CevhJibvpf9geCmDrxerusp7P` |
| Its collection | `DWGTLJUEyGUH33dLut6JLLbPqpHnPm8tLW2ejnj6EEcw` ("Mechanics Test C") |
| Public price | `0.001` SOL to `7XJJvj5N4aBMNyX9g5NZqSEzi9vY6vYxWydezMZvC4n9` |
| Burn collection | `7DayQZfbPCXz5xMpkFG3RsPdsWL4hwWX9ea3EjKj2xVP` ("Mechanics Test A", = `TEST-001`) |
| Burn currency | asset `Fth3h6SMeun3XDMQhc8FoSixFNtmfeAcLw4qmdA4LuUf`, held by `7XJJvj5N…` |

`TEST-004` is not the active slug in `config.json` (that is `test-mech-b`/`TEST-002`), it
duplicates `TEST-003`, and **no new voucher collection has to be created** — a `TEST-001`
asset already sits in a wallet you control and serves as the voucher.

> **Do not assume the machine is empty.** `TEST-003` shares this collection address, so
> "zero assets in Mechanics Test C" is a claim about the collection, not about this candy
> machine. Step 1 prints `itemsRedeemed` for the machine itself. Read it.

---

## Step 0 — look, spend nothing

```powershell
cd C:\Users\User\Desktop\my-new-collection\backend
node scripts/update-candy-guard.js --drop TEST-004 --read-only
```

Free, and needs no deploy key. Confirms the machine exists, that its `mintAuthority` is
the derived candy guard PDA, and prints the guard exactly as it stands.

**Expect:** `default guards : solPayment`, `groups : (none)`, `itemsRedeemed 0`.

**Stop if** the script reports `guard_mismatch` — the machine is not wrapped the way this
migration assumes, and writing to the derived PDA would edit an account that controls
nothing.

## Step 1 — see the plan, still spend nothing

```powershell
node scripts/update-candy-guard.js --drop TEST-004 --burn-collection 7DayQZfbPCXz5xMpkFG3RsPdsWL4hwWX9ea3EjKj2xVP
```

**Expect:** default guards empty, `public` carrying the `solPayment` that was at the top
level, `holder` carrying `assetBurn` and nothing else.

The empty default set is the whole safety argument: with groups present a group inherits
any guard left at the top level and cannot remove it, so leaving `solPayment` there would
charge holders on a supposedly free redemption. Nothing is inherited because nothing is
left to inherit. **That reasoning is unverified — step 3 is what tests it.**

## Step 2 — write it, and read it back

```powershell
node scripts/update-candy-guard.js --drop TEST-004 --burn-collection 7DayQZfbPCXz5xMpkFG3RsPdsWL4hwWX9ea3EjKj2xVP --write --yes
node scripts/tx-cost.js <signature it prints>
```

One transaction. The script re-fetches the account and compares it to the plan group by
group; **exit code 3 means the write landed and is wrong** — do not mint against it.

A malformed guard does not error on write. It errors, or silently misbehaves, at mint
time. The read-back is the only thing standing between those two moments.

On success it also writes `holderRequiredCollection` and `holderPrice` onto the `TEST-004`
row of `master.csv`. Record what `tx-cost.js` reports: the fee plus whatever the guard
account's growth costs in rent is the per-drop price of this migration, and it is the
number that decides whether migrating a real launch is worth it.

## Step 3 — publish the route, then mint through `public`

```powershell
node scripts/generate-registry.js
npm --prefix ..\frontend run build
```

Deploy the site, connect a wallet holding **no** Mechanics Test A asset, and mint TEST-004.

**The question this answers:** does the `public` group still charge 0.001 SOL now that the
default guard set is empty? If the public mint is free, the group's `solPayment` did not
take effect and everything downstream is wrong. Check the balance change, not the UI text.

## Step 4 — mint through `holder`

Connect the wallet holding `Fth3h6SMeun3XDMQhc8FoSixFNtmfeAcLw4qmdA4LuUf` and mint again.

**Three things to confirm, each by looking at the chain and not at the interface:**

1. The mint succeeded and cost **no** SOL beyond fees — proving the holder group did not
   inherit the public `solPayment`.
2. Asset `Fth3h6SM…` **no longer exists**. `assetGate` would have left it in place; the
   entire reason for `assetBurn` is that it does not.
3. `node scripts/tx-cost.js <burn signature>` — **read the balance deltas and find who
   received the burned asset's rent.** An mpl-core asset costs 3,469,680 lamports of rent
   to create (measured 2026-09-02, signature `5wCokZgz`). If the burn returns that to the
   holder, an airdropped voucher is nearly free to the recipient and the campaign costs
   what it costs. If it returns to the payer, the burn **refunds the airdrop** and the
   arithmetic of every reward campaign changes. Nobody here knows which.

## Step 5 — try to mint holder twice

Same wallet, immediately. It must fail: the asset is gone, so there is nothing to burn.
This is the "choose one of N" property the whole voucher design exists to get, and it is
worth one failed transaction to see it enforced rather than assumed.

---

## What a green run does and does not establish

It establishes that this migration produces a working two-route candy machine on mainnet,
and it answers the default-versus-group question by observation.

It does not establish that `deploy-candy-machine.js --holder-collection` produces the same
thing at create time. That path shares `buildPlan` with the migration, so the guard *shape*
is the same object — but `create` and `updateCandyGuard` are different instructions and
only one of them will have been watched. Deploy one throwaway machine with the flag and
run `--read-only` against it before trusting the create path on anything real.

## If it fails

Nothing here is a dead end. `updateCandyGuard` can be run again — the script refuses a
guard that already has groups, deliberately, so restoring the original shape means editing
the plan by hand rather than re-running. `TEST-004` matters to nobody. Record what
happened in this file and leave the machine as it lies.
