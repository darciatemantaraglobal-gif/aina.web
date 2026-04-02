import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Sparkles, RotateCcw, ChevronLeft, ChevronRight, Shuffle,
  BookOpen, FileText, Upload, X, FileUp, Save, Trash2,
  Library, CheckCircle, XCircle, RefreshCw,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────── */
interface FlashcardSimple   { question: string; answer: string; }
interface FlashcardBilingual { question_ar: string; question_id: string; answer_ar: string; answer_id: string; }
type Flashcard = FlashcardSimple | FlashcardBilingual;
type Progress = "known" | "unknown" | null;

interface SavedSet {
  id: string;
  name: string;
  source: string | null;
  bilingual: boolean;
  cards: Flashcard[];
  created_at: string;
}

function isBilingual(c: Flashcard): c is FlashcardBilingual {
  return "question_ar" in c;
}

function detectArabic(text: string): boolean {
  if (!text) return false;
  const sample = text.slice(0, 2000);
  const arabicChars = (sample.match(/[\u0600-\u06FF]/g) || []).length;
  return arabicChars / sample.length > 0.05;
}

/* ── API helpers ────────────────────────────────────────────── */
const API_BASE = import.meta.env.VITE_API_URL || "";

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

async function apiReq(method: string, path: string, body?: object) {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
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
  return data.text ?? "";
}

