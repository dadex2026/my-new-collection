# Worked run — A7, verify a live deploy

**Driven by prompt A7** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and
`docs/new-collection-deployment-guide.md` Step 10 disagree, the guide wins.

**Applicable project: `my-new-collection`, and this run was actually executed** against
`https://my-new-collection.netlify.app` on 2026-08-28. Every status code and count
below is observed, not illustrative. The browser-console pass in §3 was **not** run —
it needs a real browser, which this session does not have — so that step is written as
instructions, and §6 explains why the distinction matters.

---

## SAMPLE HEADER

### A7 — Verify a live deploy

```
I want to verify a collection's live deploy.

COLLECTION:  my-new-collection
SITE URL:    https://my-new-collection.netlify.app
```

---

## PART 1 — RUNBOOK

### 1. Fetch all five endpoints directly

Do not stop at "the homepage looks fine" — a broken fetch fails silently behind a
normal-looking page.

| Endpoint | Observed | Content |
|---|---|---|
| `/registry.json` | **200** | 3 collections, 4 drops (TEST-001…004), generated **2026-08-14** |
| `/campaigns.json` | **200** | **3** campaigns: `test-combined-check` (3/3 claimed), `test-mech-c-reward` (0/5), `test-mech-d-reward` (0/5) |
| `/content-registry.json` | **200** | **1** card: `TEST-001` |
| `/standings.json` | **404** | — |
| `/methodology.json` | **404** | — |

### 2. Which 404s are expected, and which are not

- **`registry.json` 404 is a real failure**, and so is any request to a literal
  `/undefined` — both mean the missing `VITE_REGISTRY_URL`. Here it is 200; the site
  is wired correctly.
- **`campaigns.json`, `content-registry.json`, `standings.json`, `methodology.json`
  404 as the expected empty state** before anything is published. Two of them do here.

**But the expected-empty-state reading is wrong for this collection**, and A7 cannot
tell the difference from outside. `standings.json` and `methodology.json` are not 404
because nothing has been published yet — they are 404 because
`backend/standings/`, `backend/methodology/`, `publish-round.js`,
`generate-methodology.js` and both importers **do not exist in this collection at
all** (see the A4 run). "Not published yet" and "never forked in" produce byte-identical
404s. The remedy is A4, not publishing a round.

### 3. The browser console pass

`F12 → Console`. Cross-reference **every** `Failed to load resource` line against the
environment variables from A6:

| Console line names | Look at |
|---|---|
| `/undefined` | `VITE_REGISTRY_URL` — missing entirely |
| `/campaigns.json`, `/content-registry.json` | `VITE_CAMPAIGNS_URL`, `VITE_CONTENT_REGISTRY_URL` |
| the Worker proxy URL | see §4 — this is CORS, not Netlify |

Remember that Vite bakes these in at build time, so a variable corrected in the
dashboard changes nothing until a fresh deploy.

### 4. Telling a CORS error apart

**If the failing line names the Worker URL, the problem is `CORS_ALLOW_ORIGIN` on the
Worker — not anything on Netlify.** The distinguishing feature is that the request
leaves for a *different origin* than the site. Chasing it in Netlify's build settings
finds nothing, because there is nothing there to find. Fix it in the Worker (A5).

### 5. The two known non-issues

- **The LF/CRLF warning on `git add`.** Noise, from `.gitattributes` normalisation.
- **A 401 from an automated fetch when a real browser loads the site fine.** Netlify
  can answer a scripted request differently from a browser session, so a 401 from
  `curl` is not evidence the site is down. **A 401 in a real browser is different** —
  that is project visibility (A6).

### 6. The check A7 does not currently make: freshness

All three 200s above are **stale**, and every status code is green:

| Published | Live shows | Local source holds |
|---|---|---|
| `content-registry.json` | **1** card | `backend/textcards.csv` — **9** rows |
| `campaigns.json` | **3** campaigns | `backend/campaigns.csv` — **32** rows, of which **8** carry a valid candy machine address |
| `registry.json` | generated **2026-08-14** | `master.csv`, edited since |

So the site is missing 8 cards and 5 deployed campaigns. Nothing is broken; the
generators have not been re-run and pushed since those rows were added. **A verification
pass built on status codes and console errors reports a clean site.**

The freshness check is two comparisons, and neither needs a browser:

