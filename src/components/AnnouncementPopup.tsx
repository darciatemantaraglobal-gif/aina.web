import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: string;
  button_text?: string;
  button_link?: string;
  dismissible: boolean;
  image_url?: string;
  show_once_per_user?: boolean;
  trigger_type?: string;
  delay_seconds?: number;
}

const AUTO_MS = 5000;
const DISMISSED_KEY = "aina_dismissed_announcements";

async function getAuthHeader(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? `Bearer ${session.access_token}` : "";
}

function getDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]"); } catch { return []; }
}

function saveDismissed(ids: string[]) {
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...new Set([...getDismissed(), ...ids])])); } catch {}
}

async function serverDismiss(ids: string[], auth: string) {
  for (const id of ids) {
    fetch(`/api/announcements/${id}/dismiss`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
    }).catch(() => {});
  }
}

function AnnouncementSlideshow({ items, onDismissForever, onClose }: {
  items: Announcement[];
  onDismissForever: () => void;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const [sliding, setSliding] = useState(false);
  const [slideDir, setSlideDir] = useState<"left" | "right">("left");
  const [progressKey, setProgressKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slidingRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

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
    }, 250);
  }, []);

  const goNext = useCallback((total: number, current: number) => navigate((current + 1) % total, "left"), [navigate]);
  const goPrev = useCallback((total: number, current: number) => navigate((current - 1 + total) % total, "right"), [navigate]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setIdx(prev => {
        const next = (prev + 1) % items.length;
        navigate(next, "left");
        return prev;
      });
    }, AUTO_MS);
  }, [items.length, navigate]);

  useEffect(() => {
    if (!visible || items.length <= 1) return;
    resetTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [visible, items.length, resetTimer]);

  const closeAll = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setVisible(false);
    setTimeout(onClose, 350);
  };

  const current = items[idx];
  const multi = items.length > 1;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className={`relative z-10 w-full max-w-sm mx-4 overflow-hidden
          rounded-3xl border border-border/50 bg-card shadow-2xl
          transition-all duration-300
          ${visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-10 scale-95 opacity-0"}
        `}
      >
        {multi && (
          <div className="absolute top-0 left-0 right-0 z-20 h-[3px] bg-white/10">
            <div
              key={progressKey}
              className="h-full bg-white/60 rounded-full"
              style={{ animation: `ad-progress ${AUTO_MS}ms linear forwards` }}
            />
          </div>
        )}

        <button
          onClick={closeAll}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="overflow-hidden">
          <div
            className="transition-all duration-250 ease-in-out"
            style={{
              opacity: sliding ? 0 : 1,
              transform: sliding
                ? slideDir === "left" ? "translateX(-20px)" : "translateX(20px)"
                : "translateX(0)",
            }}
          >
            {current.image_url ? (
              <img
                src={current.image_url}
                alt={current.title}
                className="w-full block"
                style={{ maxHeight: "80vh", objectFit: "contain", background: "transparent" }}
              />
            ) : (
              <div className="flex items-center justify-center bg-gradient-to-br from-primary/20 to-violet-500/10 py-10">
                <div className="text-4xl">📢</div>
              </div>
            )}

            <div className="px-4 pt-3 pb-1">
              <p className="font-semibold text-sm text-foreground leading-snug">{current.title}</p>
              {current.message && (
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {current.message}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-3">
          {multi && (
            <div className="flex items-center gap-1.5 flex-1">
              {items.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { navigate(i, i > idx ? "left" : "right"); resetTimer(); }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === idx ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                  }`}
                />
              ))}
            </div>
          )}

          <div className="flex items-center gap-1 ml-auto">
            {multi && (
              <>
                <button
                  onClick={() => { goPrev(items.length, idx); resetTimer(); }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { goNext(items.length, idx); resetTimer(); }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}
            {current.button_text && current.button_link && (
              <Button
                size="sm"
                variant="hero"
                className="h-7 px-3 text-xs gap-1"
                onClick={() => window.open(current.button_link, "_blank")}
              >
                {current.button_text}
                <ExternalLink className="h-3 w-3" />
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 px-3 text-xs text-muted-foreground hover:text-foreground" onClick={onDismissForever}>
              Jangan tampilkan lagi
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-3 text-xs" onClick={closeAll}>
              Tutup
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const AnnouncementPopup = () => {
  const [dashboardItems, setDashboardItems] = useState<Announcement[]>([]);
  const [firstChatItems, setFirstChatItems] = useState<Announcement[]>([]);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showFirstChat, setShowFirstChat] = useState(false);

  const fetchedRef = useRef(false);
  const firstChatShownRef = useRef(false);
  const authRef = useRef("");

  const fetchAnnouncements = useCallback(async () => {
    if (fetchedRef.current) return;
    const auth = await getAuthHeader();
    if (!auth) return;
    fetchedRef.current = true;
    authRef.current = auth;

    try {
      const res = await fetch("/api/announcements/active", {
        headers: { Authorization: auth },
      });
      if (!res.ok) return;
      const data: Announcement[] = await res.json();
      const dismissed = getDismissed();

      // Client-side filter: skip locally dismissed (non-show_once items)
      const visible = (data || []).filter(a => !dismissed.includes(a.id));
      if (visible.length === 0) return;

      const dashboard = visible.filter(a => !a.trigger_type || a.trigger_type === "on_dashboard_open");
      const firstChat = visible.filter(a => a.trigger_type === "after_first_chat");

      if (dashboard.length > 0) {
        const delayMs = (Math.min(...dashboard.map(a => a.delay_seconds ?? 5))) * 1000;
        setTimeout(() => {
          setDashboardItems(dashboard);
          setShowDashboard(true);
        }, Math.max(delayMs, 0));
      }

      if (firstChat.length > 0) {
        setFirstChatItems(firstChat);
      }
    } catch {}
  }, []);

  // Trigger fetch after login
  useEffect(() => {
    let delayTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleOrFetch = (hasSession: boolean) => {
      if (!hasSession) return;
      delayTimer = setTimeout(() => { fetchAnnouncements(); }, 1000);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      scheduleOrFetch(!!session);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      scheduleOrFetch(!!session);
    });
    return () => {
      subscription.unsubscribe();
      if (delayTimer) clearTimeout(delayTimer);
    };
  }, [fetchAnnouncements]);

  // Listen for first-chat event
  useEffect(() => {
    const handler = () => {
      if (firstChatShownRef.current || firstChatItems.length === 0) return;
      firstChatShownRef.current = true;
      const delayMs = (Math.min(...firstChatItems.map(a => a.delay_seconds ?? 2))) * 1000;
      setTimeout(() => setShowFirstChat(true), Math.max(delayMs, 0));
    };
    window.addEventListener("aina:first_chat", handler);
    return () => window.removeEventListener("aina:first_chat", handler);
  }, [firstChatItems]);

  const handleDismissForever = async (items: Announcement[], hideFn: () => void) => {
    const ids = items.map(a => a.id);
    saveDismissed(ids);
    // Server-side dismiss for show_once_per_user announcements
    const onceIds = items.filter(a => a.show_once_per_user).map(a => a.id);
    if (onceIds.length > 0 && authRef.current) {
      serverDismiss(onceIds, authRef.current);
    }
    hideFn();
  };

  return (
    <>
      {showDashboard && dashboardItems.length > 0 && (
        <AnnouncementSlideshow
          items={dashboardItems}
          onClose={() => setShowDashboard(false)}
          onDismissForever={() => handleDismissForever(dashboardItems, () => setShowDashboard(false))}
        />
      )}
      {showFirstChat && firstChatItems.length > 0 && (
        <AnnouncementSlideshow
          items={firstChatItems}
          onClose={() => setShowFirstChat(false)}
          onDismissForever={() => handleDismissForever(firstChatItems, () => setShowFirstChat(false))}
        />
      )}
    </>
  );
};

export default AnnouncementPopup;
