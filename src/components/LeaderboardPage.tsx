import { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
const MD_LINK = { a: ({ href, children }: any) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors break-all">{children}</a> };
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ThumbsUp, Trophy, Medal, BookOpen, RefreshCw, BookOpenCheck,
  Flag, X, AlertTriangle, Send, Loader2, Search,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */
interface Contributor {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  contribution_count: number;
  period_points?: number | null;
  role: string;
}

type LeaderboardPeriod = "week" | "month" | "all";

const PERIOD_LABEL: Record<LeaderboardPeriod, string> = {
  week:  "Minggu Ini",
  month: "Bulan Ini",
  all:   "Sepanjang Masa",
};

interface Article {
  id: string;
  title: string;
  category: string;
  article_type: string;
  vote_count: number;
  created_at: string;
  author_name: string | null;
  user_voted: boolean;
  snippet?: string | null;
  title_match?: boolean;
}

interface ArticleDetail extends Article {
  content: string;
}

/* ─── Helpers ────────────────────────────────────────── */
async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? `Bearer ${session.access_token}` : "";
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const auth = await getAuthHeader();
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: auth, ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

const ROLE_LABEL: Record<string, { label: string; color: string }> = {
  admin:               { label: "Senior Kontributor", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  senior_contributor:  { label: "Senior Kontributor", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  contributor:         { label: "Kontributor",        color: "text-violet-400 bg-violet-500/10 border-violet-500/30" },
  user:                { label: "User",               color: "text-muted-foreground bg-secondary border-border" },
};

const CATEGORIES = [
  { label: "Administrasi",   value: "Administrasi" },
  { label: "Akademik",       value: "Akademik" },
  { label: "Kehidupan Mesir",value: "Kehidupan Mesir" },
  { label: "Transport",      value: "Transport" },
  { label: "Tempat Tinggal", value: "Tempat Tinggal" },
  { label: "Kuliner",        value: "Kuliner" },
  { label: "Bahasa",         value: "Bahasa" },
];

const CATEGORY_COLORS: Record<string, string> = {
  Administrasi:      "bg-violet-500/15 text-violet-400",
  Akademik:          "bg-blue-500/15 text-blue-400",
  "Kehidupan Mesir": "bg-green-500/15 text-green-400",
  Transport:         "bg-yellow-500/15 text-yellow-400",
  "Tempat Tinggal":  "bg-orange-500/15 text-orange-400",
  Kuliner:           "bg-pink-500/15 text-pink-400",
  Bahasa:            "bg-teal-500/15 text-teal-400",
};

const CATEGORY_CHIP_ACTIVE: Record<string, string> = {
  Administrasi:      "bg-violet-500/25 text-violet-300 border-violet-500/40",
  Akademik:          "bg-blue-500/25 text-blue-300 border-blue-500/40",
  "Kehidupan Mesir": "bg-green-500/25 text-green-300 border-green-500/40",
  Transport:         "bg-yellow-500/25 text-yellow-300 border-yellow-500/40",
  "Tempat Tinggal":  "bg-orange-500/25 text-orange-300 border-orange-500/40",
  Kuliner:           "bg-pink-500/25 text-pink-300 border-pink-500/40",
  Bahasa:            "bg-teal-500/25 text-teal-300 border-teal-500/40",
};

/* ─── Highlight helper ───────────────────────────────── */
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="rounded bg-primary/20 text-primary px-0.5 not-italic">{part}</mark>
          : part
      )}
    </>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="flex h-8 w-8 shrink-0 items-center justify-center text-lg">🥇</span>;
  if (rank === 2) return <span className="flex h-8 w-8 shrink-0 items-center justify-center text-lg">🥈</span>;
  if (rank === 3) return <span className="flex h-8 w-8 shrink-0 items-center justify-center text-lg">🥉</span>;
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-xs font-bold text-muted-foreground">
      {rank}
    </span>
  );
}

function AvatarDisplay({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  const [imgError, setImgError] = useState(false);
  const letters = (name ?? "?").split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name ?? "avatar"}
        className="h-10 w-10 shrink-0 rounded-xl object-cover"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-purple text-sm font-bold text-white">
      {letters}
    </div>
  );
}

