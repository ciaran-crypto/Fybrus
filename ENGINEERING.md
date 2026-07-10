# Paystrax Payouts — Engineering Onboarding

Everything you need to clone, run, and ship this codebase. For *what the product is and why*, read [`PRODUCT.md`](./PRODUCT.md). For *how each partner integration plugs in*, read [`PARTNERSHIPS.md`](./PARTNERSHIPS.md).

- **Live demo:** https://paystrax-demo-v3.vercel.app
- **Stack:** React 18 + Vite + Tailwind · Express (TypeScript) · Drizzle ORM · Neon Postgres · Vercel
- **Node:** 20+ (developed on v24)

---

## 1. Get the code running (5 minutes)

```bash
git clone <repo-url> paystrax-payouts
cd paystrax-payouts
npm install
```

**You need a `DATABASE_URL`.** It is *not* in the repo (it's a secret). Get it one of two ways:
- Ask the owner for the value (shared out-of-band — password manager, not Slack/email), **or**
- Create your own isolated Neon branch (recommended — see §5) so you never touch shared data.

Create `.env` in the project root:

```
DATABASE_URL=postgresql://…neon.tech/neondb?sslmode=require
```

### Run locally

Two processes (API + Vite frontend with proxy):

```bash
./start-api.sh        # Express API on :3001 (loads .env)
./start-frontend.sh   # Vite dev server on :5173, proxies /api → :3001
```

Or run the production bundle on a single port (what Vercel serves conceptually):

```bash
npm run build:local
./run-prod.sh         # serves API + static frontend on :3001
```

Demo login: `julijavi@paystrax.com` / `demo123` (admin) · `vaivani@paystrax.com` / `demo123` (approver).

---

## 2. Repository layout

```
client/              React SPA
  src/pages/Dashboard.tsx    ← the entire UI lives here (one large file; see §4)
  src/index.css              global styles / design tokens
server/              Local dev API
  index.ts                   Express entry (port 3001)
  routes.ts                  ALL local API routes
  db.ts                      Neon connection
shared/
  schema.ts                  Drizzle schema (source of truth for the DB)
  providers.ts               provider/adapter layer (mock ↔ live seams)
api/
  index.ts                   Vercel serverless API — SELF-CONTAINED (see §3)
PRODUCT.md           product overview + MVP/prod/scale roadmap
PARTNERSHIPS.md      per-partner go-live checklist + env vars
```

---

## 3. ⚠️ The one thing that will bite you: two API surfaces

The API is implemented **twice** and both must stay in sync:

| File | Runs | Notes |
|---|---|---|
| `server/routes.ts` | local dev (`npm run dev`) | imports `shared/schema.ts` + `shared/providers.ts` normally |
| `api/index.ts` | Vercel production (serverless) | **self-contained** — schema + provider layer are *inlined* because Vercel's serverless bundler can't resolve the cross-directory imports |

**Every API change must be made in both files.** "Works locally" proves nothing about production. Historically ~every serious bug in this codebase came from these two drifting apart (an endpoint or validation present in one but not the other).

> **Highest-value first task:** collapse these into one shared module and one deploy artifact. It removes the whole bug class. It's #1 on the production-refactor list in `PRODUCT.md`.

Quick parity check before you push:

```bash
# endpoints the client calls vs. what prod actually implements
grep -oE '/api/[a-z/:{}._-]+' client/src/pages/Dashboard.tsx | sort -u
grep -oE 'app\.(get|post|patch|delete)\("/api/[^"]*"' api/index.ts | sort -u
```

---

## 4. Frontend note

`client/src/pages/Dashboard.tsx` is a single ~2,000-line file holding every page (Overview, Batches, Reconciliation, Merchants, Alerts, Audit, Settings) and all modals. Styling is inline-style objects using a warm-paper token palette + Geist/Geist Mono.

It's coherent but monolithic — fine for a prototype, a liability for a team. Splitting it into per-page components is #2 on the refactor list. If you do, preserve the design tokens (colors, `'Geist Mono'` for numerics, pill badges, card shadows).

---

## 5. Database (Neon + Drizzle)

- Schema source of truth: `shared/schema.ts`. Push changes with:
  ```bash
  npm run db:push        # drizzle-kit push
  ```
- **Work on your own branch.** In the Neon console, branch off the project's default so you get a copy of the seed data and never affect anyone else, then point your `.env` `DATABASE_URL` at that branch.
- Six tables: `merchants`, `batches`, `payouts`, `audit_log`, `users`, `support_tickets`.
- Money fields are `decimal` (never floats). USDC is 6dp, fiat 2dp.

---

## 6. Deploy (Vercel)

```bash
npm run build:local        # sanity-check the build first
npx vercel --prod          # deploys this folder to the linked project (paystrax-demo-v3)
```

- `DATABASE_URL` and the provider env vars are set in the Vercel project (Production/Preview/Development), not in the repo.
- `vercel.json` routes `/api/*` to the serverless function and everything else to the SPA.

---

## 7. The provider/adapter layer (how partnerships plug in)

Every external dependency sits behind an interface with a `mock` and a `live` implementation, switched by env var. Mocks run the real logic so the flow works end-to-end today.

| Seam | Env | Live target |
|---|---|---|
| Fiat rail | `FIAT_MODE` | Banking Circle (mTLS + OAuth + webhook secret) |
| FX rate | `FX_MODE` | already live (ECB); execution partner for real conversion |
| USDC settlement | `SETTLEMENT_MODE` | custody/exchange API (Fireblocks/Circle-shaped) |
| Wallet screening | `SCREENING_MODE` | Chainalysis/Elliptic/TRM-shaped |
| Travel rule | `TRAVEL_RULE_MODE` | Notabene/21-shaped |

Taking one live = implement the `live*` branch in **both** `shared/providers.ts` and `api/index.ts`, set the env vars, done. Full checklist: `PARTNERSHIPS.md`.

---

## 8. Known gaps (don't rediscover these)

- **No tests.** Acceptable for the prototype, disqualifying for production. Adding a test harness is worth doing early.
- **Auth is demo-grade** — shared password, plaintext, no sessions. Real auth (SSO/2FA, hashing, sessions) is required for production.
- **Webhook has no signature verification** in mock mode; `verifyWebhookSignature` is stubbed for the live rail.
- **Client-side filtering/pagination** — fine to hundreds of records; needs server-side search + pagination at scale.

## 9. Suggested first week

1. Read `PRODUCT.md` → run the demo → trace one batch through the lifecycle in the code.
2. Unify the two API surfaces (§3) — biggest risk reduction.
3. Stand up a test harness around the batch lifecycle + compliance gates.
4. Pick the first partner seam with sandbox creds and wire the `live*` branch.
