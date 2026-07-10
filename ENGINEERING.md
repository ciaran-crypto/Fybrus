# Paystrax Payouts — Engineering Reference

A technical reference for an engineer taking this codebase forward. For *what the product is and the business roadmap*, read [`PRODUCT.md`](./PRODUCT.md). For *per-partner go-live steps*, read [`PARTNERSHIPS.md`](./PARTNERSHIPS.md).

- **Live demo:** https://paystrax-demo-v3.vercel.app
- **Stack:** React 18 + Vite + Tailwind · Express (TypeScript) · Drizzle ORM · Neon Postgres · Vercel
- **Node:** 20+ (developed on v24)
- **Status:** working prototype, mock external rails, no live funds. See §14 before trusting any control in production.

---

## 1. Architecture

A single-page React dashboard talks to a JSON API over `/api/*`. The API is stateless; all state is in Postgres (Neon). Every external dependency (bank, FX, blockchain, screening, travel-rule) sits behind a **provider/adapter layer** with a `mock` and a `live` implementation switched by env var — so the whole flow runs end-to-end today on mocks, and going live is "implement the live branch + set env," not a rewrite.

```
Browser (React SPA, TanStack Query)
      │  fetch /api/*
      ▼
Express API ───────────────►  Neon Postgres (Drizzle ORM)
      │
      ▼  provider/adapter layer (shared/providers.ts)
  ┌──────────┬──────────┬─────────────┬────────────┬──────────────┐
  │ FiatRail │ FxProvider│ Settlement  │ Screening  │ TravelRule   │
  │ (Banking │ (ECB rate)│ (USDC on-   │ (sanctions)│ (originator/ │
  │  Circle) │           │  chain)     │            │  beneficiary)│
  └──────────┴──────────┴─────────────┴────────────┴──────────────┘
      each: mock ↔ live, chosen by *_MODE env var
```

### The two API surfaces (read this before editing any endpoint)

The API exists **twice** and both must be changed together:

| File | Runs | Detail |
|---|---|---|
| `server/routes.ts` | local dev | imports `shared/schema.ts` + `shared/providers.ts` normally |
| `api/index.ts` | Vercel production | **self-contained** — the schema and the entire provider layer are *inlined*, because Vercel's serverless bundler cannot resolve the cross-directory imports at build time |

This duplication is the single biggest source of defects in the project's history: an endpoint, a validation rule, or a bug-fix landing in one file but not the other. "Works locally" tells you nothing about production. **Unifying these into one module + one deploy artifact is the #1 production-refactor task** (§14, §16). Until then, treat every API edit as two edits and run the parity check in §8.

---

## 2. Local setup

```bash
git clone <repo-url> paystrax-payouts
cd paystrax-payouts
npm install
```

You need a `DATABASE_URL` (it is a secret, not in the repo). Either ask the owner (share via password manager, never Slack/email) or — recommended — create your own Neon branch (§5). Then create `.env`:

```
DATABASE_URL=postgresql://…neon.tech/neondb?sslmode=require
```

**Run — dev (two processes, hot reload):**
```bash
./start-api.sh        # Express API on :3001 (sources .env)
./start-frontend.sh   # Vite on :5173, proxies /api → :3001
```

**Run — production bundle (single port, mirrors Vercel):**
```bash
npm run build:local
./run-prod.sh         # API + static frontend on :3001
```

Demo logins (password `demo123` for all): `julijavi@paystrax.com` (admin), `vaivani@paystrax.com` (approver).

---

## 3. Repository layout

```
client/src/
  pages/Dashboard.tsx     entire UI — all 7 pages + modals (~2,000 lines; §4)
  index.css               global tokens (warm-paper palette, Geist fonts)
  App.tsx, main.tsx       bootstrap
server/
  index.ts                Express entry, binds :3001
  routes.ts               ALL local-dev API routes  ── keep in sync with api/index.ts
  db.ts                   Neon connection (drizzle-orm/neon-http)
shared/
  schema.ts               Drizzle schema — SOURCE OF TRUTH for the DB (§4)
  providers.ts            provider/adapter interfaces + mock/live impls (§9)
api/index.ts              Vercel serverless API — self-contained mirror (§1)
drizzle.config.ts         points drizzle-kit at shared/schema.ts
vercel.json               /api/* → serverless fn; everything else → SPA
PRODUCT.md · PARTNERSHIPS.md · ENGINEERING.md
```

