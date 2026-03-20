import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ThumbsUp, Trophy, Medal, BookOpen, RefreshCw } from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */
interface Contributor {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  contribution_count: number;
  role: string;
}

interface Article {
  id: string;
  title: string;
  category: string;
  article_type: string;
  vote_count: number;
  created_at: string;
  author_name: string | null;
  user_voted: boolean;
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

const CATEGORY_COLORS: Record<string, string> = {
  Administrasi:     "bg-violet-500/15 text-violet-400",
  Akademik:         "bg-blue-500/15 text-blue-400",
  "Kehidupan Mesir":"bg-green-500/15 text-green-400",
  Transport:        "bg-yellow-500/15 text-yellow-400",
  "Tempat Tinggal": "bg-orange-500/15 text-orange-400",
  Kuliner:          "bg-pink-500/15 text-pink-400",
};

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

/* ─── Contributor Card ───────────────────────────────── */
function ContributorCard({ contributor, rank }: { contributor: Contributor; rank: number }) {
  const roleInfo = ROLE_LABEL[contributor.role] ?? ROLE_LABEL.user;
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
        <p className="text-lg font-bold text-primary">{contributor.contribution_count}</p>
        <p className="text-[11px] text-muted-foreground">artikel</p>
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
}: {
  article: Article;
  rank: number;
  onVote: (id: string) => void;
  voting: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-4 transition-colors ${rank <= 3 ? "border-primary/20 bg-primary/5" : "border-border bg-card"}`}>
      <RankBadge rank={rank} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_COLORS[article.category] ?? "bg-secondary text-muted-foreground"}`}>
            {article.category}
          </span>
        </div>
        <p className="font-semibold text-sm text-foreground line-clamp-2 leading-snug">{article.title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">oleh {article.author_name ?? "Kontributor"}</p>
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/leaderboard");
      setContributors(data.contributors ?? []);
      setArticles(data.articles ?? []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleArticleVote = async (articleId: string) => {
    if (votingId) return;
    setVotingId(articleId);

    const prev = articles.find(a => a.id === articleId);
    if (!prev) { setVotingId(null); return; }

    setArticles(list =>
      list.map(a =>
        a.id === articleId
          ? { ...a, user_voted: !a.user_voted, vote_count: a.user_voted ? a.vote_count - 1 : a.vote_count + 1 }
          : a
      )
    );

    try {
      const res = await apiFetch(`/api/articles/${articleId}/vote`, { method: "POST" });
      setArticles(list =>
        list.map(a => a.id === articleId ? { ...a, user_voted: res.voted, vote_count: res.vote_count } : a)
      );
    } catch (e: any) {
      toast.error(e.message);
      setArticles(list => list.map(a => a.id === articleId ? prev : a));
    } finally {
      setVotingId(null);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-4 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-400" />
              Leaderboard
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Kontributor terbaik dan artikel terpopuler di AINA
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="contributors" className="flex h-full flex-col">
          <TabsList className="mx-4 mt-4 md:mx-6 shrink-0 grid w-auto grid-cols-2 max-w-xs">
            <TabsTrigger value="contributors" className="gap-1.5 text-xs">
              <Medal className="h-3.5 w-3.5" />
              Top Kontributor
            </TabsTrigger>
            <TabsTrigger value="articles" className="gap-1.5 text-xs">
              <BookOpen className="h-3.5 w-3.5" />
              Artikel Terpopuler
            </TabsTrigger>
          </TabsList>

          {/* Contributors */}
          <TabsContent value="contributors" className="flex-1 overflow-y-auto px-4 pb-6 pt-4 md:px-6">
            {loading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-card" />)}
              </div>
            ) : contributors.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <Trophy className="mb-3 h-12 w-12 text-muted-foreground/30" />
                <p className="font-medium text-foreground">Belum ada kontributor</p>
                <p className="mt-1 text-sm text-muted-foreground">Jadilah kontributor pertama dan tulis artikel!</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground pb-1">{contributors.length} kontributor</p>
                {contributors.map((c, i) => (
                  <ContributorCard key={c.user_id} contributor={c} rank={i + 1} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Articles */}
          <TabsContent value="articles" className="flex-1 overflow-y-auto px-4 pb-6 pt-4 md:px-6">
            {loading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-card" />)}
              </div>
            ) : articles.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <BookOpen className="mb-3 h-12 w-12 text-muted-foreground/30" />
                <p className="font-medium text-foreground">Belum ada artikel</p>
                <p className="mt-1 text-sm text-muted-foreground">Artikel yang disetujui akan muncul di sini untuk diupvote.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground pb-1">{articles.length} artikel · Klik 👍 untuk upvote</p>
                {articles.map((a, i) => (
                  <ArticleCard
                    key={a.id}
                    article={a}
                    rank={i + 1}
                    onVote={handleArticleVote}
                    voting={votingId === a.id}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
