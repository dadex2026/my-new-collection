# Worked run — E6, close a contest

**Driven by prompt E6** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and the scripts disagree, the scripts win.
`backend/standings/README.md` "Closing a contest", `generate-content-registry.js` and
`generate-standings-cards.js` are authoritative.

**Applicable project: `TEMPLATE-TEST-LEDGER`.** It closes the one-off contest the E5
fixture writes, and its `textcards.csv` contains a card that is **currently sitting in
the exact trap this prompt exists to prevent** — see §3.

---

## SAMPLE HEADER

### E6 — Close a contest

```
I want to close a contest cleanly.

TARGET:        TEMPLATE-TEST-LEDGER
CONTEST ID:    emmys-2026-drama-oneoff
ANNOUNCEMENT:  ANNOUNCEMENT-010
```

---

## PART 1 — RUNBOOK

### The thing that is easy to get wrong, first

**Nothing in this project closes a contest.** "Closed" is three separate things that
do not line up on their own.

**1 · Entries stop when you stop reading.** The deadline is a promise made in the
announcement's `content` — *"before Sunday 12:00 ET"* — enforced by nobody. A reply at
12:01 is excluded because *you* closed your capture, not because anything rejected it.
On X itself the only real close is changing who can reply, which is a manual action in
X's own interface.

**2 · `capture.complete` is your assertion that you got everyone.** Set it `false` and
the generator refuses to publish a final standing — correct, because a reply you missed
is indistinguishable from someone who did not play.

But know where the control exists. It is authorable on a **hand-written** board, and
set from the export on a **community** board. It is **not authorable on the ranked
import path**: that importer writes `complete: true` unconditionally, and
`publish-round.js` runs the import and the card generator back to back, so **there is
no seam to change it in**. On that path the flag is not a safeguard you are choosing to
trust — it is a value you cannot set. This contest is hand-written (E5), so here the
flag is real.

**3 · `expiresAt` does not mean closed. It only hides the card.**

### 3. The `expiresAt` trap — and a live example

`isTextCardVisible()` drops any card whose `expiresAt` has passed, whether or not you
have scored anything. So: set `expiresAt` to the entry deadline, publish results on
Monday, and there is a window where the announcement card has vanished and the
standings card does not exist yet. **The contest is invisible on the site precisely
while people are waiting for results.**

This collection has one right now. From `backend/textcards.csv`:

```
ANNOUNCEMENT-010,ANNOUNCEMENT,…,ACTIVE,2026-08-24T23:59:59Z
```

Status `ACTIVE`, `expiresAt` four days in the past. **It is already hidden**, and its
status says nothing about that — the row still reads ACTIVE, so anyone auditing the
CSV would conclude the card is up. Only the renderer knows. If results for its contest
were not live before the 24th, that gap has already happened.

Two ways to avoid it:

- **Set `expiresAt` past the results date**, not to the deadline. The announcement
  stays up through scoring and goes when it is genuinely stale. Fewer steps.
- **Leave `expiresAt` empty** and retire the card by hand once results are live,
  flipping `status` to `INACTIVE`. More deliberate.

### The sequence in practice

1. **At the stated time, capture the replies** — copy them somewhere before anything
   can change. (E3.)
2. **Optionally restrict replies on the X post** so late entries stop accumulating.
   Manual, in X's interface, from the account that owns the post.
3. **Score the round.** (E4, or E5 for a hand-written board.)
4. **Publish:** `publish-round.js`, then push. For this contest,
   `publish-round.js --from standings`.
5. **`compose-post.js contest-result --id emmys-2026-drama-oneoff`, read it, and post
   it as a reply to the announcement thread.** Nothing posts it for you. Then
   `set-post-url.js ANNOUNCEMENT-010 <url>` and a second push.
6. **Retire the announcement card** if you left `expiresAt` empty — `status`
   `INACTIVE`, **never deletion**, because `textCardId` is permanent. Valid statuses
   are `DRAFT`, `SCHEDULED`, `ACTIVE`, `INACTIVE`, `EXPIRED`, `ARCHIVED`; anything else
   fails the generator with `unknown_status`.

**And removing the contest's board file marks its card `ARCHIVED` on the next run
rather than deleting it**, so a finished contest stays readable.

---

## PART 2 — DISPOSITION TABLE

