import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface SystemRestartBannerProps {
  isAdmin: boolean;
}

type BannerState = "idle" | "visible" | "restarting" | "done" | "dismissed";

async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export default function SystemRestartBanner({ isAdmin }: SystemRestartBannerProps) {
  const [state, setState] = useState<BannerState>("idle");
  const [countdown, setCountdown] = useState(5);

  const checkStatus = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch("/api/admin/system/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.needsRestart) {
        setState("visible");
      }
    } catch {
      // Silent — non-critical feature
    }
  }, [isAdmin]);

  // Trigger check 2 seconds after mount (i.e. after login)
  useEffect(() => {
    if (!isAdmin) return;
    const t = setTimeout(checkStatus, 2000);
    return () => clearTimeout(t);
  }, [isAdmin, checkStatus]);

  // Countdown after restart response
  useEffect(() => {
    if (state !== "restarting") return;
    if (countdown <= 0) {
      window.location.reload();
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [state, countdown]);

  const handleRestart = async () => {
    setState("restarting");
    setCountdown(5);
    try {
      const token = await getAuthToken();
      if (!token) return;
      await fetch("/api/admin/system/restart", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Server sedang restart...", { duration: 6000 });
    } catch {
      toast.error("Gagal restart server. Coba lagi.");
      setState("visible");
    }
  };

  const handleDismiss = () => setState("dismissed");

  if (!isAdmin || state === "idle" || state === "dismissed") return null;

  // ── Restarting state ──────────────────────────────────────────────
  if (state === "restarting") {
    return (
      <div className="fixed top-0 left-0 right-0 z-[999] flex items-center justify-center gap-3 bg-amber-500/95 px-4 py-2.5 text-white shadow-lg backdrop-blur-sm">
        <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
        <span className="text-sm font-medium">
          Server sedang restart... Halaman akan refresh otomatis dalam{" "}
          <span className="font-bold tabular-nums">{countdown}</span> detik
        </span>
      </div>
    );
  }

  // ── Needs restart banner ──────────────────────────────────────────
  return (
    <div className="fixed top-0 left-0 right-0 z-[999] flex items-center gap-3 bg-yellow-400/95 px-4 py-2.5 text-yellow-950 shadow-lg backdrop-blur-sm">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-sm font-medium">
        Ada perubahan sistem baru — server perlu di-restart agar update aktif.
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="default"
          className="h-7 gap-1.5 bg-yellow-900 px-3 text-xs text-white hover:bg-yellow-800"
          onClick={handleRestart}
        >
          <RefreshCw className="h-3 w-3" />
          Restart Sekarang
        </Button>
        <button
          onClick={handleDismiss}
          className="rounded p-0.5 opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Tutup"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
