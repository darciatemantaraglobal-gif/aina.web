import { useState, useEffect } from "react";
import {
  Newspaper, Zap, FileText, Utensils, Globe, Bus, GraduationCap,
  Clock, Pin, RefreshCw, ChevronRight,
} from "lucide-react";
import { NewsModal, timeAgo } from "@/components/NewsModal";
import type { NewsItem } from "@/components/NewsModal";

const CAT_META: Record<string, { label: string; icon: React.ElementType; color: string; dot: string; bg: string }> = {
  breaking_news:    { label: "Breaking",      icon: Zap,           color: "text-red-500",    dot: "bg-red-500",    bg: "bg-red-500/10 border border-red-500/20"    },
  administrasi:     { label: "Administrasi",  icon: FileText,      color: "text-blue-500",   dot: "bg-blue-500",   bg: "bg-blue-500/10 border border-blue-500/20"   },
  kuliner:          { label: "Kuliner",        icon: Utensils,      color: "text-orange-500", dot: "bg-orange-500", bg: "bg-orange-500/10 border border-orange-500/20" },
  kehidupan_mesir:  { label: "Kehidupan",     icon: Globe,         color: "text-green-500",  dot: "bg-green-500",  bg: "bg-green-500/10 border border-green-500/20"  },
  transportasi:     { label: "Transportasi",  icon: Bus,           color: "text-cyan-500",   dot: "bg-cyan-500",   bg: "bg-cyan-500/10 border border-cyan-500/20"   },
  aigypt:           { label: "AIGYPT",         icon: GraduationCap, color: "text-violet-500", dot: "bg-violet-500", bg: "bg-violet-500/10 border border-violet-500/20" },
};

function SkeletonItem() {
  return (
    <div className="flex items-stretch gap-0 rounded-xl border border-border/40 bg-card/50 overflow-hidden animate-pulse">
      <div className="flex-1 p-3 space-y-2">
        <div className="flex gap-2">
          <div className="h-4 w-14 rounded-full bg-muted/60" />
          <div className="ml-auto h-3 w-10 rounded bg-muted/60" />
        </div>
        <div className="h-3.5 w-full rounded bg-muted/60" />
        <div className="h-3.5 w-4/5 rounded bg-muted/60" />
      </div>
      <div className="w-20 bg-muted/40 shrink-0" />
    </div>
  );
}

const BeritaSection = () => {
  const [visible, setVisible]   = useState(false);
  const [news, setNews]         = useState<NewsItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<NewsItem | null>(null);

  useEffect(() => {
    setVisible(true);
    fetch("/api/news?limit=6")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.news) setNews(d.news); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="relative py-14 sm:py-20 px-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-purple-subtle/15 to-background" />
      </div>

      <div className={`relative z-10 mx-auto max-w-2xl transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
        {/* Section heading */}
        <div className="text-center mb-7 sm:mb-10">
          <div className="mb-4 sm:mb-6 inline-flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-primary/10 backdrop-blur-sm border border-primary/20">
            <Newspaper className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
          </div>
          <h2 className="font-display text-2xl sm:text-3xl sm:text-4xl font-bold text-foreground">
            Berita <span className="text-gradient-purple">Masisir</span>
          </h2>
          <p className="mt-2 sm:mt-3 text-sm text-muted-foreground">
            Berita & informasi terkini untuk mahasiswa Indonesia di Mesir.
          </p>
        </div>

        {/* News list */}
        <div className={`transition-all duration-700 delay-300 ${visible ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonItem key={i} />)}
            </div>
          ) : news.length === 0 ? (
            <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-xl px-8 py-14 text-center">
              <Newspaper className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">Belum ada berita. Nantikan update selanjutnya!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {news.map((item, i) => {
                const meta = CAT_META[item.category] ?? { label: item.category, icon: Newspaper, color: "text-muted-foreground", dot: "bg-muted-foreground", bg: "bg-muted" };
                const Icon = meta.icon;

                return (
                  <button
                    key={item.id}
                    onClick={() => setSelected(item)}
                    style={{ transitionDelay: `${i * 60}ms` }}
                    className={`group w-full text-left rounded-xl border bg-card/60 backdrop-blur-sm overflow-hidden transition-all duration-200 hover:scale-[1.01] hover:shadow-lg active:scale-[0.99] ${item.is_pinned ? "border-primary/30" : "border-border/50"}`}
                  >
                    <div className="flex items-stretch gap-0">
                      {/* Text content */}
                      <div className="flex-1 min-w-0 px-4 py-3">
                        {/* Meta row */}
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          {item.is_pinned && <Pin className="h-2.5 w-2.5 text-primary shrink-0" />}
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${meta.bg} ${meta.color}`}>
                            <Icon className="h-2.5 w-2.5" />
                            {meta.label}
                          </span>
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground ml-auto">
                            <Clock className="h-2.5 w-2.5" />
                            {timeAgo(item.published_at)}
                          </span>
                        </div>
                        {/* Title */}
                        <p className="text-[13px] sm:text-sm font-semibold text-foreground leading-snug line-clamp-2">
                          {item.title}
                        </p>
                        {item.source_name && (
                          <p className="text-[10px] text-muted-foreground mt-1">Sumber: {item.source_name}</p>
                        )}
                      </div>

                      {/* Thumbnail */}
                      {item.image_url ? (
                        <div className="shrink-0 w-20 sm:w-24 relative overflow-hidden bg-muted">
                          <img
                            src={item.image_url}
                            alt={item.title}
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
                          />
                        </div>
                      ) : (
                        <div className="shrink-0 flex items-center pr-3">
                          <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selected && <NewsModal item={selected} onClose={() => setSelected(null)} />}
    </section>
  );
};

export default BeritaSection;
