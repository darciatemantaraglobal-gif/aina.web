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

    const fadeTimer = setTimeout(() => setPhase("fading"), 2600);
    const hideTimer = setTimeout(() => setPhase("hidden"), 3400);

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
      className="fixed inset-0 z-[9999] overflow-hidden"
      style={{
        backgroundImage: "url('/splash-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        opacity:    fading ? 0 : 1,
        transition: fading ? "opacity 800ms ease-in-out" : "none",
        pointerEvents: "none",
      }}
    >
      {/* Dark overlay — top stays transparent, bottom becomes dark for legibility */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to bottom, rgba(6,0,14,0.15) 0%, rgba(6,0,14,0.35) 40%, rgba(6,0,14,0.72) 70%, rgba(6,0,14,0.88) 100%)",
      }} />

      {/* Content block — lower-center of screen */}
      <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0,
        padding: "0 36px 72px",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 0,
      }}>

        {/* Icon */}
        <div style={{
          width: 52, height: 52,
          borderRadius: 14,
          overflow: "hidden",
          marginBottom: 22,
          transform: entering ? "translateY(20px)" : "translateY(0)",
          opacity:   entering ? 0 : 1,
          transition: "transform 900ms cubic-bezier(0.16,1,0.3,1) 100ms, opacity 700ms ease 100ms",
          boxShadow: "0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)",
        }}>
          <img
            src="/aina-favicon-512.png"
            alt="AINA"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>

        {/* App name */}
        <div style={{
          transform: entering ? "translateY(16px)" : "translateY(0)",
          opacity:   entering ? 0 : 1,
          transition: "transform 900ms cubic-bezier(0.16,1,0.3,1) 200ms, opacity 700ms ease 200ms",
        }}>
          <span style={{
            display: "block",
            fontSize: 42,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: "#ffffff",
            lineHeight: 1,
            textShadow: "0 2px 20px rgba(0,0,0,0.4)",
          }}>
            AINA
          </span>
        </div>

        {/* Subtitle */}
        <div style={{
          marginTop: 10,
          transform: entering ? "translateY(14px)" : "translateY(0)",
          opacity:   entering ? 0 : 1,
          transition: "transform 900ms cubic-bezier(0.16,1,0.3,1) 320ms, opacity 700ms ease 320ms",
        }}>
          <span style={{
            fontSize: 15,
            fontWeight: 400,
            color: "rgba(209,196,255,0.75)",
            letterSpacing: "0.01em",
            lineHeight: 1.5,
          }}>
            Asisten Pintar Masisir
          </span>
        </div>

        {/* Thin divider line */}
        <div style={{
          marginTop: 24,
          height: 1,
          background: "rgba(255,255,255,0.12)",
          width: entering ? "0px" : "100%",
          transition: "width 1000ms cubic-bezier(0.16,1,0.3,1) 420ms",
        }} />

        {/* Tagline */}
        <div style={{
          marginTop: 16,
          transform: entering ? "translateY(10px)" : "translateY(0)",
          opacity:   entering ? 0 : 1,
          transition: "transform 900ms ease 500ms, opacity 700ms ease 500ms",
        }}>
          <span style={{
            fontSize: 11.5,
            fontWeight: 400,
            color: "rgba(196,181,253,0.45)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}>
            AI · Produktivitas · Komunitas
          </span>
        </div>
      </div>
    </div>
  );
}
