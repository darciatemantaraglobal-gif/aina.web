import { useEffect, useState, useCallback } from "react";
import { Bookmark, Trash2, BookOpen, ChevronDown, ChevronUp, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

interface SavedAnswer {
  id: string;
  message_id: string;
  content: string;
  sources: string[] | null;
  source_summary: string | null;
  intent: string | null;
  promoted_to_kb: boolean;
  created_at: string;
}

async function authFetch(path: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Unauthenticated");
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  });
}

function SourceBadge({ src }: { src: string }) {
  const map: Record<string, { color: string; label: string }> = {
    "Knowledge Base AINA": { color: "bg-violet-500/15 text-violet-400 border-violet-500/25", label: src },
    "Breaking Update":     { color: "bg-amber-500/15 text-amber-400 border-amber-500/25",   label: src },
    "Pencarian Web":       { color: "bg-blue-500/15 text-blue-400 border-blue-500/25",       label: src },
    "Wikipedia":           { color: "bg-slate-500/15 text-slate-400 border-slate-500/25",    label: src },
    "Kurs":                { color: "bg-green-500/15 text-green-400 border-green-500/25",     label: src },
  };
  const cfg = map[src] ?? { color: "bg-muted/50 text-muted-foreground border-border", label: src };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function SavedAnswerCard({ item, onDelete }: { item: SavedAnswer; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const date = new Date(item.created_at).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  });

  const preview = item.content.slice(0, 180).replace(/[#*`>\-]/g, "").trim();
  const needsExpand = item.content.length > 180;

  const handleDelete = async () => {
    if (!confirm("Hapus jawaban tersimpan ini?")) return;
    setDeleting(true);
    try {
      const res = await authFetch(`/api/saved-answers/${item.message_id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onDelete(item.id);
      toast.success("Dihapus dari tersimpan");
    } catch {
      toast.error("Gagal menghapus");
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(item.sources ?? []).slice(0, 3).map((s, i) => (
            <SourceBadge key={i} src={s} />
          ))}
          {item.promoted_to_kb && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
              <BookOpen className="h-2.5 w-2.5" /> Sudah di KB
            </span>
          )}
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground/50">{date}</span>
      </div>

      <div className="text-sm text-foreground/90 leading-relaxed">
        {expanded ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            className="prose prose-sm prose-invert max-w-none [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-xs [&_h3]:font-semibold [&_p]:text-sm [&_li]:text-sm [&_code]:text-xs"
          >
            {item.content}
          </ReactMarkdown>
        ) : (
          <p>{preview}{needsExpand ? "…" : ""}</p>
        )}
      </div>

      {needsExpand && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
        >
          {expanded ? (
            <><ChevronUp className="h-3 w-3" /> Lebih sedikit</>
          ) : (
            <><ChevronDown className="h-3 w-3" /> Lihat selengkapnya</>
          )}
        </button>
      )}

      <div className="flex items-center justify-between border-t border-border pt-2">
        <span className="text-[10px] text-muted-foreground/40 capitalize">{item.intent ?? "—"}</span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Hapus
        </button>
      </div>
    </div>
  );
}

export default function SavedAnswersPage() {
  const [items, setItems] = useState<SavedAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/saved-answers");
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const filtered = items.filter(i =>
    !search || i.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15">
          <Bookmark className="h-4 w-4 text-amber-400" />
        </div>
        <div>
          <h1 className="font-display text-lg font-bold text-foreground">Jawaban Tersimpan</h1>
          <p className="text-xs text-muted-foreground">{items.length} jawaban dibookmark</p>
        </div>
      </div>

      <div className="border-b border-border px-5 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari jawaban tersimpan…"
            className="w-full rounded-xl border border-border bg-secondary/50 py-2 pl-8 pr-3 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10">
              <Bookmark className="h-6 w-6 text-amber-400/50" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {search ? "Tidak ditemukan" : "Belum ada jawaban tersimpan"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {search ? "Coba kata kunci lain" : "Klik ikon bookmark di jawaban AINA untuk menyimpannya di sini"}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(item => (
              <SavedAnswerCard key={item.id} item={item} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
