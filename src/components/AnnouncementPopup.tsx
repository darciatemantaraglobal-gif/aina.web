import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { X, Megaphone, PartyPopper, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: string;
  button_text?: string;
  button_link?: string;
  dismissible: boolean;
  image_url?: string;
}

const AUTO_MS = 5000;

const AnnouncementPopup = () => {
  const [items, setItems] = useState<Announcement[]>([]);
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const [session, setSession] = useState<any>(null);

  const [sliding, setSliding] = useState(false);
  const [slideDir, setSlideDir] = useState<"left" | "right">("left");
  const [progressKey, setProgressKey] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slidingRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
  }, []);

  const fetchAnnouncements = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch("/api/announcements/active", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const data: Announcement[] = await res.json();
      if (data && data.length > 0) {
        setItems(data);
        setIdx(0);
        setVisible(true);
        setProgressKey(0);
      }
    } catch {}
  }, [session?.access_token]);

  useEffect(() => {
    if (session) fetchAnnouncements();
  }, [session, fetchAnnouncements]);

  const navigate = useCallback((newIdx: number, dir: "left" | "right") => {
    if (slidingRef.current) return;
    slidingRef.current = true;
    setSliding(true);
    setSlideDir(dir);
    setTimeout(() => {
      setIdx(newIdx);
      setProgressKey(k => k + 1);
      setSliding(false);
      slidingRef.current = false;
    }, 280);
  }, []);

  const goNext = useCallback((total: number, current: number) => {
    navigate((current + 1) % total, "left");
  }, [navigate]);

  const goPrev = useCallback((total: number, current: number) => {
    navigate((current - 1 + total) % total, "right");
  }, [navigate]);

  useEffect(() => {
    if (!visible || items.length <= 1) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setIdx(prev => {
        const next = (prev + 1) % items.length;
        navigate(next, "left");
        return prev;
      });
    }, AUTO_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [visible, items.length, navigate]);

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (items.length > 1) {
      timerRef.current = setInterval(() => {
        setIdx(prev => {
          navigate((prev + 1) % items.length, "left");
          return prev;
        });
      }, AUTO_MS);
    }
  };

  const closeAll = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setVisible(false);
    setTimeout(() => setItems([]), 350);
  };

  if (items.length === 0) return null;

  const current = items[idx];
  const multi = items.length > 1;
  const Icon = current.type === "welcome" ? PartyPopper : Megaphone;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center transition-all duration-300 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Card — bottom-sheet on mobile, floating modal on desktop */}
      <div
        className={`relative z-10 w-full sm:max-w-md overflow-hidden
          rounded-t-3xl sm:rounded-2xl border border-border bg-card shadow-2xl
          transition-all duration-300
          ${visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-10 scale-95 opacity-0"}
        `}
      >
        {/* Auto-advance progress bar */}
        {multi && (
          <div className="absolute top-0 left-0 right-0 z-10 h-[3px] bg-border/60">
            <div
              key={progressKey}
              className="h-full bg-primary rounded-full"
              style={{ animation: `ad-progress ${AUTO_MS}ms linear forwards` }}
            />
          </div>
        )}

        {/* Drag handle — mobile hint */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-3 pb-4 sm:pt-5 sm:border-b sm:border-border">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            current.type === "welcome" ? "bg-amber-500/20" : "bg-primary/20"
          }`}>
            <Icon className={`h-4 w-4 ${current.type === "welcome" ? "text-amber-400" : "text-primary"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-foreground leading-tight text-sm sm:text-base">{current.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {current.type === "welcome" ? "Selamat datang" : "Pengumuman dari AINA"}
              {multi && <span className="ml-1.5 opacity-60">· {idx + 1}/{items.length}</span>}
            </p>
          </div>
          <button
            onClick={closeAll}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body with slide animation */}
        <div className="overflow-hidden">
          <div
            className="px-5 py-4 space-y-3 transition-all duration-300 ease-in-out"
            style={{
              opacity: sliding ? 0 : 1,
              transform: sliding
                ? slideDir === "left" ? "translateX(-16px)" : "translateX(16px)"
                : "translateX(0)",
            }}
          >
            {current.image_url && (
              <div className="overflow-hidden rounded-xl border border-border bg-secondary">
                <img
                  src={current.image_url}
                  alt={current.title}
                  className="w-full max-h-44 sm:max-h-64 object-contain"
                />
              </div>
            )}
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{current.message}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-border px-5 py-3">
          {/* Dot indicators */}
          {multi && (
            <div className="flex items-center gap-1.5 flex-1">
              {items.map((_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    navigate(i, i > idx ? "left" : "right");
                    resetTimer();
                  }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === idx ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                  }`}
                />
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5 ml-auto">
            {multi && (
              <>
                <button
                  onClick={() => { goPrev(items.length, idx); resetTimer(); }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { goNext(items.length, idx); resetTimer(); }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}
            {current.button_text && current.button_link && (
              <Button
                size="sm"
                variant="hero"
                className="gap-1.5 h-8 text-xs"
                onClick={() => window.open(current.button_link, "_blank")}
              >
                {current.button_text}
                <ExternalLink className="h-3 w-3" />
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={closeAll}>
              Tutup
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnouncementPopup;
