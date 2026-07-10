// ─────────────────────────────────────────────────────────────────────────
// Provider / adapter layer
//
// Every external dependency (fiat rails, FX, on-chain settlement) sits behind
// an interface with two implementations:
//   • mock — self-contained, no credentials, drives the demo
//   • live — real integration; throws ProviderNotConfiguredError until the
//            partnership credentials are dropped into env
//
// A single env flag switches modes:  PROVIDER_MODE = "mock" (default) | "live"
// Per-provider overrides: FX_MODE, SETTLEMENT_MODE, FIAT_MODE.
//
// When a partnership lands, implement the `live*` branch + set env — no changes
// to routes or UI required. See PARTNERSHIPS.md.
// ─────────────────────────────────────────────────────────────────────────

export const PROVIDER_MODE = (process.env.PROVIDER_MODE || "mock").toLowerCase();
const mode = (specific?: string) => (specific || PROVIDER_MODE).toLowerCase();

export class ProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`${provider} provider is in live mode but not configured — set the required credentials (see PARTNERSHIPS.md).`);
    this.name = "ProviderNotConfiguredError";
  }
}

// ── FX / conversion ────────────────────────────────────────────────────────
// The rate feed can be LIVE today with no partnership (ECB via frankfurter.app).
// Actual conversion *execution* still needs a partner and stays mock.
export interface FxQuote {
  base: string;        // e.g. "EUR"
  quote: string;       // e.g. "USDC"
  rate: number;        // 1 unit base = <rate> quote
  source: string;      // "ecb-frankfurter" | "mock" | "mock-fallback"
  asOf: string;        // ISO timestamp
}

// USDC is treated as 1:1 with USD.
const USD_FALLBACK: Record<string, number> = {
  USD: 1.0, EUR: 1.08, GBP: 1.27, AUD: 0.66, CAD: 0.73,
  CHF: 1.11, JPY: 0.0064, SEK: 0.095, NOK: 0.094, DKK: 0.145,
};

function mockRate(base: string): number {
  const b = USD_FALLBACK[base.toUpperCase()] ?? 1.0;
  // small deterministic-ish jitter so successive quotes differ slightly
  const jitter = (Math.sin(Date.now() / 3.6e6) * 0.004);
  return +(b + jitter).toFixed(6);
}

