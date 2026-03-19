import { useState, useEffect } from "react";
import { X, MessageSquare, BookOpen, Crown, Zap, Users, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";

const STORAGE_KEY = "aina_welcome_seen_v1";

const WelcomeModal = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      const t = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  const goContributor = () => {
    dismiss();
    navigate("/contributor");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={dismiss} />

      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
        {/* Top gradient bar */}
        <div className="h-1 w-full bg-gradient-to-r from-violet-600 via-purple-500 to-fuchsia-500" />

        {/* Header with logo */}
        <div className="relative bg-gradient-to-br from-violet-600/15 to-purple-900/10 px-6 pb-5 pt-6 text-center">
          <button
            onClick={dismiss}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 shadow-lg shadow-purple-900/40">
            <img src="/aina-icon.png" alt="AINA" className="h-10 w-10 object-contain" />
          </div>

          <h2 className="font-display text-xl font-bold text-foreground">
            Selamat datang di AINA Beta! 🎉
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Asisten AI khusus mahasiswa Indonesia di Mesir
          </p>

          {/* Beta badge */}
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
            <Star className="h-3 w-3" />
            Kamu adalah salah satu dari 20 Beta Tester pertama AINA!
          </div>
        </div>

        <div className="px-6 pb-6 pt-4">
          {/* Features */}
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Yang bisa kamu lakukan
          </p>

          <div className="space-y-2.5">
            <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/30 p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <MessageSquare className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Chat dengan AINA</p>
                <p className="text-xs text-muted-foreground">Tanya seputar kehidupan di Mesir, administrasi, akademik, dan lainnya</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                <Zap className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  3 chat gratis per hari
                </p>
                <p className="text-xs text-muted-foreground">
                  Kuota harian direset setiap tengah malam waktu Kairo. Upgrade atau jadi Kontributor untuk akses penuh.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/30 p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
                <BookOpen className="h-4 w-4 text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Jadi Kontributor — Gratis!</p>
                <p className="text-xs text-muted-foreground">
                  Tulis artikel ke Knowledge Base dan dapatkan akses chat tanpa batas, gratis selamanya
                </p>
              </div>
            </div>
          </div>

          {/* Beta feedback note */}
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-border bg-secondary/20 p-3">
            <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Sebagai beta tester, masukan kamu sangat berharga. Gunakan tombol <span className="font-medium text-foreground">Feedback Beta</span> di pojok kanan bawah untuk melaporkan bug atau memberi saran.
            </p>
          </div>

          {/* CTAs */}
          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={dismiss}
              className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Mulai Chat dengan AINA
            </button>
            <button
              onClick={goContributor}
              className="w-full rounded-xl border border-border bg-secondary/50 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <span className="flex items-center justify-center gap-1.5">
                <Crown className="h-3.5 w-3.5" />
                Pelajari cara jadi Kontributor
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeModal;