---

## 4. Data model

Six tables (`shared/schema.ts`). All money is `decimal` — **never floats**. Fiat = 2 dp, USDC = 6 dp.

### merchants
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| walletAddress | text | destination USDC wallet (`0x` + 40 hex) |
| email | text | optional |
| status | text | `active` \| `disabled` |
| kycReliedOn | text | who performed KYC (reliance model) — default "Paystrax (acquirer)" |
| kycRef | text | case ref on the relying party's system |
| kycAttestedAt | timestamp | when reliance was recorded |
| walletScreenStatus | text | `unscreened` \| `clear` \| `flagged` |
| walletScreenProvider | text | e.g. `mock-screening` |
| walletScreenedAt | timestamp | |
| createdAt | timestamp | |

### batches
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| batchRef | text UNIQUE | e.g. `BATCH-MRF1O0WJ` (base-36 of created time) |
| currency | text | `EUR` \| `USD` \| `AUD` |
| totalFiat | decimal(14,2) | gross fiat |
| totalEur | decimal(14,2) | legacy mirror of totalFiat |
| totalUsdc | decimal(14,6) | net-of-fee × rate, set at conversion |
| exchangeRate | decimal(12,6) | set at conversion |
| feeBps | integer | platform fee in basis points (9) |
| feeAmount | decimal(14,2) | totalFiat × feeBps / 10000 |
| payoutTiming | text | `asap` \| `scheduled` |
| scheduledDate | timestamp | if scheduled |
| status | text | lifecycle (§5) |
| createdBy | text | creator email |
| approvedBy | text | approver email (dual approval) |
| approvedAt | timestamp | |
| merchantCount | integer | |
| fiatReceivedAt | timestamp | set when funded |
| completedAt | timestamp | |
| createdAt | timestamp | |

### payouts
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| batchId | uuid FK → batches | |
| merchantId | uuid FK → merchants | |
| fiatAmount / eurAmount | decimal(14,2) | per-merchant fiat (eurAmount = legacy mirror) |
| usdcAmount | decimal(14,6) | net-of-fee × rate |
| walletAddress | text | snapshot at batch time |
| txHash | text | on-chain ref (mock: random) |
| status | text | `pending` → `processing` → `confirmed`; or `failed` |
| failureReason | text | human-readable, set on failure/block |
| travelRuleStatus | text | `pending` \| `transmitted` \| `failed` |
| travelRuleRef | text | `TR-…` transmission reference |
| travelRuleData | text | JSON snapshot of the transmitted payload |
| travelRuleAt | timestamp | |
| createdAt / confirmedAt | timestamp | |

### audit_log
`id, action, entityType, entityId, entityRef, actor, detail, ipAddress, createdAt`. Append-only; every state change and export writes here.

### users
`id, email (unique), name, role (admin|approver|viewer), password, status (active|disabled), createdAt`. **Password is plaintext — demo only (§14).**

### support_tickets
`id, ticketRef (FYB-…), subject, message, context (JSON), status (open|resolved), createdBy, createdAt`. Backs the Fybrus Customer Care flow (§11).

---

## 5. Batch lifecycle (state machine)

```
pending ──► funded ──► converting ──► sending ──► completed
   (any non-terminal state) ──► failed
```

Transitions run through `PATCH /api/batches/:id/status`. Guard: you may only move **one step forward** in `["pending","funded","converting","sending","completed"]`, or jump to `failed` from any non-terminal state. Each transition has side-effects:

| → State | Side-effects |
|---|---|
| **funded** | sets `fiatReceivedAt`. In production this is driven by the bank webhook, never a manual flip. |
| **converting** | calls `fxProvider.getRate(currency)` → `exchangeRate`; computes `netFiat = totalFiat − feeAmount`; `totalUsdc = netFiat × rate`; each payout `usdcAmount = fiatAmount × (1 − feeRate) × rate`, payout status → `processing`. |
| **sending** | per payout, in order: (1) `walletScreeningProvider.screen()` — if `flagged`: payout → `failed`, `failureReason` set, merchant marked flagged, `payout_blocked` audit entry, **skip**; (2) `travelRuleProvider.transmit()` — **before** settlement (TFR requires data to accompany the transfer); (3) `settlementProvider.send()` → `txHash`, payout → `processing`, travel-rule fields written. Any throw → payout `failed` + `failureReason`. Result summarized as `{sent, failed, blocked, total}`. If **all** payouts fail, the batch → `failed`. |
| **completed** | sets `completedAt`; confirms **only** payouts currently in `processing` → `confirmed` + `confirmedAt`. Failed/blocked payouts stay `failed` (never silently confirmed). |
| **failed** | all payouts → `failed`. |

**Auto-processing** (UI, default on): after funding, the client chains the remaining transitions to completion — matching production. Off = manual step-through. A stalled `funded`/`converting` batch has a "Run to completion" action. Retries: `POST /api/batches/:id/retry-failed` re-runs screening + travel rule + settlement for failed payouts only, clearing `failureReason` on success.

---

## 6. Fee model

- Constant: **`FEE_BPS = 9`** (0.09%), set at batch creation in both surfaces.
- `feeAmount = totalFiat × 9 / 10000`, stored on the batch.
- **Deducted before conversion:** `netFiat = totalFiat − feeAmount`, and USDC is computed on the net. So the merchant's USDC reflects the amount after the platform fee.
- Worked example: €10,000 batch → fee €9.00 → net €9,991 → at rate 1.1430 → **$11,419.71 USDC**.
- Surfaced: batch-creation modals, the batch-detail fee card, the Overview "Fees Collected" metric, and analytics `totalFees`.

---

## 7. Compliance logic

- **KYC = reliance.** No KYC is performed here. Merchants carry an attestation (`kycReliedOn`, `kycRef`, `kycAttestedAt`) pointing to the relying party's system. UI shows a "Relied · Paystrax" chip.
- **Wallet screening (our obligation).** At registration *and* at every dispatch. Mock rule: any wallet ending `0bad` is `flagged`. A flagged wallet blocks **only that payout**; the rest of the batch proceeds. Live = Chainalysis/Elliptic/TRM-shaped (§9).
- **Travel rule (our obligation, EU TFR / FATF R.16).** Originator/beneficiary payload transmitted **before** settlement on every payout (no de-minimis). Payload snapshot + `TR-…` ref stored on the payout. Live = Notabene/21-shaped.
- **Reconciliation** (`computeReconciliation`, `shared/providers.ts`). Per batch, compares fiat expected/received and USDC converted/sent/confirmed. Exception rules:
  - fiat received ≠ expected (tolerance 0.01)
  - payout USDC sum ≠ batch converted (tolerance 0.50 — absorbs fee rounding)
  - completed but not all payouts confirmed
  - any payout failed
  - sending but not all dispatched
- **Audit trail** — append-only, CSV-exportable. **Alerts** page aggregates failed payouts, flagged wallets, and reconciliation exceptions with reasons (§11).

---

## 8. API reference

Base `/api`. All JSON. Both surfaces implement the same set (keep in sync).

**Batches**
- `GET /batches` — list. `GET /batches/:id` — detail with payouts + merchants.
- `POST /batches` — create. Body `{ entries:[{merchantName,walletAddress,amount}], currency, payoutTiming, scheduledDate?, createdBy }`. Validates currency, positive amounts, wallet format, duplicate wallets; auto-registers unknown wallets (case-insensitive match) with screening.
- `PATCH /batches/:id/status` — advance the state machine (§5). Body `{ status }`.
- `POST /batches/:id/approve` — dual approval. Body `{ approver }`. Rejects approving your own batch.
- `POST /batches/:id/retry-failed` — re-dispatch failed payouts through the compliance gates.

**Merchants**
- `GET /merchants` · `POST /merchants` (screens wallet on create) · `PATCH /merchants/:id` (wallet change → re-screen) · `DELETE /merchants/:id` (blocked if payouts exist).
- `POST /merchants/:id/screen` · `POST /merchants/screen-all` — (re)run wallet screening.

