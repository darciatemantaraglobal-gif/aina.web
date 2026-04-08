import { useState, useEffect, useCallback } from "react";
import {
  Newspaper, Zap, FileText, Utensils, Globe, Bus, GraduationCap,
  Clock, RefreshCw, Pin, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { NewsModal, timeAgo } from "@/components/NewsModal";
import type { NewsItem } from "@/components/NewsModal";

function stripMarkdown(text: string, max = 120): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/---+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .trim()
    .slice(0, max) + (text.length > max ? "…" : "");
}

const CATEGORIES = [
  { id: "all",           label: "Semua",       icon: Newspaper,    activeBg: "bg-foreground",  activeText: "text-background" },
  { id: "breaking_news", label: "Breaking",    icon: Zap,          activeBg: "bg-red-500",     activeText: "text-white", bg: "bg-red-500/10 border border-red-500/20",    dot: "bg-red-500",    color: "text-red-500",    pulse: true },
  { id: "administrasi",  label: "Admin",       icon: FileText,     activeBg: "bg-blue-500",    activeText: "text-white", bg: "bg-blue-500/10 border border-blue-500/20",   dot: "bg-blue-500",   color: "text-blue-500"  },
  { id: "kuliner",       label: "Kuliner",     icon: Utensils,     activeBg: "bg-orange-500",  activeText: "text-white", bg: "bg-orange-500/10 border border-orange-500/20",dot: "bg-orange-500", color: "text-orange-500"},
  { id: "kehidupan_mesir",label:"Kehidupan",   icon: Globe,        activeBg: "bg-green-500",   activeText: "text-white", bg: "bg-green-500/10 border border-green-500/20",  dot: "bg-green-500",  color: "text-green-500" },
  { id: "transportasi",  label: "Transportasi",icon: Bus,          activeBg: "bg-cyan-500",    activeText: "text-white", bg: "bg-cyan-500/10 border border-cyan-500/20",    dot: "bg-cyan-500",   color: "text-cyan-500"  },
  { id: "aigypt",        label: "AIGYPT",      icon: GraduationCap,activeBg: "bg-violet-500",  activeText: "text-white", bg: "bg-violet-500/10 border border-violet-500/20",dot: "bg-violet-500", color: "text-violet-500"},
];

function getCategoryMeta(id: string) {
  return CATEGORIES.find(c => c.id === id) ?? CATEGORIES[0];
}

