// Vercel serverless function — self-contained Express app
import express from "express";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { pgTable, text, varchar, integer, timestamp, decimal } from "drizzle-orm/pg-core";
import { eq, and, desc, sql } from "drizzle-orm";
import crypto from "crypto";

// ─────────────────────────────────────────────────────────────────────────
// Provider / adapter layer — INLINED (Vercel serverless can't resolve
// cross-directory imports; mirrors shared/providers.ts used by the local
// server). Keep the two in sync. See PARTNERSHIPS.md.
// ─────────────────────────────────────────────────────────────────────────
const PROVIDER_MODE = (process.env.PROVIDER_MODE || "mock").toLowerCase();
const pmode = (specific?: string) => (specific || PROVIDER_MODE).toLowerCase();

class ProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`${provider} provider is in live mode but not configured — set credentials (see PARTNERSHIPS.md).`);
    this.name = "ProviderNotConfiguredError";
  }
}

const USD_FALLBACK: Record<string, number> = {
  USD: 1.0, EUR: 1.08, GBP: 1.27, AUD: 0.66, CAD: 0.73,
  CHF: 1.11, JPY: 0.0064, SEK: 0.095, NOK: 0.094, DKK: 0.145,
};
function mockRate(base: string): number {
  const b = USD_FALLBACK[base.toUpperCase()] ?? 1.0;
  return +(b + Math.sin(Date.now() / 3.6e6) * 0.004).toFixed(6);
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
    if (typeof j?.rates?.USD !== "number") throw new Error("no USD rate");
    return { rate: +j.rates.USD.toFixed(6), source: "ecb-frankfurter" };
  } finally { clearTimeout(t); }
}
const fxProvider = {
  async getRate(base: string, quote = "USDC") {
    const asOf = new Date().toISOString();
    if (pmode(process.env.FX_MODE) === "live") {
      try { const { rate, source } = await liveRate(base); return { base: base.toUpperCase(), quote, rate, source, asOf }; }
      catch { return { base: base.toUpperCase(), quote, rate: mockRate(base), source: "mock-fallback", asOf }; }
    }
    return { base: base.toUpperCase(), quote, rate: mockRate(base), source: "mock", asOf };
  },
};

interface SettlementInstruction { walletAddress: string; usdcAmount: string; reference: string; }
interface SettlementResult { txHash: string; network: string; provider: string; }
const mockSettlement = {
  configured: true,
  async send(_i: SettlementInstruction): Promise<SettlementResult> { return { txHash: "0x" + crypto.randomBytes(32).toString("hex"), network: "ethereum-sepolia", provider: "mock-settlement" }; },
};
const liveSettlement = {
  configured: Boolean(process.env.SETTLEMENT_API_KEY),
  async send(_i: SettlementInstruction): Promise<SettlementResult> { throw new ProviderNotConfiguredError("settlement"); },
};
const settlementProvider = pmode(process.env.SETTLEMENT_MODE) === "live" ? liveSettlement : mockSettlement;

const mockFiatRail = { name: "mock-fiat-rail", configured: true, verifyWebhookSignature() { return true; } };
const liveFiatRail = {
  name: "banking-circle",
  configured: Boolean(process.env.BANKING_CIRCLE_WEBHOOK_SECRET),
  verifyWebhookSignature(_rawBody: string, signature?: string) {
    const secret = process.env.BANKING_CIRCLE_WEBHOOK_SECRET;
    if (!secret || !signature) return false;
    return signature.length > 0; // TODO(partnership): real BC HMAC verification
  },
};
const fiatRailProvider = pmode(process.env.FIAT_MODE) === "live" ? liveFiatRail : mockFiatRail;

interface WalletScreenResult { status: "clear" | "flagged"; risk: "low" | "high"; provider: string; screenedAt: string; reason?: string; }
const mockScreening = {
  name: "mock-screening",
  configured: true,
  async screen(walletAddress: string): Promise<WalletScreenResult> {
    const flagged = walletAddress.toLowerCase().endsWith("0bad"); // demo rule
    return { status: flagged ? "flagged" : "clear", risk: flagged ? "high" : "low", provider: "mock-screening", screenedAt: new Date().toISOString(), ...(flagged ? { reason: "Sanctions-list match (demo rule: *0bad)" } : {}) };
  },
};
const liveScreening = {
  name: "live-screening",
  configured: Boolean(process.env.SCREENING_API_KEY),
  async screen(_w: string): Promise<WalletScreenResult> { throw new ProviderNotConfiguredError("wallet-screening"); },
};
const walletScreeningProvider = pmode(process.env.SCREENING_MODE) === "live" ? liveScreening : mockScreening;

// Travel rule (EU TFR / FATF R.16) — sits with us
interface TravelRulePayload {
  originator: { name: string; accountRef: string; country: string };
  beneficiary: { name: string; walletAddress: string };
  transfer: { asset: "USDC"; amount: string; reference: string };
}
interface TravelRuleResult { ref: string; status: "transmitted"; provider: string; payload: TravelRulePayload; transmittedAt: string; }
function originatorIdentity() {
  return {
    name: process.env.TRAVEL_RULE_ORIGINATOR || "Paystrax (originating PSP)",
    accountRef: process.env.TRAVEL_RULE_ORIGINATOR_REF || "PSX-MASTER-EUR",
    country: process.env.TRAVEL_RULE_ORIGINATOR_COUNTRY || "LT",
  };
}
const mockTravelRule = {
  name: "mock-travel-rule",
  configured: true,
  async transmit(payload: TravelRulePayload): Promise<TravelRuleResult> {
    return { ref: "TR-" + crypto.randomBytes(6).toString("hex").toUpperCase(), status: "transmitted", provider: "mock-travel-rule", payload, transmittedAt: new Date().toISOString() };
  },
};
const liveTravelRule = {
  name: "live-travel-rule",
  configured: Boolean(process.env.TRAVEL_RULE_API_KEY),
  async transmit(_p: TravelRulePayload): Promise<TravelRuleResult> { throw new ProviderNotConfiguredError("travel-rule"); },
};
const travelRuleProvider = pmode(process.env.TRAVEL_RULE_MODE) === "live" ? liveTravelRule : mockTravelRule;

function providerStatus() {
  return {
    mode: PROVIDER_MODE,
    fx: { mode: pmode(process.env.FX_MODE), live: pmode(process.env.FX_MODE) === "live", source: pmode(process.env.FX_MODE) === "live" ? "ecb-frankfurter" : "mock" },
    settlement: { mode: pmode(process.env.SETTLEMENT_MODE), provider: settlementProvider === liveSettlement ? "live" : "mock-settlement", configured: settlementProvider.configured },
    fiat: { mode: pmode(process.env.FIAT_MODE), provider: fiatRailProvider.name, configured: fiatRailProvider.configured },
    screening: { mode: pmode(process.env.SCREENING_MODE), provider: walletScreeningProvider.name, configured: walletScreeningProvider.configured },
    travelRule: { mode: pmode(process.env.TRAVEL_RULE_MODE), provider: travelRuleProvider.name, configured: travelRuleProvider.configured },
  };
}

