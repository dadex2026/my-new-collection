# Chain verification — the supply and campaign guards against a real candy machine

**Status: 3a, 3b and 3c.i run on mainnet 2026-10-21. 3c.ii-iv are waiting on a browser
and a wallet, and are marked PENDING below.** Results are written underneath each step
rather than ticked — a worked run is a fixture, and its value is that it reports the day
it was made.

> **Result so far.** Every guard written between 2026-09-03 and 2026-09-05 had been
> mutation-checked offline and had never fired against a real candy machine. Two have now.
>
> - **The cap-raise refusal works on chain (3a).** It refused to raise TEST-004 and named
>   `test-page-006` by way of the shared collection, even though that campaign never names
>   TEST-004. The override reached the plan and sent nothing.
> - **The voucher headroom floor did NOT work (3b), and its failure deployed the campaign
>   it exists to refuse.** It recognised a voucher only by `mintStatus = voucher`. TEST-001
>   reads `ready`, so the floor was skipped in silence, and after the 5-second window a
>   999-allocation campaign went to mainnet. It was closed unclaimed with its rent recovered,
>   the guard was fixed in both repos (open-items 50), and the same row was then re-run where
>   it could not deploy. The fixed guard refuses it; the old one, as a control, does not.
>
> **Total spent so far: 15,000 lamports in fees.** The campaign's 5,400,040 lamports of rent
> came back when it was closed.

---

## Target

