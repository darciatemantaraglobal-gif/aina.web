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

    const fadeTimer = setTimeout(() => setPhase("fading"), 2000);
    const hideTimer = setTimeout(() => setPhase("hidden"), 2800);

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
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: "radial-gradient(ellipse at 50% 38%, #12022e 0%, #080010 55%, #000 100%)",
        opacity:    fading ? 0 : 1,
        transition: fading ? "opacity 800ms ease-in-out" : "none",
        pointerEvents: "none",
      }}
    >
      {/* Outer halo — expands slowly while visible */}
      <div
        style={{
          position: "absolute",
          width: 360,
          height: 360,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.13) 0%, transparent 70%)",
          filter: "blur(40px)",
          transform: entering ? "scale(0.3)" : fading ? "scale(1.6)" : "scale(1)",
          opacity:   entering ? 0 : fading ? 0 : 1,
          transition: entering
            ? "transform 1000ms cubic-bezier(0.16,1,0.3,1), opacity 600ms ease"
            : fading
            ? "transform 800ms ease-in, opacity 800ms ease-in"
            : "none",
          animation: visible ? "outerHaloPulse 3s ease-in-out infinite" : "none",
        }}
      />

      {/* Mid glow — tighter, brighter */}
      <div
        style={{
          position: "absolute",
          width: 200,
          height: 200,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(167,139,250,0.28) 0%, rgba(139,92,246,0.12) 50%, transparent 75%)",
          filter: "blur(20px)",
          transform: entering ? "scale(0.2)" : fading ? "scale(1.3)" : "scale(1)",
          opacity:   entering ? 0 : fading ? 0 : 1,
          transition: entering
            ? "transform 900ms cubic-bezier(0.16,1,0.3,1) 80ms, opacity 500ms ease 80ms"
            : fading
            ? "transform 700ms ease-in, opacity 700ms ease-in"
            : "none",
          animation: visible ? "midGlowPulse 2.4s ease-in-out infinite 0.3s" : "none",
        }}
      />

      {/* Icon — no box, just the image with glow */}
      <div
        style={{
          position: "relative",
          width: 112,
          height: 112,
          transform: entering
            ? "scale(0.5) translateY(20px)"
            : fading
            ? "scale(0.9) translateY(-6px)"
            : "scale(1) translateY(0)",
          opacity:   entering ? 0 : fading ? 0 : 1,
          transition: entering
            ? "transform 750ms cubic-bezier(0.34,1.56,0.64,1) 120ms, opacity 450ms ease 120ms"
            : fading
            ? "transform 700ms ease-in, opacity 700ms ease-in"
            : "none",
          filter: entering
            ? "drop-shadow(0 0 0px rgba(139,92,246,0))"
            : fading
            ? "drop-shadow(0 0 8px rgba(139,92,246,0.3))"
            : "drop-shadow(0 0 22px rgba(167,139,250,0.75)) drop-shadow(0 0 50px rgba(139,92,246,0.4))",
          animation: visible ? "iconGlow 2.4s ease-in-out infinite" : "none",
        }}
      >
        <img
          src="/aina-icon.png"
          alt="AINA"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
          }}
        />
      </div>

      {/* Text */}
      <div
        style={{
          marginTop: 28,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 5,
          transform: entering ? "translateY(14px)" : fading ? "translateY(-6px)" : "translateY(0)",
          opacity:   entering ? 0 : fading ? 0 : 1,
          transition: "transform 750ms cubic-bezier(0.34,1.56,0.64,1) 200ms, opacity 500ms ease 200ms",
        }}
      >
        <span
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "0.18em",
            color: "#fff",
            textShadow: "0 0 20px rgba(167,139,250,0.6)",
          }}
        >
          AINA
        </span>
        <span
          style={{
            fontSize: 11,
            color: "rgba(167,139,250,0.5)",
            letterSpacing: "0.06em",
            fontWeight: 500,
          }}
        >
          Asisten Pintar Masisir
        </span>
      </div>

      {/* Subtle bottom shimmer line */}
      <div
        style={{
          position: "absolute",
          bottom: "30%",
          left: "50%",
          transform: "translateX(-50%)",
          width: entering ? "0%" : fading ? "0%" : "40%",
          height: 1,
          background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.35), transparent)",
          opacity: entering ? 0 : fading ? 0 : 1,
          transition: "width 1200ms ease 400ms, opacity 600ms ease 400ms",
        }}
      />

      {/* Loading dots */}
      <div
        style={{
          marginTop: 36,
          display: "flex",
          gap: 7,
          opacity: entering ? 0 : fading ? 0 : 1,
          transition: "opacity 400ms ease 350ms",
        }}
      >
        {[0, 1, 2].map(i => (
          <span
            key={i}
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: `rgba(167,139,250,${0.5 + i * 0.15})`,
              display: "inline-block",
              animation: `dotBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes outerHaloPulse {
          0%, 100% { transform: scale(1);    opacity: 0.85; }
          50%       { transform: scale(1.08); opacity: 0.6;  }
        }
        @keyframes midGlowPulse {
          0%, 100% { transform: scale(1);    opacity: 1;   }
          50%       { transform: scale(1.12); opacity: 0.7; }
        }
        @keyframes iconGlow {
          0%, 100% { filter: drop-shadow(0 0 22px rgba(167,139,250,0.75)) drop-shadow(0 0 50px rgba(139,92,246,0.40)); }
          50%       { filter: drop-shadow(0 0 30px rgba(167,139,250,0.95)) drop-shadow(0 0 70px rgba(139,92,246,0.60)); }
        }
        @keyframes dotBounce {
          0%, 80%, 100% { transform: translateY(0);   opacity: 0.45; }
          40%            { transform: translateY(-7px); opacity: 1;    }
        }
      `}</style>
    </div>
  );
}