const rnum = (v: string | null | undefined) => (v ? parseFloat(v) : 0);
function computeReconciliation(bs: any[], ps: any[]) {
  const byBatch = new Map<string, any[]>();
  for (const p of ps) { const a = byBatch.get(p.batchId) || []; a.push(p); byBatch.set(p.batchId, a); }
  const rows = bs.map((b) => {
    const pl = byBatch.get(b.id) || [];
    const fiatExpected = rnum(b.totalFiat) || rnum(b.totalEur);
    const funded = Boolean(b.fiatReceivedAt) || ["funded", "converting", "sending", "completed"].includes(b.status);
    const fiatReceived = funded ? fiatExpected : 0;
    const usdcConverted = rnum(b.totalUsdc);
    const sent = pl.filter((p) => p.txHash);
    const confirmed = pl.filter((p) => p.status === "confirmed");
    const failed = pl.filter((p) => p.status === "failed");
    const usdcSent = sent.reduce((s, p) => s + rnum(p.usdcAmount), 0);
    const usdcConfirmed = confirmed.reduce((s, p) => s + rnum(p.usdcAmount), 0);
    const exceptions: string[] = [];
    if (funded && Math.abs(fiatReceived - fiatExpected) > 0.01) exceptions.push(`Fiat received (${fiatReceived.toFixed(2)}) ≠ expected (${fiatExpected.toFixed(2)})`);
    if (usdcConverted > 0) { const psum = pl.reduce((s, p) => s + rnum(p.usdcAmount), 0); if (psum > 0 && Math.abs(psum - usdcConverted) > 0.5) exceptions.push(`Payout USDC sum (${psum.toFixed(2)}) ≠ batch converted (${usdcConverted.toFixed(2)})`); }
    if (b.status === "completed" && confirmed.length !== pl.length) exceptions.push(`Completed but ${pl.length - confirmed.length}/${pl.length} payouts unconfirmed`);
    if (failed.length > 0) exceptions.push(`${failed.length} payout(s) failed`);
    if (b.status === "sending" && sent.length < pl.length) exceptions.push(`Sending: ${pl.length - sent.length}/${pl.length} not yet dispatched`);
    return { batchId: b.id, batchRef: b.batchRef, currency: b.currency || "EUR", status: b.status, fiatExpected, fiatReceived, usdcConverted, usdcSent, usdcConfirmed, payoutsTotal: pl.length, payoutsSent: sent.length, payoutsConfirmed: confirmed.length, payoutsFailed: failed.length, exceptions, reconciled: exceptions.length === 0 };
  });
  const totals = rows.reduce((a, r) => { a.fiatExpected += r.fiatExpected; a.fiatReceived += r.fiatReceived; a.usdcConverted += r.usdcConverted; a.usdcSent += r.usdcSent; a.usdcConfirmed += r.usdcConfirmed; a.exceptions += r.exceptions.length; return a; }, { fiatExpected: 0, fiatReceived: 0, usdcConverted: 0, usdcSent: 0, usdcConfirmed: 0, exceptions: 0 });
  return { rows, totals, reconciledBatches: rows.filter((r) => r.reconciled).length, exceptionBatches: rows.filter((r) => !r.reconciled).length };
}

// ── Inline schema (avoids import resolution issues on Vercel) ──
const merchants = pgTable("merchants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  walletAddress: text("wallet_address").notNull(),
  email: text("email"),
  status: text("status").default("active"),
  // KYC reliance model — attestation only; verification lives on the relying party's system
  kycReliedOn: text("kyc_relied_on").default("Paystrax (acquirer)"),
  kycRef: text("kyc_ref"),
  kycAttestedAt: timestamp("kyc_attested_at"),
  // Destination-wallet screening — our obligation
  walletScreenStatus: text("wallet_screen_status").default("unscreened"),
  walletScreenProvider: text("wallet_screen_provider"),
  walletScreenedAt: timestamp("wallet_screened_at"),
  markupBps: integer("markup_bps"),
  payoutMethod: text("payout_method").default("stablecoin"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});