**Compliance / ops**
- `GET /reconciliation` · `GET /reconciliation/csv`
- `GET /alerts` — `{ failedPayouts, flaggedMerchants, reconExceptions, total }` (each with reason; failed payouts include `retryable`).
- `GET /support` · `POST /support` — Fybrus Care tickets.
- `GET /audit` (last 100) · `GET /audit/csv` · `GET /reports/csv` (settlement report incl. travel-rule ref).
- `GET /analytics` — volumes, status counts, `totalFees`, rates, settlement times.
- `GET /providers` — current mock/live mode per seam (drives the header badge).

**Users / auth**
- `GET/POST/PATCH/DELETE /users` · `POST /auth/login` (returns user; **no token/session** — §14) · `POST /users/seed`.

**Integrations / demo**
- `POST /webhooks/banking-circle` — funds a batch by ref (the mock "settlement landed" trigger; production = real BC webhook).
- `POST /seed`, `POST /seed/reset`, `POST /audit/seed` — demo data.

Parity check before pushing:
```bash
grep -oE 'app\.(get|post|patch|delete)\("/api/[^"]*"' api/index.ts | sort -u
grep -nE 'app\.(get|post|patch|delete)\("/api/' server/routes.ts | wc -l
```

---

## 9. Provider / adapter layer

`shared/providers.ts` (and the inlined mirror in `api/index.ts`). Each seam is an interface + `mock*` + `live*`, chosen by `mode(process.env.<SEAM>_MODE)`. `live*` throws `ProviderNotConfiguredError` until implemented.

```ts
interface FxProvider            { getRate(base, quote?): Promise<FxQuote> }               // FX_MODE — already live (ECB/frankfurter, mock fallback)
interface SettlementProvider    { configured; send(SettlementInstruction): Promise<SettlementResult> }  // SETTLEMENT_MODE
interface FiatRailProvider      { name; configured; verifyWebhookSignature(body, sig?): boolean }        // FIAT_MODE
interface WalletScreeningProvider { name; configured; screen(wallet): Promise<WalletScreenResult> }      // SCREENING_MODE
interface TravelRuleProvider    { name; configured; transmit(TravelRulePayload): Promise<TravelRuleResult> } // TRAVEL_RULE_MODE
```

**To take one live:** implement the `live*` branch in **both** `shared/providers.ts` and `api/index.ts`, set the mode + credential env vars, deploy. Per-partner detail in `PARTNERSHIPS.md`.

| Seam | Live target |
|---|---|
| FiatRail | Banking Circle — mTLS cert + OAuth + webhook secret (no anonymous sandbox) |
| Fx | ECB rate is live; a conversion/execution partner is needed for real settlement of the FX |
| Settlement | Custody/exchange API (Fireblocks / Circle-shaped): broadcast + confirmation polling |
| Screening | Chainalysis / Elliptic / TRM-shaped |
| TravelRule | Notabene / 21-shaped (IVMS 101 payload) |

---

## 10. Auth & roles

