# Rehearsal — voucher redemption on TEST-004

**Status: complete. Steps 0-5 run on mainnet 2026-09-03, results recorded under each step.**
Results are written underneath each step rather than ticked — a worked run is a fixture,
and its value is that it reports the day it was made.

> **Result. The voucher mechanic works end to end on mainnet.** Both routes verified on
> one candy machine by watching transactions settle: `holder` burns the voucher and
> charges nothing, `public` charges 0.001 SOL and burns nothing, and with the default
> guard set written empty neither leaks into the other. Migration costs **422,600 lamports
> (0.0004226 SOL)** per drop.
>
> Four defects were found doing it, none of them in the guard: the RPC proxy blocked every
> browser mint (open-items 36), a deploy then deleted the proxy's origin allowlist while
> the fallback was `*` (37), `get-holders.js` counted a spent voucher as held (38), and
> `mint.ts` locked out every wallet that had redeemed (39). Three of the four were only
> reachable *after* the previous one was fixed, which is the argument for running the
> whole sequence rather than reasoning about it.
>
> The original migration cost note: The read-back reported a mismatch on a migration that had in fact succeeded
> exactly as planned, because it re-fetched 124ms after `confirmed` and got a stale
> account. That is a defect in the script, not in the write, and it is fixed — but it is
> the more interesting result of the two, because a check that cries wolf trains the next
> operator to ignore it.

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

> **Run 2026-09-03 17:20Z.** As expected. `itemsRedeemed 0`, so nothing had ever minted
> from this machine whatever `TEST-003` did with the shared collection. Candy guard
> `GoKBUfw5ex9H89xxLh6LgVRUbLovDjpqLD7YytEj2cVT`, matching the machine's `mintAuthority`.
> `authority` equalled the signer (`HGNBqMWorgwuaHqzZrXtwUcv5PjMfEotxthasxLoB3MK`), and
> `solPayment` was 1,000,000 lamports to `7XJJvj5N…` — the chain and `master.csv` agreeing
> on the price, which is not something to assume.

## Step 1 — see the plan, still spend nothing

```powershell
node scripts/update-candy-guard.js --drop TEST-004 --burn-collection 7DayQZfbPCXz5xMpkFG3RsPdsWL4hwWX9ea3EjKj2xVP
```

**Expect:** default guards empty, `public` carrying the `solPayment` that was at the top
level, `holder` carrying `assetBurn` and nothing else.

> **Run 2026-09-03 17:21Z.** Exactly that, with `public`'s `solPayment` byte-identical to
> the one it was carried from — same lamports, same destination — so a public mint's terms
> did not change, they only moved somewhere a group can address them.

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

> **Run 2026-09-03 17:21Z.** Signature
> `5S9uCJ1TMmevRrY2sF8HPWButabb5oFk3MdnmLPNG61GY8yvD1waeMeN8tPT8LxfpYoaz5XHo2M8rsi76db2CgEP`,
> slot 444027048, confirmed.
>
> **Cost: 422,600 lamports = 0.0004226 SOL.** 5,000 lamports transaction fee, **417,600
> lamports rent** for the guard account growing from one guard to two labelled groups.
> Rent is 98.8% of it. For scale, one airdrop recipient costs 3,469,680 lamports, so
> migrating a drop is about **an eighth of one airdrop**, and migrating a hundred drops
> costs less than 0.05 SOL. Migration cost is not a reason to avoid guard groups.
>
> **The script then reported a READ-BACK MISMATCH, and was wrong.** It re-fetched the
> account 124ms after `sendAndConfirm` returned at `confirmed` commitment and got the
> pre-write state — empty groups, `solPayment` still at the top level. A `--read-only` run
> 42 seconds later showed the guard correct in every particular. Because the mismatch path
> exits before the CSV write, `master.csv` was left untouched, so nothing downstream
> believed in a holder route that did exist.
>
> **Three fixes, same commit as this record:** the read-back now polls up to six times over
> 12.5s and only calls a mismatch once the account has had time to propagate; group guard
> sets are unwrapped for display (the raw read printed all 31 slots per group, 29 of them
> `None`, burying the two that mattered in two hundred lines); and a new `--verify` mode
> is the resume path — it re-derives what the migration should have produced from the
> arguments, checks the guard actually on chain against it, and records the CSV columns
> only if it holds. It cannot rubber-stamp what it finds.
>
> **The lesson is about the check, not the chain.** A verification step that fires falsely
> on its first real use is worse than no verification, because what it teaches is to
> re-run `--read-only` and shrug — which is exactly the reflex that lets a genuine bad
> write through later.

