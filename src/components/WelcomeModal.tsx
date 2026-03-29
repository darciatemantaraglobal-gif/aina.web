import { useState, useEffect } from "react";
import { X, Crown, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

const STORAGE_KEY = "aina_welcome_seen_v2";

interface WelcomeModalProps {
  onGoContributor?: () => void;
  onStartTour?: () => void;
}

const WelcomeModal = ({ onGoContributor, onStartTour }: WelcomeModalProps) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      setOpen(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  const goContributor = () => {
    dismiss();
    if (onGoContributor) {
      onGoContributor();
    } else {
      navigate("/dashboard?tab=contributor");
    }
  };

  const handleTour = () => {
    dismiss();
    onStartTour?.();
  };

  if (!open) return null;

  return (
    <div className="mx-2 mt-2 mb-0 overflow-hidden rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-purple-700">
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-tight">
            Selamat datang di AINA Beta! 🎉
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            Kamu punya <span className="font-medium text-foreground">3 chat gratis</span> per hari.{" "}
            <button
              onClick={goContributor}
              className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
            >
              <Crown className="h-3 w-3" />
              Jadi Kontributor
            </button>
            {" "}untuk akses tanpa batas — gratis!
          </p>
          {onStartTour && (
            <button
              onClick={handleTour}
              className="mt-1.5 text-xs text-primary/80 hover:text-primary hover:underline transition-colors"
            >
              Lihat tur singkat fitur AINA →
            </button>
          )}
        </div>

        <button
          onClick={dismiss}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Tutup"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default WelcomeModal;
