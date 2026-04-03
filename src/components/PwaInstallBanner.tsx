import { useState, useEffect } from "react";
import { Download, X, RefreshCw } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

export default function PwaInstallBanner() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) console.log("[PWA] Service Worker registered");
    },
    onRegisterError(error) {
      console.warn("[PWA] SW registration error:", error);
    },
  });

  useEffect(() => {
    const dismissed = sessionStorage.getItem("pwa-install-dismissed");
    if (dismissed) return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) return;

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
    sessionStorage.setItem("pwa-install-dismissed", "1");
    setDismissed(true);
    setShowInstall(false);
  };

  if (dismissed) return null;

  if (needRefresh) {
    return (
      <div className="fixed bottom-20 md:bottom-4 left-1/2 z-50 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-background/95 px-4 py-3 shadow-lg backdrop-blur-md">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
            <RefreshCw className="h-4 w-4 text-primary" />
          </div>
          <p className="flex-1 text-[13px] text-foreground/80">
            Versi baru AINA tersedia!
          </p>
          <button
            onClick={() => updateServiceWorker(true)}
            className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Perbarui
          </button>
        </div>
      </div>
    );
  }

  if (!showInstall) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-1/2 z-50 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-background/95 px-4 py-3 shadow-xl backdrop-blur-md">
        <img src="/aina-icon.png" alt="AINA" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-foreground">Pasang AINA di HP kamu</p>
          <p className="text-[11px] text-muted-foreground">Akses lebih cepat, bisa offline</p>
        </div>
        <button
          onClick={handleInstall}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 shrink-0"
        >
          <Download className="h-3.5 w-3.5" />
          Pasang
        </button>
        <button
          onClick={handleDismiss}
          className="rounded-lg p-1 text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
          aria-label="Tutup"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