## Step 3 — publish the route, then mint through `public`

```powershell
node scripts/generate-registry.js
npm --prefix ..\frontend run build
```

Run it on **localhost, not the deployed site** — three wallets hold a Mechanics Test A
asset (`4hGRvfHb…`, `FDLfcGUG…`, `7XJJvj5N…`, per `airdrop-history.csv`), so publishing the
holder route before testing it invites someone to redeem first. `npm run dev` gives the
same mainnet transactions with no audience.

> **Run 2026-09-03 20:00Z — blocked, and not by anything in this repo.** Every mint failed
> with *"RPC unavailable — couldn't reach the Solana network"*. That message is
> `describeMintError` mapping a `TypeError: Failed to fetch`, and the real error in the
> console was:
>
> ```
> Access to fetch at 'https://rpc-proxy.smallen1967.workers.dev/' from origin
> 'http://localhost:5173' has been blocked by CORS policy: Request header field
> solana-client is not allowed by Access-Control-Allow-Headers in preflight response.
> ```
>
> The origin was allowed; the **header** was not. `@solana/web3.js` sends `solana-client`
> on every RPC call, and the Worker's preflight named only `Content-Type, Authorization`.
> `Access-Control-Allow-Headers` does not vary by origin, so **the deployed Netlify site
> was blocked identically** — the browser mint path had never worked, for any drop, and
> the failure mode reads as an RPC outage rather than a configuration error. Fixed in
> `Desktop/rpc-proxy/src/index.ts`; see open-items 36. **Redo this step once that Worker
> is deployed.**
>
> Also noted: the drops grid paginates at three (`PAGE_SIZE = 3`, `ui.engine.ts:24`), so
> `TEST-004` is on page 2 and looks absent on page 1.

Then, with a wallet holding **no** Mechanics Test A asset, mint TEST-004.

**The question this answers:** does the `public` group still charge 0.001 SOL now that the
default guard set is empty? If the public mint is free, the group's `solPayment` did not
take effect and everything downstream is wrong. Check the balance change, not the UI text.

## Step 4 — mint through `holder`

Connect the wallet holding `Fth3h6SMeun3XDMQhc8FoSixFNtmfeAcLw4qmdA4LuUf` and mint again.

