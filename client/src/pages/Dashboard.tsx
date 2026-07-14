import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload, FileText, CheckCircle2, Clock, AlertCircle, Download,
  Plus, RefreshCw, Users, DollarSign, ArrowUpRight, Loader2, X,
  LogOut, Search, Copy, ExternalLink, Banknote, ArrowDown, Shield,
  UserPlus, FileDown, ClipboardList, BarChart3, Activity, TrendingUp,
  ShieldCheck, Timer, Hash, Eye, LayoutDashboard, Settings, Scale, Zap, Bell, LifeBuoy, Landmark,
} from "lucide-react";

const AUDIT_CATEGORIES = [
  { key: "all", label: "All", match: () => true },
  { key: "batches", label: "Batches", match: (a: string) => a.startsWith("batch_") },
  { key: "payouts", label: "Payouts", match: (a: string) => a.startsWith("payout_") },
  { key: "merchants", label: "Merchants", match: (a: string) => a.startsWith("merchant_") },
  { key: "security", label: "Security", match: (a: string) => a === "login" },
  { key: "reports", label: "Reports", match: (a: string) => a.startsWith("report_") },
];
/* Pure CSS charts — no external deps */

/* ─── Status config ──────────────────────────────────────── */
const STATUS_FLOW = ["pending", "funded", "converting", "sending", "completed"];
const SC: Record<string, { label: string; color: string; bg: string; dot: string; icon: any }> = {
  pending:    { label: "Awaiting Funding",  color: "var(--amber)", bg: "var(--tint-amber)",  dot: "#FBBF24", icon: Clock },
  funded:     { label: "Funded",            color: "var(--blue)", bg: "var(--tint-blue)",  dot: "#2563EB", icon: DollarSign },
  converting: { label: "Converting",        color: "var(--text-2)", bg: "var(--inset)",  dot: "#6B7280", icon: RefreshCw },
  sending:    { label: "Sending",           color: "var(--text-2)", bg: "var(--inset)",  dot: "#6B7280", icon: ArrowUpRight },
  completed:  { label: "Completed",         color: "var(--green)", bg: "var(--tint-green)",  dot: "#10B981", icon: CheckCircle2 },
  failed:     { label: "Failed",            color: "var(--red)", bg: "var(--tint-red)",  dot: "#EF4444", icon: AlertCircle },
  confirmed:  { label: "Confirmed",         color: "var(--green)", bg: "var(--tint-green)",  dot: "#10B981", icon: CheckCircle2 },
  processing: { label: "Processing",        color: "var(--text-2)", bg: "var(--inset)",  dot: "#6B7280", icon: RefreshCw },
  active:     { label: "Active",            color: "var(--green)", bg: "var(--tint-green)",  dot: "#10B981", icon: CheckCircle2 },
  disabled:   { label: "Disabled",          color: "#6B7280", bg: "var(--inset)",  dot: "#9CA3AF", icon: X },
};

const STATUS_HINT: Record<string, string> = {
  pending: "Awaiting funding — waiting for fiat to arrive in the collection IBAN",
  funded: "Fiat received — ready to convert to USDC",
  converting: "Converting fiat to USDC at the live ECB rate (after the 9 bps platform fee)",
  sending: "Dispatching USDC on-chain — wallets are sanctions-screened and travel-rule data transmitted first",
  completed: "All dispatched payouts confirmed on-chain",
  failed: "Failed — open the batch for the reason on each payout",
  confirmed: "USDC delivered and confirmed on-chain",
  processing: "Dispatched — awaiting on-chain confirmation",
  active: "Active — can be included in payout batches",
  disabled: "Disabled — excluded from new batches",
};