- Roles: **admin** (all), **approver** (approve others' batches, advance), **viewer** (read-only). Enforced in the UI.
- Login: `POST /auth/login` checks email + plaintext password, returns the user object. **There is no token or session** — the client holds the user in state/localStorage. This is demo-grade and must be replaced for production (§14).

---

## 11. Alerts, resolution & support

- **Alerts** page: one place for everything needing a human — failed payouts (with reason + `retryable`), flagged wallets, reconciliation exceptions. Nav badge shows the open count. Compliance blocks are marked non-retryable and explain why.
- **Resolve → Fybrus Customer Care:** "Get help" on any alert opens a ticket (`support_tickets`), auto-attaching the alert context; ticket gets an `FYB-…` ref, is audit-logged, and is listed on the page. (Fybrus is treated as the operator/support brand.)
- Batch refs are clickable everywhere (Reconciliation, Audit, Alerts) → open the batch detail.

---

## 12. Environment variables

| Var | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | Neon Postgres connection (secret) | — (required) |
| `PROVIDER_MODE` | global mock/live default | `mock` |
| `FX_MODE` | FX rate source | live (ECB) recommended |
| `SETTLEMENT_MODE` / `SETTLEMENT_API_KEY` | USDC settlement | `mock` |
| `FIAT_MODE` / `BANKING_CIRCLE_WEBHOOK_SECRET` | bank rail | `mock` |
| `SCREENING_MODE` / `SCREENING_API_KEY` | wallet screening | `mock` |
| `TRAVEL_RULE_MODE` / `TRAVEL_RULE_API_KEY` | travel rule | `mock` |
| `TRAVEL_RULE_ORIGINATOR` / `_REF` / `_COUNTRY` | originator identity in the payload | demo placeholders |

Set locally in `.env`; in production, in the Vercel project (Production/Preview/Development).

---

## 13. Database & deploy

- **Schema changes:** edit `shared/schema.ts`, then `npm run db:push` (drizzle-kit). Mirror any column into the inlined schema in `api/index.ts`.
- **Your own data:** branch off the Neon project's default branch in the console; point `.env` at it.
- **Deploy:** `npm run build:local` (sanity) then `npx vercel --prod` (linked project `paystrax-demo-v3`). Env vars live in Vercel, not the repo.

---

## 14. Known issues & technical debt

Ordered by risk. Do not assume any of these are handled.

1. **Dual approval is UI-only — NOT enforced server-side.** `PATCH /batches/:id/status` has no approval check; a direct API call can advance an unapproved batch. Must be enforced in the endpoint before production.
2. **Two API surfaces drift** (`server/routes.ts` vs `api/index.ts`). Every fix needs both. Unify them — highest-value refactor.
3. **Auth is demo-grade:** plaintext passwords, shared demo password, no tokens/sessions, no rate limiting. Replace with real auth (hashing, SSO/2FA, sessions) before any real user.
4. **Webhook is unauthenticated in mock; `verifyWebhookSignature` is a stub.** The `/webhooks/banking-circle` endpoint funds a batch by ref with no signature check — implement real HMAC verification (and reject unknown/empty refs) for the live rail.
5. **No tests.** No unit/integration coverage anywhere. Add a harness around the lifecycle + compliance gates early.
6. **No idempotency / replay protection** on funding or dispatch — a repeated webhook or double-click could double-process. Add idempotency keys.
7. **Monolithic frontend:** one ~2,000-line file. Split per page.
8. **Client-side filtering/pagination** — fine to hundreds of records; needs server-side search + pagination at scale.
9. **Reconciliation is ledger-internal** — it compares our own records, not real bank statements. Statement-level recon needed for production.

---

## 15. Testing strategy (recommended)

- **Lifecycle:** every transition + guard (illegal jumps rejected; funded→…→completed happy path; all-fail → batch failed).
- **Compliance gates:** flagged wallet is blocked and never dispatched; travel rule transmitted before settlement; completed never confirms a failed payout.
- **Fee math:** net-of-fee conversion to the cent across currencies.
- **Reconciliation:** each exception rule fires on the right condition and clears on resolution.
- **API parity:** a test that asserts the two surfaces expose the same routes (guards against §14.2).
- **Auth/roles:** viewer cannot mutate; approver cannot approve own batch; (once fixed) unapproved batch cannot advance.

---

## 16. Roadmap — engineering view

- **To MVP:** wire real partners behind the seams (bank, settlement, screening, travel rule); real auth; a first pilot. Gap is mostly partner onboarding, not code (see PRODUCT.md).
- **To production:** unify the API surfaces; server-side approval enforcement; webhook signatures + idempotency; statement-level reconciliation; monitoring/alerting; pen test; test suite.
- **To scale:** queue-based dispatch (workers + retries + DLQ) instead of in-request processing; multi-tenancy; treasury/liquidity management; server-side search/pagination; SOC 2.

## 17. Glossary

**Batch** — a set of merchant payouts funded and processed together. **Payout** — one merchant's share of a batch. **Reliance (KYC)** — trusting KYC performed by another regulated party rather than re-doing it. **Travel rule** — the requirement to send originator/beneficiary data alongside a crypto transfer. **Seam** — a provider interface with swappable mock/live implementations. **bps** — basis points; 1 bps = 0.01%.
