import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  MessageSquare, Plus, Search, Send, Trash2, RefreshCw,
  BookMarked, CheckCircle, Clock, MessageCircle, ThumbsUp, X,
  ImagePlus, Loader2,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */
interface Thread {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: string;
  image_url?: string | null;
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
  image_url?: string | null;
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

/* ─── Image Upload Helper ────────────────────────────── */
async function uploadThreadImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 5 * 1024 * 1024) { reject(new Error("Ukuran gambar maksimal 5MB")); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const imageBase64 = e.target?.result as string;
        const auth = await getAuthHeader();
        const res = await fetch("/api/threads/upload-image", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: auth },
          body: JSON.stringify({ imageBase64, mimeType: file.type }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Upload gagal" }));
          reject(new Error(err.error || "Upload gagal"));
          return;
        }
        const data = await res.json();
        resolve(data.url);
      } catch (err: any) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.readAsDataURL(file);
  });
}

/* ─── Image Lightbox ─────────────────────────────────── */
function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={url}
        alt="foto"
        className="max-h-[90dvh] max-w-full rounded-2xl object-contain shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}

/* ─── Image Preview Component ────────────────────────── */
function ImagePreview({ url, onRemove }: { url: string; onRemove: () => void }) {
  return (
    <div className="relative inline-block">
      <img src={url} alt="preview" className="max-h-40 w-auto rounded-xl border border-border object-cover" />
      <button
        onClick={onRemove}
        type="button"
        className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-background border border-border text-muted-foreground hover:text-destructive transition-colors shadow-sm"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/* ─── Avatar ─────────────────────────────────────────── */
function AvatarDisplay({ name, avatarUrl, size = "md" }: { name: string | null; avatarUrl: string | null; size?: "sm" | "md" }) {
  const [imgError, setImgError] = useState(false);
  const letters = (name ?? "?").split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
  const cls = size === "sm" ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-xs";
  if (avatarUrl && !imgError) {
    return (
      <img src={avatarUrl} alt={name ?? "avatar"}
        className={`${cls} shrink-0 rounded-xl object-cover`}
        onError={() => setImgError(true)} />
    );
  }
  return (
    <div className={`flex ${cls} shrink-0 items-center justify-center rounded-xl bg-gradient-purple font-bold text-white`}>
      {letters}
    </div>
  );
}

/* ─── Create Thread Sheet ────────────────────────────── */
function CreateThreadSheet({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (thread: Thread) => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle(""); setContent(""); setCategory("");
      setImagePreviewUrl(null); setUploadedImageUrl(null);
    }
  }, [open]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImagePreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    try {
      const url = await uploadThreadImage(file);
      setUploadedImageUrl(url);
    } catch (err: any) {
      toast.error(err.message);
      setImagePreviewUrl(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim() || !category) {
      toast.error("Semua field harus diisi");
      return;
    }
    if (uploading) { toast.error("Tunggu upload foto selesai"); return; }
    setSaving(true);
    try {
      const body: any = { title: title.trim(), content: content.trim(), category };
      if (uploadedImageUrl) body.image_url = uploadedImageUrl;
      const data = await threadsFetch("/api/threads", { method: "POST", body: JSON.stringify(body) });
      toast.success("Thread berhasil dibuat!");
      onCreated(data);
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="pointer-events-none absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 flex w-full max-w-lg flex-col rounded-t-[28px] sm:rounded-3xl border border-border bg-background shadow-2xl animate-in slide-in-from-bottom-[60%] sm:slide-in-from-bottom-4 sm:zoom-in-95 duration-300"
        style={{ maxHeight: "90dvh" }}
      >
        <div className="sm:hidden shrink-0 flex items-center justify-center pt-3 pb-1 cursor-grab" onClick={onClose}>
          <div className="h-1 w-12 rounded-full bg-border/80" />
        </div>

        <div className="shrink-0 flex items-center justify-between gap-3 px-5 pt-3 pb-3 sm:pt-5 border-b border-border">
          <h2 className="font-display text-base font-bold text-foreground">Buat Thread Baru</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Judul</label>
            <Input
              placeholder="Tulis judul threadmu..."
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="bg-card"
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Kategori</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-card">
                <SelectValue placeholder="Pilih kategori" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Isi Thread</label>
            <Textarea
              placeholder="Bagikan informasi, pengalaman, atau pertanyaanmu..."
              value={content}
              onChange={e => setContent(e.target.value)}
              className="min-h-[110px] bg-card resize-none"
            />
          </div>

          {/* Image upload */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Foto (opsional)</label>
            {imagePreviewUrl ? (
              <div className="space-y-2">
                <ImagePreview
                  url={imagePreviewUrl}
                  onRemove={() => { setImagePreviewUrl(null); setUploadedImageUrl(null); }}
                />
                {uploading && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Mengupload foto...
                  </p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors w-full"
              >
                <ImagePlus className="h-4 w-4 shrink-0" />
                Tambah foto (maks 5MB)
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleImageSelect}
            />
          </div>
        </div>

        <div
          className="shrink-0 border-t border-border px-5 pt-3 pb-4"
          style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
        >
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1" disabled={saving || uploading}>
              Batal
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saving || uploading}
              className="flex-1 bg-gradient-purple text-primary-foreground hover:opacity-90"
            >
              {saving ? "Memposting..." : uploading ? "Mengupload foto..." : "Post Thread"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Thread Detail Sheet ────────────────────────────── */
function ThreadDetailSheet({ threadId, currentUserId, isAdmin, onClose, onDeleted, onPromoted, onVoteChange }: {
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
  const [replyImagePreviewUrl, setReplyImagePreviewUrl] = useState<string | null>(null);
  const [replyUploadedImageUrl, setReplyUploadedImageUrl] = useState<string | null>(null);
  const [replyUploading, setReplyUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [localVoted, setLocalVoted] = useState(false);
  const [localVoteCount, setLocalVoteCount] = useState(0);
  const repliesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

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

  const handleReplyImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReplyImagePreviewUrl(URL.createObjectURL(file));
    setReplyUploading(true);
    try {
      const url = await uploadThreadImage(file);
      setReplyUploadedImageUrl(url);
    } catch (err: any) {
      toast.error(err.message);
      setReplyImagePreviewUrl(null);
    } finally {
      setReplyUploading(false);
      if (replyFileInputRef.current) replyFileInputRef.current.value = "";
    }
  };

  const handleReply = async () => {
    if (!replyContent.trim() && !replyUploadedImageUrl) return;
    if (replyUploading) { toast.error("Tunggu upload foto selesai"); return; }
    setSending(true);
    try {
      const body: any = { content: replyContent.trim() || "📷" };
      if (replyUploadedImageUrl) body.image_url = replyUploadedImageUrl;
      await threadsFetch(`/api/threads/${threadId}/replies`, { method: "POST", body: JSON.stringify(body) });
      setReplyContent("");
      setReplyImagePreviewUrl(null);
      setReplyUploadedImageUrl(null);
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
      toast.success("Thread berhasil dipromosikan ke Knowledge Base!");
      onPromoted(threadId);
      setThread(prev => prev ? { ...prev, promoted_to_kb: true } : prev);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPromoting(false);
    }
  };

  const canSendReply = !sending && !replyUploading && (replyContent.trim().length > 0 || !!replyUploadedImageUrl);
  const canDeleteThread = thread && (thread.user_id === currentUserId || isAdmin);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="pointer-events-none absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative z-10 flex w-full max-w-2xl flex-col rounded-t-[28px] sm:rounded-3xl border border-border bg-background shadow-2xl animate-in slide-in-from-bottom-[60%] sm:slide-in-from-bottom-4 sm:zoom-in-95 duration-300"
        style={{ maxHeight: "92dvh" }}
      >
        <div className="sm:hidden shrink-0 flex items-center justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing" onClick={onClose}>
          <div className="h-1 w-12 rounded-full bg-border/80" />
        </div>

        {loading ? (
          <div className="flex h-56 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          </div>
        ) : thread ? (
          <>
            {/* Fixed top bar */}
            <div className="shrink-0 border-b border-border px-4 pt-2 pb-3 sm:px-5 sm:pt-4 sm:pb-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CATEGORY_COLORS[thread.category] ?? "bg-secondary text-muted-foreground"}`}>
                      {thread.category}
                    </span>
                    {thread.promoted_to_kb && (
                      <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-medium text-green-400">
                        <CheckCircle className="h-3 w-3" />KB
                      </span>
                    )}
                  </div>
                  <h2 className="font-display text-sm font-bold leading-snug text-foreground line-clamp-2 sm:line-clamp-none sm:text-base">
                    {thread.title}
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {/* Thread body */}
              <div className="px-4 py-4 sm:px-5 border-b border-border/40">
                <div className="flex items-center gap-2 mb-3">
                  <AvatarDisplay name={thread.author_name} avatarUrl={thread.author_avatar} size="sm" />
                  <span className="text-xs font-semibold text-foreground/80">{thread.author_name ?? "Pengguna"}</span>
                  <span className="text-xs text-muted-foreground/50">·</span>
                  <span className="text-xs text-muted-foreground">{fmtDate(thread.created_at)}</span>
                </div>

                <p className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
                  {thread.content}
                </p>

                {/* Thread image */}
                {thread.image_url && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-border">
                    <img
                      src={thread.image_url}
                      alt="foto thread"
                      className="w-full h-auto cursor-zoom-in hover:opacity-95 transition-opacity"
                      onClick={() => setLightboxUrl(thread.image_url!)}
                    />
                  </div>
                )}

                {/* Action row */}
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleVote}
                    disabled={voting}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                      localVoted
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-secondary text-muted-foreground hover:border-primary/30 hover:text-primary"
                    }`}
                  >
                    <ThumbsUp className={`h-3.5 w-3.5 ${localVoted ? "fill-primary" : ""}`} />
                    <span>{localVoteCount}</span>
                  </button>

                  {isAdmin && !thread.promoted_to_kb && (
                    <button
                      onClick={handlePromote}
                      disabled={promoting}
                      className="flex items-center gap-1.5 rounded-xl border border-green-500/30 bg-green-500/5 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50"
                    >
                      <BookMarked className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{promoting ? "Memproses..." : "Promosikan ke KB"}</span>
                      <span className="sm:hidden">{promoting ? "..." : "Ke KB"}</span>
                    </button>
                  )}

                  {canDeleteThread && (
                    <button
                      onClick={handleDeleteThread}
                      className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Hapus</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Replies section */}
              <div className="sticky top-0 z-10 flex items-center gap-2 bg-background/95 backdrop-blur-sm px-4 py-2.5 sm:px-5 border-b border-border/30">
                <MessageCircle className="h-3.5 w-3.5 text-muted-foreground/60" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                  {thread.replies.length === 0 ? "Belum ada balasan" : `${thread.replies.length} Balasan`}
                </span>
              </div>

              <div className="px-4 py-4 sm:px-5 space-y-5">
                {thread.replies.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <MessageCircle className="mb-2 h-8 w-8 text-muted-foreground/20" />
                    <p className="text-sm text-muted-foreground">Jadilah yang pertama membalas!</p>
                  </div>
                ) : (
                  thread.replies.map(reply => (
                    <div key={reply.id} className="flex gap-3 group">
                      <AvatarDisplay name={reply.author_name} avatarUrl={reply.author_avatar} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-foreground">{reply.author_name ?? "Pengguna"}</span>
                            <span className="ml-2 text-xs text-muted-foreground/60">{fmtTime(reply.created_at)}</span>
                          </div>
                          {(reply.user_id === currentUserId || isAdmin) && (
                            <button
                              onClick={() => handleDeleteReply(reply.id)}
                              className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 sm:opacity-0"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        {reply.content !== "📷" && (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
                            {reply.content}
                          </p>
                        )}
                        {reply.image_url && (
                          <div className="mt-2 overflow-hidden rounded-xl border border-border max-w-xs">
                            <img
                              src={reply.image_url}
                              alt="foto balasan"
                              className="w-full h-auto cursor-zoom-in hover:opacity-95 transition-opacity"
                              onClick={() => setLightboxUrl(reply.image_url!)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={repliesEndRef} />
              </div>
            </div>

            {/* Fixed bottom: reply input */}
            <div
              className="shrink-0 border-t border-border bg-background px-4 pt-3 pb-3 sm:px-5 sm:pt-4 sm:pb-4 space-y-2"
              style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
            >
              {/* Image preview in reply */}
              {replyImagePreviewUrl && (
                <div className="flex items-center gap-2">
                  <ImagePreview
                    url={replyImagePreviewUrl}
                    onRemove={() => { setReplyImagePreviewUrl(null); setReplyUploadedImageUrl(null); }}
                  />
                  {replyUploading && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Mengupload...
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-2 items-end">
                {/* Image attach button */}
                <button
                  type="button"
                  onClick={() => replyFileInputRef.current?.click()}
                  disabled={!!replyImagePreviewUrl || replyUploading}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors disabled:opacity-40"
                  title="Lampirkan foto"
                >
                  <ImagePlus className="h-4 w-4" />
                </button>
                <input
                  ref={replyFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleReplyImageSelect}
                />

                <Textarea
                  ref={textareaRef}
                  placeholder="Tulis balasanmu..."
                  value={replyContent}
                  onChange={e => setReplyContent(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey && window.innerWidth >= 640) {
                      e.preventDefault();
                      if (canSendReply) handleReply();
                    }
                  }}
                  className="min-h-[44px] max-h-[100px] resize-none bg-card text-sm leading-relaxed"
                  rows={1}
                />
                <Button
                  onClick={handleReply}
                  disabled={!canSendReply}
                  className="h-11 w-11 shrink-0 bg-gradient-purple px-0 text-primary-foreground hover:opacity-90 rounded-xl"
                >
                  {sending
                    ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    : <Send className="h-4 w-4" />
                  }
                </Button>
              </div>
              <p className="hidden sm:block text-xs text-muted-foreground/60">
                Enter untuk kirim · Shift+Enter untuk baris baru
              </p>
            </div>
          </>
        ) : null}
      </div>

      {/* Lightbox */}
      {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
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

  const handleVote = async (e: React.MouseEvent, threadId: string) => {
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
      <div className="shrink-0 border-b border-border px-4 py-3 md:px-6 md:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-foreground sm:text-lg">Threads</h2>
            <p className="hidden sm:block text-xs text-muted-foreground mt-0.5">
              Sharing informasi, pengalaman, dan tips seputar kehidupan di Mesir
            </p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            className="shrink-0 gap-1.5 bg-gradient-purple text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Buat Thread</span>
            <span className="sm:hidden">Buat</span>
          </Button>
        </div>

        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari thread..."
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none]">
          <button
            onClick={() => setCategoryFilter("all")}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
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
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
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
      <div className="flex-1 overflow-y-auto p-3 md:p-6">
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

            {filtered.map((thread, i) => (
              <div
                key={thread.id}
                onClick={() => setSelectedThreadId(thread.id)}
                style={{ animationDelay: `${i * 40}ms`, animationFillMode: "both" }}
                className="flex w-full gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-colors hover:border-primary/30 hover:bg-card/80 cursor-pointer animate-in fade-in slide-in-from-bottom-3 duration-300 md:p-4"
              >
                <AvatarDisplay name={thread.author_name} avatarUrl={thread.author_avatar} />

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_COLORS[thread.category] ?? "bg-secondary text-muted-foreground"}`}>
                      {thread.category}
                    </span>
                    {thread.promoted_to_kb && (
                      <span className="flex items-center gap-0.5 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-400">
                        <CheckCircle className="h-2.5 w-2.5" /> KB
                      </span>
                    )}
                    {thread.image_url && (
                      <span className="flex items-center gap-0.5 rounded-full bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        📷
                      </span>
                    )}
                  </div>

                  <p className="font-semibold text-sm text-foreground line-clamp-1 leading-snug">{thread.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">{thread.content}</p>

                  <div className="mt-2 flex items-center gap-0 flex-wrap">
                    <span className="mr-2 text-xs font-medium text-foreground/60 truncate max-w-[100px]">{thread.author_name ?? "Pengguna"}</span>
                    <span className="mr-3 flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageCircle className="h-3 w-3 shrink-0" />
                      {thread.reply_count}
                    </span>
                    <button
                      onClick={e => handleVote(e, thread.id)}
                      disabled={votingId === thread.id}
                      className={`mr-3 flex items-center gap-1 text-xs transition-colors disabled:opacity-50 ${
                        thread.user_voted ? "text-primary" : "text-muted-foreground hover:text-primary"
                      }`}
                    >
                      <ThumbsUp className={`h-3 w-3 shrink-0 ${thread.user_voted ? "fill-primary" : ""}`} />
                      {thread.vote_count ?? 0}
                    </button>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                      <Clock className="h-3 w-3 shrink-0" />
                      {fmtDate(thread.updated_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateThreadSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />

      {selectedThreadId && (
        <ThreadDetailSheet
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
