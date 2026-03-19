import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Shield, Users, FileText, Check, X, LayoutDashboard,
  MessageSquare, BookOpen, Clock, ChevronDown, Search,
  RefreshCw, TrendingUp, UserCheck, AlertCircle, Plus,
  Pencil, Trash2, Eye,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────── */
interface Profile {
  id: string; user_id: string; full_name: string | null;
  email: string | null; level: string; contribution_count: number;
  created_at: string; roles: string[];
}
interface ContributorRequest {
  id: string; user_id: string; full_name: string; education: string;
  enrollment_year: number; expertise: string; status: string; created_at: string;
}
interface Article {
  id: string; author_id: string; title: string; content: string;
  category: string; status: string; created_at: string;
}
interface Stats {
  totalUsers: number; totalChats: number; pendingRequests: number;
  pendingArticles: number; approvedArticles: number; totalArticles: number;
}

/* ─── Helpers ────────────────────────────────────────── */
const CATEGORIES = ["Administrasi", "Akademik", "Kehidupan Mesir", "Transport", "Tempat Tinggal", "Kuliner"];
const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", senior_contributor: "Sr. Contributor",
  contributor: "Contributor", user: "User",
};
const ROLE_COLORS: Record<string, string> = {
  admin: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  senior_contributor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  contributor: "bg-green-500/20 text-green-400 border-green-500/30",
  user: "bg-muted text-muted-foreground border-border",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  approved: "bg-green-500/20 text-green-400 border-green-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
};
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

function Initials({ name }: { name: string | null }) {
  const letters = (name ?? "?").split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-purple text-xs font-bold text-white">
      {letters}
    </div>
  );
}

async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? `Bearer ${session.access_token}` : "";
}

