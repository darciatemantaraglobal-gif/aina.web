import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  MessageSquare, Plus, Search, Send, Trash2, RefreshCw,
  BookMarked, ArrowLeft, CheckCircle, Clock, MessageCircle, ThumbsUp,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */
interface Thread {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: string;
  reply_count: number;
  vote_count: number;
  user_voted: boolean;
  promoted_to_kb: boolean;
  created_at: string;
  updated_at: string;
  author_name: string | null;
  author_avatar: string | null;
}

interface Reply {
  id: string;
  thread_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author_name: string | null;
  author_avatar: string | null;
}

interface ThreadDetail extends Thread {
  replies: Reply[];
}

/* ─── Constants ──────────────────────────────────────── */
const CATEGORIES = ["Administrasi", "Akademik", "Kehidupan Mesir", "Transport", "Tempat Tinggal", "Kuliner"];

const CATEGORY_COLORS: Record<string, string> = {
  Administrasi: "bg-violet-500/15 text-violet-400",
  Akademik: "bg-blue-500/15 text-blue-400",
  "Kehidupan Mesir": "bg-green-500/15 text-green-400",
  Transport: "bg-yellow-500/15 text-yellow-400",
  "Tempat Tinggal": "bg-orange-500/15 text-orange-400",
  Kuliner: "bg-pink-500/15 text-pink-400",
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const fmtTime = (d: string) =>
  new Date(d).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/* ─── Helpers ────────────────────────────────────────── */
async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? `Bearer ${session.access_token}` : "";
}

async function threadsFetch(path: string, options: RequestInit = {}) {
  const auth = await getAuthHeader();
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: auth, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

function Initials({ name }: { name: string | null }) {
  const letters = (name ?? "?").split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-purple text-xs font-bold text-white">
      {letters}
    </div>
  );
}

