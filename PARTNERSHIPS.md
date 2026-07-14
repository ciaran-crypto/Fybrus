# Partnerships — integration seams & go-live checklist

This app is built so every external dependency sits behind a **provider/adapter
layer**. Each provider has a **mock** implementation (runs the demo today, no
credentials) and a **live** implementation that's wired but refuses to run until
its credentials are present. Flipping to production = implement/enable the live
branch + set env vars. **No route or UI changes required.**

- Production surface (Vercel): `api/index.ts` — providers are **inlined** at the
  top of the file (Vercel's serverless bundler can't resolve cross-directory
  imports).
- Local dev surface: `server/routes.ts` — imports `shared/providers.ts`.
- **Keep the two provider implementations in sync.**

## Modes

Global switch: `PROVIDER_MODE = mock | live` (default `mock`).
Per-provider overrides win over the global: `FX_MODE`, `SETTLEMENT_MODE`, `FIAT_MODE`.

Current recommended demo config (already set on Vercel):

| Provider | Mode | Why |
|---|---|---|
| FX | **live** (`FX_MODE=live`) | Real ECB rates via frankfurter.app — **no partnership needed** |
| Settlement | mock | On-chain USDC rail needs a partner |
| Fiat rail | mock | Banking Circle needs a partner |

Check the live state any time: `GET /api/providers`.

## The three seams

### 1. FX / conversion — `fxProvider`
- **Live rate feed is already on** (ECB via `https://api.frankfurter.app`, no key).
  Used at the `converting` step to price fiat→USDC (USDC treated 1:1 with USD).
- Still mock: the *execution* of the conversion (a real conversion/liquidity
  partner). When you have one, implement the trade in the `converting` branch.

### 2. On-chain settlement (USDC payout rail) — `settlementProvider`
- Mock returns a random tx hash. Live throws `ProviderNotConfiguredError`.
- **To go live:** set `SETTLEMENT_MODE=live` + `SETTLEMENT_API_KEY`, and implement
  `liveSettlement.send()` to broadcast a real USDC transfer (custody/exchange API
  or on-chain signer) returning the real `{ txHash, network }`.
- Resilience already built: per-payout failures are isolated, a fully-failed
  batch goes to `failed`, and `POST /api/batches/:id/retry-failed` re-dispatches.

### 3. Fiat rails (Banking Circle) — `fiatRailProvider`
- Inbound settlement funds a batch. Endpoint: `POST /api/webhooks/banking-circle`
  with `{ batchRef, amount }` → moves the batch `pending → funded`.
- Demo: the "simulate settlement" action posts this shape (mock trusts the sig).
- **To go live:** set `FIAT_MODE=live` + `BANKING_CIRCLE_WEBHOOK_SECRET`, implement
  the real signature check in `liveFiatRail.verifyWebhookSignature()`, and point
  Banking Circle's webhook at `/api/webhooks/banking-circle`.
- **Banking Circle also requires client-certificate (mutual TLS) + OAuth2** for
  *outbound* calls (fetching virtual IBANs, initiating payouts). That client goes
  in a new `liveFiatRail` method once you have the sandbox cert + client id/secret.
  There is **no anonymous/no-login access** to Banking Circle's sandbox.

### 4. Compliance: KYC reliance + wallet screening — `walletScreeningProvider`

**KYC model = reliance.** Underlying-merchant KYC is performed on a separate
system by the relying party (the client acquirer). This app does **no KYC** —
it records the attestation only: `kyc_relied_on`, `kyc_ref` (case ref on the
other system), `kyc_attested_at` per merchant.

**Wallet screening stays our obligation.** Destination wallets are screened
(sanctions / illicit exposure) at merchant registration AND again at dispatch —
a flagged wallet's payout is blocked (`payout_blocked` in the audit log), the
rest of the batch proceeds.

- Mock rule for demos: any wallet address ending in `0bad` is flagged high-risk.
- Endpoints: `POST /api/merchants/:id/screen` (re-screen), `POST /api/merchants/screen-all` (backfill).
- **To go live:** set `SCREENING_MODE=live` + `SCREENING_API_KEY`, implement
  `liveScreening.screen()` against the screening partner (Chainalysis / Elliptic /
  TRM-shaped API).
### 5. Travel rule (EU TFR / FATF R.16) — `travelRuleProvider`

**Confirmed: sits with us.** Originator/beneficiary data accompanies every USDC
payout (no de-minimis under EU TFR for CASP transfers). At dispatch, transmission
happens **before** settlement — if it fails, the payout does not go out
(`travel_rule_status = failed`). The transmitted payload snapshot is stored on
the payout (`travel_rule_data`, `travel_rule_ref`, `travel_rule_at`) for audit,
and shown in the batch detail's "Travel Rule" column.

- Originator identity via env (defaults for demo): `TRAVEL_RULE_ORIGINATOR`,
  `TRAVEL_RULE_ORIGINATOR_REF`, `TRAVEL_RULE_ORIGINATOR_COUNTRY`.
- **To go live:** set `TRAVEL_RULE_MODE=live` + `TRAVEL_RULE_API_KEY`, implement
  `liveTravelRule.transmit()` against the travel-rule network partner
  (Notabene / 21 Travel Rule / Sumsub-shaped, IVMS 101 payload).

## Env vars (set in Vercel project + local `.env`)

```
DATABASE_URL=...                      # already set (isolated Neon branch)
PROVIDER_MODE=mock                    # or "live"
FX_MODE=live                          # already set — real ECB rates
SETTLEMENT_MODE=mock                  # → live when you have the rail
SETTLEMENT_API_KEY=                   # settlement partner key
FIAT_MODE=mock                        # → live when Banking Circle is wired
BANKING_CIRCLE_WEBHOOK_SECRET=        # BC inbound webhook signing secret
SCREENING_MODE=mock                   # → live when a screening partner is wired
SCREENING_API_KEY=                    # screening partner key
TRAVEL_RULE_MODE=mock                 # → live when a travel-rule network is wired
TRAVEL_RULE_API_KEY=                  # travel-rule partner key
TRAVEL_RULE_ORIGINATOR=               # originator legal name (default: Fybrus (originating PSP))
TRAVEL_RULE_ORIGINATOR_REF=           # originator account ref (default: FYB-MASTER-EUR)
TRAVEL_RULE_ORIGINATOR_COUNTRY=       # ISO country (default: LT)
# (outbound BC also needs the mTLS client cert + OAuth client id/secret)
```

## New endpoints added for production-readiness
- `GET  /api/providers` — current mode of each provider (drives the UI badge)
- `GET  /api/reconciliation` — money-trail rows + totals + exceptions
- `GET  /api/reconciliation/csv` — same as a download
- `POST /api/webhooks/banking-circle` — inbound fiat settlement (funds a batch)
- `POST /api/batches/:id/retry-failed` — re-dispatch failed payouts