| # | File | Path | Disposition | What goes where |
|---|---|---|---|---|
| 1 | The X post | x.com | **Edited by hand** (optional) | Reply restriction — the only real close. |
| 2 | Board file | `backend/standings/emmys-2026-drama-oneoff.json` | **Edited** if a correction is needed; **removed** only to archive | `capture.complete` lives here on this path. |
| 3 | Wrapper | `backend/scripts/publish-round.js` | Run with `--from standings` | Publishes the standings card. |
| 4 | Standings card | `STANDINGS-EMMYS-2026-DRAMA-ONEOFF` | **Generated** | Never hand-edited. Archived if the board file is removed. |
| 5 | Announcement row | `backend/textcards.csv` → `ANNOUNCEMENT-010` | **Edited** | `status` → `INACTIVE`, or `expiresAt` pushed past the results date. Never deleted. |
| 6 | Content registry | `backend/content-registry.json` + `frontend/public/…` | **Generated** | Rewritten by the generators. |
| 7 | Result post | stdout → x.com | **Generated**, posted by hand | A reply to the announcement thread. |
| 8 | Post url | `textcards.csv` → `postUrl` | **Edited** by `set-post-url.js` | Requires a second push. |

---

## PART 3 — REFUSALS

1. **Nothing closes the contest for you.** Not the deadline, not `expiresAt`, not the
   scripts.
2. **`capture.complete: false` refuses a final standing** — on the paths where it is
   authorable. On the ranked import path it cannot be set at all.
3. **`expiresAt` does not close anything**; it only hides the card, whatever the
   status column says.
4. **A card is never deleted.** `textCardId` is permanent; retire by status.
5. **An unrecognised status fails the run** — `unknown_status`, naming the six valid
   values.
6. **A `STANDINGS-` card is never hand-edited**; removing the board file archives it.
7. **Nothing posts to X**, and nothing restricts replies for you.

---

## PART 4 — VERIFICATION CHECKLIST

**Closing**

- [ ] Capture taken at the stated time, before anything could change.
- [ ] Replies restricted on the post, or a conscious decision not to.
- [ ] `capture.complete` set honestly — and you know whether this path lets you set it.

**Publishing**

- [ ] Round scored and published; standings card live.
- [ ] Result post composed **after** publishing, read, and posted as a reply.
- [ ] `set-post-url.js ANNOUNCEMENT-010 <url>` run, **and the second push done**.

**The announcement card**

- [ ] `expiresAt` is past the results date, or empty with a plan to retire by hand.
- [ ] **Check whether it has already expired** — an `ACTIVE` row with a past `expiresAt` is hidden and the CSV will not tell you.
- [ ] Retired by `status` `INACTIVE`, never removed.
- [ ] Status is one of the six valid values.

**After**

- [ ] Standings card visible while the announcement is retired — no window where both are gone.
- [ ] If the board file was removed, its card reads `ARCHIVED` rather than vanishing.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `RESULTS DATE` | The `expiresAt` guidance is "past the results date", and E6 does not collect the results date. E1 does. |
| `RESTRICT REPLIES?` | Step 2 is a real decision with a real consequence and is uncollected. |
| `RETIREMENT MODE` | Whether the card is being retired by pushing `expiresAt` or by flipping `status` — the two paths differ in how many steps remain. |
| `POST URL` | Step 5 ends in `set-post-url.js`, which needs the url; E6 collects the card id but not the link, the same gap E3 closed with `X POST`. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| E6 cover items | The `capture.complete` bullet says setting it false "correctly refuses to publish a final standing" without saying **where it can be set**. Per `standings/README.md` it is not authorable on the ranked import path at all — the importer writes `true` unconditionally and `publish-round.js` leaves no seam. On the path most contests use, the safeguard is not available. |
| E6 cover items | The `expiresAt` trap is described well. Worth adding the audit consequence: an expired card still reads `ACTIVE` in `textcards.csv`, so the file cannot tell you the card is hidden — only the renderer knows. `ANNOUNCEMENT-010` in the test rig is in that state today. |
| E6 header | No `RESULTS DATE`, though the central piece of advice is "set `expiresAt` past the results date". |
| E6 header | No `POST URL`, though the sequence ends with `set-post-url.js`. |
| E6 step 6 | Worth naming the six valid statuses; `unknown_status` is a hard failure and "INACTIVE/EXPIRED/ARCHIVED" appears elsewhere in the file without the full list. |
