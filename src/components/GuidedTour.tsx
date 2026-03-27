import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronRight, ChevronLeft, Compass } from "lucide-react";

export interface TourStep {
  target?: string;
  title: string;
  content: string;
  onBefore?: () => void;
  delay?: number;
}

interface GuidedTourProps {
  steps: TourStep[];
  onComplete: () => void;
  onSkip: () => void;
}

const TOOLTIP_W = 320;
const TOOLTIP_H_EST = 240;
const PAD = 16;
const MOBILE_BP = 640;

/**
 * Determines where to place the tooltip card.
 *
 * Mobile strategy (< 640 px):
 *   - No target  → vertically centred
 *   - Target in top 55 % of screen → tooltip at BOTTOM
 *   - Target in bottom 55 %       → tooltip at TOP
 *   (Always horizontally centred on mobile — no risk of going off-screen)
 *
 * Desktop strategy: classic auto-placement (below → above → right → fallback centre).
 */
function getTooltipStyle(rect: DOMRect | null): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const safeW = Math.min(TOOLTIP_W, vw - PAD * 2);
  const isMobile = vw < MOBILE_BP;

  if (isMobile) {
    if (!rect) {
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%,-50%)",
        width: safeW,
      };
    }
    const midY = (rect.top + rect.bottom) / 2;
    if (midY > vh * 0.55) {
      // Spotlight in lower half → card at top
      return {
        position: "fixed",
        top: PAD,
        left: "50%",
        transform: "translateX(-50%)",
        width: safeW,
      };
    }
    // Spotlight in upper half → card at bottom
    return {
      position: "fixed",
      bottom: PAD + 8,
      left: "50%",
      transform: "translateX(-50%)",
      width: safeW,
    };
  }

  // Desktop — no target
  if (!rect) {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%)",
      width: safeW,
    };
  }

  // Desktop — auto placement
  const below     = vh - rect.bottom;
  const above     = rect.top;
  const rightSp   = vw - rect.right;

  let top: number, left: number;

  if (below >= TOOLTIP_H_EST + PAD * 2) {
    top  = rect.bottom + PAD;
    left = Math.max(PAD, Math.min(rect.left, vw - safeW - PAD));
  } else if (above >= TOOLTIP_H_EST + PAD * 2) {
    top  = rect.top - TOOLTIP_H_EST - PAD;
    left = Math.max(PAD, Math.min(rect.left, vw - safeW - PAD));
  } else if (rightSp >= safeW + PAD * 2) {
    top  = Math.max(PAD, Math.min(rect.top, vh - TOOLTIP_H_EST - PAD));
    left = rect.right + PAD;
  } else {
    // Last resort: horizontally centred, whichever side has more room
    const useBottom = below >= above;
    top  = useBottom
      ? Math.min(rect.bottom + PAD, vh - TOOLTIP_H_EST - PAD)
      : Math.max(PAD, rect.top - TOOLTIP_H_EST - PAD);
    left = Math.max(PAD, Math.min((vw - safeW) / 2, vw - safeW - PAD));
  }

  return { position: "fixed", top, left, width: safeW };
}