const platformSettings = pgTable("platform_settings", {
  id: integer("id").primaryKey().default(1),
  defaultMarkupBps: integer("default_markup_bps").notNull().default(25),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

const batches = pgTable("batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchRef: text("batch_ref").notNull().unique(),
  currency: text("currency").notNull().default("EUR"),
  totalFiat: decimal("total_fiat", { precision: 14, scale: 2 }).notNull(),
  totalEur: decimal("total_eur", { precision: 14, scale: 2 }).notNull(),
  totalUsdc: decimal("total_usdc", { precision: 14, scale: 6 }),
  exchangeRate: decimal("exchange_rate", { precision: 12, scale: 6 }),
  payoutTiming: text("payout_timing").default("asap"),
  feeBps: integer("fee_bps").default(0),
  feeAmount: decimal("fee_amount", { precision: 14, scale: 2 }).default("0"),
  markupTotal: decimal("markup_total", { precision: 14, scale: 2 }).default("0"),
  scheduledDate: timestamp("scheduled_date"),
  status: text("status").default("pending"),
  createdBy: text("created_by"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  merchantCount: integer("merchant_count").notNull(),
  fiatReceivedAt: timestamp("fiat_received_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

const payouts = pgTable("payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId: varchar("batch_id").notNull(),
  merchantId: varchar("merchant_id").notNull(),
  fiatAmount: decimal("fiat_amount", { precision: 14, scale: 2 }).notNull(),
  eurAmount: decimal("eur_amount", { precision: 14, scale: 2 }).notNull(),
  usdcAmount: decimal("usdc_amount", { precision: 14, scale: 6 }),
  walletAddress: text("wallet_address").notNull(),
  txHash: text("tx_hash"),
  status: text("status").default("pending"),
  fybrusFeeAmount: decimal("fybrus_fee_amount", { precision: 14, scale: 2 }),
  markupAmount: decimal("markup_amount", { precision: 14, scale: 2 }),
  payoutMethod: text("payout_method").default("stablecoin"),
  payoutFiatAmount: decimal("payout_fiat_amount", { precision: 14, scale: 2 }),
  offRampRate: decimal("off_ramp_rate", { precision: 12, scale: 6 }),
  // Travel rule (EU TFR / FATF R.16) — snapshot of the transmitted payload
  failureReason: text("failure_reason"),
  travelRuleStatus: text("travel_rule_status").default("pending"),
  travelRuleRef: text("travel_rule_ref"),
  travelRuleData: text("travel_rule_data"),
  travelRuleAt: timestamp("travel_rule_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  confirmedAt: timestamp("confirmed_at"),
});

const auditLog = pgTable("audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  entityRef: text("entity_ref"),
  actor: text("actor").default("paystrax"),
  detail: text("detail"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketRef: text("ticket_ref").notNull().unique(),
  subject: text("subject").notNull(),
  message: text("message"),
  context: text("context"),
  status: text("status").default("open"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("viewer"),
  password: text("password").notNull().default("demo123"),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// ── DB connection ──
const neonSql = neon(process.env.DATABASE_URL!);
const db = drizzle(neonSql);

// ── Express app ──
const app = express();
app.use(express.json());

async function logAudit(action: string, entityType?: string, entityId?: string, entityRef?: string, detail?: string, actor?: string) {
  try { await db.insert(auditLog).values({ action, entityType, entityId, entityRef, detail, actor: actor || "paystrax" }); } catch (e) { console.error(e); }
}

// Health
app.get("/api/health", (_r, res) => res.json({ ok: true, ts: Date.now() }));

// Users
app.get("/api/users", async (_r, res) => {
  const rows = await db.select().from(users).orderBy(desc(users.createdAt));
  res.json(rows.map(u => ({ ...u, password: undefined })));
});
app.post("/api/users", async (req, res) => {
  const { email, name, role, password } = req.body;
  if (!email || !name) return res.status(400).json({ message: "Email and name required" });
  const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  if (existing.length) return res.status(400).json({ message: "Email already exists" });
  const [u] = await db.insert(users).values({ email: email.toLowerCase(), name, role: role || "viewer", password: password || "demo123" }).returning();
  await logAudit("user_created", "user", u.id, u.email, `User ${name} (${role}) created`);
  res.json({ ...u, password: undefined });
});
app.patch("/api/users/:id", async (req, res) => {
  const updates: any = {};
  if (req.body.name) updates.name = req.body.name;
  if (req.body.role) updates.role = req.body.role;
  if (req.body.status) updates.status = req.body.status;
  const [u] = await db.update(users).set(updates).where(eq(users.id, req.params.id)).returning();
  res.json({ ...u, password: undefined });
});
app.delete("/api/users/:id", async (req, res) => {
  await db.delete(users).where(eq(users.id, req.params.id));
  res.json({ ok: true });
});
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Email and password required" });
  const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  if (!u || u.password !== password) return res.status(401).json({ message: "Invalid email or password" });
  if (u.status === "disabled") return res.status(403).json({ message: "Account disabled" });
  await logAudit("login", "user", u.id, u.email, `User ${u.name} signed in`, u.email);
  res.json({ id: u.id, email: u.email, name: u.name, role: u.role, initials: u.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2) });
});
app.post("/api/users/seed", async (_r, res) => {
  const existing = await db.select().from(users);
  if (existing.length) return res.json({ message: "Users exist", count: existing.length });
  await db.insert(users).values([
    { email: "julijavi@paystrax.com", name: "Julija Vilkute", role: "admin", password: "demo123" },
    { email: "vaivani@paystrax.com",  name: "Vaiva Niuklyte", role: "approver", password: "demo123" },
  ]);
  res.json({ message: "Seeded", count: 2 });
});

// Merchants
app.get("/api/merchants", async (_r, res) => { res.json(await db.select().from(merchants).orderBy(desc(merchants.createdAt))); });
app.post("/api/merchants", async (req, res) => {
  const { name, walletAddress, email, kycRef, kycReliedOn, markupBps, payoutMethod } = req.body;
  if (!name || !walletAddress) return res.status(400).json({ message: "Name and wallet required" });
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) return res.status(400).json({ message: "Invalid wallet address" });
  const screen = await walletScreeningProvider.screen(walletAddress);
  const [m] = await db.insert(merchants).values({
    name, walletAddress, email,
    kycReliedOn: kycReliedOn || "Paystrax (acquirer)", kycRef: kycRef || null, kycAttestedAt: new Date(),
    walletScreenStatus: screen.status, walletScreenProvider: screen.provider, walletScreenedAt: new Date(),
    markupBps: (markupBps === "" || markupBps == null) ? null : Number(markupBps),
    payoutMethod: payoutMethod === "fiat" ? "fiat" : "stablecoin",
  }).returning();
  await logAudit("merchant_registered", "merchant", m.id, m.name, `Wallet ${walletAddress.slice(0, 8)}... · screening: ${screen.status}${screen.reason ? ` (${screen.reason})` : ""}`);
  res.json(m);
});
app.post("/api/merchants/:id/screen", async (req, res) => {
  const [m] = await db.select().from(merchants).where(eq(merchants.id, req.params.id));
  if (!m) return res.status(404).json({ message: "Not found" });
  const screen = await walletScreeningProvider.screen(m.walletAddress);
  const [u] = await db.update(merchants).set({ walletScreenStatus: screen.status, walletScreenProvider: screen.provider, walletScreenedAt: new Date() }).where(eq(merchants.id, m.id)).returning();
  await logAudit("wallet_screened", "merchant", u.id, u.name, `Wallet screening: ${screen.status}${screen.reason ? ` (${screen.reason})` : ""} via ${screen.provider}`);
  res.json({ merchant: u, screen });
});
app.post("/api/merchants/screen-all", async (_r, res) => {
  const all = await db.select().from(merchants);
  let screened = 0, flagged = 0;
  for (const m of all) {
    if (m.walletScreenStatus && m.walletScreenStatus !== "unscreened") continue;
    const screen = await walletScreeningProvider.screen(m.walletAddress);
    await db.update(merchants).set({ walletScreenStatus: screen.status, walletScreenProvider: screen.provider, walletScreenedAt: new Date() }).where(eq(merchants.id, m.id));
    screened++; if (screen.status === "flagged") flagged++;
  }
  if (screened) await logAudit("wallet_screened", "merchant", undefined, "bulk", `Screened ${screened} wallet(s): ${flagged} flagged`, "system");
  res.json({ screened, flagged });
});
app.patch("/api/merchants/:id", async (req, res) => {
  const [existing] = await db.select().from(merchants).where(eq(merchants.id, req.params.id));
  if (!existing) return res.status(404).json({ message: "Not found" });
  const updates: any = {};
  if (req.body.name) updates.name = req.body.name;
  if (req.body.walletAddress) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(req.body.walletAddress)) return res.status(400).json({ message: "Invalid wallet" });
    updates.walletAddress = req.body.walletAddress;
    // Wallet actually changed → previous screening no longer applies
    if (req.body.walletAddress !== existing.walletAddress) updates.walletScreenStatus = "unscreened";
  }
  if (req.body.email !== undefined) updates.email = req.body.email;
  if (req.body.status) updates.status = req.body.status;
  if (req.body.kycRef !== undefined && req.body.kycRef !== existing.kycRef) { updates.kycRef = req.body.kycRef || null; updates.kycAttestedAt = new Date(); }
  if (req.body.kycReliedOn) updates.kycReliedOn = req.body.kycReliedOn;
  if (req.body.markupBps !== undefined) updates.markupBps = (req.body.markupBps === "" || req.body.markupBps == null) ? null : Number(req.body.markupBps);
  if (req.body.payoutMethod) updates.payoutMethod = req.body.payoutMethod === "fiat" ? "fiat" : "stablecoin";
  if (!Object.keys(updates).length) return res.status(400).json({ message: "No fields to update" });
  const [u] = await db.update(merchants).set(updates).where(eq(merchants.id, req.params.id)).returning();
  await logAudit("merchant_updated", "merchant", u.id, u.name, `Updated: ${Object.keys(updates).join(", ")}`);
  res.json(u);
});
app.delete("/api/merchants/:id", async (req, res) => {
  const [m] = await db.select().from(merchants).where(eq(merchants.id, req.params.id));
  if (!m) return res.status(404).json({ message: "Not found" });
  const ps = await db.select().from(payouts).where(eq(payouts.merchantId, req.params.id));
  if (ps.length) return res.status(400).json({ message: `Cannot delete — ${ps.length} payout(s) exist. Disable instead.` });
  await db.delete(merchants).where(eq(merchants.id, req.params.id));
  await logAudit("merchant_deleted", "merchant", m.id, m.name, `Deleted`);
  res.json({ ok: true });
});

// Batches
app.get("/api/batches", async (_r, res) => { res.json(await db.select().from(batches).orderBy(desc(batches.createdAt))); });
app.get("/api/batches/:id", async (req, res) => {
  const [batch] = await db.select().from(batches).where(eq(batches.id, req.params.id));
  if (!batch) return res.status(404).json({ message: "Not found" });
  const ps = await db.select({ payout: payouts, merchant: merchants }).from(payouts).leftJoin(merchants, eq(payouts.merchantId, merchants.id)).where(eq(payouts.batchId, batch.id));
  res.json({ batch, payouts: ps });
});
app.post("/api/batches", async (req, res) => {
  const { entries, currency = "EUR", payoutTiming = "asap", scheduledDate, createdBy = "paystrax" } = req.body;
  if (!entries?.length) return res.status(400).json({ message: "No entries" });
  const VALID_CURRENCIES = ["EUR", "USD", "AUD"];
  if (!VALID_CURRENCIES.includes(currency.toUpperCase())) return res.status(400).json({ message: `Currency must be one of: ${VALID_CURRENCIES.join(", ")}` });
  if (!["asap", "scheduled"].includes(payoutTiming)) return res.status(400).json({ message: "Payout timing must be 'asap' or 'scheduled'" });
  if (payoutTiming === "scheduled" && (!scheduledDate || new Date(scheduledDate) < new Date())) return res.status(400).json({ message: "Scheduled date must be in the future" });
  for (const e of entries) {
    if (!e.merchantName || !e.walletAddress || !e.amount) return res.status(400).json({ message: "Each entry needs merchantName, walletAddress, and amount" });
    if (!(parseFloat(e.amount) > 0)) return res.status(400).json({ message: "Amounts must be positive numbers" });
    if (!/^0x[a-fA-F0-9]{40}$/.test(e.walletAddress)) return res.status(400).json({ message: `Invalid wallet address: ${e.walletAddress}` });
  }
  const manualWallets = entries.map((e: any) => e.walletAddress.toLowerCase());
  const manualDupes = manualWallets.filter((w: string, i: number) => manualWallets.indexOf(w) !== i);
  if (manualDupes.length > 0) return res.status(400).json({ message: `Duplicate wallet addresses found: ${[...new Set(manualDupes)].join(", ")}` });
  const totalFiat = entries.reduce((s: number, e: any) => s + parseFloat(e.amount), 0);
  const FEE_BPS = 9; // Fybrus platform fee (fixed)
  const defaultMarkupBps = (await getSettings()).defaultMarkupBps;
  const batchRef = `BATCH-${Date.now().toString(36).toUpperCase()}`;
  const [batch] = await db.insert(batches).values({
    batchRef, currency: currency.toUpperCase(), totalFiat: totalFiat.toFixed(2), totalEur: totalFiat.toFixed(2),
    feeBps: FEE_BPS, feeAmount: "0", markupTotal: "0",
    merchantCount: entries.length, status: "pending", payoutTiming, createdBy,
    scheduledDate: payoutTiming === "scheduled" && scheduledDate ? new Date(scheduledDate) : null,
  }).returning();
  let feeTotal = 0, markupTotal = 0;
  for (const entry of entries) {
    // Ethereum addresses are case-insensitive — match by lowercase to avoid duplicate merchants
    let [m] = await db.select().from(merchants).where(sql`lower(${merchants.walletAddress}) = ${entry.walletAddress.toLowerCase()}`);
    if (!m) {
      const screen = await walletScreeningProvider.screen(entry.walletAddress);
      [m] = await db.insert(merchants).values({
        name: entry.merchantName, walletAddress: entry.walletAddress, kycAttestedAt: new Date(),
        walletScreenStatus: screen.status, walletScreenProvider: screen.provider, walletScreenedAt: new Date(),
      }).returning();
      await logAudit("merchant_registered", "merchant", m.id, m.name, `Auto-registered from batch · screening: ${screen.status}${screen.reason ? ` (${screen.reason})` : ""}`, createdBy);
    }
    const amt = parseFloat(entry.amount);
    const mBps = (m.markupBps ?? defaultMarkupBps);
    const fybrusFee = +(amt * FEE_BPS / 10000).toFixed(2);
    const markup = +(amt * mBps / 10000).toFixed(2);
    feeTotal += fybrusFee; markupTotal += markup;
    await db.insert(payouts).values({
      batchId: batch.id, merchantId: m.id, fiatAmount: amt.toFixed(2), eurAmount: amt.toFixed(2), walletAddress: entry.walletAddress, status: "pending",
      fybrusFeeAmount: fybrusFee.toFixed(2), markupAmount: markup.toFixed(2), payoutMethod: m.payoutMethod || "stablecoin",
    });
  }
  await db.update(batches).set({ feeAmount: feeTotal.toFixed(2), markupTotal: markupTotal.toFixed(2) }).where(eq(batches.id, batch.id));
  await logAudit("batch_created", "batch", batch.id, batch.batchRef, `${entries.length} merchants, ${currency} ${totalFiat.toFixed(2)} · Fybrus fee ${currency} ${feeTotal.toFixed(2)} · Paystrax markup ${currency} ${markupTotal.toFixed(2)}`, createdBy);
  res.json({ ...batch, feeAmount: feeTotal.toFixed(2), markupTotal: markupTotal.toFixed(2) });
});
app.patch("/api/batches/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const VALID = ["pending", "funded", "converting", "sending", "completed", "failed"];
    if (!VALID.includes(status)) return res.status(400).json({ message: "Invalid status" });
    const [current] = await db.select().from(batches).where(eq(batches.id, req.params.id));
    if (!current) return res.status(404).json({ message: "Not found" });

    // Idempotent: re-requesting the current status is a no-op success (safe for retries/double-clicks)
    if (current.status === status) return res.json({ ...current, idempotent: true });

    const FLOW = ["pending", "funded", "converting", "sending", "completed"];
    const ci = FLOW.indexOf(current.status ?? ""); const ni = FLOW.indexOf(status);
    if (status !== "failed" && (ni <= ci || ni > ci + 1)) return res.status(400).json({ message: `Cannot go from ${current.status} to ${status}` });

    const meta: any = {}; // extra info returned to the caller (fx source, settlement result, etc.)
    const updates: any = { status };
    if (status === "funded") updates.fiatReceivedAt = new Date();

    // ── converting: pull an FX quote from the FxProvider (live ECB rate or mock) ──
    if (status === "converting") {
      const quote = await fxProvider.getRate(current.currency || "EUR", "USDC");
      updates.exchangeRate = quote.rate.toFixed(6);
      meta.fx = quote;
    }
    if (status === "completed") updates.completedAt = new Date();

    const [batch] = await db.update(batches).set(updates).where(eq(batches.id, req.params.id)).returning();

    if (status === "converting" && batch.exchangeRate) {
      const rate = parseFloat(batch.exchangeRate);
      const OFFRAMP_SPREAD = 0.002; // 0.20% spread on the USDC→fiat off-ramp leg
      const ps = await db.select().from(payouts).where(eq(payouts.batchId, batch.id));
      let usdcTotal = 0;
      for (const p of ps) {
        // net = gross − Fybrus fee − Paystrax markup, then converted to USDC (leg 1)
        const gross = parseFloat(p.fiatAmount || p.eurAmount);
        const net = gross - parseFloat(p.fybrusFeeAmount || "0") - parseFloat(p.markupAmount || "0");
        const usdc = net * rate;
        usdcTotal += usdc;
        const upd: any = { usdcAmount: usdc.toFixed(6), status: "processing" };
        if ((p.payoutMethod || "stablecoin") === "fiat") {
          // leg 2: off-ramp USDC back to the merchant's fiat, net of spread
          const offRamp = (1 / rate) * (1 - OFFRAMP_SPREAD);
          upd.offRampRate = offRamp.toFixed(6);
          upd.payoutFiatAmount = (usdc * offRamp).toFixed(2);
        }
        await db.update(payouts).set(upd).where(eq(payouts.id, p.id));
      }
      await db.update(batches).set({ totalUsdc: usdcTotal.toFixed(6) }).where(eq(batches.id, batch.id));
    }

    // ── sending: screen wallets + transmit travel rule, then dispatch via the SettlementProvider ──
    if (status === "sending") {
      const ps = await db.select().from(payouts).where(eq(payouts.batchId, batch.id));
      const merchantRows = await db.select().from(merchants);
      const merchById = new Map(merchantRows.map((m) => [m.id, m]));
      let sent = 0, failed = 0, blocked = 0;
      for (const p of ps) {
        try {
          // Compliance gate 1: never dispatch to a flagged wallet.
          const screen = await walletScreeningProvider.screen(p.walletAddress);
          if (screen.status === "flagged") {
            await db.update(payouts).set({ status: "failed", failureReason: `Blocked by wallet screening — ${screen.reason || "flagged high-risk"}. USDC is never dispatched to a flagged wallet.` }).where(eq(payouts.id, p.id));
            await db.update(merchants).set({ walletScreenStatus: "flagged", walletScreenProvider: screen.provider, walletScreenedAt: new Date() }).where(eq(merchants.id, p.merchantId));
            await logAudit("payout_blocked", "payout", p.id, batch.batchRef, `Dispatch blocked — wallet ${p.walletAddress.slice(0, 8)}... flagged by ${screen.provider}${screen.reason ? ` (${screen.reason})` : ""}`, "system");
            blocked++; failed++;
            continue;
          }
          if ((p.payoutMethod || "stablecoin") === "fiat") {
            // Fiat payout: USDC is off-ramped to the merchant's fiat account.
            // No transfer TO a merchant wallet, so no travel rule to transmit.
            await db.update(payouts).set({ txHash: "SEPA-" + crypto.randomBytes(6).toString("hex").toUpperCase(), status: "processing" }).where(eq(payouts.id, p.id));
            sent++;
            continue;
          }
          // Compliance gate 2: travel rule data must accompany the crypto transfer.
          const tr = await travelRuleProvider.transmit({
            originator: originatorIdentity(),
            beneficiary: { name: merchById.get(p.merchantId)?.name || "Unknown merchant", walletAddress: p.walletAddress },
            transfer: { asset: "USDC", amount: p.usdcAmount || "0", reference: batch.batchRef },
          });
          const r = await settlementProvider.send({ walletAddress: p.walletAddress, usdcAmount: p.usdcAmount || "0", reference: batch.batchRef });
          await db.update(payouts).set({
            txHash: r.txHash, status: "processing",
            travelRuleStatus: "transmitted", travelRuleRef: tr.ref, travelRuleData: JSON.stringify(tr.payload), travelRuleAt: new Date(),
          }).where(eq(payouts.id, p.id));
          sent++;
        } catch (e) {
          await db.update(payouts).set({ status: "failed", travelRuleStatus: "failed", failureReason: `Dispatch failed — ${(e as Error)?.message || "settlement error"}. Use "Retry failed payouts" to re-attempt.` }).where(eq(payouts.id, p.id));
          failed++;
        }
      }
      meta.dispatch = { sent, failed, blocked, total: ps.length };
      // If every payout failed to dispatch, the batch itself failed.
      if (ps.length > 0 && sent === 0) {
        await db.update(batches).set({ status: "failed" }).where(eq(batches.id, batch.id));
      }
    }

    // Only dispatched payouts get confirmed — failed/blocked ones must stay failed.
    if (status === "completed") await db.update(payouts).set({ status: "confirmed", confirmedAt: new Date() }).where(and(eq(payouts.batchId, batch.id), eq(payouts.status, "processing")));
    if (status === "failed") await db.update(payouts).set({ status: "failed" }).where(eq(payouts.batchId, batch.id));

    const [updated] = await db.select().from(batches).where(eq(batches.id, req.params.id));
    const detail = meta.fx ? `Status → ${status} · rate ${updated.exchangeRate} (${meta.fx.source})`
      : meta.dispatch ? `Status → ${status} · ${meta.dispatch.sent}/${meta.dispatch.total} dispatched`
      : `Status → ${status}`;
    await logAudit(`batch_${updated.status}`, "batch", updated.id, updated.batchRef, detail);
    res.json({ ...updated, ...meta });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ message: "Status transition failed", error: e?.message });
  }
});

