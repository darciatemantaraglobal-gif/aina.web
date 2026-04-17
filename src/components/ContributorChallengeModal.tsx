import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, Trophy, Award, BadgeCheck, Crown, Sparkles, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const DISMISS_KEY = "aina_contributor_challenge_dismissed_v1";

const ContributorChallengeModal = () => {
  const [open, setOpen] = useState(false);
  const [isContributor, setIsContributor] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed === "1") return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/app/public-config");
        if (!r.ok) return;
        const cfg = await r.json();
        if (!alive) return;
        if (cfg?.contributor_challenge_enabled === true) {
          setTimeout(() => { if (alive) setOpen(true); }, 600);
        }
      } catch { /* silent — popup just stays hidden */ }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !alive) return;
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        if (!alive) return;
        const roles = (data || []).map((r: { role: string }) => r.role);
        setIsContributor(
          roles.includes("contributor") ||
          roles.includes("senior_contributor") ||
          roles.includes("admin")
        );
      } catch {
      }
    })();
    return () => { alive = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeSession(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const closeSession = useCallback(() => {
    setOpen(false);
  }, []);

  const dismissForever = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  }, []);

  const handleJoin = useCallback(async () => {
    setLoading(true);
    try {
      if (isContributor) {
        navigate("/dashboard?tab=contributor");
      } else {
        navigate("/contributor");
      }
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, [isContributor, navigate]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contributor-challenge-title"
    >
      <button
        type="button"
        aria-label="Tutup"
        onClick={closeSession}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default"
      />

      <div
        className="relative z-10 flex w-full sm:max-w-4xl flex-col sm:flex-row max-h-[100dvh] sm:max-h-[90dvh] sm:rounded-3xl overflow-hidden shadow-2xl border border-border bg-background animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* ── LEFT: Logo + Challenge Badge ── */}
        <div className="relative flex-1 sm:w-[42%] sm:min-w-[320px] flex flex-col items-center justify-center px-6 py-10 sm:p-10 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-rose-950/40 overflow-hidden">
          {/* decorative glow */}
          <div className="pointer-events-none absolute -top-20 -left-16 h-64 w-64 rounded-full bg-amber-300/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-rose-300/30 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.04] bg-[radial-gradient(circle_at_1px_1px,_currentColor_1px,_transparent_0)] [background-size:20px_20px] text-foreground" />

          <div className="relative flex flex-col items-center gap-5 text-center">
            {/* Logo AINA */}
            <div className="relative">
              <div className="flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 shadow-xl shadow-orange-500/30 ring-4 ring-white/60 dark:ring-white/10">
                <span className="text-4xl sm:text-5xl font-black text-white tracking-tight">A</span>
              </div>
              <div className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-lg ring-2 ring-amber-200">
                <Sparkles className="h-4 w-4 text-amber-500" />
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-700/80 dark:text-orange-300/80">AINA Labs</p>
              <p className="mt-1 text-2xl sm:text-3xl font-bold text-foreground">Untuk Masisir</p>
            </div>

            {/* Challenge Badge */}
            <div className="relative mt-2">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-amber-400 to-rose-500 blur-md opacity-60 animate-pulse" />
              <div className="relative inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-5 py-2.5 shadow-lg">
                <Trophy className="h-5 w-5 text-white" />
                <span className="text-base font-extrabold tracking-wide text-white uppercase">
                  Challenge 2026
                </span>
              </div>
            </div>

            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Bantu bangun knowledge base AINA untuk ribuan Masisir di Mesir.
            </p>
          </div>
        </div>

        {/* ── RIGHT: Content + CTAs ── */}
        <div className="relative flex-1 sm:w-[58%] flex flex-col bg-zinc-950 text-zinc-100 overflow-y-auto">
          {/* Close X */}
          <button
            type="button"
            onClick={closeSession}
            aria-label="Tutup popup"
            className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex-1 px-6 py-8 sm:px-8 sm:py-10 flex flex-col gap-5">
            <header>
              <h2
                id="contributor-challenge-title"
                className="text-2xl sm:text-3xl font-bold leading-tight tracking-tight pr-10"
              >
                Jadi Pahlawan Pengetahuan Masisir
              </h2>
              <p className="mt-2.5 text-sm text-zinc-400 leading-relaxed">
                Setiap kontribusi Anda jadi bekal ilmu untuk ribuan mahasiswa Indonesia di Mesir.
                Sekarang, kami ingin membalas effort itu dengan reward yang sepadan.
              </p>
            </header>

            {/* Reward Card */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-amber-400 mb-3.5">
                Reward untuk 3 Kontributor Teratas
              </p>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <Crown className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
                  <span className="text-zinc-200">
                    <strong className="text-white">Subscription Pro 1 tahun</strong> &mdash; akses penuh semua fitur AINA
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Trophy className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
                  <span className="text-zinc-200">
                    <strong className="text-white">Total 1.500 LE</strong> dibagi untuk 3 kontributor terbanyak
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Award className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
                  <span className="text-zinc-200">
                    <strong className="text-white">Sertifikat resmi</strong> dari AINA Labs
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <BadgeCheck className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
                  <span className="text-zinc-200">
                    <strong className="text-white">Badge eksklusif</strong> permanen di profil Anda
                  </span>
                </li>
              </ul>
            </div>

            <p className="text-xs italic text-zinc-500 text-center px-2 leading-relaxed">
              "Kami bukan tim besar. Tapi setiap artikel yang Anda tulis,
              jadi jawaban yang membantu adik-adik Masisir esok hari."
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleJoin}
                disabled={loading}
                className="group relative flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition-all hover:shadow-xl hover:shadow-orange-500/30 hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              >
                {isContributor ? (
                  <>
                    <Trophy className="h-4 w-4" />
                    <span>Buka Halaman Kontributor</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Daftar Sekarang &mdash; Gratis</span>
                  </>
                )}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>

              <button
                type="button"
                onClick={closeSession}
                className="rounded-xl border border-zinc-700 bg-transparent px-5 py-3 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/5 hover:text-white active:scale-[0.98]"
              >
                Nanti saja
              </button>

              <button
                type="button"
                onClick={dismissForever}
                className="mt-1 text-center text-xs text-zinc-500 transition-colors hover:text-zinc-300 hover:underline underline-offset-4"
              >
                Jangan tampilkan lagi
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContributorChallengeModal;