/* ─── Article Detail Modal ───────────────────────────── */
function ArticleDetailModal({
  articleId,
  onClose,
  onVote,
  votingId,
}: {
  articleId: string;
  onClose: () => void;
  onVote: (id: string) => void;
  votingId: string | null;
}) {
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/articles/${articleId}`)
      .then(data => { if (!cancelled) { setArticle(data); setLoading(false); } })
      .catch(e => { if (!cancelled) { toast.error(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [articleId]);

  const handleReport = async () => {
    if (!reportReason.trim()) return toast.error("Tulis alasan laporan terlebih dahulu");
    setSubmittingReport(true);
    try {
      await apiFetch(`/api/articles/${articleId}/report`, {
        method: "POST",
        body: JSON.stringify({ reason: reportReason.trim() }),
      });
      setReported(true);
      setShowReport(false);
      toast.success("Laporan dikirim, terima kasih!");
    } catch (e: any) {
      toast.error(e.message);
    }
    setSubmittingReport(false);
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="pointer-events-none absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative z-10 flex w-full max-w-2xl flex-col rounded-3xl border border-border bg-background shadow-2xl max-h-[88dvh]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <BookOpenCheck className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Baca Artikel</span>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="flex flex-col gap-3">
              <div className="h-6 w-3/4 animate-pulse rounded-xl bg-card" />
              <div className="h-4 w-1/3 animate-pulse rounded-xl bg-card" />
              <div className="mt-4 space-y-2">
                {[...Array(6)].map((_, i) => <div key={i} className="h-4 animate-pulse rounded-lg bg-card" />)}
              </div>
            </div>
          ) : article ? (
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${CATEGORY_COLORS[article.category] ?? "bg-secondary text-muted-foreground"}`}>
                  {article.category}
                </span>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">
                  {article.article_type}
                </span>
              </div>
              <h2 className="font-display text-xl font-bold leading-snug text-foreground mb-1">
                {article.title}
              </h2>
              <p className="text-xs text-muted-foreground mb-5">
                oleh <span className="font-medium text-foreground">{article.author_name ?? "Kontributor"}</span>
                {" · "}{fmtDate(article.created_at)}
              </p>
              <div className="prose prose-sm prose-invert max-w-none text-sm text-foreground/90 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mt-5 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground/90 [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:mb-3 [&_ol]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:mb-3 [&_li]:leading-relaxed [&_strong]:font-semibold [&_strong]:text-foreground">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_LINK}>{article.content}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-12 text-center">
              <AlertTriangle className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Gagal memuat artikel</p>
            </div>
          )}
        </div>

        {article && (
          <div className="shrink-0 border-t border-border px-5 py-4">
            {!showReport ? (
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => { if (!reported) setShowReport(true); }}
                  disabled={reported}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                    reported
                      ? "border-green-500/30 bg-green-500/10 text-green-400 cursor-default"
                      : "border-border text-muted-foreground hover:border-red-500/30 hover:bg-red-500/5 hover:text-red-400"
                  }`}
                >
                  <Flag className="h-3.5 w-3.5" />
                  {reported ? "Sudah dilaporkan" : "Laporkan inakurasi"}
                </button>
                <button
                  onClick={() => onVote(article.id)}
                  disabled={votingId === article.id}
                  className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                    article.user_voted
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-secondary text-muted-foreground hover:border-primary/30 hover:text-primary"
                  } disabled:opacity-50`}
                >
                  <ThumbsUp className={`h-4 w-4 ${article.user_voted ? "fill-primary" : ""}`} />
                  {article.vote_count} Upvote
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Flag className="h-3.5 w-3.5 text-red-400" />
                  <p className="text-xs font-semibold text-foreground">Laporkan inakurasi pada artikel ini</p>
                </div>
                <textarea
                  value={reportReason}
                  onChange={e => setReportReason(e.target.value)}
                  placeholder="Jelaskan bagian mana yang tidak akurat dan mengapa..."
                  rows={3}
                  maxLength={500}
                  className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">{reportReason.length}/500</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowReport(false); setReportReason(""); }}
                      className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
                    >
                      Batal
                    </button>
                    <button
                      onClick={handleReport}
                      disabled={submittingReport || !reportReason.trim()}
                      className="flex items-center gap-1.5 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                    >
                      {submittingReport ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      Kirim Laporan
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Contributor Card ───────────────────────────────── */
function ContributorCard({ contributor, rank, period = "all" }: { contributor: Contributor; rank: number; period?: LeaderboardPeriod }) {
  const roleInfo = ROLE_LABEL[contributor.role] ?? ROLE_LABEL.user;
  const showPeriodPoints = period !== "all" && contributor.period_points != null;
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-4 transition-colors ${rank <= 3 ? "border-primary/20 bg-primary/5" : "border-border bg-card"}`}>
      <RankBadge rank={rank} />
      <AvatarDisplay name={contributor.full_name} avatarUrl={contributor.avatar_url} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground truncate">{contributor.full_name ?? "Pengguna"}</p>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium mt-0.5 ${roleInfo.color}`}>
          {roleInfo.label}
        </span>
      </div>
      <div className="shrink-0 text-right">
        {showPeriodPoints ? (
          <>
            <p className="text-lg font-bold text-primary">{contributor.period_points}</p>
            <p className="text-[11px] text-muted-foreground">poin misi</p>
            <p className="text-[10px] text-muted-foreground/60">{contributor.contribution_count} artikel total</p>
          </>
        ) : (
          <>
            <p className="text-lg font-bold text-primary">{contributor.contribution_count}</p>
            <p className="text-[11px] text-muted-foreground">artikel</p>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Article Card ───────────────────────────────────── */
function ArticleCard({
  article,
  rank,
  onVote,
  voting,
  onRead,
  searchQuery,
}: {
  article: Article;
  rank: number;
  onVote: (id: string) => void;
  voting: boolean;
  onRead: (id: string) => void;
  searchQuery?: string;
}) {
  const isSearchMode = !!(searchQuery?.trim());
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-4 transition-colors ${
      !isSearchMode && rank <= 3 ? "border-primary/20 bg-primary/5" : "border-border bg-card"
    }`}>
      {!isSearchMode && <RankBadge rank={rank} />}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_COLORS[article.category] ?? "bg-secondary text-muted-foreground"}`}>
            {article.category}
          </span>
          {isSearchMode && article.title_match === false && article.snippet && (
            <span className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] text-primary/70">
              ditemukan dalam isi
            </span>
          )}
        </div>
        <p className="font-semibold text-sm text-foreground line-clamp-2 leading-snug">
          {isSearchMode && searchQuery
            ? <HighlightText text={article.title} query={searchQuery} />
            : article.title
          }
        </p>
        {isSearchMode && article.snippet && (
          <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
            <HighlightText text={article.snippet} query={searchQuery ?? ""} />
          </p>
        )}
        <p className="text-[11px] text-muted-foreground mt-0.5">oleh {article.author_name ?? "Kontributor"}</p>
        <button
          onClick={() => onRead(article.id)}
          className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <BookOpen className="h-3 w-3" />
          Baca artikel
        </button>
      </div>
      <button
        onClick={() => onVote(article.id)}
        disabled={voting}
        className={`shrink-0 flex flex-col items-center gap-1 rounded-xl border px-3 py-2 transition-colors ${
          article.user_voted
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border bg-secondary text-muted-foreground hover:border-primary/30 hover:text-primary"
        } disabled:opacity-50`}
        title={article.user_voted ? "Batalkan upvote" : "Upvote artikel ini"}
      >
        <ThumbsUp className={`h-4 w-4 ${article.user_voted ? "fill-primary" : ""}`} />
        <span className="text-xs font-bold leading-none">{article.vote_count}</span>
      </button>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */
export default function LeaderboardPage() {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [period, setPeriod] = useState<LeaderboardPeriod>("all");

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [searchResults, setSearchResults] = useState<Article[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (p: LeaderboardPeriod = period) => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/leaderboard?period=${p}`);
      setContributors(data.contributors ?? []);
      setArticles(data.articles ?? []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(period); }, [period]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (!debouncedSearch) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const params = new URLSearchParams({ q: debouncedSearch });
    if (activeCategory) params.set("category", activeCategory);
    apiFetch(`/api/articles/search?${params}`)
      .then(data => {
        if (!cancelled) setSearchResults(data.articles ?? []);
      })
      .catch(e => { if (!cancelled) toast.error(e.message); })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [debouncedSearch, activeCategory]);

  const handleCategoryChange = (cat: string) => {
    setActiveCategory(prev => prev === cat ? "" : cat);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setSearchResults(null);
    searchInputRef.current?.focus();
  };

  const visibleArticles = searchResults !== null
    ? searchResults
    : activeCategory
      ? articles.filter(a => a.category === activeCategory)
      : articles;

  const isSearchMode = debouncedSearch.length > 0;

  const handleArticleVote = async (articleId: string) => {
    if (votingId) return;
    setVotingId(articleId);

    const updateList = (list: Article[]) =>
      list.map(a =>
        a.id === articleId
          ? { ...a, user_voted: !a.user_voted, vote_count: a.user_voted ? a.vote_count - 1 : a.vote_count + 1 }
          : a
      );

    const prevArticles = articles.find(a => a.id === articleId);
    const prevSearch = searchResults?.find(a => a.id === articleId);

    setArticles(updateList);
    if (searchResults) setSearchResults(updateList);

    try {
      const res = await apiFetch(`/api/articles/${articleId}/vote`, { method: "POST" });
      const sync = (list: Article[]) =>
        list.map(a => a.id === articleId ? { ...a, user_voted: res.voted, vote_count: res.vote_count } : a);
      setArticles(sync);
      if (searchResults) setSearchResults(sync);
    } catch (e: any) {
      toast.error(e.message);
      if (prevArticles) setArticles(l => l.map(a => a.id === articleId ? prevArticles : a));
      if (prevSearch && searchResults) setSearchResults(l => l!.map(a => a.id === articleId ? prevSearch : a));
    } finally {
      setVotingId(null);
    }
  };

  const handleVoteFromModal = async (articleId: string) => {
    await handleArticleVote(articleId);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-4 md:px-8 md:py-5">
        <div className="md:max-w-5xl md:mx-auto flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg md:text-xl font-bold text-foreground flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-400" />
              Leaderboard
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
              Kontributor terbaik dan artikel terpopuler di AINA
            </p>
          </div>
          <button
            onClick={() => load(period)}
            disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <Tabs defaultValue="contributors" className="flex h-full flex-col">
          <TabsList className="mx-4 mt-4 md:mx-auto md:mt-6 shrink-0 grid w-auto grid-cols-2 max-w-xs md:max-w-sm">
            <TabsTrigger value="contributors" className="gap-1.5 text-xs md:text-sm">
              <Medal className="h-3.5 w-3.5" />
              Top Kontributor
            </TabsTrigger>
            <TabsTrigger value="articles" className="gap-1.5 text-xs md:text-sm">
              <BookOpen className="h-3.5 w-3.5" />
              Artikel Terpopuler
            </TabsTrigger>
          </TabsList>

          {/* Contributors */}
          <TabsContent value="contributors" className="flex-1 min-h-0 flex flex-col mt-0 data-[state=inactive]:hidden">
            <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-8 pb-6 pt-4">
              <div className="md:max-w-5xl md:mx-auto">
                {/* Period selector */}
                <div role="radiogroup" aria-label="Periode peringkat" className="mb-4 inline-flex rounded-xl border border-border bg-card p-1">
                  {(["week", "month", "all"] as LeaderboardPeriod[]).map((p) => (
                    <button
                      key={p}
                      role="radio"
                      aria-checked={period === p}
                      onClick={() => setPeriod(p)}
                      disabled={loading}
                      className={`rounded-lg px-3 py-1.5 text-xs md:text-sm font-medium transition-all disabled:opacity-50 ${
                        period === p
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {PERIOD_LABEL[p]}
                    </button>
                  ))}
                </div>

              {loading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-card" />)}
                </div>
              ) : contributors.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                  <Trophy className="mb-3 h-12 w-12 text-muted-foreground/30" />
                  <p className="font-medium text-foreground">
                    {period === "all" ? "Belum ada kontributor" : `Belum ada poin misi di ${PERIOD_LABEL[period].toLowerCase()}`}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {period === "all"
                      ? "Jadilah kontributor pertama dan tulis artikel!"
                      : "Selesaikan misi harian untuk masuk ke peringkat ini."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground pb-1">
                    {contributors.length} kontributor · {PERIOD_LABEL[period]}
                  </p>
                  {contributors.map((c, i) => (
                    <ContributorCard key={c.user_id} contributor={c} rank={i + 1} period={period} />
                  ))}
                </div>
              )}
              </div>
            </div>
          </TabsContent>

          {/* Articles */}
          <TabsContent value="articles" className="flex-1 min-h-0 flex flex-col mt-0 data-[state=inactive]:hidden">
            {/* Search bar */}
            <div className="shrink-0 px-4 pt-4 md:px-8 space-y-3">
              <div className="md:max-w-5xl md:mx-auto space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Cari judul atau isi artikel..."
                  className="w-full rounded-xl border border-border bg-card pl-9 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-colors"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
                )}
                {searchQuery && !searching && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Category chips */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {CATEGORIES.map(cat => {
                  const isActive = activeCategory === cat.value;
                  const activeStyle = cat.value
                    ? CATEGORY_CHIP_ACTIVE[cat.value]
                    : "bg-primary/15 text-primary border-primary/30";
                  return (
                    <button
                      key={cat.value}
                      onClick={() => handleCategoryChange(cat.value)}
                      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                        isActive
                          ? activeStyle
                          : "border-border bg-secondary text-muted-foreground hover:border-border hover:text-foreground"
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
              </div>
            </div>

            {/* Article list */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-8 pb-6 pt-3">
              <div className="md:max-w-5xl md:mx-auto">
              {loading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-card" />)}
                </div>
              ) : isSearchMode && searching ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-card" />)}
                </div>
              ) : visibleArticles.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                  {isSearchMode ? (
                    <>
                      <Search className="mb-3 h-10 w-10 text-muted-foreground/30" />
                      <p className="font-medium text-foreground">Tidak ada hasil</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Coba kata kunci lain atau ganti kategori filter
                      </p>
                    </>
                  ) : (
                    <>
                      <BookOpen className="mb-3 h-12 w-12 text-muted-foreground/30" />
                      <p className="font-medium text-foreground">
                        {activeCategory ? `Belum ada artikel "${activeCategory}"` : "Belum ada artikel"}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {activeCategory
                          ? "Coba kategori lain atau cari dengan kata kunci"
                          : "Artikel yang disetujui akan muncul di sini untuk diupvote."}
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground pb-1">
                    {isSearchMode
                      ? `${visibleArticles.length} hasil untuk "${debouncedSearch}"${activeCategory ? ` · ${activeCategory}` : ""}`
                      : `${visibleArticles.length} artikel${activeCategory ? ` · ${activeCategory}` : ""} · Klik 👍 untuk upvote`
                    }
                  </p>
                  {visibleArticles.map((a, i) => (
                    <ArticleCard
                      key={a.id}
                      article={a}
                      rank={i + 1}
                      onVote={handleArticleVote}
                      voting={votingId === a.id}
                      onRead={setReadingId}
                      searchQuery={isSearchMode ? debouncedSearch : undefined}
                    />
                  ))}
                </div>
              )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Article Detail Modal */}
      {readingId && (
        <ArticleDetailModal
          articleId={readingId}
          onClose={() => setReadingId(null)}
          onVote={handleVoteFromModal}
          votingId={votingId}
        />
      )}
    </div>
  );
}
