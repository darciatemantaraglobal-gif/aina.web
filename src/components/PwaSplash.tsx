import { useState, useEffect } from "react";

const SPLASH_KEY = "pwa-splash-shown";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

const AINA_LETTERS = ["A", "I", "N", "A"];

const PARTICLES = [
  { angle: 0,   dist: 90,  size: 3,   delay: 0   },
  { angle: 45,  dist: 100, size: 2,   delay: 60  },
  { angle: 90,  dist: 88,  size: 3.5, delay: 30  },
  { angle: 135, dist: 95,  size: 2,   delay: 90  },
  { angle: 180, dist: 92,  size: 3,   delay: 15  },
  { angle: 225, dist: 98,  size: 2.5, delay: 75  },
  { angle: 270, dist: 86,  size: 3,   delay: 45  },
  { angle: 315, dist: 100, size: 2,   delay: 105 },
];

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

    const fadeTimer = setTimeout(() => setPhase("fading"), 2800);
    const hideTimer = setTimeout(() => setPhase("hidden"), 3700);

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
        background: "radial-gradient(ellipse at 50% 40%, #1a0435 0%, #0b0018 45%, #040008 100%)",
        opacity:    fading ? 0 : 1,
        transform:  fading ? "scale(1.06)" : "scale(1)",
        filter:     fading ? "blur(6px)" : "blur(0px)",
        transition: fading
          ? "opacity 900ms cubic-bezier(0.4,0,1,1), transform 900ms ease-in, filter 900ms ease-in"
          : "none",
        pointerEvents: "none",
      }}
    >

      {/* ── Background grid lines ── */}
      <div style={{
        position: "absolute", inset: 0, opacity: entering ? 0 : fading ? 0 : 0.06,
        transition: "opacity 1200ms ease 300ms",
        backgroundImage: `
          linear-gradient(rgba(139,92,246,0.6) 1px, transparent 1px),
          linear-gradient(90deg, rgba(139,92,246,0.6) 1px, transparent 1px)
        `,
        backgroundSize: "48px 48px",
        maskImage: "radial-gradient(ellipse 70% 70% at 50% 50%, black 30%, transparent 75%)",
      }} />

      {/* ── Far ambient glow ── */}
      <div style={{
        position: "absolute",
        width: 480, height: 480,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(109,40,217,0.18) 0%, transparent 70%)",
        filter: "blur(60px)",
        transform: entering ? "scale(0.2)" : fading ? "scale(2)" : "scale(1)",
        opacity:   entering ? 0 : fading ? 0 : 1,
        transition: entering
          ? "transform 1100ms cubic-bezier(0.16,1,0.3,1), opacity 700ms ease"
          : fading
          ? "transform 900ms ease-in, opacity 900ms ease-in"
          : "none",
        animation: visible ? "ambientPulse 4s ease-in-out infinite" : "none",
      }} />

      {/* ── Orbital container ── */}
      <div style={{ position: "relative", width: 220, height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>

        {/* Ring 3 — outermost, slow counter-clockwise, dashed */}
        <div style={{
          position: "absolute",
          width: 210, height: 210,
          borderRadius: "50%",
          border: "1px dashed rgba(139,92,246,0.25)",
          transform: entering ? "scale(0) rotate(0deg)" : fading ? "scale(0.3) rotate(-90deg)" : "scale(1) rotate(0deg)",
          opacity:   entering ? 0 : fading ? 0 : 1,
          transition: entering
            ? "transform 1000ms cubic-bezier(0.34,1.4,0.64,1) 100ms, opacity 600ms ease 100ms"
            : fading
            ? "transform 700ms ease-in, opacity 700ms ease-in"
            : "none",
          animation: visible ? "spinCCW 18s linear infinite" : "none",
        }} />

        {/* Ring 2 — mid, medium speed clockwise, solid thin */}
        <div style={{
          position: "absolute",
          width: 170, height: 170,
          borderRadius: "50%",
          border: "1.5px solid transparent",
          backgroundImage: "linear-gradient(#0b0018,#0b0018), conic-gradient(rgba(167,139,250,0.7) 0deg, rgba(109,40,217,0.1) 180deg, rgba(167,139,250,0.7) 360deg)",
          backgroundOrigin: "border-box",
          backgroundClip: "padding-box, border-box",
          transform: entering ? "scale(0) rotate(0deg)" : fading ? "scale(0.4) rotate(90deg)" : "scale(1) rotate(0deg)",
          opacity:   entering ? 0 : fading ? 0 : 1,
          transition: entering
            ? "transform 950ms cubic-bezier(0.34,1.4,0.64,1) 150ms, opacity 550ms ease 150ms"
            : fading
            ? "transform 700ms ease-in, opacity 700ms ease-in"
            : "none",
          animation: visible ? "spinCW 10s linear infinite" : "none",
        }} />

        {/* Ring 1 — inner, fast counter-clockwise, arc style */}
        <div style={{
          position: "absolute",
          width: 138, height: 138,
          borderRadius: "50%",
          border: "2px solid transparent",
          backgroundImage: "linear-gradient(#0b0018,#0b0018), conic-gradient(rgba(196,181,253,0.9) 0deg, rgba(196,181,253,0.1) 120deg, transparent 160deg, transparent 360deg)",
          backgroundOrigin: "border-box",
          backgroundClip: "padding-box, border-box",
          transform: entering ? "scale(0) rotate(0deg)" : fading ? "scale(0.5) rotate(-180deg)" : "scale(1) rotate(0deg)",
          opacity:   entering ? 0 : fading ? 0 : 1,
          transition: entering
            ? "transform 900ms cubic-bezier(0.34,1.56,0.64,1) 200ms, opacity 500ms ease 200ms"
            : fading
            ? "transform 700ms ease-in, opacity 700ms ease-in"
            : "none",
          animation: visible ? "spinCCW 5s linear infinite" : "none",
        }} />

        {/* Particle dots — burst outward */}
        {PARTICLES.map(p => {
          const rad = (p.angle * Math.PI) / 180;
          const tx  = Math.cos(rad) * p.dist;
          const ty  = Math.sin(rad) * p.dist;
          return (
            <div key={p.id} style={{
              position: "absolute",
              width: p.size, height: p.size,
              borderRadius: "50%",
              background: "rgba(196,181,253,0.9)",
              boxShadow: `0 0 ${p.size * 2}px rgba(167,139,250,0.8)`,
              transform: entering
                ? "translate(0px, 0px) scale(0)"
                : fading
                ? `translate(${tx * 1.8}px, ${ty * 1.8}px) scale(0)`
                : `translate(${tx}px, ${ty}px) scale(1)`,
              opacity: entering ? 0 : fading ? 0 : 0.85,
              transition: entering
                ? `transform 700ms cubic-bezier(0.16,1,0.3,1) ${200 + p.delay}ms, opacity 400ms ease ${200 + p.delay}ms`
                : fading
                ? "transform 600ms ease-in, opacity 600ms ease-in"
                : "none",
            }} />
          );
        })}

        {/* Center glow behind icon */}
        <div style={{
          position: "absolute",
          width: 100, height: 100,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(167,139,250,0.4) 0%, rgba(109,40,217,0.15) 55%, transparent 80%)",
          filter: "blur(12px)",
          animation: visible ? "centerPulse 2.2s ease-in-out infinite" : "none",
          transform: entering ? "scale(0)" : fading ? "scale(0)" : "scale(1)",
          opacity:   entering ? 0 : fading ? 0 : 1,
          transition: entering
            ? "transform 600ms cubic-bezier(0.34,1.56,0.64,1) 250ms, opacity 400ms ease 250ms"
            : "none",
        }} />

        {/* Icon */}
        <div style={{
          position: "relative",
          width: 82, height: 82,
          borderRadius: 20,
          overflow: "hidden",
          transform: entering
            ? "scale(0.3) rotate(-15deg)"
            : fading
            ? "scale(0.6) rotate(10deg)"
            : "scale(1) rotate(0deg)",
          opacity:   entering ? 0 : fading ? 0 : 1,
          transition: entering
            ? "transform 700ms cubic-bezier(0.34,1.56,0.64,1) 260ms, opacity 450ms ease 260ms"
            : fading
            ? "transform 700ms ease-in, opacity 700ms ease-in"
            : "none",
          boxShadow: entering
            ? "none"
            : fading
            ? "0 0 12px rgba(139,92,246,0.3)"
            : "0 0 0 1px rgba(167,139,250,0.2), 0 0 28px rgba(139,92,246,0.6), 0 0 64px rgba(109,40,217,0.35)",
          animation: visible ? "iconFloat 3s ease-in-out infinite" : "none",
        }}>
          <img
            src="/aina-favicon-512.png"
            alt="AINA"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          {/* Scan line sweeping across icon */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(180deg, transparent 0%, rgba(196,181,253,0.18) 48%, rgba(196,181,253,0.35) 50%, rgba(196,181,253,0.18) 52%, transparent 100%)",
            animation: visible ? "scanLine 2.4s ease-in-out infinite 0.6s" : "none",
            opacity: visible ? 1 : 0,
          }} />
          {/* Corner glint */}
          <div style={{
            position: "absolute", top: 0, left: 0,
            width: 28, height: 28,
            background: "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 60%)",
            borderRadius: "0 0 100% 0",
          }} />
        </div>
      </div>

      {/* ── Text block ── */}
      <div style={{ marginTop: 30, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>

        {/* "AINA" — letters staggered */}
        <div style={{ display: "flex", gap: 3 }}>
          {AINA_LETTERS.map((ch, i) => (
            <span key={i} style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "0.22em",
              color: "#fff",
              display: "inline-block",
              transform: entering
                ? "translateY(20px)"
                : fading
                ? "translateY(-12px)"
                : "translateY(0)",
              opacity:   entering ? 0 : fading ? 0 : 1,
              textShadow: "0 0 24px rgba(167,139,250,0.7), 0 0 60px rgba(109,40,217,0.4)",
              transition: entering
                ? `transform 600ms cubic-bezier(0.34,1.56,0.64,1) ${350 + i * 60}ms, opacity 400ms ease ${350 + i * 60}ms`
                : fading
                ? `transform 500ms ease-in ${i * 40}ms, opacity 500ms ease ${i * 40}ms`
                : "none",
            }}>
              {ch}
            </span>
          ))}
        </div>

        {/* Subtitle with slide+fade */}
        <div style={{
          transform: entering ? "translateY(10px)" : fading ? "translateY(-8px)" : "translateY(0)",
          opacity:   entering ? 0 : fading ? 0 : 1,
          transition: entering
            ? "transform 600ms cubic-bezier(0.34,1.56,0.64,1) 580ms, opacity 400ms ease 580ms"
            : "transform 500ms ease-in, opacity 500ms ease",
        }}>
          <span style={{
            fontSize: 11.5,
            color: "rgba(196,181,253,0.55)",
            letterSpacing: "0.14em",
            fontWeight: 500,
            textTransform: "uppercase",
          }}>
            Asisten Pintar Masisir
          </span>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div style={{
        marginTop: 36,
        width: 140,
        height: 2,
        borderRadius: 2,
        background: "rgba(139,92,246,0.15)",
        overflow: "hidden",
        opacity: entering ? 0 : fading ? 0 : 1,
        transition: entering ? "opacity 300ms ease 700ms" : "opacity 400ms ease",
      }}>
        <div style={{
          height: "100%",
          borderRadius: 2,
          background: "linear-gradient(90deg, rgba(167,139,250,0.4), rgba(196,181,253,1), rgba(167,139,250,0.4))",
          boxShadow: "0 0 8px rgba(167,139,250,0.8)",
          animation: visible ? "progressFill 2.4s cubic-bezier(0.4,0,0.2,1) forwards 0.5s" : "none",
          width: visible ? undefined : "0%",
        }} />
      </div>

      <style>{`
        @keyframes spinCW  { from { transform: rotate(0deg);    } to { transform: rotate(360deg);  } }
        @keyframes spinCCW { from { transform: rotate(0deg);    } to { transform: rotate(-360deg); } }

        @keyframes ambientPulse {
          0%, 100% { transform: scale(1);    opacity: 0.9; }
          50%       { transform: scale(1.15); opacity: 0.6; }
        }
        @keyframes centerPulse {
          0%, 100% { transform: scale(1);    opacity: 0.85; }
          50%       { transform: scale(1.3);  opacity: 0.55; }
        }
        @keyframes iconFloat {
          0%, 100% { transform: scale(1)    translateY(0px);  }
          50%       { transform: scale(1.03) translateY(-4px); }
        }
        @keyframes scanLine {
          0%   { transform: translateY(-110%); opacity: 0;   }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(110%);  opacity: 0;   }
        }
        @keyframes progressFill {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>
    </div>
  );
}
