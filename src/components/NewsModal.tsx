import { useState, useEffect, useRef } from "react";
import {
  Newspaper, Clock, ExternalLink, Pin, X, MessageSquare, Send,
  RefreshCw, LogIn, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface NewsItem {
  id: string; title: string; content: string; category: string;
  image_url?: string; source_url?: string; source_name?: string;
  is_pinned: boolean; published_at: string;
}

interface Comment {
  id: string; user_id: string; user_name: string; content: string; created_at: string;
}

export const CAT_META: Record<string, { label: string; color: string; dot: string; bg: string }> = {
  breaking_news:   { label: "Breaking",      color: "text-red-500",    dot: "bg-red-500",    bg: "bg-red-500/10 border border-red-500/20"    },
  administrasi:    { label: "Administrasi",  color: "text-blue-500",   dot: "bg-blue-500",   bg: "bg-blue-500/10 border border-blue-500/20"   },
  kuliner:         { label: "Kuliner",        color: "text-orange-500", dot: "bg-orange-500", bg: "bg-orange-500/10 border border-orange-500/20" },
  kehidupan_mesir: { label: "Kehidupan",     color: "text-green-500",  dot: "bg-green-500",  bg: "bg-green-500/10 border border-green-500/20"  },
  transportasi:    { label: "Transportasi",  color: "text-cyan-500",   dot: "bg-cyan-500",   bg: "bg-cyan-500/10 border border-cyan-500/20"   },
  aigypt:          { label: "AIGYPT",         color: "text-violet-500", dot: "bg-violet-500", bg: "bg-violet-500/10 border border-violet-500/20" },
};

export function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)     return "Baru saja";
  if (diff < 3600)   return `${Math.floor(diff / 60)}m lalu`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}j lalu`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}h lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function fullDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

export function NewsModal({ item, onClose }: { item: NewsItem; onClose: () => void }) {
  const meta = CAT_META[item.category] ?? { label: item.category, color: "text-muted-foreground", dot: "bg-muted-foreground", bg: "bg-muted" };

  const [comments, setComments]         = useState<Comment[]>([]);
  const [loadingCmts, setLoadingCmts]   = useState(true);
  const [draft, setDraft]               = useState("");
  const [posting, setPosting]           = useState(false);
  const [cmtError, setCmtError]         = useState("");
  const [session, setSession]           = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setCurrentUserId(session?.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    fetch(`/api/news/${item.id}/comments`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.comments) setComments(d.comments); })
      .catch(() => {})
      .finally(() => setLoadingCmts(false));
  }, [item.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  async function postComment() {
    const text = draft.trim();
    if (!text || !session) return;
    setPosting(true); setCmtError("");
    try {
      const res = await fetch(`/api/news/${item.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();
      if (!res.ok) { setCmtError(data.error || "Gagal mengirim komentar"); return; }
      setComments(prev => [...prev, data.comment]);
      setDraft("");
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {
      setCmtError("Koneksi gagal. Coba lagi.");
    } finally {
      setPosting(false);
    }
  }

  async function deleteComment(cid: string) {
    if (!session) return;
    const res = await fetch(`/api/news/${item.id}/comments/${cid}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${session.access_token}` },
    });
    if (res.ok) setComments(prev => prev.filter(c => c.id !== cid));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-card border border-border/60 shadow-2xl overflow-hidden">

        {/* Cover image */}
        {item.image_url && (
          <div className="w-full h-44 sm:h-52 shrink-0 overflow-hidden">
            <img
              src={item.image_url}
              alt={item.title}
              className="w-full h-full object-cover"
              onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
            />
          </div>
        )}

        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-4 pb-3 shrink-0 border-b border-border/30">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              {item.is_pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 ${meta.bg} ${meta.color}`}>
                {meta.label}
              </span>
              <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" /> {timeAgo(item.published_at)}
              </span>
            </div>
            <h2 className="text-base font-bold text-foreground leading-snug">{item.title}</h2>
            {item.source_name && (
              <p className="text-[11px] text-muted-foreground mt-0.5">Sumber: {item.source_name}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Article content */}
          <div className="px-5 pt-4 pb-5 space-y-3">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{fullDate(item.published_at)}</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{item.content}</p>
            {item.source_url && (
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink className="h-3 w-3" /> Baca selengkapnya
              </a>
            )}
          </div>

          {/* Divider */}
          <div className="mx-5 border-t border-border/30" />

          {/* Comments */}
          <div className="px-5 pt-4 pb-8 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MessageSquare className="h-4 w-4 text-primary" />
              <span>Komentar</span>
              {comments.length > 0 && (
                <span className="text-xs text-muted-foreground font-normal">({comments.length})</span>
              )}
            </div>

            {/* Comment list */}
            {loadingCmts ? (
              <div className="flex justify-center py-4">
                <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Belum ada komentar. Jadilah yang pertama!
              </p>
            ) : (
              <div className="space-y-4">
                {comments.map(c => (
                  <div key={c.id} className="flex gap-2.5">
                    <div className="shrink-0 h-7 w-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                      {getInitials(c.user_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold text-foreground">{c.user_name}</span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</span>
                        {currentUserId === c.user_id && (
                          <button
                            onClick={() => deleteComment(c.id)}
                            className="ml-auto text-muted-foreground/40 hover:text-red-500 transition-colors p-0.5"
                            title="Hapus komentar"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{c.content}</p>
                    </div>
                  </div>
                ))}
                <div ref={commentsEndRef} />
              </div>
            )}

            {/* Post comment */}
            {session ? (
              <div className="space-y-2">
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postComment(); }
                  }}
                  placeholder="Tulis komentar... (Enter untuk kirim)"
                  rows={2}
                  maxLength={1000}
                  className="w-full resize-none rounded-xl border border-border/60 bg-secondary/30 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors"
                />
                {cmtError && <p className="text-xs text-red-500">{cmtError}</p>}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{draft.length}/1000</span>
                  <button
                    onClick={postComment}
                    disabled={!draft.trim() || posting}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {posting
                      ? <RefreshCw className="h-3 w-3 animate-spin" />
                      : <Send className="h-3 w-3" />
                    }
                    Kirim
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-secondary/20 px-4 py-3">
                <LogIn className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground">
                  <button
                    onClick={() => { onClose(); setTimeout(() => (document.getElementById("navbar-login-btn") as HTMLButtonElement)?.click(), 100); }}
                    className="text-primary hover:underline"
                  >
                    Login
                  </button>
                  {" "}untuk ikut berkomentar.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default NewsModal;
