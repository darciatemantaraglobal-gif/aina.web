import { useState, useEffect } from "react";

const SPLASH_KEY = "pwa-splash-shown";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export default function PwaSplash() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading]   = useState(false);

  useEffect(() => {
    // Only show in standalone PWA mode, and only on first launch per session
    if (!isStandalone()) return;
    if (sessionStorage.getItem(SPLASH_KEY)) return;

    sessionStorage.setItem(SPLASH_KEY, "1");
    setVisible(true);

    // Start fade-out after 1.2s
    const fadeTimer = setTimeout(() => setFading(true), 1200);
    // Fully remove after fade completes (600ms transition)
    const hideTimer = setTimeout(() => setVisible(false), 1800);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background"
      style={{
        transition: "opacity 600ms ease-out",
        opacity: fading ? 0 : 1,
        pointerEvents: "none",
      }}
    >
      <div className="flex flex-col items-center gap-4">
        <img
          src="/aina-icon.png"
          alt="AINA"
          className="h-20 w-20 rounded-[22px] shadow-2xl"
          style={{
            transition: "transform 600ms ease-out, opacity 600ms ease-out",
            transform: fading ? "scale(0.92)" : "scale(1)",
          }}
        />
        <div className="flex flex-col items-center gap-1">
          <span className="text-xl font-bold tracking-widest text-foreground">AINA</span>
          <span className="text-xs text-muted-foreground">Asisten Pintar Masisir</span>
        </div>
        <div className="mt-2 flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-primary/60"
              style={{
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