function Badge({ status }: { status: string }) {
  const c = SC[status] || SC.pending;
  return (
    <span title={STATUS_HINT[status] || ""} className="inline-flex items-center gap-1.5 px-1.5 py-1" style={{ background: c.bg, color: c.color, borderRadius: 999, fontSize: 10, fontWeight: 500, padding: "3px 10px", letterSpacing: "0.01em", cursor: "default" }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}

function Steps({ current }: { current: string }) {
  const idx = STATUS_FLOW.indexOf(current);
  return (
    <div className="flex items-center" style={{ gap: 2 }}>
      {STATUS_FLOW.map((s, i) => {
        const c = SC[s]; const on = i <= idx;
        return (
          <div key={s} className="flex items-center" style={{ gap: 1 }}>
            <div title={["Pending", "Funded", "Convert", "Send", "Done"][i]}
              className="rounded-full" style={{ width: 6, height: 6, background: on ? c.dot : 'var(--text-faint)' }} />
            {i < 4 && <div style={{ width: 4, height: 1, background: i < idx ? c.dot : 'var(--line)' }} />}
          </div>
        );
      })}
    </div>
  );
}

function Overlay({ open, onClose, children, wide }: { open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 60 }} role="dialog" aria-modal="true"
      onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
      <div className="absolute inset-0" style={{ background: 'rgba(18,34,28,0.35)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 60 }} onClick={onClose} />
      <div className={"relative max-h-[85vh] overflow-y-auto max-w-[95vw] " + (wide ? "w-[920px]" : "w-[500px]")}
        style={{ background: 'var(--surface)', borderRadius: 24, padding: 30, border: '1px solid var(--line)', boxShadow: 'var(--shadow-modal)', zIndex: 61 }}>
        <button onClick={onClose} className="absolute top-5 right-5 transition-colors" style={{ color: 'var(--text-3)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
          aria-label="Close dialog"><X className="w-4 h-4" /></button>
        {children}
      </div>
    </div>
  );
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const relative = mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`;
  return `${d.toLocaleDateString("en-IE", { day: "numeric", month: "short" })} · ${relative}`;
}

function copyText(text: string) {
  navigator.clipboard.writeText(text);
  // Show a brief toast
  const t = document.createElement("div");
  t.textContent = "Copied!";
  t.style.cssText = "position:fixed;bottom:24px;right:24px;background:var(--ink);color:#FFFFFF;padding:10px 20px;border-radius:8px;font-size:12px;font-weight:500;z-index:9999;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1)";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1500);
}

/* ─── Login Screen ───────────────────────────────────────── */
function LoginScreen({ onLogin, error: externalError }: { onLogin: (email: string, password: string) => void; error?: string | null }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [localErr, setLocalErr] = useState(false);

  const handleLogin = async () => {
    if (pass.length === 0) { setLocalErr(true); return; }
    setLoading(true);
    await onLogin(email, pass);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-[400px]" style={{ background: 'var(--surface)', padding: 40, borderRadius: 26, border: '1px solid var(--line)', boxShadow: 'var(--shadow-modal)' }}>
        <div className="mb-6">
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.01em', color: 'var(--ink)' }}>FYBRUS<span style={{ color: 'var(--green)' }}>.</span></span>
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.06em', color: 'var(--text-3)', textTransform: 'uppercase' as const, marginTop: 4 }}>Merchant Treasury</p>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-2)' }} className="mb-6">Sign in to your dashboard</p>

        <div className="space-y-3">
          <div>
            <label className="block mb-1" style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' as const }}>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} autoFocus
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              className="w-full outline-none transition-colors"
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line-strong)', fontSize: 13, color: 'var(--ink)', background: 'var(--surface)' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--ink)'} onBlur={e => e.currentTarget.style.borderColor = 'var(--line-strong)'} />
          </div>
          <div>
            <label className="block mb-1" style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' as const }}>Password</label>
            <input type="password" value={pass} onChange={e => { setPass(e.target.value); setLocalErr(false); }}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="Enter your password"
              className="w-full outline-none transition-colors"
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line-strong)', fontSize: 13, color: 'var(--ink)', background: 'var(--surface)' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--ink)'} onBlur={e => e.currentTarget.style.borderColor = 'var(--line-strong)'} />
            {localErr && <p style={{ fontSize: 11, color: 'var(--red)' }} className="mt-1">Please enter your password</p>}
            {externalError && <p style={{ fontSize: 11, color: 'var(--red)' }} className="mt-1">{externalError}</p>}
          </div>
          <button onClick={handleLogin} disabled={loading}
            className="w-full mt-2 transition-colors disabled:opacity-60"
            style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'var(--cta)', color: '#FFFFFF' }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--cta-hover)'; }} onMouseLeave={e => e.currentTarget.style.background = 'var(--ink)'}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Sign In"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Dashboard ─────────────────────────────────────── */
type UserRole = "admin" | "approver" | "viewer";
type AppUser = { id: string; email: string; name: string; role: UserRole; initials: string; status?: string };

export default function Dashboard() {
  // Demo mode: no login required — always authenticated as a default demo user
  const DEMO_USER: AppUser = { id: "demo", email: "demo@fybrus.com", name: "Demo User", role: "admin", initials: "DU" };
  const [loggedIn, setLoggedIn] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(DEMO_USER);
  const [dualApproval, setDualApprovalRaw] = useState<boolean>(() => localStorage.getItem("psx-dual-approval") !== "off");
  const setDualApproval = (v: boolean) => { localStorage.setItem("psx-dual-approval", v ? "on" : "off"); setDualApprovalRaw(v); };
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "viewer" as UserRole, password: "demo123" });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [editingMerchant, setEditingMerchant] = useState<any>(null);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showAddMerchant, setShowAddMerchant] = useState(false);
  const [entries, setEntries] = useState([{ merchantName: "", amount: "", walletAddress: "" }]);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploadStep, setUploadStep] = useState<"idle" | "loading" | "preview" | "submitting" | "success">("idle");
  const [parsedRows, setParsedRows] = useState<{ name: string; amount: number; wallet: string; ccy?: string }[]>([]);
  const [createdBatch, setCreatedBatch] = useState<any>(null);
  const [demoRows] = useState([
    { name: "TechFlow Solutions", amount: 12500, wallet: "0x742d35Cc6634C0532925a3b844Bc9e7595FbD180", ccy: "EUR" },
    { name: "Nordic Supplies", amount: 8750, wallet: "0x8Ba1f109551bD432803012645aac136c9b5bBA72", ccy: "EUR" },
    { name: "GreenLeaf Organics", amount: 6200, wallet: "0x2946259E0334f33A064106302415aD3391BeD384", ccy: "USD" },
    { name: "CloudScale Hosting", amount: 8300, wallet: "0x4B20993Bc481177ec7E8f571ceCaE8A9e22C02db", ccy: "USD" },
    { name: "DataBridge Analytics", amount: 7800, wallet: "0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2", ccy: "AED" },
  ]);
  const [page, setPage] = useState<"dashboard" | "batches" | "merchants" | "audit" | "settings" | "reconciliation" | "alerts" | "revenue" | "accounts">("dashboard");
  const [auditFilter, setAuditFilter] = useState("all");
  const [auditSearch, setAuditSearch] = useState("");
  const [merchantSearch, setMerchantSearch] = useState("");
  const [merchantFilter, setMerchantFilter] = useState("all"); // all, active, disabled, flagged
  const [reconSearch, setReconSearch] = useState("");
  const [reconFilter, setReconFilter] = useState("all"); // all, exceptions, reconciled
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [newMerchant, setNewMerchant] = useState({ name: "", walletAddress: "", email: "", kycRef: "", markupBps: "", payoutMethod: "stablecoin" });
  // Batch creation options
  const [batchCurrency, setBatchCurrency] = useState("EUR");
  const [batchTiming, setBatchTiming] = useState("asap");
  const [batchDate, setBatchDate] = useState("");

  // Seed on first empty load
  const seedMut = useMutation({
    mutationFn: () => fetch("/api/seed", { method: "POST" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries(),
  });

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => {
      const r = await fetch("/api/batches"); const d = await r.json();
      if (d.length === 0) { seedMut.mutate(); return []; }
      return d;
    },
    enabled: loggedIn,
  });

  const { data: merchants = [] } = useQuery({
    queryKey: ["merchants"],
    queryFn: () => fetch("/api/merchants").then(r => r.json()),
    enabled: loggedIn,
  });

  const { data: detail } = useQuery({
    queryKey: ["batch", selectedId],
    queryFn: () => fetch(`/api/batches/${selectedId}`).then(r => r.json()),
    enabled: !!selectedId,
  });

  const { data: auditEntries = [], isLoading: auditLoading } = useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const r = await fetch("/api/audit"); const d = await r.json();
      if (d.length === 0) { await fetch("/api/audit/seed", { method: "POST" }); const r2 = await fetch("/api/audit"); return r2.json(); }
      return d;
    },
    enabled: loggedIn && page === "audit",
  });

  const { data: analytics } = useQuery({
    queryKey: ["analytics"],
    queryFn: () => fetch("/api/analytics").then(r => r.json()),
    enabled: loggedIn && (page === "audit" || page === "dashboard"),
  });

  // Integration/provider status — drives the mode badge
  const { data: providers } = useQuery({
    queryKey: ["providers"],
    queryFn: () => fetch("/api/providers").then(r => r.json()),
    enabled: loggedIn,
  });

  // Reconciliation — money trail + exceptions
  const { data: reconciliation } = useQuery({
    queryKey: ["reconciliation"],
    queryFn: () => fetch("/api/reconciliation").then(r => r.json()),
    enabled: loggedIn && page === "reconciliation",
  });

  // Auto-processing: when ON (default), a funded batch runs straight through
  // conversion → compliance checks → dispatch → completion, exactly as production
  // would. Turn OFF in Settings to step through each stage manually.
  const [autoProcess, setAutoProcessRaw] = useState<boolean>(() => localStorage.getItem("psx-auto-process") !== "off");
  const setAutoProcess = (v: boolean) => { localStorage.setItem("psx-auto-process", v ? "on" : "off"); setAutoProcessRaw(v); };

  // Run a batch through every remaining lifecycle stage (stops if a stage is rejected)
  const runPipeline = async (id: string, from: string) => {
    for (const st of STATUS_FLOW.slice(STATUS_FLOW.indexOf(from) + 1)) {
      const r = await fetch(`/api/batches/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: st }) });
      if (!r.ok) break;
    }
  };

  // Simulate an inbound Banking Circle settlement (funds a pending batch via the
  // webhook). With auto-processing on, the batch then runs through to completion.
  const simulateSettlementMut = useMutation({
    mutationFn: async (batchRef: string) => {
      const res = await fetch("/api/webhooks/banking-circle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchRef }) }).then(r => r.json());
      if (autoProcess) {
        const b = (batches as any[]).find((x: any) => x.batchRef === batchRef);
        if (b) await runPipeline(b.id, "funded");
      }
      return res;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["batches"] }); qc.invalidateQueries({ queryKey: ["batch"] }); qc.invalidateQueries({ queryKey: ["reconciliation"] }); qc.invalidateQueries({ queryKey: ["audit"] }); },
  });

  // Continue a stalled batch (funded/converting) through to completion
  const processBatchMut = useMutation({
    mutationFn: async ({ id, from }: { id: string; from: string }) => runPipeline(id, from),
    onSuccess: () => { qc.invalidateQueries(); },
  });

  // ── Alerts & Resolution ──
  const { data: alertsData } = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => { const r = await fetch("/api/alerts"); return r.json(); },
    enabled: loggedIn, refetchInterval: 30000,
  });
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => { const r = await fetch("/api/settings"); return r.json(); },
    enabled: loggedIn,
  });
  const { data: revenue } = useQuery({
    queryKey: ["revenue"],
    queryFn: async () => { const r = await fetch("/api/revenue"); return r.json(); },
    enabled: loggedIn && (page === "revenue" || page === "dashboard"),
  });
  const [markupInput, setMarkupInput] = useState<string>("");
  const [rowBps, setRowBps] = useState<Record<string, string>>({}); // per-merchant inline edits on Revenue
  const [alertFilter, setAlertFilter] = useState("all");   // all | payout_failed | merchant_flagged | recon_exception
  const [alertSearch, setAlertSearch] = useState("");
  const [revSearch, setRevSearch] = useState("");
  const [revMethod, setRevMethod] = useState("all");        // all | stablecoin | fiat
  const [accountSearch, setAccountSearch] = useState("");
  const saveMarkupMut = useMutation({
    mutationFn: async (bps: string) => {
      const r = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultMarkupBps: Number(bps), actor: currentUser?.email }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); qc.invalidateQueries({ queryKey: ["revenue"] }); },
  });

  // ── Collection accounts (virtual IBANs) ──
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => { const r = await fetch("/api/accounts"); return r.json(); },
    enabled: loggedIn,
  });
  const [showOpenAccount, setShowOpenAccount] = useState(false);
  const [newAccountCcy, setNewAccountCcy] = useState("EUR");
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [openedAccount, setOpenedAccount] = useState<any>(null);
  const openAccountMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currency: newAccountCcy, label: newAccountLabel, createdBy: currentUser?.email }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: (a) => { setOpenedAccount(a); qc.invalidateQueries({ queryKey: ["accounts"] }); qc.invalidateQueries({ queryKey: ["audit"] }); },
  });
  const closeAccountMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const r = await fetch(`/api/accounts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, actor: currentUser?.email }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounts"] }); },
  });
  const { data: supportTickets = [] } = useQuery({
    queryKey: ["support"],
    queryFn: async () => { const r = await fetch("/api/support"); return r.json(); },
    enabled: loggedIn && page === "alerts",
  });
  const [careTarget, setCareTarget] = useState<any>(null); // alert being resolved
  const [careSubject, setCareSubject] = useState("");
  const [careMessage, setCareMessage] = useState("");
  const [careTicket, setCareTicket] = useState<any>(null); // created ticket (success state)
  const openCare = (alert: any) => {
    setCareTarget(alert); setCareTicket(null); setCareMessage("");
    setCareSubject(alert.batchRef ? `[${alert.batchRef}] ${alert.merchant ? `${alert.merchant} — ` : ""}${alert.type === "recon_exception" ? "reconciliation exception" : "payout failure"}` : `${alert.merchant} — flagged wallet review`);
  };
  const careMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: careSubject, message: careMessage, context: JSON.stringify({ type: careTarget?.type, batchRef: careTarget?.batchRef, merchant: careTarget?.merchant, reason: careTarget?.reason }), createdBy: currentUser?.email }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: (t) => { setCareTicket(t); qc.invalidateQueries({ queryKey: ["support"] }); qc.invalidateQueries({ queryKey: ["audit"] }); },
  });

  // Client-side CSV parsing for preview
  const parseCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string || "").trim();
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) { setUploadErr("CSV must have header + at least one row"); return; }
      const header = lines[0].toLowerCase().split(",").map(h => h.trim());
      const nameIdx = header.findIndex(h => h.includes("merchant") || h.includes("name"));
      const amountIdx = header.findIndex(h => h.includes("amount") || h.includes("eur") || h.includes("usd") || h.includes("aud"));
      const walletIdx = header.findIndex(h => h.includes("wallet") || h.includes("address"));
      const ccyIdx = header.findIndex(h => h === "currency" || h === "ccy" || h.includes("currency"));
      if (nameIdx === -1 || amountIdx === -1 || walletIdx === -1) { setUploadErr("CSV needs columns: merchant/name, amount, wallet/address (optional: currency)"); return; }
      const badCcys = new Set<string>();
      const rows = lines.slice(1).map(line => {
        const cols = line.split(",").map(c => c.trim());
        let ccy: string | undefined = undefined;
        if (ccyIdx !== -1 && cols[ccyIdx]) {
          const c = cols[ccyIdx].toUpperCase();
          if (SUPPORTED_CCYS.includes(c)) ccy = c; else badCcys.add(cols[ccyIdx]);
        }
        return { name: cols[nameIdx], amount: parseFloat(cols[amountIdx]), wallet: cols[walletIdx], ccy };
      }).filter(r => r.name && !isNaN(r.amount) && r.amount > 0 && r.wallet);
      if (badCcys.size) { setUploadErr(`Unsupported currencies in CSV: ${[...badCcys].join(", ")}. Supported: ${SUPPORTED_CCYS.join(", ")}`); return; }
      if (!rows.length) { setUploadErr("No valid rows found in CSV"); return; }
      setParsedRows(rows);
      setUploadErr(null);
      setUploadStep("preview");
    };
    reader.readAsText(file);
  };

  // Submit parsed rows — auto-splits into one batch per detected currency
  const submitBatch = async (rows: { name: string; amount: number; wallet: string; ccy?: string }[]) => {
    setUploadStep("submitting");
    try {
      const groups = new Map<string, typeof rows>();
      for (const r of rows) { const c = r.ccy || batchCurrency; if (!groups.has(c)) groups.set(c, []); groups.get(c)!.push(r); }
      const created: any[] = [];
      for (const [ccy, g] of groups) {
        const r = await fetch("/api/batches", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entries: g.map(x => ({ merchantName: x.name, amount: x.amount.toString(), walletAddress: x.wallet })),
            currency: ccy, payoutTiming: batchTiming, scheduledDate: batchTiming === "scheduled" ? batchDate : null,
            createdBy: currentUser?.email || "ops",
          }),
        });
        if (!r.ok) { const e = await r.json(); throw new Error(`${ccy}: ${e.message}`); }
        created.push(await r.json());
      }
      setCreatedBatch(created.length === 1 ? created[0] : { multi: true, batches: created });
      setUploadStep("success");
      qc.invalidateQueries();
    } catch (e: any) {
      setUploadErr(e.message);
      setUploadStep("preview");
    }
  };

  const manualMut = useMutation({
    mutationFn: async (ent: typeof entries) => {
      const r = await fetch("/api/batches", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: ent, currency: batchCurrency, payoutTiming: batchTiming, scheduledDate: batchTiming === "scheduled" ? batchDate : null, createdBy: currentUser?.email || "ops" }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: () => { qc.invalidateQueries(); setShowManual(false); setEntries([{ merchantName: "", amount: "", walletAddress: "" }]); resetBatchOpts(); },
  });

  const resetBatchOpts = () => { setBatchCurrency("EUR"); setBatchTiming("asap"); setBatchDate(""); };

  const advanceStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const r = await fetch(`/api/batches/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: () => { qc.invalidateQueries(); },
  });

  // Re-dispatch payouts that failed (re-runs screening + travel rule + settlement)
  const retryFailedMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/batches/${id}/retry-failed`, { method: "POST" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: () => { qc.invalidateQueries(); },
  });

  const approveMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/batches/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approver: currentUser?.email }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: () => { qc.invalidateQueries(); },
  });

  // Users query + mutations
  const { data: usersData = [] } = useQuery({ queryKey: ["users"], queryFn: async () => { const r = await fetch("/api/users"); return r.json(); }, enabled: loggedIn });
  const addUserMut = useMutation({
    mutationFn: async (data: typeof newUser) => {
      const r = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setShowAddUser(false); setNewUser({ name: "", email: "", role: "viewer", password: "demo123" }); },
  });
  const updateUserMut = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; role?: string; status?: string }) => {
      const r = await fetch(`/api/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); },
  });
  const deleteUserMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); },
  });

  const addMerchantMut = useMutation({
    mutationFn: async (data: typeof newMerchant) => {
      const r = await fetch("/api/merchants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["merchants"] }); setShowAddMerchant(false); setNewMerchant({ name: "", walletAddress: "", email: "", kycRef: "", markupBps: "", payoutMethod: "stablecoin" }); },
  });
  const updateMerchantMut = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; walletAddress?: string; email?: string; status?: string; kycRef?: string; markupBps?: any; payoutMethod?: string }) => {
      const r = await fetch(`/api/merchants/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["merchants"] }); qc.invalidateQueries({ queryKey: ["revenue"] }); setEditingMerchant(null); },
  });
  const deleteMerchantMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/merchants/${id}`, { method: "DELETE" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["merchants"] }); },
  });
  // Screen (or re-screen) a merchant's destination wallet
  const screenMerchantMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/merchants/${id}/screen`, { method: "POST" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["merchants"] }); },
  });

  // Currency helpers
  const CSYM: Record<string, string> = { EUR: "€", USD: "$", AUD: "A$", GBP: "£", CHF: "Fr ", SEK: "kr ", NOK: "kr ", DKK: "kr ", PLN: "zł ", AED: "AED " };
const SUPPORTED_CCYS = ["EUR", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "USD", "AUD", "AED"];

  // Derived stats
  const totalVol = batches.reduce((s: number, b: any) => s + parseFloat(b.totalFiat || b.totalEur || 0), 0);
  const volByCurrency: Record<string, number> = {};
  batches.forEach((b: any) => { const c = b.currency || "EUR"; volByCurrency[c] = (volByCurrency[c] || 0) + parseFloat(b.totalFiat || b.totalEur || 0); });
  const active = batches.filter((b: any) => b.status !== "completed" && b.status !== "failed");
  const done = batches.filter((b: any) => b.status === "completed");
  const pendingBatches = batches.filter((b: any) => b.status === "pending");
  const pendingFiat = pendingBatches.reduce((s: number, b: any) => s + parseFloat(b.totalFiat || b.totalEur || 0), 0);
  // Group pending by currency for the callout
  const pendingByCurrency: Record<string, number> = {};
  pendingBatches.forEach((b: any) => {
    const c = b.currency || "EUR";
    pendingByCurrency[c] = (pendingByCurrency[c] || 0) + parseFloat(b.totalFiat || b.totalEur || 0);
  });

  // Filtered batches
  const filtered = batches.filter((b: any) => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (currencyFilter !== "all" && (b.currency || "EUR") !== currencyFilter) return false;
    if (dateFrom && new Date(b.createdAt) < new Date(dateFrom + "T00:00:00")) return false;
    if (dateTo && new Date(b.createdAt) > new Date(dateTo + "T23:59:59")) return false;
    const q = search.toLowerCase();
    if (q && !b.batchRef.toLowerCase().includes(q) && !(b.createdBy || "").toLowerCase().includes(q)) return false;
    return true;
  });

  // Filtered merchants (search: name / wallet / email / KYC ref)
  const filteredMerchants = merchants.filter((m: any) => {
    if (merchantFilter === "active" && m.status !== "active") return false;
    if (merchantFilter === "disabled" && m.status !== "disabled") return false;
    if (merchantFilter === "flagged" && m.walletScreenStatus !== "flagged") return false;
    const q = merchantSearch.toLowerCase();
    if (q && !m.name.toLowerCase().includes(q) && !m.walletAddress.toLowerCase().includes(q) && !(m.email || "").toLowerCase().includes(q) && !(m.kycRef || "").toLowerCase().includes(q)) return false;
    return true;
  });

  // Filtered reconciliation rows
  const filteredRecon = (reconciliation?.rows ?? []).filter((r: any) => {
    if (reconFilter === "exceptions" && r.reconciled) return false;
    if (reconFilter === "reconciled" && !r.reconciled) return false;
    if (reconSearch && !r.batchRef.toLowerCase().includes(reconSearch.toLowerCase())) return false;
    return true;
  });

  // Filtered audit entries
  const filteredAudit = auditEntries.filter((e: any) => {
    if (auditFilter !== "all" && !AUDIT_CATEGORIES.find(c => c.key === auditFilter)?.match(e.action)) return false;
    const q = auditSearch.toLowerCase();
    if (q && ![e.action, e.entityRef, e.actor, e.detail].some(f => (f || "").toLowerCase().includes(q))) return false;
    return true;
  });

  // CSV template download
  const downloadTemplate = () => {
    const csv = "merchant_name,amount,currency,wallet_address\nTechFlow Solutions,5000.00,EUR,0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18\nNordic Supplies,3200.50,USD,0x8Ba1f109551bD432803012645Ac136ddd64DBA72\nDelta Pharma,1800.00,AED,0x5d3F2E7A91c04B7dE2586B2C21A00e614EdA4b3f\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "fybrus-batch-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (!loggedIn) return <LoginScreen onLogin={async (email: string, password: string) => {
    try {
      setLoginError(null);
      // Seed users if first time
      await fetch("/api/users/seed", { method: "POST" });
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      if (!r.ok) { const e = await r.json(); setLoginError(e.message); return; }
      const user = await r.json();
      setCurrentUser(user);
      setLoggedIn(true);
      try { localStorage.setItem("fybrus_user", JSON.stringify(user)); } catch {}
    } catch (e: any) { setLoginError("Connection error — is the API server running?"); }
  }} error={loginError} />;

  return (
    <div style={{ fontFamily: "'Geist', -apple-system, system-ui, sans-serif", background: 'var(--bg)', minHeight: '100vh', display: 'flex' }}>
      <style>{`
        .sidebar-nav-item:not(.sidebar-nav-active):hover { background: rgba(255,255,255,0.06) !important; color: rgba(255,255,255,0.85) !important; }
        input:focus, select:focus, textarea:focus { border-color: rgba(16,148,118,0.55) !important; outline: none !important; box-shadow: 0 0 0 3px rgba(16,148,118,0.15) !important; }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        h1, h2, h3 { letter-spacing: -0.02em; }
        table th { font-family: 'Geist', sans-serif; }
        td, .tabular-nums { font-variant-numeric: tabular-nums; }
      `}</style>
      {/* ─ Sidebar ─ */}
      <aside style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 234, background: '#121310', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', padding: '20px 12px', zIndex: 50 }}>
        {/* Logo */}
        <div style={{ padding: '0 8px', marginBottom: 32 }}>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.01em', color: '#FFFFFF' }}>FYBRUS<span style={{ color: '#34D399' }}>.</span></span>
          <span style={{ display: 'block', fontSize: 8, fontWeight: 500, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, marginTop: 2 }}>Merchant Treasury</span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1 }}>
          {[
            { key: "dashboard", label: "Overview", icon: LayoutDashboard },
            { key: "batches", label: "Payout Batches", icon: FileText },
            { key: "reconciliation", label: "Reconciliation", icon: Scale },
            { key: "merchants", label: "Merchants", icon: Users },
            { key: "accounts", label: "Accounts", icon: Landmark },
            { key: "revenue", label: "Revenue", icon: TrendingUp },
            { key: "alerts", label: "Alerts", icon: Bell },
            { key: "audit", label: "Audit & Compliance", icon: ClipboardList },
            { key: "settings", label: "Settings", icon: Settings },
          ].map(item => {
            const isActive = page === item.key;
            const Icon = item.icon;
            return (
              <button key={item.key} onClick={() => { setPage(item.key as any); setSelectedId(null); }}
                className={"sidebar-nav-item transition-all" + (isActive ? " sidebar-nav-active" : "")}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, width: '100%',
                  padding: '11px 13px', borderRadius: 10, marginBottom: 3,
                  background: isActive ? 'rgba(255,255,255,0.10)' : 'transparent',
                  boxShadow: isActive ? 'inset 0 0 0 1px rgba(255,255,255,0.09), 0 0 18px -6px rgba(52,227,176,0.35)' : 'none',
                  color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.48)',
                  fontSize: 13, fontWeight: 500,
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                }}>
                <Icon style={{ width: 16, height: 16 }} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.key === "alerts" && (alertsData?.total ?? 0) > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 999, background: 'var(--red)', color: '#FFFFFF' }}>{alertsData.total}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User profile + sign out */}
        {currentUser && (
          <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.08)', marginBottom: 8 }}>
            <div className="flex items-center gap-2.5">
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#FFFFFF' }}>
                {currentUser.initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: '#FFFFFF', lineHeight: 1.2 }}>{currentUser.name}</p>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', lineHeight: 1.2, marginTop: 1 }}>
                  {currentUser.role === "admin" ? "Administrator" : currentUser.role === "approver" ? "Approver" : "Viewer"}
                </p>
              </div>
              <button onClick={() => { setLoggedIn(false); setCurrentUser(null); setPage("dashboard"); setSelectedId(null); }}
                title="Sign out" aria-label="Sign out"
                className="transition-colors"
                style={{ padding: 6, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}>
                <LogOut style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>
        )}

        {/* Powered by Fybrus */}
        <div style={{ padding: '2px 14px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="15" height="18" viewBox="0 0 24 28" aria-hidden="true" style={{ flexShrink: 0 }}>
            <defs>
              <linearGradient id="fybMark" x1="0" y1="0" x2="0.35" y2="1">
                <stop offset="0" stopColor="#3BE8B4" />
                <stop offset="1" stopColor="#0E8E72" />
              </linearGradient>
            </defs>
            <path d="M7.5 3 L12 3 L8.2 27 L3.7 27 Z" fill="url(#fybMark)" opacity="0.55" />
            <path d="M9.5 3 L23 3 L20.6 9 L7.1 9 Z" fill="url(#fybMark)" />
            <path d="M8 12 L19 12 L16.6 18 L5.6 18 Z" fill="url(#fybMark)" />
          </svg>
          <div style={{ lineHeight: 1.1 }}>
            <span style={{ display: 'block', fontSize: 8, letterSpacing: '0.09em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.32)' }}>Powered by</span>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', color: '#FFFFFF' }}>FYBRUS<span style={{ color: '#34E3B0' }}>.</span></span>
          </div>
        </div>
      </aside>

      {/* ─ Right content ─ */}
      <div style={{ flex: 1, marginLeft: 234, minHeight: '100vh' }}>
        {/* ─ Header ─ */}
        <header style={{ position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.55)', backdropFilter: 'saturate(160%) blur(16px)', WebkitBackdropFilter: 'saturate(160%) blur(16px)', borderBottom: '1px solid var(--line)', padding: '15px 32px' }}>
          <h1 style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            {page === "dashboard" ? "Overview" : page === "batches" ? "Payout Batches" : page === "merchants" ? "Merchants" : page === "settings" ? "Settings" : page === "reconciliation" ? "Reconciliation" : page === "alerts" ? "Alerts & Resolution" : page === "revenue" ? "Revenue & Fees" : page === "accounts" ? "Collection Accounts" : "Audit & Compliance"}
          </h1>
          <div className="flex items-center gap-2">
                        {(page === "dashboard" || page === "batches") && currentUser?.role !== "viewer" && (
              <>
                <button onClick={() => setShowManual(true)} className="flex items-center gap-1.5 transition-colors"
                  style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: '1px solid var(--line)', color: 'var(--text-2)', background: 'var(--surface)' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--text-faint)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}>
                  <Plus className="w-3.5 h-3.5" /> Manual Entry
                </button>
                <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 transition-colors"
                  style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: 'var(--cta)', color: '#FFFFFF' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--cta-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--ink)'}>
                  <Upload className="w-3.5 h-3.5" /> Upload Batch
                </button>
              </>
            )}
            {page === "merchants" && (
              <button onClick={() => setShowAddMerchant(true)} className="flex items-center gap-1.5 transition-colors"
                style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: 'var(--cta)', color: '#FFFFFF' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--cta-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--ink)'}>
                <UserPlus className="w-3.5 h-3.5" /> Register Merchant
              </button>
            )}
          </div>
        </header>

        <main style={{ maxWidth: 1120, margin: '0 auto', padding: '20px 32px' }} className="space-y-4">
          {/* ─ Dashboard overview ─ */}
          {page === "dashboard" && (
            <>
              {(() => {
                const num = (v: any) => (v ? parseFloat(v) : 0);
                const abbr = (sym: string, n: number) =>
                  n >= 1e6 ? `${sym}${(n / 1e6).toFixed(n >= 2e7 ? 1 : 2)}M`
                  : n >= 1e3 ? `${sym}${(n / 1e3).toFixed(0)}k`
                  : `${sym}${n.toFixed(0)}`;
                const heroNum = { fontSize: 30, fontWeight: 650, letterSpacing: '-0.02em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' as const, lineHeight: 1.1 };
                const card = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, boxShadow: 'var(--shadow-card)' };
                const label = { fontSize: 10, fontWeight: 500 as const, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--text-4)' };

                const inFlight = active.reduce((s: number, b: any) => s + num(b.totalFiat || b.totalEur), 0);
                const s = analytics?.summary;

                // Daily volume bars for the last 30 days (from batches, all currencies summed)
                const daysArr: number[] = Array(30).fill(0);
                batches.forEach((b: any) => {
                  if (!b.createdAt) return;
                  const d = Math.floor((Date.now() - new Date(b.createdAt).getTime()) / 86400000);
                  if (d >= 0 && d < 30) daysArr[29 - d] += num(b.totalFiat || b.totalEur);
                });
                const maxDay = Math.max(...daysArr, 1);

                const CCY_ORDER = ["EUR", "USD", "AUD"];
                const bookTotal = Object.values(volByCurrency).reduce((a: number, v: any) => a + v, 0) || 1;

                return (
                  <>
                    {/* ─ Hero: the four numbers that matter ─ */}
                    <div className="grid grid-cols-4 gap-4">
                      <div style={{ ...card, padding: '18px 20px 14px' }} title="Total fiat received for payout batches created in the last 30 days">
                        <p style={label}>30-Day Volume</p>
                        <p style={{ ...heroNum, marginTop: 6 }}>{s ? abbr("€", s.volume30d || 0) : "—"}</p>
                        <div className="flex items-end" style={{ gap: 2, height: 26, marginTop: 10 }} aria-hidden="true">
                          {daysArr.map((v, i) => (
                            <div key={i} style={{ flex: 1, height: Math.max(2, (v / maxDay) * 26), borderRadius: 1.5, background: v > 0 ? (i === 29 ? 'var(--green)' : 'var(--cta-soft)') : 'var(--line)' }} />
                          ))}
                        </div>
                        <p style={{ fontSize: 9, color: 'var(--text-4)', marginTop: 5 }}>daily volume · last 30 days</p>
                      </div>
                      <div style={{ ...card, padding: '18px 20px 14px' }} title="Fiat in batches currently awaiting funding or processing">
                        <p style={label}>In Flight</p>
                        <p style={{ ...heroNum, marginTop: 6 }}>{abbr("€", inFlight)}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10 }}>
                          {pendingBatches.length > 0
                            ? <><span style={{ color: 'var(--amber)', fontWeight: 600 }}>{pendingBatches.length} awaiting funding</span>{active.length > pendingBatches.length ? ` · ${active.length - pendingBatches.length} processing` : ""}</>
                            : active.length > 0 ? `${active.length} processing` : "nothing pending"}
                        </p>
                      </div>
                      <div style={{ ...card, padding: '18px 20px 14px' }} title="Fybrus platform fee — 9 bps on every settled batch, deducted before conversion">
                        <p style={label}>Fees Collected · 9 bps</p>
                        <p style={{ ...heroNum, marginTop: 6, color: 'var(--green)' }}>{s ? abbr("€", s.totalFees || 0) : "—"}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10 }}>across {s?.completedBatches ?? "—"} settled batches</p>
                      </div>
                      <div style={{ ...card, padding: '18px 20px 14px' }} title="Average time from funds received to USDC confirmed on-chain — a stablecoin rail settles in minutes, not banking days">
                        <p style={label}>Avg Settlement</p>
                        <p style={{ ...heroNum, marginTop: 6 }}>{s && s.avgSettlementMinutes > 0 ? `${Math.round(s.avgSettlementMinutes)} min` : "—"}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10 }}>funds received → confirmed</p>
                      </div>
                    </div>


                    {/* ─ Volume trend ─ */}
                    <div style={{ ...card, padding: '18px 20px 10px' }}>
                      <div className="flex items-baseline justify-between">
                        <p style={label}>Volume · last 30 days</p>
                        <p style={{ fontSize: 11, color: 'var(--text-4)' }}>peak day {abbr("€", maxDay)}</p>
                      </div>
                      {(() => {
                        const W = 960, H = 132, PAD = 6, BASE = H - 18, TOP = 14;
                        const pts = daysArr.map((v, i) => [PAD + (i / 29) * (W - PAD * 2), BASE - (v / maxDay) * (BASE - TOP)] as [number, number]);
                        let d = `M ${pts[0][0]},${pts[0][1]}`;
                        for (let i = 1; i < pts.length; i++) {
                          const mx = (pts[i - 1][0] + pts[i][0]) / 2, my = (pts[i - 1][1] + pts[i][1]) / 2;
                          d += ` Q ${pts[i - 1][0]},${pts[i - 1][1]} ${mx},${my}`;
                        }
                        d += ` L ${pts[29][0]},${pts[29][1]}`;
                        const area = d + ` L ${W - PAD},${BASE} L ${PAD},${BASE} Z`;
                        return (
                          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 132, display: 'block', marginTop: 8 }} aria-label="Daily payout volume, last 30 days">
                            <defs>
                              <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0" stopColor="#14BC90" stopOpacity="0.30" />
                                <stop offset="1" stopColor="#14BC90" stopOpacity="0.02" />
                              </linearGradient>
                            </defs>
                            {[0.33, 0.66].map(f => (
                              <line key={f} x1={PAD} x2={W - PAD} y1={BASE - f * (BASE - TOP)} y2={BASE - f * (BASE - TOP)} stroke="rgba(21,34,28,0.06)" strokeWidth="1" />
                            ))}
                            <line x1={PAD} x2={W - PAD} y1={BASE} y2={BASE} stroke="rgba(21,34,28,0.12)" strokeWidth="1" />
                            <path d={area} fill="url(#volFill)" />
                            <path d={d} fill="none" stroke="#0FA37C" strokeWidth="2.25" strokeLinecap="round" />
                            <circle cx={pts[29][0]} cy={pts[29][1]} r="4" fill="#0FA37C" />
                            <circle cx={pts[29][0]} cy={pts[29][1]} r="8" fill="#0FA37C" opacity="0.18" />
                          </svg>
                        );
                      })()}
                    </div>

                    {/* ─ Needs attention + currency mix ─ */}
                    <div className="grid grid-cols-3 gap-4">
                      <div style={{ ...card, gridColumn: 'span 2', overflow: 'hidden' }}>
                        <div className="flex items-center justify-between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
                          <p style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' }}>Needs attention</p>
                          {pendingBatches.length > 0 && (() => {
                            const acct = (accounts as any[]).find((a: any) => a.status !== 'closed' && a.currency === pendingBatches[0]?.currency) || (accounts as any[]).find((a: any) => a.status !== 'closed');
                            if (!acct) return (
                              <button onClick={() => setPage("accounts")} style={{ fontSize: 11, fontWeight: 500, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}>Open a collection account →</button>
                            );
                            return (
                              <button onClick={() => copyText(acct.iban.replace(/ /g, ""))} className="flex items-center gap-1 transition-colors" style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
                                title={`${acct.currency} collection account · ${acct.bankName}`}
                                onMouseEnter={e => e.currentTarget.style.color = 'var(--ink)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                                <Copy className="w-3 h-3" /> {acct.currency} · {acct.iban} · {acct.bic}
                              </button>
                            );
                          })()}
                        </div>
                        {pendingBatches.length === 0 && (
                          <div className="flex items-center gap-2.5" style={{ padding: '18px 16px' }}>
                            <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--green)' }} />
                            <p style={{ fontSize: 12.5, color: 'var(--ink)' }}>All clear — nothing awaiting funding.{active.length > 0 ? ` ${active.length} batch${active.length > 1 ? "es" : ""} processing.` : ""}</p>
                          </div>
                        )}
                        {pendingBatches.slice(0, 4).map((b: any) => {
                          const sym = (CSYM as any)[b.currency] || "€";
                          return (
                            <div key={b.id} className="flex items-center justify-between" style={{ padding: '13px 16px', borderTop: '1px solid var(--inset-2)' }}>
                              <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#F59E0B', flexShrink: 0 }} />
                                <button onClick={() => setSelectedId(b.id)} style={{ fontSize: 12, fontWeight: 500, fontFamily: "'Geist Mono', ui-monospace, monospace", color: 'var(--ink)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                                  onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'} onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>{b.batchRef}</button>
                                <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{b.merchantCount} merchants · created {timeAgo(b.createdAt)}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }} title={`${sym}${num(b.totalFiat || b.totalEur).toLocaleString("en", { minimumFractionDigits: 2 })}`}>{abbr(sym, num(b.totalFiat || b.totalEur))} {b.currency}</span>
                                {(() => {
                                  const acct = (accounts as any[]).find((a: any) => a.status !== 'closed' && a.currency === b.currency);
                                  return acct ? (
                                    <button onClick={() => copyText(acct.iban.replace(/ /g, ""))}
                                      title={`Wire ${sym}${num(b.totalFiat || b.totalEur).toLocaleString("en", { minimumFractionDigits: 2 })} from your bank to ${acct.iban} (${acct.bic}) — the batch funds automatically when it lands.`}
                                      className="flex items-center gap-1.5"
                                      style={{ fontSize: 11, fontWeight: 500, padding: '5px 12px', borderRadius: 7, border: '1px solid var(--line-strong)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer' }}>
                                      <Copy className="w-3 h-3" /> Copy transfer details
                                    </button>
                                  ) : (
                                    <button onClick={() => setPage("accounts")} style={{ fontSize: 11, fontWeight: 500, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}>Open {b.currency} account →</button>
                                  );
                                })()}
                                <button onClick={() => simulateSettlementMut.mutate(b.batchRef)} disabled={simulateSettlementMut.isPending}
                                  title="Demo only — pretends the wire has landed by posting the bank's settlement webhook"
                                  style={{ fontSize: 10, color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                                  {simulateSettlementMut.isPending ? "simulating…" : "simulate receipt (demo)"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {pendingBatches.length > 0 && <p style={{ fontSize: 10, color: 'var(--text-4)', padding: '8px 16px 10px' }}>Batches fund themselves when your wire reaches the collection account — Banking Circle notifies the platform automatically. Nothing is “paid” from this dashboard.</p>}
                      </div>

                      <div style={{ ...card, padding: 16 }}>
                        <p style={{ ...label, marginBottom: 12 }}>Volume by Currency</p>
                        <div className="space-y-3.5">
                          {CCY_ORDER.filter(c => volByCurrency[c]).map(c => {
                            const v = volByCurrency[c] as number;
                            const share = (v / bookTotal) * 100;
                            return (
                              <div key={c} title={`${(CSYM as any)[c] || ""}${v.toLocaleString("en", { minimumFractionDigits: 2 })}`}>
                                <div className="flex items-baseline justify-between">
                                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>{c}</span>
                                  <span style={{ fontSize: 15, fontWeight: 650, letterSpacing: '-0.01em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{abbr((CSYM as any)[c] || "", v)}</span>
                                </div>
                                <div style={{ height: 4, borderRadius: 2, background: 'var(--track)', overflow: 'hidden', marginTop: 5 }}>
                                  <div style={{ width: `${share}%`, height: '100%', borderRadius: 2, background: c === 'EUR' ? 'var(--ink)' : c === 'USD' ? 'var(--green)' : 'var(--amber)' }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex justify-between" style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--line)', fontSize: 11, color: 'var(--text-3)' }}>
                          <span>{batches.length} batches · {merchants.length} merchants</span>
                          <span style={{ color: 'var(--green)', fontWeight: 600 }}>{done.length} settled</span>
                        </div>
                      </div>
                    </div>

                    {/* ─ Recent batches + right rail ─ */}
                    <div className="grid grid-cols-3 gap-4">
                      <div style={{ ...card, gridColumn: 'span 2', overflow: 'hidden' }}>
                        <div className="flex items-center justify-between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
                          <p style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' }}>Recent Batches</p>
                          <button onClick={() => setPage("batches")} style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--ink)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                            View all →
                          </button>
                        </div>
                        {batches.slice(0, 6).map((b: any) => {
                          const sym = (CSYM as any)[b.currency] || "€";
                          return (
                            <div key={b.id} className="flex items-center justify-between cursor-pointer transition-colors"
                              style={{ padding: '13px 16px', borderTop: '1px solid var(--inset-2)' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--inset)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              onClick={() => setSelectedId(b.id)}>
                              <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
                                <span style={{ fontSize: 12, fontWeight: 500, fontFamily: "'Geist Mono', ui-monospace, monospace", color: 'var(--ink)' }}>{b.batchRef}</span>
                                <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{b.merchantCount} merchants · {timeAgo(b.createdAt)}</span>
                              </div>
                              <div className="flex items-center gap-4">
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }} title={`${sym}${num(b.totalFiat || b.totalEur).toLocaleString("en", { minimumFractionDigits: 2 })}`}>{abbr(sym, num(b.totalFiat || b.totalEur))} <span style={{ fontSize: 10, color: 'var(--text-4)', fontWeight: 500 }}>{b.currency}</span></span>
                                <Badge status={b.status} />
                              </div>
                            </div>
                          );
                        })}
                        {batches.length === 0 && <p style={{ padding: '20px 16px', fontSize: 12, color: 'var(--text-3)' }}>No batches yet. Upload a CSV to get started.</p>}
                      </div>

                      <div className="space-y-4">
                        {!analytics && (
                          <div className="flex items-center justify-center" style={{ ...card, padding: 32 }}>
                            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-faint)' }} />
                          </div>
                        )}
                        {analytics && (
                          <>
                            <div style={{ ...card, padding: 16 }}>
                              <p style={{ ...label, marginBottom: 10 }}>Settlement Metrics</p>
                              <div className="space-y-3">
                                <div title={`Batches fully processed: ${analytics.summary.completedBatches} of ${analytics.summary.totalBatches}`} className="flex justify-between" style={{ fontSize: 12 }}><span style={{ color: 'var(--text-2)' }}>Batch Completion</span><span style={{ fontWeight: 600, color: analytics.summary.completionRate >= 80 ? 'var(--green)' : 'var(--amber)' }}>{analytics.summary.completionRate.toFixed(0)}% <span style={{ color: 'var(--text-4)', fontWeight: 400 }}>({analytics.summary.completedBatches}/{analytics.summary.totalBatches})</span></span></div>
                                <div title={`Payouts confirmed on-chain: ${analytics.summary.confirmedPayouts} of ${analytics.summary.totalPayouts}. Non-confirmed here are compliance-blocked, not technical failures.`} className="flex justify-between" style={{ fontSize: 12 }}><span style={{ color: 'var(--text-2)' }}>Payouts Confirmed</span><span style={{ fontWeight: 600, color: 'var(--ink)' }}>{analytics.summary.confirmedPayouts}/{analytics.summary.totalPayouts}{analytics.summary.failedPayouts > 0 ? <span style={{ color: 'var(--amber)', fontWeight: 400 }}> · {analytics.summary.failedPayouts} blocked</span> : null}</span></div>
                                <div className="flex justify-between" style={{ fontSize: 12 }}><span style={{ color: 'var(--text-2)' }}>Avg FX Rate</span><span style={{ fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{analytics.summary.avgExchangeRate.toFixed(4)}</span></div>
                                <div title="Acquirer markup earned on settled payouts — see the Revenue page" className="flex justify-between" style={{ fontSize: 12 }}><span style={{ color: 'var(--text-2)' }}>Markup Owed (Acquirer)</span><button onClick={() => setPage("revenue")} style={{ fontWeight: 600, color: 'var(--blue)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }} onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'} onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>{revenue ? abbr("€", revenue.markupOwed || 0) : "View →"}</button></div>
                              </div>
                            </div>

                            <div style={{ ...card, padding: 16 }}>
                              <p style={{ ...label, marginBottom: 10 }}>Payout Status</p>
                              {(() => {
                                const counts = analytics.payoutStatusCounts || {};
                                const total = Object.values(counts).reduce((s: number, v: any) => s + v, 0) as number;
                                if (total === 0) return <p style={{ fontSize: 12, color: 'var(--text-3)' }}>No payouts</p>;
                                return (
                                  <div className="space-y-2">
                                    {Object.entries(counts).map(([status, val]) => {
                                      const pct = ((val as number) / total) * 100;
                                      const color = SC[status]?.dot || 'var(--text-faint)';
                                      const lbl = status === 'pending' ? 'Pending' : SC[status]?.label || status;
                                      return (
                                        <div key={status}>
                                          <div className="flex justify-between" style={{ fontSize: 11, marginBottom: 2 }}>
                                            <span style={{ color: 'var(--text-2)' }}>{lbl}</span>
                                            <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{val as number} <span style={{ color: 'var(--text-3)' }}>({pct.toFixed(0)}%)</span></span>
                                          </div>
                                          <div style={{ height: 4, borderRadius: 2, background: 'var(--track)', overflow: 'hidden' }}>
                                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: color }} />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          )}

          {/* ─ Batches tab ─ */}
          {page === "batches" && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--shadow-card)', overflow: 'auto' }}>
              <div className="flex items-center justify-between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' }}>{filtered.length} {filtered.length === 1 ? "Batch" : "Batches"}</h2>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5" style={{ background: 'var(--inset-2)', borderRadius: 8, padding: '6px 12px', border: '1px solid transparent' }}>
                    <Search className="w-3.5 h-3.5" style={{ color: 'var(--text-faint)' }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search batches..."
                      className="outline-none" style={{ background: 'transparent', fontSize: 12, color: 'var(--ink)', width: 120 }} />
                  </div>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label="From date"
                    style={{ padding: '6px 9px', borderRadius: 8, fontSize: 12, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: dateFrom ? 'var(--ink)' : 'var(--text-4)', cursor: 'pointer' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-4)' }}>→</span>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label="To date"
                    style={{ padding: '6px 9px', borderRadius: 8, fontSize: 12, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: dateTo ? 'var(--ink)' : 'var(--text-4)', cursor: 'pointer' }} />
                  {(dateFrom || dateTo) && (
                    <button onClick={() => { setDateFrom(""); setDateTo(""); }} title="Clear dates"
                      style={{ fontSize: 11, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>clear</button>
                  )}
                  <select value={currencyFilter} onChange={e => setCurrencyFilter(e.target.value)} aria-label="Filter by currency"
                    style={{ padding: '7px 10px', borderRadius: 8, fontSize: 12, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer' }}>
                    <option value="all">All currencies</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="AUD">AUD</option>
                  </select>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter by status"
                    className="outline-none cursor-pointer"
                    style={{ padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 500, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--text-2)' }}>
                    <option value="all">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="funded">Funded</option>
                    <option value="converting">Converting</option>
                    <option value="sending">Sending</option>
                    <option value="completed">Completed</option>
                  </select>
                  <button onClick={downloadTemplate} className="flex items-center gap-1.5 transition-colors" style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--ink)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                    <FileDown className="w-3.5 h-3.5" /> CSV Template
                  </button>
                  <button onClick={() => window.open("/api/reports/csv", "_blank")} className="flex items-center gap-1.5 transition-colors" style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--ink)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                    <Download className="w-3.5 h-3.5" /> Export CSV
                  </button>
                </div>
              </div>
              {isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-faint)' }} /></div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16">
                  <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-faint)' }} />
                  <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
                    {batches.length === 0 ? "No batches yet. Upload a CSV or add entries manually." : "No batches match your filters."}
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 700 }}>
                  <thead>
                    <tr style={{ background: 'var(--inset)' }}>
                      {["Batch", "Ccy", "#", "FIAT Total", "USDC", "Timing", "Status", "Created"].map((h, i) => (
                        <th key={h} style={{
                          fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)',
                          paddingTop: 8, paddingBottom: 8, paddingLeft: i === 0 ? 16 : 12, paddingRight: i === 7 ? 16 : 12,
                          textAlign: i === 0 ? 'left' : i === 3 || i === 4 || i === 7 ? 'right' : 'center',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((b: any) => {
                      const sym = (CSYM as any)[b.currency] || "€";
                      return (
                        <tr key={b.id} className="cursor-pointer transition-colors"
                          style={{ borderTop: '1px solid var(--line)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--inset)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          onClick={() => setSelectedId(b.id)}>
                          <td style={{ paddingTop: 8, paddingBottom: 8, paddingLeft: 16, paddingRight: 10, fontSize: 11, fontWeight: 500, fontFamily: "'Geist Mono', ui-monospace, monospace", color: 'var(--ink)', whiteSpace: 'nowrap' }}>{b.batchRef}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                            <span style={{
                              fontSize: 8, fontWeight: 600, letterSpacing: '0.07em', padding: '2px 5px', borderRadius: 4,
                              background: 'var(--track)', color: 'var(--text-2)',
                            }}>{b.currency || "EUR"}</span>
                          </td>
                          <td style={{ padding: '8px 6px', fontSize: 12, textAlign: 'center', color: 'var(--text-2)' }}>{b.merchantCount}</td>
                          <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 600, textAlign: 'right', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{sym}{parseFloat(b.totalFiat || b.totalEur).toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: b.totalUsdc ? 'var(--ink)' : 'var(--text-faint)' }}>
                            {b.totalUsdc ? `$${parseFloat(b.totalUsdc).toLocaleString("en", { minimumFractionDigits: 2 })}` : "—"}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                            {b.payoutTiming === "scheduled" && b.scheduledDate ? (
                              <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 5px', borderRadius: 4, background: 'var(--track)', color: 'var(--text-2)' }}>
                                {new Date(b.scheduledDate).toLocaleDateString("en-IE", { day: "numeric", month: "short" })}
                              </span>
                            ) : (
                              <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 5px', borderRadius: 4, background: 'var(--track)', color: 'var(--text-2)' }}>ASAP</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}><Badge status={b.status} /></td>
                          <td style={{ paddingTop: 8, paddingBottom: 8, paddingLeft: 12, paddingRight: 16, textAlign: 'right', fontSize: 11, color: 'var(--text-4)', whiteSpace: 'nowrap' }}>{timeAgo(b.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          )}

          {/* ─ Reconciliation tab ─ */}
          {page === "reconciliation" && (
            <>
              {/* Totals strip */}
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: "Fiat Expected", value: reconciliation?.totals?.fiatExpected, pre: "€" },
                  { label: "Fiat Received", value: reconciliation?.totals?.fiatReceived, pre: "€" },
                  { label: "USDC Converted", value: reconciliation?.totals?.usdcConverted, pre: "$" },
                  { label: "USDC Confirmed", value: reconciliation?.totals?.usdcConfirmed, pre: "$" },
                  { label: "Exceptions", value: reconciliation?.exceptionBatches, pre: "", flag: true },
                ].map((k) => (
                  <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--shadow-card)', padding: '14px 16px' }}>
                    <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-4)' }}>{k.label}</p>
                    <p style={{ fontSize: 18, fontWeight: 600, fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: '-0.03em', marginTop: 4, fontVariantNumeric: 'tabular-nums', color: k.flag ? ((k.value ?? 0) > 0 ? 'var(--red)' : 'var(--green)') : 'var(--ink)' }}>
                      {k.pre}{typeof k.value === "number" ? k.value.toLocaleString("en", { minimumFractionDigits: k.flag ? 0 : 2, maximumFractionDigits: k.flag ? 0 : 2 }) : "—"}
                    </p>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <p style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {reconciliation ? <><b style={{ color: 'var(--green)' }}>{reconciliation.reconciledBatches}</b> reconciled · <b style={{ color: (reconciliation.exceptionBatches ?? 0) > 0 ? 'var(--red)' : 'var(--green)' }}>{reconciliation.exceptionBatches}</b> with exceptions</> : "Loading…"}
                </p>
                <div className="flex items-center gap-2">
                  <input value={reconSearch} onChange={e => setReconSearch(e.target.value)} placeholder="Search batch ref…"
                    className="outline-none" style={{ width: 170, padding: '7px 12px', borderRadius: 8, fontSize: 12, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }} />
                  {[["all", "All"], ["exceptions", "Exceptions"], ["reconciled", "Reconciled"]].map(([k, label]) => (
                    <button key={k} onClick={() => setReconFilter(k)}
                      style={{ fontSize: 11, fontWeight: 500, padding: '6px 12px', borderRadius: 999, border: '1px solid ' + (reconFilter === k ? 'var(--ink)' : 'var(--line-strong)'), background: reconFilter === k ? 'var(--ink)' : '#FFFFFF', color: reconFilter === k ? '#FFFFFF' : 'var(--text-2)', cursor: 'pointer' }}>
                      {label}
                    </button>
                  ))}
                  <a href="/api/reconciliation/csv" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: '1px solid var(--line)', color: 'var(--text-2)', textDecoration: 'none' }}>
                    <Download style={{ width: 14, height: 14 }} /> Export CSV
                  </a>
                </div>
              </div>

              {/* Reconciliation table */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--inset)' }}>
                        {["Batch", "Ccy", "Status", "Fiat Exp.", "Fiat Rcvd", "USDC Conv.", "USDC Conf.", "Payouts", "Reconciliation"].map((h, i) => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: i > 2 && i < 7 ? 'right' : 'left', fontSize: 10, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-4)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecon.map((r: any) => (
                        <tr key={r.batchRef} style={{ borderBottom: '1px solid var(--line)' }}>
                          <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums' }}>
                            <button onClick={() => r.batchId && setSelectedId(r.batchId)} title="Open batch detail"
                              style={{ fontWeight: 600, color: 'var(--ink)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', textDecoration: 'none' }}
                              onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'} onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>
                              {r.batchRef}
                            </button>
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-2)' }}>{r.currency}</td>
                          <td style={{ padding: '10px 14px' }}><Badge status={r.status} /></td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)' }}>{r.fiatExpected.toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)' }}>{r.fiatReceived.toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)' }}>{r.usdcConverted.toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)' }}>{r.usdcConfirmed.toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{r.payoutsConfirmed}/{r.payoutsTotal}</td>
                          <td style={{ padding: '10px 14px' }}>
                            {r.reconciled ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color: 'var(--green)' }}><CheckCircle2 style={{ width: 13, height: 13 }} /> Reconciled</span>
                            ) : (
                              <span title={r.exceptions.join(" · ")} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color: 'var(--red)' }}><AlertCircle style={{ width: 13, height: 13 }} /> {r.exceptions.length} issue{r.exceptions.length > 1 ? "s" : ""}</span>
                            )}
                            {r.status === "pending" && currentUser?.role !== "viewer" && (
                              <button onClick={() => simulateSettlementMut.mutate(r.batchRef)} disabled={simulateSettlementMut.isPending}
                                title="Posts the same webhook Banking Circle sends when fiat lands"
                                style={{ marginLeft: 10, fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--line-strong)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--blue)' }}>
                                Demo: Simulate settlement
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {reconciliation && filteredRecon.length === 0 && reconciliation.rows.length > 0 && (
                        <tr><td colSpan={10} style={{ padding: '24px 16px', fontSize: 12, color: 'var(--text-4)', textAlign: 'center' }}>No batches match. <button onClick={() => { setReconSearch(""); setReconFilter("all"); }} style={{ color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>Clear filters</button></td></tr>
                      )}
                      {reconciliation && reconciliation.rows.length === 0 && (
                        <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'var(--text-4)' }}>No batches yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
                Money trail reconciled across the lifecycle: fiat received (Banking Circle) → converted (live ECB rate) → USDC sent → confirmed on-chain. Exceptions flag any mismatch.
              </p>
            </>
          )}

          {/* ─ Merchants tab ─ */}
          {page === "merchants" && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' }}>Registered Merchants</h2>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Register each merchant's wallet address once. They'll be matched automatically on batch uploads.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input value={merchantSearch} onChange={e => setMerchantSearch(e.target.value)} placeholder="Search name, wallet, email, KYC ref…"
                      className="outline-none" style={{ width: 240, padding: '7px 12px', borderRadius: 8, fontSize: 12, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }} />
                    {[["all", "All"], ["active", "Active"], ["disabled", "Disabled"], ["flagged", "Flagged"]].map(([k, label]) => (
                      <button key={k} onClick={() => setMerchantFilter(k)}
                        style={{ fontSize: 11, fontWeight: 500, padding: '6px 12px', borderRadius: 999, border: '1px solid ' + (merchantFilter === k ? 'var(--ink)' : 'var(--line-strong)'), background: merchantFilter === k ? 'var(--ink)' : '#FFFFFF', color: merchantFilter === k ? '#FFFFFF' : 'var(--text-2)', cursor: 'pointer' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {merchants.length === 0 ? (
                <div className="text-center" style={{ padding: '64px 0' }}>
                  <Users className="w-10 h-10 mx-auto" style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
                  <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>No merchants registered yet.</p>
                  <button onClick={() => setShowAddMerchant(true)}
                    className="inline-flex items-center gap-1.5"
                    style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: 'var(--cta)', color: '#FFFFFF' }}>
                    <UserPlus className="w-3.5 h-3.5" /> Register First Merchant
                  </button>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                <table className="w-full" style={{ minWidth: 600 }}>
                  <thead>
                    <tr style={{ background: 'var(--inset)' }}>
                      {["Name", "Wallet Address", "KYC", "Screening", "Status", "Registered", ""].map((h, i) => (
                        <th key={h || "actions"} style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)', padding: '10px 16px', textAlign: i === 6 ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMerchants.map((m: any) => (
                      <tr key={m.id} className="transition-colors"
                        style={{ borderTop: '1px solid var(--line)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--inset)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '13px 16px' }}>
                          <span style={{ fontSize: 12, fontWeight: 500, display: 'block', color: m.status === "disabled" ? 'var(--text-4)' : 'var(--ink)' }}>{m.name}</span>
                          {m.email && <span style={{ fontSize: 10, color: 'var(--text-4)', display: 'block', marginTop: 1 }}>{m.email}</span>}
                        </td>
                        <td style={{ padding: '13px 16px' }}>
                          <div className="flex items-center gap-1.5">
                            <span style={{ fontSize: 11, fontFamily: "'Geist Mono', ui-monospace, monospace", color: 'var(--text-2)' }}>{m.walletAddress.slice(0, 8)}...{m.walletAddress.slice(-4)}</span>
                            <button onClick={() => copyText(m.walletAddress)} style={{ color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer' }}
                              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-2)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-faint)'}
                              aria-label="Copy wallet address"><Copy className="w-3 h-3" /></button>
                          </div>
                        </td>
                        {/* KYC reliance attestation — verification lives on the relying party's system */}
                        <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                          <span title={`KYC performed by ${m.kycReliedOn || "Acquirer of record"}${m.kycRef ? ` · ref ${m.kycRef}` : ""}${m.kycAttestedAt ? ` · attested ${new Date(m.kycAttestedAt).toLocaleDateString()}` : ""}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 999, background: 'var(--tint-blue)', color: 'var(--blue)' }}>
                            <ShieldCheck style={{ width: 11, height: 11 }} /> Relied · {(m.kycReliedOn || "Acquirer").split(" ")[0]}
                          </span>
                        </td>
                        {/* Destination-wallet screening — our obligation */}
                        <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                          {m.walletScreenStatus === "flagged" ? (
                            <span title={`Flagged by ${m.walletScreenProvider}${m.walletScreenedAt ? ` · ${new Date(m.walletScreenedAt).toLocaleString()}` : ""}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 999, background: 'var(--tint-red)', color: 'var(--red)' }}>
                              <AlertCircle style={{ width: 11, height: 11 }} /> Flagged
                            </span>
                          ) : m.walletScreenStatus === "clear" ? (
                            <span title={`Screened clear by ${m.walletScreenProvider}${m.walletScreenedAt ? ` · ${new Date(m.walletScreenedAt).toLocaleString()}` : ""}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 999, background: 'var(--tint-green)', color: 'var(--green)' }}>
                              <CheckCircle2 style={{ width: 11, height: 11 }} /> Clear
                            </span>
                          ) : (
                            <button onClick={() => screenMerchantMut.mutate(m.id)} disabled={screenMerchantMut.isPending}
                              style={{ fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--line-strong)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--amber-strong)' }}>
                              Screen now
                            </button>
                          )}
                        </td>
                        <td style={{ padding: '13px 16px' }}><Badge status={m.status || "active"} /></td>
                        <td style={{ padding: '13px 16px', fontSize: 11, color: 'var(--text-4)', whiteSpace: 'nowrap' }}>{timeAgo(m.createdAt)}</td>
                        <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                          {currentUser?.role !== "viewer" && (
                            <div className="flex items-center gap-1 justify-end">
                              <button onClick={() => setEditingMerchant({ ...m })}
                                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--line-strong)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--text-2)' }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--ink)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line-strong)'}>
                                Edit
                              </button>
                              <button onClick={() => updateMerchantMut.mutate({ id: m.id, status: m.status === "disabled" ? "active" : "disabled" })}
                                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--line-strong)', background: 'var(--surface)', cursor: 'pointer', color: m.status === "disabled" ? 'var(--green)' : 'var(--amber)' }}>
                                {m.status === "disabled" ? "Enable" : "Disable"}
                              </button>
                              <button onClick={() => { if (window.confirm(`Delete ${m.name}? This cannot be undone.`)) deleteMerchantMut.mutate(m.id); }}
                                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--red-line)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--red)' }}>
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredMerchants.length === 0 && merchants.length > 0 && (
                  <p style={{ padding: '24px 16px', fontSize: 12, color: 'var(--text-4)', textAlign: 'center' }}>No merchants match “{merchantSearch || merchantFilter}”. <button onClick={() => { setMerchantSearch(""); setMerchantFilter("all"); }} style={{ color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>Clear filters</button></p>
                )}
                {deleteMerchantMut.isError && <p style={{ padding: '8px 16px', fontSize: 11, color: 'var(--red)' }}>{(deleteMerchantMut.error as Error).message}</p>}
                </div>
              )}
            </div>
          )}

          {/* ─ Collection Accounts tab ─ */}
          {page === "accounts" && (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <p style={{ fontSize: 11, lineHeight: 1.55, color: 'var(--text-3)', padding: '10px 14px', borderRadius: 10, background: 'var(--inset-2)', border: '1px solid var(--line)', flex: 1 }}>
                  Collection accounts are the IBANs your payout fiat arrives into — one per currency. Open an account below and share its details with the paying entity. In production these are <strong>virtual IBANs issued by Banking Circle</strong>; in the demo they are generated instantly with the same shape.
                </p>
                <input value={accountSearch} onChange={e => setAccountSearch(e.target.value)} placeholder="Search currency, IBAN, label…"
                  className="outline-none" style={{ width: 220, padding: '9px 12px', borderRadius: 8, fontSize: 12, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)', flexShrink: 0 }} />
                <button onClick={() => { setShowOpenAccount(true); setOpenedAccount(null); setNewAccountLabel(""); }}
                  className="flex items-center gap-1.5"
                  style={{ padding: '13px 16px', borderRadius: 8, fontSize: 12.5, fontWeight: 500, background: 'var(--cta)', color: '#FFFFFF', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                  <Landmark className="w-3.5 h-3.5" /> Open account
                </button>
              </div>

              {accounts.length === 0 ? (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: '48px 0', textAlign: 'center' }}>
                  <Landmark className="w-8 h-8 mx-auto" style={{ color: 'var(--text-faint)', marginBottom: 10 }} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>No collection accounts yet</p>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Open your first account to receive payout funding. 9 currencies available.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {accounts.filter((a: any) => {
                    const q = accountSearch.toLowerCase();
                    return !q || [a.currency, a.iban, a.label, a.bankName].some((f: any) => (f || "").toLowerCase().includes(q));
                  }).map((a: any) => (
                    <div key={a.id} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--shadow-card)', padding: 18, opacity: a.status === 'closed' ? 0.55 : 1 }}>
                      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                        <div className="flex items-center gap-2.5">
                          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.03em', padding: '4px 10px', borderRadius: 8, background: 'var(--cta)', color: '#FFFFFF' }}>{a.currency}</span>
                          {a.label && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{a.label}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge status={a.status === 'closed' ? 'disabled' : 'active'} />
                          {currentUser?.role !== "viewer" && (
                            <button onClick={() => closeAccountMut.mutate({ id: a.id, status: a.status === 'closed' ? 'active' : 'closed' })}
                              style={{ fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--line-strong)', background: 'var(--surface)', cursor: 'pointer', color: a.status === 'closed' ? 'var(--green)' : 'var(--amber-strong)' }}>
                              {a.status === 'closed' ? 'Reopen' : 'Close'}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <p style={{ fontSize: 15, fontWeight: 500, fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: '0.01em', color: 'var(--ink)' }}>{a.iban}</p>
                        <button onClick={() => copyText(a.iban.replace(/ /g, ""))} aria-label="Copy IBAN"
                          style={{ color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-2)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-faint)'}>
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex gap-5" style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>
                        <span>BIC <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", color: 'var(--text-2)', fontWeight: 500 }}>{a.bic}</span></span>
                        <span>{a.bankName}</span>
                        <span style={{ marginLeft: 'auto', color: 'var(--text-4)' }}>opened {timeAgo(a.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ fontSize: 10, color: 'var(--text-4)' }}>Demo accounts — IBANs are generated locally. In production, opening an account provisions a virtual IBAN at Banking Circle and appears here within seconds.</p>
            </div>
          )}

          {/* ─ Revenue & Fees tab ─ */}
          {page === "revenue" && (
            <div className="space-y-5">
              <p style={{ fontSize: 11, lineHeight: 1.55, color: 'var(--text-3)', padding: '10px 14px', borderRadius: 10, background: 'var(--inset-2)', border: '1px solid var(--line)' }}>
                Fybrus charges a fixed <strong>{settings ? (settings.fybrusFeeBps/100).toFixed(2) : "0.09"}%</strong> ({settings?.fybrusFeeBps ?? 9} bps) on each payout. On top of that, the acquirer sets its own markup — collected from merchants and <strong>owed back to the acquirer by Fybrus</strong>. The numbers below are settled (confirmed) payouts only.
              </p>

              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Owed to Acquirer (markup)", val: revenue?.markupOwed, color: 'var(--green)', hint: "Your markup on settled payouts — rebated to you by Fybrus." },
                  { label: "Fybrus Fees (9 bps)", val: revenue?.fybrusFees, color: 'var(--ink)', hint: "What the acquirer pays Fybrus for the settled payouts." },
                  { label: "Net Delivered to Merchants", val: revenue?.netToMerchants, color: 'var(--text-2)', hint: "USDC value delivered after all fees.", usd: true },
                ].map((c) => (
                  <div key={c.label} title={c.hint} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--shadow-card)', padding: 16 }}>
                    <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-4)' }}>{c.label}</p>
                    <p style={{ fontSize: 22, fontWeight: 600, fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: '-0.03em', marginTop: 4, color: c.color }}>
                      {c.usd ? "$" : "€"}{(c.val || 0).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
              </div>

              {/* Markup control */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--shadow-card)', padding: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Default acquirer markup</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>The fallback rate for merchants without their own rate. Every merchant’s rate is editable inline in the table below — type a value and press Enter (blank = use this default). 100 bps = 1%.</p>
                <div className="flex items-center gap-3">
                  <input type="number" min={0} max={1000}
                    value={markupInput !== "" ? markupInput : (settings?.defaultMarkupBps ?? "")}
                    onChange={e => setMarkupInput(e.target.value)}
                    className="outline-none" style={{ width: 120, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontFamily: "'Geist Mono', ui-monospace, monospace", border: '1px solid var(--line-strong)', color: 'var(--ink)' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>bps ({(((markupInput !== "" ? Number(markupInput) : (settings?.defaultMarkupBps ?? 0)))/100).toFixed(2)}%)</span>
                  <button onClick={() => saveMarkupMut.mutate(markupInput !== "" ? markupInput : String(settings?.defaultMarkupBps ?? 0))}
                    disabled={saveMarkupMut.isPending}
                    style={{ fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--cta)', color: '#FFFFFF', cursor: 'pointer' }}>
                    {saveMarkupMut.isPending ? "Saving…" : "Save markup"}
                  </button>
                  {saveMarkupMut.isSuccess && markupInput === "" && <span style={{ fontSize: 11, color: 'var(--green)' }}>Saved</span>}
                </div>
              </div>

              {/* Per-merchant breakdown */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
                <div className="flex items-center justify-between gap-3 flex-wrap" style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Markup earned by merchant</p>
                  <div className="flex items-center gap-2">
                    <input value={revSearch} onChange={e => setRevSearch(e.target.value)} placeholder="Search merchants…"
                      className="outline-none" style={{ width: 190, padding: '6px 11px', borderRadius: 8, fontSize: 12, border: '1px solid var(--line-strong)', background: 'transparent', color: 'var(--ink)' }} />
                    {[["all", "All"], ["stablecoin", "Stablecoin"], ["fiat", "Fiat"]].map(([k, l]) => (
                      <button key={k} onClick={() => setRevMethod(k)}
                        style={{ fontSize: 11, fontWeight: 500, padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
                          border: '1px solid ' + (revMethod === k ? 'var(--cta-soft)' : 'var(--line-strong)'),
                          background: revMethod === k ? 'var(--tint-green)' : 'transparent',
                          color: revMethod === k ? 'var(--green)' : 'var(--text-3)' }}>{l}</button>
                    ))}
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                <table className="w-full" style={{ minWidth: 720 }}>
                  <thead><tr style={{ background: 'var(--inset)' }}>
                    {["Merchant", "Markup rate", "Payout", "Settled volume", "Fybrus fee", "Acquirer markup"].map((h, i) => (
                      <th key={h} style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-4)', padding: '10px 16px', textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {(revenue?.byMerchant ?? []).filter((r: any) => {
                      if (revMethod !== "all" && (r.payoutMethod || "stablecoin") !== revMethod) return false;
                      if (revSearch && !r.merchant.toLowerCase().includes(revSearch.toLowerCase())) return false;
                      return true;
                    }).map((r: any, i: number) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                        <td style={{ padding: '13px 16px', fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>{r.merchant}</td>
                        <td style={{ padding: '8px 16px' }}>
                          <div className="flex items-center gap-1.5">
                            <input type="number" min={0} max={1000}
                              value={rowBps[r.merchantId] ?? (r.markupBps ?? "")}
                              placeholder={String(settings?.defaultMarkupBps ?? 25)}
                              onChange={e => setRowBps({ ...rowBps, [r.merchantId]: e.target.value })}
                              onKeyDown={e => { if (e.key === "Enter") { updateMerchantMut.mutate({ id: r.merchantId, markupBps: (rowBps[r.merchantId] ?? "") === "" ? null : rowBps[r.merchantId] }); } }}
                              onBlur={() => { const v = rowBps[r.merchantId]; if (v !== undefined && v !== String(r.markupBps ?? "")) updateMerchantMut.mutate({ id: r.merchantId, markupBps: v === "" ? null : v }); }}
                              className="outline-none"
                              style={{ width: 62, padding: '5px 8px', borderRadius: 7, fontSize: 12, fontFamily: "'Geist Mono', ui-monospace, monospace", border: '1px solid var(--line-strong)', background: 'transparent', color: 'var(--ink)', textAlign: 'right' }} />
                            <span style={{ fontSize: 10, color: 'var(--text-4)' }}>bps{r.markupBps == null && (rowBps[r.merchantId] ?? "") === "" ? " · default" : ""}</span>
                          </div>
                        </td>
                        <td style={{ padding: '13px 16px' }}>
                          <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 999, background: r.payoutMethod === 'fiat' ? 'var(--tint-blue)' : 'var(--tint-green)', color: r.payoutMethod === 'fiat' ? 'var(--blue)' : 'var(--green)' }}>{r.payoutMethod === 'fiat' ? 'Fiat' : 'Stablecoin'}</span>
                        </td>
                        <td style={{ padding: '13px 16px', fontSize: 12, textAlign: 'right', fontFamily: "'Geist Mono', ui-monospace, monospace", color: 'var(--ink)' }}>€{r.volume.toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '13px 16px', fontSize: 12, textAlign: 'right', fontFamily: "'Geist Mono', ui-monospace, monospace", color: 'var(--text-2)' }}>€{r.fybrusFee.toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '13px 16px', fontSize: 12, textAlign: 'right', fontFamily: "'Geist Mono', ui-monospace, monospace", fontWeight: 600, color: 'var(--green)' }}>€{r.markup.toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                    {(!revenue || (revenue.byMerchant ?? []).length === 0) && (
                      <tr><td colSpan={6} style={{ padding: '24px 16px', fontSize: 12, color: 'var(--text-4)', textAlign: 'center' }}>No settled payouts yet.</td></tr>
                    )}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}

          {/* ─ Alerts & Resolution tab ─ */}
          {page === "alerts" && (() => {
            const allAlerts = [
              ...((alertsData?.failedPayouts ?? []).map((a: any) => ({ ...a, kind: "payout_failed" }))),
              ...((alertsData?.flaggedMerchants ?? []).map((a: any) => ({ ...a, kind: "merchant_flagged" }))),
              ...((alertsData?.reconExceptions ?? []).map((a: any) => ({ ...a, kind: "recon_exception" }))),
            ];
            const q = alertSearch.toLowerCase();
            const list = allAlerts.filter((a: any) => {
              if (alertFilter !== "all" && a.kind !== alertFilter) return false;
              if (q && ![a.merchant, a.batchRef, a.reason, a.walletAddress, (a.exceptions || []).join(" ")].some(f => (f || "").toLowerCase().includes(q))) return false;
              return true;
            });
            const KIND: Record<string, { label: string; dot: string; n: number }> = {
              payout_failed: { label: "Payout Failures", dot: "var(--red)", n: alertsData?.failedPayouts?.length ?? 0 },
              merchant_flagged: { label: "Flagged Wallets", dot: "var(--amber)", n: alertsData?.flaggedMerchants?.length ?? 0 },
              recon_exception: { label: "Recon Exceptions", dot: "var(--blue)", n: alertsData?.reconExceptions?.length ?? 0 },
            };
            return (
            <div className="space-y-5">
              {/* Summary tiles = the filters */}
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(KIND).map(([k, c]) => {
                  const active = alertFilter === k;
                  return (
                    <button key={k} onClick={() => setAlertFilter(active ? "all" : k)}
                      style={{ textAlign: 'left', cursor: 'pointer', background: 'var(--surface)', borderRadius: 18, padding: 16,
                        border: active ? '1px solid var(--cta-soft)' : '1px solid var(--line)',
                        boxShadow: active ? 'var(--shadow-card), 0 0 0 3px rgba(20,188,144,0.12)' : 'var(--shadow-card)' }}>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
                        <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-4)' }}>{c.label}</p>
                      </div>
                      <p style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-0.02em', marginTop: 6, color: c.n > 0 ? 'var(--ink)' : 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>{c.n}</p>
                      <p style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 2 }}>{active ? "filtering — click to show all" : "click to filter"}</p>
                    </button>
                  );
                })}
              </div>

              {/* One unified, filterable list */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
                <div className="flex items-center justify-between gap-3" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
                  <p style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
                    {alertFilter === "all" ? "All alerts" : KIND[alertFilter].label} <span style={{ color: 'var(--text-4)', fontWeight: 400, fontSize: 12 }}>({list.length})</span>
                  </p>
                  <input value={alertSearch} onChange={e => setAlertSearch(e.target.value)} placeholder="Search merchant, batch, reason…"
                    className="outline-none" style={{ width: 240, padding: '7px 12px', borderRadius: 8, fontSize: 12, border: '1px solid var(--line-strong)', background: 'transparent', color: 'var(--ink)' }} />
                </div>
                {list.length === 0 && (
                  <div className="flex items-center gap-2.5" style={{ padding: '18px 16px' }}>
                    <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--green)' }} />
                    <p style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{allAlerts.length === 0 ? "All clear — no failed payouts, flagged wallets or reconciliation exceptions." : "Nothing matches. "}
                      {allAlerts.length > 0 && <button onClick={() => { setAlertSearch(""); setAlertFilter("all"); }} style={{ color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>Clear filters</button>}
                    </p>
                  </div>
                )}
                {list.map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-3" style={{ padding: '11px 16px', borderTop: i > 0 || true ? '1px solid var(--line)' : 'none' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: KIND[a.kind].dot, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {a.kind === "payout_failed" && (<>
                        <p style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                          <span style={{ fontWeight: 600 }}>{a.merchant}</span> — {(CSYM as any)[a.currency] || "€"}{parseFloat(a.amount).toLocaleString("en", { minimumFractionDigits: 2 })} not delivered
                          <span style={{ color: 'var(--text-4)', fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 11 }}>  · {a.batchRef}</span>
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.reason}>
                          {a.reason}{!a.retryable && <span style={{ color: 'var(--amber-strong)' }}>  — compliance block; retrying won't deliver it</span>}
                        </p>
                      </>)}
                      {a.kind === "merchant_flagged" && (<>
                        <p style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                          <span style={{ fontWeight: 600 }}>{a.merchant}</span>
                          <span style={{ color: 'var(--text-4)', fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 11 }}>  · {a.walletAddress.slice(0, 10)}…{a.walletAddress.slice(-4)} · {a.provider}</span>
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.reason}>{a.reason}</p>
                      </>)}
                      {a.kind === "recon_exception" && (<>
                        <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', fontFamily: "'Geist Mono', ui-monospace, monospace" }}>{a.batchRef}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(a.exceptions || []).join(' · ')}>{(a.exceptions || []).join(' · ')} — clears when the underlying payout is resolved</p>
                      </>)}
                    </div>
                    <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                      {a.kind === "merchant_flagged"
                        ? <button onClick={() => setPage("merchants")} style={{ fontSize: 11, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--ink)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>Review merchant</button>
                        : <button onClick={() => a.batchId && setSelectedId(a.batchId)} style={{ fontSize: 11, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--ink)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>View batch</button>}
                      {a.kind === "payout_failed" && a.retryable && <button onClick={() => retryFailedMut.mutate(a.batchId)} disabled={retryFailedMut.isPending} style={{ fontSize: 11, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--amber-strong)' }}>Retry</button>}
                      <button onClick={() => openCare(a)} style={{ fontSize: 11, fontWeight: 500, padding: '4px 11px', borderRadius: 999, border: '1px solid var(--line-strong)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer' }}>Get help</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Open tickets */}
              {supportTickets.length > 0 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--shadow-card)', padding: '14px 16px' }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>Open tickets with Fybrus Customer Care <span style={{ color: 'var(--text-4)', fontWeight: 400 }}>· typically replies within 2 business hours</span></p>
                  <div>
                    {supportTickets.map((t: any, i: number) => (
                      <div key={t.id} className="flex items-center gap-3" style={{ fontSize: 12, padding: '9px 2px', borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}>
                        <LifeBuoy style={{ width: 13, height: 13, color: 'var(--blue)', flexShrink: 0 }} />
                        <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", color: 'var(--blue)', fontWeight: 500 }}>{t.ticketRef}</span>
                        <span style={{ flex: 1, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-4)', flexShrink: 0 }}>{timeAgo(t.createdAt)}</span>
                        <Badge status={t.status === "open" ? "processing" : "completed"} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            );
          })()}
          {/* ─ Audit & Compliance tab ─ */}
          {page === "audit" && (
            <div className="space-y-5">
              {/* Audit trail */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
                <div className="flex items-center justify-between" style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
                    <ClipboardList className="w-4 h-4 inline mr-1.5 -mt-0.5" style={{ color: 'var(--blue)' }} />
                    Audit Trail
                  </h3>
                  <button onClick={() => window.open("/api/audit/csv", "_blank")}
                    className="flex items-center gap-1.5 transition-colors" style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--ink)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                    <Download className="w-3.5 h-3.5" /> Export Audit Log
                  </button>
                </div>
                <div style={{ padding: '0 20px 12px', display: 'flex', gap: 4 }}>
                  <input value={auditSearch} onChange={e => setAuditSearch(e.target.value)} placeholder="Search action, ref, actor, detail…"
                    className="outline-none" style={{ width: 230, padding: '6px 12px', borderRadius: 8, fontSize: 11, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)', marginRight: 8 }} />
                  {AUDIT_CATEGORIES.map(cat => (
                    <button key={cat.key} onClick={() => setAuditFilter(cat.key)}
                      className="transition-all"
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 500,
                        background: auditFilter === cat.key ? 'var(--ink)' : 'transparent',
                        color: auditFilter === cat.key ? '#FFFFFF' : 'var(--text-3)',
                        border: 'none', cursor: 'pointer',
                      }}
                      onMouseEnter={e => { if (auditFilter !== cat.key) e.currentTarget.style.color = 'var(--text-2)'; }}
                      onMouseLeave={e => { if (auditFilter !== cat.key) e.currentTarget.style.color = 'var(--text-3)'; }}>
                      {cat.label}
                    </button>
                  ))}
                </div>
                <table className="w-full">
                  <thead>
                    <tr style={{ background: 'var(--inset)' }}>
                      <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)', padding: '8px 20px', textAlign: 'left' }}>Timestamp</th>
                      <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)', padding: '10px 16px', textAlign: 'left' }}>Action</th>
                      <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)', padding: '10px 16px', textAlign: 'left' }}>Entity</th>
                      <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)', padding: '10px 16px', textAlign: 'left' }}>Actor</th>
                      <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)', padding: '10px 16px', textAlign: 'left' }}>IP</th>
                      <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)', padding: '8px 20px', textAlign: 'left' }}>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAudit.map((e: any) => {
                      const actionColors: Record<string, string> = {
                        batch_completed: "var(--green)", payout_confirmed: "var(--green)",
                        login: "var(--blue)", batch_funded: "var(--blue)",
                      };
                      const color = actionColors[e.action] || "#6B7280";
                      return (
                        <tr key={e.id} className="transition-colors"
                          style={{ borderTop: '1px solid var(--line)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--inset)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '10px 20px', fontSize: 11, fontFamily: "'Geist Mono', ui-monospace, monospace", whiteSpace: 'nowrap', color: 'var(--text-2)' }}>
                            {e.createdAt ? timeAgo(e.createdAt) : "—"}
                          </td>
                          <td style={{ padding: '13px 16px' }}>
                            <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 99, background: `${color}18`, color }}>{e.action.replace(/_/g, " ")}</span>
                          </td>
                          <td style={{ padding: '13px 16px', fontSize: 12, fontFamily: "'Geist Mono', ui-monospace, monospace", color: 'var(--text-2)' }}>
                            {e.entityRef?.startsWith("BATCH-") ? (
                              <button onClick={() => { const b = (batches as any[]).find((x: any) => x.batchRef === e.entityRef); if (b) setSelectedId(b.id); }} title="Open batch detail"
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--blue)' }}
                                onMouseEnter={ev => ev.currentTarget.style.textDecoration = 'underline'} onMouseLeave={ev => ev.currentTarget.style.textDecoration = 'none'}>
                                {e.entityRef}
                              </button>
                            ) : (e.entityRef || "—")}
                          </td>
                          <td style={{ padding: '13px 16px', fontSize: 12, color: 'var(--text-2)' }}>{e.actor}</td>
                          <td style={{ padding: '13px 16px', fontSize: 11, fontFamily: "'Geist Mono', ui-monospace, monospace", color: 'var(--text-2)' }}>{e.ipAddress || "—"}</td>
                          <td style={{ padding: '10px 20px', fontSize: 12, color: 'var(--text-2)' }}>{e.detail}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {auditLoading ? (
                  <div style={{ padding: '40px 0', textAlign: 'center' }}>
                    <Loader2 className="w-6 h-6 mx-auto animate-spin" style={{ color: 'var(--text-faint)', marginBottom: 8 }} />
                    <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading audit trail…</p>
                  </div>
                ) : filteredAudit.length === 0 && (
                  <div style={{ padding: '40px 0', textAlign: 'center' }}>
                    <ClipboardList className="w-8 h-8 mx-auto" style={{ color: 'var(--text-faint)', marginBottom: 8 }} />
                    <p style={{ fontSize: 12, color: 'var(--text-3)' }}>No audit entries match this filter.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─ Settings page ─ */}
          {page === "settings" && (
            <div className="space-y-5">
              {/* User Accounts */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 26 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>User Accounts</h3>
                    <p style={{ fontSize: 12, color: 'var(--text-2)' }}>{usersData.length} user{usersData.length !== 1 ? "s" : ""} registered</p>
                  </div>
                  {currentUser?.role === "admin" && (
                    <button onClick={() => setShowAddUser(true)}
                      style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: 'var(--cta)', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>
                      <Plus className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Add User
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {usersData.map((user: any) => {
                    const isMe = currentUser?.email === user.email;
                    const initials = user.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
                    return (
                      <div key={user.id} className="flex items-center justify-between" style={{ padding: '12px 16px', borderRadius: 12, background: isMe ? 'var(--tint-blue)' : 'var(--inset)', border: `1px solid ${isMe ? 'var(--blue-line)' : 'var(--line)'}` }}>
                        <div className="flex items-center gap-3">
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: isMe ? 'var(--blue)' : user.status === "disabled" ? 'var(--text-faint)' : 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#FFFFFF' }}>
                            {initials}
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 500, color: user.status === "disabled" ? 'var(--text-4)' : 'var(--ink)' }}>
                              {user.name} {isMe && <span style={{ fontSize: 10, color: 'var(--blue)', fontWeight: 600, marginLeft: 4 }}>YOU</span>}
                              {user.status === "disabled" && <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 500, marginLeft: 4 }}>DISABLED</span>}
                            </p>
                            <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'Geist Mono', ui-monospace, monospace" }}>{user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {currentUser?.role === "admin" && !isMe && (
                            <select value={user.role} onChange={e => updateUserMut.mutate({ id: user.id, role: e.target.value })}
                              style={{ fontSize: 10, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer' }}>
                              <option value="admin">Admin</option>
                              <option value="approver">Approver</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          )}
                          {currentUser?.role !== "admin" && (
                            <span style={{
                              fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 4,
                              background: user.role === "admin" ? 'var(--tint-red)' : user.role === "approver" ? 'var(--tint-blue)' : 'var(--inset)',
                              color: user.role === "admin" ? 'var(--red)' : user.role === "approver" ? 'var(--blue)' : '#6B7280',
                            }}>{user.role === "admin" ? "Admin" : user.role === "approver" ? "Approver" : "Viewer"}</span>
                          )}
                          {currentUser?.role === "admin" && !isMe && (
                            <>
                              <button onClick={() => updateUserMut.mutate({ id: user.id, status: user.status === "disabled" ? "active" : "disabled" })}
                                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--line-strong)', background: 'var(--surface)', cursor: 'pointer', color: user.status === "disabled" ? 'var(--green)' : 'var(--amber)' }}>
                                {user.status === "disabled" ? "Enable" : "Disable"}
                              </button>
                              <button onClick={() => { if (window.confirm(`Delete user ${user.name}? This cannot be undone.`)) deleteUserMut.mutate(user.id); }}
                                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--red-line)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--red)' }}>
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--inset)', border: '1px solid var(--line)' }}>
                  <p style={{ fontSize: 11, color: 'var(--text-2)' }}>
                    <strong>Admin</strong> — Full access: create batches, manage users, approve, advance.<br/>
                    <strong>Approver</strong> — Can approve batches created by others and advance status.<br/>
                    <strong>Viewer</strong> — Read-only. Cannot create or modify batches.
                  </p>
                </div>
              </div>

              {/* Approval Controls */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 26 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Approval Controls</h3>
                <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 16 }}>Configure how batches are approved before they can be advanced through the settlement flow.</p>
                <div className="flex items-center justify-between" style={{ padding: '16px 20px', borderRadius: 12, background: dualApproval ? 'var(--tint-blue)' : 'var(--inset)', border: `1px solid ${dualApproval ? 'var(--blue-line)' : 'var(--line)'}` }}>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' }}>Dual Approval</p>
                    <p style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                      When enabled, batches must be approved by a user different from the creator before they can be advanced. This prevents single-person fraud.
                    </p>
                  </div>
                  <button onClick={() => { if (currentUser?.role === "admin") setDualApproval(!dualApproval); }}
                    style={{
                      width: 44, height: 24, borderRadius: 12, border: 'none', cursor: currentUser?.role === "admin" ? 'pointer' : 'not-allowed',
                      background: dualApproval ? 'var(--green)' : 'var(--text-faint)', position: 'relative', transition: 'background 0.2s',
                      opacity: currentUser?.role === "admin" ? 1 : 0.5,
                    }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', background: 'var(--surface)', position: 'absolute', top: 2,
                      left: dualApproval ? 22 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                </div>
                {currentUser?.role !== "admin" && (
                  <p style={{ fontSize: 10, color: 'var(--red)', marginTop: 8 }}>Only administrators can change approval settings.</p>
                )}
                <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'var(--tint-amber)', border: '1px solid var(--amber-line)' }}>
                  <p style={{ fontSize: 11, color: 'var(--amber-strong)' }}>
                    <strong>How it works:</strong> When a batch is created, it shows "Pending Approval" in the batch detail. A different user (Admin or Approver role) must click "Approve Batch" before the status can be advanced. The creator cannot approve their own batch.
                  </p>
                </div>
              </div>

              {/* Batch processing mode */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 26 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Batch Processing</h3>
                <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 16 }}>How a batch behaves once funds land in the collection account.</p>
                <div className="flex items-center justify-between" style={{ padding: '16px 20px', borderRadius: 12, background: autoProcess ? 'var(--tint-green)' : 'var(--inset)', border: `1px solid ${autoProcess ? 'var(--green-line)' : 'var(--line)'}` }}>
                  <div style={{ paddingRight: 16 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Auto-processing</p>
                    <p style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.5 }}>
                      When on, a funded batch runs straight through: fee deducted → converted at the live ECB rate → wallets screened → travel-rule data transmitted → USDC dispatched → completed. This matches production behaviour. Turn off to advance each stage manually (useful for walking someone through the flow).
                    </p>
                  </div>
                  <button onClick={() => setAutoProcess(!autoProcess)} aria-label="Toggle auto-processing"
                    style={{ width: 40, height: 22, borderRadius: 999, flexShrink: 0, border: 'none', cursor: 'pointer', background: autoProcess ? 'var(--green)' : 'var(--text-faint)', position: 'relative', transition: 'background 0.2s' }}>
                    <span style={{ position: 'absolute', top: 2, width: 18, height: 18, borderRadius: '50%', background: 'var(--surface)', left: autoProcess ? 20 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </button>
                </div>
                <p style={{ fontSize: 11, color: 'var(--amber-strong)', background: 'var(--tint-amber)', border: '1px solid var(--amber-line)', borderRadius: 8, padding: '10px 14px', marginTop: 12, lineHeight: 1.5 }}>
                  <strong>Note:</strong> approval still gates everything — an unapproved batch will not process past funding, in either mode. Blocked wallets always stop that payout only; the rest of the batch continues.
                </p>
              </div>

              {/* Password — demo only */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 26 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Demo Mode</h3>
                <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>This is a demo environment. All accounts share the password <code style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'var(--inset-2)', border: '1px solid var(--line)' }}>demo123</code></p>
                <p style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  To test dual approval: create a batch as Julija, sign out, sign in as Vaiva, then approve the batch.
                </p>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="text-center" style={{ paddingTop: 16, paddingBottom: 32 }}>
            <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>
              This dashboard is confidential. &copy; 2026 Fybrus.
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 6, letterSpacing: '0.04em' }}>
              Powered by <span style={{ fontWeight: 600, color: 'var(--cta)' }}>Fybrus</span>
              <span style={{ color: '#34D399', fontWeight: 600 }}>.</span>
            </p>
          </div>
        </main>
      </div>

      {/* ─ Upload dialog ─ */}
      <Overlay open={showUpload} onClose={() => { setShowUpload(false); setUploadErr(null); resetBatchOpts(); setUploadStep("idle"); setParsedRows([]); setCreatedBatch(null); }} wide={uploadStep === "preview" || uploadStep === "submitting" || uploadStep === "success"}>

        {/* ── Step 1: Upload form (idle) ── */}
        {uploadStep === "idle" && (<>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Upload Payout Batch</h3>
          <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 16 }}>Upload a CSV file with your merchant payouts for this settlement cycle.</p>

          {/* Currency + Timing */}
          <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 16, padding: 12, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--inset-2)' }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 6, color: 'var(--text-3)' }}>Funding Currency</label>
              <div className="flex gap-1.5">
                {(["EUR", "USD", "AUD"] as const).map(c => (
                  <button key={c} onClick={() => setBatchCurrency(c)}
                    className="flex-1 transition-all"
                    style={{
                      padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 500,
                      border: batchCurrency === c ? '1px solid var(--blue-line)' : '1px solid var(--line)',
                      background: batchCurrency === c ? 'var(--tint-blue)' : '#FFFFFF',
                      color: batchCurrency === c ? 'var(--blue)' : 'var(--text-3)',
                    }}>
                    {(CSYM as any)[c]} {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 6, color: 'var(--text-3)' }}>Payout Timing</label>
              <div className="flex gap-1.5">
                {[["asap", "ASAP"], ["scheduled", "Schedule"]].map(([val, label]) => (
                  <button key={val} onClick={() => setBatchTiming(val)}
                    className="flex-1 transition-all"
                    style={{
                      padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 500,
                      border: batchTiming === val ? '1px solid var(--blue-line)' : '1px solid var(--line)',
                      background: batchTiming === val ? 'var(--tint-blue)' : '#FFFFFF',
                      color: batchTiming === val ? 'var(--blue)' : 'var(--text-3)',
                    }}>
                    {label}
                  </button>
                ))}
              </div>
              {batchTiming === "scheduled" && (
                <input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)}
                  className="w-full outline-none"
                  style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, fontSize: 12, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--ink)'} onBlur={e => e.currentTarget.style.borderColor = 'var(--line-strong)'} />
              )}
            </div>
          </div>

          <div style={{ borderRadius: 12, padding: 12, marginBottom: 16, border: '1px solid var(--line)', background: 'var(--inset-2)' }}>
            <p style={{ fontSize: 11, fontWeight: 500, marginBottom: 8, color: 'var(--text-3)' }}>Required CSV columns:</p>
            <p style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 8 }}>A 9 bps (0.09%) platform fee is deducted from the batch total before conversion. Add an optional <code style={{ fontFamily: "'Geist Mono', ui-monospace, monospace" }}>currency</code> column and Fybrus auto-detects it, splitting the upload into one batch per currency.</p>
            <div className="flex gap-2">
              {["merchant_name", "amount", "wallet_address"].map(col => (
                <code key={col} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: 'var(--tint-blue)', color: 'var(--blue)' }}>{col}</code>
              ))}
            </div>
            <button onClick={downloadTemplate} className="flex items-center gap-1" style={{ fontSize: 11, marginTop: 8, color: 'var(--blue)' }}>
              <FileDown className="w-3 h-3" /> Download template CSV
            </button>
          </div>

          <div className="text-center cursor-pointer transition-colors"
            style={{ border: '2px dashed var(--line-strong)', borderRadius: 12, padding: 24, background: 'var(--surface)' }}
            onClick={() => fileRef.current?.click()}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--text-faint)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line-strong)'}>
            <Upload className="w-8 h-8 mx-auto" style={{ color: 'var(--text-faint)', marginBottom: 8 }} />
            <p style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' }}>Click to select CSV file</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Supports .csv files up to 10MB</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setUploadStep("loading"); parseCSV(f); } }} />
          </div>

          {/* Demo button */}
          <div className="flex items-center justify-center" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <button onClick={() => { setUploadStep("loading"); setParsedRows(demoRows); setTimeout(() => setUploadStep("preview"), 2200); }}
              className="flex items-center gap-2 transition-all"
              style={{ padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: '1px solid var(--line)', color: 'var(--text-2)', background: 'var(--surface)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink)'; e.currentTarget.style.color = 'var(--ink)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.color = 'var(--text-2)'; }}>
              <Eye className="w-3.5 h-3.5" /> Try Demo CSV
            </button>
          </div>

          {uploadErr && <div className="flex items-center gap-2" style={{ padding: 12, borderRadius: 8, marginTop: 12, background: 'var(--tint-red)' }}><AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#EF4444' }} /><p style={{ fontSize: 12, color: 'var(--red)' }}>{uploadErr}</p></div>}
        </>)}

        {/* ── Step 2: Loading ── */}
        {uploadStep === "loading" && (
          <div className="flex flex-col items-center justify-center" style={{ padding: '48px 0' }}>
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--ink)', marginBottom: 16 }} />
            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>Parsing CSV file...</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Validating {parsedRows.length || '...'} merchant records</p>
            <div style={{ width: 200, height: 4, borderRadius: 2, background: 'var(--track)', marginTop: 16, overflow: 'hidden' }}>
              <div style={{ width: '70%', height: '100%', borderRadius: 2, background: 'var(--cta)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
          </div>
        )}

        {/* ── Step 3: Approval preview (also shown during submitting) ── */}
        {(uploadStep === "preview" || uploadStep === "submitting") && (() => {
          const sym = (CSYM as any)[batchCurrency] || "€";
          const total = parsedRows.reduce((s, r) => s + r.amount, 0);
          const isDemo = parsedRows === demoRows;
          return (
            <>
              <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Review Batch</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{isDemo ? "Demo data — this will create a real batch with sample merchants." : "Review the parsed entries before creating this batch."}</p>
                </div>
                <span style={{ fontSize: 10, fontWeight: 500, padding: '4px 10px', borderRadius: 4, background: 'var(--tint-amber)', color: 'var(--amber)' }}>Pending Approval</span>
              </div>

              {/* Summary strip */}
              {(() => {
                const groups = new Map<string, { n: number; total: number }>();
                parsedRows.forEach(r => { const c = r.ccy || batchCurrency; const g = groups.get(c) || { n: 0, total: 0 }; g.n++; g.total += r.amount; groups.set(c, g); });
                if (groups.size <= 1) return null;
                return (
                  <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'var(--tint-green)', border: '1px solid var(--green-line)' }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)', marginBottom: 6 }}>Currencies auto-detected — {groups.size} batches will be created</p>
                    <div className="flex gap-2 flex-wrap">
                      {[...groups.entries()].map(([c, g]) => (
                        <span key={c} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--green-line)', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                          {c} · {(CSYM as any)[c] || ""}{g.total.toLocaleString("en", { minimumFractionDigits: 2 })} <span style={{ color: 'var(--text-4)', fontWeight: 400 }}>({g.n})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div className="grid grid-cols-4 gap-3" style={{ marginBottom: 20 }}>
                {[
                  { label: "Merchants", value: parsedRows.length.toString() },
                  { label: "Currency", value: new Set(parsedRows.map(r => r.ccy || batchCurrency)).size > 1 ? "Mixed (auto)" : (parsedRows[0]?.ccy || batchCurrency) },
                  { label: "Timing", value: batchTiming === "asap" ? "ASAP" : batchDate || "Scheduled" },
                  { label: "Total", value: new Set(parsedRows.map(r => r.ccy || batchCurrency)).size > 1 ? `${parsedRows.length} rows` : `${sym}${total.toLocaleString("en", { minimumFractionDigits: 2 })}` },
                ].map(s => (
                  <div key={s.label} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--inset-2)', border: '1px solid var(--line)' }}>
                    <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)' }}>{s.label}</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Per-merchant table */}
              <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
                <table className="w-full">
                  <thead>
                    <tr style={{ background: 'var(--inset)' }}>
                      {["#", "Merchant", "Amount", "Wallet Address", "Status"].map(h => (
                        <th key={h} style={{ padding: '8px 12px', fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)', textAlign: 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                        <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-3)' }}>{i + 1}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>{r.name}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                          {(CSYM as any)[r.ccy || batchCurrency] || ""}{r.amount.toLocaleString("en", { minimumFractionDigits: 2 })}
                          <span style={{ fontSize: 9, fontWeight: 600, marginLeft: 6, padding: '1px 6px', borderRadius: 999, background: 'var(--inset)', color: 'var(--text-3)' }}>{r.ccy || batchCurrency}</span>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 11, fontFamily: "'Geist Mono', ui-monospace, monospace", color: 'var(--text-2)' }}>{r.wallet.slice(0, 8)}...{r.wallet.slice(-4)}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 4, background: 'var(--tint-green)', color: 'var(--green)' }}>Valid</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {uploadErr && <div className="flex items-center gap-2" style={{ padding: 12, borderRadius: 8, marginBottom: 16, background: 'var(--tint-red)' }}><AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#EF4444' }} /><p style={{ fontSize: 12, color: 'var(--red)' }}>{uploadErr}</p></div>}

              {/* Actions */}
              <div className="flex items-center justify-between">
                <button onClick={() => { setUploadStep("idle"); setParsedRows([]); setUploadErr(null); }}
                  className="transition-all"
                  style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, color: 'var(--text-3)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--ink)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                  ← Back to Upload
                </button>
                <div className="flex gap-2">
                  <button onClick={() => { setShowUpload(false); setUploadStep("idle"); setParsedRows([]); setUploadErr(null); }}
                    className="transition-all"
                    style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, border: '1px solid var(--line)', color: 'var(--text-2)', background: 'var(--surface)', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--text-faint)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}>
                    Cancel
                  </button>
                  <button
                    disabled={uploadStep === "submitting"}
                    onClick={() => submitBatch(parsedRows)}
                    className="transition-all"
                    style={{ padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: uploadStep === "submitting" ? 'var(--text-2)' : 'var(--ink)', color: '#FFFFFF', cursor: uploadStep === "submitting" ? 'not-allowed' : 'pointer', border: 'none', display: 'flex', alignItems: 'center', gap: 8 }}
                    onMouseEnter={e => { if (uploadStep !== "submitting") e.currentTarget.style.background = 'var(--cta-hover)'; }} onMouseLeave={e => { if (uploadStep !== "submitting") e.currentTarget.style.background = 'var(--ink)'; }}>
                    {uploadStep === "submitting" && <Loader2 className="w-4 h-4 animate-spin" />}
                    {uploadStep === "submitting" ? "Creating…" : (new Set(parsedRows.map(r => r.ccy || batchCurrency)).size > 1 ? `Approve & Create ${new Set(parsedRows.map(r => r.ccy || batchCurrency)).size} Batches` : "Approve & Create Batch")}
                  </button>
                </div>
              </div>
            </>
          );
        })()}

        {/* ── Step 4: Success ── */}
        {uploadStep === "success" && createdBatch?.multi && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--tint-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle2 style={{ width: 24, height: 24, color: 'var(--green)' }} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{createdBatch.batches.length} Batches Created</h3>
            <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 18 }}>One batch per detected currency — each funds independently when its wire arrives.</p>
            <div style={{ textAlign: 'left', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', marginBottom: 18 }}>
              {createdBatch.batches.map((b: any, i: number) => {
                const acct = (accounts as any[]).find((a: any) => a.status !== 'closed' && a.currency === b.currency);
                return (
                  <div key={b.id} className="flex items-center justify-between gap-3" style={{ padding: '11px 14px', borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', fontFamily: "'Geist Mono', ui-monospace, monospace" }}>{b.batchRef} <span style={{ fontWeight: 500, fontFamily: 'Geist, sans-serif', color: 'var(--text-3)' }}>· {b.merchantCount} merchants</span></p>
                      <p style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 2 }}>{acct ? `wire to ${acct.iban} (${acct.bic})` : `no ${b.currency} collection account yet — open one on the Accounts page`}</p>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{(CSYM as any)[b.currency] || ""}{parseFloat(b.totalFiat || b.totalEur).toLocaleString("en", { minimumFractionDigits: 2 })} {b.currency}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center gap-2">
              <button onClick={() => { setShowUpload(false); setUploadStep("idle"); setParsedRows([]); setCreatedBatch(null); resetBatchOpts(); setPage("batches"); }}
                style={{ padding: '10px 22px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'var(--cta)', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>View batches</button>
              <button onClick={() => { setShowUpload(false); setUploadStep("idle"); setParsedRows([]); setCreatedBatch(null); resetBatchOpts(); }}
                style={{ padding: '10px 22px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--line-strong)', cursor: 'pointer' }}>Done</button>
            </div>
          </div>
        )}
        {uploadStep === "success" && createdBatch && !createdBatch.multi && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--tint-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle2 style={{ width: 24, height: 24, color: 'var(--green)' }} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Batch Created Successfully</h3>
            <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 20 }}>Your payout batch has been submitted and is awaiting funding.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24, textAlign: 'left' }}>
              <div style={{ padding: '12px', borderRadius: 8, background: 'var(--inset-2)', border: '1px solid var(--line)' }}>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-4)' }}>Batch Reference</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginTop: 4, fontFamily: "'Geist Mono', ui-monospace, monospace" }}>{createdBatch.batchRef}</p>
              </div>
              <div style={{ padding: '12px', borderRadius: 8, background: 'var(--inset-2)', border: '1px solid var(--line)' }}>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-4)' }}>Total Amount</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                  {(CSYM as any)[createdBatch.currency] || "€"}{parseFloat(createdBatch.totalFiat || createdBatch.totalEur).toLocaleString("en", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div style={{ padding: '12px', borderRadius: 8, background: 'var(--inset-2)', border: '1px solid var(--line)' }}>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-4)' }}>Merchants</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginTop: 4 }}>{createdBatch.merchantCount} payees</p>
              </div>
            </div>

            <div style={{ padding: 16, borderRadius: 12, background: 'var(--tint-amber)', border: '1px solid var(--amber-line)', marginBottom: 24, textAlign: 'left' }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--amber-strong)', marginBottom: 10 }}>Next Step: Fund this batch</p>
              <p style={{ fontSize: 11, color: 'var(--amber)', marginBottom: 12 }}>Transfer to the account below. Use your batch reference as the payment reference.</p>
              <div style={{ background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--amber-line)', padding: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: "Account Name", value: "Fybrus Client Funds" },
                    { label: "IBAN", value: "IE29 AIBK 9311 5212 3456 78" },
                    { label: "BIC / SWIFT", value: "AIBKIE2D" },
                    { label: "Bank", value: "AIB, Dublin" },
                    { label: "Payment Reference", value: createdBatch?.batchRef || "—" },
                    { label: "Amount", value: `${(CSYM as any)[createdBatch?.currency] || "€"}${parseFloat(createdBatch?.totalFiat || createdBatch?.totalEur || 0).toLocaleString("en", { minimumFractionDigits: 2 })} ${createdBatch?.currency || "EUR"}` },
                  ].map(r => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 10, color: 'var(--amber-strong)' }}>{r.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)', fontFamily: r.label === "IBAN" || r.label === "BIC / SWIFT" || r.label === "Payment Reference" ? 'monospace' : 'inherit' }}>{r.value}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => copyText("IE29AIBK93115212345678")}
                  className="flex items-center gap-1.5 w-full justify-center transition-colors"
                  style={{ marginTop: 10, padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 500, border: '1px solid var(--amber-line)', color: 'var(--amber-strong)', background: 'transparent', cursor: 'pointer' }}>
                  <Copy className="w-3 h-3" /> Copy IBAN to Clipboard
                </button>
              </div>
              <p style={{ fontSize: 10, color: 'var(--amber)', marginTop: 6 }}>Demo IBAN — replace with live details before production use</p>
            </div>

            <div className="flex justify-center gap-2">
              <button onClick={() => { setShowUpload(false); setUploadStep("idle"); setParsedRows([]); setCreatedBatch(null); resetBatchOpts(); setPage("batches"); }}
                style={{ padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'var(--cta)', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>
                View Batches
              </button>
              <button onClick={() => { setUploadStep("idle"); setParsedRows([]); setCreatedBatch(null); }}
                style={{ padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--line)', cursor: 'pointer' }}>
                Upload Another
              </button>
            </div>
          </div>
        )}

      </Overlay>

      {/* ─ Manual entry dialog ─ */}
      <Overlay open={showManual} onClose={() => { setShowManual(false); resetBatchOpts(); }} wide>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Manual Payout Entry</h3>
        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 16 }}>Add individual merchant payouts. These will be grouped into a single batch.</p>

        {/* Currency + Timing */}
        <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 16, padding: 12, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--inset-2)' }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 6, color: 'var(--text-3)' }}>Funding Currency</label>
            <div className="flex gap-1.5">
              {(["EUR", "USD", "AUD"] as const).map(c => (
                <button key={c} onClick={() => setBatchCurrency(c)}
                  className="flex-1 transition-all"
                  style={{
                    padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 500,
                    border: batchCurrency === c ? '1px solid var(--blue-line)' : '1px solid var(--line)',
                    background: batchCurrency === c ? 'var(--tint-blue)' : '#FFFFFF',
                    color: batchCurrency === c ? 'var(--blue)' : 'var(--text-3)',
                  }}>
                  {(CSYM as any)[c]} {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 6, color: 'var(--text-3)' }}>Payout Timing</label>
            <div className="flex gap-1.5">
              {[["asap", "ASAP"], ["scheduled", "Schedule"]].map(([val, label]) => (
                <button key={val} onClick={() => setBatchTiming(val)}
                  className="flex-1 transition-all"
                  style={{
                    padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 500,
                    border: batchTiming === val ? '1px solid var(--blue-line)' : '1px solid var(--line)',
                    background: batchTiming === val ? 'var(--tint-blue)' : '#FFFFFF',
                    color: batchTiming === val ? 'var(--blue)' : 'var(--text-3)',
                  }}>
                  {label}
                </button>
              ))}
            </div>
            {batchTiming === "scheduled" && (
              <input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)}
                className="w-full outline-none"
                style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, fontSize: 12, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--ink)'} onBlur={e => e.currentTarget.style.borderColor = 'var(--line-strong)'} />
            )}
          </div>
        </div>

        {/* Registered merchants autocomplete — picking a name auto-fills the registered wallet */}
        <datalist id="registered-merchants">
          {merchants.filter((m: any) => m.status !== "disabled").map((m: any) => (
            <option key={m.id} value={m.name}>{`${m.walletAddress.slice(0, 10)}…${m.walletAddress.slice(-4)}`}</option>
          ))}
        </datalist>
        <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
          {entries.map((e, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input placeholder="Merchant name" value={e.merchantName} list="registered-merchants"
                className="flex-1 outline-none"
                style={{ padding: '10px 12px', borderRadius: 8, fontSize: 13, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                onFocus={ev => ev.currentTarget.style.borderColor = 'var(--ink)'} onBlur={ev => ev.currentTarget.style.borderColor = 'var(--line-strong)'}
                onChange={ev => {
                  const u = [...entries]; u[i].merchantName = ev.target.value;
                  // Auto-fill the registered wallet when the name matches a registered merchant
                  const match = merchants.find((m: any) => m.name === ev.target.value && m.status !== "disabled");
                  if (match && !u[i].walletAddress) u[i].walletAddress = match.walletAddress;
                  setEntries(u);
                }} />
              <input placeholder={`${(CSYM as any)[batchCurrency]} Amount`} type="number" value={e.amount}
                className="w-28 outline-none"
                style={{ padding: '10px 12px', borderRadius: 8, fontSize: 13, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                onFocus={ev => ev.currentTarget.style.borderColor = 'var(--ink)'} onBlur={ev => ev.currentTarget.style.borderColor = 'var(--line-strong)'}
                onChange={ev => { const u = [...entries]; u[i].amount = ev.target.value; setEntries(u); }} />
              <div className="flex-[1.5] flex flex-col">
                <input placeholder="0x... wallet address" value={e.walletAddress}
                  className="w-full outline-none"
                  style={{ padding: '10px 12px', borderRadius: 8, fontSize: 12, fontFamily: "'Geist Mono', ui-monospace, monospace", border: `1px solid ${e.walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(e.walletAddress) ? 'var(--red)' : 'var(--line-strong)'}`, background: 'var(--surface)', color: 'var(--ink)' }}
                  onFocus={ev => ev.currentTarget.style.borderColor = 'var(--ink)'} onBlur={ev => ev.currentTarget.style.borderColor = e.walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(e.walletAddress) ? 'var(--red)' : 'var(--line-strong)'}
                  onChange={ev => { const u = [...entries]; u[i].walletAddress = ev.target.value; setEntries(u); }} />
                {e.walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(e.walletAddress) && (
                  <span style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }}>Invalid wallet address format (expected 0x + 40 hex chars)</span>
                )}
              </div>
              {entries.length > 1 && (
                <button style={{ color: 'var(--text-faint)' }} className="transition-colors"
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-faint)'}
                  onClick={() => setEntries(entries.filter((_, j) => j !== i))}
                  aria-label="Remove entry"><X className="w-4 h-4" /></button>
              )}
            </div>
          ))}
        </div>
        <button className="flex items-center gap-1 transition-colors" style={{ fontSize: 11, marginTop: 8, color: 'var(--text-3)' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-2)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
          onClick={() => setEntries([...entries, { merchantName: "", amount: "", walletAddress: "" }])}>
          <Plus className="w-3 h-3" /> Add another merchant
        </button>
        {entries.filter(e => e.amount).length > 0 && (
          <p style={{ fontSize: 12, marginTop: 8, color: 'var(--text-2)' }}>
            Batch total: <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{(CSYM as any)[batchCurrency]}{entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0).toLocaleString("en", { minimumFractionDigits: 2 })}</span>
            {" "}<span style={{ color: 'var(--text-4)' }}>· Platform fee (9 bps): {(CSYM as any)[batchCurrency]}{(entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0) * 0.0009).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — deducted before conversion</span>
            {" "}<span style={{ color: 'var(--text-3)' }}>{batchCurrency}</span>
            {batchTiming === "scheduled" && batchDate && <span style={{ color: 'var(--text-3)' }}> &middot; Scheduled: {new Date(batchDate).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}</span>}
          </p>
        )}
        <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
          <button onClick={() => { setShowManual(false); resetBatchOpts(); }}
            style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, color: 'var(--text-3)', background: 'transparent' }}>Cancel</button>
          <button className="disabled:opacity-40"
            style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'var(--cta)', color: '#FFFFFF' }}
            disabled={entries.some(e => !e.merchantName || !e.amount || !e.walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(e.walletAddress)) || manualMut.isPending}
            onClick={() => manualMut.mutate(entries)}>
            {manualMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1.5" />}Create Batch
          </button>
        </div>
        {manualMut.isError && <div className="flex items-center gap-2" style={{ padding: 12, borderRadius: 8, marginTop: 12, background: 'var(--tint-red)' }}><AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#EF4444' }} /><p style={{ fontSize: 12, color: 'var(--red)' }}>{(manualMut.error as Error)?.message || "Failed to create batch"}</p></div>}
      </Overlay>

      {/* ─ Add user dialog ─ */}
      <Overlay open={showAddUser} onClose={() => setShowAddUser(false)}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Add New User</h3>
        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 16 }}>Create a new user account for the Fybrus dashboard.</p>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Full Name</label>
            <input value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} placeholder="e.g. Jane Smith"
              className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line-strong)', fontSize: 13, color: 'var(--ink)' }} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Email</label>
            <input value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} placeholder="e.g. jane@fybrus.com"
              className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line-strong)', fontSize: 13, color: 'var(--ink)' }} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Role</label>
            <div className="flex gap-2">
              {(["admin", "approver", "viewer"] as const).map(r => (
                <button key={r} onClick={() => setNewUser({ ...newUser, role: r })}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, textTransform: 'capitalize' as const, cursor: 'pointer',
                    background: newUser.role === r ? 'var(--ink)' : '#FFFFFF', color: newUser.role === r ? '#FFFFFF' : 'var(--text-2)',
                    border: `1px solid ${newUser.role === r ? 'var(--ink)' : 'var(--line-strong)'}`,
                  }}>{r}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Password</label>
            <input value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })}
              className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line-strong)', fontSize: 13, color: 'var(--ink)' }} />
            <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>Default: demo123</p>
          </div>
        </div>
        {addUserMut.isError && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 8 }}>{(addUserMut.error as Error).message}</p>}
        <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
          <button onClick={() => setShowAddUser(false)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, color: 'var(--text-2)', background: 'transparent', border: '1px solid var(--line)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => addUserMut.mutate(newUser)}
            disabled={!newUser.name || !newUser.email || addUserMut.isPending}
            className="disabled:opacity-40"
            style={{ padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: 'var(--cta)', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>
            {addUserMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : null}Create User
          </button>
        </div>
      </Overlay>

      {/* ─ Edit merchant dialog ─ */}
      <Overlay open={!!editingMerchant} onClose={() => setEditingMerchant(null)}>
        {editingMerchant && (<>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Edit Merchant</h3>
          <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 16 }}>Update merchant details.</p>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Merchant Name</label>
              <input value={editingMerchant.name} onChange={e => setEditingMerchant({ ...editingMerchant, name: e.target.value })}
                className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line-strong)', fontSize: 13, color: 'var(--ink)' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Wallet Address</label>
              <input value={editingMerchant.walletAddress} onChange={e => setEditingMerchant({ ...editingMerchant, walletAddress: e.target.value })}
                className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line-strong)', fontSize: 12, color: 'var(--ink)', fontFamily: "'Geist Mono', ui-monospace, monospace" }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Email (optional)</label>
              <input value={editingMerchant.email || ""} onChange={e => setEditingMerchant({ ...editingMerchant, email: e.target.value })}
                className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line-strong)', fontSize: 13, color: 'var(--ink)' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>KYC Reference (relying party case #)</label>
              <input value={editingMerchant.kycRef || ""} onChange={e => setEditingMerchant({ ...editingMerchant, kycRef: e.target.value })}
                placeholder="e.g. PSX-KYC-4F2A91"
                className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line-strong)', fontSize: 12, color: 'var(--ink)', fontFamily: "'Geist Mono', ui-monospace, monospace" }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Markup (bps)</label>
                <input type="number" min={0} max={1000} value={editingMerchant.markupBps ?? ""} onChange={e => setEditingMerchant({ ...editingMerchant, markupBps: e.target.value })}
                  placeholder={`default (${settings?.defaultMarkupBps ?? 25})`}
                  className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line-strong)', fontSize: 13, fontFamily: "'Geist Mono', ui-monospace, monospace", color: 'var(--ink)' }} />
                <span style={{ fontSize: 9, color: 'var(--text-4)' }}>blank = use platform default</span>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Payout method</label>
                <div className="flex gap-1.5">
                  {[["stablecoin", "Stablecoin"], ["fiat", "Fiat"]].map(([v, l]) => (
                    <button key={v} onClick={() => setEditingMerchant({ ...editingMerchant, payoutMethod: v })}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                        border: '1px solid ' + ((editingMerchant.payoutMethod || 'stablecoin') === v ? 'var(--ink)' : 'var(--line-strong)'),
                        background: (editingMerchant.payoutMethod || 'stablecoin') === v ? 'var(--ink)' : '#FFFFFF',
                        color: (editingMerchant.payoutMethod || 'stablecoin') === v ? '#FFFFFF' : 'var(--text-2)' }}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {updateMerchantMut.isError && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 8 }}>{(updateMerchantMut.error as Error).message}</p>}
          <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
            <button onClick={() => setEditingMerchant(null)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, color: 'var(--text-2)', background: 'transparent', border: '1px solid var(--line)', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => updateMerchantMut.mutate({ id: editingMerchant.id, name: editingMerchant.name, walletAddress: editingMerchant.walletAddress, email: editingMerchant.email, kycRef: editingMerchant.kycRef, markupBps: editingMerchant.markupBps === "" ? null : editingMerchant.markupBps, payoutMethod: editingMerchant.payoutMethod })}
              disabled={!editingMerchant.name || !editingMerchant.walletAddress || updateMerchantMut.isPending}
              className="disabled:opacity-40"
              style={{ padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: 'var(--cta)', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>
              {updateMerchantMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : null}Save Changes
            </button>
          </div>
        </>)}
      </Overlay>

      {/* ─ Add merchant dialog ─ */}
      <Overlay open={showAddMerchant} onClose={() => setShowAddMerchant(false)}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Register Merchant</h3>
        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 16 }}>Register a merchant's stablecoin wallet address. This only needs to be done once per merchant.</p>
        <div className="space-y-3">
          <div>
            <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', display: 'block', marginBottom: 4, color: 'var(--text-3)', textTransform: 'uppercase' as const }}>Merchant Name</label>
            <input value={newMerchant.name} onChange={e => setNewMerchant({ ...newMerchant, name: e.target.value })}
              placeholder="e.g. TechFlow Solutions"
              className="w-full outline-none"
              style={{ padding: '10px 12px', borderRadius: 8, fontSize: 13, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--ink)'} onBlur={e => e.currentTarget.style.borderColor = 'var(--line-strong)'} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', display: 'block', marginBottom: 4, color: 'var(--text-3)', textTransform: 'uppercase' as const }}>Wallet Address</label>
            <input value={newMerchant.walletAddress} onChange={e => setNewMerchant({ ...newMerchant, walletAddress: e.target.value })}
              placeholder="0x..."
              className="w-full outline-none"
              style={{ padding: '10px 12px', borderRadius: 8, fontSize: 13, fontFamily: "'Geist Mono', ui-monospace, monospace", border: `1px solid ${newMerchant.walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(newMerchant.walletAddress) ? 'var(--red)' : 'var(--line-strong)'}`, background: 'var(--surface)', color: 'var(--ink)' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--ink)'} onBlur={e => e.currentTarget.style.borderColor = newMerchant.walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(newMerchant.walletAddress) ? 'var(--red)' : 'var(--line-strong)'} />
            {newMerchant.walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(newMerchant.walletAddress) && (
              <span style={{ fontSize: 10, color: 'var(--red)', marginTop: 4, display: 'block' }}>Invalid wallet address format (expected 0x + 40 hex chars)</span>
            )}
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', display: 'block', marginBottom: 4, color: 'var(--text-3)', textTransform: 'uppercase' as const }}>Email (optional)</label>
            <input value={newMerchant.email} onChange={e => setNewMerchant({ ...newMerchant, email: e.target.value })}
              placeholder="finance@merchant.com"
              className="w-full outline-none"
              style={{ padding: '10px 12px', borderRadius: 8, fontSize: 13, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--ink)'} onBlur={e => e.currentTarget.style.borderColor = 'var(--line-strong)'} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', display: 'block', marginBottom: 4, color: 'var(--text-3)', textTransform: 'uppercase' as const }}>KYC Reference (relying party case #)</label>
            <input value={newMerchant.kycRef} onChange={e => setNewMerchant({ ...newMerchant, kycRef: e.target.value })}
              placeholder="e.g. PSX-KYC-4F2A91"
              className="w-full outline-none"
              style={{ padding: '10px 12px', borderRadius: 8, fontSize: 13, fontFamily: "'Geist Mono', ui-monospace, monospace", border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--ink)'} onBlur={e => e.currentTarget.style.borderColor = 'var(--line-strong)'} />
            <span style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 4, display: 'block' }}>KYC is performed by the relying party (your acquirer) — record their case reference here.</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', display: 'block', marginBottom: 4, color: 'var(--text-3)', textTransform: 'uppercase' as const }}>Markup (bps)</label>
              <input type="number" min={0} max={1000} value={newMerchant.markupBps} onChange={e => setNewMerchant({ ...newMerchant, markupBps: e.target.value })}
                placeholder={`default (${settings?.defaultMarkupBps ?? 25})`}
                className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, fontSize: 13, fontFamily: "'Geist Mono', ui-monospace, monospace", border: '1px solid var(--line-strong)', color: 'var(--ink)' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', display: 'block', marginBottom: 4, color: 'var(--text-3)', textTransform: 'uppercase' as const }}>Payout method</label>
              <div className="flex gap-1.5">
                {[["stablecoin", "Stablecoin"], ["fiat", "Fiat"]].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setNewMerchant({ ...newMerchant, payoutMethod: v })}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      border: '1px solid ' + (newMerchant.payoutMethod === v ? 'var(--ink)' : 'var(--line-strong)'),
                      background: newMerchant.payoutMethod === v ? 'var(--ink)' : '#FFFFFF',
                      color: newMerchant.payoutMethod === v ? '#FFFFFF' : 'var(--text-2)' }}>{l}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2" style={{ marginTop: 20 }}>
          <button onClick={() => setShowAddMerchant(false)}
            style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, color: 'var(--text-3)', background: 'transparent' }}>Cancel</button>
          <button className="disabled:opacity-40"
            style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'var(--cta)', color: '#FFFFFF' }}
            disabled={!newMerchant.name || !newMerchant.walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(newMerchant.walletAddress) || addMerchantMut.isPending}
            onClick={() => addMerchantMut.mutate(newMerchant)}>
            {addMerchantMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1.5" />}Register Merchant
          </button>
        </div>
      </Overlay>

      {/* ─ Open collection account dialog ─ */}
      <Overlay open={showOpenAccount} onClose={() => setShowOpenAccount(false)}>
        {!openedAccount && (<>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Open a collection account</h3>
          <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 16 }}>Choose the currency — the account details are issued instantly. Funds sent to this account fund your payout batches in that currency.</p>
          <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 6 }}>Currency</label>
          <div className="grid grid-cols-3 gap-2" style={{ marginBottom: 16 }}>
            {["EUR", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "USD", "AUD", "AED"].map(c => (
              <button key={c} onClick={() => setNewAccountCcy(c)}
                style={{ padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: '1px solid ' + (newAccountCcy === c ? 'var(--ink)' : 'var(--line-strong)'),
                  background: newAccountCcy === c ? 'var(--ink)' : '#FFFFFF',
                  color: newAccountCcy === c ? '#FFFFFF' : 'var(--text-2)' }}>{c}</button>
            ))}
          </div>
          <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Label (optional)</label>
          <input value={newAccountLabel} onChange={e => setNewAccountLabel(e.target.value)} placeholder="e.g. Main EUR collections"
            className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line-strong)', fontSize: 13, color: 'var(--ink)', marginBottom: 8 }} />
          {openAccountMut.isError && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{(openAccountMut.error as Error).message}</p>}
          <div className="flex justify-end gap-2" style={{ marginTop: 14 }}>
            <button onClick={() => setShowOpenAccount(false)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, color: 'var(--text-2)', background: 'transparent', border: '1px solid var(--line)', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => openAccountMut.mutate()} disabled={openAccountMut.isPending}
              className="disabled:opacity-40"
              style={{ padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: 'var(--cta)', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>
              {openAccountMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : null}Open {newAccountCcy} account
            </button>
          </div>
        </>)}
        {openedAccount && (<>
          <div style={{ textAlign: 'center', padding: '10px 0 4px' }}>
            <CheckCircle2 className="w-10 h-10 mx-auto" style={{ color: 'var(--green)', marginBottom: 10 }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{openedAccount.currency} account opened</h3>
            <p style={{ fontSize: 15, fontFamily: "'Geist Mono', ui-monospace, monospace", color: 'var(--ink)', marginTop: 12, fontWeight: 500 }}>{openedAccount.iban}</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>BIC {openedAccount.bic} · {openedAccount.bankName}</p>
            <div className="flex justify-center gap-2" style={{ marginTop: 16 }}>
              <button onClick={() => copyText(openedAccount.iban.replace(/ /g, ""))}
                style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, color: 'var(--text-2)', background: 'var(--surface)', border: '1px solid var(--line-strong)', cursor: 'pointer' }}>Copy IBAN</button>
              <button onClick={() => { setShowOpenAccount(false); setOpenedAccount(null); }}
                style={{ padding: '8px 24px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: 'var(--cta)', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>Done</button>
            </div>
          </div>
        </>)}
      </Overlay>

      {/* ─ Fybrus Customer Care dialog ─ */}
      <Overlay open={!!careTarget} onClose={() => { setCareTarget(null); setCareTicket(null); }}>
        {careTarget && !careTicket && (<>
          <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
            <LifeBuoy style={{ width: 16, height: 16, color: 'var(--blue)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Fybrus Customer Care</h3>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 14 }}>Describe what you need — the alert context is attached automatically. Typical first reply: within 2 business hours.</p>
          <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--text-2)', background: 'var(--inset)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
            <strong>Attached context:</strong> {careTarget.reason}{careTarget.batchRef ? ` (${careTarget.batchRef})` : ""}
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Subject</label>
              <input value={careSubject} onChange={e => setCareSubject(e.target.value)}
                className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line-strong)', fontSize: 13, color: 'var(--ink)' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Message</label>
              <textarea value={careMessage} onChange={e => setCareMessage(e.target.value)} rows={4}
                placeholder="e.g. We believe this wallet was flagged in error — the merchant has been settled to this address since March."
                className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line-strong)', fontSize: 13, color: 'var(--ink)', resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
          </div>
          {careMut.isError && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 8 }}>{(careMut.error as Error).message}</p>}
          <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
            <button onClick={() => setCareTarget(null)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, color: 'var(--text-2)', background: 'transparent', border: '1px solid var(--line)', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => careMut.mutate()} disabled={!careSubject || careMut.isPending}
              className="disabled:opacity-40"
              style={{ padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: 'var(--blue)', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>
              {careMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : null}Open ticket
            </button>
          </div>
        </>)}
        {careTicket && (<>
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <CheckCircle2 className="w-10 h-10 mx-auto" style={{ color: 'var(--green)', marginBottom: 10 }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Ticket opened</h3>
            <p style={{ fontSize: 13, fontFamily: "'Geist Mono', ui-monospace, monospace", color: 'var(--blue)', marginTop: 6, fontWeight: 500 }}>{careTicket.ticketRef}</p>
            <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 10, lineHeight: 1.6 }}>
              Fybrus Customer Care has your alert context and typically replies within 2 business hours.<br />You can track this under “Open tickets” on the Alerts page.
            </p>
            <button onClick={() => { setCareTarget(null); setCareTicket(null); }}
              style={{ marginTop: 16, padding: '8px 24px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: 'var(--cta)', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>Done</button>
          </div>
        </>)}
      </Overlay>

      {/* ─ Batch detail dialog ─ */}
      <Overlay open={!!selectedId} onClose={() => setSelectedId(null)} wide>
        {!detail?.batch && <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-faint)' }} /></div>}
        {detail?.batch && (
          <>
            <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Batch {detail.batch.batchRef}</h3>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                  {detail.batch.merchantCount} merchants &middot; {detail.batch.currency || "EUR"} &middot;{" "}
                  {detail.batch.payoutTiming === "scheduled" && detail.batch.scheduledDate
                    ? `Scheduled ${new Date(detail.batch.scheduledDate).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}`
                    : "ASAP"
                  } &middot; Created {timeAgo(detail.batch.createdAt)}
                </p>
              </div>
              <Badge status={detail.batch.status} />
            </div>

            <div className="grid grid-cols-4 gap-4" style={{ marginBottom: 16 }}>
              <div style={{ borderRadius: 12, padding: 12, border: '1px solid var(--line)', background: 'var(--inset)' }}>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)' }}>{detail.batch.currency || "EUR"} Total</p>
                <p style={{ fontSize: 18, fontWeight: 600, fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: '-0.03em', color: 'var(--ink)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{(CSYM as any)[detail.batch.currency as string] || "€"}{parseFloat(detail.batch.totalFiat || detail.batch.totalEur).toLocaleString("en", { minimumFractionDigits: 2 })}</p>
              </div>
              <div style={{ borderRadius: 12, padding: 12, border: '1px solid var(--line)', background: 'var(--inset)' }}>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)' }}>USDC Total</p>
                <p style={{ fontSize: 18, fontWeight: 600, fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: '-0.03em', marginTop: 2, fontVariantNumeric: 'tabular-nums', color: detail.batch.totalUsdc ? 'var(--ink)' : 'var(--text-faint)' }}>
                  {detail.batch.totalUsdc ? `$${parseFloat(detail.batch.totalUsdc).toLocaleString("en", { minimumFractionDigits: 2 })}` : "Pending conversion"}
                </p>
              </div>
              <div style={{ borderRadius: 12, padding: 12, border: '1px solid var(--line)', background: 'var(--inset)' }}>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)' }}>FX Rate</p>
                <p style={{ fontSize: 18, fontWeight: 600, fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: '-0.03em', marginTop: 2, color: detail.batch.exchangeRate ? 'var(--text-2)' : 'var(--text-faint)' }}>
                  {detail.batch.exchangeRate ? parseFloat(detail.batch.exchangeRate).toFixed(4) : "—"}
                </p>
              </div>
              <div title="Fybrus fee (9 bps) + acquirer markup, both deducted from the fiat before conversion. The markup is owed back to the acquirer." style={{ borderRadius: 12, padding: 12, border: '1px solid var(--line)', background: 'var(--inset)' }}>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)' }}>Fees</p>
                <p style={{ fontSize: 18, fontWeight: 600, fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: '-0.03em', marginTop: 2, color: detail.batch.feeBps ? 'var(--ink)' : 'var(--text-faint)' }}>
                  {detail.batch.feeBps ? `${(CSYM as any)[detail.batch.currency as string] || "€"}${(parseFloat(detail.batch.feeAmount || "0") + parseFloat(detail.batch.markupTotal || "0")).toLocaleString("en", { minimumFractionDigits: 2 })}` : "—"}
                </p>
                {detail.batch.feeBps
                  ? <p style={{ fontSize: 9, color: 'var(--text-4)', marginTop: 2, lineHeight: 1.4 }}>Fybrus €{parseFloat(detail.batch.feeAmount || "0").toLocaleString("en", { minimumFractionDigits: 2 })} · Acquirer markup <span style={{ color: 'var(--green)' }}>€{parseFloat(detail.batch.markupTotal || "0").toLocaleString("en", { minimumFractionDigits: 2 })}</span></p>
                  : <p style={{ fontSize: 9, color: 'var(--text-4)', marginTop: 2 }}>no fee on this batch</p>}
              </div>
            </div>

            {/* Stage explainer — what is happening / what happens next */}
            <p style={{ fontSize: 11, lineHeight: 1.55, color: 'var(--text-3)', margin: '0 0 14px', padding: '8px 12px', borderRadius: 8, background: 'var(--inset-2)', border: '1px solid var(--line)' }}>
              {({
                pending: "Awaiting funding — processing starts when the fiat lands in the collection IBAN. In production Banking Circle notifies the platform automatically; in this demo, click “Simulate incoming settlement”.",
                funded: "Fiat received. Next: the platform fee is deducted and the balance converts to USDC at the live ECB rate. " + (autoProcess ? "Auto-processing is on — this normally continues automatically." : "Auto-processing is off — advance each stage manually, or run to completion."),
                converting: "Converting to USDC at the live ECB reference rate (platform fee already deducted).",
                sending: "Dispatching on-chain. Every destination wallet is sanctions-screened and travel-rule data is transmitted before any USDC moves — flagged wallets are blocked while the rest of the batch continues.",
                completed: "All dispatched payouts are confirmed on-chain. Any blocked or failed payouts remain listed below with the reason — they are never silently dropped.",
                failed: "Batch failed — no payouts were dispatched. Funds remain in the collection account.",
              } as Record<string, string>)[detail.batch.status] || ""}
            </p>

            {/* Dual Approval Banner */}
            {dualApproval && detail.batch.status !== "completed" && detail.batch.status !== "failed" && !detail.batch.approvedBy && (
              <div style={{ padding: 12, borderRadius: 8, background: 'var(--tint-blue)', border: '1px solid var(--blue-line)', marginBottom: 12 }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--blue)' }}>Dual Approval Required</p>
                    <p style={{ fontSize: 11, color: 'var(--blue)', marginTop: 2 }}>
                      Created by <strong>{detail.batch.createdBy || "unknown"}</strong> — needs approval from a different user before advancing.
                    </p>
                  </div>
                  {currentUser?.email !== detail.batch.createdBy && (currentUser?.role === "admin" || currentUser?.role === "approver") ? (
                    <button onClick={() => approveMut.mutate(detail.batch.id)}
                      className="flex items-center gap-1.5 disabled:opacity-40"
                      disabled={approveMut.isPending}
                      style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 500, background: 'var(--blue)', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>
                      {approveMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      Approve Batch
                    </button>
                  ) : currentUser?.email === detail.batch.createdBy ? (
                    <span style={{ fontSize: 10, color: '#6B7280', fontStyle: 'italic' }}>You created this batch — another user must approve</span>
                  ) : (
                    <span style={{ fontSize: 10, color: '#6B7280', fontStyle: 'italic' }}>Only admin/approver roles can approve</span>
                  )}
                </div>
                {approveMut.isError && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{(approveMut.error as Error).message}</p>}
              </div>
            )}
            {detail.batch.approvedBy && (
              <div style={{ padding: 8, borderRadius: 8, background: 'var(--tint-green)', border: '1px solid var(--green-line)', marginBottom: 12 }} className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
                <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 500 }}>
                  Approved by {detail.batch.approvedBy} {detail.batch.approvedAt ? `on ${new Date(detail.batch.approvedAt).toLocaleDateString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
              <Steps current={detail.batch.status} />
              {detail.batch.status !== "completed" && detail.batch.status !== "failed" && (
                <div className="flex items-center gap-2">
                  <button
                    className="flex items-center gap-1.5 transition-colors disabled:opacity-40"
                    style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 500, background: 'transparent', color: 'var(--red)', border: '1px solid var(--red-line)', cursor: 'pointer' }}
                    disabled={advanceStatusMut.isPending}
                    onClick={() => { if (window.confirm(`Mark batch ${detail.batch.batchRef} as FAILED? This cannot be undone.`)) advanceStatusMut.mutate({ id: detail.batch.id, status: "failed" }); }}>
                    <AlertCircle className="w-3 h-3" /> Mark Failed
                  </button>
                  {(() => {
                    const idx = STATUS_FLOW.indexOf(detail.batch.status);
                    const next = STATUS_FLOW[idx + 1];
                    if (!next) return null;
                    const nextLabel = SC[next]?.label || next;
                    const needsApproval = dualApproval && !detail.batch.approvedBy;
                    // Funding comes from the bank rail (Banking Circle webhook), never a manual
                    // status flip — the demo trigger posts the same webhook the bank would.
                    if (next === "funded") {
                      return (
                        <button
                          className="flex items-center gap-1.5 disabled:opacity-40"
                          style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: needsApproval ? '#9CA3AF' : 'var(--blue)', color: '#FFFFFF', border: 'none', cursor: needsApproval ? 'not-allowed' : 'pointer' }}
                          disabled={simulateSettlementMut.isPending || needsApproval || currentUser?.role === "viewer"}
                          title={needsApproval ? "Batch must be approved before funding" : currentUser?.role === "viewer" ? "Viewers cannot trigger settlement" : "Posts the same webhook Banking Circle sends when fiat lands"}
                          onClick={() => { if (window.confirm(`Simulate incoming fiat settlement for ${detail.batch.batchRef}? (In production, Banking Circle sends this webhook when funds land.)`)) simulateSettlementMut.mutate(detail.batch.batchRef); }}>
                          {simulateSettlementMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Banknote className="w-3 h-3" />}
                          Demo: Simulate incoming settlement
                        </button>
                      );
                    }
                    return (
                      <button
                        className="flex items-center gap-1.5 disabled:opacity-40"
                        style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: needsApproval ? '#9CA3AF' : 'var(--green)', color: '#FFFFFF', border: 'none', cursor: needsApproval ? 'not-allowed' : 'pointer' }}
                        disabled={advanceStatusMut.isPending || needsApproval || currentUser?.role === "viewer"}
                        title={needsApproval ? "Batch must be approved before advancing" : currentUser?.role === "viewer" ? "Viewers cannot advance batches" : ""}
                        onClick={() => { if (window.confirm(`Advance batch ${detail.batch.batchRef} to "${nextLabel}"? This cannot be undone.`)) advanceStatusMut.mutate({ id: detail.batch.id, status: next }); }}>
                        {advanceStatusMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowUpRight className="w-3 h-3" />}
                        Advance → {nextLabel}
                      </button>
                    );
                  })()}
                </div>
              )}
              {detail.batch.status === "failed" && (
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--red)', padding: '4px 10px', borderRadius: 6, background: 'var(--tint-red)' }}>Batch Failed</span>
              )}
              {(detail.batch.status === "funded" || detail.batch.status === "converting") && currentUser?.role !== "viewer" && (
                <button
                  className="flex items-center gap-1.5 disabled:opacity-40"
                  style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: 'var(--cta)', color: '#FFFFFF', border: 'none', cursor: 'pointer', marginLeft: 8 }}
                  disabled={processBatchMut.isPending}
                  title="Runs the remaining stages in order: conversion → compliance checks → dispatch → completion"
                  onClick={() => processBatchMut.mutate({ id: detail.batch.id, from: detail.batch.status })}>
                  {processBatchMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  Run to completion
                </button>
              )}
              {(detail.batch.status === "sending" || detail.batch.status === "failed") &&
                detail.payouts?.some((r: any) => r.payout.status === "failed") && currentUser?.role !== "viewer" && (
                <button
                  className="flex items-center gap-1.5 disabled:opacity-40"
                  style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 500, background: 'var(--surface)', color: 'var(--amber-strong)', border: '1px solid var(--amber-line)', cursor: 'pointer', marginLeft: 8 }}
                  disabled={retryFailedMut.isPending}
                  title="Re-runs wallet screening + travel rule + settlement for failed payouts only"
                  onClick={() => retryFailedMut.mutate(detail.batch.id)}>
                  {retryFailedMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Retry failed payouts ({detail.payouts.filter((r: any) => r.payout.status === "failed").length})
                </button>
              )}
            </div>

            <h4 style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 8 }}>Per-Merchant Breakdown</h4>
            <div style={{ borderRadius: 12, overflowX: 'auto', border: '1px solid var(--line)', background: 'var(--surface)' }}>
              <table className="w-full" style={{ minWidth: 760 }}>
                <thead>
                  <tr style={{ background: 'var(--inset)', borderBottom: '1px solid var(--line)' }}>
                    <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)', padding: '10px 16px', textAlign: 'left' }}>Merchant</th>
                    <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)', padding: '10px 12px', textAlign: 'right' }}>{detail.batch.currency || "EUR"}</th>
                    <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)', padding: '10px 12px', textAlign: 'right' }}>USDC</th>
                    <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)', padding: '10px 12px', textAlign: 'left' }}>Wallet</th>
                    <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)', padding: '10px 12px', textAlign: 'center' }}>Status</th>
                    <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)', padding: '10px 12px', textAlign: 'left' }}>Confirmed</th>
                    <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)', padding: '10px 12px', textAlign: 'left' }}>TX Hash</th>
                    <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-4)', padding: '10px 12px', textAlign: 'left' }}>Travel Rule</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.payouts?.map((r: any) => (
                    <tr key={r.payout.id} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '13px 16px', fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>
                        {r.merchant?.name}
                        <span title={(r.payout.payoutMethod === 'fiat') ? 'Paid in fiat (USDC off-ramped)' : 'Paid in USDC'} style={{ marginLeft: 6, fontSize: 9, fontWeight: 500, padding: '1px 6px', borderRadius: 999, background: r.payout.payoutMethod === 'fiat' ? 'var(--tint-blue)' : 'var(--tint-green)', color: r.payout.payoutMethod === 'fiat' ? 'var(--blue)' : 'var(--green)' }}>{r.payout.payoutMethod === 'fiat' ? 'FIAT' : 'USDC'}</span>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, textAlign: 'right', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{CSYM[detail.batch.currency] || "€"}{parseFloat(r.payout.fiatAmount || r.payout.eurAmount).toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                      <td title={r.payout.payoutMethod === 'fiat' && r.payout.payoutFiatAmount ? `Off-ramped to ${CSYM[detail.batch.currency] || '€'}${parseFloat(r.payout.payoutFiatAmount).toLocaleString('en',{minimumFractionDigits:2})} at ${r.payout.offRampRate}` : ''} style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.payout.usdcAmount ? 'var(--ink)' : 'var(--text-faint)' }}>
                        {r.payout.payoutMethod === 'fiat' && r.payout.payoutFiatAmount
                          ? <span>{CSYM[detail.batch.currency] || "€"}{parseFloat(r.payout.payoutFiatAmount).toLocaleString("en", { minimumFractionDigits: 2 })}<span style={{ fontSize: 9, color: 'var(--text-4)', fontWeight: 400, display: 'block' }}>via ${parseFloat(r.payout.usdcAmount || "0").toLocaleString("en", { maximumFractionDigits: 0 })} USDC</span></span>
                          : (r.payout.usdcAmount ? `$${parseFloat(r.payout.usdcAmount).toLocaleString("en", { minimumFractionDigits: 2 })}` : "—")}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div className="flex items-center gap-1">
                          <span style={{ fontSize: 11, fontFamily: "'Geist Mono', ui-monospace, monospace", color: 'var(--text-2)' }}>{r.payout.walletAddress.slice(0, 8)}...{r.payout.walletAddress.slice(-4)}</span>
                          <button style={{ color: 'var(--text-faint)' }} onClick={() => copyText(r.payout.walletAddress)}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-2)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-faint)'}
                            aria-label="Copy wallet address"><Copy className="w-2.5 h-2.5" /></button>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <Badge status={r.payout.status} />
                        {r.payout.status === "failed" && (
                          <p style={{ fontSize: 10, lineHeight: 1.4, color: 'var(--red)', marginTop: 4, maxWidth: 220, textAlign: 'left' }}>
                            {r.payout.failureReason || "Failed before reasons were recorded on this ledger."}
                          </p>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                        {r.payout.confirmedAt ? new Date(r.payout.confirmedAt).toLocaleDateString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {r.payout.txHash ? (
                          <div className="flex items-center gap-1">
                            <span style={{ fontSize: 11, fontFamily: "'Geist Mono', ui-monospace, monospace", color: 'var(--text-2)' }}>{r.payout.txHash.slice(0, 10)}...</span>
                            <button style={{ color: 'var(--text-faint)' }} onClick={() => copyText(r.payout.txHash)}
                              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-2)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-faint)'}
                              aria-label="Copy transaction hash"><Copy className="w-2.5 h-2.5" /></button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        {r.payout.travelRuleStatus === "transmitted" ? (
                          <span title={r.payout.travelRuleData ? `Transmitted ${r.payout.travelRuleAt ? new Date(r.payout.travelRuleAt).toLocaleString() : ""}\n${(() => { try { const d = JSON.parse(r.payout.travelRuleData); return `Originator: ${d.originator?.name} (${d.originator?.country})\nBeneficiary: ${d.beneficiary?.name}`; } catch { return ""; } })()}` : "Transmitted"}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 999, background: 'var(--tint-green)', color: 'var(--green)', fontFamily: "'Geist Mono', ui-monospace, monospace" }}>
                            <ShieldCheck style={{ width: 11, height: 11 }} /> {r.payout.travelRuleRef}
                          </span>
                        ) : r.payout.travelRuleStatus === "failed" ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 999, background: 'var(--tint-red)', color: 'var(--red)' }}>
                            <AlertCircle style={{ width: 11, height: 11 }} /> Failed
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Overlay>
    </div>
  );
}
