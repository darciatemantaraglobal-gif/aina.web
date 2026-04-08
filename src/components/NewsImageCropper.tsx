import { useState, useRef, useCallback } from "react";
import ReactCrop, {
  type Crop, type PixelCrop,
  centerCrop, makeAspectCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { X, Crop as CropIcon, Upload, RotateCcw } from "lucide-react";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function initCrop(width: number, height: number, aspect?: number): Crop {
  if (aspect) {
    return centerCrop(
      makeAspectCrop({ unit: "%", width: 90 }, aspect, width, height),
      width,
      height,
    );
  }
  return { unit: "%", x: 5, y: 5, width: 90, height: 90 };
}

async function getCroppedBlob(
  img: HTMLImageElement,
  crop: PixelCrop,
  maxWidth = 1200,
): Promise<Blob> {
  const scaleX = img.naturalWidth / img.width;
  const scaleY = img.naturalHeight / img.height;

  const srcX = crop.x * scaleX;
  const srcY = crop.y * scaleY;
  const srcW = crop.width * scaleX;
  const srcH = crop.height * scaleY;

  // Limit output size
  const ratio = Math.min(1, maxWidth / srcW);
  const outW = Math.round(srcW * ratio);
  const outH = Math.round(srcH * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error("Canvas is empty"))),
      "image/jpeg",
      0.88,
    ),
  );
}

/* ── Types ─────────────────────────────────────────────────────────────── */

interface Props {
  file: File;
  onDone: (croppedFile: File) => void;
  onCancel: () => void;
  aspect?: number;
}

/* ── Component ─────────────────────────────────────────────────────────── */

const ASPECTS = [
  { label: "Bebas", value: undefined },
  { label: "16:9", value: 16 / 9 },
  { label: "4:3",  value: 4 / 3  },
  { label: "1:1",  value: 1      },
  { label: "3:2",  value: 3 / 2  },
];

export default function NewsImageCropper({ file, onDone, onCancel }: Props) {
  const [src] = useState(() => URL.createObjectURL(file));
  const [crop, setCrop]         = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect]     = useState<number | undefined>(16 / 9);
  const [processing, setProcessing] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(initCrop(width, height, aspect));
  }, [aspect]);

  function changeAspect(val: number | undefined) {
    setAspect(val);
    if (imgRef.current) {
      const { width, height } = imgRef.current;
      setCrop(initCrop(width, height, val));
    }
  }

  function resetCrop() {
    if (imgRef.current) {
      const { width, height } = imgRef.current;
      setCrop(initCrop(width, height, aspect));
    }
  }

  async function handleConfirm() {
    if (!imgRef.current || !completedCrop) return;
    setProcessing(true);
    try {
      const blob = await getCroppedBlob(imgRef.current, completedCrop);
      const ext = "jpg";
      const croppedFile = new File([blob], file.name.replace(/\.[^.]+$/, `.${ext}`), { type: "image/jpeg" });
      onDone(croppedFile);
    } catch {
      /* ignore */
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onCancel} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-xl flex flex-col rounded-2xl bg-card border border-border/60 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CropIcon className="h-4 w-4 text-primary" />
            Crop Gambar
          </div>
          <button onClick={onCancel} className="rounded-full p-1.5 hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Aspect ratio pills */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border/20 flex-wrap">
          <span className="text-[11px] text-muted-foreground mr-1">Rasio:</span>
          {ASPECTS.map(a => (
            <button
              key={a.label}
              onClick={() => changeAspect(a.value)}
              className={`px-2.5 py-0.5 text-[11px] font-medium rounded-full transition-colors ${
                aspect === a.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {a.label}
            </button>
          ))}
          <button
            onClick={resetCrop}
            className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>

        {/* Crop area */}
        <div className="relative flex items-center justify-center bg-black/40 max-h-[55vh] overflow-auto p-3">
          <ReactCrop
            crop={crop}
            onChange={c => setCrop(c)}
            onComplete={c => setCompletedCrop(c)}
            aspect={aspect}
            minWidth={50}
            minHeight={50}
          >
            <img
              ref={imgRef}
              src={src}
              alt="crop preview"
              onLoad={onImageLoad}
              style={{ maxHeight: "50vh", maxWidth: "100%", display: "block" }}
            />
          </ReactCrop>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border/30">
          <p className="text-[11px] text-muted-foreground">
            {completedCrop
              ? `${Math.round(completedCrop.width)} × ${Math.round(completedCrop.height)} px (preview)`
              : "Geser dan ubah ukuran area crop"}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleConfirm}
              disabled={!completedCrop || processing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processing
                ? <span className="animate-spin h-3 w-3 border-2 border-white/30 border-t-white rounded-full" />
                : <Upload className="h-3 w-3" />
              }
              {processing ? "Memproses..." : "Crop & Upload"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
