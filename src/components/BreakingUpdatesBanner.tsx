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
  const [expanded, setExpanded] = useState(false);

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
      const visible = all.filter(u => !dismissed.includes(u.id));
      setUpdates(visible);
      setIndex(0);
      setVisible(visible.length > 0);
      setExpanded(false);
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
    setExpanded(false);
  };

  const dismissAll = () => {
    updates.forEach(u => addDismissed(u.id));
    setUpdates([]);
    setVisible(false);
  };

  if (!visible || updates.length === 0) return null;

  const current = updates[index];

  return (
    <div className="shrink-0 animate-in slide-in-from-top-2 duration-300">
      <div className="mx-0 border-b border-red-500/20 bg-red-500/8 px-4 py-2.5">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20">
              <Zap className="h-3 w-3 text-red-400" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
              Update
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <button
              onClick={() => setExpanded(e => !e)}
              className="w-full text-left"
            >
              <p className="text-sm font-semibold text-foreground leading-snug">
                {current.topic}
              </p>
              {!expanded && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                  {current.content}
                </p>
              )}
              {expanded && (
                <p className="mt-1 text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
                  {current.content}
                </p>
              )}
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {updates.length > 1 && (
              <>
                <button
                  onClick={() => { setIndex(i => Math.max(i - 1, 0)); setExpanded(false); }}
                  disabled={index === 0}
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {index + 1}/{updates.length}
                </span>
                <button
                  onClick={() => { setIndex(i => Math.min(i + 1, updates.length - 1)); setExpanded(false); }}
                  disabled={index === updates.length - 1}
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            <button
              onClick={() => dismiss(current.id)}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="Tutup update ini"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {updates.length > 1 && (
              <button
                onClick={dismissAll}
                className="hidden sm:flex h-6 items-center rounded-lg px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title="Tutup semua"
              >
                Tutup semua
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BreakingUpdatesBanner;
