import { useState, useEffect } from "react";

const SPLASH_KEY = "pwa-splash-shown";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export default function PwaSplash() {
  const [phase, setPhase] = useState<"hidden" | "entering" | "visible" | "fading">("hidden");

  useEffect(() => {
    if (!isStandalone()) return;
    if (sessionStorage.getItem(SPLASH_KEY)) return;

    sessionStorage.setItem(SPLASH_KEY, "1");

    // Phase timeline
    requestAnimationFrame(() => {
      setPhase("entering");
      setTimeout(() => setPhase("visible"), 50);
    });

    const fadeTimer = setTimeout(() => setPhase("fading"), 1600);
    const hideTimer = setTimeout(() => setPhase("hidden"), 2400);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  const entering = phase === "entering";
  const fading   = phase === "fading";

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{
        background: "radial-gradient(ellipse at 50% 40%, #1a0a2e 0%, #0a0a12 60%, #000 100%)",
        opacity:    fading  ? 0 : 1,
        transition: fading  ? "opacity 700ms ease-in-out" : "none",
        pointerEvents: "none",
      }}
    >
      {/* Ambient glow behind icon */}
      <div
        style={{
          position: "absolute",
          width: 240,
          height: 240,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.35) 0%, transparent 70%)",
          filter: "blur(24px)",
          transform: entering ? "scale(0.4)" : fading ? "scale(1.4)" : "scale(1)",
          opacity:   entering ? 0 : fading ? 0 : 1,
          transition: "transform 800ms cubic-bezier(0.34,1.56,0.64,1), opacity 600ms ease",
        }}
      />

      {/* Pulsing ring */}
      <div
        style={{
          position: "absolute",
          width: 148,
          height: 148,
          borderRadius: "30px",
          border: "1.5px solid rgba(139,92,246,0.4)",
          animation: entering || fading ? "none" : "ringPulse 2s ease-in-out infinite",
          transform: entering ? "scale(0.6)" : "scale(1)",
          opacity:   entering ? 0 : 1,
          transition: "transform 700ms cubic-bezier(0.34,1.56,0.64,1), opacity 500ms ease",
        }}
      />

      {/* Icon */}
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: 26,
          overflow: "hidden",
          boxShadow: "0 0 40px rgba(139,92,246,0.5), 0 20px 60px rgba(0,0,0,0.7)",
          transform: entering ? "scale(0.6) translateY(16px)" : fading ? "scale(0.88) translateY(-4px)" : "scale(1) translateY(0)",
          opacity:   entering ? 0 : fading ? 0 : 1,
          transition: entering
            ? "transform 700ms cubic-bezier(0.34,1.56,0.64,1), opacity 400ms ease"
            : fading
            ? "transform 700ms ease-in, opacity 700ms ease-in"
            : "none",
        }}
      >
        <img
          src="/aina-icon.png"
          alt="AINA"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </div>

      {/* Text */}
      <div
        style={{
          marginTop: 24,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          transform: entering ? "translateY(12px)" : fading ? "translateY(-6px)" : "translateY(0)",
          opacity:   entering ? 0 : fading ? 0 : 1,
          transition: "transform 700ms cubic-bezier(0.34,1.56,0.64,1) 100ms, opacity 500ms ease 100ms",
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.15em", color: "#fff" }}>
          AINA
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: "0.05em" }}>
          Asisten Pintar Masisir
        </span>
      </div>

      {/* Loading dots */}
      <div
        style={{
          marginTop: 32,
          display: "flex",
          gap: 6,
          opacity: entering ? 0 : fading ? 0 : 1,
          transition: "opacity 400ms ease 300ms",
        }}
      >
        {[0, 1, 2].map(i => (
          <span
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "rgba(139,92,246,0.7)",
              display: "inline-block",
              animation: `dotBounce 1.1s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes ringPulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50%       { transform: scale(1.08); opacity: 0.15; }
        }
        @keyframes dotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40%           { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
