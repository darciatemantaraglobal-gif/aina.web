import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronRight, ChevronLeft } from "lucide-react";

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

const TOOLTIP_W  = 340;
const TOOLTIP_H_EST = 220;
const PAD = 16;
const MOBILE_BP = 640;

// Pull leading emoji out of a title string so we can display it separately
function splitEmoji(title: string): { emoji: string; text: string } {
  const m = title.match(/^([\p{Emoji_Presentation}\p{Extended_Pictographic}]+)\s*/u);
  if (m) return { emoji: m[1], text: title.slice(m[0].length) };
  // trailing emoji (e.g. "Chat AI 🤖")
  const t = title.match(/^(.+?)\s+([\p{Emoji_Presentation}\p{Extended_Pictographic}]+)$/u);
  if (t) return { emoji: t[2], text: t[1] };
  return { emoji: "", text: title };
}

function getTooltipStyle(rect: DOMRect | null): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const safeW = Math.min(TOOLTIP_W, vw - PAD * 2);
  const isMobile = vw < MOBILE_BP;

  if (isMobile) {
    if (!rect) {
      return { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: safeW };
    }
    const midY = (rect.top + rect.bottom) / 2;
    if (midY > vh * 0.55) {
      return { position: "fixed", top: PAD, left: "50%", transform: "translateX(-50%)", width: safeW };
    }
    return { position: "fixed", bottom: PAD + 8, left: "50%", transform: "translateX(-50%)", width: safeW };
  }

  if (!rect) {
    return { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: safeW };
  }

  const below  = vh - rect.bottom;
  const above  = rect.top;
  const rightSp = vw - rect.right;
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

  const measureStep = useCallback(
    (stepIdx: number) => {
      const step = steps[stepIdx];
      if (!step?.target) { setTargetRect(null); setTransitioning(false); return; }
      const el = document.querySelector(step.target);
      if (!el) { setTargetRect(null); setTransitioning(false); return; }
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      setTimeout(() => {
        setTargetRect(el.getBoundingClientRect());
        setTransitioning(false);
      }, step.delay ?? 400);
    },
    [steps]
  );

  useEffect(() => {
    setTransitioning(true);
    const step = steps[idx];
    if (step?.onBefore) step.onBefore();
    measureStep(idx);
  }, [idx, measureStep, steps]);

  useEffect(() => {
    const cb = () => measureStep(idx);
    window.addEventListener("resize", cb);
    return () => window.removeEventListener("resize", cb);
  }, [idx, measureStep]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const nextRef = useRef<() => void>(() => {});
  const backRef = useRef<() => void>(() => {});
  const skipRef = useRef<() => void>(() => {});

  const next = useCallback(() => {
    if (idx < steps.length - 1) setIdx((i) => i + 1);
    else onComplete();
  }, [idx, steps.length, onComplete]);

  const back = useCallback(() => {
    if (idx > 0) setIdx((i) => i - 1);
  }, [idx]);

  nextRef.current = next;
  backRef.current = back;
  skipRef.current = onSkip;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape")                             { e.preventDefault(); skipRef.current(); }
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); nextRef.current(); }
      else if (e.key === "ArrowLeft")                     { e.preventDefault(); backRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd   = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) next(); else back();
  };

  const step         = steps[idx];
  const isFirst      = idx === 0;
  const isLast       = idx === steps.length - 1;
  const hasSpotlight = !transitioning && targetRect !== null;
  const tooltipStyle = getTooltipStyle(hasSpotlight ? targetRect : null);
  const { emoji, text: titleText } = splitEmoji(step.title);

  return createPortal(
    <div className="fixed inset-0 z-[9998]" role="dialog" aria-modal="true" aria-label="Panduan AINA">

      {/* Backdrop */}
      {!hasSpotlight && (
        <div
          className="absolute inset-0"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(3px)" }}
          onClick={onSkip}
        />
      )}

      {/* Spotlight ring */}
      {hasSpotlight && targetRect && (
        <div
          style={{
            position: "fixed",
            top:    targetRect.top    - 8,
            left:   targetRect.left   - 8,
            width:  targetRect.width  + 16,
            height: targetRect.height + 16,
            borderRadius: 14,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.75)",
            border: "2px solid hsl(var(--primary) / 0.9)",
            pointerEvents: "none",
            zIndex: 1,
            transition: "top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease",
          }}
        />
      )}

      {/* ── Tooltip card ────────────────────────────────────────────────────── */}
      <div
        style={{ ...tooltipStyle, zIndex: 2 }}
        className="overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Gradient header bar */}
        <div className="relative h-1.5 w-full bg-gradient-to-r from-primary via-purple-400 to-primary/50" />

        <div className="p-5">
          {/* Top row: badge + close */}
          <div className="mb-4 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary">
              Panduan Fitur
            </span>
            <button
              onClick={onSkip}
              className="rounded-lg p-1 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
              title="Lewati (Esc)"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Emoji + title */}
          <div className="mb-3 flex items-start gap-3">
            {emoji && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl">
                {emoji}
              </div>
            )}
            <h3 className={`font-display text-base font-bold leading-snug text-foreground ${emoji ? "pt-1.5" : ""}`}>
              {titleText}
            </h3>
          </div>

          {/* Content */}
          <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
            {step.content}
          </p>

          {/* Progress dots */}
          {steps.length > 1 && (
            <div className="mb-4 flex items-center gap-1.5">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === idx
                      ? "w-6 bg-primary"
                      : i < idx
                      ? "w-2 bg-primary/35"
                      : "w-2 bg-border"
                  }`}
                />
              ))}
              <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/50">
                {idx + 1}/{steps.length}
              </span>
            </div>
          )}

          {/* Nav row */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={back}
              disabled={isFirst}
              className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-0"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Kembali
            </button>

            <button
              onClick={next}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-95"
            >
              {isLast ? "Oke, paham!" : "Lanjut"}
              {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default GuidedTour;
