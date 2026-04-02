import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Sparkles, RotateCcw, ChevronLeft, ChevronRight, Shuffle,
  BookOpen, FileText, Upload, X, FileUp,
} from "lucide-react";

interface Flashcard {
  question_ar: string;
  question_id: string;
  answer_ar:   string;
  answer_id:   string;
}

const API_BASE = import.meta.env.VITE_API_URL || "";

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

async function apiPost(path: string, body: object) {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function extractPdf(file: File): Promise<string> {
  const token = await getToken();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/extract-file`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Gagal mengekstrak PDF");
  return data.text ?? data.extractedText ?? "";
}

/* ── Flashcard Card ─────────────────────────────────────────── */
function FlashcardCard({ card, index, total }: { card: Flashcard; index: number; total: number }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-xs text-muted-foreground">{index + 1} / {total}</p>

      <div
        className="w-full max-w-md cursor-pointer select-none"
        style={{ perspective: "1000px" }}
        onClick={() => setFlipped(v => !v)}
      >
        <div
          className="relative transition-transform duration-500"
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            minHeight: "220px",
          }}
        >
          {/* Front — Question */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-border bg-card px-6 py-8 text-center gap-3"
            style={{ backfaceVisibility: "hidden" }}
          >
            <BookOpen className="h-5 w-5 text-primary/40 shrink-0" />
            <p
              className="text-lg font-semibold text-foreground leading-relaxed"
              dir="rtl"
              lang="ar"
              style={{ fontFamily: "'Amiri', 'Scheherazade New', 'Traditional Arabic', serif" }}
            >
              {card.question_ar}
            </p>
            <p className="text-xs text-muted-foreground italic leading-relaxed border-t border-border/50 pt-2 w-full">
              {card.question_id}
            </p>
            <p className="text-[11px] text-muted-foreground/40">Klik untuk lihat jawaban</p>
          </div>

          {/* Back — Answer */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-primary/20 bg-primary/5 px-6 py-8 text-center gap-3"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <p className="text-[10px] text-primary/60 font-semibold uppercase tracking-widest shrink-0">الجواب — Jawaban</p>
            <p
              className="text-base font-medium text-foreground leading-relaxed"
              dir="rtl"
              lang="ar"
              style={{ fontFamily: "'Amiri', 'Scheherazade New', 'Traditional Arabic', serif" }}
            >
              {card.answer_ar}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed border-t border-primary/10 pt-2 w-full italic">
              {card.answer_id}
            </p>
            <p className="text-[11px] text-muted-foreground/40">Klik untuk kembali</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────── */
type Mode = "topic" | "text" | "pdf";

export default function FlashcardPage() {
  const [mode, setMode]         = useState<Mode>("topic");
  const [topic, setTopic]       = useState("");
  const [content, setContent]   = useState("");
  const [pdfFile, setPdfFile]   = useState<File | null>(null);
  const [pdfName, setPdfName]   = useState("");
  const [count, setCount]       = useState(8);
  const [loading, setLoading]   = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [flashcards, setFlashcards]   = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") { toast.error("Hanya file PDF yang didukung"); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error("Ukuran PDF maksimal 20 MB"); return; }
    setPdfFile(file);
    setPdfName(file.name);
  };

  const removePdf = () => {
    setPdfFile(null);
    setPdfName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const generate = useCallback(async () => {
    if (mode === "topic" && !topic.trim()) { toast.error("Tulis topik dulu"); return; }
    if (mode === "text"  && !content.trim()) { toast.error("Tempel teks dulu"); return; }
    if (mode === "pdf"   && !pdfFile) { toast.error("Pilih file PDF dulu"); return; }

    setLoading(true);
    try {
      let body: Record<string, unknown> = { count };

      if (mode === "pdf") {
        setLoadingLabel("Membaca PDF...");
        const extracted = await extractPdf(pdfFile!);
        if (!extracted.trim()) throw new Error("PDF tidak mengandung teks yang bisa dibaca. Coba PDF lain.");
        body.content = extracted;
        setLoadingLabel("Membuat flashcard...");
      } else if (mode === "text") {
        body.content = content.trim();
        setLoadingLabel("Membuat flashcard...");
      } else {
        body.topic = topic.trim();
        setLoadingLabel("Membuat flashcard...");
      }

      const data = await apiPost("/api/flashcards/generate", body);
      setFlashcards(data.flashcards);
      setCurrentIndex(0);
      toast.success(`${data.flashcards.length} flashcard dibuat!`);
    } catch (e: any) {
      toast.error(e.message || "Gagal membuat flashcard");
    } finally {
      setLoading(false);
      setLoadingLabel("");
    }
  }, [mode, topic, content, pdfFile, count]);

  const shuffle = () => {
    setFlashcards(prev => [...prev].sort(() => Math.random() - 0.5));
    setCurrentIndex(0);
    toast.success("Flashcard dikocok!");
  };

  const reset = () => {
    setFlashcards([]);
    setCurrentIndex(0);
    setTopic("");
    setContent("");
    removePdf();
  };

  const TABS: { id: Mode; label: string; icon: React.ReactNode }[] = [
    { id: "topic", label: "Dari Topik", icon: <Sparkles className="h-3.5 w-3.5" /> },
    { id: "text",  label: "Dari Teks",  icon: <FileText  className="h-3.5 w-3.5" /> },
    { id: "pdf",   label: "Dari PDF",   icon: <FileUp    className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">

          {/* Header */}
          <div>
            <h1 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Flashcard AI
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Buat flashcard bilingual Arab–Indonesia dari topik, teks, atau file PDF
            </p>
          </div>

          {flashcards.length === 0 ? (
            <div className="space-y-4">
              {/* Mode tabs */}
              <div className="flex rounded-xl border border-border overflow-hidden">
                {TABS.map((tab, i) => (
                  <button
                    key={tab.id}
                    onClick={() => setMode(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm transition-colors ${
                      i > 0 ? "border-l border-border" : ""
                    } ${
                      mode === tab.id
                        ? "bg-primary/15 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Input area */}
              {mode === "topic" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Topik</label>
                  <Input
                    placeholder="Contoh: Hukum Fikih Zakat, Nahwu Shorof, Ushul Fiqh..."
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && generate()}
                    className="bg-secondary"
                    autoFocus
                  />
                  <p className="text-[11px] text-muted-foreground/60">
                    Masukkan topik spesifik untuk hasil yang lebih baik.
                  </p>
                </div>
              )}

              {mode === "text" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Tempel Teks Materi</label>
                  <Textarea
                    placeholder="Paste catatan kuliah, ringkasan bab, atau teks Arab/Indonesia di sini..."
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    rows={8}
                    className="bg-secondary resize-none text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground/60">
                    Mendukung teks Arab maupun Indonesia. AI akan membuat versi bilingual.
                  </p>
                </div>
              )}

              {mode === "pdf" && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Upload File PDF</label>
                  {pdfFile ? (
                    <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                      <FileText className="h-5 w-5 text-primary shrink-0" />
                      <p className="flex-1 text-sm text-foreground truncate">{pdfName}</p>
                      <button
                        onClick={removePdf}
                        className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-secondary/30 px-4 py-8 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <Upload className="h-7 w-7 text-muted-foreground/50" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Klik untuk pilih PDF</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Mendukung muqorror, diktat, atau catatan PDF · Maks 20 MB</p>
                      </div>
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              )}

              {/* Count picker */}
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-muted-foreground shrink-0">Jumlah flashcard:</label>
                <div className="flex gap-1.5">
                  {[5, 8, 10, 15].map(n => (
                    <button
                      key={n}
                      onClick={() => setCount(n)}
                      className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                        count === n
                          ? "border-primary/40 bg-primary/10 text-primary font-medium"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={generate}
                disabled={loading}
                className="w-full bg-gradient-purple text-primary-foreground hover:opacity-90 gap-2"
              >
                {loading ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {loadingLabel || "Membuat flashcard..."}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Buat Flashcard
                  </>
                )}
              </Button>

              {/* Tips */}
              <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3 space-y-1.5">
                <p className="text-xs font-semibold text-foreground">Format bilingual Arab–Indonesia:</p>
                <ul className="space-y-1 text-[11px] text-muted-foreground">
                  <li>• Setiap kartu menampilkan pertanyaan Arab + terjemahan Indonesia</li>
                  <li>• Jawaban juga dalam dua bahasa untuk pemahaman lebih baik</li>
                  <li>• Upload PDF muqorror atau diktat untuk flashcard dari materi kuliah</li>
                </ul>
              </div>
            </div>
          ) : (
            /* ── Flashcard Viewer ── */
            <div className="space-y-6">
              {/* Controls */}
              <div className="flex items-center justify-between">
                <button
                  onClick={reset}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Buat ulang
                </button>
                <p className="text-xs text-muted-foreground font-medium">
                  {flashcards.length} flashcard
                  {mode === "topic" && topic && ` · ${topic}`}
                  {mode === "pdf"   && pdfName && ` · ${pdfName}`}
                </p>
                <button
                  onClick={shuffle}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  Kocok
                </button>
              </div>

              {/* Card */}
              <FlashcardCard
                card={flashcards[currentIndex]}
                index={currentIndex}
                total={flashcards.length}
              />

              {/* Navigation */}
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                  disabled={currentIndex === 0}
                  className="gap-1.5"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentIndex(i => Math.min(flashcards.length - 1, i + 1))}
                  disabled={currentIndex === flashcards.length - 1}
                  className="gap-1.5"
                >
                  Berikutnya
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Progress dots */}
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {flashcards.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentIndex(i)}
                    className={`h-2 rounded-full transition-all ${
                      i === currentIndex ? "bg-primary w-4" : "w-2 bg-border hover:bg-muted-foreground"
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
