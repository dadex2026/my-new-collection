# Worked run — A5, rotate the key on the RPC proxy

**Driven by prompt A5** in `docs/generation-prompts.md`. One complete run: the filled
header, and all five parts of the output contract.

**Not a source of truth.** Where this file and `Desktop\rpc-proxy\src\index.ts` or
`docs/new-collection-deployment-guide.md` Step 7 disagree, those win.

**Applicable project: `Desktop\rpc-proxy`** — a checkout of
`helius-labs/helius-rpc-proxy`, Worker name `rpc-proxy`, entry `./src/index.ts`. The
CORS behaviour below was read out of that file rather than assumed. **Nothing here was
executed**: deploying needs your Cloudflare account, and rotating needs your Helius
dashboard. No SOL is involved at any point — this is a Worker, not a chain operation.

---

## SAMPLE HEADER

### A5 — Stand up or rotate the RPC proxy

```
I want to rotate the key on the RPC proxy Worker.

COLLECTIONS IT SERVES:  my-new-collection, TEMPLATE-OPEN-EDITION
CUSTOM DOMAINS:         none
REASON (if rotating):   Precautionary — the key may have been pasted into a
                        VITE_ variable during an earlier deploy.
```

---

## PART 1 — RUNBOOK

### 1. If rotating: **delete the key at Helius first**

**Before any repo work. Before the grep. Before the redeploy.**

The key is live credential material. While it exists, anyone holding it is spending
your quota — so the first action is revoking it at Helius, and everything else is
cleanup. **Scrubbing the repo does not stop the bleeding**: a key removed from the
working tree is still valid, still in anyone's clone, and still in the history of every
fork.

Then, and only then:

```
git grep -n "api-key="
```

That confirms the **tip** is clean. It does not clean anything. **A key committed at
any point stays in history**, retrievable from any clone, which is the second reason
revocation comes first and the reason a rewrite is not a substitute for it.

Generate the replacement key at Helius after the old one is dead.

### 2. Deploy

```
cd Desktop\rpc-proxy
npx wrangler deploy
```

Two variables:

| Variable | Required | Behaviour |
|---|---|---|
| `HELIUS_API_KEY` | **Yes**, encrypted | Missing → the Worker returns **500 `Missing HELIUS_API_KEY`** on every request |
| `CORS_ALLOW_ORIGIN` | Optional | See §3 — and its *absence* is not neutral |

Set the key as an encrypted secret, never in `wrangler.toml` — that file is committed.

### 3. The CORS logic, in full

From `src/index.ts`:

```ts
const supportedDomains = env.CORS_ALLOW_ORIGIN?.split(',').map(d => d.trim());
if (supportedDomains) {
  if (origin && supportedDomains.includes(origin)) corsHeaders['Access-Control-Allow-Origin'] = origin;
} else {
  corsHeaders['Access-Control-Allow-Origin'] = '*';
}
```

**It is all-or-nothing per request, by exact string match.** An origin in the list gets
itself echoed back; an origin *not* in the list gets **no `Access-Control-Allow-Origin`
header at all**, and the browser blocks the call. There is no wildcard within the list,
no subdomain matching, no trailing-slash forgiveness.

So the list must contain **every legitimate origin**:

- production — `https://my-new-collection.netlify.app`
- every custom domain (none here)
- **`http://localhost:5173`** — the dev server, which is otherwise blocked and looks
  like a broken Worker

**And the fallback is wide open.** Leaving `CORS_ALLOW_ORIGIN` unset means `*`: every
site on the internet may call your Worker and spend your Helius quota. That is a
choice, not a default to drift into.

#### Netlify deploy previews — your explicit choice

Preview subdomains look like
`https://deploy-preview-12--my-new-collection.netlify.app` and **cannot be enumerated
in advance**, since the number changes per PR. Exact matching means none of them are
covered by the production entry. Three options, and A5 is right to make you pick:

| Option | Cost |
|---|---|
| **A. Leave `CORS_ALLOW_ORIGIN` unset** — `*` | Previews work; the Worker is open to everyone and your quota is public. |
| **B. Enumerate the real origins only** | Previews are broken for RPC calls — the page loads, chain data does not, and it looks like a Worker fault. |
| **C. Enumerate, and add a preview origin when you need one** | Correct and manual; each preview needs a Worker variable update and redeploy. |

**B is the safe default and the one that will confuse someone**, so if you take it, write
the reason where the next person looks — the collection's `netlify-connection.md`.

### 4. Every place the Worker URL is written — per collection

For each of `my-new-collection` and `TEMPLATE-OPEN-EDITION`:

| File | Field |
|---|---|
| `deployment.json` | `rpc` |
| `backend/config.json` | `rpc` |
| `frontend/.env` | `VITE_SOLANA_RPC_URL` |
| `backend/.env` | `SOLANA_RPC_URL` **and** `VITE_SOLANA_RPC_URL` |
| Netlify project settings | `VITE_SOLANA_RPC_URL` |

