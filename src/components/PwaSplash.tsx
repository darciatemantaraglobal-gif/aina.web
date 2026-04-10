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

    requestAnimationFrame(() => {
      setPhase("entering");
      setTimeout(() => setPhase("visible"), 60);
    });

    const fadeTimer = setTimeout(() => setPhase("fading"), 2400);
    const hideTimer = setTimeout(() => setPhase("hidden"), 3200);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  const entering = phase === "entering";
  const fading   = phase === "fading";
  const visible  = phase === "visible";

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{
        background: "linear-gradient(160deg, #0e0120 0%, #070010 50%, #030008 100%)",
        opacity:    fading ? 0 : 1,
        transition: fading ? "opacity 800ms ease-in-out" : "none",
        pointerEvents: "none",
      }}
    >

      {/* Ambient glow — single soft orb behind icon */}
      <div style={{
        position: "absolute",
        width: 300, height: 300,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(109,40,217,0.22) 0%, transparent 70%)",
        filter: "blur(50px)",
        transform: entering ? "scale(0.4)" : "scale(1)",
        opacity:   entering ? 0 : fading ? 0 : 1,
        transition: entering
          ? "transform 1400ms cubic-bezier(0.16,1,0.3,1), opacity 1000ms ease"
          : "opacity 800ms ease",
        animation: visible ? "glowBreath 4s ease-in-out infinite" : "none",
      }} />

      {/* Single thin orbit ring */}
      <div style={{
        position: "absolute",
        width: 156, height: 156,
        borderRadius: "50%",
        border: "1px solid rgba(167,139,250,0.18)",
        transform: entering ? "scale(0.6)" : fading ? "scale(1.4)" : "scale(1)",
        opacity:   entering ? 0 : fading ? 0 : 1,
        transition: entering
          ? "transform 1200ms cubic-bezier(0.16,1,0.3,1) 200ms, opacity 800ms ease 200ms"
          : fading
          ? "transform 800ms ease-in, opacity 800ms ease-in"
          : "none",
        animation: visible ? "spinSlow 20s linear infinite" : "none",
      }}>
        {/* Single dot on ring */}
        <div style={{
          position: "absolute",
          top: -3, left: "50%",
          transform: "translateX(-50%)",
          width: 5, height: 5,
          borderRadius: "50%",
          background: "rgba(196,181,253,0.8)",
          boxShadow: "0 0 8px rgba(167,139,250,0.9)",
        }} />
      </div>

      {/* Icon */}
      <div style={{
        width: 88, height: 88,
        borderRadius: 22,
        overflow: "hidden",
        transform: entering ? "scale(0.75) translateY(8px)" : fading ? "scale(0.95) translateY(-4px)" : "scale(1) translateY(0)",
        opacity:   entering ? 0 : fading ? 0 : 1,
        transition: entering
          ? "transform 900ms cubic-bezier(0.34,1.4,0.64,1) 180ms, opacity 600ms ease 180ms"
          : fading
          ? "transform 800ms ease-in, opacity 800ms ease-in"
          : "none",
        boxShadow: entering || fading
          ? "none"
          : "0 0 0 1px rgba(167,139,250,0.15), 0 16px 40px rgba(0,0,0,0.6), 0 0 32px rgba(109,40,217,0.35)",
        animation: visible ? "iconFloat 5s ease-in-out infinite" : "none",
      }}>
        <img
          src="/aina-favicon-512.png"
          alt="AINA"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </div>

      {/* Text */}
      <div style={{
        marginTop: 26,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        transform: entering ? "translateY(12px)" : fading ? "translateY(-8px)" : "translateY(0)",
        opacity:   entering ? 0 : fading ? 0 : 1,
        transition: entering
          ? "transform 800ms cubic-bezier(0.34,1.2,0.64,1) 340ms, opacity 600ms ease 340ms"
          : "transform 800ms ease-in, opacity 800ms ease-in",
      }}>
        <span style={{
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: "0.3em",
          color: "#fff",
          textShadow: "0 0 30px rgba(167,139,250,0.45)",
        }}>
          AINA
        </span>
        <span style={{
          fontSize: 10.5,
          color: "rgba(196,181,253,0.4)",
          letterSpacing: "0.18em",
          fontWeight: 400,
          textTransform: "uppercase",
          transform: entering ? "translateY(6px)" : "translateY(0)",
          opacity:   entering ? 0 : fading ? 0 : 1,
          transition: entering
            ? "transform 800ms ease 480ms, opacity 600ms ease 480ms"
            : "opacity 700ms ease",
        }}>
          Asisten Pintar Masisir
        </span>
      </div>

      {/* Thin separator line */}
      <div style={{
        marginTop: 28,
        width: entering ? "0px" : fading ? "0px" : "48px",
        height: "1px",
        background: "rgba(167,139,250,0.25)",
        transition: entering
          ? "width 900ms ease 500ms"
          : fading
          ? "width 600ms ease"
          : "none",
      }} />

      <style>{`
        @keyframes glowBreath {
          0%, 100% { opacity: 0.85; transform: scale(1);    }
          50%       { opacity: 0.55; transform: scale(1.12); }
        }
        @keyframes spinSlow {
          from { transform: rotate(0deg);   }
          to   { transform: rotate(360deg); }
        }
        @keyframes iconFloat {
          0%, 100% { transform: scale(1)    translateY(0px);  }
          50%       { transform: scale(1.02) translateY(-3px); }
        }
      `}</style>
    </div>
  );
}