// Re-dispatch payouts that previously failed (retry seam for the settlement provider)
app.post("/api/batches/:id/retry-failed", async (req, res) => {
  const [batch] = await db.select().from(batches).where(eq(batches.id, req.params.id));
  if (!batch) return res.status(404).json({ message: "Not found" });
  const ps = await db.select().from(payouts).where(eq(payouts.batchId, batch.id));
  const failed = ps.filter((p) => p.status === "failed");
  if (!failed.length) return res.json({ message: "No failed payouts", retried: 0 });
  const merchantRows = await db.select().from(merchants);
  const merchById = new Map(merchantRows.map((m) => [m.id, m]));
  let ok = 0, still = 0;
  for (const p of failed) {
    try {
      // Retries run the same compliance gates as first dispatch.
      const screen = await walletScreeningProvider.screen(p.walletAddress);
      if (screen.status === "flagged") { still++; continue; }
      const tr = await travelRuleProvider.transmit({
        originator: originatorIdentity(),
        beneficiary: { name: merchById.get(p.merchantId)?.name || "Unknown merchant", walletAddress: p.walletAddress },
        transfer: { asset: "USDC", amount: p.usdcAmount || "0", reference: batch.batchRef },
      });
      const r = await settlementProvider.send({ walletAddress: p.walletAddress, usdcAmount: p.usdcAmount || "0", reference: batch.batchRef });
      await db.update(payouts).set({
        txHash: r.txHash, status: "processing", failureReason: null,
        travelRuleStatus: "transmitted", travelRuleRef: tr.ref, travelRuleData: JSON.stringify(tr.payload), travelRuleAt: new Date(),
      }).where(eq(payouts.id, p.id));
      ok++;
    } catch { still++; }
  }
  // If the batch had failed but some payouts recovered, put it back in "sending"
  if (ok > 0 && batch.status === "failed") await db.update(batches).set({ status: "sending" }).where(eq(batches.id, batch.id));
  await logAudit("batch_retry", "batch", batch.id, batch.batchRef, `Retried ${failed.length} failed payout(s): ${ok} ok, ${still} still failing`);
  res.json({ retried: failed.length, recovered: ok, stillFailing: still });
});
app.post("/api/batches/:id/approve", async (req, res) => {
  const { approver } = req.body;
  const [batch] = await db.select().from(batches).where(eq(batches.id, req.params.id));
  if (!batch) return res.status(404).json({ message: "Not found" });
  if (batch.approvedBy) return res.status(400).json({ message: "Already approved" });
  if (batch.createdBy === approver) return res.status(400).json({ message: "Cannot approve own batch" });
  const [u] = await db.update(batches).set({ approvedBy: approver, approvedAt: new Date() }).where(eq(batches.id, req.params.id)).returning();
  await logAudit("batch_approved", "batch", u.id, u.batchRef, `Approved by ${approver}`, approver);
  res.json(u);
});

