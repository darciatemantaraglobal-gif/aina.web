import { useState, useEffect } from "react";
import { Download, X, Share, RefreshCw } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";

const DISMISS_KEY  = "pwa-install-dismissed-at";
const COOLDOWN_MS  = 7 * 24 * 60 * 60 * 1000; // 7 hari

function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) && !(window.navigator as any).standalone;
}

function isInStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
}

function isDismissedRecently(): boolean {
  const ts = localStorage.getItem(DISMISS_KEY);
  if (!ts) return false;
  return Date.now() - Number(ts) < COOLDOWN_MS;
}

export default function PwaInstallBanner() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstall, setShowInstall]     = useState(false);
  const [showIOS, setShowIOS]             = useState(false);

  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) { if (r) console.log("[PWA] Service Worker registered"); },
    onRegisterError(e) { console.warn("[PWA] SW error:", e); },
  });

  // Notify user when app is ready for offline use (first time only)
  useEffect(() => {
    if (offlineReady) {
      toast.success("AINA siap digunakan offline", {
        description: "Konten yang sudah dimuat tersedia tanpa internet.",
        duration: 4000,
      });
    }
  }, [offlineReady]);

  useEffect(() => {
    if (isInStandalone() || isDismissedRecently()) return;

    // iOS Safari: beforeinstallprompt tidak pernah muncul — tampilkan panduan manual
    if (isIOS()) {
      // Tunda 4 detik agar user sempat orientasi dulu
      const t = setTimeout(() => setShowIOS(true), 4000);
      return () => clearTimeout(t);
    }

    // Android & desktop Chrome
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler as any);
    return () => window.removeEventListener("beforeinstallprompt", handler as any);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setShowInstall(false);
    setInstallPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShowInstall(false);
    setShowIOS(false);
  };

  // ── Update available banner — shown at top, user decides when to refresh ────
  // (tidak auto-reload agar tidak memutus sesi chat yang sedang berjalan)
  if (needRefresh) {
    return (
      <div className="fixed top-0 inset-x-0 z-[9997] flex items-center justify-center gap-3 bg-primary/95 px-4 py-2.5 text-[13px] text-primary-foreground backdrop-blur-sm shadow-md">
        <RefreshCw className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">Versi baru AINA tersedia</span>
        <button
          onClick={() => updateServiceWorker(true)}
          className="rounded-lg bg-primary-foreground/20 px-3 py-1 text-[12px] font-semibold hover:bg-primary-foreground/30 transition-colors shrink-0"
        >
          Perbarui
        </button>
      </div>
    );
  }

  // ── iOS install guide ────────────────────────────────────────────────────
  if (showIOS) {
    return (
      <div className="fixed bottom-20 md:bottom-4 left-1/2 z-50 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm animate-in slide-in-from-bottom-4 duration-300">
        <div className="rounded-2xl border border-white/10 bg-background/97 px-4 py-4 shadow-xl backdrop-blur-md">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <img src="/aina-icon.png" alt="AINA" className="h-8 w-8 rounded-xl object-cover shrink-0" />
              <p className="text-[13px] font-semibold text-foreground">Pasang AINA di iPhone kamu</p>
            </div>
            <button onClick={handleDismiss} className="rounded-lg p-1 text-muted-foreground/60 hover:text-foreground transition-colors shrink-0 ml-2">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1.5 mt-3">
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-bold">1</span>
              <span>Tap tombol <Share className="inline h-3.5 w-3.5 mx-0.5 -mt-0.5" /> di bawah browser</span>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-bold">2</span>
              <span>Pilih <strong className="text-foreground">"Add to Home Screen"</strong></span>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-bold">3</span>
              <span>Tap <strong className="text-foreground">Add</strong> — selesai!</span>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground/50 text-center">Akses lebih cepat langsung dari home screen</p>
        </div>
      </div>
    );
  }

  // ── Android/Chrome install prompt ────────────────────────────────────────
  if (!showInstall) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-1/2 z-50 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-background/95 px-4 py-3 shadow-xl backdrop-blur-md">
        <img src="/aina-icon.png" alt="AINA" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-foreground">Pasang AINA di HP kamu</p>
          <p className="text-[11px] text-muted-foreground">Akses lebih cepat langsung dari home screen</p>
        </div>
        <button
          onClick={handleInstall}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 shrink-0"
        >
          <Download className="h-3.5 w-3.5" />
          Pasang
        </button>
        <button onClick={handleDismiss} className="rounded-lg p-1 text-muted-foreground/60 hover:text-foreground transition-colors shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
