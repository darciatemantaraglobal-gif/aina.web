import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  GraduationCap, Coins, CheckCircle2, Send, Wallet, LogIn,
  LayoutDashboard, PenLine, History, Menu, X, Home, LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { setPostLoginRedirect } from "@/lib/postLoginRedirect";
import ainaLogo from "@/assets/aina-logo.png";

async function authedFetch(path: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Terjadi kesalahan");
  return body;
}

type TrainerStatus = {
  role: "trainer";
  stats: { submitted: number; approved: number; balance_le: number };
  categories: Record<string, string>;
  payout: { whatsapp: string | null; payment_method: string | null; payment_detail: string | null };
};
type Contribution = {
  id: string; category: string; question: string; status: string;
  difficulty: string | null; reward_le: number | null; review_note: string | null;
  submitted_at: string; reviewed_at: string | null;
};
type Section = "overview" | "submit" | "history";
type ContentMode = "qa" | "artikel";

const CATEGORY_ORDER = ["akademik", "administrasi", "kehidupan", "komunitas", "bahasa", "keislaman"];

const NAV_ITEMS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Ringkasan", icon: LayoutDashboard },
  { id: "submit", label: "Kirim Kontribusi", icon: PenLine },
  { id: "history", label: "Riwayat", icon: History },
];

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; className: string }> = {
    pending:        { label: "Menunggu review",   className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" },
    approved:       { label: "Diterima",          className: "bg-green-500/10 text-green-500 border-green-500/30" },
    needs_revision: { label: "Perlu revisi",      className: "bg-orange-500/10 text-orange-500 border-orange-500/30" },
    rejected:       { label: "Ditolak",           className: "bg-red-500/10 text-red-500 border-red-500/30" },
  };
  const c = cfg[status] ?? { label: status, className: "bg-secondary text-muted-foreground" };
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${c.className}`}>{c.label}</span>;
}

function TrainerSidebar({
  active, onChange, onClose, onLogout,
}: {
  active: Section;
  onChange: (id: Section) => void;
  onClose?: () => void;
  onLogout: () => void;
}) {
  return (
    <aside className="flex h-full w-72 flex-col border-r border-sidebar-border bg-sidebar">
      <div
        className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex items-center gap-2">
          <img src={ainaLogo} alt="AINA" className="h-6 w-6 object-contain" />
          <div>
            <p className="text-sm font-semibold leading-tight text-sidebar-foreground">AI Trainer</p>
            <p className="text-[10px] leading-tight text-sidebar-foreground/50">AINA × Masisir</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
              active === item.id ? "bg-primary/15 font-medium text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent"
            }`}
          >
            {active === item.id && (
              <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
            )}
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-sidebar-border px-3 py-3">
        <Link
          to="/dashboard"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
        >
          <Home className="h-4 w-4 shrink-0" /> Ke Dashboard AINA
        </Link>
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4 shrink-0" /> Logout
        </button>
      </div>
    </aside>
  );
}

