import { useState, useEffect, useCallback } from "react";
import { X, Zap, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Update {
  id: string;
  topic: string;
  content: string;
  created_at: string;
}

const DISMISSED_KEY = "aina_dismissed_updates";

function getDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function addDismissed(id: string) {
  const prev = getDismissed();
  if (!prev.includes(id)) {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...prev, id]));
  }
}

const BreakingUpdatesBanner = () => {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/active-updates", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const all: Update[] = await res.json();

      const dismissed = getDismissed();
      const undismissed = all.filter(u => !dismissed.includes(u.id));
      setUpdates(undismissed);
      setIndex(0);
      setVisible(undismissed.length > 0);
    } catch {
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  const dismiss = (id: string) => {
    addDismissed(id);
    const next = updates.filter(u => u.id !== id);
    setUpdates(next);
    setIndex(prev => Math.min(prev, Math.max(next.length - 1, 0)));
    if (next.length === 0) setVisible(false);
  };

  const dismissAll = () => {
    updates.forEach(u => addDismissed(u.id));
    setUpdates([]);
    setVisible(false);
  };

  if (!visible || updates.length === 0) return null;

  const current = updates[index];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
      <div
        className="pointer-events-auto w-full max-w-sm animate-in fade-in zoom-in-95 duration-300"
      >
        <div className="overflow-hidden rounded-2xl border border-red-500/30 bg-card shadow-2xl shadow-red-500/10">
          {/* Red accent bar */}
          <div className="h-1 w-full bg-gradient-to-r from-red-600 via-red-500 to-orange-500" />

          <div className="p-4">
            {/* Header */}
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15">
                  <Zap className="h-3.5 w-3.5 text-red-400" />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-red-400">
                  Breaking Update
                </span>
                {updates.length > 1 && (
                  <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400 tabular-nums">
                    {index + 1}/{updates.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => dismiss(current.id)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="space-y-1.5">
              <p className="text-sm font-semibold leading-snug text-foreground">
                {current.topic}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {current.content}
              </p>
            </div>

            {/* Navigation / dismiss */}
            {updates.length > 1 && (
              <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setIndex(i => Math.max(i - 1, 0))}
                    disabled={index === 0}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setIndex(i => Math.min(i + 1, updates.length - 1))}
                    disabled={index === updates.length - 1}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <button
                  onClick={dismissAll}
                  className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  Tutup semua
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BreakingUpdatesBanner;
