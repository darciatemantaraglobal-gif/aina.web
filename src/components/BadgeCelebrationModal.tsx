import { useEffect } from "react";
import { X, Star } from "lucide-react";
import { triggerConfetti } from "@/utils/confetti";

interface Badge {
  badge_type: string;
  name: string;
  emoji: string;
  rare: boolean;
  awarded_at: string;
}

interface BadgeCelebrationModalProps {
  badge: Badge;
  onClose: () => void;
  onEquip: (badgeType: string) => void;
}

export default function BadgeCelebrationModal({ badge, onClose, onEquip }: BadgeCelebrationModalProps) {
  useEffect(() => {
    triggerConfetti();
    const second = setTimeout(() => triggerConfetti(window.innerWidth * 0.75, window.innerHeight * 0.35), 600);
    const third  = setTimeout(() => triggerConfetti(window.innerWidth * 0.25, window.innerHeight * 0.35), 1100);
    return () => { clearTimeout(second); clearTimeout(third); };
  }, []);

  const awardedDate = new Date(badge.awarded_at).toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div
      className="animate-celebrate-backdrop fixed inset-0 z-[99999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`animate-celebrate-card relative w-full max-w-sm overflow-hidden rounded-3xl border shadow-2xl ${
          badge.rare
            ? "border-violet-400/40 bg-gradient-to-b from-[#1a0a2e] to-[#0f0a1e]"
            : "border-primary/30 bg-gradient-to-b from-[#0d0d1a] to-[#0a0a14]"
        }`}
      >
        {/* Shine overlay for rare */}
        {badge.rare && (
          <div className="animate-celebrate-shine pointer-events-none absolute inset-0 rounded-3xl" />
        )}

        {/* Glow bg circle */}
        <div
          className={`pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 -translate-y-1/3 rounded-full blur-[80px] ${
            badge.rare ? "bg-violet-600/30" : "bg-primary/20"
          }`}
        />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-1.5 text-white/60 hover:bg-white/20 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative z-10 flex flex-col items-center px-8 pb-8 pt-10 text-center">
          {/* Congratulations label */}
          <span className={`mb-5 rounded-full px-4 py-1 text-xs font-bold uppercase tracking-widest ${
            badge.rare
              ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
              : "bg-primary/20 text-primary border border-primary/30"
          }`}>
            🎉 Badge Baru!
          </span>

          {/* Emoji */}
          <span className="animate-celebrate-emoji mb-5 block text-[72px] leading-none select-none">
            {badge.emoji}
          </span>

          {/* Rare crown */}
          {badge.rare && (
            <div className="mb-3 flex items-center gap-1.5 rounded-full bg-violet-500/20 border border-violet-400/30 px-3 py-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-violet-300">Rare Badge</span>
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            </div>
          )}

          {/* Badge name */}
          <h2 className={`font-display text-2xl font-bold leading-tight ${
            badge.rare ? "text-white" : "text-foreground"
          }`}>
            {badge.name}
          </h2>

          {/* Congratulations text */}
          <p className="mt-3 text-sm text-white/60 leading-relaxed">
            Selamat! Kamu berhasil mendapatkan badge ini pada {awardedDate}. Pasang ke profilmu biar semua bisa lihat.
          </p>

          {/* Divider */}
          <div className={`my-6 h-px w-full ${badge.rare ? "bg-violet-400/20" : "bg-primary/20"}`} />

          {/* Actions */}
          <div className="flex w-full flex-col gap-2.5">
            <button
              onClick={() => { onEquip(badge.badge_type); onClose(); }}
              className={`w-full rounded-2xl py-3 text-sm font-semibold text-white transition-all active:scale-95 ${
                badge.rare
                  ? "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 shadow-lg shadow-violet-900/40"
                  : "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30"
              }`}
            >
              Pasang ke Profil
            </button>
            <button
              onClick={onClose}
              className="w-full rounded-2xl py-2.5 text-sm text-white/50 hover:text-white/80 transition-colors"
            >
              Nanti aja
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