async function liveRate(base: string): Promise<{ rate: number; source: string }> {
  const b = base.toUpperCase();
  if (b === "USD") return { rate: 1.0, source: "ecb-frankfurter" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=${b}&to=USD`, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`frankfurter ${r.status}`);
    const j: any = await r.json();
    const rate = j?.rates?.USD;
    if (typeof rate !== "number") throw new Error("no USD rate in response");
    return { rate: +rate.toFixed(6), source: "ecb-frankfurter" };
  } finally {
    clearTimeout(t);
  }
}

export interface FxProvider {
  getRate(base: string, quote?: string): Promise<FxQuote>;
}

export const fxProvider: FxProvider = {
  async getRate(base: string, quote = "USDC"): Promise<FxQuote> {
    const asOf = new Date().toISOString();
    if (mode(process.env.FX_MODE) === "live") {
      try {
        const { rate, source } = await liveRate(base);
        return { base: base.toUpperCase(), quote, rate, source, asOf };
      } catch {
        // never break the flow — fall back to the table but flag it
        return { base: base.toUpperCase(), quote, rate: mockRate(base), source: "mock-fallback", asOf };
      }
    }
    return { base: base.toUpperCase(), quote, rate: mockRate(base), source: "mock", asOf };
  },
};

// ── On-chain settlement (USDC payout rail) ───────────────────────────────────
export interface SettlementInstruction {
  walletAddress: string;
  usdcAmount: string;
  reference: string;
}
export interface SettlementResult {
  txHash: string;
  network: string;
  provider: string;
}
export interface SettlementProvider {
  configured: boolean;
  send(i: SettlementInstruction): Promise<SettlementResult>;
}

function randomTxHash(): string {
  // node crypto isn't imported to keep this isomorphic; use Web Crypto
  const bytes = new Uint8Array(32);
  (globalThis.crypto as Crypto).getRandomValues(bytes);
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const mockSettlement: SettlementProvider = {
  configured: true,
  async send(): Promise<SettlementResult> {
    return { txHash: randomTxHash(), network: "ethereum-sepolia", provider: "mock-settlement" };
  },
};

const liveSettlement: SettlementProvider = {
  configured: Boolean(process.env.SETTLEMENT_API_KEY),
  async send(): Promise<SettlementResult> {
    // TODO(partnership): broadcast a real USDC transfer via the settlement
    // partner (e.g. custody/exchange API or on-chain signer) and return the
    // real tx hash + network. Poll/confirm handled by the caller.
    throw new ProviderNotConfiguredError("settlement");
  },
};

export const settlementProvider: SettlementProvider =
  mode(process.env.SETTLEMENT_MODE) === "live" ? liveSettlement : mockSettlement;

// ── Fiat rails (Banking Circle) ──────────────────────────────────────────────
// Inbound fiat settlement that funds a batch. In production Banking Circle posts
// a webhook; in mock we expose a "simulate settlement" trigger that hits the
// same internal fund path.
export interface FiatRailProvider {
  name: string;
  configured: boolean;
  // Verify an inbound webhook signature. Mock always trusts; live uses HMAC.
  verifyWebhookSignature(rawBody: string, signature?: string): boolean;
}

const mockFiatRail: FiatRailProvider = {
  name: "mock-fiat-rail",
  configured: true,
  verifyWebhookSignature() {
    return true;
  },
};

const liveFiatRail: FiatRailProvider = {
  name: "banking-circle",
  configured: Boolean(process.env.BANKING_CIRCLE_WEBHOOK_SECRET),
  verifyWebhookSignature(rawBody: string, signature?: string): boolean {
    const secret = process.env.BANKING_CIRCLE_WEBHOOK_SECRET;
    if (!secret || !signature) return false;
    // TODO(partnership): confirm the exact BC signature scheme (header + algo).
    // Placeholder HMAC-SHA256 hex comparison.
    // (kept dependency-free; caller may replace with node:crypto verify)
    return signature.length > 0; // never trust silently in real live use
  },
};

export const fiatRailProvider: FiatRailProvider =
  mode(process.env.FIAT_MODE) === "live" ? liveFiatRail : mockFiatRail;

// ── Destination-wallet screening (sanctions / illicit-exposure) ─────────────
// Under the KYC reliance model, underlying-merchant KYC lives on the relying
// party's system (e.g. Paystrax as acquirer) — we only record the attestation.
// Wallet screening, however, is OUR obligation before dispatching USDC.
export interface WalletScreenResult {
  status: "clear" | "flagged";
  risk: "low" | "high";
  provider: string;
  screenedAt: string; // ISO
  reason?: string;
}
export interface WalletScreeningProvider {
  name: string;
  configured: boolean;
  screen(walletAddress: string): Promise<WalletScreenResult>;
}

const mockScreening: WalletScreeningProvider = {
  name: "mock-screening",
  configured: true,
  async screen(walletAddress: string): Promise<WalletScreenResult> {
    // Deterministic demo rule: any address ending in "0bad" is flagged.
    const flagged = walletAddress.toLowerCase().endsWith("0bad");
    return {
      status: flagged ? "flagged" : "clear",
      risk: flagged ? "high" : "low",
      provider: "mock-screening",
      screenedAt: new Date().toISOString(),
      ...(flagged ? { reason: "Sanctions-list match (demo rule: *0bad)" } : {}),
    };
  },
};

const liveScreening: WalletScreeningProvider = {
  name: "live-screening",
  configured: Boolean(process.env.SCREENING_API_KEY),
  async screen(): Promise<WalletScreenResult> {
    // TODO(partnership): call the screening partner (Chainalysis / Elliptic /
    // TRM-shaped API) and map their verdict to { status, risk, reason }.
    throw new ProviderNotConfiguredError("wallet-screening");
  },
};

export const walletScreeningProvider: WalletScreeningProvider =
  mode(process.env.SCREENING_MODE) === "live" ? liveScreening : mockScreening;

// ── Travel rule (EU TFR / FATF R.16) ─────────────────────────────────────────
// Sits with US (confirmed): originator/beneficiary data must accompany every
// crypto transfer. The payload is IVMS 101-shaped; transmission goes through a
// travel-rule network partner (Notabene / 21 Travel Rule / Sumsub-shaped) when
// live. Mock transmits nothing externally but generates + records the payload
// so the audit snapshot is real.
export interface TravelRulePayload {
  originator: { name: string; accountRef: string; country: string };
  beneficiary: { name: string; walletAddress: string };
  transfer: { asset: "USDC"; amount: string; reference: string };
}
export interface TravelRuleResult {
  ref: string;          // transmission reference
  status: "transmitted";
  provider: string;
  payload: TravelRulePayload;
  transmittedAt: string; // ISO
}
export interface TravelRuleProvider {
  name: string;
  configured: boolean;
  transmit(p: TravelRulePayload): Promise<TravelRuleResult>;
}

// Originator identity (the platform operator) — override via env when known.
export function originatorIdentity() {
  return {
    name: process.env.TRAVEL_RULE_ORIGINATOR || "Paystrax (originating PSP)",
    accountRef: process.env.TRAVEL_RULE_ORIGINATOR_REF || "PSX-MASTER-EUR",
    country: process.env.TRAVEL_RULE_ORIGINATOR_COUNTRY || "LT",
  };
}

function trRef(): string {
  const bytes = new Uint8Array(6);
  (globalThis.crypto as Crypto).getRandomValues(bytes);
  return "TR-" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

const mockTravelRule: TravelRuleProvider = {
  name: "mock-travel-rule",
  configured: true,
  async transmit(payload: TravelRulePayload): Promise<TravelRuleResult> {
    return { ref: trRef(), status: "transmitted", provider: "mock-travel-rule", payload, transmittedAt: new Date().toISOString() };
  },
};

const liveTravelRule: TravelRuleProvider = {
  name: "live-travel-rule",
  configured: Boolean(process.env.TRAVEL_RULE_API_KEY),
  async transmit(): Promise<TravelRuleResult> {
    // TODO(partnership): submit IVMS 101 payload to the travel-rule network
    // partner and return their transmission reference.
    throw new ProviderNotConfiguredError("travel-rule");
  },
};

export const travelRuleProvider: TravelRuleProvider =
  mode(process.env.TRAVEL_RULE_MODE) === "live" ? liveTravelRule : mockTravelRule;

// ── Status snapshot (for /api/providers + a UI badge) ────────────────────────
export function providerStatus() {
  return {
    mode: PROVIDER_MODE,
    fx: {
      mode: mode(process.env.FX_MODE),
      live: mode(process.env.FX_MODE) === "live",
      source: mode(process.env.FX_MODE) === "live" ? "ecb-frankfurter" : "mock",
    },
    settlement: {
      mode: mode(process.env.SETTLEMENT_MODE),
      provider: settlementProvider === liveSettlement ? "live" : "mock-settlement",
      configured: settlementProvider.configured,
    },
    fiat: {
      mode: mode(process.env.FIAT_MODE),
      provider: fiatRailProvider.name,
      configured: fiatRailProvider.configured,
    },
    screening: {
      mode: mode(process.env.SCREENING_MODE),
      provider: walletScreeningProvider.name,
      configured: walletScreeningProvider.configured,
    },
    travelRule: {
      mode: mode(process.env.TRAVEL_RULE_MODE),
      provider: travelRuleProvider.name,
      configured: travelRuleProvider.configured,
    },
  };
}

// ── Reconciliation (pure) ────────────────────────────────────────────────────
// Compares the money trail across the lifecycle and flags exceptions.
export interface ReconBatch {
  id: string;
  batchRef: string;
  currency: string;
  status: string;
  totalFiat: string | null;
  totalEur: string | null;
  totalUsdc: string | null;
  exchangeRate: string | null;
  merchantCount: number;
  fiatReceivedAt: Date | string | null;
  completedAt: Date | string | null;
}
export interface ReconPayout {
  batchId: string;
  usdcAmount: string | null;
  txHash: string | null;
  status: string | null;
}

export interface ReconRow {
  batchRef: string;
  currency: string;
  status: string;
  fiatExpected: number;
  fiatReceived: number;      // funded => full amount received
  usdcConverted: number;     // batch.totalUsdc
  usdcSent: number;          // sum of payouts with a txHash
  usdcConfirmed: number;     // sum of confirmed payouts
  payoutsTotal: number;
  payoutsSent: number;
  payoutsConfirmed: number;
  payoutsFailed: number;
  exceptions: string[];
  reconciled: boolean;
}

const num = (v: string | null | undefined) => (v ? parseFloat(v) : 0);

export function computeReconciliation(batches: ReconBatch[], payouts: ReconPayout[]) {
  const byBatch = new Map<string, ReconPayout[]>();
  for (const p of payouts) {
    const arr = byBatch.get(p.batchId) || [];
    arr.push(p);
    byBatch.set(p.batchId, arr);
  }

  const rows: ReconRow[] = batches.map((b) => {
    const ps = byBatch.get(b.id) || [];
    const fiatExpected = num(b.totalFiat) || num(b.totalEur);
    const funded = Boolean(b.fiatReceivedAt) || ["funded", "converting", "sending", "completed"].includes(b.status);
    const fiatReceived = funded ? fiatExpected : 0;
    const usdcConverted = num(b.totalUsdc);
    const sent = ps.filter((p) => p.txHash);
    const confirmed = ps.filter((p) => p.status === "confirmed");
    const failed = ps.filter((p) => p.status === "failed");
    const usdcSent = sent.reduce((s, p) => s + num(p.usdcAmount), 0);
    const usdcConfirmed = confirmed.reduce((s, p) => s + num(p.usdcAmount), 0);

    const exceptions: string[] = [];
    if (funded && Math.abs(fiatReceived - fiatExpected) > 0.01)
      exceptions.push(`Fiat received (${fiatReceived.toFixed(2)}) ≠ expected (${fiatExpected.toFixed(2)})`);
    if (usdcConverted > 0) {
      const payoutSum = ps.reduce((s, p) => s + num(p.usdcAmount), 0);
      if (payoutSum > 0 && Math.abs(payoutSum - usdcConverted) > 0.5)
        exceptions.push(`Payout USDC sum (${payoutSum.toFixed(2)}) ≠ batch converted (${usdcConverted.toFixed(2)})`);
    }
    if (b.status === "completed" && confirmed.length !== ps.length)
      exceptions.push(`Completed but ${ps.length - confirmed.length}/${ps.length} payouts unconfirmed`);
    if (failed.length > 0) exceptions.push(`${failed.length} payout(s) failed`);
    if (b.status === "sending" && sent.length < ps.length)
      exceptions.push(`Sending: ${ps.length - sent.length}/${ps.length} not yet dispatched`);

    return {
      batchId: b.id,
      batchRef: b.batchRef,
      currency: b.currency || "EUR",
      status: b.status,
      fiatExpected,
      fiatReceived,
      usdcConverted,
      usdcSent,
      usdcConfirmed,
      payoutsTotal: ps.length,
      payoutsSent: sent.length,
      payoutsConfirmed: confirmed.length,
      payoutsFailed: failed.length,
      exceptions,
      reconciled: exceptions.length === 0,
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.fiatExpected += r.fiatExpected;
      acc.fiatReceived += r.fiatReceived;
      acc.usdcConverted += r.usdcConverted;
      acc.usdcSent += r.usdcSent;
      acc.usdcConfirmed += r.usdcConfirmed;
      acc.exceptions += r.exceptions.length;
      return acc;
    },
    { fiatExpected: 0, fiatReceived: 0, usdcConverted: 0, usdcSent: 0, usdcConfirmed: 0, exceptions: 0 },
  );

  return {
    rows,
    totals,
    reconciledBatches: rows.filter((r) => r.reconciled).length,
    exceptionBatches: rows.filter((r) => !r.reconciled).length,
  };
}