const GuidedTour: React.FC<GuidedTourProps> = ({ steps, onComplete, onSkip }) => {
  const [idx, setIdx]                     = useState(0);
  const [targetRect, setTargetRect]       = useState<DOMRect | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  // ── Step measurement ──────────────────────────────────────────────────────
  const measureStep = useCallback(
    (stepIdx: number) => {
      const step = steps[stepIdx];
      if (!step?.target) {
        setTargetRect(null);
        setTransitioning(false);
        return;
      }
      const el = document.querySelector(step.target);
      if (!el) {
        setTargetRect(null);
        setTransitioning(false);
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      setTimeout(() => {
        const r = el.getBoundingClientRect();
        setTargetRect(r);
        setTransitioning(false);
      }, step.delay ?? 400);
    },
    [steps]
  );

  // Run onBefore + measure on each step change
  useEffect(() => {
    setTransitioning(true);
    const step = steps[idx];
    if (step?.onBefore) step.onBefore();
    measureStep(idx);
  }, [idx, measureStep, steps]);

  // Re-measure on window resize
  useEffect(() => {
    const cb = () => measureStep(idx);
    window.addEventListener("resize", cb);
    return () => window.removeEventListener("resize", cb);
  }, [idx, measureStep]);

  // Lock body scroll while tour is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const nextRef   = useRef<() => void>(() => {});
  const backRef   = useRef<() => void>(() => {});
  const skipRef   = useRef<() => void>(() => {});

  const next = useCallback(() => {
    if (idx < steps.length - 1) setIdx((i) => i + 1);
    else onComplete();
  }, [idx, steps.length, onComplete]);

  const back = useCallback(() => {
    if (idx > 0) setIdx((i) => i - 1);
  }, [idx]);

  // Keep refs fresh every render so keyboard handler always calls latest
  nextRef.current = next;
  backRef.current = back;
  skipRef.current = onSkip;

  // Keyboard navigation (Escape, Arrow keys, Enter)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape")                      { e.preventDefault(); skipRef.current(); }
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); nextRef.current(); }
      else if (e.key === "ArrowLeft")              { e.preventDefault(); backRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // stable — uses refs internally

  // ── Swipe gesture (mobile) ────────────────────────────────────────────────
  const touchStartX = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) next();  // swipe left → next
    else         back();  // swipe right → back
  };

  // ── Derived state ─────────────────────────────────────────────────────────
  const step        = steps[idx];
  const isFirst     = idx === 0;
  const isLast      = idx === steps.length - 1;
  const hasSpotlight = !transitioning && targetRect !== null;
  const tooltipStyle = getTooltipStyle(hasSpotlight ? targetRect : null);

  // ── Render ────────────────────────────────────────────────────────────────
  return createPortal(
    <div
      className="fixed inset-0 z-[9998]"
      role="dialog"
      aria-modal="true"
      aria-label="Panduan AINA"
    >
      {/*
        Overlay strategy:
        • No spotlight → full-screen semi-transparent backdrop (click to skip)
        • With spotlight → only the spotlight's box-shadow covers the screen.
          This avoids double-darkening the backdrop area.
      */}
      {!hasSpotlight && (
        <div
          className="absolute inset-0"
          style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(2px)" }}
          onClick={onSkip}
        />
      )}

      {/* Spotlight ring — box-shadow covers everything OUTSIDE this div */}
      {hasSpotlight && targetRect && (
        <div
          style={{
            position: "fixed",
            top:    targetRect.top    - 8,
            left:   targetRect.left   - 8,
            width:  targetRect.width  + 16,
            height: targetRect.height + 16,
            borderRadius: 14,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)",
            border: "2px solid hsl(var(--primary) / 0.85)",
            pointerEvents: "none",
            zIndex: 1,
            transition: "top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease",
          }}
        />
      )}

      {/* ── Tooltip card ──────────────────────────────────────────────────── */}
      <div
        style={{ ...tooltipStyle, zIndex: 2 }}
        className="rounded-2xl border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Header row */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-primary">
            <Compass className="h-4 w-4 shrink-0" />
            <span className="text-[11px] font-semibold uppercase tracking-wide">
              Panduan AINA
            </span>
          </div>
          <button
            onClick={onSkip}
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Lewati panduan (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Progress dots — wrap on mobile if many steps */}
        <div className="mb-4 flex flex-wrap gap-1">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === idx
                  ? "w-5 bg-primary"
                  : i < idx
                  ? "w-2 bg-primary/40"
                  : "w-2 bg-border"
              }`}
            />
          ))}
        </div>

        <h3 className="mb-1.5 font-display text-base font-bold text-foreground">
          {step.title}
        </h3>
        <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
          {step.content}
        </p>

        {/* Navigation row */}
        <div className="flex items-center justify-between">
          <button
            onClick={back}
            disabled={isFirst}
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Kembali
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground/60 tabular-nums">
              {idx + 1} / {steps.length}
            </span>
            <button
              onClick={next}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-95"
            >
              {isLast ? "Mulai!" : "Lanjut"}
              {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Mobile hint */}
        {window.innerWidth < MOBILE_BP && (
          <p className="mt-3 text-center text-[10px] text-muted-foreground/40">
            Tap X atau geser ke samping untuk lewati panduan
          </p>
        )}
      </div>
    </div>,
    document.body
  );
};

export default GuidedTour;
