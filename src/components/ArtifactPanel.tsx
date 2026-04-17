import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Copy, Check, FileText } from "lucide-react";

export interface ArtifactPanelProps {
  open: boolean;
  title: string;
  rawContent: string;
  children: ReactNode;
  onClose: () => void;
}

/**
 * Side panel untuk menampilkan jawaban panjang AINA (ringkasan kuliah,
 * hadits panjang, jadwal, tabel, kode) di luar bubble chat.
 * - Desktop: panel slide-in dari kanan (~42% lebar)
 * - Mobile: fullscreen modal
 */
export default function ArtifactPanel({ open, title, rawContent, children, onClose }: ArtifactPanelProps) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const closeTimer = useRef<NodeJS.Timeout | null>(null);

  // Mount/unmount with slide animation
  useEffect(() => {
    if (open) {
      if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
      setMounted(true);
      // next frame to allow transition
      requestAnimationFrame(() => setVisible(true));
    } else if (mounted) {
      setVisible(false);
      closeTimer.current = setTimeout(() => setMounted(false), 250);
    }
    return () => {
      if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    };
  }, [open, mounted]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
      />

      {/* Panel */}
      <div
        className={`relative flex h-full w-full max-w-full flex-col overflow-hidden bg-card shadow-2xl border-l border-border
                    sm:max-w-[640px] md:max-w-[42vw] md:min-w-[440px]
                    transition-transform duration-300 ease-out
                    ${visible ? "translate-x-0" : "translate-x-full"}`}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 border-b border-border bg-card/90 backdrop-blur-md px-4 py-3 shrink-0"
          style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
        >
          <FileText className="h-4 w-4 text-primary shrink-0" />
          <h2 className="flex-1 truncate text-sm font-semibold text-foreground">{title}</h2>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-secondary hover:text-foreground"
            title="Salin isi artifact"
          >
            {copied
              ? <><Check className="h-3 w-3 text-green-500" /><span className="text-green-500">Tersalin</span></>
              : <><Copy className="h-3 w-3" />Salin</>
            }
          </button>
          <button
            onClick={onClose}
            aria-label="Tutup panel"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — renders the same chat-style markdown / arabic blocks */}
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6 text-[15px] leading-[1.75] text-foreground">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Heuristik apakah suatu jawaban AINA layak ditampilkan sebagai artifact
 * di side panel — dipakai untuk memunculkan tombol "Buka di panel".
 */
export function isArtifactWorthy(content: string): boolean {
  if (!content) return false;
  const len = content.length;
  if (len > 1500) return true;
  // Markdown table — minimal 2 baris dengan ≥2 pipe characters
  const tableLines = content.match(/^\s*\|.*\|.*$/gm);
  if (tableLines && tableLines.length >= 3) return true;
  // Fenced code block
  if (/```[\s\S]+?```/.test(content)) return true;
  // Long Arabic block(s) — total panjang teks dalam ARABIC_BLOCK > 350 chars
  const arabBlocks = content.match(/[\[<]ARABIC_BLOCK[\]>]([\s\S]*?)[\[<]\/ARABIC_BLOCK[\]>]/g);
  if (arabBlocks) {
    const totalArab = arabBlocks.reduce((acc, b) => acc + b.length, 0);
    if (totalArab > 350) return true;
  }
  return false;
}

/**
 * Ambil judul yang masuk akal dari content:
 * - Heading markdown pertama (## … atau # …)
 * - Atau kalimat pertama (≤ 60 char)
 */
export function deriveArtifactTitle(content: string, fallback = "Jawaban AINA"): string {
  if (!content) return fallback;
  const heading = content.match(/^\s*#{1,3}\s+(.{3,80})$/m);
  if (heading) return heading[1].replace(/[*_`]/g, "").trim();
  const firstLine = content
    .split("\n")
    .map(l => l.trim())
    .find(l => l.length > 0 && !/^[\[<]ARABIC_BLOCK[\]>]/.test(l));
  if (firstLine) {
    const clean = firstLine.replace(/[*_`#>-]/g, "").trim();
    return clean.length > 60 ? clean.slice(0, 57) + "…" : clean;
  }
  return fallback;
}