/* ── Flashcard Card ─────────────────────────────────────────── */
function FlashcardCard({
  card, index, total, progress, onProgress,
}: {
  card: Flashcard;
  index: number;
  total: number;
  progress: Progress;
  onProgress: (p: "known" | "unknown") => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const bilingual = isBilingual(card);

  useEffect(() => { setFlipped(false); }, [index]);

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
            minHeight: bilingual ? "240px" : "200px",
          }}
        >
          {/* Front — Question */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-border bg-card px-6 py-8 text-center gap-3"
            style={{ backfaceVisibility: "hidden" }}
          >
            <BookOpen className="h-5 w-5 text-primary/40 shrink-0" />
            {bilingual ? (
              <>
                <p
                  className="text-lg font-semibold text-foreground leading-relaxed"
                  dir="rtl" lang="ar"
                  style={{ fontFamily: "'Amiri','Scheherazade New','Traditional Arabic',serif" }}
                >
                  {(card as FlashcardBilingual).question_ar}
                </p>
                <p className="text-xs text-muted-foreground italic leading-relaxed border-t border-border/50 pt-2 w-full">
                  {(card as FlashcardBilingual).question_id}
                </p>
              </>
            ) : (
              <p className="text-sm font-medium text-foreground leading-relaxed">
                {(card as FlashcardSimple).question}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground/40">Klik untuk lihat jawaban</p>
          </div>

          {/* Back — Answer */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-primary/20 bg-primary/5 px-6 py-8 text-center gap-3"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <p className="text-[10px] text-primary/60 font-semibold uppercase tracking-widest shrink-0">
              {bilingual ? "الجواب — Jawaban" : "Jawaban"}
            </p>
            {bilingual ? (
              <>
                <p
                  className="text-base font-medium text-foreground leading-relaxed"
                  dir="rtl" lang="ar"
                  style={{ fontFamily: "'Amiri','Scheherazade New','Traditional Arabic',serif" }}
                >
                  {(card as FlashcardBilingual).answer_ar}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed border-t border-primary/10 pt-2 w-full italic">
                  {(card as FlashcardBilingual).answer_id}
                </p>
              </>
            ) : (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {(card as FlashcardSimple).answer}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground/40">Klik untuk kembali</p>
          </div>
        </div>
      </div>

      {/* Progress buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => onProgress("unknown")}
          className={`flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-medium border transition-all ${
            progress === "unknown"
              ? "bg-red-500/15 border-red-500/40 text-red-500"
              : "border-border text-muted-foreground hover:border-red-400/40 hover:text-red-400"
          }`}
        >
          <XCircle className="h-4 w-4" />
          Ulangi
        </button>
        <button
          onClick={() => onProgress("known")}
          className={`flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-medium border transition-all ${
            progress === "known"
              ? "bg-green-500/15 border-green-500/40 text-green-500"
              : "border-border text-muted-foreground hover:border-green-400/40 hover:text-green-400"
          }`}
        >
          <CheckCircle className="h-4 w-4" />
          Paham
        </button>
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────── */
type InputMode = "topic" | "text" | "pdf";
type PageView  = "create" | "saved";

export default function FlashcardPage() {
  /* Input state */
  const [pageView, setPageView]   = useState<PageView>("create");
  const [inputMode, setInputMode] = useState<InputMode>("topic");
  const [topic, setTopic]         = useState("");
  const [content, setContent]     = useState("");
  const [pdfFile, setPdfFile]     = useState<File | null>(null);
  const [pdfName, setPdfName]     = useState("");
  const [count, setCount]         = useState(8);
  const [loading, setLoading]     = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");

  /* Viewer state */
  const [flashcards, setFlashcards]     = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [wasBilingual, setWasBilingual] = useState(false);
  const [activeSource, setActiveSource] = useState<string>("");
  const [progress, setProgress]         = useState<Progress[]>([]);

  /* Save state */
  const [saving, setSaving]       = useState(false);
  const [saveMode, setSaveMode]   = useState(false);
  const [saveName, setSaveName]   = useState("");

  /* Saved sets */
  const [savedSets, setSavedSets]     = useState<SavedSet[]>([]);
  const [setsLoading, setSetsLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Fetch saved sets ── */
  const fetchSets = useCallback(async () => {
    setSetsLoading(true);
    try {
      const data = await apiReq("GET", "/api/flashcards/sets");
      setSavedSets(data.sets || []);
    } catch (e: any) {
      toast.error(e.message || "Gagal memuat set");
    } finally {
      setSetsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pageView === "saved") fetchSets();
  }, [pageView, fetchSets]);

  /* ── File handlers ── */
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

  /* ── Generate ── */
  const generate = useCallback(async () => {
    if (inputMode === "topic" && !topic.trim()) { toast.error("Tulis topik dulu"); return; }
    if (inputMode === "text"  && !content.trim()) { toast.error("Tempel teks dulu"); return; }
    if (inputMode === "pdf"   && !pdfFile) { toast.error("Pilih file PDF dulu"); return; }

    setLoading(true);
    try {
      let body: Record<string, unknown> = { count };
      let textForDetection = "";
      let source = "";

      if (inputMode === "pdf") {
        setLoadingLabel("Membaca PDF...");
        const extracted = await extractPdf(pdfFile!);
        if (!extracted.trim()) throw new Error("PDF tidak mengandung teks yang bisa dibaca. Coba PDF lain.");
        body.content = extracted;
        textForDetection = extracted;
        source = pdfName;
      } else if (inputMode === "text") {
        body.content = content.trim();
        textForDetection = content;
        source = "Teks";
      } else {
        body.topic = topic.trim();
        textForDetection = topic;
        source = topic.trim();
      }

      const bilingual = detectArabic(textForDetection);
      body.bilingual = bilingual;
      setLoadingLabel("Membuat flashcard...");

      const data = await apiReq("POST", "/api/flashcards/generate", body);
      const cards: Flashcard[] = data.flashcards;
      setFlashcards(cards);
      setWasBilingual(bilingual);
      setActiveSource(source);
      setCurrentIndex(0);
      setProgress(new Array(cards.length).fill(null));
      setSaveMode(false);
      setSaveName(source.slice(0, 60));
      toast.success(`${cards.length} flashcard dibuat!`);
    } catch (e: any) {
      toast.error(e.message || "Gagal membuat flashcard");
    } finally {
      setLoading(false);
      setLoadingLabel("");
    }
  }, [inputMode, topic, content, pdfFile, pdfName, count]);

  /* ── Viewer helpers ── */
  const shuffle = () => {
    const shuffled = [...flashcards].sort(() => Math.random() - 0.5);
    setFlashcards(shuffled);
    setProgress(new Array(shuffled.length).fill(null));
    setCurrentIndex(0);
    toast.success("Flashcard dikocok!");
  };

  const reset = () => {
    setFlashcards([]);
    setCurrentIndex(0);
    setProgress([]);
    setTopic("");
    setContent("");
    setWasBilingual(false);
    setActiveSource("");
    setSaveMode(false);
    removePdf();
  };

  const handleProgress = (p: "known" | "unknown") => {
    setProgress(prev => {
      const next = [...prev];
      next[currentIndex] = p;
      return next;
    });
    if (currentIndex < flashcards.length - 1) {
      setTimeout(() => setCurrentIndex(i => i + 1), 300);
    }
  };

  const retryUnknown = () => {
    const unknown = flashcards.filter((_, i) => progress[i] !== "known");
    if (!unknown.length) return;
    setFlashcards(unknown);
    setProgress(new Array(unknown.length).fill(null));
    setCurrentIndex(0);
    toast.success(`Mengulang ${unknown.length} kartu`);
  };

  const retryAll = () => {
    setProgress(new Array(flashcards.length).fill(null));
    setCurrentIndex(0);
  };

  /* ── Save set ── */
  const saveSet = async () => {
    if (!saveName.trim()) { toast.error("Tulis nama set dulu"); return; }
    setSaving(true);
    try {
      await apiReq("POST", "/api/flashcards/sets", {
        name: saveName.trim(),
        source: activeSource || null,
        bilingual: wasBilingual,
        cards: flashcards,
      });
      toast.success("Set flashcard disimpan!");
      setSaveMode(false);
    } catch (e: any) {
      toast.error(e.message || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  /* ── Load saved set ── */
  const loadSet = (set: SavedSet) => {
    setFlashcards(set.cards);
    setWasBilingual(set.bilingual);
    setActiveSource(set.name);
    setCurrentIndex(0);
    setProgress(new Array(set.cards.length).fill(null));
    setSaveName(set.name);
    setSaveMode(false);
    setPageView("create");
    toast.success(`Set "${set.name}" dimuat`);
  };

  /* ── Delete set ── */
  const deleteSet = async (id: string, name: string) => {
    try {
      await apiReq("DELETE", `/api/flashcards/sets/${id}`);
      setSavedSets(prev => prev.filter(s => s.id !== id));
      toast.success(`"${name}" dihapus`);
    } catch (e: any) {
      toast.error(e.message || "Gagal menghapus");
    }
  };

  /* ── Summary helpers ── */
  const allMarked     = progress.length > 0 && progress.every(p => p !== null);
  const knownCount    = progress.filter(p => p === "known").length;
  const unknownCount  = progress.filter(p => p === "unknown").length;

  const INPUT_TABS: { id: InputMode; label: string; icon: React.ReactNode }[] = [
    { id: "topic", label: "Dari Topik", icon: <Sparkles className="h-3.5 w-3.5" /> },
    { id: "text",  label: "Dari Teks",  icon: <FileText  className="h-3.5 w-3.5" /> },
    { id: "pdf",   label: "Dari PDF",   icon: <FileUp    className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-6 space-y-5">

          {/* Header */}
          <div>
            <h1 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Flashcard AI
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Buat flashcard dari topik, teks, atau file PDF — otomatis bilingual jika kontennya berbahasa Arab
            </p>
          </div>

          {/* ── VIEWER MODE ── */}
          {flashcards.length > 0 ? (
            <div className="space-y-5">

              {/* Top controls */}
              <div className="flex items-center justify-between">
                <button
                  onClick={reset}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Buat ulang
                </button>

                <div className="flex flex-col items-center gap-1">
                  <p className="text-xs text-muted-foreground font-medium">
                    {flashcards.length} flashcard
                    {activeSource && ` · ${activeSource.length > 30 ? activeSource.slice(0, 30) + "…" : activeSource}`}
                  </p>
                  {wasBilingual && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      عربي – Indonesia
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={shuffle}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Shuffle className="h-3.5 w-3.5" />
                    Kocok
                  </button>
                  <button
                    onClick={() => { setSaveMode(v => !v); }}
                    className="flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary transition-colors"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Simpan
                  </button>
                </div>
              </div>

              {/* Save inline form */}
              {saveMode && (
                <div className="flex gap-2 items-center rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
                  <Input
                    value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    placeholder="Nama set flashcard..."
                    className="flex-1 h-8 text-xs bg-transparent border-0 focus-visible:ring-0 px-0"
                    onKeyDown={e => e.key === "Enter" && saveSet()}
                    autoFocus
                  />
                  <Button size="sm" onClick={saveSet} disabled={saving} className="h-7 text-xs px-3">
                    {saving ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : "Simpan"}
                  </Button>
                  <button onClick={() => setSaveMode(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Progress bar */}
              {progress.some(p => p !== null) && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{knownCount + unknownCount} / {flashcards.length} ditandai</span>
                    <span className="flex gap-3">
                      <span className="text-green-500">{knownCount} paham</span>
                      <span className="text-red-400">{unknownCount} ulangi</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-border overflow-hidden flex">
                    <div
                      className="h-full bg-green-500 transition-all"
                      style={{ width: `${(knownCount / flashcards.length) * 100}%` }}
                    />
                    <div
                      className="h-full bg-red-400 transition-all"
                      style={{ width: `${(unknownCount / flashcards.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Summary when all marked */}
              {allMarked ? (
                <div className="rounded-2xl border border-border bg-card px-6 py-8 text-center space-y-4">
                  <div className="text-3xl">{knownCount === flashcards.length ? "🎉" : knownCount >= flashcards.length * 0.7 ? "👍" : "📚"}</div>
                  <div>
                    <p className="font-semibold text-foreground text-base">Sesi selesai!</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {knownCount}/{flashcards.length} kartu dikuasai
                      {knownCount === flashcards.length ? " — Sempurna! 🌟" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2 justify-center flex-wrap">
                    {unknownCount > 0 && (
                      <Button size="sm" onClick={retryUnknown} className="gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Ulangi {unknownCount} kartu
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={retryAll} className="gap-1.5">
                      <RotateCcw className="h-3.5 w-3.5" />
                      Mulai ulang
                    </Button>
                    <Button size="sm" variant="outline" onClick={reset}>
                      Buat baru
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Card */}
                  <FlashcardCard
                    card={flashcards[currentIndex]}
                    index={currentIndex}
                    total={flashcards.length}
                    progress={progress[currentIndex]}
                    onProgress={handleProgress}
                  />

                  {/* Navigation */}
                  <div className="flex items-center justify-center gap-4">
                    <Button
                      variant="outline" size="sm"
                      onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                      disabled={currentIndex === 0}
                      className="gap-1.5"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Sebelumnya
                    </Button>
                    <Button
                      variant="outline" size="sm"
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
                          i === currentIndex
                            ? "bg-primary w-4"
                            : progress[i] === "known"
                            ? "w-2 bg-green-500"
                            : progress[i] === "unknown"
                            ? "w-2 bg-red-400"
                            : "w-2 bg-border hover:bg-muted-foreground"
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

          ) : (
            /* ── INPUT / SAVED VIEW ── */
            <div className="space-y-4">

              {/* Page view tabs */}
              <div className="flex rounded-xl border border-border overflow-hidden">
                <button
                  onClick={() => setPageView("create")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm transition-colors border-r border-border ${
                    pageView === "create"
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Buat Baru
                </button>
                <button
                  onClick={() => setPageView("saved")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm transition-colors ${
                    pageView === "saved"
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Library className="h-3.5 w-3.5" />
                  Set Tersimpan
                </button>
              </div>

              {pageView === "create" ? (
                <div className="space-y-4">
                  {/* Input mode tabs */}
                  <div className="flex rounded-xl border border-border overflow-hidden">
                    {INPUT_TABS.map((tab, i) => (
                      <button
                        key={tab.id}
                        onClick={() => setInputMode(tab.id)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm transition-colors ${
                          i > 0 ? "border-l border-border" : ""
                        } ${
                          inputMode === tab.id
                            ? "bg-secondary text-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tab.icon}
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {inputMode === "topic" && (
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
                  )}

                  {inputMode === "text" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Tempel Teks Materi</label>
                      <Textarea
                        placeholder="Paste catatan kuliah, teks Arab, atau ringkasan bab di sini..."
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        rows={8}
                        className="bg-secondary resize-none text-sm"
                        dir={detectArabic(content) ? "rtl" : "ltr"}
                      />
                      <p className="text-[11px] text-muted-foreground/60">
                        Jika teks mengandung banyak Arab, flashcard otomatis dibuat bilingual Arab–Indonesia.
                      </p>
                    </div>
                  )}

                  {inputMode === "pdf" && (
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
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Muqorror Arab → flashcard bilingual · PDF Indonesia → flashcard Indonesia · Maks 20 MB
                            </p>
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
                    <p className="text-xs font-semibold text-foreground">Tips:</p>
                    <ul className="space-y-1 text-[11px] text-muted-foreground">
                      <li>• Klik kartu untuk membalik dan lihat jawaban</li>
                      <li>• Tandai ✓ Paham / ✗ Ulangi untuk melacak progres belajar</li>
                      <li>• Simpan set untuk belajar lagi kapan saja</li>
                      <li>• PDF muqorror atau teks Arab → flashcard otomatis bilingual Arab–Indonesia</li>
                    </ul>
                  </div>
                </div>
              ) : (
                /* ── SAVED SETS VIEW ── */
                <div className="space-y-3">
                  {setsLoading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Memuat set tersimpan...
                    </div>
                  ) : savedSets.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-secondary/20 px-6 py-12 text-center space-y-2">
                      <Library className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                      <p className="text-sm font-medium text-muted-foreground">Belum ada set tersimpan</p>
                      <p className="text-[11px] text-muted-foreground/60">
                        Buat flashcard dulu, lalu klik tombol "Simpan" di viewer
                      </p>
                      <Button
                        size="sm" variant="outline" className="mt-2"
                        onClick={() => setPageView("create")}
                      >
                        Buat Flashcard
                      </Button>
                    </div>
                  ) : (
                    savedSets.map(set => (
                      <div
                        key={set.id}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-foreground truncate">{set.name}</p>
                            {set.bilingual && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
                                عربي
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {set.cards.length} kartu
                            {" · "}
                            {new Date(set.created_at).toLocaleDateString("id-ID", {
                              day: "numeric", month: "short", year: "numeric",
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm" variant="outline"
                            onClick={() => loadSet(set)}
                            className="h-7 text-xs px-3"
                          >
                            Mulai
                          </Button>
                          <button
                            onClick={() => deleteSet(set.id, set.name)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/60 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}

                  {savedSets.length > 0 && (
                    <button
                      onClick={fetchSets}
                      className="w-full text-center text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors py-1"
                    >
                      Muat ulang
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
