import { useState, useEffect, useCallback } from "react";
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
const TOOLTIP_H_EST = 210;
const PAD = 16;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function getTooltipStyle(rect: DOMRect | null): React.CSSProperties {
  if (!rect) {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: TOOLTIP_W,
      maxWidth: `calc(100vw - ${PAD * 2}px)`,
    };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const below = vh - rect.bottom;
  const above = rect.top;
  const rightSpace = vw - rect.right;

  let top: number, left: number;

  if (below >= TOOLTIP_H_EST + PAD * 2) {
    top = rect.bottom + PAD;
    left = clamp(rect.left, PAD, vw - TOOLTIP_W - PAD);
  } else if (above >= TOOLTIP_H_EST + PAD * 2) {
    top = rect.top - TOOLTIP_H_EST - PAD;
    left = clamp(rect.left, PAD, vw - TOOLTIP_W - PAD);
  } else if (rightSpace >= TOOLTIP_W + PAD * 2) {
    top = clamp(rect.top, PAD, vh - TOOLTIP_H_EST - PAD);
    left = rect.right + PAD;
  } else {
    top = clamp(rect.top, PAD, vh - TOOLTIP_H_EST - PAD);
    left = Math.max(PAD, rect.left - TOOLTIP_W - PAD);
  }

  return {
    position: "fixed",
    top,
    left,
    width: TOOLTIP_W,
    maxWidth: `calc(100vw - ${PAD * 2}px)`,
  };
}

const GuidedTour: React.FC<GuidedTourProps> = ({ steps, onComplete, onSkip }) => {
  const [idx, setIdx] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const measureStep = useCallback(
    (stepIdx: number) => {
      const step = steps[stepIdx];
      if (!step?.target) {
        setTargetRect(null);
        return;
      }
      const el = document.querySelector(step.target);
      if (!el) {
        setTargetRect(null);
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      const delay = step.delay ?? 400;
      setTimeout(() => {
        const r = el.getBoundingClientRect();
        setTargetRect(r);
      }, delay);
    },
    [steps]
  );

  useEffect(() => {
    const step = steps[idx];
    if (step?.onBefore) step.onBefore();
    measureStep(idx);
  }, [idx, measureStep, steps]);

  useEffect(() => {
    const onResize = () => measureStep(idx);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [idx, measureStep]);

  const next = () => {
    if (idx < steps.length - 1) setIdx((i) => i + 1);
    else onComplete();
  };
  const back = () => setIdx((i) => i - 1);

  const step = steps[idx];
  const isFirst = idx === 0;
  const isLast = idx === steps.length - 1;
  const tooltipStyle = getTooltipStyle(targetRect);

  return createPortal(
    <div className="fixed inset-0 z-[9998]" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(1px)" }}
        onClick={onSkip}
      />

      {/* Spotlight ring around target */}
      {targetRect && (
        <div
          style={{
            position: "fixed",
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            borderRadius: 14,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)",
            border: "2px solid hsl(var(--primary) / 0.7)",
            pointerEvents: "none",
            zIndex: 1,
            transition: "top 0.3s, left 0.3s, width 0.3s, height 0.3s",
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        style={{ ...tooltipStyle, zIndex: 2 }}
        className="rounded-2xl border border-border bg-card p-5 shadow-2xl"
      >
        {/* Top row: icon + step counter + close */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-primary">
            <Compass className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-wide">
              Panduan AINA
            </span>
          </div>
          <button
            onClick={onSkip}
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Lewati panduan"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Progress dots */}
        <div className="mb-4 flex gap-1">
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

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={back}
            disabled={isFirst}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Kembali
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground/60">
              {idx + 1}/{steps.length}
            </span>
            <button
              onClick={next}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-95"
            >
              {isLast ? "Mulai!" : "Lanjut"}
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
