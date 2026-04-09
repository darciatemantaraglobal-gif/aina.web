import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen, Search, ExternalLink, FileText, Globe, X,
  BookMarked, GraduationCap, Sparkles, Loader2, RefreshCw,
  ChevronRight, MessageSquare, Filter, Send,
} from "lucide-react";

interface LibraryItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  faculty: string | null;
  year_level: string | null;
  drive_url: string;
  file_type: string;
  tags: string | null;
  cover_url?: string | null;
  created_at: string;
  ai_description?: string | null;
}

interface Props {
  onAskAINA?: (message: string) => void;
}

/* ── Category visual config ──────────────────────────────────────────────── */
const CAT = {
  muqorror: {
    label: "Muqorror",
    icon: BookMarked,
    gradient: "from-violet-900 via-purple-800 to-indigo-900",
    glow: "bg-violet-500/20",
    ring: "border-violet-500/30",
    badge: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    accent: "text-violet-400",
  },
  panduan: {
    label: "Panduan",
    icon: FileText,
    gradient: "from-blue-900 via-sky-800 to-blue-900",
    glow: "bg-blue-500/20",
    ring: "border-blue-500/30",
    badge: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    accent: "text-blue-400",
  },
  referensi: {
    label: "Referensi",
    icon: Globe,
    gradient: "from-emerald-900 via-teal-800 to-green-900",
    glow: "bg-emerald-500/20",
    ring: "border-emerald-500/30",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    accent: "text-emerald-400",
  },
  umum: {
    label: "Umum",
    icon: BookOpen,
    gradient: "from-amber-900 via-orange-800 to-yellow-900",
    glow: "bg-amber-500/20",
    ring: "border-amber-500/30",
    badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    accent: "text-amber-400",
  },
} as const;

type CatKey = keyof typeof CAT;

const FACULTIES = ["Semua", "Ushuluddin", "Syariah wal Qanun", "Dirasah Islamiyah wal Arabiyah", "Bahasa Arab", "Lainnya"];
const YEAR_LEVELS = ["Semua", "Tahun 1", "Tahun 2", "Tahun 3", "Tahun 4", "Semua Tahun"];