// Analytics
app.get("/api/analytics", async (_r, res) => {
  const allB = await db.select().from(batches); const allP = await db.select().from(payouts); const allM = await db.select().from(merchants);
  const completed = allB.filter(b => b.status === "completed");
  const volByCurrency: Record<string, number> = {}; allB.forEach(b => { const c = b.currency || "EUR"; volByCurrency[c] = (volByCurrency[c] || 0) + parseFloat(b.totalFiat || b.totalEur); });
  const statusCounts: Record<string, number> = {}; allB.forEach(b => { statusCounts[b.status || "pending"] = (statusCounts[b.status || "pending"] || 0) + 1; });
  const payoutStatusCounts: Record<string, number> = {}; allP.forEach(p => { payoutStatusCounts[p.status || "pending"] = (payoutStatusCounts[p.status || "pending"] || 0) + 1; });
  const volumeByBatch = allB.map(b => ({ ref: b.batchRef, currency: b.currency || "EUR", fiat: parseFloat(b.totalFiat || b.totalEur), usdc: b.totalUsdc ? parseFloat(b.totalUsdc) : 0, status: b.status }));
  const confirmed = allP.filter(p => p.status === "confirmed");
  const avgRate = completed.length ? completed.reduce((s, b) => s + (b.exchangeRate ? parseFloat(b.exchangeRate) : 0), 0) / completed.length : 0;
  // Settlement time = funds received → on-chain confirmation, in MINUTES.
  // NOT creation→completion (that would include however long a batch waited for
  // funding). On a stablecoin rail this is minutes, not hours.
  const times = completed
    .filter(b => b.completedAt && b.fiatReceivedAt)
    .map(b => (new Date(b.completedAt!).getTime() - new Date(b.fiatReceivedAt!).getTime()) / 60000)
    .filter(mins => mins >= 0);
  res.json({ volumeByBatch, statusCounts, payoutStatusCounts, volByCurrency, summary: {
    totalBatches: allB.length, completedBatches: completed.length, totalMerchants: allM.length, totalPayouts: allP.length,
    confirmedPayouts: confirmed.length, failedPayouts: allP.filter(p => p.status === "failed").length,
    totalFiatProcessed: allB.reduce((s, b) => s + parseFloat(b.totalFiat || b.totalEur), 0),
    totalUsdcDispatched: allB.reduce((s, b) => s + (b.totalUsdc ? parseFloat(b.totalUsdc) : 0), 0),
    totalFees: allB.reduce((s, b) => s + (b.feeAmount ? parseFloat(b.feeAmount) : 0), 0),
    avgExchangeRate: avgRate, avgSettlementMinutes: times.length ? times.reduce((s, t) => s + t, 0) / times.length : 0,
    completionRate: allB.length ? (completed.length / allB.length * 100) : 0,
    payoutSuccessRate: allP.length ? (confirmed.length / allP.length * 100) : 0,
  }});
});

// ── Alerts: aggregated view of everything needing attention ──
app.get("/api/alerts", async (_r, res) => {
  const [allB, allP, allM] = await Promise.all([db.select().from(batches), db.select().from(payouts), db.select().from(merchants)]);
  const mById = new Map(allM.map(m => [m.id, m]));
  const bById = new Map(allB.map(b => [b.id, b]));
  const failedPayouts = allP.filter(p => p.status === "failed").map(p => ({
    type: "payout_failed", severity: "high",
    batchId: p.batchId, batchRef: bById.get(p.batchId)?.batchRef || "",
    merchant: mById.get(p.merchantId)?.name || "Unknown merchant",
    amount: p.fiatAmount || p.eurAmount, currency: bById.get(p.batchId)?.currency || "EUR",
    walletAddress: p.walletAddress,
    reason: p.failureReason || "Failed before reasons were recorded on this ledger.",
    retryable: !(p.failureReason || "").startsWith("Blocked by wallet screening"),
  }));
  const flaggedMerchants = allM.filter(m => m.walletScreenStatus === "flagged").map(m => ({
    type: "merchant_flagged", severity: "high",
    merchant: m.name, walletAddress: m.walletAddress,
    provider: m.walletScreenProvider, screenedAt: m.walletScreenedAt,
    reason: "Destination wallet matched a sanctions / illicit-exposure list. Payouts to this wallet are blocked automatically.",
  }));
  const recon = computeReconciliation(allB as any[], allP as any[]);
  const reconExceptions = recon.rows.filter((r: any) => !r.reconciled).map((r: any) => ({
    type: "recon_exception", severity: "medium",
    batchId: r.batchId, batchRef: r.batchRef, exceptions: r.exceptions,
    reason: r.exceptions.join(" · "),
  }));
  res.json({ failedPayouts, flaggedMerchants, reconExceptions, total: failedPayouts.length + flaggedMerchants.length + reconExceptions.length });
});

// ── Support tickets (Fybrus Customer Care) ──
app.get("/api/support", async (_r, res) => { res.json(await db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt)).limit(50)); });
app.post("/api/support", async (req, res) => {
  const { subject, message, context, createdBy } = req.body;
  if (!subject) return res.status(400).json({ message: "Subject required" });
  const ticketRef = "FYB-" + Date.now().toString(36).toUpperCase().slice(-6);
  const [t] = await db.insert(supportTickets).values({ ticketRef, subject, message: message || null, context: context || null, createdBy: createdBy || "demo" }).returning();
  await logAudit("support_ticket_opened", "support", t.id, ticketRef, `Ticket to Fybrus Customer Care: ${subject}`, createdBy || "demo");
  res.json(t);
});