Six places per collection, twelve here. **Never a keyed provider URL in any `VITE_*`
value** — Vite bakes those into the public bundle, which is the failure this Worker
exists to prevent and the stated reason for this rotation.

### 5. Why the collections need no redeploy after a rotation

**The Worker URL does not change.** Rotating the key changes a secret *inside* the
Worker; every collection keeps pointing at the same
`https://rpc-proxy.<account>.workers.dev`, and the next request simply uses the new key
upstream.

So a rotation is one `wrangler deploy` and nothing else — **unless** §4's audit finds a
place still holding a keyed Helius URL directly rather than the Worker URL. That is a
different repair, and it *does* need a redeploy of the affected site, because a `VITE_*`
value is baked in at build time.

---

## PART 2 — DISPOSITION TABLE

| # | Path / surface | Disposition | What goes where |
|---|---|---|---|
| 1 | Helius dashboard | **Edited first** | Old key deleted, new key generated. |
| 2 | `Desktop\rpc-proxy\wrangler.toml` | **Read only** | `name = "rpc-proxy"`, `main = ./src/index.ts`. No secrets here. |
| 3 | Worker secret `HELIUS_API_KEY` | **Edited** | Encrypted; missing means 500 on every request. |
| 4 | Worker variable `CORS_ALLOW_ORIGIN` | **Edited** | Comma-separated exact origins, or deliberately unset for `*`. |
| 5 | `npx wrangler deploy` | Run | Same URL, new secret. |
| 6 | Each collection's `deployment.json`, `backend/config.json`, `frontend/.env`, `backend/.env` | **Audited**, edited only if wrong | Worker URL, never a keyed URL. |
| 7 | Each Netlify project's `VITE_SOLANA_RPC_URL` | **Audited** | A change here needs a fresh deploy to take effect. |
| 8 | `docs/netlify-connection.md` (per collection) | **Edited** if option B | Record why previews cannot reach the Worker. |

---

## PART 3 — REFUSALS

1. **Revocation comes before repo work.** Scrubbing does not invalidate a live key.
2. **A committed key stays in history** — treat any key that ever reached a commit as
   burned.
3. **No secret in `wrangler.toml`.** It is committed.
4. **No keyed provider URL in any `VITE_*` value.**
5. **CORS is exact-match, all-or-nothing per request** — no wildcards within the list.
6. **An unset `CORS_ALLOW_ORIGIN` is `*`**, not "off".
7. **A missing `HELIUS_API_KEY` is a 500**, not a fallback to a public endpoint.

---

## PART 4 — VERIFICATION CHECKLIST

**Rotation order**

- [ ] Old key deleted at Helius **before** anything else.
- [ ] New key generated after.
- [ ] `git grep -n "api-key="` clean at the tip — and understood as tip-only.

**Worker**

- [ ] `HELIUS_API_KEY` set as an encrypted secret; a request returns data, not 500.
- [ ] `CORS_ALLOW_ORIGIN` lists production, every custom domain, and `http://localhost:5173` — or is deliberately unset with the consequence accepted.
- [ ] Preview policy chosen from A/B/C and written down.
- [ ] Deployed; URL unchanged.

**Per collection**

- [ ] All six locations hold the Worker URL.
- [ ] No `VITE_*` value contains `api-key=`.
- [ ] A page load makes a successful RPC call from production.
- [ ] `localhost:5173` works during development.
- [ ] Netlify env var unchanged → **no redeploy needed**; if it did change, redeploy.

---

## PART 5 — MISSING INPUTS

| Field | Why |
|---|---|
| `WORKER URL` | Every audit in §4 compares against it, and A5 never collects it. The template ships `https://rpc-proxy.smallen1967.workers.dev` in `deployment.json`, which is a plausible wrong answer for a new account. |
| `PREVIEW POLICY` | §3's A/B/C choice is a real decision with a lasting consequence and no field. |
| `LOCALHOST PORT` | `5173` is the Vite default; a project on another port is silently blocked. |
| `KEY EXPOSURE SCOPE` | For a rotation: whether the key ever reached a commit, a bundle, or only a local file — it decides whether history rewriting is even worth discussing. |

---

## APPENDIX — FINDINGS

| Where | Finding |
|---|---|
| A5 cover items | The CORS section covers the list and the previews but not **the meaning of leaving `CORS_ALLOW_ORIGIN` unset**: the Worker falls back to `Access-Control-Allow-Origin: *`, open to every site and every quota-spender. That is the most consequential CORS state and it is the one reached by doing nothing. |
| A5 cover items | Matching is **exact string**, so a trailing slash, a `www.` prefix, or `http` versus `https` silently fails. Worth one line — it is the commonest reason a correctly-listed origin still gets blocked. |
| A5 header | No `WORKER URL`, though "every place the Worker URL has to be written" is a whole cover item, and the template ships one that belongs to a different account. |
| A5 cover items | "Why the collections need no redeploy" is right and worth one caveat: **if the audit finds a `VITE_*` holding a keyed URL, that site does need a redeploy**, because Vite bakes those at build time. |
