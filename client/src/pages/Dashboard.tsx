import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload, FileText, CheckCircle2, Clock, AlertCircle, Download,
  Plus, RefreshCw, Users, DollarSign, ArrowUpRight, Loader2, X,
  LogOut, Search, Copy, ExternalLink, Banknote, ArrowDown, Shield,
  UserPlus, FileDown, ClipboardList, BarChart3, Activity, TrendingUp,
  ShieldCheck, Timer, Hash, Eye, LayoutDashboard, Settings, Scale, Zap, Bell, LifeBuoy,
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
  pending:    { label: "Awaiting Funding",  color: "#D97706", bg: "#FFFBEB",  dot: "#FBBF24", icon: Clock },
  funded:     { label: "Funded",            color: "#1D4ED8", bg: "#EFF6FF",  dot: "#2563EB", icon: DollarSign },
  converting: { label: "Converting",        color: "#374151", bg: "#F1F0E9",  dot: "#6B7280", icon: RefreshCw },
  sending:    { label: "Sending",           color: "#374151", bg: "#F1F0E9",  dot: "#6B7280", icon: ArrowUpRight },
  completed:  { label: "Completed",         color: "#059669", bg: "#ECFDF5",  dot: "#10B981", icon: CheckCircle2 },
  failed:     { label: "Failed",            color: "#DC2626", bg: "#FEF2F2",  dot: "#EF4444", icon: AlertCircle },
  confirmed:  { label: "Confirmed",         color: "#059669", bg: "#ECFDF5",  dot: "#10B981", icon: CheckCircle2 },
  processing: { label: "Processing",        color: "#374151", bg: "#F1F0E9",  dot: "#6B7280", icon: RefreshCw },
  active:     { label: "Active",            color: "#059669", bg: "#ECFDF5",  dot: "#10B981", icon: CheckCircle2 },
  disabled:   { label: "Disabled",          color: "#6B7280", bg: "#F1F0E9",  dot: "#9CA3AF", icon: X },
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
              className="rounded-full" style={{ width: 6, height: 6, background: on ? c.dot : '#CBC9BF' }} />
            {i < 4 && <div style={{ width: 4, height: 1, background: i < idx ? c.dot : '#ECEAE0' }} />}
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
      <div className="absolute inset-0" style={{ background: 'rgba(20,19,15,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 60 }} onClick={onClose} />
      <div className={"relative max-h-[85vh] overflow-y-auto max-w-[95vw] " + (wide ? "w-[920px]" : "w-[500px]")}
        style={{ background: '#FFFFFF', borderRadius: 20, padding: 28, border: '1px solid #EFEDE4', boxShadow: '0 1px 2px rgba(27,26,22,0.05), 0 32px 64px -24px rgba(27,26,22,0.28)', zIndex: 61 }}>
        <button onClick={onClose} className="absolute top-5 right-5 transition-colors" style={{ color: '#6E6C62' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#1B1A16')} onMouseLeave={e => (e.currentTarget.style.color = '#6E6C62')}
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
  t.style.cssText = "position:fixed;bottom:24px;right:24px;background:#1B1A16;color:#FFFFFF;padding:10px 20px;border-radius:8px;font-size:12px;font-weight:500;z-index:9999;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1)";
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
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F7F6F1' }}>
      <div className="w-[400px]" style={{ background: '#FFFFFF', padding: 36, borderRadius: 20, border: '1px solid #ECEAE0', boxShadow: '0 1px 2px rgba(27,26,22,0.04), 0 32px 64px -32px rgba(27,26,22,0.25)' }}>
        <div className="mb-6">
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.01em', color: '#1B1A16' }}>PAYSTRAX<span style={{ color: '#059669' }}>.</span></span>
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.06em', color: '#6E6C62', textTransform: 'uppercase' as const, marginTop: 4 }}>Payments Portal</p>
        </div>

        <p style={{ fontSize: 13, color: '#615F56' }} className="mb-6">Sign in to your dashboard</p>

        <div className="space-y-3">
          <div>
            <label className="block mb-1" style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: '#6E6C62', textTransform: 'uppercase' as const }}>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} autoFocus
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              className="w-full outline-none transition-colors"
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #DCDAD0', fontSize: 13, color: '#1B1A16', background: '#FFFFFF' }}
              onFocus={e => e.currentTarget.style.borderColor = '#1B1A16'} onBlur={e => e.currentTarget.style.borderColor = '#DCDAD0'} />
          </div>
          <div>
            <label className="block mb-1" style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: '#6E6C62', textTransform: 'uppercase' as const }}>Password</label>
            <input type="password" value={pass} onChange={e => { setPass(e.target.value); setLocalErr(false); }}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="Enter your password"
              className="w-full outline-none transition-colors"
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #DCDAD0', fontSize: 13, color: '#1B1A16', background: '#FFFFFF' }}
              onFocus={e => e.currentTarget.style.borderColor = '#1B1A16'} onBlur={e => e.currentTarget.style.borderColor = '#DCDAD0'} />
            {localErr && <p style={{ fontSize: 11, color: '#DC2626' }} className="mt-1">Please enter your password</p>}
            {externalError && <p style={{ fontSize: 11, color: '#DC2626' }} className="mt-1">{externalError}</p>}
          </div>
          <button onClick={handleLogin} disabled={loading}
            className="w-full mt-2 transition-colors disabled:opacity-60"
            style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: '#1B1A16', color: '#FFFFFF' }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#222222'; }} onMouseLeave={e => e.currentTarget.style.background = '#1B1A16'}>
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
  const DEMO_USER: AppUser = { id: "demo", email: "demo@paystrax.com", name: "Demo User", role: "admin", initials: "DU" };
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
  const [parsedRows, setParsedRows] = useState<{ name: string; amount: number; wallet: string }[]>([]);
  const [createdBatch, setCreatedBatch] = useState<any>(null);
  const [demoRows] = useState([
    { name: "TechFlow Solutions", amount: 12500, wallet: "0x742d35Cc6634C0532925a3b844Bc9e7595FbD180" },
    { name: "Nordic Supplies", amount: 8750, wallet: "0x8Ba1f109551bD432803012645aac136c9b5bBA72" },
    { name: "GreenLeaf Organics", amount: 6200, wallet: "0x2946259E0334f33A064106302415aD3391BeD384" },
    { name: "CloudScale Hosting", amount: 8300, wallet: "0x4B20993Bc481177ec7E8f571ceCaE8A9e22C02db" },
    { name: "DataBridge Analytics", amount: 7800, wallet: "0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2" },
  ]);
  const [page, setPage] = useState<"dashboard" | "batches" | "merchants" | "audit" | "settings" | "reconciliation" | "alerts" | "revenue">("dashboard");
  const [auditFilter, setAuditFilter] = useState("all");
  const [auditSearch, setAuditSearch] = useState("");
  const [merchantSearch, setMerchantSearch] = useState("");
  const [merchantFilter, setMerchantFilter] = useState("all"); // all, active, disabled, flagged
  const [reconSearch, setReconSearch] = useState("");
  const [reconFilter, setReconFilter] = useState("all"); // all, exceptions, reconciled
  const [currencyFilter, setCurrencyFilter] = useState("all");
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
  const saveMarkupMut = useMutation({
    mutationFn: async (bps: string) => {
      const r = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultMarkupBps: Number(bps), actor: currentUser?.email }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); qc.invalidateQueries({ queryKey: ["revenue"] }); },
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
      if (nameIdx === -1 || amountIdx === -1 || walletIdx === -1) { setUploadErr("CSV needs columns: merchant/name, amount, wallet/address"); return; }
      const rows = lines.slice(1).map(line => {
        const cols = line.split(",").map(c => c.trim());
        return { name: cols[nameIdx], amount: parseFloat(cols[amountIdx]), wallet: cols[walletIdx] };
      }).filter(r => r.name && !isNaN(r.amount) && r.amount > 0 && r.wallet);
      if (!rows.length) { setUploadErr("No valid rows found in CSV"); return; }
      setParsedRows(rows);
      setUploadErr(null);
      setUploadStep("preview");
    };
    reader.readAsText(file);
  };

  // Submit parsed rows to API
  const submitBatch = async (rows: { name: string; amount: number; wallet: string }[]) => {
    setUploadStep("submitting");
    try {
      const r = await fetch("/api/batches", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: rows.map(r => ({ merchantName: r.name, amount: r.amount.toString(), walletAddress: r.wallet })),
          currency: batchCurrency, payoutTiming: batchTiming, scheduledDate: batchTiming === "scheduled" ? batchDate : null,
          createdBy: currentUser?.email || "paystrax",
        }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      const batch = await r.json();
      setCreatedBatch(batch);
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
        body: JSON.stringify({ entries: ent, currency: batchCurrency, payoutTiming: batchTiming, scheduledDate: batchTiming === "scheduled" ? batchDate : null, createdBy: currentUser?.email || "paystrax" }),
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["merchants"] }); setEditingMerchant(null); },
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
  const CSYM: Record<string, string> = { EUR: "€", USD: "$", AUD: "A$" };

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
    const csv = "merchant_name,amount,wallet_address\nTechFlow Solutions,5000.00,0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18\nNordic Supplies,3200.50,0x8Ba1f109551bD432803012645Ac136ddd64DBA72\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "paystrax-batch-template.csv"; a.click();
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
      try { localStorage.setItem("paystrax_user", JSON.stringify(user)); } catch {}
    } catch (e: any) { setLoginError("Connection error — is the API server running?"); }
  }} error={loginError} />;

  return (
    <div style={{ fontFamily: "'Geist', -apple-system, system-ui, sans-serif", background: '#F7F6F1', minHeight: '100vh', display: 'flex' }}>
      <style>{`
        .sidebar-nav-item:not(.sidebar-nav-active):hover { background: rgba(255,255,255,0.06) !important; color: rgba(255,255,255,0.85) !important; }
        input:focus, select:focus, textarea:focus { border-color: #1B1A16 !important; outline: none !important; box-shadow: 0 0 0 3px rgba(27,26,22,0.08) !important; }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        h1, h2, h3 { letter-spacing: -0.02em; }
        table th { font-family: 'Geist', sans-serif; }
        td, .tabular-nums { font-variant-numeric: tabular-nums; }
      `}</style>
      {/* ─ Sidebar ─ */}
      <aside style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 220, background: 'linear-gradient(180deg, #131311, #1C1B17)', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', padding: '20px 12px', zIndex: 50 }}>
        {/* Logo */}
        <div style={{ padding: '0 8px', marginBottom: 32 }}>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.01em', color: '#FFFFFF' }}>PAYSTRAX<span style={{ color: '#34D399' }}>.</span></span>
          <span style={{ display: 'block', fontSize: 8, fontWeight: 500, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, marginTop: 2 }}>Payments Portal</span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1 }}>
          {[
            { key: "dashboard", label: "Overview", icon: LayoutDashboard },
            { key: "batches", label: "Payout Batches", icon: FileText },
            { key: "reconciliation", label: "Reconciliation", icon: Scale },
            { key: "merchants", label: "Merchants", icon: Users },
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
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '10px 12px', borderRadius: 8, marginBottom: 2,
                  background: isActive ? 'rgba(255,255,255,0.10)' : 'transparent',
                  boxShadow: isActive ? 'inset 0 0 0 1px rgba(255,255,255,0.08)' : 'none',
                  color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.48)',
                  fontSize: 13, fontWeight: 500,
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                }}>
                <Icon style={{ width: 16, height: 16 }} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.key === "alerts" && (alertsData?.total ?? 0) > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 999, background: '#DC2626', color: '#FFFFFF' }}>{alertsData.total}</span>
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
      <div style={{ flex: 1, marginLeft: 220, minHeight: '100vh' }}>
        {/* ─ Header ─ */}
        <header style={{ position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.72)', backdropFilter: 'saturate(180%) blur(14px)', WebkitBackdropFilter: 'saturate(180%) blur(14px)', borderBottom: '1px solid #E7E5DB', padding: '12px 32px' }}>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: '#1B1A16', letterSpacing: '-0.01em' }}>
            {page === "dashboard" ? "Overview" : page === "batches" ? "Payout Batches" : page === "merchants" ? "Merchants" : page === "settings" ? "Settings" : page === "reconciliation" ? "Reconciliation" : page === "alerts" ? "Alerts & Resolution" : page === "revenue" ? "Revenue & Fees" : "Audit & Compliance"}
          </h1>
          <div className="flex items-center gap-2">
            {/* Integration mode badge — reflects /api/providers */}
            {providers && (
              <div title={`FX ${providers.fx?.mode} · Settlement ${providers.settlement?.mode} · Fiat ${providers.fiat?.mode} · Screening ${providers.screening?.mode} · Travel rule ${providers.travelRule?.mode}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid #E5E3D9', background: '#F8F7F2' }}>
                <Zap style={{ width: 12, height: 12, color: providers.fx?.live ? '#059669' : '#96948A' }} />
                <span style={{ fontSize: 11, fontWeight: 500, color: '#54524A' }}>
                  FX <b style={{ color: providers.fx?.live ? '#059669' : '#96948A' }}>{providers.fx?.live ? 'Live · ECB' : 'Mock'}</b>
                </span>
                <span style={{ fontSize: 11, color: '#CBC9BF' }}>·</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: '#96948A' }}>Rails Mock</span>
              </div>
            )}
            {(page === "dashboard" || page === "batches") && currentUser?.role !== "viewer" && (
              <>
                <button onClick={() => setShowManual(true)} className="flex items-center gap-1.5 transition-colors"
                  style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: '1px solid #E5E3D9', color: '#615F56', background: '#FFFFFF' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#CBC9BF'} onMouseLeave={e => e.currentTarget.style.borderColor = '#E5E3D9'}>
                  <Plus className="w-3.5 h-3.5" /> Manual Entry
                </button>
                <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 transition-colors"
                  style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: '#1B1A16', color: '#FFFFFF' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#222222'} onMouseLeave={e => e.currentTarget.style.background = '#1B1A16'}>
                  <Upload className="w-3.5 h-3.5" /> Upload Batch
                </button>
              </>
            )}
            {page === "merchants" && (
              <button onClick={() => setShowAddMerchant(true)} className="flex items-center gap-1.5 transition-colors"
                style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: '#1B1A16', color: '#FFFFFF' }}
                onMouseEnter={e => e.currentTarget.style.background = '#222222'} onMouseLeave={e => e.currentTarget.style.background = '#1B1A16'}>
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
                const heroNum = { fontSize: 26, fontWeight: 650, letterSpacing: '-0.02em', color: '#1B1A16', fontVariantNumeric: 'tabular-nums' as const, lineHeight: 1.1 };
                const card = { background: '#FFFFFF', border: '1px solid #E7E5DB', borderRadius: 16, boxShadow: '0 1px 2px rgba(27,26,22,0.04), 0 12px 32px -20px rgba(27,26,22,0.10)' };
                const label = { fontSize: 10, fontWeight: 500 as const, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#96948A' };

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
                            <div key={i} style={{ flex: 1, height: Math.max(2, (v / maxDay) * 26), borderRadius: 1.5, background: v > 0 ? (i === 29 ? '#059669' : '#A7D9C4') : '#EFEDE4' }} />
                          ))}
                        </div>
                        <p style={{ fontSize: 9, color: '#B5B3A8', marginTop: 5 }}>daily volume · last 30 days</p>
                      </div>
                      <div style={{ ...card, padding: '18px 20px 14px' }} title="Fiat in batches currently awaiting funding or processing">
                        <p style={label}>In Flight</p>
                        <p style={{ ...heroNum, marginTop: 6 }}>{abbr("€", inFlight)}</p>
                        <p style={{ fontSize: 11, color: '#6E6C62', marginTop: 10 }}>
                          {pendingBatches.length > 0
                            ? <><span style={{ color: '#D97706', fontWeight: 600 }}>{pendingBatches.length} awaiting funding</span>{active.length > pendingBatches.length ? ` · ${active.length - pendingBatches.length} processing` : ""}</>
                            : active.length > 0 ? `${active.length} processing` : "nothing pending"}
                        </p>
                      </div>
                      <div style={{ ...card, padding: '18px 20px 14px' }} title="Fybrus platform fee — 9 bps on every settled batch, deducted before conversion">
                        <p style={label}>Fees Collected · 9 bps</p>
                        <p style={{ ...heroNum, marginTop: 6, color: '#059669' }}>{s ? abbr("€", s.totalFees || 0) : "—"}</p>
                        <p style={{ fontSize: 11, color: '#6E6C62', marginTop: 10 }}>across {s?.completedBatches ?? "—"} settled batches</p>
                      </div>
                      <div style={{ ...card, padding: '18px 20px 14px' }} title="Average time from funds received to USDC confirmed on-chain — a stablecoin rail settles in minutes, not banking days">
                        <p style={label}>Avg Settlement</p>
                        <p style={{ ...heroNum, marginTop: 6 }}>{s && s.avgSettlementMinutes > 0 ? `${Math.round(s.avgSettlementMinutes)} min` : "—"}</p>
                        <p style={{ fontSize: 11, color: '#6E6C62', marginTop: 10 }}>funds received → confirmed</p>
                      </div>
                    </div>

                    {/* ─ Needs attention + currency mix ─ */}
                    <div className="grid grid-cols-3 gap-4">
                      <div style={{ ...card, gridColumn: 'span 2', overflow: 'hidden' }}>
                        <div className="flex items-center justify-between" style={{ padding: '12px 16px', borderBottom: '1px solid #EFEDE4' }}>
                          <p style={{ fontSize: 13, fontWeight: 500, color: '#1B1A16' }}>Needs attention</p>
                          {pendingBatches.length > 0 && (
                            <button onClick={() => copyText("IE29AIBK93115212345678")} className="flex items-center gap-1 transition-colors" style={{ fontSize: 11, fontWeight: 500, color: '#6E6C62', background: 'none', border: 'none', cursor: 'pointer' }}
                              onMouseEnter={e => e.currentTarget.style.color = '#1B1A16'} onMouseLeave={e => e.currentTarget.style.color = '#6E6C62'}>
                              <Copy className="w-3 h-3" /> IBAN · IE29 AIBK 9311 5212 3456 78 · AIB Dublin
                            </button>
                          )}
                        </div>
                        {pendingBatches.length === 0 && (
                          <div className="flex items-center gap-2.5" style={{ padding: '18px 16px' }}>
                            <CheckCircle2 className="w-4 h-4" style={{ color: '#059669' }} />
                            <p style={{ fontSize: 12.5, color: '#1B1A16' }}>All clear — nothing awaiting funding.{active.length > 0 ? ` ${active.length} batch${active.length > 1 ? "es" : ""} processing.` : ""}</p>
                          </div>
                        )}
                        {pendingBatches.slice(0, 4).map((b: any) => {
                          const sym = (CSYM as any)[b.currency] || "€";
                          return (
                            <div key={b.id} className="flex items-center justify-between" style={{ padding: '10px 16px', borderTop: '1px solid #F4F3EC' }}>
                              <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#F59E0B', flexShrink: 0 }} />
                                <button onClick={() => setSelectedId(b.id)} style={{ fontSize: 12, fontWeight: 500, fontFamily: "'Geist Mono', ui-monospace, monospace", color: '#1B1A16', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                                  onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'} onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>{b.batchRef}</button>
                                <span style={{ fontSize: 11, color: '#96948A' }}>{b.merchantCount} merchants · created {timeAgo(b.createdAt)}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#1B1A16', fontVariantNumeric: 'tabular-nums' }} title={`${sym}${num(b.totalFiat || b.totalEur).toLocaleString("en", { minimumFractionDigits: 2 })}`}>{abbr(sym, num(b.totalFiat || b.totalEur))} {b.currency}</span>
                                <button onClick={() => simulateSettlementMut.mutate(b.batchRef)} disabled={simulateSettlementMut.isPending}
                                  title="Posts the same webhook Banking Circle sends when the fiat lands"
                                  className="disabled:opacity-40"
                                  style={{ fontSize: 11, fontWeight: 500, padding: '5px 12px', borderRadius: 7, border: 'none', background: '#1B1A16', color: '#FFFFFF', cursor: 'pointer' }}>
                                  {simulateSettlementMut.isPending ? "Funding…" : "Fund now"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {pendingBatches.length > 0 && <p style={{ fontSize: 10, color: '#B5B3A8', padding: '8px 16px 10px' }}>Demo IBAN — “Fund now” simulates the bank’s settlement webhook. In production Banking Circle triggers this automatically.</p>}
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
                                  <span style={{ fontSize: 11, fontWeight: 600, color: '#54524A' }}>{c}</span>
                                  <span style={{ fontSize: 15, fontWeight: 650, letterSpacing: '-0.01em', color: '#1B1A16', fontVariantNumeric: 'tabular-nums' }}>{abbr((CSYM as any)[c] || "", v)}</span>
                                </div>
                                <div style={{ height: 4, borderRadius: 2, background: '#EFEDE4', overflow: 'hidden', marginTop: 5 }}>
                                  <div style={{ width: `${share}%`, height: '100%', borderRadius: 2, background: c === 'EUR' ? '#1B1A16' : c === 'USD' ? '#059669' : '#D97706' }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex justify-between" style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid #F0EFE4', fontSize: 11, color: '#6E6C62' }}>
                          <span>{batches.length} batches · {merchants.length} merchants</span>
                          <span style={{ color: '#059669', fontWeight: 600 }}>{done.length} settled</span>
                        </div>
                      </div>
                    </div>

                    {/* ─ Recent batches + right rail ─ */}
                    <div className="grid grid-cols-3 gap-4">
                      <div style={{ ...card, gridColumn: 'span 2', overflow: 'hidden' }}>
                        <div className="flex items-center justify-between" style={{ padding: '12px 16px', borderBottom: '1px solid #ECEAE0' }}>
                          <p style={{ fontSize: 13, fontWeight: 500, color: '#1B1A16' }}>Recent Batches</p>
                          <button onClick={() => setPage("batches")} style={{ fontSize: 11, fontWeight: 500, color: '#6E6C62', background: 'none', border: 'none', cursor: 'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#1B1A16'} onMouseLeave={e => e.currentTarget.style.color = '#6E6C62'}>
                            View all →
                          </button>
                        </div>
                        {batches.slice(0, 6).map((b: any) => {
                          const sym = (CSYM as any)[b.currency] || "€";
                          return (
                            <div key={b.id} className="flex items-center justify-between cursor-pointer transition-colors"
                              style={{ padding: '10px 16px', borderTop: '1px solid #F4F3EC' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#F8F7F2'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              onClick={() => setSelectedId(b.id)}>
                              <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
                                <span style={{ fontSize: 12, fontWeight: 500, fontFamily: "'Geist Mono', ui-monospace, monospace", color: '#1B1A16' }}>{b.batchRef}</span>
                                <span style={{ fontSize: 11, color: '#96948A' }}>{b.merchantCount} merchants · {timeAgo(b.createdAt)}</span>
                              </div>
                              <div className="flex items-center gap-4">
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#1B1A16', fontVariantNumeric: 'tabular-nums' }} title={`${sym}${num(b.totalFiat || b.totalEur).toLocaleString("en", { minimumFractionDigits: 2 })}`}>{abbr(sym, num(b.totalFiat || b.totalEur))} <span style={{ fontSize: 10, color: '#96948A', fontWeight: 500 }}>{b.currency}</span></span>
                                <Badge status={b.status} />
                              </div>
                            </div>
                          );
                        })}
                        {batches.length === 0 && <p style={{ padding: '20px 16px', fontSize: 12, color: '#6E6C62' }}>No batches yet. Upload a CSV to get started.</p>}
                      </div>

                      <div className="space-y-4">
                        {!analytics && (
                          <div className="flex items-center justify-center" style={{ ...card, padding: 32 }}>
                            <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#CBC9BF' }} />
                          </div>
                        )}
                        {analytics && (
                          <>
                            <div style={{ ...card, padding: 16 }}>
                              <p style={{ ...label, marginBottom: 10 }}>Settlement Metrics</p>
                              <div className="space-y-3">
                                <div title={`Batches fully processed: ${analytics.summary.completedBatches} of ${analytics.summary.totalBatches}`} className="flex justify-between" style={{ fontSize: 12 }}><span style={{ color: '#54524A' }}>Batch Completion</span><span style={{ fontWeight: 600, color: analytics.summary.completionRate >= 80 ? '#059669' : '#D97706' }}>{analytics.summary.completionRate.toFixed(0)}% <span style={{ color: '#96948A', fontWeight: 400 }}>({analytics.summary.completedBatches}/{analytics.summary.totalBatches})</span></span></div>
                                <div title={`Payouts confirmed on-chain: ${analytics.summary.confirmedPayouts} of ${analytics.summary.totalPayouts}. Non-confirmed here are compliance-blocked, not technical failures.`} className="flex justify-between" style={{ fontSize: 12 }}><span style={{ color: '#54524A' }}>Payouts Confirmed</span><span style={{ fontWeight: 600, color: '#1B1A16' }}>{analytics.summary.confirmedPayouts}/{analytics.summary.totalPayouts}{analytics.summary.failedPayouts > 0 ? <span style={{ color: '#D97706', fontWeight: 400 }}> · {analytics.summary.failedPayouts} blocked</span> : null}</span></div>
                                <div className="flex justify-between" style={{ fontSize: 12 }}><span style={{ color: '#54524A' }}>Avg FX Rate</span><span style={{ fontWeight: 600, color: '#1B1A16', fontVariantNumeric: 'tabular-nums' }}>{analytics.summary.avgExchangeRate.toFixed(4)}</span></div>
                                <div title="Paystrax markup earned on settled payouts — see the Revenue page" className="flex justify-between" style={{ fontSize: 12 }}><span style={{ color: '#54524A' }}>Markup Owed (Paystrax)</span><button onClick={() => setPage("revenue")} style={{ fontWeight: 600, color: '#1D4ED8', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }} onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'} onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>{revenue ? abbr("€", revenue.markupOwed || 0) : "View →"}</button></div>
                              </div>
                            </div>

                            <div style={{ ...card, padding: 16 }}>
                              <p style={{ ...label, marginBottom: 10 }}>Payout Status</p>
                              {(() => {
                                const counts = analytics.payoutStatusCounts || {};
                                const total = Object.values(counts).reduce((s: number, v: any) => s + v, 0) as number;
                                if (total === 0) return <p style={{ fontSize: 12, color: '#6E6C62' }}>No payouts</p>;
                                return (
                                  <div className="space-y-2">
                                    {Object.entries(counts).map(([status, val]) => {
                                      const pct = ((val as number) / total) * 100;
                                      const color = SC[status]?.dot || '#CBC9BF';
                                      const lbl = status === 'pending' ? 'Pending' : SC[status]?.label || status;
                                      return (
                                        <div key={status}>
                                          <div className="flex justify-between" style={{ fontSize: 11, marginBottom: 2 }}>
                                            <span style={{ color: '#54524A' }}>{lbl}</span>
                                            <span style={{ fontWeight: 500, color: '#1B1A16' }}>{val as number} <span style={{ color: '#6E6C62' }}>({pct.toFixed(0)}%)</span></span>
                                          </div>
                                          <div style={{ height: 4, borderRadius: 2, background: '#ECEAE0', overflow: 'hidden' }}>
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
            <div style={{ background: '#FFFFFF', border: '1px solid #E7E5DB', borderRadius: 14, boxShadow: '0 1px 2px rgba(27,26,22,0.04), 0 12px 32px -20px rgba(27,26,22,0.10)', overflow: 'auto' }}>
              <div className="flex items-center justify-between" style={{ padding: '12px 16px', borderBottom: '1px solid #ECEAE0' }}>
                <h2 style={{ fontSize: 13, fontWeight: 500, color: '#1B1A16' }}>{filtered.length} {filtered.length === 1 ? "Batch" : "Batches"}</h2>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5" style={{ background: '#F4F3EC', borderRadius: 8, padding: '6px 12px', border: '1px solid transparent' }}>
                    <Search className="w-3.5 h-3.5" style={{ color: '#CBC9BF' }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search batches..."
                      className="outline-none" style={{ background: 'transparent', fontSize: 12, color: '#1B1A16', width: 120 }} />
                  </div>
                  <select value={currencyFilter} onChange={e => setCurrencyFilter(e.target.value)} aria-label="Filter by currency"
                    style={{ padding: '7px 10px', borderRadius: 8, fontSize: 12, border: '1px solid #DCDAD0', background: '#FFFFFF', color: '#54524A', cursor: 'pointer' }}>
                    <option value="all">All currencies</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="AUD">AUD</option>
                  </select>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter by status"
                    className="outline-none cursor-pointer"
                    style={{ padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 500, border: '1px solid #DCDAD0', background: '#FFFFFF', color: '#54524A' }}>
                    <option value="all">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="funded">Funded</option>
                    <option value="converting">Converting</option>
                    <option value="sending">Sending</option>
                    <option value="completed">Completed</option>
                  </select>
                  <button onClick={downloadTemplate} className="flex items-center gap-1.5 transition-colors" style={{ fontSize: 11, fontWeight: 500, color: '#6E6C62' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#1B1A16'} onMouseLeave={e => e.currentTarget.style.color = '#6E6C62'}>
                    <FileDown className="w-3.5 h-3.5" /> CSV Template
                  </button>
                  <button onClick={() => window.open("/api/reports/csv", "_blank")} className="flex items-center gap-1.5 transition-colors" style={{ fontSize: 11, fontWeight: 500, color: '#6E6C62' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#1B1A16'} onMouseLeave={e => e.currentTarget.style.color = '#6E6C62'}>
                    <Download className="w-3.5 h-3.5" /> Export CSV
                  </button>
                </div>
              </div>
              {isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: '#CBC9BF' }} /></div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16">
                  <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: '#CBC9BF' }} />
                  <p style={{ fontSize: 13, color: '#6E6C62' }}>
                    {batches.length === 0 ? "No batches yet. Upload a CSV or add entries manually." : "No batches match your filters."}
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 700 }}>
                  <thead>
                    <tr style={{ background: '#F8F7F2' }}>
                      {["Batch", "Ccy", "#", "FIAT Total", "USDC", "Timing", "Status", "Created"].map((h, i) => (
                        <th key={h} style={{
                          fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62',
                          paddingTop: 8, paddingBottom: 8, paddingLeft: i === 0 ? 16 : 12, paddingRight: i === 7 ? 16 : 12,
                          textAlign: i === 0 ? 'left' : i === 3 || i === 4 || i === 7 ? 'right' : 'center',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((b: any) => {
                      const sym = ({ EUR: "€", USD: "$", AUD: "A$" } as any)[b.currency] || "€";
                      return (
                        <tr key={b.id} className="cursor-pointer transition-colors"
                          style={{ borderTop: '1px solid #EFEDE4' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F8F7F2'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          onClick={() => setSelectedId(b.id)}>
                          <td style={{ paddingTop: 8, paddingBottom: 8, paddingLeft: 16, paddingRight: 10, fontSize: 11, fontWeight: 500, fontFamily: "'Geist Mono', ui-monospace, monospace", color: '#1B1A16', whiteSpace: 'nowrap' }}>{b.batchRef}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                            <span style={{
                              fontSize: 8, fontWeight: 600, letterSpacing: '0.07em', padding: '2px 5px', borderRadius: 4,
                              background: '#EFEDE4', color: '#54524A',
                            }}>{b.currency || "EUR"}</span>
                          </td>
                          <td style={{ padding: '8px 6px', fontSize: 12, textAlign: 'center', color: '#54524A' }}>{b.merchantCount}</td>
                          <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 600, textAlign: 'right', color: '#1B1A16', fontVariantNumeric: 'tabular-nums' }}>{sym}{parseFloat(b.totalFiat || b.totalEur).toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: b.totalUsdc ? '#1B1A16' : '#CBC9BF' }}>
                            {b.totalUsdc ? `$${parseFloat(b.totalUsdc).toLocaleString("en", { minimumFractionDigits: 2 })}` : "—"}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                            {b.payoutTiming === "scheduled" && b.scheduledDate ? (
                              <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 5px', borderRadius: 4, background: '#EFEDE4', color: '#54524A' }}>
                                {new Date(b.scheduledDate).toLocaleDateString("en-IE", { day: "numeric", month: "short" })}
                              </span>
                            ) : (
                              <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 5px', borderRadius: 4, background: '#EFEDE4', color: '#54524A' }}>ASAP</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}><Badge status={b.status} /></td>
                          <td style={{ paddingTop: 8, paddingBottom: 8, paddingLeft: 12, paddingRight: 16, textAlign: 'right', fontSize: 11, color: '#777777', whiteSpace: 'nowrap' }}>{timeAgo(b.createdAt)}</td>
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
                  <div key={k.label} style={{ background: '#FFFFFF', border: '1px solid #E7E5DB', borderRadius: 14, boxShadow: '0 1px 2px rgba(27,26,22,0.04), 0 12px 32px -20px rgba(27,26,22,0.10)', padding: '14px 16px' }}>
                    <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#6E6C62' }}>{k.label}</p>
                    <p style={{ fontSize: 18, fontWeight: 600, fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: '-0.03em', marginTop: 4, fontVariantNumeric: 'tabular-nums', color: k.flag ? ((k.value ?? 0) > 0 ? '#DC2626' : '#059669') : '#1B1A16' }}>
                      {k.pre}{typeof k.value === "number" ? k.value.toLocaleString("en", { minimumFractionDigits: k.flag ? 0 : 2, maximumFractionDigits: k.flag ? 0 : 2 }) : "—"}
                    </p>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <p style={{ fontSize: 12, color: '#615F56' }}>
                  {reconciliation ? <><b style={{ color: '#059669' }}>{reconciliation.reconciledBatches}</b> reconciled · <b style={{ color: (reconciliation.exceptionBatches ?? 0) > 0 ? '#DC2626' : '#059669' }}>{reconciliation.exceptionBatches}</b> with exceptions</> : "Loading…"}
                </p>
                <div className="flex items-center gap-2">
                  <input value={reconSearch} onChange={e => setReconSearch(e.target.value)} placeholder="Search batch ref…"
                    className="outline-none" style={{ width: 170, padding: '7px 12px', borderRadius: 8, fontSize: 12, border: '1px solid #DCDAD0', background: '#FFFFFF', color: '#1B1A16' }} />
                  {[["all", "All"], ["exceptions", "Exceptions"], ["reconciled", "Reconciled"]].map(([k, label]) => (
                    <button key={k} onClick={() => setReconFilter(k)}
                      style={{ fontSize: 11, fontWeight: 500, padding: '6px 12px', borderRadius: 999, border: '1px solid ' + (reconFilter === k ? '#1B1A16' : '#DCDAD0'), background: reconFilter === k ? '#1B1A16' : '#FFFFFF', color: reconFilter === k ? '#FFFFFF' : '#54524A', cursor: 'pointer' }}>
                      {label}
                    </button>
                  ))}
                  <a href="/api/reconciliation/csv" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: '1px solid #E5E3D9', color: '#54524A', textDecoration: 'none' }}>
                    <Download style={{ width: 14, height: 14 }} /> Export CSV
                  </a>
                </div>
              </div>

              {/* Reconciliation table */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E7E5DB', borderRadius: 14, boxShadow: '0 1px 2px rgba(27,26,22,0.04), 0 12px 32px -20px rgba(27,26,22,0.10)', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #ECEAE0', background: '#F8F7F2' }}>
                        {["Batch", "Ccy", "Status", "Fiat Exp.", "Fiat Rcvd", "USDC Conv.", "USDC Conf.", "Payouts", "Reconciliation"].map((h, i) => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: i > 2 && i < 7 ? 'right' : 'left', fontSize: 10, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#6E6C62' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecon.map((r: any) => (
                        <tr key={r.batchRef} style={{ borderBottom: '1px solid #F5F5F5' }}>
                          <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums' }}>
                            <button onClick={() => r.batchId && setSelectedId(r.batchId)} title="Open batch detail"
                              style={{ fontWeight: 600, color: '#1B1A16', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', textDecoration: 'none' }}
                              onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'} onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>
                              {r.batchRef}
                            </button>
                          </td>
                          <td style={{ padding: '10px 14px', color: '#615F56' }}>{r.currency}</td>
                          <td style={{ padding: '10px 14px' }}><Badge status={r.status} /></td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#333333' }}>{r.fiatExpected.toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#333333' }}>{r.fiatReceived.toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#333333' }}>{r.usdcConverted.toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#333333' }}>{r.usdcConfirmed.toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '10px 14px', color: '#615F56', fontVariantNumeric: 'tabular-nums' }}>{r.payoutsConfirmed}/{r.payoutsTotal}</td>
                          <td style={{ padding: '10px 14px' }}>
                            {r.reconciled ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color: '#059669' }}><CheckCircle2 style={{ width: 13, height: 13 }} /> Reconciled</span>
                            ) : (
                              <span title={r.exceptions.join(" · ")} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color: '#DC2626' }}><AlertCircle style={{ width: 13, height: 13 }} /> {r.exceptions.length} issue{r.exceptions.length > 1 ? "s" : ""}</span>
                            )}
                            {r.status === "pending" && currentUser?.role !== "viewer" && (
                              <button onClick={() => simulateSettlementMut.mutate(r.batchRef)} disabled={simulateSettlementMut.isPending}
                                title="Posts the same webhook Banking Circle sends when fiat lands"
                                style={{ marginLeft: 10, fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 5, border: '1px solid #DCDAD0', background: '#FFFFFF', cursor: 'pointer', color: '#1D4ED8' }}>
                                Demo: Simulate settlement
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {reconciliation && filteredRecon.length === 0 && reconciliation.rows.length > 0 && (
                        <tr><td colSpan={10} style={{ padding: '24px 16px', fontSize: 12, color: '#96948A', textAlign: 'center' }}>No batches match. <button onClick={() => { setReconSearch(""); setReconFilter("all"); }} style={{ color: '#1D4ED8', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>Clear filters</button></td></tr>
                      )}
                      {reconciliation && reconciliation.rows.length === 0 && (
                        <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#96948A' }}>No batches yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <p style={{ fontSize: 11, color: '#96948A', marginTop: 2 }}>
                Money trail reconciled across the lifecycle: fiat received (Banking Circle) → converted (live ECB rate) → USDC sent → confirmed on-chain. Exceptions flag any mismatch.
              </p>
            </>
          )}

          {/* ─ Merchants tab ─ */}
          {page === "merchants" && (
            <div style={{ background: '#FFFFFF', border: '1px solid #E7E5DB', borderRadius: 14, boxShadow: '0 1px 2px rgba(27,26,22,0.04), 0 12px 32px -20px rgba(27,26,22,0.10)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #ECEAE0' }}>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h2 style={{ fontSize: 13, fontWeight: 500, color: '#1B1A16' }}>Registered Merchants</h2>
                    <p style={{ fontSize: 11, color: '#6E6C62', marginTop: 2 }}>Register each merchant's wallet address once. They'll be matched automatically on batch uploads.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input value={merchantSearch} onChange={e => setMerchantSearch(e.target.value)} placeholder="Search name, wallet, email, KYC ref…"
                      className="outline-none" style={{ width: 240, padding: '7px 12px', borderRadius: 8, fontSize: 12, border: '1px solid #DCDAD0', background: '#FFFFFF', color: '#1B1A16' }} />
                    {[["all", "All"], ["active", "Active"], ["disabled", "Disabled"], ["flagged", "Flagged"]].map(([k, label]) => (
                      <button key={k} onClick={() => setMerchantFilter(k)}
                        style={{ fontSize: 11, fontWeight: 500, padding: '6px 12px', borderRadius: 999, border: '1px solid ' + (merchantFilter === k ? '#1B1A16' : '#DCDAD0'), background: merchantFilter === k ? '#1B1A16' : '#FFFFFF', color: merchantFilter === k ? '#FFFFFF' : '#54524A', cursor: 'pointer' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {merchants.length === 0 ? (
                <div className="text-center" style={{ padding: '64px 0' }}>
                  <Users className="w-10 h-10 mx-auto" style={{ color: '#CBC9BF', marginBottom: 12 }} />
                  <p style={{ fontSize: 13, color: '#6E6C62', marginBottom: 12 }}>No merchants registered yet.</p>
                  <button onClick={() => setShowAddMerchant(true)}
                    className="inline-flex items-center gap-1.5"
                    style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: '#1B1A16', color: '#FFFFFF' }}>
                    <UserPlus className="w-3.5 h-3.5" /> Register First Merchant
                  </button>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                <table className="w-full" style={{ minWidth: 600 }}>
                  <thead>
                    <tr style={{ background: '#F8F7F2' }}>
                      {["Name", "Wallet Address", "KYC", "Screening", "Status", "Registered", ""].map((h, i) => (
                        <th key={h || "actions"} style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62', padding: '8px 16px', textAlign: i === 6 ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMerchants.map((m: any) => (
                      <tr key={m.id} className="transition-colors"
                        style={{ borderTop: '1px solid #EFEDE4' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F8F7F2'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: 12, fontWeight: 500, display: 'block', color: m.status === "disabled" ? '#96948A' : '#1B1A16' }}>{m.name}</span>
                          {m.email && <span style={{ fontSize: 10, color: '#96948A', display: 'block', marginTop: 1 }}>{m.email}</span>}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div className="flex items-center gap-1.5">
                            <span style={{ fontSize: 11, fontFamily: "'Geist Mono', ui-monospace, monospace", color: '#54524A' }}>{m.walletAddress.slice(0, 8)}...{m.walletAddress.slice(-4)}</span>
                            <button onClick={() => copyText(m.walletAddress)} style={{ color: '#CBC9BF', background: 'none', border: 'none', cursor: 'pointer' }}
                              onMouseEnter={e => e.currentTarget.style.color = '#615F56'} onMouseLeave={e => e.currentTarget.style.color = '#CBC9BF'}
                              aria-label="Copy wallet address"><Copy className="w-3 h-3" /></button>
                          </div>
                        </td>
                        {/* KYC reliance attestation — verification lives on the relying party's system */}
                        <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                          <span title={`KYC performed by ${m.kycReliedOn || "Paystrax (acquirer)"}${m.kycRef ? ` · ref ${m.kycRef}` : ""}${m.kycAttestedAt ? ` · attested ${new Date(m.kycAttestedAt).toLocaleDateString()}` : ""}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 999, background: '#EFF6FF', color: '#1D4ED8' }}>
                            <ShieldCheck style={{ width: 11, height: 11 }} /> Relied · {(m.kycReliedOn || "Paystrax").split(" ")[0]}
                          </span>
                        </td>
                        {/* Destination-wallet screening — our obligation */}
                        <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                          {m.walletScreenStatus === "flagged" ? (
                            <span title={`Flagged by ${m.walletScreenProvider}${m.walletScreenedAt ? ` · ${new Date(m.walletScreenedAt).toLocaleString()}` : ""}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 999, background: '#FEF2F2', color: '#DC2626' }}>
                              <AlertCircle style={{ width: 11, height: 11 }} /> Flagged
                            </span>
                          ) : m.walletScreenStatus === "clear" ? (
                            <span title={`Screened clear by ${m.walletScreenProvider}${m.walletScreenedAt ? ` · ${new Date(m.walletScreenedAt).toLocaleString()}` : ""}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 999, background: '#ECFDF5', color: '#059669' }}>
                              <CheckCircle2 style={{ width: 11, height: 11 }} /> Clear
                            </span>
                          ) : (
                            <button onClick={() => screenMerchantMut.mutate(m.id)} disabled={screenMerchantMut.isPending}
                              style={{ fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 5, border: '1px solid #DCDAD0', background: '#FFFFFF', cursor: 'pointer', color: '#B45309' }}>
                              Screen now
                            </button>
                          )}
                        </td>
                        <td style={{ padding: '10px 16px' }}><Badge status={m.status || "active"} /></td>
                        <td style={{ padding: '10px 16px', fontSize: 11, color: '#777777', whiteSpace: 'nowrap' }}>{timeAgo(m.createdAt)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                          {currentUser?.role !== "viewer" && (
                            <div className="flex items-center gap-1 justify-end">
                              <button onClick={() => setEditingMerchant({ ...m })}
                                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid #DCDAD0', background: '#FFFFFF', cursor: 'pointer', color: '#54524A' }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = '#1B1A16'} onMouseLeave={e => e.currentTarget.style.borderColor = '#DCDAD0'}>
                                Edit
                              </button>
                              <button onClick={() => updateMerchantMut.mutate({ id: m.id, status: m.status === "disabled" ? "active" : "disabled" })}
                                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid #DCDAD0', background: '#FFFFFF', cursor: 'pointer', color: m.status === "disabled" ? '#059669' : '#D97706' }}>
                                {m.status === "disabled" ? "Enable" : "Disable"}
                              </button>
                              <button onClick={() => { if (window.confirm(`Delete ${m.name}? This cannot be undone.`)) deleteMerchantMut.mutate(m.id); }}
                                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid #FCA5A5', background: '#FFFFFF', cursor: 'pointer', color: '#DC2626' }}>
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
                  <p style={{ padding: '24px 16px', fontSize: 12, color: '#96948A', textAlign: 'center' }}>No merchants match “{merchantSearch || merchantFilter}”. <button onClick={() => { setMerchantSearch(""); setMerchantFilter("all"); }} style={{ color: '#1D4ED8', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>Clear filters</button></p>
                )}
                {deleteMerchantMut.isError && <p style={{ padding: '8px 16px', fontSize: 11, color: '#DC2626' }}>{(deleteMerchantMut.error as Error).message}</p>}
                </div>
              )}
            </div>
          )}

          {/* ─ Revenue & Fees tab ─ */}
          {page === "revenue" && (
            <div className="space-y-5">
              <p style={{ fontSize: 11, lineHeight: 1.55, color: '#6E6C62', padding: '10px 14px', borderRadius: 10, background: '#F4F3EC', border: '1px solid #ECEAE0' }}>
                Fybrus charges a fixed <strong>{settings ? (settings.fybrusFeeBps/100).toFixed(2) : "0.09"}%</strong> ({settings?.fybrusFeeBps ?? 9} bps) on each payout. On top of that, Paystrax sets its own markup — collected from merchants and <strong>owed back to Paystrax by Fybrus</strong>. The numbers below are settled (confirmed) payouts only.
              </p>

              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Owed to Paystrax (markup)", val: revenue?.markupOwed, color: '#059669', hint: "Your markup on settled payouts — rebated to you by Fybrus." },
                  { label: "Fybrus Fees (9 bps)", val: revenue?.fybrusFees, color: '#1B1A16', hint: "What Paystrax pays Fybrus for the settled payouts." },
                  { label: "Net Delivered to Merchants", val: revenue?.netToMerchants, color: '#54524A', hint: "USDC value delivered after all fees.", usd: true },
                ].map((c) => (
                  <div key={c.label} title={c.hint} style={{ background: '#FFFFFF', border: '1px solid #E7E5DB', borderRadius: 14, boxShadow: '0 1px 2px rgba(27,26,22,0.04), 0 12px 32px -20px rgba(27,26,22,0.10)', padding: 16 }}>
                    <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#6E6C62' }}>{c.label}</p>
                    <p style={{ fontSize: 22, fontWeight: 600, fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: '-0.03em', marginTop: 4, color: c.color }}>
                      {c.usd ? "$" : "€"}{(c.val || 0).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
              </div>

              {/* Markup control */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E7E5DB', borderRadius: 14, boxShadow: '0 1px 2px rgba(27,26,22,0.04), 0 12px 32px -20px rgba(27,26,22,0.10)', padding: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#1B1A16', marginBottom: 4 }}>Default Paystrax markup</p>
                <p style={{ fontSize: 11, color: '#6E6C62', marginBottom: 12 }}>Applied to every merchant unless overridden individually (Merchants → Edit). Set in basis points — 100 bps = 1%.</p>
                <div className="flex items-center gap-3">
                  <input type="number" min={0} max={1000}
                    value={markupInput !== "" ? markupInput : (settings?.defaultMarkupBps ?? "")}
                    onChange={e => setMarkupInput(e.target.value)}
                    className="outline-none" style={{ width: 120, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontFamily: "'Geist Mono', ui-monospace, monospace", border: '1px solid #DCDAD0', color: '#1B1A16' }} />
                  <span style={{ fontSize: 12, color: '#6E6C62' }}>bps ({(((markupInput !== "" ? Number(markupInput) : (settings?.defaultMarkupBps ?? 0)))/100).toFixed(2)}%)</span>
                  <button onClick={() => saveMarkupMut.mutate(markupInput !== "" ? markupInput : String(settings?.defaultMarkupBps ?? 0))}
                    disabled={saveMarkupMut.isPending}
                    style={{ fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#1B1A16', color: '#FFFFFF', cursor: 'pointer' }}>
                    {saveMarkupMut.isPending ? "Saving…" : "Save markup"}
                  </button>
                  {saveMarkupMut.isSuccess && markupInput === "" && <span style={{ fontSize: 11, color: '#059669' }}>Saved</span>}
                </div>
              </div>

              {/* Per-merchant breakdown */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E7E5DB', borderRadius: 14, boxShadow: '0 1px 2px rgba(27,26,22,0.04), 0 12px 32px -20px rgba(27,26,22,0.10)', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #EFEDE4' }}><p style={{ fontSize: 12, fontWeight: 600, color: '#1B1A16' }}>Markup earned by merchant</p></div>
                <div style={{ overflowX: 'auto' }}>
                <table className="w-full" style={{ minWidth: 720 }}>
                  <thead><tr style={{ background: '#F8F7F2' }}>
                    {["Merchant", "Markup rate", "Payout", "Settled volume", "Fybrus fee", "Paystrax markup"].map((h, i) => (
                      <th key={h} style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#6E6C62', padding: '8px 16px', textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {(revenue?.byMerchant ?? []).map((r: any, i: number) => (
                      <tr key={i} style={{ borderTop: '1px solid #F0EFE4' }}>
                        <td style={{ padding: '10px 16px', fontSize: 12, fontWeight: 500, color: '#1B1A16' }}>{r.merchant}</td>
                        <td style={{ padding: '10px 16px', fontSize: 12, color: '#54524A', fontFamily: "'Geist Mono', ui-monospace, monospace" }}>{r.markupBps != null ? `${r.markupBps} bps` : `${settings?.defaultMarkupBps ?? 25} bps (default)`}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 999, background: r.payoutMethod === 'fiat' ? '#EFF6FF' : '#ECFDF5', color: r.payoutMethod === 'fiat' ? '#1D4ED8' : '#059669' }}>{r.payoutMethod === 'fiat' ? 'Fiat' : 'Stablecoin'}</span>
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 12, textAlign: 'right', fontFamily: "'Geist Mono', ui-monospace, monospace", color: '#1B1A16' }}>€{r.volume.toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 16px', fontSize: 12, textAlign: 'right', fontFamily: "'Geist Mono', ui-monospace, monospace", color: '#54524A' }}>€{r.fybrusFee.toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 16px', fontSize: 12, textAlign: 'right', fontFamily: "'Geist Mono', ui-monospace, monospace", fontWeight: 600, color: '#059669' }}>€{r.markup.toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                    {(!revenue || (revenue.byMerchant ?? []).length === 0) && (
                      <tr><td colSpan={6} style={{ padding: '24px 16px', fontSize: 12, color: '#96948A', textAlign: 'center' }}>No settled payouts yet.</td></tr>
                    )}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}

          {/* ─ Alerts & Resolution tab ─ */}
          {page === "alerts" && (
            <div className="space-y-5">
              {/* Summary chips */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Payout Failures", n: alertsData?.failedPayouts?.length ?? 0, color: '#DC2626', bg: '#FEF2F2' },
                  { label: "Flagged Wallets", n: alertsData?.flaggedMerchants?.length ?? 0, color: '#D97706', bg: '#FFFBEB' },
                  { label: "Reconciliation Exceptions", n: alertsData?.reconExceptions?.length ?? 0, color: '#1D4ED8', bg: '#EFF6FF' },
                ].map(c => (
                  <div key={c.label} style={{ background: '#FFFFFF', border: '1px solid #E7E5DB', borderRadius: 14, boxShadow: '0 1px 2px rgba(27,26,22,0.04), 0 12px 32px -20px rgba(27,26,22,0.10)', padding: 16 }}>
                    <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62' }}>{c.label}</p>
                    <p style={{ fontSize: 22, fontWeight: 600, fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: '-0.03em', marginTop: 4, color: c.n > 0 ? c.color : '#059669' }}>{c.n}</p>
                  </div>
                ))}
              </div>

              <p style={{ fontSize: 11, lineHeight: 1.55, color: '#6E6C62', padding: '10px 14px', borderRadius: 10, background: '#F4F3EC', border: '1px solid #ECEAE0' }}>
                Everything that needs a human lands here, with the reason attached. Compliance blocks (flagged wallets) are the system working as intended — they need review, not retries. Technical failures can be retried directly. If anything is unclear, open a ticket with <strong>Fybrus Customer Care</strong> from any alert.
              </p>

              {/* Open tickets */}
              {supportTickets.length > 0 && (
                <div style={{ background: '#FFFFFF', border: '1px solid #E7E5DB', borderRadius: 14, boxShadow: '0 1px 2px rgba(27,26,22,0.04), 0 12px 32px -20px rgba(27,26,22,0.10)', padding: 20 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#1B1A16', marginBottom: 10 }}>Open tickets with Fybrus Customer Care</p>
                  <div className="space-y-2">
                    {supportTickets.map((t: any) => (
                      <div key={t.id} className="flex items-center gap-3" style={{ fontSize: 12, padding: '8px 12px', borderRadius: 8, background: '#F8F7F2', border: '1px solid #ECEAE0' }}>
                        <LifeBuoy style={{ width: 14, height: 14, color: '#1D4ED8', flexShrink: 0 }} />
                        <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", color: '#1D4ED8', fontWeight: 500 }}>{t.ticketRef}</span>
                        <span style={{ flex: 1, color: '#54524A' }}>{t.subject}</span>
                        <span style={{ fontSize: 10, color: '#96948A' }}>{timeAgo(t.createdAt)}</span>
                        <Badge status={t.status === "open" ? "processing" : "completed"} />
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 10, color: '#96948A', marginTop: 8 }}>Fybrus Customer Care typically replies within 2 business hours.</p>
                </div>
              )}

              {/* All clear */}
              {(alertsData?.total ?? 0) === 0 && (
                <div style={{ background: '#FFFFFF', border: '1px solid #E7E5DB', borderRadius: 14, padding: '48px 0', textAlign: 'center' }}>
                  <CheckCircle2 className="w-8 h-8 mx-auto" style={{ color: '#059669', marginBottom: 8 }} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1B1A16' }}>All clear</p>
                  <p style={{ fontSize: 12, color: '#6E6C62', marginTop: 2 }}>No failed payouts, flagged wallets, or reconciliation exceptions.</p>
                </div>
              )}

              {/* Payout failures */}
              {(alertsData?.failedPayouts?.length ?? 0) > 0 && (
                <div style={{ background: '#FFFFFF', border: '1px solid #E7E5DB', borderRadius: 14, boxShadow: '0 1px 2px rgba(27,26,22,0.04), 0 12px 32px -20px rgba(27,26,22,0.10)', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid #EFEDE4' }}><p style={{ fontSize: 12, fontWeight: 600, color: '#DC2626' }}>Payout failures</p></div>
                  {alertsData.failedPayouts.map((a: any, i: number) => (
                    <div key={i} style={{ padding: '16px 20px', borderBottom: '1px solid #F4F3EC', borderLeft: '3px solid #DC2626' }}>
                      <div className="flex items-start justify-between gap-4">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#1B1A16' }}>
                            {a.merchant} — {({ EUR: "€", USD: "$", AUD: "A$" } as any)[a.currency] || "€"}{parseFloat(a.amount).toLocaleString("en", { minimumFractionDigits: 2 })} not delivered
                          </p>
                          <p style={{ fontSize: 12, color: '#DC2626', marginTop: 4, lineHeight: 1.5 }}>{a.reason}</p>
                          <p style={{ fontSize: 11, color: '#96948A', marginTop: 4, fontFamily: "'Geist Mono', ui-monospace, monospace" }}>{a.batchRef} · {a.walletAddress.slice(0, 10)}…{a.walletAddress.slice(-4)}</p>
                          {!a.retryable && <p style={{ fontSize: 11, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '6px 10px', marginTop: 8, lineHeight: 1.5 }}>This is a compliance block, not a technical error — retrying will not deliver it. Review the merchant's wallet, or contact Fybrus Customer Care if you believe this is a false positive.</p>}
                        </div>
                        <div className="flex flex-col gap-1.5" style={{ flexShrink: 0 }}>
                          <button onClick={() => setSelectedId(a.batchId)} style={{ fontSize: 11, fontWeight: 500, padding: '5px 12px', borderRadius: 7, border: '1px solid #DCDAD0', background: '#FFFFFF', cursor: 'pointer', color: '#54524A' }}>View batch</button>
                          {a.retryable && <button onClick={() => retryFailedMut.mutate(a.batchId)} disabled={retryFailedMut.isPending} style={{ fontSize: 11, fontWeight: 500, padding: '5px 12px', borderRadius: 7, border: '1px solid #FCD34D', background: '#FFFFFF', cursor: 'pointer', color: '#B45309' }}>Retry</button>}
                          <button onClick={() => openCare(a)} style={{ fontSize: 11, fontWeight: 500, padding: '5px 12px', borderRadius: 7, border: 'none', background: '#1B1A16', color: '#FFFFFF', cursor: 'pointer' }}>Get help</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Flagged wallets */}
              {(alertsData?.flaggedMerchants?.length ?? 0) > 0 && (
                <div style={{ background: '#FFFFFF', border: '1px solid #E7E5DB', borderRadius: 14, boxShadow: '0 1px 2px rgba(27,26,22,0.04), 0 12px 32px -20px rgba(27,26,22,0.10)', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid #EFEDE4' }}><p style={{ fontSize: 12, fontWeight: 600, color: '#D97706' }}>Flagged wallets</p></div>
                  {alertsData.flaggedMerchants.map((a: any, i: number) => (
                    <div key={i} style={{ padding: '16px 20px', borderBottom: '1px solid #F4F3EC', borderLeft: '3px solid #D97706' }}>
                      <div className="flex items-start justify-between gap-4">
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#1B1A16' }}>{a.merchant}</p>
                          <p style={{ fontSize: 12, color: '#54524A', marginTop: 4, lineHeight: 1.5 }}>{a.reason}</p>
                          <p style={{ fontSize: 11, color: '#96948A', marginTop: 4, fontFamily: "'Geist Mono', ui-monospace, monospace" }}>{a.walletAddress.slice(0, 10)}…{a.walletAddress.slice(-4)} · screened by {a.provider}</p>
                        </div>
                        <div className="flex flex-col gap-1.5" style={{ flexShrink: 0 }}>
                          <button onClick={() => setPage("merchants")} style={{ fontSize: 11, fontWeight: 500, padding: '5px 12px', borderRadius: 7, border: '1px solid #DCDAD0', background: '#FFFFFF', cursor: 'pointer', color: '#54524A' }}>Review merchant</button>
                          <button onClick={() => openCare(a)} style={{ fontSize: 11, fontWeight: 500, padding: '5px 12px', borderRadius: 7, border: 'none', background: '#1B1A16', color: '#FFFFFF', cursor: 'pointer' }}>Get help</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Reconciliation exceptions */}
              {(alertsData?.reconExceptions?.length ?? 0) > 0 && (
                <div style={{ background: '#FFFFFF', border: '1px solid #E7E5DB', borderRadius: 14, boxShadow: '0 1px 2px rgba(27,26,22,0.04), 0 12px 32px -20px rgba(27,26,22,0.10)', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid #EFEDE4' }}><p style={{ fontSize: 12, fontWeight: 600, color: '#1D4ED8' }}>Reconciliation exceptions</p></div>
                  {alertsData.reconExceptions.map((a: any, i: number) => (
                    <div key={i} style={{ padding: '16px 20px', borderBottom: '1px solid #F4F3EC', borderLeft: '3px solid #1D4ED8' }}>
                      <div className="flex items-start justify-between gap-4">
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#1B1A16', fontFamily: "'Geist Mono', ui-monospace, monospace" }}>{a.batchRef}</p>
                          <ul style={{ fontSize: 12, color: '#54524A', marginTop: 4, lineHeight: 1.6, paddingLeft: 16, listStyle: 'disc' }}>
                            {a.exceptions.map((x: string, j: number) => <li key={j}>{x}</li>)}
                          </ul>
                          <p style={{ fontSize: 11, color: '#96948A', marginTop: 6, lineHeight: 1.5 }}>Exceptions usually follow from a blocked or failed payout in this batch — the money trail shows exactly where the difference is. They clear when the underlying payout is resolved.</p>
                        </div>
                        <div className="flex flex-col gap-1.5" style={{ flexShrink: 0 }}>
                          <button onClick={() => a.batchId && setSelectedId(a.batchId)} style={{ fontSize: 11, fontWeight: 500, padding: '5px 12px', borderRadius: 7, border: '1px solid #DCDAD0', background: '#FFFFFF', cursor: 'pointer', color: '#54524A' }}>View batch</button>
                          <button onClick={() => openCare(a)} style={{ fontSize: 11, fontWeight: 500, padding: '5px 12px', borderRadius: 7, border: 'none', background: '#1B1A16', color: '#FFFFFF', cursor: 'pointer' }}>Get help</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─ Audit & Compliance tab ─ */}
          {page === "audit" && (
            <div className="space-y-5">
              {/* Audit trail */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E7E5DB', borderRadius: 14, boxShadow: '0 1px 2px rgba(27,26,22,0.04), 0 12px 32px -20px rgba(27,26,22,0.10)', overflow: 'hidden' }}>
                <div className="flex items-center justify-between" style={{ padding: '12px 20px', borderBottom: '1px solid #ECEAE0' }}>
                  <h3 style={{ fontSize: 13, fontWeight: 500, color: '#1B1A16' }}>
                    <ClipboardList className="w-4 h-4 inline mr-1.5 -mt-0.5" style={{ color: '#2E6DB4' }} />
                    Audit Trail
                  </h3>
                  <button onClick={() => window.open("/api/audit/csv", "_blank")}
                    className="flex items-center gap-1.5 transition-colors" style={{ fontSize: 11, fontWeight: 500, color: '#6E6C62' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#1B1A16'} onMouseLeave={e => e.currentTarget.style.color = '#6E6C62'}>
                    <Download className="w-3.5 h-3.5" /> Export Audit Log
                  </button>
                </div>
                <div style={{ padding: '0 20px 12px', display: 'flex', gap: 4 }}>
                  <input value={auditSearch} onChange={e => setAuditSearch(e.target.value)} placeholder="Search action, ref, actor, detail…"
                    className="outline-none" style={{ width: 230, padding: '6px 12px', borderRadius: 8, fontSize: 11, border: '1px solid #DCDAD0', background: '#FFFFFF', color: '#1B1A16', marginRight: 8 }} />
                  {AUDIT_CATEGORIES.map(cat => (
                    <button key={cat.key} onClick={() => setAuditFilter(cat.key)}
                      className="transition-all"
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 500,
                        background: auditFilter === cat.key ? '#1B1A16' : 'transparent',
                        color: auditFilter === cat.key ? '#FFFFFF' : '#6E6C62',
                        border: 'none', cursor: 'pointer',
                      }}
                      onMouseEnter={e => { if (auditFilter !== cat.key) e.currentTarget.style.color = '#54524A'; }}
                      onMouseLeave={e => { if (auditFilter !== cat.key) e.currentTarget.style.color = '#6E6C62'; }}>
                      {cat.label}
                    </button>
                  ))}
                </div>
                <table className="w-full">
                  <thead>
                    <tr style={{ background: '#F8F7F2' }}>
                      <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62', padding: '8px 20px', textAlign: 'left' }}>Timestamp</th>
                      <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62', padding: '8px 16px', textAlign: 'left' }}>Action</th>
                      <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62', padding: '8px 16px', textAlign: 'left' }}>Entity</th>
                      <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62', padding: '8px 16px', textAlign: 'left' }}>Actor</th>
                      <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62', padding: '8px 16px', textAlign: 'left' }}>IP</th>
                      <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62', padding: '8px 20px', textAlign: 'left' }}>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAudit.map((e: any) => {
                      const actionColors: Record<string, string> = {
                        batch_completed: "#059669", payout_confirmed: "#059669",
                        login: "#1D4ED8", batch_funded: "#1D4ED8",
                      };
                      const color = actionColors[e.action] || "#6B7280";
                      return (
                        <tr key={e.id} className="transition-colors"
                          style={{ borderTop: '1px solid #EFEDE4' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F8F7F2'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '10px 20px', fontSize: 11, fontFamily: "'Geist Mono', ui-monospace, monospace", whiteSpace: 'nowrap', color: '#54524A' }}>
                            {e.createdAt ? timeAgo(e.createdAt) : "—"}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 99, background: `${color}18`, color }}>{e.action.replace(/_/g, " ")}</span>
                          </td>
                          <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: "'Geist Mono', ui-monospace, monospace", color: '#54524A' }}>
                            {e.entityRef?.startsWith("BATCH-") ? (
                              <button onClick={() => { const b = (batches as any[]).find((x: any) => x.batchRef === e.entityRef); if (b) setSelectedId(b.id); }} title="Open batch detail"
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: '#1D4ED8' }}
                                onMouseEnter={ev => ev.currentTarget.style.textDecoration = 'underline'} onMouseLeave={ev => ev.currentTarget.style.textDecoration = 'none'}>
                                {e.entityRef}
                              </button>
                            ) : (e.entityRef || "—")}
                          </td>
                          <td style={{ padding: '10px 16px', fontSize: 12, color: '#54524A' }}>{e.actor}</td>
                          <td style={{ padding: '10px 16px', fontSize: 11, fontFamily: "'Geist Mono', ui-monospace, monospace", color: '#54524A' }}>{e.ipAddress || "—"}</td>
                          <td style={{ padding: '10px 20px', fontSize: 12, color: '#54524A' }}>{e.detail}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {auditLoading ? (
                  <div style={{ padding: '40px 0', textAlign: 'center' }}>
                    <Loader2 className="w-6 h-6 mx-auto animate-spin" style={{ color: '#CBC9BF', marginBottom: 8 }} />
                    <p style={{ fontSize: 12, color: '#6E6C62' }}>Loading audit trail…</p>
                  </div>
                ) : filteredAudit.length === 0 && (
                  <div style={{ padding: '40px 0', textAlign: 'center' }}>
                    <ClipboardList className="w-8 h-8 mx-auto" style={{ color: '#CBC9BF', marginBottom: 8 }} />
                    <p style={{ fontSize: 12, color: '#6E6C62' }}>No audit entries match this filter.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─ Settings page ─ */}
          {page === "settings" && (
            <div className="space-y-5">
              {/* User Accounts */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E5E3D9', borderRadius: 16, padding: 24 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1B1A16', marginBottom: 2 }}>User Accounts</h3>
                    <p style={{ fontSize: 12, color: '#615F56' }}>{usersData.length} user{usersData.length !== 1 ? "s" : ""} registered</p>
                  </div>
                  {currentUser?.role === "admin" && (
                    <button onClick={() => setShowAddUser(true)}
                      style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: '#1B1A16', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>
                      <Plus className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Add User
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {usersData.map((user: any) => {
                    const isMe = currentUser?.email === user.email;
                    const initials = user.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
                    return (
                      <div key={user.id} className="flex items-center justify-between" style={{ padding: '12px 16px', borderRadius: 12, background: isMe ? '#EFF6FF' : '#F8F7F2', border: `1px solid ${isMe ? '#BFDBFE' : '#ECEAE0'}` }}>
                        <div className="flex items-center gap-3">
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: isMe ? '#1D4ED8' : user.status === "disabled" ? '#CBC9BF' : '#54524A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#FFFFFF' }}>
                            {initials}
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 500, color: user.status === "disabled" ? '#96948A' : '#1B1A16' }}>
                              {user.name} {isMe && <span style={{ fontSize: 10, color: '#1D4ED8', fontWeight: 600, marginLeft: 4 }}>YOU</span>}
                              {user.status === "disabled" && <span style={{ fontSize: 10, color: '#DC2626', fontWeight: 500, marginLeft: 4 }}>DISABLED</span>}
                            </p>
                            <p style={{ fontSize: 11, color: '#6E6C62', fontFamily: "'Geist Mono', ui-monospace, monospace" }}>{user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {currentUser?.role === "admin" && !isMe && (
                            <select value={user.role} onChange={e => updateUserMut.mutate({ id: user.id, role: e.target.value })}
                              style={{ fontSize: 10, padding: '3px 6px', borderRadius: 4, border: '1px solid #DCDAD0', background: '#FFFFFF', color: '#1B1A16', cursor: 'pointer' }}>
                              <option value="admin">Admin</option>
                              <option value="approver">Approver</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          )}
                          {currentUser?.role !== "admin" && (
                            <span style={{
                              fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 4,
                              background: user.role === "admin" ? '#FEE2E2' : user.role === "approver" ? '#DBEAFE' : '#F1F0E9',
                              color: user.role === "admin" ? '#DC2626' : user.role === "approver" ? '#1D4ED8' : '#6B7280',
                            }}>{user.role === "admin" ? "Admin" : user.role === "approver" ? "Approver" : "Viewer"}</span>
                          )}
                          {currentUser?.role === "admin" && !isMe && (
                            <>
                              <button onClick={() => updateUserMut.mutate({ id: user.id, status: user.status === "disabled" ? "active" : "disabled" })}
                                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid #DCDAD0', background: '#FFFFFF', cursor: 'pointer', color: user.status === "disabled" ? '#059669' : '#D97706' }}>
                                {user.status === "disabled" ? "Enable" : "Disable"}
                              </button>
                              <button onClick={() => { if (window.confirm(`Delete user ${user.name}? This cannot be undone.`)) deleteUserMut.mutate(user.id); }}
                                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid #FCA5A5', background: '#FFFFFF', cursor: 'pointer', color: '#DC2626' }}>
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: '#F8F7F2', border: '1px solid #ECEAE0' }}>
                  <p style={{ fontSize: 11, color: '#615F56' }}>
                    <strong>Admin</strong> — Full access: create batches, manage users, approve, advance.<br/>
                    <strong>Approver</strong> — Can approve batches created by others and advance status.<br/>
                    <strong>Viewer</strong> — Read-only. Cannot create or modify batches.
                  </p>
                </div>
              </div>

              {/* Approval Controls */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E5E3D9', borderRadius: 16, padding: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1B1A16', marginBottom: 4 }}>Approval Controls</h3>
                <p style={{ fontSize: 12, color: '#615F56', marginBottom: 16 }}>Configure how batches are approved before they can be advanced through the settlement flow.</p>
                <div className="flex items-center justify-between" style={{ padding: '16px 20px', borderRadius: 12, background: dualApproval ? '#EFF6FF' : '#F8F7F2', border: `1px solid ${dualApproval ? '#BFDBFE' : '#ECEAE0'}` }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: '#1B1A16' }}>Dual Approval</p>
                    <p style={{ fontSize: 11, color: '#615F56', marginTop: 2 }}>
                      When enabled, batches must be approved by a user different from the creator before they can be advanced. This prevents single-person fraud.
                    </p>
                  </div>
                  <button onClick={() => { if (currentUser?.role === "admin") setDualApproval(!dualApproval); }}
                    style={{
                      width: 44, height: 24, borderRadius: 12, border: 'none', cursor: currentUser?.role === "admin" ? 'pointer' : 'not-allowed',
                      background: dualApproval ? '#059669' : '#CBC9BF', position: 'relative', transition: 'background 0.2s',
                      opacity: currentUser?.role === "admin" ? 1 : 0.5,
                    }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', background: '#FFFFFF', position: 'absolute', top: 2,
                      left: dualApproval ? 22 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                </div>
                {currentUser?.role !== "admin" && (
                  <p style={{ fontSize: 10, color: '#DC2626', marginTop: 8 }}>Only administrators can change approval settings.</p>
                )}
                <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                  <p style={{ fontSize: 11, color: '#92400E' }}>
                    <strong>How it works:</strong> When a batch is created, it shows "Pending Approval" in the batch detail. A different user (Admin or Approver role) must click "Approve Batch" before the status can be advanced. The creator cannot approve their own batch.
                  </p>
                </div>
              </div>

              {/* Batch processing mode */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E5E3D9', borderRadius: 16, padding: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1B1A16', marginBottom: 4 }}>Batch Processing</h3>
                <p style={{ fontSize: 12, color: '#615F56', marginBottom: 16 }}>How a batch behaves once funds land in the collection account.</p>
                <div className="flex items-center justify-between" style={{ padding: '16px 20px', borderRadius: 12, background: autoProcess ? '#ECFDF5' : '#F8F7F2', border: `1px solid ${autoProcess ? '#A7F3D0' : '#ECEAE0'}` }}>
                  <div style={{ paddingRight: 16 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#1B1A16' }}>Auto-processing</p>
                    <p style={{ fontSize: 11, color: '#615F56', marginTop: 2, lineHeight: 1.5 }}>
                      When on, a funded batch runs straight through: fee deducted → converted at the live ECB rate → wallets screened → travel-rule data transmitted → USDC dispatched → completed. This matches production behaviour. Turn off to advance each stage manually (useful for walking someone through the flow).
                    </p>
                  </div>
                  <button onClick={() => setAutoProcess(!autoProcess)} aria-label="Toggle auto-processing"
                    style={{ width: 40, height: 22, borderRadius: 999, flexShrink: 0, border: 'none', cursor: 'pointer', background: autoProcess ? '#059669' : '#CBC9BF', position: 'relative', transition: 'background 0.2s' }}>
                    <span style={{ position: 'absolute', top: 2, width: 18, height: 18, borderRadius: '50%', background: '#FFFFFF', left: autoProcess ? 20 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </button>
                </div>
                <p style={{ fontSize: 11, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', marginTop: 12, lineHeight: 1.5 }}>
                  <strong>Note:</strong> approval still gates everything — an unapproved batch will not process past funding, in either mode. Blocked wallets always stop that payout only; the rest of the batch continues.
                </p>
              </div>

              {/* Password — demo only */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E5E3D9', borderRadius: 16, padding: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1B1A16', marginBottom: 4 }}>Demo Mode</h3>
                <p style={{ fontSize: 12, color: '#615F56', marginBottom: 12 }}>This is a demo environment. All accounts share the password <code style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: '#F4F3EC', border: '1px solid #ECEAE0' }}>demo123</code></p>
                <p style={{ fontSize: 11, color: '#6E6C62' }}>
                  To test dual approval: create a batch as Julija, sign out, sign in as Vaiva, then approve the batch.
                </p>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="text-center" style={{ paddingTop: 16, paddingBottom: 32 }}>
            <p style={{ fontSize: 11, color: '#AAAAAA' }}>
              This dashboard is confidential. &copy; 2026 Paystrax.
            </p>
            <p style={{ fontSize: 10, color: '#B8B6AC', marginTop: 6, letterSpacing: '0.04em' }}>
              Powered by <span style={{ fontWeight: 600, color: '#0F766E' }}>Fybrus</span>
              <span style={{ color: '#34D399', fontWeight: 600 }}>.</span>
            </p>
          </div>
        </main>
      </div>

      {/* ─ Upload dialog ─ */}
      <Overlay open={showUpload} onClose={() => { setShowUpload(false); setUploadErr(null); resetBatchOpts(); setUploadStep("idle"); setParsedRows([]); setCreatedBatch(null); }} wide={uploadStep === "preview" || uploadStep === "submitting" || uploadStep === "success"}>

        {/* ── Step 1: Upload form (idle) ── */}
        {uploadStep === "idle" && (<>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1B1A16', marginBottom: 4 }}>Upload Payout Batch</h3>
          <p style={{ fontSize: 12, color: '#615F56', marginBottom: 16 }}>Upload a CSV file with your merchant payouts for this settlement cycle.</p>

          {/* Currency + Timing */}
          <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 16, padding: 12, borderRadius: 12, border: '1px solid #E5E3D9', background: '#F4F3EC' }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 6, color: '#6E6C62' }}>Funding Currency</label>
              <div className="flex gap-1.5">
                {(["EUR", "USD", "AUD"] as const).map(c => (
                  <button key={c} onClick={() => setBatchCurrency(c)}
                    className="flex-1 transition-all"
                    style={{
                      padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 500,
                      border: batchCurrency === c ? '1px solid #93C5FD' : '1px solid #E5E3D9',
                      background: batchCurrency === c ? '#EFF6FF' : '#FFFFFF',
                      color: batchCurrency === c ? '#1D4ED8' : '#6E6C62',
                    }}>
                    {{ EUR: "€", USD: "$", AUD: "A$" }[c]} {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 6, color: '#6E6C62' }}>Payout Timing</label>
              <div className="flex gap-1.5">
                {[["asap", "ASAP"], ["scheduled", "Schedule"]].map(([val, label]) => (
                  <button key={val} onClick={() => setBatchTiming(val)}
                    className="flex-1 transition-all"
                    style={{
                      padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 500,
                      border: batchTiming === val ? '1px solid #93C5FD' : '1px solid #E5E3D9',
                      background: batchTiming === val ? '#EFF6FF' : '#FFFFFF',
                      color: batchTiming === val ? '#1D4ED8' : '#6E6C62',
                    }}>
                    {label}
                  </button>
                ))}
              </div>
              {batchTiming === "scheduled" && (
                <input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)}
                  className="w-full outline-none"
                  style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, fontSize: 12, border: '1px solid #DCDAD0', background: '#FFFFFF', color: '#1B1A16' }}
                  onFocus={e => e.currentTarget.style.borderColor = '#1B1A16'} onBlur={e => e.currentTarget.style.borderColor = '#DCDAD0'} />
              )}
            </div>
          </div>

          <div style={{ borderRadius: 12, padding: 12, marginBottom: 16, border: '1px solid #E5E3D9', background: '#F4F3EC' }}>
            <p style={{ fontSize: 11, fontWeight: 500, marginBottom: 8, color: '#6E6C62' }}>Required CSV columns:</p>
            <p style={{ fontSize: 10, color: '#96948A', marginBottom: 8 }}>A 9 bps (0.09%) platform fee is deducted from the batch total before conversion to USDC.</p>
            <div className="flex gap-2">
              {["merchant_name", "amount", "wallet_address"].map(col => (
                <code key={col} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: '#DBEAFE', color: '#1D4ED8' }}>{col}</code>
              ))}
            </div>
            <button onClick={downloadTemplate} className="flex items-center gap-1" style={{ fontSize: 11, marginTop: 8, color: '#1D4ED8' }}>
              <FileDown className="w-3 h-3" /> Download template CSV
            </button>
          </div>

          <div className="text-center cursor-pointer transition-colors"
            style={{ border: '2px dashed #DCDAD0', borderRadius: 12, padding: 24, background: '#FFFFFF' }}
            onClick={() => fileRef.current?.click()}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#CBC9BF'} onMouseLeave={e => e.currentTarget.style.borderColor = '#DCDAD0'}>
            <Upload className="w-8 h-8 mx-auto" style={{ color: '#CBC9BF', marginBottom: 8 }} />
            <p style={{ fontSize: 13, fontWeight: 500, color: '#1B1A16' }}>Click to select CSV file</p>
            <p style={{ fontSize: 11, color: '#6E6C62', marginTop: 4 }}>Supports .csv files up to 10MB</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setUploadStep("loading"); parseCSV(f); } }} />
          </div>

          {/* Demo button */}
          <div className="flex items-center justify-center" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #ECEAE0' }}>
            <button onClick={() => { setUploadStep("loading"); setParsedRows(demoRows); setTimeout(() => setUploadStep("preview"), 2200); }}
              className="flex items-center gap-2 transition-all"
              style={{ padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: '1px solid #E5E3D9', color: '#615F56', background: '#FFFFFF' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#1B1A16'; e.currentTarget.style.color = '#1B1A16'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E3D9'; e.currentTarget.style.color = '#615F56'; }}>
              <Eye className="w-3.5 h-3.5" /> Try Demo CSV
            </button>
          </div>

          {uploadErr && <div className="flex items-center gap-2" style={{ padding: 12, borderRadius: 8, marginTop: 12, background: '#FEF2F2' }}><AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#EF4444' }} /><p style={{ fontSize: 12, color: '#DC2626' }}>{uploadErr}</p></div>}
        </>)}

        {/* ── Step 2: Loading ── */}
        {uploadStep === "loading" && (
          <div className="flex flex-col items-center justify-center" style={{ padding: '48px 0' }}>
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#1B1A16', marginBottom: 16 }} />
            <p style={{ fontSize: 14, fontWeight: 500, color: '#1B1A16' }}>Parsing CSV file...</p>
            <p style={{ fontSize: 11, color: '#6E6C62', marginTop: 4 }}>Validating {parsedRows.length || '...'} merchant records</p>
            <div style={{ width: 200, height: 4, borderRadius: 2, background: '#ECEAE0', marginTop: 16, overflow: 'hidden' }}>
              <div style={{ width: '70%', height: '100%', borderRadius: 2, background: '#1B1A16', animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
          </div>
        )}

        {/* ── Step 3: Approval preview (also shown during submitting) ── */}
        {(uploadStep === "preview" || uploadStep === "submitting") && (() => {
          const sym = ({ EUR: "€", USD: "$", AUD: "A$" } as any)[batchCurrency] || "€";
          const total = parsedRows.reduce((s, r) => s + r.amount, 0);
          const isDemo = parsedRows === demoRows;
          return (
            <>
              <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1B1A16' }}>Review Batch</h3>
                  <p style={{ fontSize: 12, color: '#615F56', marginTop: 2 }}>{isDemo ? "Demo data — this will create a real batch with sample merchants." : "Review the parsed entries before creating this batch."}</p>
                </div>
                <span style={{ fontSize: 10, fontWeight: 500, padding: '4px 10px', borderRadius: 4, background: '#FFFBEB', color: '#D97706' }}>Pending Approval</span>
              </div>

              {/* Summary strip */}
              <div className="grid grid-cols-4 gap-3" style={{ marginBottom: 20 }}>
                {[
                  { label: "Merchants", value: parsedRows.length.toString() },
                  { label: "Currency", value: batchCurrency },
                  { label: "Timing", value: batchTiming === "asap" ? "ASAP" : batchDate || "Scheduled" },
                  { label: "Total", value: `${sym}${total.toLocaleString("en", { minimumFractionDigits: 2 })}` },
                ].map(s => (
                  <div key={s.label} style={{ padding: '10px 12px', borderRadius: 8, background: '#F4F3EC', border: '1px solid #ECEAE0' }}>
                    <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62' }}>{s.label}</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#1B1A16', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Per-merchant table */}
              <div style={{ border: '1px solid #E5E3D9', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
                <table className="w-full">
                  <thead>
                    <tr style={{ background: '#F8F7F2' }}>
                      {["#", "Merchant", "Amount", "Wallet Address", "Status"].map(h => (
                        <th key={h} style={{ padding: '8px 12px', fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62', textAlign: 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #EFEDE4' }}>
                        <td style={{ padding: '10px 12px', fontSize: 11, color: '#6E6C62' }}>{i + 1}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 500, color: '#1B1A16' }}>{r.name}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#1B1A16', fontVariantNumeric: 'tabular-nums' }}>{sym}{r.amount.toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 12px', fontSize: 11, fontFamily: "'Geist Mono', ui-monospace, monospace", color: '#54524A' }}>{r.wallet.slice(0, 8)}...{r.wallet.slice(-4)}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 4, background: '#ECFDF5', color: '#059669' }}>Valid</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {uploadErr && <div className="flex items-center gap-2" style={{ padding: 12, borderRadius: 8, marginBottom: 16, background: '#FEF2F2' }}><AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#EF4444' }} /><p style={{ fontSize: 12, color: '#DC2626' }}>{uploadErr}</p></div>}

              {/* Actions */}
              <div className="flex items-center justify-between">
                <button onClick={() => { setUploadStep("idle"); setParsedRows([]); setUploadErr(null); }}
                  className="transition-all"
                  style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#6E6C62', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#1B1A16'} onMouseLeave={e => e.currentTarget.style.color = '#6E6C62'}>
                  ← Back to Upload
                </button>
                <div className="flex gap-2">
                  <button onClick={() => { setShowUpload(false); setUploadStep("idle"); setParsedRows([]); setUploadErr(null); }}
                    className="transition-all"
                    style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, border: '1px solid #E5E3D9', color: '#615F56', background: '#FFFFFF', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#CBC9BF'} onMouseLeave={e => e.currentTarget.style.borderColor = '#E5E3D9'}>
                    Cancel
                  </button>
                  <button
                    disabled={uploadStep === "submitting"}
                    onClick={() => submitBatch(parsedRows)}
                    className="transition-all"
                    style={{ padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: uploadStep === "submitting" ? '#615F56' : '#1B1A16', color: '#FFFFFF', cursor: uploadStep === "submitting" ? 'not-allowed' : 'pointer', border: 'none', display: 'flex', alignItems: 'center', gap: 8 }}
                    onMouseEnter={e => { if (uploadStep !== "submitting") e.currentTarget.style.background = '#222222'; }} onMouseLeave={e => { if (uploadStep !== "submitting") e.currentTarget.style.background = '#1B1A16'; }}>
                    {uploadStep === "submitting" && <Loader2 className="w-4 h-4 animate-spin" />}
                    {uploadStep === "submitting" ? "Creating Batch..." : "Approve & Create Batch"}
                  </button>
                </div>
              </div>
            </>
          );
        })()}

        {/* ── Step 4: Success ── */}
        {uploadStep === "success" && createdBatch && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle2 style={{ width: 24, height: 24, color: '#059669' }} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1B1A16', marginBottom: 4 }}>Batch Created Successfully</h3>
            <p style={{ fontSize: 12, color: '#615F56', marginBottom: 20 }}>Your payout batch has been submitted and is awaiting funding.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24, textAlign: 'left' }}>
              <div style={{ padding: '12px', borderRadius: 8, background: '#F4F3EC', border: '1px solid #ECEAE0' }}>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#6E6C62' }}>Batch Reference</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1B1A16', marginTop: 4, fontFamily: "'Geist Mono', ui-monospace, monospace" }}>{createdBatch.batchRef}</p>
              </div>
              <div style={{ padding: '12px', borderRadius: 8, background: '#F4F3EC', border: '1px solid #ECEAE0' }}>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#6E6C62' }}>Total Amount</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1B1A16', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                  {({ EUR: "€", USD: "$", AUD: "A$" } as any)[createdBatch.currency] || "€"}{parseFloat(createdBatch.totalFiat || createdBatch.totalEur).toLocaleString("en", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div style={{ padding: '12px', borderRadius: 8, background: '#F4F3EC', border: '1px solid #ECEAE0' }}>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#6E6C62' }}>Merchants</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1B1A16', marginTop: 4 }}>{createdBatch.merchantCount} payees</p>
              </div>
            </div>

            <div style={{ padding: 16, borderRadius: 12, background: '#FFFBEB', border: '1px solid #FDE68A', marginBottom: 24, textAlign: 'left' }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: '#92400E', marginBottom: 10 }}>Next Step: Fund this batch</p>
              <p style={{ fontSize: 11, color: '#D97706', marginBottom: 12 }}>Transfer to the account below. Use your batch reference as the payment reference.</p>
              <div style={{ background: '#FFFFFF', borderRadius: 8, border: '1px solid #FDE68A', padding: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: "Account Name", value: "Paystrax Ltd" },
                    { label: "IBAN", value: "IE29 AIBK 9311 5212 3456 78" },
                    { label: "BIC / SWIFT", value: "AIBKIE2D" },
                    { label: "Bank", value: "AIB, Dublin" },
                    { label: "Payment Reference", value: createdBatch?.batchRef || "—" },
                    { label: "Amount", value: `${({ EUR: "€", USD: "$", AUD: "A$" } as any)[createdBatch?.currency] || "€"}${parseFloat(createdBatch?.totalFiat || createdBatch?.totalEur || 0).toLocaleString("en", { minimumFractionDigits: 2 })} ${createdBatch?.currency || "EUR"}` },
                  ].map(r => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 10, color: '#92400E' }}>{r.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#1B1A16', fontFamily: r.label === "IBAN" || r.label === "BIC / SWIFT" || r.label === "Payment Reference" ? 'monospace' : 'inherit' }}>{r.value}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => copyText("IE29AIBK93115212345678")}
                  className="flex items-center gap-1.5 w-full justify-center transition-colors"
                  style={{ marginTop: 10, padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 500, border: '1px solid #FDE68A', color: '#92400E', background: 'transparent', cursor: 'pointer' }}>
                  <Copy className="w-3 h-3" /> Copy IBAN to Clipboard
                </button>
              </div>
              <p style={{ fontSize: 10, color: '#D97706', marginTop: 6 }}>Demo IBAN — replace with live details before production use</p>
            </div>

            <div className="flex justify-center gap-2">
              <button onClick={() => { setShowUpload(false); setUploadStep("idle"); setParsedRows([]); setCreatedBatch(null); resetBatchOpts(); setPage("batches"); }}
                style={{ padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: '#1B1A16', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>
                View Batches
              </button>
              <button onClick={() => { setUploadStep("idle"); setParsedRows([]); setCreatedBatch(null); }}
                style={{ padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: '#FFFFFF', color: '#615F56', border: '1px solid #E5E3D9', cursor: 'pointer' }}>
                Upload Another
              </button>
            </div>
          </div>
        )}

      </Overlay>

      {/* ─ Manual entry dialog ─ */}
      <Overlay open={showManual} onClose={() => { setShowManual(false); resetBatchOpts(); }} wide>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1B1A16', marginBottom: 4 }}>Manual Payout Entry</h3>
        <p style={{ fontSize: 12, color: '#615F56', marginBottom: 16 }}>Add individual merchant payouts. These will be grouped into a single batch.</p>

        {/* Currency + Timing */}
        <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 16, padding: 12, borderRadius: 12, border: '1px solid #E5E3D9', background: '#F4F3EC' }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 6, color: '#6E6C62' }}>Funding Currency</label>
            <div className="flex gap-1.5">
              {(["EUR", "USD", "AUD"] as const).map(c => (
                <button key={c} onClick={() => setBatchCurrency(c)}
                  className="flex-1 transition-all"
                  style={{
                    padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 500,
                    border: batchCurrency === c ? '1px solid #93C5FD' : '1px solid #E5E3D9',
                    background: batchCurrency === c ? '#EFF6FF' : '#FFFFFF',
                    color: batchCurrency === c ? '#1D4ED8' : '#6E6C62',
                  }}>
                  {{ EUR: "€", USD: "$", AUD: "A$" }[c]} {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 6, color: '#6E6C62' }}>Payout Timing</label>
            <div className="flex gap-1.5">
              {[["asap", "ASAP"], ["scheduled", "Schedule"]].map(([val, label]) => (
                <button key={val} onClick={() => setBatchTiming(val)}
                  className="flex-1 transition-all"
                  style={{
                    padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 500,
                    border: batchTiming === val ? '1px solid #93C5FD' : '1px solid #E5E3D9',
                    background: batchTiming === val ? '#EFF6FF' : '#FFFFFF',
                    color: batchTiming === val ? '#1D4ED8' : '#6E6C62',
                  }}>
                  {label}
                </button>
              ))}
            </div>
            {batchTiming === "scheduled" && (
              <input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)}
                className="w-full outline-none"
                style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, fontSize: 12, border: '1px solid #DCDAD0', background: '#FFFFFF', color: '#1B1A16' }}
                onFocus={e => e.currentTarget.style.borderColor = '#1B1A16'} onBlur={e => e.currentTarget.style.borderColor = '#DCDAD0'} />
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
                style={{ padding: '10px 12px', borderRadius: 8, fontSize: 13, border: '1px solid #DCDAD0', background: '#FFFFFF', color: '#1B1A16' }}
                onFocus={ev => ev.currentTarget.style.borderColor = '#1B1A16'} onBlur={ev => ev.currentTarget.style.borderColor = '#DCDAD0'}
                onChange={ev => {
                  const u = [...entries]; u[i].merchantName = ev.target.value;
                  // Auto-fill the registered wallet when the name matches a registered merchant
                  const match = merchants.find((m: any) => m.name === ev.target.value && m.status !== "disabled");
                  if (match && !u[i].walletAddress) u[i].walletAddress = match.walletAddress;
                  setEntries(u);
                }} />
              <input placeholder={`${({ EUR: "€", USD: "$", AUD: "A$" } as any)[batchCurrency]} Amount`} type="number" value={e.amount}
                className="w-28 outline-none"
                style={{ padding: '10px 12px', borderRadius: 8, fontSize: 13, border: '1px solid #DCDAD0', background: '#FFFFFF', color: '#1B1A16' }}
                onFocus={ev => ev.currentTarget.style.borderColor = '#1B1A16'} onBlur={ev => ev.currentTarget.style.borderColor = '#DCDAD0'}
                onChange={ev => { const u = [...entries]; u[i].amount = ev.target.value; setEntries(u); }} />
              <div className="flex-[1.5] flex flex-col">
                <input placeholder="0x... wallet address" value={e.walletAddress}
                  className="w-full outline-none"
                  style={{ padding: '10px 12px', borderRadius: 8, fontSize: 12, fontFamily: "'Geist Mono', ui-monospace, monospace", border: `1px solid ${e.walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(e.walletAddress) ? '#DC2626' : '#DCDAD0'}`, background: '#FFFFFF', color: '#1B1A16' }}
                  onFocus={ev => ev.currentTarget.style.borderColor = '#1B1A16'} onBlur={ev => ev.currentTarget.style.borderColor = e.walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(e.walletAddress) ? '#DC2626' : '#DCDAD0'}
                  onChange={ev => { const u = [...entries]; u[i].walletAddress = ev.target.value; setEntries(u); }} />
                {e.walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(e.walletAddress) && (
                  <span style={{ fontSize: 10, color: '#DC2626', marginTop: 2 }}>Invalid wallet address format (expected 0x + 40 hex chars)</span>
                )}
              </div>
              {entries.length > 1 && (
                <button style={{ color: '#CBC9BF' }} className="transition-colors"
                  onMouseEnter={e => e.currentTarget.style.color = '#DC2626'} onMouseLeave={e => e.currentTarget.style.color = '#CBC9BF'}
                  onClick={() => setEntries(entries.filter((_, j) => j !== i))}
                  aria-label="Remove entry"><X className="w-4 h-4" /></button>
              )}
            </div>
          ))}
        </div>
        <button className="flex items-center gap-1 transition-colors" style={{ fontSize: 11, marginTop: 8, color: '#6E6C62' }}
          onMouseEnter={e => e.currentTarget.style.color = '#54524A'} onMouseLeave={e => e.currentTarget.style.color = '#6E6C62'}
          onClick={() => setEntries([...entries, { merchantName: "", amount: "", walletAddress: "" }])}>
          <Plus className="w-3 h-3" /> Add another merchant
        </button>
        {entries.filter(e => e.amount).length > 0 && (
          <p style={{ fontSize: 12, marginTop: 8, color: '#54524A' }}>
            Batch total: <span style={{ fontWeight: 500, color: '#1B1A16' }}>{({ EUR: "€", USD: "$", AUD: "A$" } as any)[batchCurrency]}{entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0).toLocaleString("en", { minimumFractionDigits: 2 })}</span>
            {" "}<span style={{ color: '#96948A' }}>· Platform fee (9 bps): {({ EUR: "€", USD: "$", AUD: "A$" } as any)[batchCurrency]}{(entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0) * 0.0009).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — deducted before conversion</span>
            {" "}<span style={{ color: '#6E6C62' }}>{batchCurrency}</span>
            {batchTiming === "scheduled" && batchDate && <span style={{ color: '#6E6C62' }}> &middot; Scheduled: {new Date(batchDate).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}</span>}
          </p>
        )}
        <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
          <button onClick={() => { setShowManual(false); resetBatchOpts(); }}
            style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, color: '#6E6C62', background: 'transparent' }}>Cancel</button>
          <button className="disabled:opacity-40"
            style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: '#1B1A16', color: '#FFFFFF' }}
            disabled={entries.some(e => !e.merchantName || !e.amount || !e.walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(e.walletAddress)) || manualMut.isPending}
            onClick={() => manualMut.mutate(entries)}>
            {manualMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1.5" />}Create Batch
          </button>
        </div>
        {manualMut.isError && <div className="flex items-center gap-2" style={{ padding: 12, borderRadius: 8, marginTop: 12, background: '#FEF2F2' }}><AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#EF4444' }} /><p style={{ fontSize: 12, color: '#DC2626' }}>{(manualMut.error as Error)?.message || "Failed to create batch"}</p></div>}
      </Overlay>

      {/* ─ Add user dialog ─ */}
      <Overlay open={showAddUser} onClose={() => setShowAddUser(false)}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1B1A16', marginBottom: 4 }}>Add New User</h3>
        <p style={{ fontSize: 12, color: '#615F56', marginBottom: 16 }}>Create a new user account for the Paystrax dashboard.</p>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: '#6E6C62', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Full Name</label>
            <input value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} placeholder="e.g. Jane Smith"
              className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #DCDAD0', fontSize: 13, color: '#1B1A16' }} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: '#6E6C62', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Email</label>
            <input value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} placeholder="e.g. jane@paystraxdemo.com"
              className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #DCDAD0', fontSize: 13, color: '#1B1A16' }} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: '#6E6C62', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Role</label>
            <div className="flex gap-2">
              {(["admin", "approver", "viewer"] as const).map(r => (
                <button key={r} onClick={() => setNewUser({ ...newUser, role: r })}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, textTransform: 'capitalize' as const, cursor: 'pointer',
                    background: newUser.role === r ? '#1B1A16' : '#FFFFFF', color: newUser.role === r ? '#FFFFFF' : '#54524A',
                    border: `1px solid ${newUser.role === r ? '#1B1A16' : '#DCDAD0'}`,
                  }}>{r}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: '#6E6C62', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Password</label>
            <input value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })}
              className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #DCDAD0', fontSize: 13, color: '#1B1A16' }} />
            <p style={{ fontSize: 10, color: '#AAAAAA', marginTop: 4 }}>Default: demo123</p>
          </div>
        </div>
        {addUserMut.isError && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 8 }}>{(addUserMut.error as Error).message}</p>}
        <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
          <button onClick={() => setShowAddUser(false)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#615F56', background: 'transparent', border: '1px solid #E5E3D9', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => addUserMut.mutate(newUser)}
            disabled={!newUser.name || !newUser.email || addUserMut.isPending}
            className="disabled:opacity-40"
            style={{ padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: '#1B1A16', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>
            {addUserMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : null}Create User
          </button>
        </div>
      </Overlay>

      {/* ─ Edit merchant dialog ─ */}
      <Overlay open={!!editingMerchant} onClose={() => setEditingMerchant(null)}>
        {editingMerchant && (<>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1B1A16', marginBottom: 4 }}>Edit Merchant</h3>
          <p style={{ fontSize: 12, color: '#615F56', marginBottom: 16 }}>Update merchant details.</p>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: '#6E6C62', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Merchant Name</label>
              <input value={editingMerchant.name} onChange={e => setEditingMerchant({ ...editingMerchant, name: e.target.value })}
                className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #DCDAD0', fontSize: 13, color: '#1B1A16' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: '#6E6C62', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Wallet Address</label>
              <input value={editingMerchant.walletAddress} onChange={e => setEditingMerchant({ ...editingMerchant, walletAddress: e.target.value })}
                className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #DCDAD0', fontSize: 12, color: '#1B1A16', fontFamily: "'Geist Mono', ui-monospace, monospace" }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: '#6E6C62', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Email (optional)</label>
              <input value={editingMerchant.email || ""} onChange={e => setEditingMerchant({ ...editingMerchant, email: e.target.value })}
                className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #DCDAD0', fontSize: 13, color: '#1B1A16' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: '#6E6C62', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>KYC Reference (relying party case #)</label>
              <input value={editingMerchant.kycRef || ""} onChange={e => setEditingMerchant({ ...editingMerchant, kycRef: e.target.value })}
                placeholder="e.g. PSX-KYC-4F2A91"
                className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #DCDAD0', fontSize: 12, color: '#1B1A16', fontFamily: "'Geist Mono', ui-monospace, monospace" }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: '#6E6C62', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Markup (bps)</label>
                <input type="number" min={0} max={1000} value={editingMerchant.markupBps ?? ""} onChange={e => setEditingMerchant({ ...editingMerchant, markupBps: e.target.value })}
                  placeholder={`default (${settings?.defaultMarkupBps ?? 25})`}
                  className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #DCDAD0', fontSize: 13, fontFamily: "'Geist Mono', ui-monospace, monospace", color: '#1B1A16' }} />
                <span style={{ fontSize: 9, color: '#96948A' }}>blank = use platform default</span>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: '#6E6C62', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Payout method</label>
                <div className="flex gap-1.5">
                  {[["stablecoin", "Stablecoin"], ["fiat", "Fiat"]].map(([v, l]) => (
                    <button key={v} onClick={() => setEditingMerchant({ ...editingMerchant, payoutMethod: v })}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                        border: '1px solid ' + ((editingMerchant.payoutMethod || 'stablecoin') === v ? '#1B1A16' : '#DCDAD0'),
                        background: (editingMerchant.payoutMethod || 'stablecoin') === v ? '#1B1A16' : '#FFFFFF',
                        color: (editingMerchant.payoutMethod || 'stablecoin') === v ? '#FFFFFF' : '#54524A' }}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {updateMerchantMut.isError && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 8 }}>{(updateMerchantMut.error as Error).message}</p>}
          <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
            <button onClick={() => setEditingMerchant(null)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#615F56', background: 'transparent', border: '1px solid #E5E3D9', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => updateMerchantMut.mutate({ id: editingMerchant.id, name: editingMerchant.name, walletAddress: editingMerchant.walletAddress, email: editingMerchant.email, kycRef: editingMerchant.kycRef, markupBps: editingMerchant.markupBps === "" ? null : editingMerchant.markupBps, payoutMethod: editingMerchant.payoutMethod })}
              disabled={!editingMerchant.name || !editingMerchant.walletAddress || updateMerchantMut.isPending}
              className="disabled:opacity-40"
              style={{ padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: '#1B1A16', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>
              {updateMerchantMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : null}Save Changes
            </button>
          </div>
        </>)}
      </Overlay>

      {/* ─ Add merchant dialog ─ */}
      <Overlay open={showAddMerchant} onClose={() => setShowAddMerchant(false)}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1B1A16', marginBottom: 4 }}>Register Merchant</h3>
        <p style={{ fontSize: 12, color: '#615F56', marginBottom: 16 }}>Register a merchant's stablecoin wallet address. This only needs to be done once per merchant.</p>
        <div className="space-y-3">
          <div>
            <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', display: 'block', marginBottom: 4, color: '#6E6C62', textTransform: 'uppercase' as const }}>Merchant Name</label>
            <input value={newMerchant.name} onChange={e => setNewMerchant({ ...newMerchant, name: e.target.value })}
              placeholder="e.g. TechFlow Solutions"
              className="w-full outline-none"
              style={{ padding: '10px 12px', borderRadius: 8, fontSize: 13, border: '1px solid #DCDAD0', background: '#FFFFFF', color: '#1B1A16' }}
              onFocus={e => e.currentTarget.style.borderColor = '#1B1A16'} onBlur={e => e.currentTarget.style.borderColor = '#DCDAD0'} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', display: 'block', marginBottom: 4, color: '#6E6C62', textTransform: 'uppercase' as const }}>Wallet Address</label>
            <input value={newMerchant.walletAddress} onChange={e => setNewMerchant({ ...newMerchant, walletAddress: e.target.value })}
              placeholder="0x..."
              className="w-full outline-none"
              style={{ padding: '10px 12px', borderRadius: 8, fontSize: 13, fontFamily: "'Geist Mono', ui-monospace, monospace", border: `1px solid ${newMerchant.walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(newMerchant.walletAddress) ? '#DC2626' : '#DCDAD0'}`, background: '#FFFFFF', color: '#1B1A16' }}
              onFocus={e => e.currentTarget.style.borderColor = '#1B1A16'} onBlur={e => e.currentTarget.style.borderColor = newMerchant.walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(newMerchant.walletAddress) ? '#DC2626' : '#DCDAD0'} />
            {newMerchant.walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(newMerchant.walletAddress) && (
              <span style={{ fontSize: 10, color: '#DC2626', marginTop: 4, display: 'block' }}>Invalid wallet address format (expected 0x + 40 hex chars)</span>
            )}
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', display: 'block', marginBottom: 4, color: '#6E6C62', textTransform: 'uppercase' as const }}>Email (optional)</label>
            <input value={newMerchant.email} onChange={e => setNewMerchant({ ...newMerchant, email: e.target.value })}
              placeholder="finance@merchant.com"
              className="w-full outline-none"
              style={{ padding: '10px 12px', borderRadius: 8, fontSize: 13, border: '1px solid #DCDAD0', background: '#FFFFFF', color: '#1B1A16' }}
              onFocus={e => e.currentTarget.style.borderColor = '#1B1A16'} onBlur={e => e.currentTarget.style.borderColor = '#DCDAD0'} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', display: 'block', marginBottom: 4, color: '#6E6C62', textTransform: 'uppercase' as const }}>KYC Reference (relying party case #)</label>
            <input value={newMerchant.kycRef} onChange={e => setNewMerchant({ ...newMerchant, kycRef: e.target.value })}
              placeholder="e.g. PSX-KYC-4F2A91"
              className="w-full outline-none"
              style={{ padding: '10px 12px', borderRadius: 8, fontSize: 13, fontFamily: "'Geist Mono', ui-monospace, monospace", border: '1px solid #DCDAD0', background: '#FFFFFF', color: '#1B1A16' }}
              onFocus={e => e.currentTarget.style.borderColor = '#1B1A16'} onBlur={e => e.currentTarget.style.borderColor = '#DCDAD0'} />
            <span style={{ fontSize: 10, color: '#96948A', marginTop: 4, display: 'block' }}>KYC is performed by the relying party (Paystrax as acquirer) — record their case reference here.</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', display: 'block', marginBottom: 4, color: '#6E6C62', textTransform: 'uppercase' as const }}>Markup (bps)</label>
              <input type="number" min={0} max={1000} value={newMerchant.markupBps} onChange={e => setNewMerchant({ ...newMerchant, markupBps: e.target.value })}
                placeholder={`default (${settings?.defaultMarkupBps ?? 25})`}
                className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, fontSize: 13, fontFamily: "'Geist Mono', ui-monospace, monospace", border: '1px solid #DCDAD0', color: '#1B1A16' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', display: 'block', marginBottom: 4, color: '#6E6C62', textTransform: 'uppercase' as const }}>Payout method</label>
              <div className="flex gap-1.5">
                {[["stablecoin", "Stablecoin"], ["fiat", "Fiat"]].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setNewMerchant({ ...newMerchant, payoutMethod: v })}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      border: '1px solid ' + (newMerchant.payoutMethod === v ? '#1B1A16' : '#DCDAD0'),
                      background: newMerchant.payoutMethod === v ? '#1B1A16' : '#FFFFFF',
                      color: newMerchant.payoutMethod === v ? '#FFFFFF' : '#54524A' }}>{l}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2" style={{ marginTop: 20 }}>
          <button onClick={() => setShowAddMerchant(false)}
            style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, color: '#6E6C62', background: 'transparent' }}>Cancel</button>
          <button className="disabled:opacity-40"
            style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: '#1B1A16', color: '#FFFFFF' }}
            disabled={!newMerchant.name || !newMerchant.walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(newMerchant.walletAddress) || addMerchantMut.isPending}
            onClick={() => addMerchantMut.mutate(newMerchant)}>
            {addMerchantMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1.5" />}Register Merchant
          </button>
        </div>
      </Overlay>

      {/* ─ Fybrus Customer Care dialog ─ */}
      <Overlay open={!!careTarget} onClose={() => { setCareTarget(null); setCareTicket(null); }}>
        {careTarget && !careTicket && (<>
          <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
            <LifeBuoy style={{ width: 16, height: 16, color: '#1D4ED8' }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1B1A16' }}>Fybrus Customer Care</h3>
          </div>
          <p style={{ fontSize: 12, color: '#615F56', marginBottom: 14 }}>Describe what you need — the alert context is attached automatically. Typical first reply: within 2 business hours.</p>
          <div style={{ fontSize: 11, lineHeight: 1.5, color: '#54524A', background: '#F8F7F2', border: '1px solid #ECEAE0', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
            <strong>Attached context:</strong> {careTarget.reason}{careTarget.batchRef ? ` (${careTarget.batchRef})` : ""}
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: '#6E6C62', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Subject</label>
              <input value={careSubject} onChange={e => setCareSubject(e.target.value)}
                className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #DCDAD0', fontSize: 13, color: '#1B1A16' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: '#6E6C62', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>Message</label>
              <textarea value={careMessage} onChange={e => setCareMessage(e.target.value)} rows={4}
                placeholder="e.g. We believe this wallet was flagged in error — the merchant has been settled to this address since March."
                className="w-full outline-none" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #DCDAD0', fontSize: 13, color: '#1B1A16', resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
          </div>
          {careMut.isError && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 8 }}>{(careMut.error as Error).message}</p>}
          <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
            <button onClick={() => setCareTarget(null)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#615F56', background: 'transparent', border: '1px solid #E5E3D9', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => careMut.mutate()} disabled={!careSubject || careMut.isPending}
              className="disabled:opacity-40"
              style={{ padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: '#1D4ED8', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>
              {careMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : null}Open ticket
            </button>
          </div>
        </>)}
        {careTicket && (<>
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <CheckCircle2 className="w-10 h-10 mx-auto" style={{ color: '#059669', marginBottom: 10 }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1B1A16' }}>Ticket opened</h3>
            <p style={{ fontSize: 13, fontFamily: "'Geist Mono', ui-monospace, monospace", color: '#1D4ED8', marginTop: 6, fontWeight: 500 }}>{careTicket.ticketRef}</p>
            <p style={{ fontSize: 12, color: '#615F56', marginTop: 10, lineHeight: 1.6 }}>
              Fybrus Customer Care has your alert context and typically replies within 2 business hours.<br />You can track this under “Open tickets” on the Alerts page.
            </p>
            <button onClick={() => { setCareTarget(null); setCareTicket(null); }}
              style={{ marginTop: 16, padding: '8px 24px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: '#1B1A16', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>Done</button>
          </div>
        </>)}
      </Overlay>

      {/* ─ Batch detail dialog ─ */}
      <Overlay open={!!selectedId} onClose={() => setSelectedId(null)} wide>
        {!detail?.batch && <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: '#CBC9BF' }} /></div>}
        {detail?.batch && (
          <>
            <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1B1A16' }}>Batch {detail.batch.batchRef}</h3>
                <p style={{ fontSize: 11, color: '#6E6C62', marginTop: 2 }}>
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
              <div style={{ borderRadius: 12, padding: 12, border: '1px solid #E5E3D9', background: '#F8F7F2' }}>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62' }}>{detail.batch.currency || "EUR"} Total</p>
                <p style={{ fontSize: 18, fontWeight: 600, fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: '-0.03em', color: '#1B1A16', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{{ EUR: "€", USD: "$", AUD: "A$" }[detail.batch.currency as string] || "€"}{parseFloat(detail.batch.totalFiat || detail.batch.totalEur).toLocaleString("en", { minimumFractionDigits: 2 })}</p>
              </div>
              <div style={{ borderRadius: 12, padding: 12, border: '1px solid #E5E3D9', background: '#F8F7F2' }}>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62' }}>USDC Total</p>
                <p style={{ fontSize: 18, fontWeight: 600, fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: '-0.03em', marginTop: 2, fontVariantNumeric: 'tabular-nums', color: detail.batch.totalUsdc ? '#1B1A16' : '#CBC9BF' }}>
                  {detail.batch.totalUsdc ? `$${parseFloat(detail.batch.totalUsdc).toLocaleString("en", { minimumFractionDigits: 2 })}` : "Pending conversion"}
                </p>
              </div>
              <div style={{ borderRadius: 12, padding: 12, border: '1px solid #E5E3D9', background: '#F8F7F2' }}>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62' }}>FX Rate</p>
                <p style={{ fontSize: 18, fontWeight: 600, fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: '-0.03em', marginTop: 2, color: detail.batch.exchangeRate ? '#54524A' : '#CBC9BF' }}>
                  {detail.batch.exchangeRate ? parseFloat(detail.batch.exchangeRate).toFixed(4) : "—"}
                </p>
              </div>
              <div title="Fybrus fee (9 bps) + Paystrax markup, both deducted from the fiat before conversion. The markup is owed back to Paystrax." style={{ borderRadius: 12, padding: 12, border: '1px solid #E5E3D9', background: '#F8F7F2' }}>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62' }}>Fees</p>
                <p style={{ fontSize: 18, fontWeight: 600, fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: '-0.03em', marginTop: 2, color: detail.batch.feeBps ? '#1B1A16' : '#CBC9BF' }}>
                  {detail.batch.feeBps ? `${{ EUR: "€", USD: "$", AUD: "A$" }[detail.batch.currency as string] || "€"}${(parseFloat(detail.batch.feeAmount || "0") + parseFloat(detail.batch.markupTotal || "0")).toLocaleString("en", { minimumFractionDigits: 2 })}` : "—"}
                </p>
                {detail.batch.feeBps
                  ? <p style={{ fontSize: 9, color: '#96948A', marginTop: 2, lineHeight: 1.4 }}>Fybrus €{parseFloat(detail.batch.feeAmount || "0").toLocaleString("en", { minimumFractionDigits: 2 })} · Paystrax markup <span style={{ color: '#059669' }}>€{parseFloat(detail.batch.markupTotal || "0").toLocaleString("en", { minimumFractionDigits: 2 })}</span></p>
                  : <p style={{ fontSize: 9, color: '#96948A', marginTop: 2 }}>no fee on this batch</p>}
              </div>
            </div>

            {/* Stage explainer — what is happening / what happens next */}
            <p style={{ fontSize: 11, lineHeight: 1.55, color: '#6E6C62', margin: '0 0 14px', padding: '8px 12px', borderRadius: 8, background: '#F4F3EC', border: '1px solid #ECEAE0' }}>
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
              <div style={{ padding: 12, borderRadius: 8, background: '#EFF6FF', border: '1px solid #BFDBFE', marginBottom: 12 }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 500, color: '#1D4ED8' }}>Dual Approval Required</p>
                    <p style={{ fontSize: 11, color: '#3B82F6', marginTop: 2 }}>
                      Created by <strong>{detail.batch.createdBy || "unknown"}</strong> — needs approval from a different user before advancing.
                    </p>
                  </div>
                  {currentUser?.email !== detail.batch.createdBy && (currentUser?.role === "admin" || currentUser?.role === "approver") ? (
                    <button onClick={() => approveMut.mutate(detail.batch.id)}
                      className="flex items-center gap-1.5 disabled:opacity-40"
                      disabled={approveMut.isPending}
                      style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 500, background: '#1D4ED8', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>
                      {approveMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      Approve Batch
                    </button>
                  ) : currentUser?.email === detail.batch.createdBy ? (
                    <span style={{ fontSize: 10, color: '#6B7280', fontStyle: 'italic' }}>You created this batch — another user must approve</span>
                  ) : (
                    <span style={{ fontSize: 10, color: '#6B7280', fontStyle: 'italic' }}>Only admin/approver roles can approve</span>
                  )}
                </div>
                {approveMut.isError && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 6 }}>{(approveMut.error as Error).message}</p>}
              </div>
            )}
            {detail.batch.approvedBy && (
              <div style={{ padding: 8, borderRadius: 8, background: '#ECFDF5', border: '1px solid #A7F3D0', marginBottom: 12 }} className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#059669' }} />
                <span style={{ fontSize: 11, color: '#059669', fontWeight: 500 }}>
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
                    style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 500, background: 'transparent', color: '#DC2626', border: '1px solid #FCA5A5', cursor: 'pointer' }}
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
                          style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: needsApproval ? '#9CA3AF' : '#1D4ED8', color: '#FFFFFF', border: 'none', cursor: needsApproval ? 'not-allowed' : 'pointer' }}
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
                        style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: needsApproval ? '#9CA3AF' : '#059669', color: '#FFFFFF', border: 'none', cursor: needsApproval ? 'not-allowed' : 'pointer' }}
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
                <span style={{ fontSize: 11, fontWeight: 500, color: '#DC2626', padding: '4px 10px', borderRadius: 6, background: '#FEE2E2' }}>Batch Failed</span>
              )}
              {(detail.batch.status === "funded" || detail.batch.status === "converting") && currentUser?.role !== "viewer" && (
                <button
                  className="flex items-center gap-1.5 disabled:opacity-40"
                  style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: '#1B1A16', color: '#FFFFFF', border: 'none', cursor: 'pointer', marginLeft: 8 }}
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
                  style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 500, background: '#FFFFFF', color: '#B45309', border: '1px solid #FCD34D', cursor: 'pointer', marginLeft: 8 }}
                  disabled={retryFailedMut.isPending}
                  title="Re-runs wallet screening + travel rule + settlement for failed payouts only"
                  onClick={() => retryFailedMut.mutate(detail.batch.id)}>
                  {retryFailedMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Retry failed payouts ({detail.payouts.filter((r: any) => r.payout.status === "failed").length})
                </button>
              )}
            </div>

            <h4 style={{ fontSize: 12, fontWeight: 500, color: '#54524A', marginBottom: 8 }}>Per-Merchant Breakdown</h4>
            <div style={{ borderRadius: 12, overflowX: 'auto', border: '1px solid #E5E3D9', background: '#FFFFFF' }}>
              <table className="w-full" style={{ minWidth: 760 }}>
                <thead>
                  <tr style={{ background: '#F8F7F2', borderBottom: '1px solid #ECEAE0' }}>
                    <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62', padding: '8px 16px', textAlign: 'left' }}>Merchant</th>
                    <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62', padding: '8px 12px', textAlign: 'right' }}>{detail.batch.currency || "EUR"}</th>
                    <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62', padding: '8px 12px', textAlign: 'right' }}>USDC</th>
                    <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62', padding: '8px 12px', textAlign: 'left' }}>Wallet</th>
                    <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62', padding: '8px 12px', textAlign: 'center' }}>Status</th>
                    <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62', padding: '8px 12px', textAlign: 'left' }}>Confirmed</th>
                    <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62', padding: '8px 12px', textAlign: 'left' }}>TX Hash</th>
                    <th style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#6E6C62', padding: '8px 12px', textAlign: 'left' }}>Travel Rule</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.payouts?.map((r: any) => (
                    <tr key={r.payout.id} style={{ borderTop: '1px solid #EFEDE4' }}>
                      <td style={{ padding: '10px 16px', fontSize: 12, fontWeight: 500, color: '#1B1A16' }}>
                        {r.merchant?.name}
                        <span title={(r.payout.payoutMethod === 'fiat') ? 'Paid in fiat (USDC off-ramped)' : 'Paid in USDC'} style={{ marginLeft: 6, fontSize: 9, fontWeight: 500, padding: '1px 6px', borderRadius: 999, background: r.payout.payoutMethod === 'fiat' ? '#EFF6FF' : '#ECFDF5', color: r.payout.payoutMethod === 'fiat' ? '#1D4ED8' : '#059669' }}>{r.payout.payoutMethod === 'fiat' ? 'FIAT' : 'USDC'}</span>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, textAlign: 'right', color: '#1B1A16', fontVariantNumeric: 'tabular-nums' }}>{CSYM[detail.batch.currency] || "€"}{parseFloat(r.payout.fiatAmount || r.payout.eurAmount).toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                      <td title={r.payout.payoutMethod === 'fiat' && r.payout.payoutFiatAmount ? `Off-ramped to ${CSYM[detail.batch.currency] || '€'}${parseFloat(r.payout.payoutFiatAmount).toLocaleString('en',{minimumFractionDigits:2})} at ${r.payout.offRampRate}` : ''} style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.payout.usdcAmount ? '#1B1A16' : '#CBC9BF' }}>
                        {r.payout.payoutMethod === 'fiat' && r.payout.payoutFiatAmount
                          ? <span>{CSYM[detail.batch.currency] || "€"}{parseFloat(r.payout.payoutFiatAmount).toLocaleString("en", { minimumFractionDigits: 2 })}<span style={{ fontSize: 9, color: '#96948A', fontWeight: 400, display: 'block' }}>via ${parseFloat(r.payout.usdcAmount || "0").toLocaleString("en", { maximumFractionDigits: 0 })} USDC</span></span>
                          : (r.payout.usdcAmount ? `$${parseFloat(r.payout.usdcAmount).toLocaleString("en", { minimumFractionDigits: 2 })}` : "—")}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div className="flex items-center gap-1">
                          <span style={{ fontSize: 11, fontFamily: "'Geist Mono', ui-monospace, monospace", color: '#54524A' }}>{r.payout.walletAddress.slice(0, 8)}...{r.payout.walletAddress.slice(-4)}</span>
                          <button style={{ color: '#CBC9BF' }} onClick={() => copyText(r.payout.walletAddress)}
                            onMouseEnter={e => e.currentTarget.style.color = '#615F56'} onMouseLeave={e => e.currentTarget.style.color = '#CBC9BF'}
                            aria-label="Copy wallet address"><Copy className="w-2.5 h-2.5" /></button>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <Badge status={r.payout.status} />
                        {r.payout.status === "failed" && (
                          <p style={{ fontSize: 10, lineHeight: 1.4, color: '#DC2626', marginTop: 4, maxWidth: 220, textAlign: 'left' }}>
                            {r.payout.failureReason || "Failed before reasons were recorded on this ledger."}
                          </p>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: '#54524A', whiteSpace: 'nowrap' }}>
                        {r.payout.confirmedAt ? new Date(r.payout.confirmedAt).toLocaleDateString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {r.payout.txHash ? (
                          <div className="flex items-center gap-1">
                            <span style={{ fontSize: 11, fontFamily: "'Geist Mono', ui-monospace, monospace", color: '#54524A' }}>{r.payout.txHash.slice(0, 10)}...</span>
                            <button style={{ color: '#CBC9BF' }} onClick={() => copyText(r.payout.txHash)}
                              onMouseEnter={e => e.currentTarget.style.color = '#615F56'} onMouseLeave={e => e.currentTarget.style.color = '#CBC9BF'}
                              aria-label="Copy transaction hash"><Copy className="w-2.5 h-2.5" /></button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: '#CBC9BF' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        {r.payout.travelRuleStatus === "transmitted" ? (
                          <span title={r.payout.travelRuleData ? `Transmitted ${r.payout.travelRuleAt ? new Date(r.payout.travelRuleAt).toLocaleString() : ""}\n${(() => { try { const d = JSON.parse(r.payout.travelRuleData); return `Originator: ${d.originator?.name} (${d.originator?.country})\nBeneficiary: ${d.beneficiary?.name}`; } catch { return ""; } })()}` : "Transmitted"}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 999, background: '#ECFDF5', color: '#059669', fontFamily: "'Geist Mono', ui-monospace, monospace" }}>
                            <ShieldCheck style={{ width: 11, height: 11 }} /> {r.payout.travelRuleRef}
                          </span>
                        ) : r.payout.travelRuleStatus === "failed" ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 999, background: '#FEF2F2', color: '#DC2626' }}>
                            <AlertCircle style={{ width: 11, height: 11 }} /> Failed
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: '#CBC9BF' }}>—</span>
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