export default function TrainerProgramPage() {
  const [authLoading, setAuthLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [status, setStatus] = useState<TrainerStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentDetail, setPaymentDetail] = useState("");

  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contentMode, setContentMode] = useState<ContentMode>("qa");

  const [category, setCategory] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceDate, setSourceDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const data = await authedFetch("/api/trainer/status");
      setStatus(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadContributions = useCallback(async () => {
    try {
      const data = await authedFetch("/api/trainer/contributions/mine");
      setContributions(data.contributions ?? []);
    } catch { /* silent — the balance card still works without history */ }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setLoggedIn(!!session);
      setAuthLoading(false);
      if (session) loadStatus();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(!!session);
      if (session) loadStatus();
    });
    return () => subscription.unsubscribe();
  }, [loadStatus]);

  useEffect(() => {
    if (status?.role === "trainer") loadContributions();
  }, [status?.role, loadContributions]);

  const handleGoogleLogin = async () => {
    setPostLoginRedirect("/trainer");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) toast.error(error.message || "Gagal login dengan Google");
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch { /* sign-out already invalid client-side — proceed anyway */ }
    setLoggedIn(false);
    setStatus(null);
  };

  const handleSubmitContribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) return toast.error("Pilih kategori dulu");
    setSubmitting(true);
    try {
      const data = await authedFetch("/api/trainer/contributions", {
        method: "POST",
        body: JSON.stringify({ category, question, answer, source_text: sourceText || null, source_date: sourceDate || null }),
      });
      if (data.possible_duplicate) {
        toast.warning("Terkirim — tapi mirip artikel yang sudah ada. Reviewer akan cek ulang.");
      } else {
        toast.success(contentMode === "artikel" ? "Artikel terkirim! Menunggu review." : "Kontribusi terkirim! Menunggu review.");
      }
      setCategory(""); setQuestion(""); setAnswer(""); setSourceText(""); setSourceDate("");
      loadContributions();
      loadStatus();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaimClick = () => {
    if (status?.payout.whatsapp) {
      handleClaim();
    } else {
      setShowPayoutForm(true);
    }
  };

  const handleClaim = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!status?.payout.whatsapp && !whatsapp.trim()) {
      return toast.error("Nomor WhatsApp wajib diisi untuk klaim pertama kali");
    }
    setClaiming(true);
    try {
      const data = await authedFetch("/api/trainer/claims", {
        method: "POST",
        body: JSON.stringify({
          whatsapp: whatsapp.trim() || undefined,
          payment_method: paymentMethod.trim() || undefined,
          payment_detail: paymentDetail.trim() || undefined,
        }),
      });
      toast.success(`Klaim ${data.claim.requested_le} LE terkirim. Admin akan proses dan hubungi kamu.`);
      setShowPayoutForm(false);
      loadStatus();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setClaiming(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div className="relative min-h-screen bg-background">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/8 blur-[120px]" />
        </div>

        <header className="relative mx-auto flex max-w-3xl items-center justify-between px-4 pt-8">
          <Link to="/" className="flex items-center gap-2">
            <img src={ainaLogo} alt="AINA" className="h-8 w-8" />
            <span className="font-display text-lg font-semibold text-foreground">AINA</span>
          </Link>
        </header>

        <main className="relative mx-auto max-w-3xl px-4 py-10">
          <div className="mb-8 text-center">
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <GraduationCap className="h-3.5 w-3.5" /> AIGYPT × AINA — Founding Batch
            </span>
            <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
              AINA AI Trainer Program
            </h1>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              Teach AI. Earn Rewards. Empower Masisir. Bantu AINA makin paham kehidupan, akademik, dan bahasa
              Masisir di Mesir — kontribusi yang lolos review dapat reward dalam LE.
            </p>
          </div>

          <div className="mx-auto max-w-sm rounded-2xl border border-border bg-card p-6 text-center">
            <p className="mb-4 text-sm text-muted-foreground">Masuk dengan akun Google kamu untuk mulai berkontribusi.</p>
            <Button onClick={handleGoogleLogin} className="w-full gap-2" size="lg">
              <LogIn className="h-4 w-4" /> Masuk dengan Google
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile sidebar overlay */}
      <div
        className={`fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          sidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setSidebarOpen(false)}
      />

      <div
        className={`fixed inset-y-0 left-0 z-40 transition-transform duration-300 ease-in-out md:relative md:z-auto md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <TrainerSidebar
          active={activeSection}
          onChange={(id) => { setActiveSection(id); setSidebarOpen(false); }}
          onClose={() => setSidebarOpen(false)}
          onLogout={handleLogout}
        />
      </div>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header
          className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 md:hidden"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-display text-base font-bold text-foreground">
            {NAV_ITEMS.find((n) => n.id === activeSection)?.label}
          </span>
        </header>

        <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
          {statusLoading && !status ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            </div>
          ) : status && (
            <>
              {activeSection === "overview" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-center">
                      <Coins className="mx-auto mb-1 h-5 w-5 text-primary" />
                      <p className="text-xl font-bold text-foreground">{status.stats.balance_le}</p>
                      <p className="text-[11px] text-muted-foreground">Saldo (LE)</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-card p-4 text-center">
                      <Send className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
                      <p className="text-xl font-bold text-foreground">{status.stats.submitted}</p>
                      <p className="text-[11px] text-muted-foreground">Terkirim</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-card p-4 text-center">
                      <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-green-500" />
                      <p className="text-xl font-bold text-foreground">{status.stats.approved}</p>
                      <p className="text-[11px] text-muted-foreground">Diterima</p>
                    </div>
                  </div>

                  {!showPayoutForm ? (
                    <Button onClick={handleClaimClick} disabled={claiming || status.stats.balance_le <= 0} variant="outline" className="w-full gap-2">
                      <Wallet className="h-4 w-4" /> {claiming ? "Mengirim..." : "Klaim Hadiah"}
                    </Button>
                  ) : (
                    <form onSubmit={handleClaim} className="space-y-2 rounded-2xl border border-border bg-card p-4">
                      <p className="text-sm font-semibold text-foreground">Info Kontak untuk Pembayaran</p>
                      <p className="text-xs text-muted-foreground">Diminta sekali aja — dipakai admin untuk menghubungi dan memproses klaim kamu.</p>
                      <Input placeholder="Nomor WhatsApp" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} required />
                      <Input placeholder="Metode pembayaran (opsional, mis. Bank BCA, GoPay, Vodafone Cash)" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} />
                      <Input placeholder="Nomor rekening/e-wallet (opsional)" value={paymentDetail} onChange={e => setPaymentDetail(e.target.value)} />
                      <div className="flex gap-2">
                        <Button type="submit" disabled={claiming} className="flex-1">
                          {claiming ? "Mengirim..." : "Kirim Klaim"}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setShowPayoutForm(false)}>Batal</Button>
                      </div>
                    </form>
                  )}

                  <button
                    onClick={() => setActiveSection("submit")}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    <PenLine className="h-4 w-4" /> Kirim Kontribusi Baru
                  </button>
                </div>
              )}

              {activeSection === "submit" && (
                <div className="space-y-4">
                  <div className="flex gap-1 rounded-xl bg-secondary/50 p-1">
                    {(["qa", "artikel"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setContentMode(mode)}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                          contentMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {mode === "qa" ? "Tanya-Jawab" : "Artikel"}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleSubmitContribution} className="space-y-3 rounded-2xl border border-border bg-card p-4">
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                      <SelectContent>
                        {CATEGORY_ORDER.map(key => (
                          <SelectItem key={key} value={key}>{status.categories?.[key] ?? key}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder={contentMode === "qa" ? "Pertanyaan, mis. Bagaimana cara mengurus perpanjangan iqomah?" : "Judul artikel, mis. Panduan Lengkap Perpanjangan Iqomah"}
                      value={question} onChange={e => setQuestion(e.target.value)} required minLength={10}
                    />
                    <Textarea
                      placeholder={contentMode === "qa" ? "Jawaban lengkap" : "Isi artikel lengkap"}
                      value={answer} onChange={e => setAnswer(e.target.value)} required minLength={20} rows={6}
                    />
                    <Input placeholder="Sumber (opsional)" value={sourceText} onChange={e => setSourceText(e.target.value)} />
                    <Input type="date" placeholder="Tanggal sumber" value={sourceDate} onChange={e => setSourceDate(e.target.value)} />
                    <Button type="submit" disabled={submitting} className="w-full">
                      {submitting ? "Mengirim..." : contentMode === "qa" ? "Kirim Q&A" : "Kirim Artikel"}
                    </Button>
                  </form>
                </div>
              )}

              {activeSection === "history" && (
                contributions.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">Belum ada kontribusi terkirim.</p>
                ) : (
                  <div className="space-y-2">
                    {contributions.map(c => (
                      <div key={c.id} className="rounded-xl border border-border bg-card p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-foreground line-clamp-2">{c.question}</p>
                          <StatusBadge status={c.status} />
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{status.categories?.[c.category] ?? c.category}</span>
                          {c.reward_le != null && <span className="font-medium text-green-500">+{c.reward_le} LE</span>}
                        </div>
                        {c.review_note && <p className="mt-1 text-xs text-muted-foreground">Catatan reviewer: {c.review_note}</p>}
                      </div>
                    ))}
                  </div>
                )
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