function AvatarDisplay({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  const [imgError, setImgError] = useState(false);
  const letters = (name ?? "?").split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
  if (avatarUrl && !imgError) {
    return (
      <img src={avatarUrl} alt={name ?? "avatar"}
        className="h-8 w-8 shrink-0 rounded-xl object-cover"
        onError={() => setImgError(true)} />
    );
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-purple text-xs font-bold text-white">
      {letters}
    </div>
  );
}

/* ─── Create Thread Dialog ───────────────────────────── */
function CreateThreadDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (thread: Thread) => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setTitle(""); setContent(""); setCategory(""); }
  }, [open]);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim() || !category) {
      toast.error("Semua field harus diisi");
      return;
    }
    setSaving(true);
    try {
      const data = await threadsFetch("/api/threads", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), content: content.trim(), category }),
      });
      toast.success("Thread berhasil dibuat!");
      onCreated(data);
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Buat Thread Baru</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Judul</label>
            <Input
              placeholder="Tulis judul threadmu..."
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="bg-secondary"
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Kategori</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-secondary">
                <SelectValue placeholder="Pilih kategori" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Isi</label>
            <Textarea
              placeholder="Bagikan informasi, pengalaman, atau pertanyaanmu..."
              value={content}
              onChange={e => setContent(e.target.value)}
              className="min-h-[140px] bg-secondary resize-none"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1" disabled={saving}>
              Batal
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 bg-gradient-purple text-primary-foreground hover:opacity-90"
            >
              {saving ? "Memposting..." : "Post Thread"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Thread Detail Dialog ───────────────────────────── */
function ThreadDetailDialog({ threadId, currentUserId, isAdmin, onClose, onDeleted, onPromoted, onVoteChange }: {
  threadId: string;
  currentUserId: string | undefined;
  isAdmin: boolean;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onPromoted: (id: string) => void;
  onVoteChange: (id: string, voted: boolean, voteCount: number) => void;
}) {
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyContent, setReplyContent] = useState("");
  const [sending, setSending] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [voting, setVoting] = useState(false);
  const [localVoted, setLocalVoted] = useState(false);
  const [localVoteCount, setLocalVoteCount] = useState(0);
  const repliesEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await threadsFetch(`/api/threads/${threadId}`);
      setThread(data);
    } catch (e: any) {
      toast.error(e.message);
      onClose();
    } finally {
      setLoading(false);
    }
  }, [threadId, onClose]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (thread) {
      setLocalVoted(thread.user_voted ?? false);
      setLocalVoteCount(thread.vote_count ?? 0);
    }
  }, [thread]);

  useEffect(() => {
    if (!loading) {
      repliesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [loading, thread?.replies?.length]);

  const handleVote = async () => {
    if (voting || !thread) return;
    setVoting(true);
    const prevVoted = localVoted;
    const prevCount = localVoteCount;
    setLocalVoted(!localVoted);
    setLocalVoteCount(localVoted ? localVoteCount - 1 : localVoteCount + 1);
    try {
      const res = await threadsFetch(`/api/threads/${threadId}/vote`, { method: "POST" });
      setLocalVoted(res.voted);
      setLocalVoteCount(res.vote_count);
      onVoteChange(threadId, res.voted, res.vote_count);
    } catch (e: any) {
      toast.error(e.message);
      setLocalVoted(prevVoted);
      setLocalVoteCount(prevCount);
    } finally {
      setVoting(false);
    }
  };

  const handleReply = async () => {
    if (!replyContent.trim()) return;
    setSending(true);
    try {
      await threadsFetch(`/api/threads/${threadId}/replies`, {
        method: "POST",
        body: JSON.stringify({ content: replyContent.trim() }),
      });
      setReplyContent("");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    if (!confirm("Hapus balasan ini?")) return;
    try {
      await threadsFetch(`/api/threads/${threadId}/replies/${replyId}`, { method: "DELETE" });
      setThread(prev => prev ? { ...prev, replies: prev.replies.filter(r => r.id !== replyId) } : prev);
      toast.success("Balasan dihapus");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDeleteThread = async () => {
    if (!confirm("Hapus thread ini? Semua balasan juga akan terhapus.")) return;
    try {
      await threadsFetch(`/api/threads/${threadId}`, { method: "DELETE" });
      toast.success("Thread dihapus");
      onDeleted(threadId);
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handlePromote = async () => {
    if (!confirm("Promosikan thread ini ke Knowledge Base (status pending, menunggu persetujuan admin)?")) return;
    setPromoting(true);
    try {
      await threadsFetch(`/api/admin/threads/${threadId}/promote`, { method: "POST" });
      toast.success("Thread berhasil dipromosikan ke Knowledge Base! Admin perlu menyetujuinya di tab Knowledge Base.");
      onPromoted(threadId);
      setThread(prev => prev ? { ...prev, promoted_to_kb: true } : prev);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPromoting(false);
    }
  };

  const canDeleteThread = thread && (thread.user_id === currentUserId || isAdmin);

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 p-0 overflow-hidden">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          </div>
        ) : thread ? (
          <>
            {/* Header */}
            <div className="shrink-0 border-b border-border p-5">
              <DialogHeader>
                <DialogTitle className="sr-only">Thread Detail</DialogTitle>
              </DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CATEGORY_COLORS[thread.category] ?? "bg-secondary text-muted-foreground"}`}>
                      {thread.category}
                    </span>
                    {thread.promoted_to_kb && (
                      <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-medium text-green-400">
                        <CheckCircle className="h-3 w-3" /> Dipromosikan ke KB
                      </span>
                    )}
                  </div>
                  <h2 className="font-display text-base font-bold text-foreground">{thread.title}</h2>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <AvatarDisplay name={thread.author_name} avatarUrl={thread.author_avatar} />
                    <span className="font-medium text-foreground/80">{thread.author_name ?? "Pengguna"}</span>
                    <span>·</span>
                    <span>{fmtDate(thread.created_at)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {/* Upvote button */}
                  <button
                    onClick={handleVote}
                    disabled={voting}
                    className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                      localVoted
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-secondary text-muted-foreground hover:border-primary/30 hover:text-primary"
                    }`}
                    title={localVoted ? "Batalkan upvote" : "Upvote thread ini"}
                  >
                    <ThumbsUp className={`h-3.5 w-3.5 ${localVoted ? "fill-primary" : ""}`} />
                    <span>{localVoteCount}</span>
                  </button>

                  {isAdmin && !thread.promoted_to_kb && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 border-green-500/30 text-green-400 hover:bg-green-500/10 text-xs"
                      onClick={handlePromote}
                      disabled={promoting}
                    >
                      <BookMarked className="h-3.5 w-3.5" />
                      {promoting ? "..." : "Promosikan ke KB"}
                    </Button>
                  )}
                  {canDeleteThread && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                      onClick={handleDeleteThread}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
                {thread.content}
              </p>
            </div>

            {/* Replies */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {thread.replies.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <MessageCircle className="mb-2 h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Belum ada balasan. Jadilah yang pertama!</p>
                </div>
              ) : (
                thread.replies.map(reply => (
                  <div key={reply.id} className="flex gap-3">
                    <AvatarDisplay name={reply.author_name} avatarUrl={reply.author_avatar} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">{reply.author_name ?? "Pengguna"}</span>
                          <span className="text-xs text-muted-foreground/60">{fmtTime(reply.created_at)}</span>
                        </div>
                        {(reply.user_id === currentUserId || isAdmin) && (
                          <button
                            onClick={() => handleDeleteReply(reply.id)}
                            className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
                        {reply.content}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={repliesEndRef} />
            </div>

            {/* Reply Input */}
            <div className="shrink-0 border-t border-border p-4">
              <div className="flex gap-2">
                <Textarea
                  placeholder="Tulis balasanmu..."
                  value={replyContent}
                  onChange={e => setReplyContent(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleReply(); }
                  }}
                  className="min-h-[60px] max-h-[120px] resize-none bg-secondary text-sm"
                  rows={2}
                />
                <Button
                  onClick={handleReply}
                  disabled={sending || !replyContent.trim()}
                  className="h-auto self-end bg-gradient-purple px-3 text-primary-foreground hover:opacity-90"
                >
                  {sending
                    ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    : <Send className="h-4 w-4" />
                  }
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">Enter untuk kirim · Shift+Enter untuk baris baru</p>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Page ──────────────────────────────────────── */
interface ThreadsPageProps {
  userId?: string;
  isAdmin?: boolean;
}

export default function ThreadsPage({ userId, isAdmin = false }: ThreadsPageProps) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [votingId, setVotingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      const data = await threadsFetch(`/api/threads?${params}`);
      setThreads(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = threads.filter(t =>
    !search ||
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.content.toLowerCase().includes(search.toLowerCase()) ||
    (t.author_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const handleCreated = (thread: Thread) => {
    setThreads(prev => [thread, ...prev]);
  };

  const handleDeleted = (id: string) => {
    setThreads(prev => prev.filter(t => t.id !== id));
  };

  const handlePromoted = (id: string) => {
    setThreads(prev => prev.map(t => t.id === id ? { ...t, promoted_to_kb: true } : t));
  };

  const handleVoteChange = useCallback((id: string, voted: boolean, voteCount: number) => {
    setThreads(prev => prev.map(t => t.id === id ? { ...t, user_voted: voted, vote_count: voteCount } : t));
  }, []);

  const handleVote = async (e: { stopPropagation(): void }, threadId: string) => {
    e.stopPropagation();
    if (votingId) return;
    setVotingId(threadId);
    const prev = threads.find(t => t.id === threadId);
    if (!prev) { setVotingId(null); return; }
    setThreads(list =>
      list.map(t => t.id === threadId
        ? { ...t, user_voted: !t.user_voted, vote_count: t.user_voted ? t.vote_count - 1 : t.vote_count + 1 }
        : t
      )
    );
    try {
      const res = await threadsFetch(`/api/threads/${threadId}/vote`, { method: "POST" });
      setThreads(list => list.map(t => t.id === threadId ? { ...t, user_voted: res.voted, vote_count: res.vote_count } : t));
    } catch (e: any) {
      toast.error(e.message);
      setThreads(list => list.map(t => t.id === threadId ? prev : t));
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
            <h2 className="font-display text-lg font-bold text-foreground">Threads</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sharing informasi, pengalaman, dan tips seputar kehidupan di Mesir
            </p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            className="shrink-0 gap-1.5 bg-gradient-purple text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Buat Thread
          </Button>
        </div>

        {/* Search */}
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari thread..."
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>

        {/* Category filter */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          <button
            onClick={() => setCategoryFilter("all")}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              categoryFilter === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Semua
          </button>
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                categoryFilter === c
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-card" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <MessageSquare className="mb-3 h-12 w-12 text-muted-foreground/30" />
            <p className="font-medium text-foreground">
              {search ? "Tidak ada thread yang cocok" : "Belum ada thread"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search ? "Coba kata kunci lain" : "Jadilah yang pertama berbagi!"}
            </p>
            {!search && (
              <Button
                onClick={() => setCreateOpen(true)}
                size="sm"
                className="mt-4 gap-1.5 bg-gradient-purple text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> Buat Thread Pertama
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1">
              <p className="text-xs text-muted-foreground">{filtered.length} thread</p>
              <button
                onClick={load}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            {filtered.map(thread => (
              <div
                key={thread.id}
                onClick={() => setSelectedThreadId(thread.id)}
                className="flex w-full items-start gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/30 hover:bg-card/80 cursor-pointer"
              >
                {/* Left: avatar */}
                <AvatarDisplay name={thread.author_name} avatarUrl={thread.author_avatar} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_COLORS[thread.category] ?? "bg-secondary text-muted-foreground"}`}>
                      {thread.category}
                    </span>
                    {thread.promoted_to_kb && (
                      <span className="flex items-center gap-0.5 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-400">
                        <CheckCircle className="h-2.5 w-2.5" /> KB
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-sm text-foreground line-clamp-1">{thread.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{thread.content}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/70">{thread.author_name ?? "Pengguna"}</span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" />
                      {thread.reply_count}
                    </span>
                    <button
                      onClick={e => handleVote(e, thread.id)}
                      disabled={votingId === thread.id}
                      className={`flex items-center gap-1 transition-colors disabled:opacity-50 ${
                        thread.user_voted ? "text-primary" : "hover:text-primary"
                      }`}
                      title={thread.user_voted ? "Batalkan upvote" : "Upvote thread ini"}
                    >
                      <ThumbsUp className={`h-3 w-3 ${thread.user_voted ? "fill-primary" : ""}`} />
                      {thread.vote_count ?? 0}
                    </button>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {fmtDate(thread.updated_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateThreadDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />

      {selectedThreadId && (
        <ThreadDetailDialog
          threadId={selectedThreadId}
          currentUserId={userId}
          isAdmin={isAdmin}
          onClose={() => setSelectedThreadId(null)}
          onDeleted={handleDeleted}
          onPromoted={handlePromoted}
          onVoteChange={handleVoteChange}
        />
      )}
    </div>
  );
}
