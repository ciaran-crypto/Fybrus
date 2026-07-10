import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "./db";
import * as schema from "../shared/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import express from "express";
import {
  fxProvider,
  settlementProvider,
  fiatRailProvider,
  walletScreeningProvider,
  travelRuleProvider,
  originatorIdentity,
  providerStatus,
  computeReconciliation,
} from "../shared/providers";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export async function registerRoutes(app: Express): Promise<Server> {

  // ── Users ────────────────────────────────────────────────
  app.get("/api/users", async (_req, res) => {
    try {
      const rows = await db.select().from(schema.users).orderBy(desc(schema.users.createdAt));
      // Don't expose passwords
      res.json(rows.map(u => ({ ...u, password: undefined })));
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const { email, name, role, password } = req.body;
      if (!email || !name) return res.status(400).json({ message: "Email and name are required" });
      if (!["admin", "approver", "viewer"].includes(role || "viewer")) return res.status(400).json({ message: "Role must be admin, approver, or viewer" });
      const existing = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase()));
      if (existing.length > 0) return res.status(400).json({ message: "A user with this email already exists" });
      const [user] = await db.insert(schema.users).values({
        email: email.toLowerCase(), name, role: role || "viewer", password: password || "demo123",
      }).returning();
      await logAudit("user_created", "user", user.id, user.email, `User ${name} (${role || "viewer"}) created`);
      res.json({ ...user, password: undefined });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const { name, role, status } = req.body;
      const updates: any = {};
      if (name) updates.name = name;
      if (role && ["admin", "approver", "viewer"].includes(role)) updates.role = role;
      if (status && ["active", "disabled"].includes(status)) updates.status = status;
      if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No valid fields to update" });
      const [updated] = await db.update(schema.users).set(updates).where(eq(schema.users.id, req.params.id)).returning();
      if (!updated) return res.status(404).json({ message: "User not found" });
      await logAudit("user_updated", "user", updated.id, updated.email, `User ${updated.name} updated: ${JSON.stringify(updates)}`);
      res.json({ ...updated, password: undefined });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      const [user] = await db.select().from(schema.users).where(eq(schema.users.id, req.params.id));
      if (!user) return res.status(404).json({ message: "User not found" });
      await db.delete(schema.users).where(eq(schema.users.id, req.params.id));
      await logAudit("user_deleted", "user", user.id, user.email, `User ${user.name} (${user.role}) deleted`);
      res.json({ message: "User deleted" });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // Login validation
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Email and password required" });
      const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase()));
      if (!user) return res.status(401).json({ message: "Invalid email or password" });
      if (user.password !== password) return res.status(401).json({ message: "Invalid email or password" });
      if (user.status === "disabled") return res.status(403).json({ message: "Account disabled — contact administrator" });
      await logAudit("login", "user", user.id, user.email, `User ${user.name} signed in`, user.email);
      res.json({ id: user.id, email: user.email, name: user.name, role: user.role, initials: user.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // Seed default users if none exist
  app.post("/api/users/seed", async (_req, res) => {
    try {
      const existing = await db.select().from(schema.users);
      if (existing.length > 0) return res.json({ message: "Users already exist", count: existing.length });
      await db.insert(schema.users).values([
        { email: "julijavi@paystrax.com", name: "Julija Vilkute", role: "admin", password: "demo123" },
        { email: "vaivani@paystrax.com",  name: "Vaiva Niuklyte", role: "approver", password: "demo123" },
      ]);
      res.json({ message: "Demo users seeded", count: 2 });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // ── Merchants ──────────────────────────────────────────────
  app.get("/api/merchants", async (_req, res) => {
    try {
      const rows = await db.select().from(schema.merchants).orderBy(desc(schema.merchants.createdAt));
      res.json(rows);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  app.post("/api/merchants", async (req, res) => {
    try {
      const { name, walletAddress, email, kycRef, kycReliedOn } = req.body;
      if (!name || !walletAddress) return res.status(400).json({ message: "Name and wallet address are required" });
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) return res.status(400).json({ message: "Invalid wallet address — must be 0x followed by 40 hex characters" });
      // Screen the destination wallet at registration (our obligation; KYC is relied on)
      const screen = await walletScreeningProvider.screen(walletAddress);
      const [m] = await db.insert(schema.merchants).values({
        name, walletAddress, email,
        kycReliedOn: kycReliedOn || "Paystrax (acquirer)",
        kycRef: kycRef || null,
        kycAttestedAt: new Date(),
        walletScreenStatus: screen.status,
        walletScreenProvider: screen.provider,
        walletScreenedAt: new Date(),
      }).returning();
      await logAudit("merchant_registered", "merchant", m.id, m.name, `Wallet ${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)} registered · screening: ${screen.status}${screen.reason ? ` (${screen.reason})` : ""}`);
      res.json(m);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // Re-screen a merchant's wallet (or screen it for the first time)
  app.post("/api/merchants/:id/screen", async (req, res) => {
    try {
      const [m] = await db.select().from(schema.merchants).where(eq(schema.merchants.id, req.params.id));
      if (!m) return res.status(404).json({ message: "Merchant not found" });
      const screen = await walletScreeningProvider.screen(m.walletAddress);
      const [u] = await db.update(schema.merchants).set({ walletScreenStatus: screen.status, walletScreenProvider: screen.provider, walletScreenedAt: new Date() }).where(eq(schema.merchants.id, m.id)).returning();
      await logAudit("wallet_screened", "merchant", u.id, u.name, `Wallet screening: ${screen.status}${screen.reason ? ` (${screen.reason})` : ""} via ${screen.provider}`);
      res.json({ merchant: u, screen });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // Backfill: screen every unscreened merchant wallet
  app.post("/api/merchants/screen-all", async (_req, res) => {
    try {
      const all = await db.select().from(schema.merchants);
      let screened = 0, flagged = 0;
      for (const m of all) {
        if (m.walletScreenStatus && m.walletScreenStatus !== "unscreened") continue;
        const screen = await walletScreeningProvider.screen(m.walletAddress);
        await db.update(schema.merchants).set({ walletScreenStatus: screen.status, walletScreenProvider: screen.provider, walletScreenedAt: new Date() }).where(eq(schema.merchants.id, m.id));
        screened++; if (screen.status === "flagged") flagged++;
      }
      if (screened) await logAudit("wallet_screened", "merchant", undefined, "bulk", `Screened ${screened} wallet(s): ${flagged} flagged`, "system");
      res.json({ screened, flagged });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  app.patch("/api/merchants/:id", async (req, res) => {
    try {
      const { name, walletAddress, email, status, kycRef, kycReliedOn } = req.body;
      const [existing] = await db.select().from(schema.merchants).where(eq(schema.merchants.id, req.params.id));
      if (!existing) return res.status(404).json({ message: "Merchant not found" });
      const updates: any = {};
      if (name) updates.name = name;
      if (walletAddress) {
        if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) return res.status(400).json({ message: "Invalid wallet address" });
        updates.walletAddress = walletAddress;
        // Wallet actually changed → previous screening no longer applies
        if (walletAddress !== existing.walletAddress) updates.walletScreenStatus = "unscreened";
      }
      if (email !== undefined) updates.email = email;
      if (status) updates.status = status;
      if (kycRef !== undefined && kycRef !== existing.kycRef) { updates.kycRef = kycRef || null; updates.kycAttestedAt = new Date(); }
      if (kycReliedOn) updates.kycReliedOn = kycReliedOn;
      if (!Object.keys(updates).length) return res.status(400).json({ message: "No fields to update" });
      const [updated] = await db.update(schema.merchants).set(updates).where(eq(schema.merchants.id, req.params.id)).returning();
      if (!updated) return res.status(404).json({ message: "Merchant not found" });
      await logAudit("merchant_updated", "merchant", updated.id, updated.name, `Updated: ${Object.keys(updates).join(", ")}`);
      res.json(updated);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  app.delete("/api/merchants/:id", async (req, res) => {
    try {
      const [m] = await db.select().from(schema.merchants).where(eq(schema.merchants.id, req.params.id));
      if (!m) return res.status(404).json({ message: "Merchant not found" });
      // Check if merchant has any payouts
      const payoutCount = await db.select().from(schema.payouts).where(eq(schema.payouts.merchantId, req.params.id));
      if (payoutCount.length > 0) return res.status(400).json({ message: `Cannot delete — merchant has ${payoutCount.length} payout(s). Disable instead.` });
      await db.delete(schema.merchants).where(eq(schema.merchants.id, req.params.id));
      await logAudit("merchant_deleted", "merchant", m.id, m.name, `Merchant ${m.name} deleted`);
      res.json({ message: "Merchant deleted" });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // ── Batches ────────────────────────────────────────────────
  app.get("/api/batches", async (_req, res) => {
    try {
      const rows = await db.select().from(schema.batches).orderBy(desc(schema.batches.createdAt));
      res.json(rows);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  app.get("/api/batches/:id", async (req, res) => {
    try {
      const [batch] = await db.select().from(schema.batches).where(eq(schema.batches.id, req.params.id));
      if (!batch) return res.status(404).json({ message: "Batch not found" });
      const rows = await db
        .select({ payout: schema.payouts, merchant: schema.merchants })
        .from(schema.payouts)
        .leftJoin(schema.merchants, eq(schema.payouts.merchantId, schema.merchants.id))
        .where(eq(schema.payouts.batchId, batch.id));
      res.json({ batch, payouts: rows });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // CSV upload — currency & timing come from form fields alongside the file
  app.post("/api/batches/upload", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: "No file uploaded" });

      const VALID_CURRENCIES = ["EUR", "USD", "AUD"];
      const currency = (req.body.currency || "EUR").toUpperCase();
      if (!VALID_CURRENCIES.includes(currency)) return res.status(400).json({ message: `Currency must be one of: ${VALID_CURRENCIES.join(", ")}` });
      const payoutTiming = req.body.payoutTiming || "asap";
      if (!["asap", "scheduled"].includes(payoutTiming)) return res.status(400).json({ message: "Payout timing must be 'asap' or 'scheduled'" });
      const scheduledDate = req.body.scheduledDate ? new Date(req.body.scheduledDate) : null;
      if (payoutTiming === "scheduled" && (!scheduledDate || scheduledDate < new Date())) return res.status(400).json({ message: "Scheduled date must be in the future" });

      const lines = file.buffer.toString("utf-8").trim().split("\n").filter(l => l.trim());
      if (lines.length < 2) return res.status(400).json({ message: "CSV must have header + at least one row" });

      const header = lines[0].toLowerCase().split(",").map(h => h.trim());
      const nameIdx = header.findIndex(h => h.includes("merchant") || h.includes("name"));
      const amountIdx = header.findIndex(h => h.includes("amount") || h.includes("eur") || h.includes("usd") || h.includes("aud"));
      const walletIdx = header.findIndex(h => h.includes("wallet") || h.includes("address"));

      if (nameIdx === -1 || amountIdx === -1 || walletIdx === -1) {
        return res.status(400).json({ message: "CSV needs columns: merchant/name, amount, wallet/address" });
      }

      const rows = lines.slice(1).map(line => {
        const cols = line.split(",").map(c => c.trim());
        return { name: cols[nameIdx], amount: parseFloat(cols[amountIdx]), wallet: cols[walletIdx] };
      }).filter(r => r.name && !isNaN(r.amount) && r.amount > 0 && r.wallet && /^0x[a-fA-F0-9]{40}$/.test(r.wallet));

      if (!rows.length) return res.status(400).json({ message: "No valid rows in CSV. Check amounts are positive and wallets are valid (0x + 40 hex chars)." });

      const wallets = rows.map(r => r.wallet);
      const dupes = wallets.filter((w, i) => wallets.indexOf(w) !== i);
      if (dupes.length > 0) return res.status(400).json({ message: `Duplicate wallet addresses found: ${[...new Set(dupes)].join(", ")}` });

      const totalFiat = rows.reduce((s, r) => s + r.amount, 0);
      const batchRef = `BATCH-${Date.now().toString(36).toUpperCase()}`;

      const createdBy = req.body.createdBy || "paystrax";
      const FEE_BPS_U = 9;
      const feeAmountU = +(totalFiat * FEE_BPS_U / 10000).toFixed(2);
      const [batch] = await db.insert(schema.batches).values({
        batchRef, currency, totalFiat: totalFiat.toFixed(2), totalEur: totalFiat.toFixed(2),
        feeBps: FEE_BPS_U, feeAmount: feeAmountU.toFixed(2),
        merchantCount: rows.length, status: "pending", payoutTiming, createdBy,
        scheduledDate: payoutTiming === "scheduled" ? scheduledDate : null,
      }).returning();

      for (const row of rows) {
        let [merchant] = await db.select().from(schema.merchants).where(eq(schema.merchants.walletAddress, row.wallet));
        if (!merchant) {
          [merchant] = await db.insert(schema.merchants).values({ name: row.name, walletAddress: row.wallet }).returning();
        }
        await db.insert(schema.payouts).values({
          batchId: batch.id, merchantId: merchant.id, fiatAmount: row.amount.toFixed(2), eurAmount: row.amount.toFixed(2),
          walletAddress: row.wallet, status: "pending",
        });
      }
      await logAudit("batch_created", "batch", batch.id, batch.batchRef,
        `CSV upload: ${rows.length} merchants, ${currency} ${totalFiat.toFixed(2)}, timing: ${payoutTiming}`);
      res.json(batch);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // Manual batch creation
  app.post("/api/batches", async (req, res) => {
    try {
      const { entries, currency = "EUR", payoutTiming = "asap", scheduledDate, createdBy = "paystrax" } = req.body;
      if (!entries?.length) return res.status(400).json({ message: "No entries" });

      const VALID_CURRENCIES = ["EUR", "USD", "AUD"];
      if (!VALID_CURRENCIES.includes(currency.toUpperCase())) return res.status(400).json({ message: `Currency must be one of: ${VALID_CURRENCIES.join(", ")}` });
      if (!["asap", "scheduled"].includes(payoutTiming)) return res.status(400).json({ message: "Payout timing must be 'asap' or 'scheduled'" });
      if (payoutTiming === "scheduled" && (!scheduledDate || new Date(scheduledDate) < new Date())) return res.status(400).json({ message: "Scheduled date must be in the future" });

      for (const e of entries) {
        if (!e.merchantName || !e.walletAddress || !e.amount) return res.status(400).json({ message: "Each entry needs merchantName, walletAddress, and amount" });
        if (parseFloat(e.amount) <= 0) return res.status(400).json({ message: "Amounts must be positive" });
        if (!/^0x[a-fA-F0-9]{40}$/.test(e.walletAddress)) return res.status(400).json({ message: `Invalid wallet address: ${e.walletAddress}` });
      }

      const manualWallets = entries.map((e: any) => e.walletAddress);
      const manualDupes = manualWallets.filter((w: string, i: number) => manualWallets.indexOf(w) !== i);
      if (manualDupes.length > 0) return res.status(400).json({ message: `Duplicate wallet addresses found: ${[...new Set(manualDupes)].join(", ")}` });

      const totalFiat = entries.reduce((s: number, e: any) => s + parseFloat(e.amount), 0);
      const batchRef = `BATCH-${Date.now().toString(36).toUpperCase()}`;

      const FEE_BPS = 9; // platform fee, deducted from fiat before conversion
      const feeAmount = +(totalFiat * FEE_BPS / 10000).toFixed(2);
      const [batch] = await db.insert(schema.batches).values({
        batchRef, currency: currency.toUpperCase(), totalFiat: totalFiat.toFixed(2), totalEur: totalFiat.toFixed(2),
        feeBps: FEE_BPS, feeAmount: feeAmount.toFixed(2),
        merchantCount: entries.length, status: "pending", payoutTiming, createdBy,
        scheduledDate: payoutTiming === "scheduled" && scheduledDate ? new Date(scheduledDate) : null,
      }).returning();

      for (const entry of entries) {
        // Ethereum addresses are case-insensitive — match by lowercase to avoid duplicate merchants
        let [merchant] = await db.select().from(schema.merchants).where(sql`lower(${schema.merchants.walletAddress}) = ${entry.walletAddress.toLowerCase()}`);
        if (!merchant) {
          // Auto-registration goes through the same screening as manual registration
          const screen = await walletScreeningProvider.screen(entry.walletAddress);
          [merchant] = await db.insert(schema.merchants).values({
            name: entry.merchantName, walletAddress: entry.walletAddress,
            kycAttestedAt: new Date(),
            walletScreenStatus: screen.status, walletScreenProvider: screen.provider, walletScreenedAt: new Date(),
          }).returning();
          await logAudit("merchant_registered", "merchant", merchant.id, merchant.name, `Auto-registered from batch · screening: ${screen.status}${screen.reason ? ` (${screen.reason})` : ""}`, createdBy);
        }
        await db.insert(schema.payouts).values({
          batchId: batch.id, merchantId: merchant.id, fiatAmount: parseFloat(entry.amount).toFixed(2), eurAmount: parseFloat(entry.amount).toFixed(2),
          walletAddress: entry.walletAddress, status: "pending",
        });
      }
      await logAudit("batch_created", "batch", batch.id, batch.batchRef,
        `Manual entry: ${entries.length} merchants, ${currency.toUpperCase()} ${totalFiat.toFixed(2)}, timing: ${payoutTiming}`);
      res.json(batch);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // Approve batch (dual approval)
  app.post("/api/batches/:id/approve", async (req, res) => {
    try {
      const { approver } = req.body;
      if (!approver) return res.status(400).json({ message: "Approver email required" });
      const [batch] = await db.select().from(schema.batches).where(eq(schema.batches.id, req.params.id));
      if (!batch) return res.status(404).json({ message: "Batch not found" });
      if (batch.approvedBy) return res.status(400).json({ message: "Batch already approved" });
      if (batch.createdBy && batch.createdBy === approver) return res.status(400).json({ message: "Cannot approve your own batch — requires a different user" });
      const [updated] = await db.update(schema.batches).set({ approvedBy: approver, approvedAt: new Date() }).where(eq(schema.batches.id, req.params.id)).returning();
      await logAudit("batch_approved", "batch", updated.id, updated.batchRef, `Batch approved by ${approver}`, approver);
      res.json(updated);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // Advance batch status
  app.patch("/api/batches/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      const VALID_STATUSES = ["pending", "funded", "converting", "sending", "completed", "failed"];
      if (!VALID_STATUSES.includes(status)) return res.status(400).json({ message: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });

      // Validate status transition — can only advance forward or fail
      const [current] = await db.select().from(schema.batches).where(eq(schema.batches.id, req.params.id));
      if (!current) return res.status(404).json({ message: "Batch not found" });
      // Idempotent: re-requesting the current status is a safe no-op
      if (current.status === status) return res.json({ ...current, idempotent: true });
      if (current.status === "completed") return res.status(400).json({ message: "Batch is already completed" });
      if (current.status === "failed" && status !== "failed") return res.status(400).json({ message: "Batch has failed — retry failed payouts instead" });
      const STATUS_FLOW = ["pending", "funded", "converting", "sending", "completed"];
      const currentIdx = STATUS_FLOW.indexOf(current.status ?? "");
      const nextIdx = STATUS_FLOW.indexOf(status);
      if (status !== "failed" && (nextIdx <= currentIdx || nextIdx > currentIdx + 1)) {
        return res.status(400).json({ message: `Cannot transition from "${current.status}" to "${status}". Next valid status: "${STATUS_FLOW[currentIdx + 1] || "none"}" or "failed".` });
      }

      const meta: any = {};
      const updates: any = { status };

      if (status === "funded") updates.fiatReceivedAt = new Date();
      if (status === "converting") {
        const quote = await fxProvider.getRate(current.currency || "EUR", "USDC");
        updates.exchangeRate = quote.rate.toFixed(6);
        meta.fx = quote;
      }
      if (status === "completed") updates.completedAt = new Date();

      const [batch] = await db.update(schema.batches).set(updates).where(eq(schema.batches.id, req.params.id)).returning();
      if (!batch) return res.status(404).json({ message: "Batch not found" });

      if (status === "converting" && batch.exchangeRate) {
        const rate = parseFloat(batch.exchangeRate);
        const fiat = parseFloat(batch.totalFiat || batch.totalEur);
        // Platform fee (feeBps) is deducted from the fiat before conversion
        const feeRate = (batch.feeBps || 0) / 10000;
        const netFiat = fiat - parseFloat(batch.feeAmount || "0");
        await db.update(schema.batches).set({ totalUsdc: (netFiat * rate).toFixed(6) }).where(eq(schema.batches.id, batch.id));
        const ps = await db.select().from(schema.payouts).where(eq(schema.payouts.batchId, batch.id));
        for (const p of ps) {
          await db.update(schema.payouts).set({ usdcAmount: (parseFloat(p.fiatAmount || p.eurAmount) * (1 - feeRate) * rate).toFixed(6), status: "processing" }).where(eq(schema.payouts.id, p.id));
        }
      }

      if (status === "sending") {
        const ps = await db.select().from(schema.payouts).where(eq(schema.payouts.batchId, batch.id));
        const merchantRows = await db.select().from(schema.merchants);
        const merchById = new Map(merchantRows.map((m) => [m.id, m]));
        let sent = 0, failed = 0, blocked = 0;
        for (const p of ps) {
          try {
            // Compliance gate 1: screen the destination wallet before dispatch.
            const screen = await walletScreeningProvider.screen(p.walletAddress);
            if (screen.status === "flagged") {
              await db.update(schema.payouts).set({ status: "failed", failureReason: `Blocked by wallet screening — ${screen.reason || "flagged high-risk"}. USDC is never dispatched to a flagged wallet.` }).where(eq(schema.payouts.id, p.id));
              await db.update(schema.merchants).set({ walletScreenStatus: "flagged", walletScreenProvider: screen.provider, walletScreenedAt: new Date() }).where(eq(schema.merchants.id, p.merchantId));
              await logAudit("payout_blocked", "payout", p.id, batch.batchRef, `Dispatch blocked — wallet ${p.walletAddress.slice(0, 8)}... flagged by ${screen.provider}${screen.reason ? ` (${screen.reason})` : ""}`, "system");
              blocked++; failed++;
              continue;
            }
            // Compliance gate 2: travel rule — originator/beneficiary data must
            // accompany the transfer, so transmission happens BEFORE settlement.
            const tr = await travelRuleProvider.transmit({
              originator: originatorIdentity(),
              beneficiary: { name: merchById.get(p.merchantId)?.name || "Unknown merchant", walletAddress: p.walletAddress },
              transfer: { asset: "USDC", amount: p.usdcAmount || "0", reference: batch.batchRef },
            });
            const r = await settlementProvider.send({ walletAddress: p.walletAddress, usdcAmount: p.usdcAmount || "0", reference: batch.batchRef });
            await db.update(schema.payouts).set({
              txHash: r.txHash, status: "processing",
              travelRuleStatus: "transmitted", travelRuleRef: tr.ref, travelRuleData: JSON.stringify(tr.payload), travelRuleAt: new Date(),
            }).where(eq(schema.payouts.id, p.id));
            sent++;
          } catch (e) {
            await db.update(schema.payouts).set({ status: "failed", travelRuleStatus: "failed", failureReason: `Dispatch failed — ${(e as Error)?.message || "settlement error"}. Use "Retry failed payouts" to re-attempt.` }).where(eq(schema.payouts.id, p.id));
            failed++;
          }
        }
        meta.dispatch = { sent, failed, blocked, total: ps.length };
        if (ps.length > 0 && sent === 0) await db.update(schema.batches).set({ status: "failed" }).where(eq(schema.batches.id, batch.id));
      }

      if (status === "completed") {
        // Only dispatched payouts get confirmed — failed/blocked ones must stay failed.
        await db.update(schema.payouts).set({ status: "confirmed", confirmedAt: new Date() }).where(and(eq(schema.payouts.batchId, batch.id), eq(schema.payouts.status, "processing")));
      }
      if (status === "failed") {
        await db.update(schema.payouts).set({ status: "failed" }).where(eq(schema.payouts.batchId, batch.id));
      }

      const [updated] = await db.select().from(schema.batches).where(eq(schema.batches.id, req.params.id));
      const detail = meta.fx ? `Status → ${status} · rate ${updated.exchangeRate} (${meta.fx.source})`
        : meta.dispatch ? `Status → ${status} · ${meta.dispatch.sent}/${meta.dispatch.total} dispatched`
        : `Status → ${status}`;
      await logAudit(`batch_${updated.status}`, "batch", updated.id, updated.batchRef, detail);
      res.json({ ...updated, ...meta });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // Re-dispatch payouts that previously failed
  app.post("/api/batches/:id/retry-failed", async (req, res) => {
    try {
      const [batch] = await db.select().from(schema.batches).where(eq(schema.batches.id, req.params.id));
      if (!batch) return res.status(404).json({ message: "Batch not found" });
      const ps = await db.select().from(schema.payouts).where(eq(schema.payouts.batchId, batch.id));
      const failed = ps.filter((p) => p.status === "failed");
      if (!failed.length) return res.json({ message: "No failed payouts", retried: 0 });
      const merchantRows = await db.select().from(schema.merchants);
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
          await db.update(schema.payouts).set({
            txHash: r.txHash, status: "processing", failureReason: null,
            travelRuleStatus: "transmitted", travelRuleRef: tr.ref, travelRuleData: JSON.stringify(tr.payload), travelRuleAt: new Date(),
          }).where(eq(schema.payouts.id, p.id));
          ok++;
        } catch { still++; }
      }
      if (ok > 0 && batch.status === "failed") await db.update(schema.batches).set({ status: "sending" }).where(eq(schema.batches.id, batch.id));
      await logAudit("batch_retry", "batch", batch.id, batch.batchRef, `Retried ${failed.length} failed payout(s): ${ok} ok, ${still} still failing`);
      res.json({ retried: failed.length, recovered: ok, stillFailing: still });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // Provider / integration status
  app.get("/api/providers", (_req, res) => res.json(providerStatus()));

  // Reconciliation
  app.get("/api/reconciliation", async (_req, res) => {
    try {
      const allB = await db.select().from(schema.batches).orderBy(desc(schema.batches.createdAt));
      const allP = await db.select().from(schema.payouts);
      res.json(computeReconciliation(allB as any, allP as any));
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });
  app.get("/api/reconciliation/csv", async (_req, res) => {
    try {
      const allB = await db.select().from(schema.batches).orderBy(desc(schema.batches.createdAt));
      const allP = await db.select().from(schema.payouts);
      const { rows } = computeReconciliation(allB as any, allP as any);
      const csv = "Batch,Currency,Status,Fiat Expected,Fiat Received,USDC Converted,USDC Sent,USDC Confirmed,Payouts Confirmed/Total,Reconciled,Exceptions\n" +
        rows.map(r => `${r.batchRef},${r.currency},${r.status},${r.fiatExpected.toFixed(2)},${r.fiatReceived.toFixed(2)},${r.usdcConverted.toFixed(2)},${r.usdcSent.toFixed(2)},${r.usdcConfirmed.toFixed(2)},${r.payoutsConfirmed}/${r.payoutsTotal},${r.reconciled ? "YES" : "NO"},"${r.exceptions.join("; ")}"`).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=paystrax-reconciliation.csv");
      res.send(csv);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // Banking Circle inbound settlement webhook (funds a batch)
  app.post("/api/webhooks/banking-circle", async (req, res) => {
    try {
      const signature = (req.headers["x-bc-signature"] || req.headers["x-signature"]) as string | undefined;
      if (!fiatRailProvider.verifyWebhookSignature(JSON.stringify(req.body || {}), signature))
        return res.status(401).json({ message: "Invalid webhook signature" });
      const { batchRef, reference, amount } = req.body || {};
      const ref = batchRef || reference;
      if (!ref) return res.status(400).json({ message: "batchRef/reference required" });
      const [batch] = await db.select().from(schema.batches).where(eq(schema.batches.batchRef, ref));
      if (!batch) return res.status(404).json({ message: `No batch ${ref}` });
      if (batch.status !== "pending") return res.json({ message: `Batch ${ref} already ${batch.status}`, idempotent: true });
      const [u] = await db.update(schema.batches).set({ status: "funded", fiatReceivedAt: new Date() }).where(eq(schema.batches.id, batch.id)).returning();
      await logAudit("batch_funded", "batch", u.id, u.batchRef, `FIAT received via ${fiatRailProvider.name}${amount ? ` · ${u.currency} ${amount}` : ""}`, "system");
      res.json({ ok: true, batchRef: u.batchRef, status: u.status, provider: fiatRailProvider.name });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // All payouts
  app.get("/api/payouts", async (_req, res) => {
    try {
      const rows = await db
        .select({ payout: schema.payouts, merchant: schema.merchants, batch: schema.batches })
        .from(schema.payouts)
        .leftJoin(schema.merchants, eq(schema.payouts.merchantId, schema.merchants.id))
        .leftJoin(schema.batches, eq(schema.payouts.batchId, schema.batches.id))
        .orderBy(desc(schema.payouts.createdAt));
      res.json(rows);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // CSV report download
  app.get("/api/reports/csv", async (_req, res) => {
    try {
      const rows = await db
        .select({ payout: schema.payouts, merchant: schema.merchants, batch: schema.batches })
        .from(schema.payouts)
        .leftJoin(schema.merchants, eq(schema.payouts.merchantId, schema.merchants.id))
        .leftJoin(schema.batches, eq(schema.payouts.batchId, schema.batches.id))
        .orderBy(desc(schema.payouts.createdAt));

      const header = "Batch Ref,Currency,Merchant,FIAT Amount,USDC Amount,FX Rate,Wallet,Payout Status,Batch Status,TX Hash,Travel Rule Ref,Created,Funded At,Completed At,Settlement Hours\n";
      const csv = rows.map(r => {
        const funded = r.batch?.fiatReceivedAt ? new Date(r.batch.fiatReceivedAt).toISOString() : "";
        const completed = r.batch?.completedAt ? new Date(r.batch.completedAt).toISOString() : "";
        const settlementHrs = r.batch?.fiatReceivedAt && r.batch?.completedAt
          ? ((new Date(r.batch.completedAt).getTime() - new Date(r.batch.fiatReceivedAt).getTime()) / 3600000).toFixed(1) : "";
        return `${r.batch?.batchRef ?? ""},${r.batch?.currency ?? "EUR"},${r.merchant?.name ?? ""},${r.payout.fiatAmount || r.payout.eurAmount},${r.payout.usdcAmount ?? ""},${r.batch?.exchangeRate ?? ""},${r.payout.walletAddress},${r.payout.status},${r.batch?.status ?? ""},${r.payout.txHash ?? ""},${r.payout.travelRuleRef ?? ""},${r.payout.createdAt ?? ""},${funded},${completed},${settlementHrs}`;
      }).join("\n");

      await db.insert(schema.auditLog).values({
        action: "report_exported", entityType: "report", detail: `Settlement CSV exported — ${rows.length} payout records`, actor: "paystrax",
      });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=paystrax-settlements.csv");
      res.send(header + csv);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // Seed demo data
  app.post("/api/seed", async (_req, res) => {
    try {
      const existing = await db.select().from(schema.batches);
      if (existing.length > 0) return res.json({ message: "Already seeded", count: existing.length });

      const [{ value: merchantCount }] = await db.select({ value: count() }).from(schema.merchants);
      if (Number(merchantCount) > 100) return res.status(400).json({ message: "Too many merchants already exist — refusing to seed" });

      const merchantData = [
        { name: "TechFlow Solutions", walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18", email: "finance@techflow.io" },
        { name: "Nordic Supplies", walletAddress: "0x8Ba1f109551bD432803012645Ac136ddd64DBA72", email: "pay@nordicsupplies.eu" },
        { name: "GreenLeaf Organics", walletAddress: "0x2946259E0334f33A064106302415aD3391BeD384", email: "accounts@greenleaf.com" },
        { name: "DataBridge Analytics", walletAddress: "0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2", email: "billing@databridge.io" },
        { name: "CloudScale Hosting", walletAddress: "0x4B20993Bc481177ec7E8f571ceCaE8A9e22C02db", email: "pay@cloudscale.net" },
        { name: "EuroLogistics GmbH", walletAddress: "0x78731D3Ca6b7E34aC0F824c42a7cC18A495cabaB", email: "invoice@eurologistics.de" },
        { name: "Pixel & Code Studio", walletAddress: "0x617F2E2fD72FD9D5503197092aC168c91465E7f2", email: "hello@pixelcode.studio" },
        { name: "SafeGuard Insurance", walletAddress: "0x17F6AD8Ef982297579C203069C1DbfFE4348c372", email: "claims@safeguard.ie" },
      ];

      const ms = [];
      for (const m of merchantData) {
        const [created] = await db.insert(schema.merchants).values(m).returning();
        ms.push(created);
      }

      // Completed batch — EUR, ASAP
      const [b1] = await db.insert(schema.batches).values({
        batchRef: "BATCH-PS001", currency: "EUR", totalFiat: "45250.00", totalEur: "45250.00", totalUsdc: "48870.00", exchangeRate: "1.080000",
        payoutTiming: "asap", status: "completed", merchantCount: 5,
        createdAt: new Date(Date.now() - 7 * 86400000),
        fiatReceivedAt: new Date(Date.now() - 6.8 * 86400000), completedAt: new Date(Date.now() - 6.5 * 86400000),
      }).returning();
      for (let i = 0; i < 5; i++) {
        const amt = [12500, 8750, 6200, 9800, 8000][i];
        await db.insert(schema.payouts).values({
          batchId: b1.id, merchantId: ms[i].id, fiatAmount: amt.toFixed(2), eurAmount: amt.toFixed(2), usdcAmount: (amt * 1.08).toFixed(6),
          walletAddress: ms[i].walletAddress, txHash: "0x" + crypto.randomBytes(32).toString("hex"), status: "confirmed", confirmedAt: new Date(Date.now() - 6.5 * 86400000),
        });
      }

      // In-progress batch — USD, ASAP
      const [b2] = await db.insert(schema.batches).values({
        batchRef: "BATCH-PS002", currency: "USD", totalFiat: "32100.00", totalEur: "32100.00", totalUsdc: "34668.00", exchangeRate: "1.080000",
        payoutTiming: "asap", status: "sending", merchantCount: 4,
        createdAt: new Date(Date.now() - 1 * 86400000),
        fiatReceivedAt: new Date(Date.now() - 2 * 3600000),
      }).returning();
      const statuses = ["confirmed", "processing", "processing", "pending"];
      for (let i = 0; i < 4; i++) {
        const amt = [9500, 7800, 8300, 6500][i];
        await db.insert(schema.payouts).values({
          batchId: b2.id, merchantId: ms[i + 2].id, fiatAmount: amt.toFixed(2), eurAmount: amt.toFixed(2), usdcAmount: (amt * 1.08).toFixed(6),
          walletAddress: ms[i + 2].walletAddress, txHash: statuses[i] !== "pending" ? "0x" + crypto.randomBytes(32).toString("hex") : null,
          status: statuses[i], confirmedAt: statuses[i] === "confirmed" ? new Date() : null,
        });
      }

      // Pending batch — AUD, scheduled for next week
      const [b3] = await db.insert(schema.batches).values({
        batchRef: "BATCH-PS003", currency: "AUD", totalFiat: "18900.00", totalEur: "18900.00",
        payoutTiming: "scheduled", scheduledDate: new Date(Date.now() + 5 * 86400000),
        status: "pending", merchantCount: 3,
        createdAt: new Date(Date.now() - 4 * 3600000),
      }).returning();
      for (let i = 0; i < 3; i++) {
        const amt = [7200, 5400, 6300][i];
        await db.insert(schema.payouts).values({
          batchId: b3.id, merchantId: ms[i + 5].id, fiatAmount: amt.toFixed(2), eurAmount: amt.toFixed(2), walletAddress: ms[i + 5].walletAddress, status: "pending",
        });
      }

      res.json({ message: "Seeded", batches: 3, merchants: merchantData.length });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // ── Audit Log ──────────────────────────────────────────────
  // Helper to write audit entries
  async function logAudit(action: string, entityType?: string, entityId?: string, entityRef?: string, detail?: string, actor?: string) {
    try {
      await db.insert(schema.auditLog).values({ action, entityType, entityId, entityRef, detail, actor: actor || "paystrax" });
    } catch (e) { console.error("Audit log error:", e); }
  }

  // ── Alerts: aggregated view of everything needing attention ──
  app.get("/api/alerts", async (_req, res) => {
    try {
      const [allB, allP, allM] = await Promise.all([
        db.select().from(schema.batches), db.select().from(schema.payouts), db.select().from(schema.merchants),
      ]);
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
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // ── Support tickets (Fybrus Customer Care) ──
  app.get("/api/support", async (_req, res) => {
    try { res.json(await db.select().from(schema.supportTickets).orderBy(desc(schema.supportTickets.createdAt)).limit(50)); }
    catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });
  app.post("/api/support", async (req, res) => {
    try {
      const { subject, message, context, createdBy } = req.body;
      if (!subject) return res.status(400).json({ message: "Subject required" });
      const ticketRef = "FYB-" + Date.now().toString(36).toUpperCase().slice(-6);
      const [t] = await db.insert(schema.supportTickets).values({ ticketRef, subject, message: message || null, context: context || null, createdBy: createdBy || "demo" }).returning();
      await logAudit("support_ticket_opened", "support", t.id, ticketRef, `Ticket to Fybrus Customer Care: ${subject}`, createdBy || "demo");
      res.json(t);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  app.get("/api/audit", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const rows = await db.select().from(schema.auditLog).orderBy(desc(schema.auditLog.createdAt)).limit(limit);
      res.json(rows);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // Export audit log as CSV
  app.get("/api/audit/csv", async (_req, res) => {
    try {
      const rows = await db.select().from(schema.auditLog).orderBy(desc(schema.auditLog.createdAt));
      const header = "Timestamp,Action,Entity Type,Entity Ref,Actor,Detail\n";
      const csv = rows.map(r =>
        `${r.createdAt},${r.action},${r.entityType ?? ""},${r.entityRef ?? ""},${r.actor ?? ""},${(r.detail ?? "").replace(/,/g, ";")}`
      ).join("\n");
      await db.insert(schema.auditLog).values({
        action: "report_exported", entityType: "audit", detail: `Audit log CSV exported — ${rows.length} entries`, actor: "paystrax",
      });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=paystrax-audit-log.csv");
      res.send(header + csv);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // ── Analytics ─────────────────────────────────────────────
  app.get("/api/analytics", async (_req, res) => {
    try {
      const allBatches = await db.select().from(schema.batches).orderBy(desc(schema.batches.createdAt));
      const allPayouts = await db.select().from(schema.payouts);
      const allMerchants = await db.select().from(schema.merchants);

      // Volume by batch (for bar chart)
      const volumeByBatch = allBatches.map(b => ({
        ref: b.batchRef,
        currency: b.currency || "EUR",
        fiat: parseFloat(b.totalFiat || b.totalEur),
        eur: parseFloat(b.totalEur),
        usdc: b.totalUsdc ? parseFloat(b.totalUsdc) : 0,
        status: b.status,
        date: b.createdAt,
        merchants: b.merchantCount,
      }));

      // Status breakdown
      const statusCounts: Record<string, number> = {};
      allBatches.forEach(b => { statusCounts[b.status || "pending"] = (statusCounts[b.status || "pending"] || 0) + 1; });

      // Payout status breakdown
      const payoutStatusCounts: Record<string, number> = {};
      allPayouts.forEach(p => { payoutStatusCounts[p.status || "pending"] = (payoutStatusCounts[p.status || "pending"] || 0) + 1; });

      // Totals
      const totalFiat = allBatches.reduce((s, b) => s + parseFloat(b.totalFiat || b.totalEur), 0);
      const totalEur = totalFiat; // alias for compat
      const totalUsdc = allBatches.reduce((s, b) => s + (b.totalUsdc ? parseFloat(b.totalUsdc) : 0), 0);

      // Volume by currency
      const volumeByCurrency: Record<string, number> = {};
      allBatches.forEach(b => {
        const c = b.currency || "EUR";
        volumeByCurrency[c] = (volumeByCurrency[c] || 0) + parseFloat(b.totalFiat || b.totalEur);
      });
      const completedBatches = allBatches.filter(b => b.status === "completed");
      const avgRate = completedBatches.length > 0
        ? completedBatches.reduce((s, b) => s + (b.exchangeRate ? parseFloat(b.exchangeRate) : 0), 0) / completedBatches.length
        : 0;

      // Settlement time (completed batches: completedAt - createdAt)
      const settlementTimes = completedBatches
        .filter(b => b.completedAt && b.createdAt)
        .map(b => (new Date(b.completedAt!).getTime() - new Date(b.createdAt!).getTime()) / 3600000); // hours
      const avgSettlementHours = settlementTimes.length > 0
        ? settlementTimes.reduce((s, t) => s + t, 0) / settlementTimes.length
        : 0;

      // Confirmed payouts
      const confirmedPayouts = allPayouts.filter(p => p.status === "confirmed");
      const failedPayouts = allPayouts.filter(p => p.status === "failed");

      res.json({
        volumeByBatch,
        statusCounts,
        payoutStatusCounts,
        volumeByCurrency,
        summary: {
          totalBatches: allBatches.length,
          completedBatches: completedBatches.length,
          totalMerchants: allMerchants.length,
          totalPayouts: allPayouts.length,
          confirmedPayouts: confirmedPayouts.length,
          failedPayouts: failedPayouts.length,
          totalFiatProcessed: totalFiat,
          totalEurProcessed: totalEur,
          totalUsdcDispatched: totalUsdc,
          totalFees: allBatches.reduce((sum, b) => sum + (b.feeAmount ? parseFloat(b.feeAmount) : 0), 0),
          avgExchangeRate: avgRate,
          avgSettlementHours,
          failedBatches: allBatches.filter(b => b.status === "failed").length,
          activeBatches: allBatches.filter(b => b.status !== "completed" && b.status !== "failed").length,
          completionRate: allBatches.length > 0 ? (completedBatches.length / allBatches.length * 100) : 0,
          payoutSuccessRate: allPayouts.length > 0 ? (confirmedPayouts.length / allPayouts.length * 100) : 0,
        },
      });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // Seed audit log entries for demo
  app.post("/api/audit/seed", async (_req, res) => {
    try {
      const existing = await db.select().from(schema.auditLog);
      if (existing.length > 0) return res.json({ message: "Already seeded" });

      const entries = [
        { action: "login", detail: "User paystrax@legend.ie signed in from 192.168.1.100", actor: "paystrax" },
        { action: "batch_created", entityType: "batch", entityRef: "BATCH-PS001", detail: "CSV upload: 5 merchants, EUR 45,250.00, timing: asap", actor: "paystrax" },
        { action: "batch_funded", entityType: "batch", entityRef: "BATCH-PS001", detail: "FIAT transfer of €45,250.00 EUR received and confirmed", actor: "legend" },
        { action: "batch_converted", entityType: "batch", entityRef: "BATCH-PS001", detail: "Converted €45,250.00 → 48,870.00 USDC at rate 1.0800", actor: "legend" },
        { action: "batch_sent", entityType: "batch", entityRef: "BATCH-PS001", detail: "5 on-chain payouts dispatched to merchant wallets", actor: "legend" },
        { action: "payout_confirmed", entityType: "payout", entityRef: "BATCH-PS001", detail: "5/5 payouts confirmed on-chain", actor: "system" },
        { action: "batch_completed", entityType: "batch", entityRef: "BATCH-PS001", detail: "Batch fully settled. All 5 merchants received USDC.", actor: "system" },
        { action: "report_exported", detail: "Settlement report exported (CSV) — 12 payout records", actor: "paystrax" },
        { action: "batch_created", entityType: "batch", entityRef: "BATCH-PS002", detail: "CSV upload: 4 merchants, USD 32,100.00, timing: asap", actor: "paystrax" },
        { action: "batch_funded", entityType: "batch", entityRef: "BATCH-PS002", detail: "FIAT transfer of $32,100.00 USD received and confirmed", actor: "legend" },
        { action: "batch_converted", entityType: "batch", entityRef: "BATCH-PS002", detail: "Converted $32,100.00 → 34,668.00 USDC at rate 1.0800", actor: "legend" },
        { action: "batch_sent", entityType: "batch", entityRef: "BATCH-PS002", detail: "4 on-chain payouts dispatched. 1/4 confirmed so far.", actor: "legend" },
        { action: "merchant_registered", entityType: "merchant", entityRef: "EuroLogistics GmbH", detail: "Wallet 0x78731D...cabaB registered", actor: "paystrax" },
        { action: "merchant_registered", entityType: "merchant", entityRef: "SafeGuard Insurance", detail: "Wallet 0x17F6AD...c372 registered", actor: "paystrax" },
        { action: "batch_created", entityType: "batch", entityRef: "BATCH-PS003", detail: "Manual entry: 3 merchants, AUD 18,900.00, timing: scheduled (29 Mar 2026)", actor: "paystrax" },
        { action: "login", detail: "User paystrax@legend.ie signed in from 10.0.0.45", actor: "paystrax" },
      ];

      // Insert with staggered timestamps
      for (let i = 0; i < entries.length; i++) {
        await db.insert(schema.auditLog).values({
          ...entries[i],
          createdAt: new Date(Date.now() - (entries.length - i) * 3600000 * 4), // 4 hours apart
        });
      }

      res.json({ message: "Audit log seeded", count: entries.length });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "An internal error occurred" }); }
  });

  // Serve built frontend in production (not on Vercel — it handles static files)
  if (!process.env.VERCEL) {
    const publicDir = path.resolve(process.cwd(), "dist/public");
    app.use(express.static(publicDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(publicDir, "index.html"));
    });
  }

  // Don't create HTTP server on Vercel (serverless)
  if (process.env.VERCEL) return null as any;
  return createServer(app);
}
