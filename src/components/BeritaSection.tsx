import { useState, useEffect } from "react";
import {
  Newspaper, Zap, FileText, Utensils, Globe, Bus, GraduationCap,
  Clock, Pin, RefreshCw, ChevronRight,
} from "lucide-react";
import { NewsModal, timeAgo } from "@/components/NewsModal";
import type { NewsItem } from "@/components/NewsModal";

const CAT_META: Record<string, { label: string; icon: React.ElementType; color: string; dot: string }> = {
  breaking_news:    { label: "Breaking",      icon: Zap,           color: "text-red-500",    dot: "bg-red-500"    },
  administrasi:     { label: "Administrasi",  icon: FileText,      color: "text-blue-500",   dot: "bg-blue-500"   },
  kuliner:          { label: "Kuliner",        icon: Utensils,      color: "text-orange-500", dot: "bg-orange-500" },
  kehidupan_mesir:  { label: "Kehidupan",     icon: Globe,         color: "text-green-500",  dot: "bg-green-500"  },
  transportasi:     { label: "Transportasi",  icon: Bus,           color: "text-cyan-500",   dot: "bg-cyan-500"   },
  aigypt:           { label: "AIGYPT",         icon: GraduationCap, color: "text-violet-500", dot: "bg-violet-500" },
};

const BeritaSection = () => {
  const [visible, setVisible]     = useState(false);
  const [news, setNews]           = useState<NewsItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<NewsItem | null>(null);

  useEffect(() => {
    setVisible(true);
    fetch("/api/news?limit=6")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.news) setNews(d.news); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="relative py-20 px-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-purple-subtle/15 to-background" />
      </div>

      <div className={`relative z-10 mx-auto max-w-2xl transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
        <div className="text-center mb-10">
          <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 backdrop-blur-sm border border-primary/20">
            <Newspaper className="h-7 w-7 text-primary" />
          </div>
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            Berita <span className="text-gradient-purple">Masisir</span>
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Berita & informasi terkini untuk mahasiswa Indonesia di Mesir.
          </p>
        </div>

        <div className={`transition-all duration-700 delay-300 ${visible ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}>
          {loading ? (
            <div className="flex justify-center py-16">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : news.length === 0 ? (
            <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-xl px-8 py-14 text-center">
              <Newspaper className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">Belum ada berita. Nantikan update selanjutnya!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {news.map((item, i) => {
                const meta = CAT_META[item.category] ?? { label: item.category, icon: Newspaper, color: "text-muted-foreground", dot: "bg-muted-foreground" };
                const Icon = meta.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className={`w-full text-left rounded-2xl border bg-card/60 backdrop-blur-sm overflow-hidden transition-all duration-300 hover:scale-[1.01] hover:shadow-lg active:scale-[0.99] ${i === 0 ? "delay-0" : i === 1 ? "delay-100" : "delay-200"} ${item.is_pinned ? "border-primary/30" : "border-border/50"}`}
                  >
                    {item.image_url && (
                      <div className="w-full h-36 overflow-hidden">
                        <img
                          src={item.image_url}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
                        />
                      </div>
                    )}
                    <div className="px-5 py-4 flex items-start gap-3">
                      <div className={`shrink-0 mt-0.5 ${meta.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          {item.is_pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                          <span className={`text-[10px] font-medium rounded-full px-1.5 py-0.5 ${meta.dot} bg-opacity-15 ${meta.color}`}>{meta.label}</span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" /> {timeAgo(item.published_at)}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{item.title}</p>
                        {item.source_name && <p className="text-[10px] text-muted-foreground mt-0.5">Sumber: {item.source_name}</p>}
                      </div>
                      <ChevronRight className="shrink-0 mt-1 h-4 w-4 text-muted-foreground/50" />
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