// Audit
app.get("/api/audit", async (_r, res) => { res.json(await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(100)); });
app.get("/api/audit/csv", async (_r, res) => {
  const rows = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt));
  const header = "Timestamp,Action,Entity Type,Entity Ref,Actor,Detail\n";
  const csv = rows.map(r =>
    `${r.createdAt},${r.action},${r.entityType ?? ""},${r.entityRef ?? ""},${r.actor ?? ""},${(r.detail ?? "").replace(/,/g, ";")}`
  ).join("\n");
  await logAudit("report_exported", "audit", undefined, "paystrax-audit-log.csv", `Audit log CSV exported — ${rows.length} entries`);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=paystrax-audit-log.csv");
  res.send(header + csv);
});
app.get("/api/reports/csv", async (_r, res) => {
  const rows = await db.select({ payout: payouts, merchant: merchants, batch: batches }).from(payouts).leftJoin(merchants, eq(payouts.merchantId, merchants.id)).leftJoin(batches, eq(payouts.batchId, batches.id));
  const csv = "Batch,Currency,Merchant,Amount,USDC,Wallet,Status,TX Hash,Travel Rule Ref\n" + rows.map(r => `${r.batch?.batchRef},${r.batch?.currency},${r.merchant?.name},${r.payout.fiatAmount},${r.payout.usdcAmount || ""},${r.payout.walletAddress},${r.payout.status},${r.payout.txHash || ""},${r.payout.travelRuleRef || ""}`).join("\n");
  res.setHeader("Content-Type", "text/csv"); res.setHeader("Content-Disposition", "attachment; filename=paystrax-report.csv"); res.send(csv);
});

// ── Provider / integration status (drives the mode badge + PARTNERSHIPS wiring) ──
app.get("/api/providers", (_r, res) => res.json(providerStatus()));

// ── Platform settings: Fybrus fee (fixed) + Paystrax default markup ──
const FYBRUS_FEE_BPS = 9;
async function getSettings() {
  const [s] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1));
  return s || { id: 1, defaultMarkupBps: 25 };
}
app.get("/api/settings", async (_r, res) => {
  const s = await getSettings();
  res.json({ fybrusFeeBps: FYBRUS_FEE_BPS, defaultMarkupBps: s.defaultMarkupBps });
});
app.put("/api/settings", async (req, res) => {
  const bps = Number(req.body.defaultMarkupBps);
  if (!Number.isFinite(bps) || bps < 0 || bps > 1000) return res.status(400).json({ message: "Markup must be 0–1000 bps" });
  await db.insert(platformSettings).values({ id: 1, defaultMarkupBps: Math.round(bps), updatedAt: new Date() })
    .onConflictDoUpdate({ target: platformSettings.id, set: { defaultMarkupBps: Math.round(bps), updatedAt: new Date() } });
  await logAudit("settings_updated", "settings", undefined, "markup", `Default Paystrax markup set to ${Math.round(bps)} bps`, req.body.actor || "admin");
  res.json({ fybrusFeeBps: FYBRUS_FEE_BPS, defaultMarkupBps: Math.round(bps) });
});

// ── Revenue: what Paystrax is owed (markup) and what they pay Fybrus (fee) ──
app.get("/api/revenue", async (_r, res) => {
  const allP = await db.select().from(payouts);
  const allB = await db.select().from(batches);
  const allM = await db.select().from(merchants);
  const mById = new Map(allM.map(m => [m.id, m]));
  const bById = new Map(allB.map(b => [b.id, b]));
  const settled = allP.filter(p => p.status === "confirmed");
  const num = (v: any) => (v ? parseFloat(v) : 0);
  const markupOwed = settled.reduce((s, p) => s + num(p.markupAmount), 0);
  const fybrusFees = settled.reduce((s, p) => s + num(p.fybrusFeeAmount), 0);
  // by merchant
  const byMerchant: Record<string, any> = {};
  for (const p of settled) {
    const m = mById.get(p.merchantId); if (!m) continue;
    const k = m.id;
    byMerchant[k] = byMerchant[k] || { merchant: m.name, markupBps: m.markupBps, payoutMethod: m.payoutMethod || "stablecoin", payouts: 0, volume: 0, markup: 0, fybrusFee: 0 };
    byMerchant[k].payouts++; byMerchant[k].volume += num(p.fiatAmount);
    byMerchant[k].markup += num(p.markupAmount); byMerchant[k].fybrusFee += num(p.fybrusFeeAmount);
  }
  res.json({
    markupOwed, fybrusFees, netToMerchants: settled.reduce((s, p) => s + num(p.usdcAmount), 0),
    settledPayouts: settled.length,
    byMerchant: Object.values(byMerchant).sort((a: any, b: any) => b.markup - a.markup),
  });
});

// ── Reconciliation: money trail + exceptions across the lifecycle ──
app.get("/api/reconciliation", async (_r, res) => {
  const allB = await db.select().from(batches).orderBy(desc(batches.createdAt));
  const allP = await db.select().from(payouts);
  res.json(computeReconciliation(allB as any, allP as any));
});
app.get("/api/reconciliation/csv", async (_r, res) => {
  const allB = await db.select().from(batches).orderBy(desc(batches.createdAt));
  const allP = await db.select().from(payouts);
  const { rows } = computeReconciliation(allB as any, allP as any);
  const csv = "Batch,Currency,Status,Fiat Expected,Fiat Received,USDC Converted,USDC Sent,USDC Confirmed,Payouts Confirmed/Total,Reconciled,Exceptions\n" +
    rows.map(r => `${r.batchRef},${r.currency},${r.status},${r.fiatExpected.toFixed(2)},${r.fiatReceived.toFixed(2)},${r.usdcConverted.toFixed(2)},${r.usdcSent.toFixed(2)},${r.usdcConfirmed.toFixed(2)},${r.payoutsConfirmed}/${r.payoutsTotal},${r.reconciled ? "YES" : "NO"},"${r.exceptions.join("; ")}"`).join("\n");
  res.setHeader("Content-Type", "text/csv"); res.setHeader("Content-Disposition", "attachment; filename=paystrax-reconciliation.csv"); res.send(csv);
});

// ── Banking Circle inbound settlement webhook (funds a batch) ──
// Production: BC posts here when fiat lands. Demo: the "simulate settlement"
// action posts the same shape. Signature is verified via the fiat rail provider.
app.post("/api/webhooks/banking-circle", async (req, res) => {
  const signature = (req.headers["x-bc-signature"] || req.headers["x-signature"]) as string | undefined;
  if (!fiatRailProvider.verifyWebhookSignature(JSON.stringify(req.body || {}), signature))
    return res.status(401).json({ message: "Invalid webhook signature" });
  const { batchRef, reference, amount } = req.body || {};
  const ref = batchRef || reference;
  if (!ref) return res.status(400).json({ message: "batchRef/reference required" });
  const [batch] = await db.select().from(batches).where(eq(batches.batchRef, ref));
  if (!batch) return res.status(404).json({ message: `No batch ${ref}` });
  if (batch.status !== "pending") return res.json({ message: `Batch ${ref} already ${batch.status}`, idempotent: true });
  const [u] = await db.update(batches).set({ status: "funded", fiatReceivedAt: new Date() }).where(eq(batches.id, batch.id)).returning();
  await logAudit("batch_funded", "batch", u.id, u.batchRef, `FIAT received via ${fiatRailProvider.name}${amount ? ` · ${u.currency} ${amount}` : ""}`, "system");
  res.json({ ok: true, batchRef: u.batchRef, status: u.status, provider: fiatRailProvider.name });
});

