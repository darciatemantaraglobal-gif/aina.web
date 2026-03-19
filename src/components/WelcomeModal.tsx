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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={dismiss} />

      <div className="relative w-full max-w-md overflow-hidden rounded-2xl sm:rounded-3xl border border-border bg-card shadow-2xl">
        {/* Top gradient bar */}
        <div className="h-1 w-full bg-gradient-to-r from-violet-600 via-purple-500 to-fuchsia-500" />

        {/* Header */}
        <div className="relative bg-gradient-to-br from-violet-600/15 to-purple-900/10 px-4 pb-3 pt-4 text-center sm:px-6 sm:pb-5 sm:pt-6">
          <button
            onClick={dismiss}
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:right-4 sm:top-4 sm:h-8 sm:w-8"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 shadow-lg shadow-purple-900/40 sm:mb-3 sm:h-16 sm:w-16">
            <img src="/aina-icon.png" alt="AINA" className="h-7 w-7 object-contain sm:h-10 sm:w-10" />
          </div>

          <h2 className="font-display text-lg font-bold text-foreground sm:text-xl">
            Selamat datang di AINA Beta! 🎉
          </h2>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Asisten AI khusus mahasiswa Indonesia di Mesir
          </p>

          {/* Beta badge */}
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400 sm:mt-3 sm:px-3 sm:py-1">
            <Star className="h-3 w-3" />
            Kamu adalah salah satu dari 20 Beta Tester pertama!
          </div>
        </div>

        <div className="px-4 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pt-4">
          {/* Features */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground sm:mb-3">
            Yang bisa kamu lakukan
          </p>

          <div className="space-y-1.5 sm:space-y-2.5">
            <div className="flex items-center gap-2.5 rounded-xl border border-border bg-secondary/30 p-2.5 sm:items-start sm:p-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:h-8 sm:w-8">
                <MessageSquare className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground sm:text-sm">Chat dengan AINA</p>
                <p className="hidden text-xs text-muted-foreground sm:block">Tanya seputar kehidupan di Mesir, administrasi, akademik, dan lainnya</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5 sm:items-start sm:p-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 sm:h-8 sm:w-8">
                <Zap className="h-3.5 w-3.5 text-amber-400 sm:h-4 sm:w-4" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground sm:text-sm">3 chat gratis per hari</p>
                <p className="hidden text-xs text-muted-foreground sm:block">
                  Kuota harian direset setiap tengah malam waktu Kairo. Upgrade atau jadi Kontributor untuk akses penuh.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-border bg-secondary/30 p-2.5 sm:items-start sm:p-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-green-500/10 sm:h-8 sm:w-8">
                <BookOpen className="h-3.5 w-3.5 text-green-400 sm:h-4 sm:w-4" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground sm:text-sm">Jadi Kontributor — Gratis!</p>
                <p className="hidden text-xs text-muted-foreground sm:block">
                  Tulis artikel ke Knowledge Base dan dapatkan akses chat tanpa batas, gratis selamanya
                </p>
              </div>
            </div>
          </div>

          {/* Beta feedback note */}
          <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-border bg-secondary/20 p-2.5 sm:mt-4 sm:p-3">
            <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Masukan kamu sangat berharga. Gunakan tombol <span className="font-medium text-foreground">Feedback Beta</span> di pojok kanan bawah untuk lapor bug atau saran.
            </p>
          </div>

          {/* CTAs */}
          <div className="mt-3 flex flex-col gap-2 sm:mt-4">
            <button
              onClick={dismiss}
              className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 sm:py-2.5"
            >
              Mulai Chat dengan AINA
            </button>
            <button
              onClick={goContributor}
              className="w-full rounded-xl border border-border bg-secondary/50 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:py-2.5"
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