> **Run 2026-09-03 21:22Z — it works.** Signature
> `21EoYoYK7d24Y6eWEv1FkzdD5V4BVHawXQ9zFaGa4b1GRked9w3mYEtSyRALAP3VFSTboSQV3ezzcqpTnQ2TaXYY`,
> slot 444072496, from `FDLfcGUG…` (a TEST-001 airdrop recipient, so the holder
> path), minting asset `BpLRA1Sp…`. `itemsRedeemed` went 0 → 1.
>
> ```
> +  3,469,680  BpLRA1Sp…  (created)
> -  2,482,840  FDLfcGUG…
> -  1,071,840  62FPZVzW…
> ```
>
> **The treasury `7XJJvj5N…` does not appear at all.** No SOL was charged. With the
> default guard set written empty, the `holder` group did not inherit `public`'s
> `solPayment` — the question three sessions could not answer, settled by looking at
> a settled transaction. The arithmetic closes exactly: 3,469,680 + 85,000 fee −
> 1,071,840 refund = 2,482,840.
>
> **A burn refunds 1,071,840 lamports, about 31% — not the whole 3,469,680.** The
> account is reallocated, not closed; it kept 2,397,840. A redemption does not pay
> back what the airdrop cost, so the campaign arithmetic is airdrop cost minus a third,
> not airdrop cost recovered.
>
> **Who receives that refund is still unknown, and this test cannot say.** `FDLfcGUG…`
> was both the voucher's owner and the fee payer. Separating them needs a mint whose
> payer is not the asset's owner, which this frontend cannot produce. The step below
> asked the wrong question of the right transaction.
>
> **One defect, found only because a voucher had finally been spent.** A snapshot taken
> straight afterwards still listed all three TEST-001 holders: `get-holders.js` read
> `ownership.owner` and never checked DAS's `burnt` flag, so a spent voucher counted as
> held and the next campaign would have airdropped a replacement to everyone who had
> already redeemed. Fixed, and verified by naming the surviving two wallets before
> running it. See open-items 38.
>
> Also measured: a candy-machine mint's asset rent is **3,469,680**, identical to an
> airdropped asset. The mint route costs more only in price and transaction fee
> (85,000 here against 10,000 for an airdrop), not in rent.
>
> Two earlier attempts are worth recording. The first failed with *"has expired: block
> height exceeded"* — the mint carries no priority fee, so under load it can miss the
> blockhash window. `itemsRedeemed` proved it never landed, which is the check to run
> before retrying; `describeMintError` had a branch for exactly this case that matched
> `timed out`/`timeout`/`blockhash not found` and not the wording Solana actually uses,
> so the one message that should have said *don't blindly retry* printed the raw error
> instead. Fixed.

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

Same wallet, immediately. **Not a failed transaction — a charged one.** `mint.ts` does
not refuse when no qualifying asset is found; `findQualifyingHolderAsset` returns null and
the code falls through to the `public` group. So the second mint should succeed and cost
**0.001 SOL**, which is the "choose one of N" property enforced in the only place that
matters: on chain, by `assetBurn` having nothing left to consume.

This step is also the **only** remaining proof that `public` charges at all. Step 4
established that the holder group does not inherit a payment; it did not establish that
the public group applies one. If this mint is free, every mint on this machine is free.

> **Run 2026-09-03 21:47Z — `public` charges.** Signature
> `22KD95ty6X4AogfNLMFhus3AkwDesEsCHZKwWzCtj84bdNPnnhVht7iPiaCJ3GVMJEw8fj3GqUYyKVLyKAXsWWZL`,
> slot 444077334, asset `6MN36yqV…`.
>
> ```
> -  4,554,680  FDLfcGUG…
> +  3,469,680  6MN36yqV…  (created)
> +  1,000,000  7XJJvj5N…
> ```
>
> The treasury gained exactly 1,000,000 lamports and no account was closed — the mint took
> the `public` route, paid, and burned nothing. Every figure was predicted before the
> command was run and every one matched, which is the standard this repo holds a
> verification to.
>
> **Taken with step 4, this closes the question the rehearsal existed to ask.** The same
> candy machine charged one wallet and not the other, on the same guard account, with an
> empty default set. Nothing was inherited in either direction.
>
> The first attempt at this step was **rejected by Phantom's simulation** — *"this
> transaction reverted during simulation"* — because `mint.ts` was still matching the
> burned voucher and routing to `holder`. See open-items 39. Simulation caught it before
> it cost anything, which is worth remembering as a check in its own right.

**A note on the fallback, which is a design question and not a bug.** Because an
ineligible wallet is silently routed to `public`, a holder whose DAS query merely blips —
`findQualifyingHolderAsset` returns null on any network failure — pays full price instead
of redeeming, and nothing tells them. For a real reward campaign that is a support ticket
where the customer is right and there is no record. Worth deciding before this ships.

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