async function apiFetch(path: string, opts?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((opts?.headers as object) ?? {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function convertDriveUrl(url: string): string {
  if (!url || url.startsWith("aina://")) return "";
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return url;
  return `https://drive.google.com/file/d/${match[1]}/view`;
}

/** Extract kitab_id from scraper drive_url "aina://muqarrar/{kitab_id}" */
function extractMuqarrarKitabId(url: string): string | null {
  const m = url?.match(/^aina:\/\/muqarrar\/(.+)$/);
  return m ? m[1] : null;
}

/* ── BookCover: the Netflix-style poster ─────────────────────────────────── */
function BookCover({ item, size = "card" }: { item: LibraryItem; size?: "card" | "modal" }) {
  const cat = CAT[item.category as CatKey] ?? CAT.umum;
  const Icon = cat.icon;
  const isModal = size === "modal";
  const hasCover = !!item.cover_url;

  const wrapClass = `relative overflow-hidden ${
    isModal ? "rounded-2xl w-full aspect-[2/3]" : "w-full aspect-[2/3] rounded-t-2xl"
  }`;

  return (
    <div className={`${wrapClass} bg-gradient-to-br ${cat.gradient}`}>
      {/* Real photo when available */}
      {hasCover && (
        <img
          src={item.cover_url!}
          alt={item.title}
          className="absolute inset-0 w-full h-full object-cover"
          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}

      {/* Gradient elements (shown when no cover, or as overlay accent) */}
      {!hasCover && (
        <>
          <div className={`absolute inset-0 ${cat.glow} blur-2xl scale-75`} />
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full border-2 ${cat.ring} opacity-30`} />
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-20 w-20 rounded-full border ${cat.ring} opacity-20`} />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: "repeating-linear-gradient(45deg, white 0px, white 1px, transparent 1px, transparent 8px)" }}
          />
          {/* Center icon (gradient mode only) */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`flex items-center justify-center rounded-2xl border ${cat.ring} bg-white/10 backdrop-blur-sm ${isModal ? "h-20 w-20" : "h-14 w-14"}`}>
              <Icon className={`${isModal ? "h-10 w-10" : "h-7 w-7"} text-white/80`} />
            </div>
          </div>
        </>
      )}

      {/* File type badge (top-right) */}
      <div className="absolute top-2.5 right-2.5 rounded-md bg-black/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/80 backdrop-blur-sm">
        {item.file_type}
      </div>

      {/* Category label (top-left) */}
      <div className={`absolute top-2.5 left-2.5 rounded-md border ${cat.ring} bg-black/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${cat.accent} backdrop-blur-sm`}>
        {cat.label}
      </div>

      {/* Title overlay at bottom */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pb-3 pt-10">
        <p className={`font-bold text-white leading-snug line-clamp-2 ${isModal ? "text-sm" : "text-[11px]"}`}>
          {item.title}
        </p>
      </div>
    </div>
  );
}

/* ── LibraryCard (Netflix poster card) ──────────────────────────────────── */
function LibraryCard({ item, onClick }: { item: LibraryItem; onClick: () => void }) {
  const cat = CAT[item.category as CatKey] ?? CAT.umum;

  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] text-left transition-all duration-300 hover:border-white/20 hover:shadow-2xl hover:shadow-black/40 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      {/* Poster cover */}
      <BookCover item={item} size="card" />

      {/* Card bottom info */}
      <div className="flex flex-col gap-1.5 p-3">
        {(item.faculty || item.year_level) && (
          <div className="flex flex-wrap gap-1">
            {item.faculty && (
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-foreground/50 leading-none">
                {item.faculty}
              </span>
            )}
            {item.year_level && (
              <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] leading-none ${cat.badge}`}>
                {item.year_level}
              </span>
            )}
          </div>
        )}
        {item.description && (
          <p className="text-[10px] text-foreground/40 line-clamp-1 leading-relaxed">{item.description}</p>
        )}
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-3 pointer-events-none">
        <div className="flex w-full items-center justify-center gap-1 rounded-xl bg-primary/90 backdrop-blur-sm py-2 text-xs font-semibold text-white shadow-lg">
          Lihat Detail <ChevronRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </button>
  );
}

/* ── Detail Modal ────────────────────────────────────────────────────────── */
function DetailModal({
  item,
  onClose,
  onAskAINA,
}: {
  item: LibraryItem;
  onClose: () => void;
  onAskAINA?: (msg: string) => void;
}) {
  const cat = CAT[item.category as CatKey] ?? CAT.umum;
  const [aiDesc, setAiDesc] = useState<string | null>(item.ai_description ?? null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const loadAIDesc = useCallback(async (force = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setAiLoading(true);
    setAiError(null);
    try {
      const url = force
        ? `/api/library/${item.id}/ai-description?force=true`
        : `/api/library/${item.id}/ai-description`;
      const data = await apiFetch(url, { method: "POST" });
      if (data.description) setAiDesc(data.description);
    } catch {
      setAiError("Gagal generate sinopsis. Coba lagi.");
    } finally {
      loadingRef.current = false;
      setAiLoading(false);
    }
  }, [item.id]);

  useEffect(() => {
    // Only auto-fetch if no cached description exists
    if (!item.ai_description) {
      loadAIDesc(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const driveUrl = convertDriveUrl(item.drive_url);
  const muqarrarKitabId = extractMuqarrarKitabId(item.drive_url);

  const [kitabQuestion, setKitabQuestion] = useState("");

  const handleAskAINA = () => {
    const q = kitabQuestion.trim();
    if (!q || !onAskAINA) return;
    onClose();
    // If item came from scraper (aina://muqarrar/{id}), include kitab_id for exact DB filtering
    const prefix = muqarrarKitabId
      ? `[KitabID:"${muqarrarKitabId}" Kitab:"${item.title}"]`
      : `[Kitab: "${item.title}"]`;
    onAskAINA(`${prefix} ${q}`);
    setKitabQuestion("");
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-[#1a1a24] shadow-2xl animate-in slide-in-from-bottom-4 duration-300 sm:inset-x-auto sm:inset-y-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[640px] sm:max-h-[88vh] sm:rounded-3xl">

        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/60 backdrop-blur-sm hover:bg-black/60 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col sm:flex-row gap-5 p-5">
          {/* Left: Cover */}
          <div className="shrink-0 w-full sm:w-44">
            <BookCover item={item} size="modal" />
          </div>

          {/* Right: Details */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {/* Title + badges */}
            <div>
              <h2 className="text-base font-bold text-white leading-snug mb-2">{item.title}</h2>
              <div className="flex flex-wrap gap-1.5">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${cat.badge}`}>
                  {cat.label}
                </span>
                {item.faculty && (
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] leading-none text-white/50">
                    {item.faculty}
                  </span>
                )}
                {item.year_level && (
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] leading-none text-white/50">
                    {item.year_level}
                  </span>
                )}
                {item.tags?.split(",").slice(0, 3).map(t => t.trim()).filter(Boolean).map(tag => (
                  <span key={tag} className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] leading-none text-white/40">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* AI Sinopsis */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 flex-1">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <Sparkles className={`h-3.5 w-3.5 ${cat.accent}`} />
                  <span className="text-xs font-semibold text-white/70">Sinopsis oleh AINA</span>
                </div>
                {aiDesc && !aiLoading && (
                  <button
                    onClick={() => loadAIDesc(true)}
                    title="Generate ulang"
                    className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Baru
                  </button>
                )}
              </div>

              {aiLoading ? (
                <div className="flex items-center gap-2.5 py-2">
                  <Loader2 className={`h-4 w-4 animate-spin shrink-0 ${cat.accent}`} />
                  <p className="text-xs text-white/40">AINA sedang membaca dokumen ini...</p>
                </div>
              ) : aiError ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-red-400/80">{aiError}</p>
                  <button
                    onClick={() => loadAIDesc(false)}
                    className="self-start text-xs text-primary hover:underline"
                  >
                    Coba lagi
                  </button>
                </div>
              ) : aiDesc ? (
                <p className="text-sm text-white/70 leading-relaxed">{aiDesc}</p>
              ) : (
                <p className="text-xs text-white/25 italic">Sinopsis tidak tersedia.</p>
              )}
            </div>

            {/* CTA buttons */}
            <div className="flex flex-col gap-2">
              {driveUrl ? (
                <a
                  href={driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 hover:opacity-90 transition-opacity"
                >
                  <ExternalLink className="h-4 w-4" />
                  Buka Dokumen
                </a>
              ) : (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-violet-500/20 bg-violet-500/[0.07] py-3 text-sm text-violet-300/70">
                  <BookMarked className="h-4 w-4" />
                  <span>Kitab ini tersedia via AINA Chat</span>
                </div>
              )}

              {onAskAINA && (
                <div className="rounded-2xl border border-white/[0.10] bg-white/[0.03] p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                    <p className="text-[11px] font-semibold text-white/50">Tanya AINA tentang kitab ini</p>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={kitabQuestion}
                      onChange={e => setKitabQuestion(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleAskAINA()}
                      placeholder={`Contoh: Apa isi bab pertama ${item.title}?`}
                      className="flex-1 min-w-0 rounded-xl bg-white/[0.06] border border-white/[0.08] px-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] transition-colors"
                    />
                    <button
                      onClick={handleAskAINA}
                      disabled={!kitabQuestion.trim()}
                      className="shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <Send className="h-3.5 w-3.5 text-white" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Main LibraryPage ────────────────────────────────────────────────────── */
export default function LibraryPage({ onAskAINA }: Props) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("semua");
  const [faculty, setFaculty] = useState("Semua");
  const [yearLevel, setYearLevel] = useState("Semua");
  const [selected, setSelected] = useState<LibraryItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeCategory !== "semua") params.set("category", activeCategory);
      if (faculty !== "Semua") params.set("faculty", faculty);
      if (yearLevel !== "Semua") params.set("year_level", yearLevel);
      if (search.trim()) params.set("q", search.trim());
      const data = await apiFetch(`/api/library?${params}`);
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeCategory, faculty, yearLevel, search]);

  useEffect(() => { load(); }, [load]);

  const hasFilters = activeCategory !== "semua" || faculty !== "Semua" || yearLevel !== "Semua" || search.trim();

  const clearFilters = () => {
    setActiveCategory("semua");
    setFaculty("Semua");
    setYearLevel("Semua");
    setSearch("");
  };

  const catTabs = [
    { id: "semua", label: "Semua" },
    { id: "muqorror", label: "Muqorror" },
    { id: "panduan", label: "Panduan" },
    { id: "referensi", label: "Referensi" },
    { id: "umum", label: "Umum" },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="shrink-0 border-b border-border/40 px-4 py-4 md:px-8 md:py-5">
        <div className="md:max-w-5xl md:mx-auto space-y-3">
          {/* Title row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-purple-500 shadow-lg shadow-violet-900/40">
                <BookOpen className="h-4 w-4 md:h-5 md:w-5 text-white" />
              </div>
              <div>
                <h1 className="text-base md:text-xl font-bold text-foreground leading-tight">Library Masisir</h1>
                <p className="text-xs text-foreground/40">Muqorror, panduan, dan referensi</p>
              </div>
            </div>
            <button
              onClick={() => setShowFilters(f => !f)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                hasFilters
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-white/10 bg-white/[0.04] text-white/50 hover:text-white/80"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              Filter
              {hasFilters && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/30 text-[9px] font-bold text-primary">!</span>}
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/30" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari judul, deskripsi, atau tag..."
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-foreground/25 focus:border-white/20 focus:outline-none transition-colors"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-foreground/30 hover:text-foreground/60" />
              </button>
            )}
          </div>

          {/* Category tabs */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            {catTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id)}
                className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                  activeCategory === tab.id
                    ? "bg-primary/20 text-primary border border-primary/30 shadow-sm shadow-primary/20"
                    : "bg-white/[0.04] text-foreground/50 border border-white/[0.07] hover:bg-white/[0.08] hover:text-foreground/80"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Expandable filter row */}
          {showFilters && (
            <div className="flex flex-wrap items-center gap-2 pt-1 animate-in slide-in-from-top-2 duration-200">
              <span className="text-[10px] text-white/30 uppercase tracking-wide font-medium">Fakultas:</span>
              <div className="flex gap-1 flex-wrap">
                {FACULTIES.map(f => (
                  <button
                    key={f}
                    onClick={() => setFaculty(f)}
                    className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                      faculty === f
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-white/10 bg-white/[0.04] text-white/40 hover:text-white/70"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-white/30 uppercase tracking-wide font-medium mt-1 w-full">Tahun:</span>
              <div className="flex gap-1 flex-wrap">
                {YEAR_LEVELS.map(y => (
                  <button
                    key={y}
                    onClick={() => setYearLevel(y)}
                    className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                      yearLevel === y
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-white/10 bg-white/[0.04] text-white/40 hover:text-white/70"
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors mt-1"
                >
                  <X className="h-3 w-3" />
                  Reset semua filter
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-6">
        <div className="md:max-w-5xl md:mx-auto">
          {loading ? (
            /* Netflix skeleton loader */
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex flex-col rounded-2xl overflow-hidden border border-white/[0.05] bg-white/[0.02]">
                  <div className="aspect-[2/3] w-full animate-pulse bg-white/[0.05]" />
                  <div className="p-3 space-y-1.5">
                    <div className="h-2 w-3/4 rounded animate-pulse bg-white/[0.05]" />
                    <div className="h-2 w-1/2 rounded animate-pulse bg-white/[0.04]" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/10">
                <GraduationCap className="h-8 w-8 text-foreground/20" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground/60">
                  {hasFilters ? "Tidak ada dokumen yang cocok" : "Library masih kosong"}
                </p>
                <p className="mt-1 text-xs text-foreground/30">
                  {hasFilters ? "Coba ubah atau reset filter" : "Admin akan segera menambahkan dokumen"}
                </p>
              </div>
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="rounded-xl bg-white/[0.06] border border-white/10 px-4 py-2 text-xs font-medium text-foreground/60 hover:text-foreground/90 transition-colors"
                >
                  Reset Filter
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="mb-4 text-xs text-foreground/30">
                {items.length} dokumen{hasFilters ? " ditemukan" : ""}
              </p>
              {/* Netflix-style grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {items.map(item => (
                  <LibraryCard
                    key={item.id}
                    item={item}
                    onClick={() => setSelected(item)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Detail Modal ── */}
      {selected && (
        <DetailModal
          item={selected}
          onClose={() => setSelected(null)}
          onAskAINA={onAskAINA}
        />
      )}
    </div>
  );
}
