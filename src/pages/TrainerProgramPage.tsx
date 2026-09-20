import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { GraduationCap, Coins, CheckCircle2, Send, Wallet, LogIn } from "lucide-react";
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
};
type Contribution = {
  id: string; category: string; question: string; status: string;
  difficulty: string | null; reward_le: number | null; review_note: string | null;
  submitted_at: string; reviewed_at: string | null;
};

const CATEGORY_ORDER = ["akademik", "administrasi", "kehidupan", "komunitas", "bahasa", "keislaman"];

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

export default function TrainerProgramPage() {
  const [authLoading, setAuthLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [status, setStatus] = useState<TrainerStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [contributions, setContributions] = useState<Contribution[]>([]);

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
        toast.success("Kontribusi terkirim! Menunggu review.");
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

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const data = await authedFetch("/api/trainer/claims", { method: "POST" });
      toast.success(`Klaim ${data.claim.requested_le} LE terkirim. Admin akan proses dan hubungi kamu.`);
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
        {loggedIn && status?.role === "trainer" && (
          <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            Ke Dashboard →
          </Link>
        )}
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

        {!loggedIn && (
          <div className="mx-auto max-w-sm rounded-2xl border border-border bg-card p-6 text-center">
            <p className="mb-4 text-sm text-muted-foreground">Masuk dengan akun Google kamu untuk mulai berkontribusi.</p>
            <Button onClick={handleGoogleLogin} className="w-full gap-2" size="lg">
              <LogIn className="h-4 w-4" /> Masuk dengan Google
            </Button>
          </div>
        )}

        {loggedIn && statusLoading && !status && (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          </div>
        )}

        {loggedIn && status && (
          <div className="space-y-6">
            {/* Kartu member */}
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

            <Button onClick={handleClaim} disabled={claiming || status.stats.balance_le <= 0} variant="outline" className="w-full gap-2">
              <Wallet className="h-4 w-4" /> {claiming ? "Mengirim..." : "Klaim Hadiah"}
            </Button>

            {/* Form kontribusi */}
            <form onSubmit={handleSubmitContribution} className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-semibold text-foreground">Kirim Kontribusi Baru</p>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_ORDER.map(key => (
                    <SelectItem key={key} value={key}>{status.categories?.[key] ?? key}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input placeholder="Pertanyaan" value={question} onChange={e => setQuestion(e.target.value)} required minLength={10} />
              <Textarea placeholder="Jawaban lengkap" value={answer} onChange={e => setAnswer(e.target.value)} required minLength={20} rows={4} />
              <Input placeholder="Sumber (opsional)" value={sourceText} onChange={e => setSourceText(e.target.value)} />
              <Input type="date" placeholder="Tanggal sumber" value={sourceDate} onChange={e => setSourceDate(e.target.value)} />
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Mengirim..." : "Kirim Kontribusi"}
              </Button>
            </form>

            {/* Riwayat */}
            {contributions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">Riwayat Kontribusi</p>
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
            )}
          </div>
        )}
      </main>
    </div>
  );
}
