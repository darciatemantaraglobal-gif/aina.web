import { useState, useEffect, useRef } from "react";
import {
  Newspaper, Clock, ExternalLink, Pin, X, MessageSquare, Send,
  RefreshCw, LogIn, Trash2, ZoomIn, Share2, Copy, Check, Loader2, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

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

const MD_COMPONENTS = {
  h2: ({ children }: any) => <h2 className="text-sm font-bold text-foreground mt-4 mb-1.5">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-semibold text-foreground mt-3 mb-1">{children}</h3>,
  p: ({ children }: any) => <p className="text-sm text-muted-foreground leading-relaxed mb-2">{children}</p>,
  strong: ({ children }: any) => <strong className="font-semibold text-foreground">{children}</strong>,
  ul: ({ children }: any) => <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 mb-2 pl-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 mb-2 pl-1">{children}</ol>,
  li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
  hr: () => <hr className="border-border/40 my-3" />,
  a: ({ href, children }: any) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">{children}</a>,
  blockquote: ({ children }: any) => <blockquote className="border-l-2 border-primary/40 pl-3 italic text-muted-foreground my-2">{children}</blockquote>,
};

export function NewsModal({ item, onClose }: { item: NewsItem; onClose: () => void }) {
  const meta = CAT_META[item.category] ?? { label: item.category, color: "text-muted-foreground", dot: "bg-muted-foreground", bg: "bg-muted" };

  const [comments, setComments]         = useState<Comment[]>([]);
  const [loadingCmts, setLoadingCmts]   = useState(true);
  const [draft, setDraft]               = useState("");
  const [posting, setPosting]           = useState(false);
  const [cmtError, setCmtError]         = useState("");
  const [session, setSession]           = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [imgExpanded, setImgExpanded]   = useState(false);
  const [showSharePreview, setShowSharePreview] = useState(false);
  const [shareCaption, setShareCaption] = useState<string | null>(null);
  const [captionLoading, setCaptionLoading] = useState(false);
  const [copied, setCopied]             = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const sharePageUrl = `${window.location.origin}/share/news/${item.id}`;

  async function fetchCaption(force = false) {
    if (shareCaption && !force) return;
    setCaptionLoading(true);
    try {
      const url = force ? `/api/news/${item.id}/share-caption?force=true` : `/api/news/${item.id}/share-caption`;
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (data.caption) setShareCaption(data.caption);
    } catch { /* silent */ } finally {
      setCaptionLoading(false);
    }
  }

  async function handleShare() {
    setShowSharePreview(true);
    fetchCaption();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(sharePageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  function shareWhatsApp() {
    const caption = shareCaption ? `${shareCaption}\n\n` : `${item.title}\n\n`;
    const msg = encodeURIComponent(`${caption}${sharePageUrl}`);
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  }

  function shareTelegram() {
    const caption = shareCaption ? shareCaption : item.title;
    const msg = encodeURIComponent(`${caption}\n\n${sharePageUrl}`);
    window.open(`https://t.me/share/url?url=${encodeURIComponent(sharePageUrl)}&text=${encodeURIComponent(caption)}`, "_blank");
  }

  function shareTwitter() {
    const text = shareCaption ? shareCaption.slice(0, 240) : item.title;
    const msg = encodeURIComponent(`${text} ${sharePageUrl}`);
    window.open(`https://twitter.com/intent/tweet?text=${msg}`, "_blank");
  }

  async function shareNative() {
    const caption = shareCaption ? shareCaption : item.title;
    try {
      await navigator.share({ title: item.title, text: `${caption}\n\n`, url: sharePageUrl });
    } catch { /* user cancelled */ }
  }

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
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showSharePreview) setShowSharePreview(false);
        else onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, showSharePreview]);

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

        {/* Cover image — clickable to expand */}
        {item.image_url && (
          <>
            <div
              className="relative w-full shrink-0 overflow-hidden cursor-zoom-in group"
              style={{ maxHeight: imgExpanded ? "80vh" : "14rem" }}
              onClick={() => setImgExpanded(v => !v)}
            >
              <img
                src={item.image_url}
                alt={item.title}
                className={`w-full transition-all duration-300 ${imgExpanded ? "object-contain bg-black/90" : "h-56 sm:h-64 object-cover"}`}
                onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
              />
              {!imgExpanded && (
                <div className="absolute inset-0 flex items-end justify-end p-2 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white">
                    <ZoomIn className="h-2.5 w-2.5" /> Perbesar
                  </div>
                </div>
              )}
              {imgExpanded && (
                <div className="absolute top-2 right-2">
                  <div className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white">
                    <X className="h-2.5 w-2.5" /> Kecilkan
                  </div>
                </div>
              )}
            </div>
          </>
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
          {/* Share button */}
          <button
            onClick={handleShare}
            title="Bagikan berita"
            className="shrink-0 rounded-full p-1.5 hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Share2 className="h-4 w-4" />
          </button>

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
            <div className="text-sm text-muted-foreground">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={MD_COMPONENTS}
              >
                {item.content}
              </ReactMarkdown>
            </div>
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

      {/* ── Share Preview Sheet ─────────────────────────────────── */}
      {showSharePreview && (
        <div
          className="absolute inset-0 z-30 flex items-end justify-center rounded-t-2xl sm:rounded-2xl overflow-hidden"
          onClick={e => { if (e.target === e.currentTarget) setShowSharePreview(false); }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSharePreview(false)} />
          <div className="relative z-10 w-full rounded-t-2xl sm:rounded-2xl bg-card border-t sm:border border-border shadow-2xl animate-in slide-in-from-bottom-8 duration-300">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-border/70" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-border/40">
              <div className="flex items-center gap-2">
                <Share2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Bagikan Berita</span>
              </div>
              <button
                onClick={() => setShowSharePreview(false)}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Preview Card */}
              <div className="rounded-xl border border-border overflow-hidden bg-background/50">
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="w-full h-36 object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <div className="px-3 py-2.5">
                  <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-1">ainalabs.pro</p>
                  <p className="text-xs font-bold text-foreground line-clamp-2 leading-snug">{item.title}</p>
                  {/* AI Caption */}
                  <div className="mt-2 min-h-[36px] flex items-start gap-2">
                    {captionLoading ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-primary" />
                        <span>AINA sedang menulis caption menarik...</span>
                      </div>
                    ) : shareCaption ? (
                      <p className="text-xs text-muted-foreground leading-relaxed">{shareCaption}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground/60 italic">Caption tidak tersedia</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Regenerate caption */}
              {shareCaption && !captionLoading && (
                <button
                  onClick={() => fetchCaption(true)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Buat caption lain
                </button>
              )}

              {/* Share buttons */}
              <div className="grid grid-cols-2 gap-2">
                {/* WhatsApp */}
                <button
                  onClick={shareWhatsApp}
                  className="flex items-center gap-2.5 rounded-xl border border-[#25D366]/25 bg-[#25D366]/8 px-3.5 py-3 text-sm font-medium text-[#25D366] hover:bg-[#25D366]/15 transition-colors"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#25D366]/20 text-base font-bold">W</span>
                  WhatsApp
                </button>
                {/* Telegram */}
                <button
                  onClick={shareTelegram}
                  className="flex items-center gap-2.5 rounded-xl border border-[#2AABEE]/25 bg-[#2AABEE]/8 px-3.5 py-3 text-sm font-medium text-[#2AABEE] hover:bg-[#2AABEE]/15 transition-colors"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2AABEE]/20 text-base font-bold">✈</span>
                  Telegram
                </button>
                {/* X / Twitter */}
                <button
                  onClick={shareTwitter}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-secondary/50 px-3.5 py-3 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-sm font-bold">𝕏</span>
                  X / Twitter
                </button>
                {/* Copy link */}
                <button
                  onClick={copyLink}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-secondary/50 px-3.5 py-3 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                >
                  {copied
                    ? <Check className="h-5 w-5 shrink-0 text-green-500" />
                    : <Copy className="h-5 w-5 shrink-0 text-muted-foreground" />
                  }
                  {copied ? "Tersalin!" : "Salin link"}
                </button>
              </div>

              {/* Native share (mobile) */}
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button
                  onClick={shareNative}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/8 py-2.5 text-sm font-medium text-primary hover:bg-primary/15 transition-colors"
                >
                  <Share2 className="h-4 w-4" />
                  Bagikan via aplikasi lain
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default NewsModal;
