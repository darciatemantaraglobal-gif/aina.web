import { useState, useEffect, useCallback } from "react";
import {
  Newspaper, Zap, FileText, Utensils, Globe, Bus, GraduationCap,
  Clock, ExternalLink, RefreshCw, ChevronRight, Pin
} from "lucide-react";
import { toast } from "sonner";

interface NewsItem {
  id: string;
  title: string;
  content: string;
  category: string;
  image_url?: string;
  source_url?: string;
  source_name?: string;
  is_pinned: boolean;
  published_at: string;
  created_at: string;
}

const CATEGORIES = [
  {
    id: "all",
    label: "Semua",
    icon: Newspaper,
    color: "text-foreground",
    bg: "bg-muted",
    activeBg: "bg-foreground",
    activeText: "text-background",
    dot: "bg-foreground",
  },
  {
    id: "breaking_news",
    label: "Breaking News",
    icon: Zap,
    color: "text-red-500",
    bg: "bg-red-500/10 border border-red-500/20",
    activeBg: "bg-red-500",
    activeText: "text-white",
    dot: "bg-red-500",
    pulse: true,
  },
  {
    id: "administrasi",
    label: "Administrasi",
    icon: FileText,
    color: "text-blue-500",
    bg: "bg-blue-500/10 border border-blue-500/20",
    activeBg: "bg-blue-500",
    activeText: "text-white",
    dot: "bg-blue-500",
  },
  {
    id: "kuliner",
    label: "Kuliner",
    icon: Utensils,
    color: "text-orange-500",
    bg: "bg-orange-500/10 border border-orange-500/20",
    activeBg: "bg-orange-500",
    activeText: "text-white",
    dot: "bg-orange-500",
  },
  {
    id: "kehidupan_mesir",
    label: "Kehidupan Mesir",
    icon: Globe,
    color: "text-green-500",
    bg: "bg-green-500/10 border border-green-500/20",
    activeBg: "bg-green-500",
    activeText: "text-white",
    dot: "bg-green-500",
  },
  {
    id: "transportasi",
    label: "Transportasi",
    icon: Bus,
    color: "text-cyan-500",
    bg: "bg-cyan-500/10 border border-cyan-500/20",
    activeBg: "bg-cyan-500",
    activeText: "text-white",
    dot: "bg-cyan-500",
  },
  {
    id: "aigypt",
    label: "Berita AIGYPT",
    icon: GraduationCap,
    color: "text-violet-500",
    bg: "bg-violet-500/10 border border-violet-500/20",
    activeBg: "bg-violet-500",
    activeText: "text-white",
    dot: "bg-violet-500",
  },
];

function getCategoryMeta(categoryId: string) {
  return CATEGORIES.find(c => c.id === categoryId) ?? CATEGORIES[0];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  if (hours < 24) return `${hours} jam lalu`;
  if (days < 7) return `${days} hari lalu`;
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function NewsCard({ item }: { item: NewsItem }) {
  const [expanded, setExpanded] = useState(false);
  const meta = getCategoryMeta(item.category);
  const Icon = meta.icon;
  const isLong = item.content.length > 220;
  const preview = isLong && !expanded ? item.content.slice(0, 220).trimEnd() + "…" : item.content;

  return (
    <div className={`group relative rounded-2xl border bg-card transition-all duration-200 hover:shadow-md overflow-hidden ${item.is_pinned ? "border-primary/30 ring-1 ring-primary/10" : "border-border"}`}>
      {item.image_url && (
        <div className="relative h-44 w-full overflow-hidden bg-muted">
          <img
            src={item.image_url}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          {item.is_pinned && (
            <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
              <Pin className="h-2.5 w-2.5" />
              Pinned
            </div>
          )}
        </div>
      )}

      <div className="p-4">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.bg} ${meta.color}`}>
            {meta.pulse && (
              <span className="relative flex h-1.5 w-1.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${meta.dot} opacity-75`} />
                <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${meta.dot}`} />
              </span>
            )}
            <Icon className="h-3 w-3" />
            {meta.label}
          </div>
          {!item.image_url && item.is_pinned && (
            <div className="flex items-center gap-1 text-[10px] text-primary font-medium">
              <Pin className="h-2.5 w-2.5" />
              Pinned
            </div>
          )}
          <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {timeAgo(item.published_at)}
          </span>
        </div>

        <h3 className="mb-2 font-semibold text-foreground leading-snug text-sm">{item.title}</h3>

        <p className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{preview}</p>

        {isLong && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="mt-2 flex items-center gap-1 text-xs text-primary font-medium hover:underline"
          >
            {expanded ? "Tampilkan lebih sedikit" : "Selengkapnya"}
            <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
        )}

        {item.source_url && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            {item.source_name || "Lihat sumber"}
          </a>
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-5 w-24 rounded-full bg-muted" />
        <div className="ml-auto h-4 w-16 rounded bg-muted" />
      </div>
      <div className="h-4 w-3/4 rounded bg-muted" />
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-5/6 rounded bg-muted" />
        <div className="h-3 w-4/6 rounded bg-muted" />
      </div>
    </div>
  );
}

const NewsPage = () => {
  const [activeCategory, setActiveCategory] = useState("all");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNews = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const params = activeCategory !== "all" ? `?category=${activeCategory}` : "";
      const res = await fetch(`/api/news${params}`, {
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Gagal memuat berita");
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
  for (const item of news) {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-4 shrink-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600">
          <Newspaper className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="font-display text-lg font-bold text-foreground">Berita Masisir</h1>
          <p className="text-xs text-muted-foreground">Update terkini untuk Masisir di Mesir</p>
        </div>
        <button
          onClick={() => fetchNews(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Category filter pills */}
      <div className="flex gap-2 overflow-x-auto px-5 py-3 shrink-0 scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none]">
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          const count = cat.id === "all" ? news.length : (counts[cat.id] ?? 0);
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                isActive
                  ? `${cat.activeBg} ${cat.activeText} shadow-sm`
                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
              }`}
            >
              {cat.pulse && isActive && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                </span>
              )}
              <Icon className="h-3.5 w-3.5" />
              {cat.label}
              {!loading && count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isActive ? "bg-white/20 text-white" : "bg-background text-muted-foreground"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* News grid */}
      <div className="flex-1 overflow-y-auto px-5 pb-6">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
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
          <div className="grid gap-4 sm:grid-cols-2">
            {news.map(item => <NewsCard key={item.id} item={item} />)}
          </div>
        )}
      </div>
    </div>
  );
};

export default NewsPage;
