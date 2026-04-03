/**
 * S6 — Offline Indicator
 *
 * Listens to browser online/offline events and shows a persistent banner
 * when the user loses internet connection. Dismisses automatically when
 * connectivity is restored.
 */

import { useState, useEffect } from "react";
import { WifiOff, Wifi } from "lucide-react";

export default function OfflineIndicator() {
  const [isOffline, setIsOffline]           = useState(!navigator.onLine);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const handleOffline = () => {
      setIsOffline(true);
      setJustReconnected(false);
    };

    const handleOnline = () => {
      setIsOffline(false);
      setJustReconnected(true);
      // Show "kembali online" briefly, then hide
      reconnectTimer = setTimeout(() => setJustReconnected(false), 3000);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online",  handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online",  handleOnline);
      clearTimeout(reconnectTimer);
    };
  }, []);

  // Neither offline nor recently reconnected — render nothing
  if (!isOffline && !justReconnected) return null;

  return (
    <div
      className={`fixed top-0 inset-x-0 z-[9998] flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-all duration-300 ${
        isOffline
          ? "bg-destructive/90 text-destructive-foreground"
          : "bg-green-600/90 text-white"
      }`}
      role="alert"
      aria-live="assertive"
    >
      {isOffline ? (
        <>
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>Tidak ada koneksi internet — pesan mungkin tidak terkirim</span>
        </>
      ) : (
        <>
          <Wifi className="h-4 w-4 shrink-0" />
          <span>Koneksi kembali tersambung</span>
        </>
      )}
    </div>
  );
}
