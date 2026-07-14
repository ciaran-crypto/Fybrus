# Fybrus Payouts — Product Document

**Live demo:** https://paystrax-demo-v3.vercel.app · demo sign-ins: `julijavi@fybrus.com` / `vaivani@fybrus.com` (password `demo123`)
**Status:** high-fidelity working prototype · pre-MVP · pre-revenue · TRL 4 · no live funds have ever moved
**Last updated:** 10 July 2026

---

## 1. What it is

Fybrus Payouts is a **fiat-to-stablecoin merchant payout platform**. A client acquirer/PSP owes its merchants settlement money; instead of slow, expensive cross-border bank transfers, the platform collects that fiat once (EUR/USD/AUD), converts it to USDC at the live ECB reference rate, and pays every merchant's wallet in a single supervised batch — with bank-grade controls: dual approval, sanctions screening, travel-rule compliance, full audit trail, and money-trail reconciliation.

**Who uses it:** the acquirer's finance/ops team (creating and approving batches) and its compliance function (audit, screening, exceptions). Merchants are beneficiaries, not users.

**Business model:** a **9 bps (0.09%) platform fee** on each batch, deducted from the fiat before conversion. Fees are visible per batch, at batch creation, and as a running total on the Overview.

## 2. How it works

### Batch lifecycle

```
Awaiting Funding → Funded → Converting → Sending → Completed
        │              │          │           │
   dual approval   bank webhook  live ECB   per-payout:
   (maker/checker) (Banking      rate, fee  screen wallet →
                    Circle)      deducted   transmit travel rule →
                                            dispatch USDC
```

1. **Create** — ops uploads a CSV or enters payouts manually (registered merchants autocomplete; wallets validate). The 9 bps fee is shown before the batch is created.
2. **Approve** — with dual approval on (default), a *different* user must approve before anything can process. The creator can never approve their own batch.
3. **Fund** — fiat arrives in the collection IBAN; the bank rail's webhook flips the batch to Funded. Nothing else can fund a batch — there is no manual override.
4. **Process** — with **auto-processing on** (default, matches production behaviour) the batch then runs straight through; with it off, ops advances each stage manually (useful for demos/training). A stalled batch has a one-click **Run to completion**.
5. **Convert** — fee deducted, remainder converted to USDC at the live ECB reference rate (rate + source recorded in the audit trail).
6. **Dispatch** — per payout, in order: **wallet screening** (sanctions/illicit-exposure; a flagged wallet blocks *that payout only*, with the reason recorded and displayed) → **travel-rule transmission** (originator/beneficiary data must precede the transfer; if it fails, the payout does not go out) → on-chain USDC settlement.
7. **Complete** — only dispatched payouts are confirmed; failed/blocked payouts stay failed with a human-readable reason, and reconciliation flags the batch as an exception. Failed payouts can be retried (retries re-run every compliance gate).

### Compliance model

- **KYC = reliance.** Underlying-merchant KYC is performed on a separate system by the relying party (the client acquirer). This platform records the attestation only: relying party, case reference, date — shown as a "Relied · Acquirer" chip per merchant.
- **Wallet screening = our obligation.** Screened at registration *and* re-screened at every dispatch. Registration via batch upload gets the same screening as manual registration.
- **Travel rule (EU TFR / FATF R.16) = our obligation** (confirmed). IVMS-shaped payload transmitted before settlement on every payout, no de-minimis; the transmitted snapshot + reference is stored per payout and shown in the batch detail.
- **Audit trail** — every action (logins, batch events, rates + sources, blocks with reasons, retries, exports) is logged and exportable as CSV.
- **Reconciliation** — fiat expected vs received vs USDC converted vs confirmed, per batch, with explicit exception reasons. Exceptions are never silently absorbed. Batch refs are clickable everywhere (Reconciliation, Audit, Alerts) and open the full batch detail.
- **Alerts & Resolution** — everything needing a human lands on one page with the reason attached: failed payouts (with the stored failure reason and whether retrying can help), flagged wallets, and reconciliation exceptions. Each alert offers View batch / Retry (technical failures only) / **Get help** — which opens a ticket with **Fybrus Customer Care** (alert context attached automatically, `FYB-…` reference, tracked on the page, logged in the audit trail). A red count badge on the sidebar shows open alerts at a glance.

### Roles

