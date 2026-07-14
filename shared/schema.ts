import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const merchants = pgTable("merchants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  walletAddress: text("wallet_address").notNull(),
  email: text("email"),
  status: text("status").default("active"),
  // KYC reliance model: underlying-merchant KYC is performed on a separate
  // system by the relying party (the acquirer). We record the
  // attestation, not the verification.
  kycReliedOn: text("kyc_relied_on").default("Acquirer of record"), // who performed KYC
  kycRef: text("kyc_ref"),                                            // file/case ref on that system
  kycAttestedAt: timestamp("kyc_attested_at"),
  // Destination-wallet screening (sanctions/illicit exposure) — our obligation
  walletScreenStatus: text("wallet_screen_status").default("unscreened"), // unscreened, clear, flagged
  walletScreenProvider: text("wallet_screen_provider"),
  walletScreenedAt: timestamp("wallet_screened_at"),
  // acquirer markup (bps) on top of the Fybrus fee. null = use platform default.
  markupBps: integer("markup_bps"),
  // How this merchant is paid out: "stablecoin" (USDC) or "fiat" (off-ramped)
  payoutMethod: text("payout_method").default("stablecoin"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const batches = pgTable("batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchRef: text("batch_ref").notNull().unique(),
  currency: text("currency").notNull().default("EUR"), // EUR, USD, AUD
  totalFiat: decimal("total_fiat", { precision: 14, scale: 2 }).notNull(),
  totalEur: decimal("total_eur", { precision: 14, scale: 2 }).notNull(), // kept for backwards compat
  totalUsdc: decimal("total_usdc", { precision: 14, scale: 6 }),
  exchangeRate: decimal("exchange_rate", { precision: 12, scale: 6 }),
  payoutTiming: text("payout_timing").default("asap"),
  // Platform fee, charged in bps on the fiat amount and deducted before conversion
  feeBps: integer("fee_bps").default(0),                                        // Fybrus fee (9 bps)
  feeAmount: decimal("fee_amount", { precision: 14, scale: 2 }).default("0"),
  markupTotal: decimal("markup_total", { precision: 14, scale: 2 }).default("0"), // acquirer markup owed back to them
  scheduledDate: timestamp("scheduled_date"),
  status: text("status").default("pending"),
  createdBy: text("created_by"), // email of creator
  approvedBy: text("approved_by"), // email of approver (dual approval)
  approvedAt: timestamp("approved_at"),
  merchantCount: integer("merchant_count").notNull(),
  fiatReceivedAt: timestamp("fiat_received_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const payouts = pgTable("payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId: varchar("batch_id").references(() => batches.id).notNull(),
  merchantId: varchar("merchant_id").references(() => merchants.id).notNull(),
  fiatAmount: decimal("fiat_amount", { precision: 14, scale: 2 }).notNull(),
  eurAmount: decimal("eur_amount", { precision: 14, scale: 2 }).notNull(), // kept for backwards compat
  usdcAmount: decimal("usdc_amount", { precision: 14, scale: 6 }),
  walletAddress: text("wallet_address").notNull(),
  txHash: text("tx_hash"),
  status: text("status").default("pending"),
  // Fee breakdown per payout
  fybrusFeeAmount: decimal("fybrus_fee_amount", { precision: 14, scale: 2 }), // our 9 bps
  markupAmount: decimal("markup_amount", { precision: 14, scale: 2 }),        // acquirer's markup (owed back)
  // Payout method: "stablecoin" (receives usdcAmount) or "fiat" (USDC off-ramped to payoutFiatAmount)
  payoutMethod: text("payout_method").default("stablecoin"),
  payoutFiatAmount: decimal("payout_fiat_amount", { precision: 14, scale: 2 }), // fiat delivered (fiat method)
  offRampRate: decimal("off_ramp_rate", { precision: 12, scale: 6 }),           // USDC → fiat rate (leg 2)
  // Travel rule (EU TFR / FATF R.16) — our obligation: originator/beneficiary
  // data transmitted with every crypto transfer. Snapshot stored for audit.
  failureReason: text("failure_reason"), // human-readable reason when status = failed
  travelRuleStatus: text("travel_rule_status").default("pending"), // pending, transmitted, failed
  travelRuleRef: text("travel_rule_ref"),
  travelRuleData: text("travel_rule_data"), // JSON snapshot of the transmitted payload
  travelRuleAt: timestamp("travel_rule_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  confirmedAt: timestamp("confirmed_at"),
});

export const auditLog = pgTable("audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  action: text("action").notNull(), // batch_created, batch_funded, batch_converted, batch_sent, batch_completed, payout_confirmed, merchant_registered, csv_uploaded, report_exported, login
  entityType: text("entity_type"), // batch, payout, merchant
  entityId: text("entity_id"),
  entityRef: text("entity_ref"), // human-readable ref like BATCH-PS001
  actor: text("actor").default("ops"),
  detail: text("detail"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("viewer"), // admin, approver, viewer
  password: text("password").notNull().default("demo123"),
  status: text("status").default("active"), // active, disabled
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketRef: text("ticket_ref").notNull().unique(),
  subject: text("subject").notNull(),
  message: text("message"),
  context: text("context"),
  status: text("status").default("open"), // open, resolved
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const platformSettings = pgTable("platform_settings", {
  id: integer("id").primaryKey().default(1),
  defaultMarkupBps: integer("default_markup_bps").notNull().default(25), // acquirer default markup
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const insertMerchantSchema = createInsertSchema(merchants);
export const insertBatchSchema = createInsertSchema(batches);
export const insertPayoutSchema = createInsertSchema(payouts);
export const insertAuditLogSchema = createInsertSchema(auditLog);
export const insertUserSchema = createInsertSchema(users);