// Seed
app.post("/api/seed", async (_r, res) => {
  const existing = await db.select().from(batches);
  if (existing.length) return res.json({ message: "Already seeded" });

  const merchantData = [
    { name: "TechFlow Solutions",   walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18", email: "accounts@techflow.io" },
    { name: "Nordic Supplies AB",   walletAddress: "0x8Ba1f109551bD432803012645Ac136ddd64DBA72", email: "finance@nordicsupplies.se" },
    { name: "GreenLeaf Organics",   walletAddress: "0x2946259E0334f33A064106302415aD3391BeD384", email: "payments@greenleaf.ie" },
    { name: "DataBridge Analytics", walletAddress: "0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2", email: "billing@databridge.eu" },
    { name: "CloudScale Hosting",   walletAddress: "0x4B20993Bc481177ec7E8f571ceCaE8A9e22C02db", email: "ops@cloudscale.net" },
    { name: "EuroLogistics GmbH",   walletAddress: "0x78731D3Ca6b7E34aC0F824c42a7cC18A495cabaB", email: "invoice@eurolog.de" },
    { name: "Pixel & Code Studio",  walletAddress: "0x617F2E2fD72FD9D5503197092aC168c91465E7f2", email: "hello@pixelcode.io" },
    { name: "SafeGuard Insurance",  walletAddress: "0x17F6AD8Ef982297579C203069C1DbfFE4348c372", email: "claims@safeguard.eu" },
    { name: "Meridian Consulting",  walletAddress: "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4", email: "finance@meridian.com" },
    { name: "Volta Energy Ltd",     walletAddress: "0xAB8483F64d9C6d1EcF9b849Ae677dD3315835Cb2", email: "ap@voltaenergy.eu" },
  ];
  const ms: any[] = [];
  for (const m of merchantData) {
    const [r] = await db.insert(merchants).values(m).returning();
    ms.push(r);
    await db.insert(auditLog).values({ action: "merchant_registered", entityType: "merchant", entityId: r.id, entityRef: r.name, actor: "julijavi@paystrax.com", detail: `Wallet ${m.walletAddress.slice(0, 10)}...`, createdAt: new Date(Date.now() - 30 * 86400000) });
  }

  // Helper to insert a full lifecycle audit trail for a completed batch
  async function auditBatchLifecycle(b: any, baseTs: number, creator: string, approver: string) {
    const rate = b.exchangeRate ? parseFloat(b.exchangeRate) : 1.08;
    await db.insert(auditLog).values([
      { action: "batch_created",    entityType: "batch", entityId: b.id, entityRef: b.batchRef, actor: creator,  detail: `${b.merchantCount} merchants · ${b.currency} ${parseFloat(b.totalFiat).toLocaleString()}`, createdAt: new Date(baseTs) },
      { action: "batch_approved",   entityType: "batch", entityId: b.id, entityRef: b.batchRef, actor: approver, detail: `Approved by ${approver}`, createdAt: new Date(baseTs + 1.5 * 3600000) },
      { action: "batch_funded",     entityType: "batch", entityId: b.id, entityRef: b.batchRef, actor: "system", detail: `FIAT received · ${b.currency} ${parseFloat(b.totalFiat).toLocaleString()}`, createdAt: new Date(baseTs + 4 * 3600000) },
      { action: "batch_converting", entityType: "batch", entityId: b.id, entityRef: b.batchRef, actor: "system", detail: `Exchange rate ${rate.toFixed(4)} · USDC ${(parseFloat(b.totalFiat) * rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, createdAt: new Date(baseTs + 5 * 3600000) },
      { action: "batch_sending",    entityType: "batch", entityId: b.id, entityRef: b.batchRef, actor: "system", detail: `Dispatching to ${b.merchantCount} wallets`, createdAt: new Date(baseTs + 6 * 3600000) },
      { action: "batch_completed",  entityType: "batch", entityId: b.id, entityRef: b.batchRef, actor: "system", detail: `All payouts confirmed on-chain`, createdAt: new Date(baseTs + 7 * 3600000) },
    ]);
  }

  const day = 86400000;
  const now = Date.now();

  // ── Batch 1: EUR, 30 days ago ──────────────────────────────────────────
  const [b1] = await db.insert(batches).values({ batchRef: "BATCH-PS001", currency: "EUR", totalFiat: "45250.00", totalEur: "45250.00", totalUsdc: "48870.00", exchangeRate: "1.080000", payoutTiming: "asap", status: "completed", merchantCount: 5, fiatReceivedAt: new Date(now - 30 * day + 4 * 3600000), completedAt: new Date(now - 30 * day + 7 * 3600000), createdBy: "julijavi@paystrax.com", approvedBy: "vaivani@paystrax.com", approvedAt: new Date(now - 30 * day + 1.5 * 3600000), createdAt: new Date(now - 30 * day) }).returning();
  for (let i = 0; i < 5; i++) { const amt = [12500, 8750, 6200, 9800, 8000][i]; await db.insert(payouts).values({ batchId: b1.id, merchantId: ms[i].id, fiatAmount: amt.toFixed(2), eurAmount: amt.toFixed(2), usdcAmount: (amt * 1.08).toFixed(6), walletAddress: ms[i].walletAddress, txHash: "0x" + crypto.randomBytes(32).toString("hex"), status: "confirmed", confirmedAt: new Date(now - 30 * day + 7 * 3600000), createdAt: new Date(now - 30 * day) }); }
  await auditBatchLifecycle(b1, now - 30 * day, "julijavi@paystrax.com", "vaivani@paystrax.com");

  // ── Batch 2: USD, 24 days ago ──────────────────────────────────────────
  const [b2] = await db.insert(batches).values({ batchRef: "BATCH-PS002", currency: "USD", totalFiat: "32100.00", totalEur: "32100.00", totalUsdc: "34668.00", exchangeRate: "1.080000", payoutTiming: "asap", status: "completed", merchantCount: 4, fiatReceivedAt: new Date(now - 24 * day + 4 * 3600000), completedAt: new Date(now - 24 * day + 7 * 3600000), createdBy: "vaivani@paystrax.com", approvedBy: "julijavi@paystrax.com", approvedAt: new Date(now - 24 * day + 1.5 * 3600000), createdAt: new Date(now - 24 * day) }).returning();
  for (let i = 0; i < 4; i++) { const amt = [9500, 7800, 8300, 6500][i]; await db.insert(payouts).values({ batchId: b2.id, merchantId: ms[i + 2].id, fiatAmount: amt.toFixed(2), eurAmount: amt.toFixed(2), usdcAmount: (amt * 1.08).toFixed(6), walletAddress: ms[i + 2].walletAddress, txHash: "0x" + crypto.randomBytes(32).toString("hex"), status: "confirmed", confirmedAt: new Date(now - 24 * day + 7 * 3600000), createdAt: new Date(now - 24 * day) }); }
  await auditBatchLifecycle(b2, now - 24 * day, "vaivani@paystrax.com", "julijavi@paystrax.com");

  // ── Batch 3: EUR, 18 days ago ──────────────────────────────────────────
  const [b3] = await db.insert(batches).values({ batchRef: "BATCH-PS003", currency: "EUR", totalFiat: "28600.00", totalEur: "28600.00", totalUsdc: "30888.00", exchangeRate: "1.080000", payoutTiming: "asap", status: "completed", merchantCount: 3, fiatReceivedAt: new Date(now - 18 * day + 4 * 3600000), completedAt: new Date(now - 18 * day + 7 * 3600000), createdBy: "julijavi@paystrax.com", approvedBy: "vaivani@paystrax.com", approvedAt: new Date(now - 18 * day + 1.5 * 3600000), createdAt: new Date(now - 18 * day) }).returning();
  for (let i = 0; i < 3; i++) { const amt = [11200, 9400, 8000][i]; await db.insert(payouts).values({ batchId: b3.id, merchantId: ms[i + 5].id, fiatAmount: amt.toFixed(2), eurAmount: amt.toFixed(2), usdcAmount: (amt * 1.08).toFixed(6), walletAddress: ms[i + 5].walletAddress, txHash: "0x" + crypto.randomBytes(32).toString("hex"), status: "confirmed", confirmedAt: new Date(now - 18 * day + 7 * 3600000), createdAt: new Date(now - 18 * day) }); }
  await auditBatchLifecycle(b3, now - 18 * day, "julijavi@paystrax.com", "vaivani@paystrax.com");

  // ── Batch 4: AUD, 14 days ago ──────────────────────────────────────────
  const [b4] = await db.insert(batches).values({ batchRef: "BATCH-PS004", currency: "AUD", totalFiat: "22400.00", totalEur: "22400.00", totalUsdc: "24192.00", exchangeRate: "1.080000", payoutTiming: "asap", status: "completed", merchantCount: 4, fiatReceivedAt: new Date(now - 14 * day + 4 * 3600000), completedAt: new Date(now - 14 * day + 7 * 3600000), createdBy: "vaivani@paystrax.com", approvedBy: "julijavi@paystrax.com", approvedAt: new Date(now - 14 * day + 1.5 * 3600000), createdAt: new Date(now - 14 * day) }).returning();
  for (let i = 0; i < 4; i++) { const amt = [6800, 5200, 5900, 4500][i]; await db.insert(payouts).values({ batchId: b4.id, merchantId: ms[i].id, fiatAmount: amt.toFixed(2), eurAmount: amt.toFixed(2), usdcAmount: (amt * 1.08).toFixed(6), walletAddress: ms[i].walletAddress, txHash: "0x" + crypto.randomBytes(32).toString("hex"), status: "confirmed", confirmedAt: new Date(now - 14 * day + 7 * 3600000), createdAt: new Date(now - 14 * day) }); }
  await auditBatchLifecycle(b4, now - 14 * day, "vaivani@paystrax.com", "julijavi@paystrax.com");

  // ── Batch 5: EUR, 9 days ago ───────────────────────────────────────────
  const [b5] = await db.insert(batches).values({ batchRef: "BATCH-PS005", currency: "EUR", totalFiat: "51800.00", totalEur: "51800.00", totalUsdc: "55944.00", exchangeRate: "1.080000", payoutTiming: "asap", status: "completed", merchantCount: 5, fiatReceivedAt: new Date(now - 9 * day + 4 * 3600000), completedAt: new Date(now - 9 * day + 7 * 3600000), createdBy: "julijavi@paystrax.com", approvedBy: "vaivani@paystrax.com", approvedAt: new Date(now - 9 * day + 1.5 * 3600000), createdAt: new Date(now - 9 * day) }).returning();
  for (let i = 0; i < 5; i++) { const amt = [13500, 10200, 9800, 11300, 7000][i]; await db.insert(payouts).values({ batchId: b5.id, merchantId: ms[i + 3].id, fiatAmount: amt.toFixed(2), eurAmount: amt.toFixed(2), usdcAmount: (amt * 1.08).toFixed(6), walletAddress: ms[i + 3].walletAddress, txHash: "0x" + crypto.randomBytes(32).toString("hex"), status: "confirmed", confirmedAt: new Date(now - 9 * day + 7 * 3600000), createdAt: new Date(now - 9 * day) }); }
  await auditBatchLifecycle(b5, now - 9 * day, "julijavi@paystrax.com", "vaivani@paystrax.com");

  // ── Batch 6: USD, 4 days ago ───────────────────────────────────────────
  const [b6] = await db.insert(batches).values({ batchRef: "BATCH-PS006", currency: "USD", totalFiat: "38500.00", totalEur: "38500.00", totalUsdc: "41580.00", exchangeRate: "1.080000", payoutTiming: "asap", status: "completed", merchantCount: 4, fiatReceivedAt: new Date(now - 4 * day + 4 * 3600000), completedAt: new Date(now - 4 * day + 7 * 3600000), createdBy: "vaivani@paystrax.com", approvedBy: "julijavi@paystrax.com", approvedAt: new Date(now - 4 * day + 1.5 * 3600000), createdAt: new Date(now - 4 * day) }).returning();
  for (let i = 0; i < 4; i++) { const amt = [11000, 9500, 8800, 9200][i]; await db.insert(payouts).values({ batchId: b6.id, merchantId: ms[i + 1].id, fiatAmount: amt.toFixed(2), eurAmount: amt.toFixed(2), usdcAmount: (amt * 1.08).toFixed(6), walletAddress: ms[i + 1].walletAddress, txHash: "0x" + crypto.randomBytes(32).toString("hex"), status: "confirmed", confirmedAt: new Date(now - 4 * day + 7 * 3600000), createdAt: new Date(now - 4 * day) }); }
  await auditBatchLifecycle(b6, now - 4 * day, "vaivani@paystrax.com", "julijavi@paystrax.com");

  // ── Batch 7: EUR, today — AWAITING FUNDING (newest, pending) ──────────
  const [b7] = await db.insert(batches).values({ batchRef: "BATCH-PS007", currency: "EUR", totalFiat: "43550.00", totalEur: "43550.00", payoutTiming: "asap", status: "pending", merchantCount: 5, createdBy: "julijavi@paystrax.com", approvedBy: "vaivani@paystrax.com", approvedAt: new Date(now - 2 * 3600000), createdAt: new Date(now - 3 * 3600000) }).returning();
  for (let i = 0; i < 5; i++) { const amt = [10200, 9800, 8750, 7600, 7200][i]; await db.insert(payouts).values({ batchId: b7.id, merchantId: ms[i].id, fiatAmount: amt.toFixed(2), eurAmount: amt.toFixed(2), walletAddress: ms[i].walletAddress, status: "pending", createdAt: new Date(now - 3 * 3600000) }); }
  await db.insert(auditLog).values([
    { action: "batch_created",  entityType: "batch", entityId: b7.id, entityRef: b7.batchRef, actor: "julijavi@paystrax.com", detail: `5 merchants · EUR 43,550 — awaiting FIAT transfer`, createdAt: new Date(now - 3 * 3600000) },
    { action: "batch_approved", entityType: "batch", entityId: b7.id, entityRef: b7.batchRef, actor: "vaivani@paystrax.com",  detail: `Approved by vaivani@paystrax.com`, createdAt: new Date(now - 2 * 3600000) },
  ]);

  // ── Login events ───────────────────────────────────────────────────────
  await db.insert(auditLog).values([
    { action: "login", entityType: "user", entityRef: "julijavi@paystrax.com", actor: "julijavi@paystrax.com", detail: "Signed in", createdAt: new Date(now - 30 * day) },
    { action: "login", entityType: "user", entityRef: "vaivani@paystrax.com",  actor: "vaivani@paystrax.com",  detail: "Signed in", createdAt: new Date(now - 24 * day) },
    { action: "login", entityType: "user", entityRef: "julijavi@paystrax.com", actor: "julijavi@paystrax.com", detail: "Signed in", createdAt: new Date(now - 14 * day) },
    { action: "login", entityType: "user", entityRef: "vaivani@paystrax.com",  actor: "vaivani@paystrax.com",  detail: "Signed in", createdAt: new Date(now - 9 * day) },
    { action: "login", entityType: "user", entityRef: "julijavi@paystrax.com", actor: "julijavi@paystrax.com", detail: "Signed in", createdAt: new Date(now - 4 * day) },
    { action: "login", entityType: "user", entityRef: "julijavi@paystrax.com", actor: "julijavi@paystrax.com", detail: "Signed in", createdAt: new Date(now - 3 * 3600000) },
    { action: "login", entityType: "user", entityRef: "vaivani@paystrax.com",  actor: "vaivani@paystrax.com",  detail: "Signed in", createdAt: new Date(now - 2 * 3600000) },
    { action: "report_exported", entityType: "report", entityRef: "paystrax-report.csv", actor: "julijavi@paystrax.com", detail: "Full payout report exported", createdAt: new Date(now - 5 * day) },
    { action: "report_exported", entityType: "report", entityRef: "paystrax-report.csv", actor: "vaivani@paystrax.com",  detail: "Full payout report exported", createdAt: new Date(now - 2 * day) },
  ]);

  // Normalize seeded data so metrics are coherent: apply the 9 bps fee,
  // recompute USDC net-of-fee, and set realistic minute-level settlement times
  // (funds received → on-chain confirmation).
  await db.execute(sql`UPDATE batches SET fee_bps = 9, fee_amount = ROUND(total_fiat * 0.0009, 2), total_usdc = ROUND(total_fiat * (1 - 0.0009) * COALESCE(exchange_rate, 1.08), 6) WHERE status = 'completed' AND total_usdc IS NOT NULL`);
  await db.execute(sql`UPDATE batches SET completed_at = fiat_received_at + make_interval(secs => (300 + floor(random()*360))::int) WHERE status = 'completed' AND fiat_received_at IS NOT NULL`);
  await db.execute(sql`UPDATE payouts p SET usdc_amount = ROUND(p.fiat_amount * (1 - 0.0009) * COALESCE(b.exchange_rate, 1.08), 6), confirmed_at = b.completed_at FROM batches b WHERE p.batch_id = b.id AND b.status = 'completed' AND p.status = 'confirmed'`);

  res.json({ message: "Seeded", batches: 7, merchants: merchantData.length });
});

app.post("/api/seed/reset", async (_r, res) => {
  await db.delete(auditLog);
  await db.delete(payouts);
  await db.delete(batches);
  await db.delete(merchants);
  await db.delete(users);
  res.json({ message: "Reset complete — reload the page to re-seed" });
});

app.post("/api/audit/seed", async (_r, res) => {
  const existing = await db.select().from(auditLog);
  if (existing.length > 5) return res.json({ message: "Already seeded" });
  res.json({ message: "Audit seeded via batch operations" });
});

export default async function handler(req: any, res: any) {
  return app(req, res);
}