| Role | Can |
|---|---|
| Admin | everything: create, approve (others' batches), advance, manage users |
| Approver | approve others' batches, advance status |
| Viewer | read-only |

## 3. How it's built

**Stack:** React 18 + Vite + Tailwind (single-page ops dashboard, Geist/Geist Mono design system) · TanStack Query · Express (TypeScript) · Drizzle ORM · Neon Postgres (isolated branch) · deployed on Vercel (static frontend + serverless API).

**Data model (6 tables):** `merchants` (wallet, KYC-reliance fields, screening state) · `batches` (totals, fee, rate, lifecycle, approvals) · `payouts` (amounts, tx hash, failure reason, travel-rule snapshot) · `audit_log` · `users` · `support_tickets` (Fybrus Customer Care).

**The provider/adapter layer** is the architectural core: every external dependency sits behind an interface with a `mock` and a `live` implementation, switched per-provider by env var. The mocks run the full logic (screening rules, payload generation, webhook shapes) so the product flow is real even where the counterparty is simulated.

| Seam | Env switch | Mock today | Live = |
|---|---|---|---|
| Fiat rail (collection IBAN + settlement webhook) | `FIAT_MODE` | mock webhook | Banking Circle: mTLS cert + OAuth + webhook secret |
| FX rate | `FX_MODE` | — (**already live**: ECB via frankfurter, mock fallback) | execution partner for actual conversion |
| USDC settlement | `SETTLEMENT_MODE` | random tx hashes | custody/exchange API (Fireblocks/Circle-shaped) |
| Wallet screening | `SCREENING_MODE` | rule: wallets ending `0bad` are flagged | Chainalysis/Elliptic/TRM-shaped API |
| Travel rule | `TRAVEL_RULE_MODE` | payload generated + recorded | Notabene/21-shaped network |

Full credential checklist per partner: `PARTNERSHIPS.md`.

**Known technical debt (deliberate, demo-stage):** the API exists twice — `server/routes.ts` (local dev) and `api/index.ts` (Vercel serverless, self-contained because of serverless import constraints). They are kept in sync manually; this duplication has been the #1 source of bugs and is the first thing the production refactor removes. Auth is demo-grade (shared password, plaintext, no sessions). The 1,900-line single-file frontend is fine for a prototype, a liability for a team.

## 4. What is real vs simulated (honesty table)

| Real today | Simulated today |
|---|---|
| Full lifecycle logic, dual approval, roles | Bank funding (mock webhook — no BC relationship) |
| Live ECB FX rates pricing every conversion | FX *execution* (no actual conversion) |
| 9 bps fee math, net-of-fee conversion | USDC settlement (random hashes, nothing on-chain) |
| Screening/travel-rule/audit/recon logic + records | Screening & travel-rule counterparties |
| Postgres persistence, deployed product | Users/auth (demo mode), customers (zero) |

## 5. Path to MVP (≈ 3–4 months with 2 experienced engineers + sandboxes)

The gap to MVP is **partner onboarding, not code**. Engineering is ~8–10 weeks; the tail is partner production-credential approval (2–6 weeks, partner-controlled) and pen-test scheduling.

1. **Partnerships** — Banking Circle onboarding (mTLS, OAuth, vIBANs — no anonymous sandbox access exists); settlement/custody rail; screening vendor; travel-rule network. Each lands as a drop-in behind its existing seam.
2. **Regulatory fit** — confirm the service sits inside the existing MiCA CASP Class 2 authorisation (entity, activity scope, passporting). This is the strongest asset in the story and needs compliance sign-off, not engineering.
3. **Real auth** — SSO/2FA, hashed credentials, sessions, rate limiting.
4. **One pilot customer** running a real batch. That is the MVP milestone.

## 6. Path to production

- Kill the dual API surface (one codebase, one deploy artifact); split the single-file frontend.
- Real webhook signature verification (BC HMAC), idempotency keys on funding/dispatch, replay protection.
- Statement-level reconciliation against real bank data (current recon is ledger-internal).
- Secrets management, monitoring/alerting, structured logs, runbooks, incident process.
- External pen test; error budgets/SLOs; backup & restore drills.
- Test suite (the prototype has none — acceptable for demo, disqualifying for production).

## 7. Path to scale

- **Queue-based dispatch** (workers + retries + DLQ) instead of in-request processing — required beyond ~hundreds of payouts per batch.
- **Multi-tenancy** — multiple acquirers with isolated data, per-tenant fees and branding.
- **Treasury management** — pre-funding, float, FX exposure limits, liquidity across rails.
- **Certifications** — SOC 2, then partner-driven requirements (BC operational review).
- DB indexing/partitioning for payout volume; audit-log archiving; observability (traces, per-batch timelines).
- Support tooling: batch replay, manual exception resolution queue, customer-facing statements.

## 8. Risk register (top 5)

| Risk | Mitigation |
|---|---|
| Partner onboarding stalls (BC/custody timelines) | parallel-track two candidates per seam; seams make swapping cheap |
| Regulatory scope creep (service ≠ authorisation) | compliance review before any partner contract |
| USDC de-peg / settlement-asset risk | multi-asset support is a seam away; treasury policy at scale stage |
| Key-person: 2-engineer bus factor | the docs in this repo + PARTNERSHIPS.md are the handover |
| Demo mistaken for live product | this document; the honesty table; "Rails Mock" badge in the UI |

## 9. Demo guide (5 minutes)

1. Sign in as **Julija** (`julijavi@fybrus.com` / `demo123`).
2. **Manual Entry** → pick a registered merchant (autocomplete fills the wallet) → note the fee line → create.
3. Try to approve it — blocked (own batch). Sign out, sign in as **Vaiva**, approve.
4. Open the batch → **"Demo: Simulate incoming settlement"** — with auto-processing on it runs straight through: fee → live ECB rate → screening → travel rule → confirmed, each step in the Audit trail.
5. Show the compliance story: **Merchants** (Shady Imports Ltd, flagged) and batch **BATCH-MRF1O0WJ** — one payout confirmed, one blocked with the reason displayed; **Reconciliation** flags it red as "2 issues".
6. **Alerts** — the red badge counts open issues; each alert explains itself, and "Get help" opens a Fybrus Customer Care ticket with the context attached.
7. **Settings** shows roles, dual-approval, and the auto-processing toggle (turn it off to walk stages manually).

The `*0bad` wallet suffix triggers the screening flag — register any wallet ending `0bad` to demonstrate blocking live.
