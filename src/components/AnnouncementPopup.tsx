import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { X, Megaphone, PartyPopper, ExternalLink } from "lucide-react";

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

const AnnouncementPopup = () => {
  const [queue, setQueue] = useState<Announcement[]>([]);
  const [current, setCurrent] = useState<Announcement | null>(null);
  const [visible, setVisible] = useState(false);
  const [session, setSession] = useState<any>(null);

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
        setQueue(data);
        setCurrent(data[0]);
        setVisible(true);
      }
    } catch {
      // silently fail — announcements are non-critical
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (session) fetchAnnouncements();
  }, [session, fetchAnnouncements]);

  const dismiss = (id: string) => {
    // Close locally for this session only — popup will show again on next visit (ad behaviour)
    setVisible(false);
    setTimeout(() => {
      const remaining = queue.filter(a => a.id !== id);
      if (remaining.length > 0) {
        setQueue(remaining);
        setCurrent(remaining[0]);
        setVisible(true);
      } else {
        setQueue([]);
        setCurrent(null);
      }
    }, 300);
  };

  if (!current) return null;

  const Icon = current.type === "welcome" ? PartyPopper : Megaphone;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      {/* Backdrop — tidak bisa diklik untuk tutup, harus pakai tombol X */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Card */}
      <div
        className={`relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl transition-all duration-300 ${visible ? "translate-y-0 scale-100" : "translate-y-4 scale-95"}`}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${current.type === "welcome" ? "bg-amber-500/20" : "bg-primary/20"}`}>
            <Icon className={`h-4 w-4 ${current.type === "welcome" ? "text-amber-400" : "text-primary"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-foreground leading-tight">{current.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {current.type === "welcome" ? "Selamat datang" : "Pengumuman dari AINA"}
            </p>
          </div>
          <button
            onClick={() => dismiss(current.id)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {current.image_url && (
            <div className="overflow-hidden rounded-xl border border-border bg-secondary">
              <img
                src={current.image_url}
                alt={current.title}
                className="w-full max-h-72 object-contain"
              />
            </div>
          )}
          <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{current.message}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          {current.button_text && current.button_link && (
            <Button
              size="sm"
              variant="hero"
              className="gap-1.5"
              onClick={() => {
                window.open(current.button_link, "_blank");
              }}
            >
              {current.button_text}
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => dismiss(current.id)}>
            Tutup
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AnnouncementPopup;