```
# cards: rows in the CSV vs cards in the published registry
tail -n +2 backend/textcards.csv | grep -c .
curl -s <SITE_URL>/content-registry.json | grep -o '"textCardId"' | wc -l

# campaigns: rows with a deployed candy machine vs published campaigns
awk -F, 'NR>1 && $15 != "" {n++} END {print n}' backend/campaigns.csv
curl -s <SITE_URL>/campaigns.json | grep -o '"campaignId"' | wc -l
```

A mismatch is not necessarily wrong — `campaigns.json` publishes only rows with a valid
deployed address, by design, so the campaigns count should match the **deployed** count
rather than the row count. The card count should match exactly.

---

## PART 2 — DISPOSITION TABLE

| # | Surface | Path | Disposition | What is checked |
|---|---|---|---|---|
| 1 | Live endpoints | `<SITE_URL>/*.json` | **Read only** | Five fetches; status and content. |
| 2 | Browser console | F12 | **Read only** | Every failed-resource line, cross-referenced to env vars. |
| 3 | Netlify env vars | Netlify UI | Read; **edited only if a fetch fails** | A change requires a fresh deploy. |
| 4 | Worker | `Desktop\rpc-proxy` | Read; **edited only for CORS** | `CORS_ALLOW_ORIGIN`. |
| 5 | Local sources | `backend/textcards.csv`, `campaigns.csv`, `master.csv` | **Read only** | The freshness comparison in §6. |
| 6 | Registry generators | `backend/scripts/generate-*.js` | **Run only if stale** | Then commit and push — verification ends, publishing begins. |

**Nothing in A7 writes anything.** It is a read-only prompt, and any fix it uncovers
belongs to A4, A5 or A6.

---

## PART 3 — REFUSALS

1. **"The homepage looks fine" is not verification.** A broken fetch fails silently
   behind a normal page.
2. **A `registry.json` 404, or any `/undefined` request, is never an expected empty
   state.**
3. **A 401 from an automated fetch is not evidence of a broken site** — check in a real
   browser.
4. **A CORS failure naming the Worker is not a Netlify problem.**
5. **An env var corrected in the dashboard changes nothing until a redeploy.**
6. **Green status codes are not proof of current content** — see §6.
7. **A7 fixes nothing.** It reports.

---

## PART 4 — VERIFICATION CHECKLIST

- [ ] All five endpoints fetched **directly**, not inferred from the page.
- [ ] `registry.json` → 200. *(Observed: 200.)*
- [ ] No request anywhere to a literal `/undefined`.
- [ ] Each 404 classified: expected empty state, or a feature that was never merged in — **check `backend/` for the directory before concluding "not published yet"**.
- [ ] Console read in a real browser; every failed-resource line accounted for.
- [ ] Any Worker-named failure treated as CORS, not Netlify.
- [ ] LF/CRLF warnings ignored.
- [ ] A 401 confirmed in a browser before being believed.
- [ ] **Freshness compared**: published card count vs CSV rows; published campaigns vs deployed rows; `registry.json` `generatedAt` against the last `master.csv` edit.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `EXPECTED CARD COUNT` / `EXPECTED CAMPAIGN COUNT` | Without them "200 OK" is the whole test. Both are derivable from the local CSVs, and A7 never says to look. |
| `WORKER URL` | Needed to recognise a CORS failure by the origin it names. |
| `LAST PUBLISH DATE` | To judge whether `registry.json`'s `generatedAt` is stale. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| A7 cover items | **No freshness check.** Verified live: all three published JSONs return 200 and all three are behind the local CSVs — 1 card published against 9 rows, 3 campaigns against 8 deployed. A7 as written passes this site. Two `curl`-and-count comparisons would catch it, and neither needs a browser. |
| A7 cover items | The 404 classification is right but incomplete. In this collection `standings.json` and `methodology.json` 404 because the **feature was never forked in**, not because nothing is published — identical from outside, different remedies (A4 versus publishing a round). Worth telling the runbook to check `backend/` for the directory before concluding. |
| A7 header | Collects no expected counts and no Worker URL, so two of its own checks cannot be completed from the header alone. |
| A7 cover items | Worth stating that A7 **writes nothing** — every fix it surfaces belongs to another prompt. As written it reads as though it might fix things, and the disposition table has nothing to put in it otherwise. |