/* ─── Unified grid card — compact on mobile, fuller on desktop ─────────── */
function NewsCard({ item, onClick }: { item: NewsItem; onClick: () => void }) {
  const meta = getCategoryMeta(item.category);
  const Icon = meta.icon;
  const preview = stripMarkdown(item.content, 100);

  return (
    <button
      onClick={onClick}
      className={`group w-full text-left flex flex-col rounded-xl sm:rounded-2xl border bg-card transition-all duration-200 hover:shadow-md hover:scale-[1.01] active:scale-[0.99] overflow-hidden ${
        item.is_pinned ? "border-primary/30 ring-1 ring-primary/10" : "border-border"
      }`}
    >
      {/* Image */}
      {item.image_url ? (
        <div className="relative w-full overflow-hidden bg-muted" style={{ paddingBottom: "56.25%" /* 16:9 */ }}>
          <img
            src={item.image_url}
            alt={item.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
          />
          {/* Pinned badge */}
          {item.is_pinned && (
            <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold text-primary-foreground shadow">
              <Pin className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
              <span className="hidden sm:inline">Pinned</span>
            </div>
          )}
          {/* Category badge over image */}
          <div className={`absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold backdrop-blur-md bg-black/50 text-white shadow`}>
            {meta.pulse && (
              <span className="relative flex h-1.5 w-1.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75`} />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
              </span>
            )}
            <Icon className="h-2.5 w-2.5" />
            <span className="hidden sm:inline">{meta.label}</span>
          </div>
        </div>
      ) : (
        /* No image — color accent strip */
        <div className={`h-1.5 w-full ${meta.dot ?? "bg-muted"}`} />
      )}

      {/* Text content */}
      <div className="flex flex-col flex-1 p-2.5 sm:p-4">
        {/* If no image, show category here */}
        {!item.image_url && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${meta.bg ?? "bg-muted"} ${meta.color ?? "text-foreground"}`}>
              {meta.pulse && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${meta.dot} opacity-75`} />
                  <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                </span>
              )}
              <Icon className="h-2.5 w-2.5" />
              {meta.label}
            </span>
            {item.is_pinned && <Pin className="h-2.5 w-2.5 text-primary shrink-0" />}
          </div>
        )}

        {/* Title */}
        <h3 className="font-semibold text-foreground leading-snug text-[12px] sm:text-sm line-clamp-2 flex-1">
          {item.title}
        </h3>

        {/* Preview text — hidden on mobile to keep cards compact */}
        <p className="hidden sm:block mt-1.5 text-[12px] text-muted-foreground leading-relaxed line-clamp-2">
          {preview}
        </p>

        {/* Footer: time + comments */}
        <div className="mt-2 flex items-center justify-between gap-1">
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            {timeAgo(item.published_at)}
          </span>
          <span className="flex items-center gap-0.5 text-[10px] text-primary font-medium">
            <MessageSquare className="h-2.5 w-2.5" />
            <span className="hidden sm:inline">Komentar</span>
          </span>
        </div>
      </div>
    </button>
  );
}

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="rounded-xl sm:rounded-2xl border border-border bg-card overflow-hidden animate-pulse">
      <div className="w-full bg-muted" style={{ paddingBottom: "56.25%" }} />
      <div className="p-2.5 sm:p-4 space-y-2">
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-4/5 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
const NewsPage = () => {
  const [activeCategory, setActiveCategory] = useState("all");
  const [news, setNews]       = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<NewsItem | null>(null);

  const fetchNews = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const params = activeCategory !== "all" ? `?category=${activeCategory}` : "";
      const res = await fetch(`/api/news${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setNews(data.news ?? []);
    } catch {
      toast.error("Gagal memuat berita Masisir");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCategory]);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  const counts: Record<string, number> = {};
  for (const item of news) counts[item.category] = (counts[item.category] ?? 0) + 1;

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="shrink-0 border-b border-border px-4 md:px-8 py-3 md:py-5">
        <div className="md:max-w-5xl md:mx-auto flex items-center gap-3">
          <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600">
            <Newspaper className="h-4 w-4 md:h-5 md:w-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-base md:text-xl font-bold text-foreground">Berita Masisir</h1>
            <p className="text-[11px] md:text-sm text-muted-foreground">Update terkini untuk Masisir di Mesir</p>
          </div>
          <button
            onClick={() => fetchNews(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Category filter pills ── */}
      <div className="shrink-0 overflow-x-auto px-4 md:px-8 py-2 scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none]">
        <div className="md:max-w-5xl md:mx-auto flex gap-1.5 w-max md:w-full">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            const count = cat.id === "all" ? news.length : (counts[cat.id] ?? 0);
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all duration-150 ${
                  isActive
                    ? `${cat.activeBg} ${cat.activeText} shadow-sm`
                    : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                }`}
              >
                {(cat as any).pulse && isActive && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                  </span>
                )}
                <Icon className="h-3 w-3" />
                {cat.label}
                {!loading && count > 0 && (
                  <span className={`rounded-full px-1 py-0.5 text-[9px] font-bold ${isActive ? "bg-white/20 text-white" : "bg-background text-muted-foreground"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── News grid ── */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-6 md:pb-8">
        <div className="md:max-w-5xl md:mx-auto">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4 pt-3">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : news.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <Newspaper className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="font-semibold text-foreground">Belum ada berita</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeCategory === "all"
                  ? "Belum ada berita yang dipublikasikan"
                  : `Belum ada berita kategori "${getCategoryMeta(activeCategory).label}"`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4 pt-3">
              {news.map(item => (
                <NewsCard key={item.id} item={item} onClick={() => setSelected(item)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {selected && <NewsModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};

export default NewsPage;