async function adminFetch(path: string, options: RequestInit = {}) {
  const auth = await getAuthHeader();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: auth, ...(options.headers || {}) },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(err.error || "Request failed");
    }
    return res.json();
  } catch (e: any) {
    if (e.name === "AbortError") throw new Error("Koneksi timeout. Coba lagi.");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

/* ─── Overview Tab ───────────────────────────────────── */
function OverviewTab({ stats, loading }: { stats: Stats; loading: boolean }) {
  const cards = [
    { label: "Total User", value: stats.totalUsers, icon: Users, color: "text-violet-400", bg: "bg-violet-500/10" },
    { label: "Total Chat", value: stats.totalChats, icon: MessageSquare, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Req. Pending", value: stats.pendingRequests, icon: UserCheck, color: "text-yellow-400", bg: "bg-yellow-500/10" },
    { label: "Artikel Pending", value: stats.pendingArticles, icon: AlertCircle, color: "text-orange-400", bg: "bg-orange-500/10" },
    { label: "Artikel Aktif", value: stats.approvedArticles, icon: BookOpen, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "Total Artikel", value: stats.totalArticles, icon: TrendingUp, color: "text-pink-400", bg: "bg-pink-500/10" },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">Gambaran Umum</h2>
        <p className="text-sm text-muted-foreground">Statistik platform AINA secara real-time.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map(c => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-4">
            <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${c.bg}`}>
              <c.icon className={`h-4 w-4 ${c.color}`} />
            </div>
            {loading ? (
              <div className="h-7 w-12 animate-pulse rounded-lg bg-muted" />
            ) : (
              <p className="font-display text-2xl font-bold text-foreground">{c.value}</p>
            )}
            <p className="mt-0.5 text-xs text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-3 font-medium text-foreground">Struktur Role</h3>
        <div className="space-y-2 text-sm">
          {[
            { role: "admin", desc: "Akses penuh: kelola semua data, user, dan konten." },
            { role: "senior_contributor", desc: "≥10 artikel disetujui. Bisa menulis & mengedit konten." },
            { role: "contributor", desc: "Terverifikasi. Bisa mengirim artikel ke knowledge base." },
            { role: "user", desc: "User biasa. Hanya bisa chat dan baca konten." },
          ].map(r => (
            <div key={r.role} className="flex items-start gap-3">
              <span className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-xs ${ROLE_COLORS[r.role]}`}>
                {ROLE_LABELS[r.role]}
              </span>
              <span className="text-muted-foreground">{r.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Users Tab ──────────────────────────────────────── */
function UsersTab() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openRoleMenu, setOpenRoleMenu] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch("/api/admin/users");
      setUsers(data);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const topRole = (roles: string[]) => {
    const order = ["admin", "senior_contributor", "contributor", "user"];
    return order.find(r => roles.includes(r)) ?? "user";
  };

  const setRole = async (userId: string, role: string) => {
    setOpenRoleMenu(null);
    try {
      await adminFetch(`/api/admin/users/${userId}/role`, { method: "POST", body: JSON.stringify({ role }) });
      toast.success(`Role diubah ke ${ROLE_LABELS[role]}`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const confirmDelete = (u: Profile) => {
    setOpenRoleMenu(null);
    setDeleteConfirm(u);
  };

  const deleteUser = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await adminFetch(`/api/admin/users/${deleteConfirm.user_id}`, { method: "DELETE" });
      toast.success(`Akun ${deleteConfirm.full_name ?? deleteConfirm.email} berhasil dihapus`);
      setDeleteConfirm(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const filtered = users.filter(u =>
    !search ||
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Manajemen User</h2>
            <p className="text-sm text-muted-foreground">{users.length} akun terdaftar</p>
          </div>
          <button onClick={load} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama atau email..."
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40" />
        </div>
        {loading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-card" />)}</div>
        ) : (
          <div className="space-y-2">
            {filtered.map(u => {
              const role = topRole(u.roles);
              return (
                <div key={u.id} className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Initials name={u.full_name} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{u.full_name ?? "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email ?? "—"}</p>
                    </div>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <span className="hidden text-xs text-muted-foreground sm:block">{fmtDate(u.created_at)}</span>
                    {u.contribution_count > 0 && (
                      <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary sm:block">
                        {u.contribution_count} artikel
                      </span>
                    )}
                    <div className="relative">
                      <button onClick={() => setOpenRoleMenu(openRoleMenu === u.user_id ? null : u.user_id)}
                        className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs hover:opacity-80 ${ROLE_COLORS[role]}`}>
                        {ROLE_LABELS[role]}<ChevronDown className="h-3 w-3" />
                      </button>
                      {openRoleMenu === u.user_id && (
                        <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
                          {Object.entries(ROLE_LABELS).map(([r, label]) => (
                            <button key={r} onClick={() => setRole(u.user_id, r)}
                              className={`flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-accent ${role === r ? "text-primary" : "text-foreground"}`}>
                              {label}{role === r && <Check className="h-3 w-3" />}
                            </button>
                          ))}
                          <div className="border-t border-border">
                            <button
                              onClick={() => confirmDelete(u)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10"
                            >
                              <Trash2 className="h-3 w-3" />
                              Hapus Akun
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada user ditemukan.</p>}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open && !deleting) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm gap-4 p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-destructive">
              <Trash2 className="h-4 w-4" />
              Hapus Akun
            </DialogTitle>
          </DialogHeader>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
            <p className="text-sm font-medium text-foreground">{deleteConfirm?.full_name ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{deleteConfirm?.email ?? "—"}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Akun ini akan dihapus permanen beserta semua data terkait (chat, artikel, profil). <span className="font-medium text-foreground">Tindakan ini tidak bisa dibatalkan.</span>
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="flex-1" onClick={() => setDeleteConfirm(null)} disabled={deleting}>
              Batal
            </Button>
            <Button size="sm" className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteUser} disabled={deleting}>
              {deleting ? <><span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />Menghapus...</> : "Ya, Hapus Akun"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Requests Tab ───────────────────────────────────── */
function RequestsTab() {
  const [requests, setRequests] = useState<ContributorRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch(`/api/admin/requests?status=${filter}`);
      setRequests(data);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handle = async (id: string, status: "approved" | "rejected") => {
    try {
      await adminFetch(`/api/admin/requests/${id}/review`, { method: "POST", body: JSON.stringify({ status }) });
      toast.success(status === "approved" ? "Disetujui — user jadi Contributor" : "Permintaan ditolak");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const tabs: Array<"pending" | "approved" | "rejected"> = ["pending", "approved", "rejected"];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">Permintaan Kontributor</h2>
        <p className="text-sm text-muted-foreground">Review dan kelola pengajuan menjadi kontributor.</p>
      </div>
      <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
        {tabs.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium capitalize transition-colors ${filter === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "pending" ? "Menunggu" : t === "approved" ? "Disetujui" : "Ditolak"}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-card" />)}</div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Clock className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Tidak ada permintaan {filter === "pending" ? "menunggu" : filter === "approved" ? "disetujui" : "ditolak"}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Initials name={req.full_name} />
                  <div>
                    <p className="font-medium text-foreground">{req.full_name}</p>
                    <p className="text-xs text-muted-foreground">{req.education}</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Masuk {req.enrollment_year}</span>
                      <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{req.expertise}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_COLORS[req.status]}`}>
                        {req.status === "pending" ? "Menunggu" : req.status === "approved" ? "Disetujui" : "Ditolak"}
                      </span>
                    </div>
                  </div>
                </div>
                {req.status === "pending" && (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 border-green-500/30 text-green-400 hover:bg-green-500/10" onClick={() => handle(req.id, "approved")}>
                      <Check className="h-3.5 w-3.5" /> Setuju
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => handle(req.id, "rejected")}>
                      <X className="h-3.5 w-3.5" /> Tolak
                    </Button>
                  </div>
                )}
              </div>
              <p className="mt-2 text-right text-xs text-muted-foreground">{fmtDate(req.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Article Form Dialog ────────────────────────────── */
function ArticleFormDialog({
  open, onClose, onSave, initial,
}: {
  open: boolean; onClose: () => void;
  onSave: (data: { title: string; content: string; category: string }) => Promise<void>;
  initial?: { title: string; content: string; category: string };
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setTitle(initial?.title ?? ""); setContent(initial?.content ?? ""); setCategory(initial?.category ?? ""); }
  }, [open, initial]);

  const handleSave = async () => {
    if (!title.trim() || !content.trim() || !category) { toast.error("Semua field harus diisi"); return; }
    setSaving(true);
    await onSave({ title: title.trim(), content: content.trim(), category });
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">{initial ? "Edit Artikel" : "Tambah Artikel Baru"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Judul</label>
            <Input placeholder="Judul artikel" value={title} onChange={e => setTitle(e.target.value)} className="bg-secondary" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Kategori</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-secondary"><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Konten</label>
            <Textarea placeholder="Tulis isi artikel..." value={content} onChange={e => setContent(e.target.value)} className="min-h-[180px] bg-secondary resize-none" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">Batal</Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 bg-gradient-purple text-primary-foreground hover:opacity-90">
              {saving ? "Menyimpan..." : initial ? "Simpan Perubahan" : "Tambah Artikel"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Knowledge Base Tab ─────────────────────────────── */
function KnowledgeBaseTab() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editArticle, setEditArticle] = useState<Article | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch(`/api/admin/articles?status=${filter}`);
      setArticles(data);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleReview = async (id: string, status: "approved" | "rejected") => {
    try {
      await adminFetch(`/api/admin/articles/${id}/review`, { method: "POST", body: JSON.stringify({ status }) });
      toast.success(status === "approved" ? "Artikel disetujui dan dipublikasikan" : "Artikel ditolak");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAdd = async (data: { title: string; content: string; category: string }) => {
    try {
      await adminFetch("/api/admin/articles", { method: "POST", body: JSON.stringify(data) });
      toast.success("Artikel ditambahkan!");
      setAddOpen(false);
      if (filter === "approved") load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleEdit = async (data: { title: string; content: string; category: string }) => {
    if (!editArticle) return;
    try {
      await adminFetch(`/api/admin/articles/${editArticle.id}`, { method: "PATCH", body: JSON.stringify(data) });
      toast.success("Artikel diperbarui!");
      setEditArticle(null);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Yakin hapus artikel ini?")) return;
    try {
      await adminFetch(`/api/admin/articles/${id}`, { method: "DELETE" });
      toast.success("Artikel dihapus");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const tabs: Array<"pending" | "approved" | "rejected"> = ["pending", "approved", "rejected"];

  const filtered = articles.filter(a =>
    !searchQuery ||
    a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">Moderasi Knowledge Base</h2>
          <p className="text-sm text-muted-foreground">Review, terbitkan, dan tambah artikel langsung.</p>
        </div>
        <Button onClick={() => setAddOpen(true)} size="sm" className="shrink-0 gap-1.5 bg-gradient-purple text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Tambah Artikel
        </Button>
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
        {tabs.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${filter === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "pending" ? "Menunggu" : t === "approved" ? "Disetujui" : "Ditolak"}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Cari artikel..."
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40" />
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-card" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <BookOpen className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {searchQuery ? "Tidak ada artikel yang cocok." : `Tidak ada artikel ${filter === "pending" ? "menunggu review" : filter === "approved" ? "yang disetujui" : "yang ditolak"}.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(art => (
            <div key={art.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[art.category] ?? "bg-secondary text-muted-foreground"}`}>
                      {art.category}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_COLORS[art.status]}`}>
                      {art.status === "pending" ? "Menunggu" : art.status === "approved" ? "Disetujui" : "Ditolak"}
                    </span>
                    <span className="text-xs text-muted-foreground">{fmtDate(art.created_at)}</span>
                  </div>
                  <h3 className="mt-1.5 font-medium text-foreground">{art.title}</h3>
                  <p className={`mt-1 text-sm text-muted-foreground ${expanded === art.id ? "" : "line-clamp-2"}`}>
                    {art.content}
                  </p>
                  <button onClick={() => setExpanded(expanded === art.id ? null : art.id)} className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline">
                    <Eye className="h-3 w-3" />
                    {expanded === art.id ? "Tampilkan lebih sedikit" : "Baca selengkapnya"}
                  </button>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  {art.status === "pending" && (
                    <>
                      <Button size="sm" variant="outline" className="h-8 gap-1 border-green-500/30 text-green-400 hover:bg-green-500/10" onClick={() => handleReview(art.id, "approved")}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1 border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => handleReview(art.id, "rejected")}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-muted-foreground hover:text-foreground" onClick={() => setEditArticle(art)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1 border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => handleDelete(art.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ArticleFormDialog open={addOpen} onClose={() => setAddOpen(false)} onSave={handleAdd} />
      <ArticleFormDialog
        open={!!editArticle} onClose={() => setEditArticle(null)} onSave={handleEdit}
        initial={editArticle ? { title: editArticle.title, content: editArticle.content, category: editArticle.category } : undefined}
      />
    </div>
  );
}

/* ─── Master Admin Banner (shown to admins who aren't master admin yet) ── */
function MasterAdminBanner() {
  const [info, setInfo] = useState<{ uuid: string; email: string; roles: string[] } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/whoami", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.ok) setInfo(await res.json());
    })();
  }, []);

  return (
    <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-400">Akses Master Admin Belum Aktif</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Tab <strong>Users</strong> belum muncul karena UUID kamu belum terdaftar sebagai Master Admin.
            Salin UUID di bawah, lalu set sebagai <code className="rounded bg-muted px-1">MASTER_ADMIN_IDS</code> di environment variable (Vercel / Replit).
          </p>
          {info && (
            <div className="mt-3 rounded-lg border border-border bg-muted/50 px-3 py-2 font-mono text-xs">
              <div className="text-muted-foreground">Email: <span className="text-foreground">{info.email}</span></div>
              <div className="mt-1 text-muted-foreground">UUID: <span className="text-foreground break-all">{info.uuid}</span></div>
              <div className="mt-1 text-muted-foreground">Roles: <span className="text-foreground">{info.roles.join(", ") || "none"}</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── No Admin Screen (first-time setup) ─────────────── */
function NoAdminScreen({ onClaimed }: { onClaimed: () => void }) {
  const [claiming, setClaiming] = useState(false);
  const [info, setInfo] = useState<{ uuid: string; email: string } | null>(null);

  const checkWhoami = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/whoami", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.ok) setInfo(await res.json());
    } catch { /* ignore */ }
  };

  useEffect(() => { checkWhoami(); }, []);

  const claimAdmin = async () => {
    setClaiming(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Login dulu"); setClaiming(false); return; }
      const res = await fetch("/api/setup/claim-admin", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message ?? "Berhasil jadi admin!");
        onClaimed();
      } else {
        toast.error(data.error ?? "Gagal claim admin");
      }
    } catch {
      toast.error("Terjadi kesalahan");
    }
    setClaiming(false);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center text-center p-6 gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10">
        <Shield className="h-8 w-8 text-amber-400" />
      </div>
      <div>
        <h2 className="font-display text-xl font-bold text-foreground">Setup Admin Pertama</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Belum ada admin di sistem. Klik tombol di bawah untuk menjadikan akun kamu sebagai admin pertama.
        </p>
      </div>
      {info && (
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-left text-xs font-mono w-full max-w-sm">
          <div className="text-muted-foreground mb-1">Akun yang sedang login:</div>
          <div className="text-foreground font-semibold">{info.email}</div>
          <div className="text-muted-foreground mt-1 break-all">UUID: {info.uuid}</div>
        </div>
      )}
      <Button onClick={claimAdmin} disabled={claiming} className="bg-amber-500 hover:bg-amber-400 text-black font-bold">
        {claiming ? "Memproses..." : "Jadikan Saya Admin Pertama"}
      </Button>
      <p className="text-xs text-muted-foreground max-w-xs">
        Tombol ini hanya berfungsi sekali — ketika belum ada admin di sistem.
      </p>
    </div>
  );
}

/* ─── Main AdminPage ─────────────────────────────────── */
type Tab = "overview" | "users" | "requests" | "knowledge";

const AdminPage = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats>({ totalUsers: 0, totalChats: 0, pendingRequests: 0, pendingArticles: 0, approvedArticles: 0, totalArticles: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id);
      const admin = roles?.some(r => r.role === "admin") ?? false;
      setIsAdmin(admin);

      if (admin) {
        try {
          const me = await adminFetch("/api/me");
          console.log("[AdminPage] /api/me response:", me);
          setIsMasterAdmin(me.isMasterAdmin ?? false);
          const data = await adminFetch("/api/admin/stats");
          setStats(data);
        } catch (err) {
          console.error("[AdminPage] Error fetching /api/me or stats:", err);
        }
        setStatsLoading(false);
      }

      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  if (!isAdmin) {
    return <NoAdminScreen onClaimed={() => window.location.reload()} />;
  }

  const navItems: Array<{ id: Tab; label: string; icon: React.ElementType; badge?: number }> = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    ...(isMasterAdmin ? [{ id: "users" as Tab, label: "Users", icon: Users, badge: stats.totalUsers || undefined }] : []),
    { id: "requests", label: "Requests", icon: UserCheck, badge: stats.pendingRequests || undefined },
    { id: "knowledge", label: "Knowledge Base", icon: FileText, badge: stats.pendingArticles || undefined },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-purple">
          <Shield className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-lg font-bold text-foreground">Admin Panel</h1>
            {isMasterAdmin && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-400">
                ⭐ MASTER ADMIN
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Kelola platform AINA</p>
        </div>
      </div>

      <div className="flex border-b border-border px-5">
        {navItems.map(item => (
          <button key={item.id} onClick={() => setActiveTab(item.id)}
            className={`relative flex items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-medium transition-colors ${activeTab === item.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
            {item.badge !== undefined && item.badge > 0 && (
              <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {!isMasterAdmin && <MasterAdminBanner />}
        {activeTab === "overview" && <OverviewTab stats={stats} loading={statsLoading} />}
        {activeTab === "users" && isMasterAdmin && <UsersTab />}
        {activeTab === "requests" && <RequestsTab />}
        {activeTab === "knowledge" && <KnowledgeBaseTab />}
      </div>
    </div>
  );
};

export default AdminPage;