| | |
|---|---|
| Repo | `my-new-collection\backend` — the mainnet reference. **Every write here spends real SOL.** |
| Drop | `TEST-004`, candy machine `BLGGzRUgu5KQKJCkTM7CevhJibvpf9geCmDrxerusp7P`, maxSupply 8 |
| Its collection | `DWGTLJUEyGUH33dLut6JLLbPqpHnPm8tLW2ejnj6EEcw`, shared with `TEST-003` |
| Voucher | `TEST-001`, collection `7DayQZfbPCXz5xMpkFG3RsPdsWL4hwWX9ea3EjKj2xVP` (TEST-004's `holderRequiredCollection`) |
| Live campaign | `test-page-006`, gates on TEST-003, allocation 4 — so it gates on TEST-004's collection too |
| Signer | `HGNBqMWorgwuaHqzZrXtwUcv5PjMfEotxthasxLoB3MK` |
| Template / fork at start | `cc10b9e` / `2db9607` |

---

## Step 0 — what the working tree actually held

The brief said both repos were clean. **The fork was not.** `backend/master.csv` carried
an uncommitted edit from 2026-09-08 that added 11 to `maxSupply` on all four rows
(TEST-004 8 -> 19), re-quoted every field and added a BOM. Next to it were
`master.csv.20260908-114536.bak` and `master.csv.applied.json` (`"Increment": 11,
"RowsUpdated": 4`). The `.bak` matched HEAD byte for byte once line endings were
normalised.

**Result:** the chain said `itemsAvailable 8` (step 3a), so HEAD was right and the
working copy was drift. It mattered: 3b prints maxSupply straight from `master.csv`, and
3c.i's `--write` rewrites that file. **Restored to HEAD** on the operator's instruction.
The drifted copy, the `.bak` and the `.applied.json` were moved to the session scratchpad,
not deleted.

---

## Step 3a — the cap-raise refusal (1 RPC read, no write)

```powershell
node scripts/update-candy-machine-supply.js --drop TEST-004 --items-available 9
node scripts/update-candy-machine-supply.js --drop TEST-004 --items-available 9 --yes-widens-eligibility
```

**Result: PASS, both halves.**

- First run: **exit 1, `widens_campaign_eligibility`.** It printed
  `live  test-page-006 (gates on TEST-003, which shares this drop's collection; allocation 4)`
  and the message said *"At least one of those campaigns does not name this drop: assetGate
  is written against the eligibility drop's COLLECTION"*. That is the match through the
  collection that the guard was written to make, and it is the first time it has been seen
  against chain state.
- With `--yes-widens-eligibility`: **exit 0**, `itemsAvailable 8 -> 9 (+1)`,
  *"Plan only - nothing was sent."* `master.csv` was unchanged (same hash before and after).
- Chain as read: **`itemsAvailable 8`, `itemsRedeemed 2`, remaining 6.**

---

## Step 3b — the campaign headroom floor (expected: no RPC, no SOL)

A temporary `campaigns.csv` row: `verify-floor`, eligibility `TEST-003`, target `TEST-001`,
price 0, allocation 999.

```powershell
node scripts/deploy-campaign.js --campaign verify-floor
```

Expected: the EXPOSURE block, `TEST-004  maxSupply 8  << below allocation`, and exit 1
`redeemable_below_allocation`, before any RPC call.

**Result: FAIL, and it deployed.** The EXPOSURE block printed `reward  TEST-001` with no
`(a voucher)`, no "redeemable drops" section at all, then *"Deploying to MAINNET … 5 second
window to cancel"* and:

| | |
|---|---|
| Campaign candy machine | `7rtTurhUymi3Ni1neNBFxwYBG3bBPfGAPCrxHguK2KRK` |
| Guard | `Hq4NfagPASWD6nLFWYoSoYjVXDeNk6aW5BXAnb2N7LM` |
| Deploy signature | `2YPvGVw9ac4eqA4hvBXgkbYKRj1G6jEHmSnyBCtFDERw6XgWwKqAdicRrZjoNYPt9XLLKrgXb7k6VNsstenKjkwm` |

**Cause.** `deploy-campaign.js:374`:

```js
const targetIsVoucher = (targetDrop.mintStatus || "").trim().toLowerCase() === "voucher";
```

The floor runs only `if (targetIsVoucher)`. TEST-001's `mintStatus` is `ready`. It is a
voucher in function, because TEST-004 names its collection as `holderRequiredCollection`,
but not in its label. The guard identified vouchers by what the row says rather than what
the chain will accept, and when it found nothing to check it said nothing.

**How it got that far.** The brief expected a refusal before RPC, and that expectation was
not checked against the code before the command ran. A step whose failure mode is "deploys
to mainnet" should have run where it could not deploy. That is how the re-run below was done.

**Containment.**

- Exposure was small but real: free TEST-001 vouchers, one per wallet and per asset, to
  holders of the DWGTLJUE collection. The campaign was not on the site (`campaigns.json`
  was not regenerated) but could be claimed directly on chain.
- Before closing: `itemsRedeemed 0`, and the signer was the authority on both accounts.
  Candy machine 3,962,400 lamports, guard 1,437,640.
- Closed with `deleteCandyMachine` + `deleteCandyGuard` in one transaction:
  **`48b1yXFGDuhA78EYwMTbyxCrYYdrqu284Gxr4g4Qi6msapoZGymggHpCJE2AAt5VSgniqmx8VD4C5j4YNYxJP5BT`**.
  Signer balance 331,406,072 -> 336,801,112: **+5,395,040 net** (5,400,040 rent back, less
  a 5,000 fee).
- Afterwards both accounts were gone, and `getSignaturesForAddress` showed only the deploy
  and the close, so **nobody claimed**.
- `campaigns.csv` was restored to its pre-row bytes, which also removed the two columns
  (`assetLimitId`, `claimScope`) the deploy had added to every row. The
  `deployment-history.csv` line stays, because the deploy happened (fork `040b5d0`).

**Fix** (template `93defb2`, fork `b7cdcc1`): a target is a voucher if its `mintStatus`
says so **or** any `master.csv` row names its collection as `holderRequiredCollection`.

**Re-run, where it could not deploy.** The same row ran in a scratch copy of the fork's
backend with `scripts/`, `master.csv`, `campaigns.csv`, `config.json` and only `dotenv`:
no Metaplex packages, no `.env`, no `.env.admin`.

- **Fixed file:** `reward  TEST-001  (a voucher)`, then
  `redeemable drops  1 … TEST-004  maxSupply 8  << below allocation`, then **exit 1
  `redeemable_below_allocation`**, before any RPC call. That is exactly the expected output.
- **Unfixed file (control):** `reward  TEST-001` with no voucher tag and no floor. It went
  straight to the deploy, which failed only on the missing package (**exit 3,
  `blockchain_error`**). Without the sandbox, that is a second deploy.

---

## Step 3c.i — cut TEST-004 to what it has already minted (1 write)

Voucher snapshot first (DAS `getAssetsByGroup` on `7DayQZfb…`), so step ii can be judged
by asset id rather than by eye:

| Asset | Owner | State |
|---|---|---|
| `GbP7zuCst4pvP7Wi7MNqKH9Hae8KXAXhookZstR8NZHW` | `4hGRvfHbhAjkn46ATggGHgefsHGKeCi4jxcL6BcDpDU7` | live |
| `Fth3h6SMeun3XDMQhc8FoSixFNtmfeAcLw4qmdA4LuUf` | `7XJJvj5N4aBMNyX9g5NZqSEzi9vY6vYxWydezMZvC4n9` | live |
| `62FPZVzWXprvxDPyy5S5AiSA83UgbZoqNrakRH29AowK` | `FDLfcGUGT9ZTNo6eQminuprHkJLTSWhCo95RmDDmXSDR` | burnt (the item 34 redemption) |

```powershell
node scripts/update-candy-machine-supply.js --drop TEST-004 --items-available 2 --write --yes
```

**Result: PASS.**

- Signature
  **`3VR2tB2GDZ5CauPvdwtAW3fsEnCjm3XcmuMmsZRevLhfBJ9zLuQWdiNEmyxyaRaFKaPmrVbUUqRQaKDgvNj5ZSQA`**,
  confirmed 04:19:01Z.
- Logged *"Supply updated and read back matching"* and wrote `maxSupply 2` to `master.csv`.
- An independent read afterwards: **`itemsAvailable 2`, `itemsRedeemed 2`.** TEST-004 is
  full on chain, and the registry still says 8.

**Finding, minor.** Both this script and the one-off close script finished their work and
then did not exit, and were each left running past a 3-minute timeout. The log shows success
eight seconds after sending. Something holds the event loop open after `sendAndConfirm`.
That costs nothing, but an operator watching a silent terminal will reasonably press Ctrl+C
and then wonder whether the write landed. Not yet investigated.

---

## Step 3c.ii — the mint pre-check against a full edition — PENDING

Do **not** regenerate the registry first. The point is a card that still believes there is room.

```powershell
cd C:\Users\User\Desktop\my-new-collection\frontend
npm run dev -- --strictPort
```

`--strictPort` matters. The RPC proxy allows `http://localhost:5173` and nothing else, so
Vite moving to 5174 would look like an RPC outage (item 36). Open `http://localhost:5173`,
connect a wallet holding a TEST-001 voucher (`7XJJvj5N…` holds `Fth3h6SM…`), and click
**Mint** on TEST-004.

Expect: *"This edition is full - 2 of 2 minted. Your voucher was NOT used..."*, the sibling
editions with room, and **no signature prompt**.

**Then confirm the voucher is still there** by re-running the DAS snapshot. `Fth3h6SM…`
must still read `live`, owned by `7XJJvj5N…`. That this voucher survives has never been
observed.

**Result:** _pending_

---

## Step 3c.iii — the sold-out card, before and after a wallet connects — PENDING

```powershell
cd C:\Users\User\Desktop\my-new-collection\backend
node scripts/generate-registry.js
npm --prefix ..\frontend run build
```

Expect: the card reads **"2 / 2 minted - SOLD OUT"** with a disabled button, **and the
button is still disabled after a wallet connects.** That second part is the whole of item 46:
before the fix, `renderMintButtons` reset every button to an enabled "Mint".

**Result:** _pending_

---

## Step 3c.iv — restore — PENDING

```powershell
node scripts/update-candy-machine-supply.js --drop TEST-004 --items-available 8 --write --yes --yes-widens-eligibility
node scripts/generate-registry.js
npm --prefix ..\frontend run build
```

`--yes-widens-eligibility` is needed because the restore raises the cap from 2 to 8 under
`test-page-006`, which is the 3a refusal working as designed.

**Result:** _pending_

---

## What this run does and does not establish

- **Does:** the cap-raise refusal matches a campaign through the shared collection on real
  chain state, and its override plans without sending. The voucher floor, as fixed, refuses
  a voucher-by-function target. A campaign candy machine and guard can be closed in one
  transaction with the rent recovered.
- **Does not, yet:** anything in the browser. The mint pre-check, the sold-out card and the
  item 46 button have still never run, and those are the exact paths where items 36, 37, 39,
  45 and 46 were all silent failures.
- **Does not:** test the floor's live-headroom half. By design the floor checks `maxSupply`
  offline only; `remaining >= outstanding vouchers + public sales` still has to be read per
  drop with `update-candy-machine-supply.js`.
