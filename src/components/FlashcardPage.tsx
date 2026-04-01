import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, RotateCcw, ChevronLeft, ChevronRight, Shuffle, BookOpen, FileText } from "lucide-react";

interface Flashcard {
  question: string;
  answer: string;
}

const API_BASE = import.meta.env.VITE_API_URL || "";

async function apiPost(path: string, body: object) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function FlashcardCard({ card, index, total }: { card: Flashcard; index: number; total: number }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-xs text-muted-foreground">{index + 1} / {total}</p>

      {/* Card */}
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
            minHeight: "200px",
          }}
        >
          {/* Front — Question */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-border bg-card px-6 py-8 text-center"
            style={{ backfaceVisibility: "hidden" }}
          >
            <BookOpen className="h-6 w-6 text-primary/40 mb-4" />
            <p className="text-sm font-medium text-foreground leading-relaxed">{card.question}</p>
            <p className="mt-4 text-[11px] text-muted-foreground/50">Klik untuk lihat jawaban</p>
          </div>

          {/* Back — Answer */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-primary/20 bg-primary/5 px-6 py-8 text-center"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <p className="text-xs text-primary/60 mb-3 font-semibold uppercase tracking-widest">Jawaban</p>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{card.answer}</p>
            <p className="mt-4 text-[11px] text-muted-foreground/50">Klik untuk kembali</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FlashcardPage() {
  const [mode, setMode] = useState<"topic" | "text">("topic");
  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");
  const [count, setCount] = useState(8);
  const [loading, setLoading] = useState(false);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const generate = useCallback(async () => {
    if (mode === "topic" && !topic.trim()) { toast.error("Tulis topik dulu"); return; }
    if (mode === "text" && !content.trim()) { toast.error("Tempel teks dulu"); return; }
    setLoading(true);
    try {
      const body = mode === "topic"
        ? { topic: topic.trim(), count }
        : { content: content.trim(), count };
      const data = await apiPost("/api/flashcards/generate", body);
      setFlashcards(data.flashcards);
      setCurrentIndex(0);
      toast.success(`${data.flashcards.length} flashcard dibuat!`);
    } catch (e: any) {
      toast.error(e.message || "Gagal membuat flashcard");
    }
    setLoading(false);
  }, [mode, topic, content, count]);

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
  };

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
              Buat flashcard belajar otomatis dari topik atau teks materi kamu
            </p>
          </div>

          {flashcards.length === 0 ? (
            /* ── Generator Form ── */
            <div className="space-y-4">
              {/* Mode switch */}
              <div className="flex rounded-xl border border-border overflow-hidden">
                <button
                  onClick={() => setMode("topic")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm transition-colors ${
                    mode === "topic"
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Dari Topik
                </button>
                <button
                  onClick={() => setMode("text")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm transition-colors border-l border-border ${
                    mode === "text"
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Dari Teks
                </button>
              </div>

              {mode === "topic" ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Topik</label>
                  <Input
                    placeholder="Contoh: Hukum Fikih Zakat, Nahwu Shorof, Sejarah Islam..."
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
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Tempel Teks Materi</label>
                  <Textarea
                    placeholder="Paste catatan kuliah, ringkasan bab, atau teks apa pun di sini..."
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    rows={8}
                    className="bg-secondary resize-none text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground/60">
                    Teks akan dianalisis untuk membuat pertanyaan-jawaban yang relevan.
                  </p>
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
                    Membuat flashcard...
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
                <p className="text-xs font-semibold text-foreground">Tips belajar efektif:</p>
                <ul className="space-y-1 text-[11px] text-muted-foreground">
                  <li>• Klik kartu untuk membalik dan lihat jawaban</li>
                  <li>• Gunakan tombol kocok untuk urutan acak</li>
                  <li>• Ulangi sesi setelah beberapa jam untuk retensi lebih baik</li>
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
                    className={`h-2 w-2 rounded-full transition-all ${
                      i === currentIndex ? "bg-primary w-4" : "bg-border hover:bg-muted-foreground"
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
