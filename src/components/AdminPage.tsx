import { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Shield, Users, FileText, Check, X, LayoutDashboard,
  MessageSquare, BookOpen, Clock, Search,
  RefreshCw, TrendingUp, UserCheck, Plus,
  Pencil, Trash2, Eye, EyeOff, AlertCircle, Zap, Flag, Bell, ToggleLeft, ToggleRight,
  ShieldAlert, Filter, Trash, ShieldOff, ShieldCheck, Download, Crown, ListChecks,
  ExternalLink, ChevronDown, Megaphone, Save, Upload, Image, PartyPopper,
  ThumbsUp, Bookmark, Star, Newspaper, Utensils, Globe, Bus, GraduationCap, Pin,
  GripVertical, Wand2, FileUp, CheckCircle2, AlertTriangle, ChevronRight,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────── */
interface Profile {
  id: string; user_id: string; full_name: string | null;
  email: string | null; avatar_url: string | null; level: string; contribution_count: number;
  created_at: string; roles: string[]; is_banned?: boolean;
  is_pro?: boolean; pro_expires_at?: string | null;
  hidden_from_leaderboard?: boolean;
  custom_about?: string | null;
  custom_instructions?: string | null;
}
interface ContributorRequest {
  id: string; user_id: string; full_name: string; education: string;
  enrollment_year: number; expertise: string; status: string; created_at: string;
  reason?: string; article_content?: string; article_file_url?: string;
  portfolio_link?: string; review_notes?: string; reviewed_by?: string; reviewed_at?: string;
}
interface Article {
  id: string; author_id: string; title: string; content: string;
  category: string; status: string; created_at: string;
  author_name: string | null; author_email: string | null;
  hidden: boolean; maps_url?: string | null; contact_number?: string | null;
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
  article_reviewed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
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

const AVATAR_SIZE_CLASSES: Record<number, string> = {
  9: "h-9 w-9",
  16: "h-16 w-16",
};

function AvatarDisplay({ name, avatarUrl, size = 9 }: { name: string | null; avatarUrl: string | null; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const letters = (name ?? "?").split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const sizeClass = AVATAR_SIZE_CLASSES[size] ?? "h-9 w-9";
  const cls = `${sizeClass} shrink-0 rounded-xl`;
  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl} alt={name ?? "avatar"}
        className={`${cls} object-cover`}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div className={`${cls} flex items-center justify-center bg-gradient-purple text-xs font-bold text-white`}>
      {letters}
    </div>
  );
}

/* ─── User Profile Modal (Master Admin only) ─────────── */
function UserProfileModal({ user, onClose, onSetRole, onDelete, onBanToggle, onProToggle, onLeaderboardToggle }: {
  user: Profile; onClose: () => void;
  onSetRole: (userId: string, role: string) => Promise<void>;
  onDelete: (user: Profile) => void;
  onBanToggle: (user: Profile) => void;
  onProToggle: (user: Profile) => void;
  onLeaderboardToggle: (user: Profile) => void;
}) {
  const [settingRole, setSettingRole] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const topRole = (roles: string[]) => {
    const order = ["admin", "senior_contributor", "contributor", "user"];
    return order.find(r => roles.includes(r)) ?? "user";
  };
  const role = topRole(user.roles);

  const handleSetRole = async (r: string) => {
    setSettingRole(true);
    await onSetRole(user.user_id, r);
    setSettingRole(false);
  };

  return (
    <>
      {photoOpen && user.avatar_url && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setPhotoOpen(false)}
        >
          <div className="relative max-w-xs w-full mx-4" onClick={e => e.stopPropagation()}>
            <img
              src={user.avatar_url}
              alt={user.full_name ?? "foto profil"}
              className="w-full rounded-2xl object-cover shadow-2xl"
            />
            <p className="mt-3 text-center text-sm font-medium text-white">{user.full_name ?? "—"}</p>
            <button
              onClick={() => setPhotoOpen(false)}
              className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm gap-0 p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-violet-600/20 to-purple-600/10 p-5 pb-4">
          <DialogHeader>
            <DialogTitle className="sr-only">Profil User</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-4">
            <button
              className={user.avatar_url ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-default"}
              onClick={() => user.avatar_url && setPhotoOpen(true)}
              title={user.avatar_url ? "Lihat foto penuh" : undefined}
            >
              <AvatarDisplay name={user.full_name} avatarUrl={user.avatar_url} size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground truncate">{user.full_name ?? "—"}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email ?? "—"}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className={`rounded-full border px-2 py-0.5 text-xs ${ROLE_COLORS[role]}`}>{ROLE_LABELS[role]}</span>
                {user.is_pro && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                    <Crown className="h-2.5 w-2.5" /> Pro
                  </span>
                )}
                {user.is_banned && (
                  <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-400">Banned</span>
                )}
                {user.contribution_count > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{user.contribution_count} artikel</span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-3 p-5">
          <div className="rounded-xl border border-border bg-card/60 p-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">User ID</span>
              <span className="font-mono text-foreground break-all text-right max-w-[180px]">{user.user_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Level</span>
              <span className="text-foreground">{user.level}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status Pro</span>
              <span className={user.is_pro ? "text-amber-400 font-medium" : "text-muted-foreground"}>
                {user.is_pro ? `Aktif${user.pro_expires_at ? ` s/d ${fmtDate(user.pro_expires_at)}` : ""}` : "Tidak Aktif"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bergabung</span>
              <span className="text-foreground">{fmtDate(user.created_at)}</span>
            </div>
          </div>
          {/* Personalisasi Pribadi — only shown if user has set custom instructions */}
          {(user.custom_about || user.custom_instructions) && (
            <div className="rounded-xl border border-border bg-card/60 p-3 space-y-2.5 text-xs">
              <p className="font-semibold text-foreground/80">Instruksi Personal</p>
              {user.custom_about && (
                <div>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Tentang User</p>
                  <p className="whitespace-pre-wrap text-foreground/80 leading-relaxed">{user.custom_about}</p>
                </div>
              )}
              {user.custom_instructions && (
                <div>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Cara AINA Membalas</p>
                  <p className="whitespace-pre-wrap text-foreground/80 leading-relaxed">{user.custom_instructions}</p>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Ubah Role</p>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(ROLE_LABELS).map(([r, label]) => (
                <button key={r} disabled={settingRole || role === r} onClick={() => handleSetRole(r)}
                  className={`rounded-lg border py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${role === r ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => { onClose(); onBanToggle(user); }}
            className={`flex w-full items-center justify-center gap-2 rounded-xl border py-2 text-xs font-medium transition-colors ${
              user.is_banned
                ? "border-green-500/30 text-green-400 hover:bg-green-500/10"
                : "border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
            }`}
          >
            {user.is_banned
              ? <><ShieldCheck className="h-3.5 w-3.5" /> Cabut Ban</>
              : <><ShieldOff className="h-3.5 w-3.5" /> Ban Akun</>
            }
          </button>
          <button
            onClick={() => { onClose(); onProToggle(user); }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/30 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            <Crown className="h-3.5 w-3.5" />
            {user.is_pro ? "Cabut Akses Pro" : "Beri Akses Pro (30 hari)"}
          </button>
          <button
            onClick={() => { onClose(); onLeaderboardToggle(user); }}
            className={`flex w-full items-center justify-center gap-2 rounded-xl border py-2 text-xs font-medium transition-colors ${
              user.hidden_from_leaderboard
                ? "border-green-500/30 text-green-400 hover:bg-green-500/10"
                : "border-border text-muted-foreground hover:border-orange-500/30 hover:text-orange-400 hover:bg-orange-500/5"
            }`}
          >
            {user.hidden_from_leaderboard
              ? <><Eye className="h-3.5 w-3.5" /> Tampilkan di Leaderboard</>
              : <><EyeOff className="h-3.5 w-3.5" /> Sembunyikan dari Leaderboard</>
            }
          </button>
          <button onClick={() => { onClose(); onDelete(user); }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 className="h-3.5 w-3.5" /> Hapus Akun
          </button>
        </div>
      </DialogContent>
    </Dialog>
    </>
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
            { role: "admin", desc: "Moderasi konten, kelola artikel, dan persetujuan kontributor." },
            { role: "senior_contributor", desc: "≥10 artikel disetujui. Bisa menulis & mengirim artikel." },
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
  const [viewProfile, setViewProfile] = useState<Profile | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [banConfirm, setBanConfirm] = useState<Profile | null>(null);
  const [banning, setBanning] = useState(false);
  const [proConfirm, setProConfirm] = useState<Profile | null>(null);
  const [proLoading, setProLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch("/api/admin/users");
      setUsers(data);
      setSelected(new Set());
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const topRole = (roles: string[]) => {
    const order = ["admin", "senior_contributor", "contributor", "user"];
    return order.find(r => roles.includes(r)) ?? "user";
  };

  const setRole = async (userId: string, role: string) => {
    try {
      await adminFetch(`/api/admin/users/${userId}/role`, { method: "POST", body: JSON.stringify({ role }) });
      toast.success(`Role diubah ke ${ROLE_LABELS[role]}`);
      await load();
      setViewProfile(prev => prev?.user_id === userId ? { ...prev, roles: [role] } : prev);
    } catch (e: any) { toast.error(e.message); }
  };

  const deleteUser = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await adminFetch(`/api/admin/users/${deleteConfirm.user_id}`, { method: "DELETE" });
      toast.success(`Akun ${deleteConfirm.full_name ?? deleteConfirm.email} berhasil dihapus`);
      setDeleteConfirm(null);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const executeBanToggle = async () => {
    if (!banConfirm) return;
    setBanning(true);
    const isBanned = banConfirm.is_banned;
    try {
      await adminFetch(`/api/admin/users/${banConfirm.user_id}/${isBanned ? "unban" : "ban"}`, { method: "POST" });
      toast.success(isBanned ? `Ban dicabut dari ${banConfirm.full_name ?? banConfirm.email}` : `${banConfirm.full_name ?? banConfirm.email} berhasil dibanned`);
      setBanConfirm(null);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBanning(false);
    }
  };

  const executeProToggle = async () => {
    if (!proConfirm) return;
    setProLoading(true);
    const isPro = proConfirm.is_pro;
    const name = proConfirm.full_name ?? proConfirm.email ?? "User";
    try {
      if (isPro) {
        await adminFetch(`/api/admin/users/${proConfirm.user_id}/grant-pro`, { method: "DELETE" });
        toast.success(`Akses Pro dicabut dari ${name}`);
      } else {
        await adminFetch(`/api/admin/users/${proConfirm.user_id}/grant-pro`, {
          method: "POST",
          body: JSON.stringify({ plan: "pro_monthly", days: 30 }),
        });
        toast.success(`Akses Pro 30 hari diberikan ke ${name}`);
      }
      setProConfirm(null);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProLoading(false);
    }
  };

  const toggleLeaderboardVisibility = async (user: Profile) => {
    const hidden = !user.hidden_from_leaderboard;
    const name = user.full_name ?? user.email ?? "User";
    try {
      await adminFetch(`/api/master/users/${user.user_id}/leaderboard-visibility`, {
        method: "PATCH",
        body: JSON.stringify({ hidden }),
      });
      toast.success(hidden ? `${name} disembunyikan dari leaderboard` : `${name} ditampilkan kembali di leaderboard`);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const exportUsersCSV = async () => {
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch("/api/admin/export/users", { headers: { Authorization: authHeader } });
      if (!res.ok) throw new Error("Gagal export");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `aina_users_${Date.now()}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleSelect = (userId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  const filtered = users.filter(u =>
    !search ||
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredIds = filtered.map(u => u.user_id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selected.has(id));
  const someFilteredSelected = filteredIds.some(id => selected.has(id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        filteredIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        filteredIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const bulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const userIds = Array.from(selected);
      const result = await adminFetch("/api/admin/users/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ userIds }),
      });
      const successCount = result.success?.length ?? 0;
      const failCount = result.failed?.length ?? 0;
      if (successCount > 0) toast.success(`${successCount} akun berhasil dihapus`);
      if (failCount > 0) toast.error(`${failCount} akun gagal dihapus`);
      setBulkConfirm(false);
      setSelected(new Set());
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBulkDeleting(false);
    }
  };

  const selectedUsersInfo = users.filter(u => selected.has(u.user_id));

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Manajemen User</h2>
            <p className="text-sm text-muted-foreground">{users.length} akun terdaftar</p>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <Button
                size="sm"
                className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-8 text-xs"
                onClick={() => setBulkConfirm(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Hapus {selected.size} User
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={exportUsersCSV}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <button onClick={load} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama atau email..."
              className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40" />
          </div>
          {filtered.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition-colors ${
                allFilteredSelected
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : someFilteredSelected
                  ? "border-primary/20 bg-primary/5 text-primary/80"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className={`flex h-4 w-4 items-center justify-center rounded border ${
                allFilteredSelected ? "border-primary bg-primary" : someFilteredSelected ? "border-primary/60 bg-primary/20" : "border-border"
              }`}>
                {allFilteredSelected && <Check className="h-2.5 w-2.5 text-white" />}
                {someFilteredSelected && !allFilteredSelected && <div className="h-1.5 w-1.5 rounded-sm bg-primary" />}
              </div>
              Pilih Semua
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-card" />)}</div>
        ) : (
          <div className="space-y-2">
            {filtered.map(u => {
              const role = topRole(u.roles);
              const isSelected = selected.has(u.user_id);
              return (
                <div
                  key={u.id}
                  className={`flex w-full items-center gap-2 rounded-2xl border bg-card px-3 py-3 transition-colors ${
                    isSelected ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/20 hover:bg-card/80"
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelect(u.user_id); }}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      isSelected ? "border-primary bg-primary" : "border-border hover:border-primary/60"
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </button>

                  {/* User info — clickable to view profile */}
                  <button
                    onClick={() => setViewProfile(u)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <AvatarDisplay name={u.full_name} avatarUrl={u.avatar_url} size={9} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{u.full_name ?? "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email ?? "—"}</p>
                    </div>
                  </button>

                  <div className="ml-1 flex shrink-0 items-center gap-2">
                    <span className="hidden text-xs text-muted-foreground sm:block">{fmtDate(u.created_at)}</span>
                    {u.contribution_count > 0 && (
                      <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary sm:block">
                        {u.contribution_count} artikel
                      </span>
                    )}
                    {u.is_banned && (
                      <span className="flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
                        <ShieldOff className="h-3 w-3" /> Banned
                      </span>
                    )}
                    {u.hidden_from_leaderboard && (
                      <span className="hidden items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-xs text-orange-400 sm:flex">
                        <EyeOff className="h-3 w-3" /> Hidden
                      </span>
                    )}
                    <span className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${ROLE_COLORS[role]}`}>
                      {ROLE_LABELS[role]}
                    </span>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada user ditemukan.</p>}
          </div>
        )}
      </div>

      {viewProfile && (
        <UserProfileModal
          user={viewProfile}
          onClose={() => setViewProfile(null)}
          onSetRole={setRole}
          onDelete={u => { setViewProfile(null); setDeleteConfirm(u); }}
          onBanToggle={u => { setViewProfile(null); setBanConfirm(u); }}
          onProToggle={u => { setViewProfile(null); setProConfirm(u); }}
          onLeaderboardToggle={u => { setViewProfile(null); toggleLeaderboardVisibility(u); }}
        />
      )}

      {/* Grant / Revoke Pro Confirmation */}
      <Dialog open={!!proConfirm} onOpenChange={(open) => { if (!open && !proLoading) setProConfirm(null); }}>
        <DialogContent className="max-w-sm gap-4 p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-amber-400">
              <Crown className="h-4 w-4" />
              {proConfirm?.is_pro ? "Cabut Akses Pro" : "Beri Akses Pro"}
            </DialogTitle>
          </DialogHeader>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-sm font-medium text-foreground">{proConfirm?.full_name ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{proConfirm?.email ?? "—"}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            {proConfirm?.is_pro
              ? "Akses Pro akan segera dicabut dan user kembali ke akun Free."
              : "User akan mendapatkan akses Pro selama 30 hari tanpa biaya (manual grant)."}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="flex-1" onClick={() => setProConfirm(null)} disabled={proLoading}>
              Batal
            </Button>
            <Button size="sm" className="flex-1 bg-amber-600 hover:bg-amber-600/90 text-white" onClick={executeProToggle} disabled={proLoading}>
              {proLoading
                ? <><span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />Memproses...</>
                : proConfirm?.is_pro ? "Ya, Cabut Pro" : "Ya, Beri Pro 30 Hari"
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ban / Unban Confirmation */}
      <Dialog open={!!banConfirm} onOpenChange={(open) => { if (!open && !banning) setBanConfirm(null); }}>
        <DialogContent className="max-w-sm gap-4 p-5">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 text-base ${banConfirm?.is_banned ? "text-green-400" : "text-orange-400"}`}>
              {banConfirm?.is_banned ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
              {banConfirm?.is_banned ? "Cabut Ban" : "Ban Akun"}
            </DialogTitle>
          </DialogHeader>
          <div className={`rounded-xl border p-3 ${banConfirm?.is_banned ? "border-green-500/20 bg-green-500/5" : "border-orange-500/20 bg-orange-500/5"}`}>
            <p className="text-sm font-medium text-foreground">{banConfirm?.full_name ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{banConfirm?.email ?? "—"}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            {banConfirm?.is_banned
              ? "User ini akan bisa login dan menggunakan AINA lagi."
              : "User ini tidak akan bisa mengakses dashboard dan semua fitur AINA."}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="flex-1" onClick={() => setBanConfirm(null)} disabled={banning}>
              Batal
            </Button>
            <Button size="sm" className={`flex-1 ${banConfirm?.is_banned ? "bg-green-600 hover:bg-green-600/90" : "bg-orange-600 hover:bg-orange-600/90"} text-white`} onClick={executeBanToggle} disabled={banning}>
              {banning
                ? <><span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />{banConfirm?.is_banned ? "Mencabut..." : "Memban..."}</>
                : banConfirm?.is_banned ? "Ya, Cabut Ban" : "Ya, Ban Akun"
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Single Delete Confirmation */}
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

      {/* Bulk Delete Confirmation */}
      <Dialog open={bulkConfirm} onOpenChange={(open) => { if (!open && !bulkDeleting) setBulkConfirm(false); }}>
        <DialogContent className="max-w-sm gap-4 p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-destructive">
              <Trash2 className="h-4 w-4" />
              Hapus {selected.size} Akun Sekaligus
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
            {selectedUsersInfo.map(u => (
              <div key={u.user_id} className="flex items-center gap-2">
                <AvatarDisplay name={u.full_name} avatarUrl={u.avatar_url} size={9} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">{u.full_name ?? "—"}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{u.email ?? "—"}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Semua akun di atas akan dihapus permanen beserta seluruh data terkait. <span className="font-medium text-foreground">Tindakan ini tidak bisa dibatalkan.</span>
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="flex-1" onClick={() => setBulkConfirm(false)} disabled={bulkDeleting}>
              Batal
            </Button>
            <Button size="sm" className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={bulkDelete} disabled={bulkDeleting}>
              {bulkDeleting
                ? <><span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />Menghapus...</>
                : `Hapus ${selected.size} Akun`}
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
  const [filter, setFilter] = useState<"pending" | "article_reviewed" | "approved" | "rejected">("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch(`/api/admin/requests?status=${filter}`);
      setRequests(data);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handle = async (id: string, status: "approved" | "rejected" | "article_reviewed") => {
    setActing(id + status);
    try {
      await adminFetch(`/api/admin/requests/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ status, review_notes: reviewNotes[id] }),
      });
      const msg = status === "approved" ? "Disetujui — user jadi Kontributor!" : status === "rejected" ? "Pendaftaran ditolak" : "Artikel ditandai sudah diperiksa";
      toast.success(msg);
      load();
    } catch (e: any) { toast.error(e.message); }
    setActing(null);
  };

  const statusLabel: Record<string, string> = {
    pending: "Menunggu", article_reviewed: "Artikel Diperiksa", approved: "Disetujui", rejected: "Ditolak",
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">Pendaftaran Kontributor</h2>
        <p className="text-sm text-muted-foreground">Review artikel sampel dan kelola pengajuan menjadi kontributor.</p>
      </div>
      <div className="flex gap-1 rounded-xl border border-border bg-card p-1 overflow-x-auto">
        {(["pending", "article_reviewed", "approved", "rejected"] as const).map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${filter === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {statusLabel[t]}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-card" />)}</div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Clock className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Tidak ada pendaftaran {statusLabel[filter].toLowerCase()}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => {
            const isExpanded = expandedId === req.id;
            return (
              <div key={req.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <Initials name={req.full_name} />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{req.full_name}</p>
                      <p className="text-xs text-muted-foreground">{req.education}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Masuk {req.enrollment_year}</span>
                        <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{req.expertise}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_COLORS[req.status] ?? STATUS_COLORS.pending}`}>
                          {statusLabel[req.status] ?? req.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="shrink-0 text-right text-xs text-muted-foreground">{fmtDate(req.created_at)}</p>
                </div>

                {/* Reason */}
                {req.reason && (
                  <div className="rounded-xl bg-secondary/60 px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">Alasan</p>
                    <p className="text-sm text-foreground">{req.reason}</p>
                  </div>
                )}

                {/* Article */}
                {(req.article_content || req.article_file_url) && (
                  <div className="rounded-xl border border-border bg-secondary/40">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : req.id)}
                      className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-foreground"
                    >
                      <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Artikel Sampel</span>
                      <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
                    {isExpanded && (
                      <div className="border-t border-border px-3 py-2.5">
                        {req.article_content ? (
                          <p className="whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed">{req.article_content}</p>
                        ) : req.article_file_url ? (
                          <a href={req.article_file_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary hover:bg-primary/20 transition-colors">
                            <ExternalLink className="h-3.5 w-3.5" /> Buka file artikel
                          </a>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}

                {/* Portfolio */}
                {req.portfolio_link && (
                  <a href={req.portfolio_link} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" /> {req.portfolio_link}
                  </a>
                )}

                {/* Previous review notes */}
                {req.review_notes && (
                  <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 px-3 py-2">
                    <p className="text-xs font-medium text-blue-400 mb-0.5">Catatan Sebelumnya</p>
                    <p className="text-xs text-foreground">{req.review_notes}</p>
                  </div>
                )}

                {/* Action area — pending or article_reviewed */}
                {(req.status === "pending" || req.status === "article_reviewed") && (
                  <div className="space-y-2 pt-1 border-t border-border">
                    <textarea
                      value={reviewNotes[req.id] ?? ""}
                      onChange={e => setReviewNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                      placeholder="Catatan untuk pendaftar (opsional, akan disimpan)"
                      rows={2}
                      className="w-full resize-none rounded-xl border border-input bg-secondary px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <div className="flex flex-wrap gap-2">
                      {req.status === "pending" && (
                        <Button size="sm" variant="outline"
                          className="h-8 gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 text-xs"
                          disabled={!!acting}
                          onClick={() => handle(req.id, "article_reviewed")}>
                          <Eye className="h-3.5 w-3.5" /> Artikel Diperiksa
                        </Button>
                      )}
                      <Button size="sm" variant="outline"
                        className="h-8 gap-1.5 border-green-500/30 text-green-400 hover:bg-green-500/10 text-xs"
                        disabled={!!acting}
                        onClick={() => handle(req.id, "approved")}>
                        <Check className="h-3.5 w-3.5" /> Setujui
                      </Button>
                      <Button size="sm" variant="outline"
                        className="h-8 gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs"
                        disabled={!!acting}
                        onClick={() => handle(req.id, "rejected")}>
                        <X className="h-3.5 w-3.5" /> Tolak
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Bulk Import Dialog ─────────────────────────────── */
type ParsedArticle = {
  title: string; content: string; category: string; keywords: string;
  maps_url?: string; contact_number?: string;
};
type BulkStep = "paste" | "parsing" | "preview" | "importing" | "done";

/* ─── Telegram Bot Scraper Dialog (MTProto userbot) ─────── */
type TgScrapeStep = "creds" | "sending" | "otp" | "password" | "verifying" | "scraping" | "results" | "parsing" | "preview" | "importing" | "done";

function TelegramScraperDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [step, setStep]         = useState<TgScrapeStep>("creds");
  const [apiId, setApiId]       = useState("");
  const [apiHash, setApiHash]   = useState("");
  const [phone, setPhone]       = useState("");
  const [code, setCode]         = useState("");
  const [password, setPassword] = useState("");
  const [targetBot, setTargetBot] = useState("@PPMIMesir_bot");
  const [scraped, setScraped]   = useState<{ text: string; source: string }[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());
  const [articles, setArticles] = useState<ParsedArticle[]>([]);
  const [importResult, setImportResult] = useState<{ imported: number; total: number } | null>(null);
  const [error, setError]       = useState("");
  const [showGuide, setShowGuide] = useState(false);

  const reset = () => {
    setStep("creds"); setApiId(""); setApiHash(""); setPhone(""); setCode(""); setPassword("");
    setScraped([]); setSelectedIdx(new Set()); setArticles([]); setImportResult(null); setError(""); setShowGuide(false);
    adminFetch("/api/admin/telegram/userbot/disconnect", { method: "POST" }).catch(() => {});
  };
  const handleClose = () => { reset(); onClose(); };

  const handleSendCode = async () => {
    if (!apiId.trim() || !apiHash.trim() || !phone.trim()) { setError("Semua field wajib diisi"); return; }
    setStep("sending"); setError("");
    try {
      await adminFetch("/api/admin/telegram/userbot/start", {
        method: "POST",
        body: JSON.stringify({ apiId: parseInt(apiId), apiHash: apiHash.trim(), phone: phone.trim() }),
      });
      setStep("otp");
    } catch (e: any) { setError(e.message); setStep("creds"); }
  };

  const handleVerify = async () => {
    if (!code.trim()) { setError("Masukkan kode OTP"); return; }
    setStep("verifying"); setError("");
    try {
      const data = await adminFetch("/api/admin/telegram/userbot/verify", {
        method: "POST",
        body: JSON.stringify({ code: code.trim(), password: password.trim() || undefined }),
      });
      if (data.needsPassword) { setStep("password"); return; }
      setStep("scraping");
      await doScrape();
    } catch (e: any) { setError(e.message); setStep(password ? "password" : "otp"); }
  };

  const handleVerifyPassword = async () => {
    if (!password.trim()) { setError("Masukkan password Telegram"); return; }
    setStep("verifying"); setError("");
    try {
      await adminFetch("/api/admin/telegram/userbot/verify", {
        method: "POST",
        body: JSON.stringify({ code: code.trim(), password: password.trim() }),
      });
      setStep("scraping");
      await doScrape();
    } catch (e: any) { setError(e.message); setStep("password"); }
  };

  const doScrape = async () => {
    try {
      const data = await adminFetch("/api/admin/telegram/userbot/scrape", {
        method: "POST",
        body: JSON.stringify({ targetBot: targetBot.trim() }),
      });
      setScraped(data.messages || []);
      setSelectedIdx(new Set((data.messages || []).map((_: any, i: number) => i)));
      setStep("results");
    } catch (e: any) { setError(e.message); setStep("creds"); }
  };

  const handleParse = async () => {
    const chosen = scraped.filter((_, i) => selectedIdx.has(i));
    if (chosen.length === 0) { toast.error("Pilih minimal satu pesan"); return; }
    setStep("parsing");
    const combined = chosen.map(m => `[${m.source}]\n${m.text}`).join("\n\n---\n\n");
    try {
      const data = await adminFetch("/api/admin/articles/bulk-parse", {
        method: "POST", body: JSON.stringify({ rawText: combined }),
      });
      setArticles(data.articles.map((a: ParsedArticle) => ({ ...a, maps_url: "", contact_number: "" })));
      setStep("preview");
    } catch (e: any) { toast.error(e.message); setStep("results"); }
  };

  const handleImport = async () => {
    if (articles.length === 0) return;
    setStep("importing");
    try {
      const data = await adminFetch("/api/admin/articles/bulk-import", {
        method: "POST", body: JSON.stringify({ articles }),
      });
      setImportResult({ imported: data.imported, total: data.total });
      setStep("done"); onDone();
    } catch (e: any) { toast.error(e.message); setStep("preview"); }
  };

  const toggleMsg = (i: number) =>
    setSelectedIdx(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; });
  const toggleAllMsgs = () =>
    setSelectedIdx(prev => prev.size === scraped.length ? new Set() : new Set(scraped.map((_, i) => i)));
  const removeArticle = (i: number) => setArticles(prev => prev.filter((_, j) => j !== i));
  const updateArticle = (i: number, field: keyof ParsedArticle, val: string) =>
    setArticles(prev => prev.map((a, j) => j === i ? { ...a, [field]: val } : a));

  const isLoading = ["sending", "verifying", "scraping", "parsing", "importing"].includes(step);

  return (
    <Dialog open={open} onOpenChange={v => !v && !isLoading && handleClose()}>
      <DialogContent className="bg-card border-border max-w-xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2 text-base">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-sky-400 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.883 13.7l-2.963-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.268.859z"/></svg>
            Ambil Otomatis dari Bot Telegram
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4">

          {/* STEP: Credentials */}
          {(step === "creds" || step === "sending") && (
            <div className="space-y-4">
              <div className="rounded-xl bg-sky-500/8 border border-sky-500/20 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-sky-400">Cara kerja fitur ini</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Sistem login ke Telegram pakai akun kamu, lalu otomatis klik semua menu di bot target dan kumpulkan semua teksnya. Hasilnya langsung bisa diparse jadi artikel KB.
                </p>
              </div>

              {error && <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-xs text-red-400"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{error}</div>}

              {/* API credentials guide */}
              <div className="space-y-1">
                <button onClick={() => setShowGuide(v => !v)} className="text-xs text-primary/80 hover:text-primary flex items-center gap-1">
                  <ChevronRight className={`h-3 w-3 transition-transform ${showGuide ? "rotate-90" : ""}`} />
                  Cara dapat API ID &amp; API Hash
                </button>
                {showGuide && (
                  <div className="rounded-xl border border-border bg-secondary/50 p-3 text-xs text-muted-foreground space-y-1 leading-relaxed">
                    <p>1. Buka <strong className="text-foreground">my.telegram.org</strong> di browser</p>
                    <p>2. Login dengan nomor Telegram kamu</p>
                    <p>3. Klik <strong className="text-foreground">"API development tools"</strong></p>
                    <p>4. Isi form (App title &amp; Short name bebas), klik Create</p>
                    <p>5. Copy <strong className="text-foreground">App api_id</strong> dan <strong className="text-foreground">App api_hash</strong></p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">API ID</label>
                  <Input value={apiId} onChange={e => setApiId(e.target.value)} placeholder="12345678" className="bg-secondary text-sm font-mono" disabled={step === "sending"} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">API Hash</label>
                  <Input value={apiHash} onChange={e => setApiHash(e.target.value)} placeholder="abc123..." className="bg-secondary text-sm font-mono" disabled={step === "sending"} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Nomor HP Telegram (format internasional)</label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSendCode()} placeholder="+628123456789" className="bg-secondary text-sm" disabled={step === "sending"} />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Username Bot Target</label>
                <Input value={targetBot} onChange={e => setTargetBot(e.target.value)} placeholder="@PPMIMesir_bot" className="bg-secondary text-sm font-mono" disabled={step === "sending"} />
              </div>
            </div>
          )}

          {/* STEP: OTP */}
          {step === "otp" && (
            <div className="space-y-4">
              <div className="rounded-xl bg-green-500/8 border border-green-500/20 p-3">
                <p className="text-xs font-semibold text-green-400 mb-1">Kode OTP Terkirim!</p>
                <p className="text-xs text-muted-foreground">Cek aplikasi Telegram kamu — Telegram mengirim kode konfirmasi. Masukkan kodenya di bawah.</p>
              </div>
              {error && <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-xs text-red-400"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{error}</div>}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Kode OTP (dari Telegram)</label>
                <Input value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === "Enter" && handleVerify()} placeholder="12345" className="bg-secondary text-sm font-mono text-center text-lg tracking-widest" autoFocus maxLength={10} />
              </div>
            </div>
          )}

          {/* STEP: 2FA Password */}
          {step === "password" && (
            <div className="space-y-4">
              <div className="rounded-xl bg-yellow-500/8 border border-yellow-500/20 p-3">
                <p className="text-xs font-semibold text-yellow-400 mb-1">Verifikasi 2 Langkah Aktif</p>
                <p className="text-xs text-muted-foreground">Akun Telegrammu memiliki password 2FA. Masukkan password Telegrammu.</p>
              </div>
              {error && <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-xs text-red-400"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{error}</div>}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Password Telegram (2FA)</label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleVerifyPassword()} placeholder="Password..." className="bg-secondary text-sm" autoFocus />
              </div>
            </div>
          )}

          {/* STEP: Loading states */}
          {(step === "sending" || step === "verifying" || step === "scraping" || step === "parsing" || step === "importing") && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  {step === "sending" && "Mengirim kode ke Telegram..."}
                  {step === "verifying" && "Memverifikasi kode..."}
                  {step === "scraping" && "Membaca semua menu bot..."}
                  {step === "parsing" && "AI menganalisis konten..."}
                  {step === "importing" && "Mengimport ke Knowledge Base..."}
                </p>
                {step === "scraping" && (
                  <p className="text-xs text-muted-foreground mt-1">Proses ini butuh 1-3 menit. Sistem sedang klik satu per satu semua menu bot.</p>
                )}
              </div>
            </div>
          )}

          {/* STEP: Results — select messages */}
          {step === "results" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground"><strong className="text-foreground">{scraped.length}</strong> konten berhasil dikumpulkan dari bot</p>
                <button onClick={toggleAllMsgs} className="text-xs text-primary hover:opacity-80">
                  {selectedIdx.size === scraped.length ? "Batal Pilih Semua" : "Pilih Semua"}
                </button>
              </div>
              {scraped.length === 0 ? (
                <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                  Tidak ada teks yang berhasil dikumpulkan. Bot mungkin tidak memiliki konten teks atau semua menu pakai gambar.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {scraped.map((msg, i) => (
                    <div key={i} onClick={() => toggleMsg(i)}
                      className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-all ${selectedIdx.has(i) ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:bg-card/80"}`}
                    >
                      <div className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 ${selectedIdx.has(i) ? "border-primary bg-primary" : "border-border"}`}>
                        {selectedIdx.has(i) && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-primary/70 font-medium mb-0.5">{msg.source}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{msg.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground/60 text-center">{selectedIdx.size} dari {scraped.length} dipilih untuk diimport</p>
            </div>
          )}

          {/* STEP: Preview articles */}
          {step === "preview" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">AI menghasilkan <strong>{articles.length} artikel</strong>. Edit jika perlu.</p>
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {articles.map((art, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <input value={art.title} onChange={e => updateArticle(i, "title", e.target.value)}
                        className="flex-1 bg-transparent text-sm font-semibold text-foreground outline-none border-b border-border focus:border-primary/50 pb-0.5" />
                      <button onClick={() => removeArticle(i)} className="shrink-0 text-muted-foreground/40 hover:text-red-400 transition-colors"><X className="h-4 w-4" /></button>
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={art.category} onChange={e => updateArticle(i, "category", e.target.value)}
                        className="text-xs bg-secondary border border-border rounded-lg px-2 py-1 text-foreground focus:outline-none">
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{art.content.slice(0, 200)}…</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP: Done */}
          {step === "done" && importResult && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15">
                <CheckCircle2 className="h-7 w-7 text-green-400" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Selesai!</p>
                <p className="text-sm text-muted-foreground mt-1">{importResult.imported} dari {importResult.total} artikel berhasil masuk ke Knowledge Base.</p>
              </div>
              <Button size="sm" onClick={handleClose}>Tutup</Button>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isLoading && step !== "done" && (
          <div className="shrink-0 flex items-center justify-between gap-2 border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={handleClose}>Batal</Button>
            <div>
              {step === "creds" && (
                <Button size="sm" onClick={handleSendCode} disabled={!apiId || !apiHash || !phone} className="bg-sky-500 hover:bg-sky-600 text-white gap-1.5">
                  Kirim Kode OTP
                </Button>
              )}
              {step === "otp" && (
                <Button size="sm" onClick={handleVerify} disabled={!code} className="bg-sky-500 hover:bg-sky-600 text-white">
                  Verifikasi &amp; Mulai Scan
                </Button>
              )}
              {step === "password" && (
                <Button size="sm" onClick={handleVerifyPassword} disabled={!password} className="bg-sky-500 hover:bg-sky-600 text-white">
                  Konfirmasi Password
                </Button>
              )}
              {step === "results" && scraped.length > 0 && (
                <Button size="sm" onClick={handleParse} disabled={selectedIdx.size === 0} className="bg-gradient-purple text-primary-foreground gap-1.5">
                  <Wand2 className="h-3.5 w-3.5" /> Parse {selectedIdx.size} Konten dengan AI
                </Button>
              )}
              {step === "preview" && (
                <Button size="sm" onClick={handleImport} disabled={articles.length === 0} className="bg-gradient-purple text-primary-foreground gap-1.5">
                  <FileUp className="h-3.5 w-3.5" /> Import {articles.length} Artikel ke KB
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


function BulkImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<BulkStep>("paste");
  const [rawText, setRawText] = useState("");
  const [articles, setArticles] = useState<ParsedArticle[]>([]);
  const [importResult, setImportResult] = useState<{ imported: number; total: number } | null>(null);
  const [parseError, setParseError] = useState("");

  const fileInputRef  = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageLoading, setImageLoading] = useState(false);

  const reset = () => { setStep("paste"); setRawText(""); setArticles([]); setImportResult(null); setParseError(""); };

  const handleClose = () => { reset(); onClose(); };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRawText(text || "");
      toast.success(`File "${file.name}" berhasil dimuat`);
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Ukuran gambar maksimal 10 MB"); return; }
    setImageLoading(true);
    try {
      const auth = await getAuthHeader();
      const form = new FormData();
      form.append("image", file);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch("/api/admin/articles/image-extract", {
        method: "POST",
        headers: { Authorization: auth },
        body: form,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Gagal" }));
        throw new Error(err.error || "Gagal membaca gambar");
      }
      const data = await res.json();
      setRawText(prev => prev ? prev + "\n\n" + data.text : data.text);
      toast.success(`Teks dari gambar berhasil diekstrak`);
    } catch (e: any) {
      toast.error(e.message || "Gagal memproses gambar");
    } finally {
      setImageLoading(false);
      e.target.value = "";
    }
  };

  const handleParse = async () => {
    if (!rawText.trim()) { toast.error("Paste teks dulu!"); return; }
    setStep("parsing"); setParseError("");
    try {
      const data = await adminFetch("/api/admin/articles/bulk-parse", {
        method: "POST", body: JSON.stringify({ rawText }),
      });
      setArticles(data.articles.map((a: ParsedArticle) => ({ ...a, maps_url: "", contact_number: "" })));
      setStep("preview");
    } catch (e: any) {
      setParseError(e.message || "Gagal memproses teks");
      setStep("paste");
    }
  };

  const handleImport = async () => {
    if (articles.length === 0) return;
    setStep("importing");
    try {
      const data = await adminFetch("/api/admin/articles/bulk-import", {
        method: "POST", body: JSON.stringify({ articles }),
      });
      setImportResult({ imported: data.imported, total: data.total });
      if (data.errors?.length) data.errors.forEach((e: string) => console.warn("[bulk-import]", e));
      setStep("done");
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Gagal import artikel");
      setStep("preview");
    }
  };

  const removeArticle = (idx: number) => setArticles(prev => prev.filter((_, i) => i !== idx));
  const updateArticle = (idx: number, field: keyof ParsedArticle, val: string) =>
    setArticles(prev => prev.map((a, i) => i === idx ? { ...a, [field]: val } : a));

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            Import Massal ke Knowledge Base
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {[
            { id: "paste", label: "1. Paste Teks" },
            { id: "preview", label: "2. Preview & Edit" },
            { id: "done", label: "3. Selesai" },
          ].map((s, i, arr) => (
            <span key={s.id} className="flex items-center gap-1">
              <span className={`font-medium ${step === s.id || (step === "parsing" && s.id === "paste") || (step === "importing" && s.id === "preview") ? "text-primary" : ""}`}>
                {s.label}
              </span>
              {i < arr.length - 1 && <ChevronRight className="h-3 w-3 opacity-40" />}
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
          {/* STEP 1: Paste */}
          {(step === "paste" || step === "parsing") && (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Upload file <code className="text-xs bg-secondary px-1 py-0.5 rounded">.txt</code> atau gambar screenshot, atau paste teks langsung. AI otomatis ekstrak dan pecah jadi artikel KB.
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={step === "parsing" || imageLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    .txt
                  </button>
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    disabled={step === "parsing" || imageLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-dashed border-sky-500/40 bg-sky-500/5 hover:bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-400 transition-colors disabled:opacity-50"
                  >
                    {imageLoading
                      ? <><div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" /> Membaca...</>
                      : <><Image className="h-3.5 w-3.5" /> Gambar</>
                    }
                  </button>
                  <input ref={fileInputRef}  type="file" accept=".txt,text/plain" className="hidden" onChange={handleFileUpload} />
                  <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </div>
              </div>
              {parseError && (
                <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{parseError}</span>
                </div>
              )}
              <Textarea
                placeholder={"Contoh:\nQ: Apa syarat daftar kartu pelajar?\nA: Syaratnya adalah...\n\nQ: Bagaimana cara perpanjang iqomah?\nA: Langkah-langkahnya..."}
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                className="min-h-[280px] bg-secondary resize-none font-mono text-xs"
                disabled={step === "parsing"}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{rawText.length.toLocaleString()} / 50.000 karakter</span>
                <span className="text-xs text-muted-foreground">Teks bisa berupa Q&A, FAQ, panduan, atau narasi biasa</span>
              </div>
            </div>
          )}

          {/* STEP 2: Preview */}
          {(step === "preview" || step === "importing") && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  AI menemukan <span className="text-foreground font-medium">{articles.length} artikel</span>. Edit judul/kategori sebelum import, atau hapus yang tidak relevan.
                </p>
                <button onClick={() => setStep("paste")} className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
                  ← Ubah teks
                </button>
              </div>
              <div className="space-y-3">
                {articles.map((art, idx) => (
                  <div key={idx} className="rounded-xl border border-border bg-secondary/30 p-3 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0 space-y-2">
                        <input
                          value={art.title}
                          onChange={e => updateArticle(idx, "title", e.target.value)}
                          className="w-full bg-secondary rounded-lg px-3 py-1.5 text-sm font-medium border border-border/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
                          placeholder="Judul artikel"
                          disabled={step === "importing"}
                        />
                        <div className="flex gap-2 items-center">
                          <Select value={art.category} onValueChange={v => updateArticle(idx, "category", v)} disabled={step === "importing"}>
                            <SelectTrigger className="h-7 text-xs bg-secondary w-auto min-w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {art.keywords && (
                            <span className="text-[11px] text-muted-foreground truncate max-w-[200px]" title={art.keywords}>
                              🏷 {art.keywords.split(",").slice(0, 3).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => removeArticle(idx)}
                        disabled={step === "importing"}
                        className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                        title="Hapus artikel ini"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="text-xs text-muted-foreground bg-secondary/60 rounded-lg p-2.5 max-h-[80px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
                      {art.content.slice(0, 300)}{art.content.length > 300 ? "…" : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP: Done */}
          {step === "done" && importResult && (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-400" />
              <div>
                <p className="text-lg font-semibold text-foreground">Import Berhasil!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {importResult.imported} dari {importResult.total} artikel berhasil ditambahkan ke Knowledge Base dengan status <span className="text-primary font-medium">Disetujui</span>.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Artikel sudah langsung tersedia untuk AINA — tidak perlu review manual.
              </p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex gap-2 pt-2 border-t border-border shrink-0">
          {step === "done" ? (
            <Button onClick={handleClose} className="flex-1 bg-gradient-purple text-primary-foreground hover:opacity-90">Selesai</Button>
          ) : step === "paste" ? (
            <>
              <Button variant="outline" onClick={handleClose} className="flex-1">Batal</Button>
              <Button
                onClick={handleParse}
                disabled={!rawText.trim() || rawText.length > 50_000}
                className="flex-1 bg-gradient-purple text-primary-foreground hover:opacity-90 gap-2"
              >
                <Wand2 className="h-4 w-4" /> Parse dengan AI
              </Button>
            </>
          ) : step === "parsing" ? (
            <div className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground py-1">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              AI sedang menganalisis teks...
            </div>
          ) : step === "preview" ? (
            <>
              <Button variant="outline" onClick={() => setStep("paste")} className="flex-1">← Ubah Teks</Button>
              <Button
                onClick={handleImport}
                disabled={articles.length === 0}
                className="flex-1 bg-gradient-purple text-primary-foreground hover:opacity-90 gap-2"
              >
                <FileUp className="h-4 w-4" /> Import {articles.length} Artikel
              </Button>
            </>
          ) : step === "importing" ? (
            <div className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground py-1">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Mengimpor artikel ke Knowledge Base...
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ArticleFormDialog({
  open, onClose, onSave, initial,
}: {
  open: boolean; onClose: () => void;
  onSave: (data: { title: string; content: string; category: string; maps_url?: string; contact_number?: string }) => Promise<void>;
  initial?: { title: string; content: string; category: string; maps_url?: string; contact_number?: string };
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [mapsUrl, setMapsUrl] = useState(initial?.maps_url ?? "");
  const [contactNumber, setContactNumber] = useState(initial?.contact_number ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? "");
      setContent(initial?.content ?? "");
      setCategory(initial?.category ?? "");
      setMapsUrl(initial?.maps_url ?? "");
      setContactNumber(initial?.contact_number ?? "");
    }
  }, [open, initial]);

  const handleSave = async () => {
    if (!title.trim() || !content.trim() || !category) { toast.error("Semua field harus diisi"); return; }
    setSaving(true);
    await onSave({ title: title.trim(), content: content.trim(), category, maps_url: mapsUrl.trim() || undefined, contact_number: contactNumber.trim() || undefined });
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
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              🗺️ Link Google Maps <span className="text-[11px] font-normal text-muted-foreground/60">(opsional)</span>
            </label>
            <Input
              placeholder="https://maps.google.com/?q=..."
              value={mapsUrl}
              onChange={e => setMapsUrl(e.target.value)}
              className="bg-secondary text-xs"
            />
            <p className="text-[11px] text-muted-foreground/60">
              Tambahkan link lokasi jika artikel ini terkait tempat tertentu (KBRI, kampus, masjid, dll). AINA akan otomatis menyertakan peta saat menjawab pertanyaan berbasis artikel ini.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              📞 Nomor Telepon / WhatsApp <span className="text-[11px] font-normal text-muted-foreground/60">(opsional)</span>
            </label>
            <Input
              type="tel"
              placeholder="+62 812-3456-7890 atau +20 100-123-4567"
              value={contactNumber}
              onChange={e => setContactNumber(e.target.value)}
              maxLength={50}
              className="bg-secondary text-xs"
            />
            <p className="text-[11px] text-muted-foreground/60">
              Nomor kontak terkait artikel (KBRI, imigrasi, dll). AINA akan menyebutkan nomor ini saat menjawab pertanyaan soal kontak.
            </p>
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
function KnowledgeBaseTab({ isMasterAdmin }: { isMasterAdmin: boolean }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editArticle, setEditArticle] = useState<Article | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [reformatLoading, setReformatLoading] = useState(false);
  const [reformattingId, setReformattingId] = useState<string | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [scraperOpen, setScraperOpen] = useState(false);

  const handleReformatOne = async (id: string) => {
    setReformattingId(id);
    try {
      await adminFetch(`/api/admin/articles/${id}/reformat`, { method: "POST" });
      toast.success("Artikel berhasil diformat ulang");
      load();
    } catch (e: any) { toast.error(e.message); }
    setReformattingId(null);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const data = await adminFetch(`/api/admin/articles?status=${filter}`);
      setArticles(data);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelected(new Set()); }, [categoryFilter]);

  const handleReformatAll = async () => {
    if (!confirm(`Yakin ingin reformat semua artikel yang sudah disetujui? AI akan merapikan struktur tulisan tanpa mengubah isi. Proses ini butuh waktu beberapa menit.`)) return;
    setReformatLoading(true);
    try {
      const result = await adminFetch("/api/admin/articles/reformat-all", { method: "POST" });
      toast.success(`Selesai! ${result.reformatted} artikel berhasil diformat${result.failed > 0 ? `, ${result.failed} gagal` : ""}.`);
      load();
    } catch (e: any) { toast.error(e.message); }
    setReformatLoading(false);
  };

  const handleReview = async (id: string, status: "approved" | "rejected") => {
    try {
      await adminFetch(`/api/admin/articles/${id}/review`, { method: "POST", body: JSON.stringify({ status }) });
      toast.success(status === "approved" ? "Artikel disetujui dan dipublikasikan" : "Artikel ditolak");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleBulkReview = async (status: "approved" | "rejected") => {
    if (selected.size === 0) return;
    const label = status === "approved" ? "menyetujui" : "menolak";
    if (!confirm(`Yakin ${label} ${selected.size} artikel sekaligus?`)) return;
    setBulkLoading(true);
    try {
      const { updated } = await adminFetch("/api/admin/articles/bulk-review", {
        method: "POST",
        body: JSON.stringify({ ids: Array.from(selected), status }),
      });
      toast.success(status === "approved"
        ? `${updated} artikel disetujui dan dipublikasikan`
        : `${updated} artikel ditolak`);
      load();
    } catch (e: any) { toast.error(e.message); }
    setBulkLoading(false);
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Yakin hapus ${selected.size} artikel sekaligus? Tindakan ini tidak bisa dibatalkan.`)) return;
    setBulkLoading(true);
    try {
      const { deleted } = await adminFetch("/api/admin/articles/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      toast.success(`${deleted} artikel berhasil dihapus`);
      load();
    } catch (e: any) { toast.error(e.message); }
    setBulkLoading(false);
  };

  const handleAdd = async (data: { title: string; content: string; category: string; maps_url?: string; contact_number?: string }) => {
    try {
      await adminFetch("/api/admin/articles", { method: "POST", body: JSON.stringify(data) });
      toast.success("Artikel ditambahkan!");
      setAddOpen(false);
      if (filter === "approved") load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleEdit = async (data: { title: string; content: string; category: string; maps_url?: string; contact_number?: string }) => {
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

  const handleToggleHidden = async (art: Article) => {
    const newHidden = !art.hidden;
    try {
      await adminFetch(`/api/admin/articles/${art.id}/visibility`, {
        method: "PATCH",
        body: JSON.stringify({ hidden: newHidden }),
      });
      toast.success(newHidden ? "Artikel disembunyikan dari publik" : "Artikel ditampilkan kembali di publik");
      setArticles(prev => prev.map(a => a.id === art.id ? { ...a, hidden: newHidden } : a));
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const tabs: Array<"pending" | "approved" | "rejected"> = ["pending", "approved", "rejected"];

  const filtered = articles.filter(a => {
    const matchSearch = !searchQuery ||
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory = categoryFilter === "all" || a.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  const filteredIds = filtered.map(a => a.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every(id => selected.has(id));
  const someSelected = filteredIds.some(id => selected.has(id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        filteredIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        filteredIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <div>
          <h2 className="font-display text-base font-bold text-foreground sm:text-lg">Moderasi Knowledge Base</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">Review, terbitkan, dan tambah artikel langsung.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isMasterAdmin && (
            <>
              <Button
                variant="outline" size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={reformatLoading}
                onClick={handleReformatAll}
              >
                {reformatLoading
                  ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" /> Memformat...</>
                  : <><RefreshCw className="h-3.5 w-3.5" /> Reformat</>
                }
              </Button>
              <Button
                variant="outline" size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={async () => {
                  try {
                    const authHeader = await getAuthHeader();
                    const res = await fetch("/api/admin/export/articles", { headers: { Authorization: authHeader } });
                    if (!res.ok) throw new Error("Gagal export");
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = `aina_articles_${Date.now()}.csv`; a.click();
                    URL.revokeObjectURL(url);
                  } catch (e: any) { toast.error(e.message); }
                }}
              >
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </>
          )}
          <Button onClick={() => setScraperOpen(true)} size="sm" variant="outline" className="gap-1.5 border-sky-500/30 text-sky-400 hover:bg-sky-500/10">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.883 13.7l-2.963-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.268.859z"/></svg>
            Ambil dari Bot
          </Button>
          <Button onClick={() => setBulkImportOpen(true)} size="sm" variant="outline" className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10">
            <Wand2 className="h-3.5 w-3.5" /> Import Massal
          </Button>
          <Button onClick={() => setAddOpen(true)} size="sm" className="gap-1.5 bg-gradient-purple text-primary-foreground hover:opacity-90">
            <Plus className="h-4 w-4" /> Tambah Artikel
          </Button>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
        {tabs.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${filter === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "pending" ? "Menunggu" : t === "approved" ? "Disetujui" : "Ditolak"}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Cari artikel..."
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-auto min-w-[130px] rounded-xl border-border bg-card text-sm">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
            <SelectValue placeholder="Semua Kategori" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Kategori</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!loading && filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <div className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${
              allSelected ? "border-primary bg-primary" : someSelected ? "border-primary/60 bg-primary/20" : "border-border"
            }`}>
              {allSelected && <Check className="h-2.5 w-2.5 text-white" />}
              {someSelected && !allSelected && <div className="h-1.5 w-1.5 rounded-sm bg-primary" />}
            </div>
            {selected.size > 0
              ? `${selected.size} artikel dipilih`
              : "Pilih semua"}
          </button>

          {selected.size > 0 && (
            <div className="flex flex-wrap gap-2">
              {filter === "pending" && (
                <>
                  <Button
                    size="sm" disabled={bulkLoading}
                    className="h-7 gap-1.5 bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 text-xs"
                    variant="outline"
                    onClick={() => handleBulkReview("approved")}
                  >
                    <Check className="h-3 w-3" /> Setujui {selected.size}
                  </Button>
                  <Button
                    size="sm" disabled={bulkLoading}
                    className="h-7 gap-1.5 bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 text-xs"
                    variant="outline"
                    onClick={() => handleBulkReview("rejected")}
                  >
                    <X className="h-3 w-3" /> Tolak {selected.size}
                  </Button>
                </>
              )}
              {(filter !== "approved" || isMasterAdmin) && (
                <Button
                  size="sm" disabled={bulkLoading}
                  className="h-7 gap-1.5 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs"
                  variant="outline"
                  onClick={handleBulkDelete}
                >
                  <Trash2 className="h-3 w-3" /> Hapus {selected.size}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-card" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <BookOpen className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {searchQuery || categoryFilter !== "all"
              ? "Tidak ada artikel yang cocok dengan filter."
              : `Tidak ada artikel ${filter === "pending" ? "menunggu review" : filter === "approved" ? "yang disetujui" : "yang ditolak"}.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(art => {
            const isSelected = selected.has(art.id);
            return (
              <div
                key={art.id}
                className={`rounded-2xl border bg-card p-4 transition-colors ${
                  isSelected ? "border-primary/40 bg-primary/5" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <button
                      onClick={() => toggleSelect(art.id)}
                      className={`mt-0.5 shrink-0 h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected ? "border-primary bg-primary" : "border-border hover:border-primary/60"
                      }`}
                    >
                      {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[art.category] ?? "bg-secondary text-muted-foreground"}`}>
                          {art.category}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_COLORS[art.status]}`}>
                          {art.status === "pending" ? "Menunggu" : art.status === "approved" ? "Disetujui" : "Ditolak"}
                        </span>
                        {art.hidden && (
                          <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-xs text-orange-400 flex items-center gap-1">
                            <EyeOff className="h-2.5 w-2.5" /> Tersembunyi
                          </span>
                        )}
                        {art.title?.startsWith("[Koreksi AI]") && (
                          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400 flex items-center gap-1">
                            ✏️ Koreksi AI
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">{fmtDate(art.created_at)}</span>
                      </div>
                      <h3 className="mt-1.5 font-medium text-foreground">{art.title}</h3>
                      {(art.author_name || art.author_email) && (
                        <p className="mt-0.5 text-xs text-muted-foreground/70">
                          Oleh: <span className="font-medium text-muted-foreground">{art.author_name ?? art.author_email}</span>
                          {art.author_name && art.author_email && (
                            <span className="ml-1">({art.author_email})</span>
                          )}
                        </p>
                      )}
                      {expanded === art.id ? (
                        <div className="mt-2 text-sm text-muted-foreground prose prose-sm prose-invert max-w-none
                          prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
                          prose-p:my-1 prose-p:leading-relaxed
                          prose-ul:my-1 prose-ul:pl-4 prose-li:my-0.5
                          prose-ol:my-1 prose-ol:pl-4
                          prose-strong:text-foreground prose-strong:font-semibold
                          prose-em:text-muted-foreground/80
                          prose-code:text-primary prose-code:bg-secondary prose-code:px-1 prose-code:rounded prose-code:text-xs
                          prose-hr:border-border">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{art.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {art.content}
                        </p>
                      )}
                      <button onClick={() => setExpanded(expanded === art.id ? null : art.id)} className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline">
                        <Eye className="h-3 w-3" />
                        {expanded === art.id ? "Tampilkan lebih sedikit" : "Baca selengkapnya"}
                      </button>
                    </div>
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
                    {isMasterAdmin && art.status === "approved" && (
                      <Button
                        size="sm" variant="outline"
                        className={`h-8 gap-1 ${art.hidden ? "border-orange-500/30 text-orange-400 hover:bg-orange-500/10" : "border-border text-muted-foreground hover:text-foreground"}`}
                        onClick={() => handleToggleHidden(art)}
                        title={art.hidden ? "Tampilkan ke publik" : "Sembunyikan dari publik"}
                      >
                        {art.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                    {isMasterAdmin && art.status === "approved" && (
                      <Button
                        size="sm" variant="outline"
                        className="h-8 gap-1 text-muted-foreground hover:text-foreground"
                        disabled={reformattingId === art.id}
                        onClick={() => handleReformatOne(art.id)}
                        title="Reformat artikel ini dengan AI"
                      >
                        {reformattingId === art.id
                          ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          : <RefreshCw className="h-3.5 w-3.5" />
                        }
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-8 gap-1 text-muted-foreground hover:text-foreground" onClick={() => setEditArticle(art)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {(art.status !== "approved" || isMasterAdmin) && (
                      <Button size="sm" variant="outline" className="h-8 gap-1 border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => handleDelete(art.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ArticleFormDialog open={addOpen} onClose={() => setAddOpen(false)} onSave={handleAdd} />
      <ArticleFormDialog
        open={!!editArticle} onClose={() => setEditArticle(null)} onSave={handleEdit}
        initial={editArticle ? { title: editArticle.title, content: editArticle.content, category: editArticle.category, maps_url: editArticle.maps_url ?? "", contact_number: editArticle.contact_number ?? "" } : undefined}
      />
      <BulkImportDialog
        open={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        onDone={() => { load(); toast.success("Artikel berhasil diimport ke Knowledge Base!"); }}
      />
      <TelegramScraperDialog
        open={scraperOpen}
        onClose={() => setScraperOpen(false)}
        onDone={() => { load(); toast.success("Konten bot berhasil diimport ke Knowledge Base!"); }}
      />
    </div>
  );
}

/* ─── Markdown components for chat monitor ────────────── */
const MONITOR_MD = {
  br: () => <br />,
  p: ({ children }: any) => <p className="mb-2 last:mb-0 break-words leading-relaxed">{children}</p>,
  strong: ({ children }: any) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }: any) => <em className="italic text-muted-foreground/80">{children}</em>,
  ul: ({ children }: any) => <ul className="mb-2 ml-4 list-disc space-y-0.5">{children}</ul>,
  ol: ({ children }: any) => <ol className="mb-2 ml-4 list-decimal space-y-0.5">{children}</ol>,
  li: ({ children }: any) => <li className="leading-relaxed break-words">{children}</li>,
  h1: ({ children }: any) => <h1 className="mb-1.5 mt-3 text-sm font-bold text-foreground first:mt-0">{children}</h1>,
  h2: ({ children }: any) => <h2 className="mb-1 mt-2.5 text-sm font-bold text-foreground first:mt-0">{children}</h2>,
  h3: ({ children }: any) => <h3 className="mb-1 mt-2 text-xs font-semibold text-foreground first:mt-0">{children}</h3>,
  code: ({ children, className }: any) => {
    if (className?.includes("language-")) return <code className={className}>{children}</code>;
    return <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[11px] text-foreground break-all">{children}</code>;
  },
  pre: ({ children }: any) => (
    <div className="mb-2 overflow-x-auto rounded-lg bg-muted/60">
      <pre className="p-2.5 font-mono text-[11px] text-foreground">{children}</pre>
    </div>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="mb-2 border-l-2 border-primary/40 pl-3 text-muted-foreground">{children}</blockquote>
  ),
  hr: () => <hr className="my-2 border-border/50" />,
};

/* ─── Chat Monitor Tab (Master Admin only) ───────────── */
interface ChatEntry {
  id: string;
  title: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  profile: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
  lastUserMessage: string | null;
}
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

function ChatMonitorTab() {
  const [chats, setChats] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selected, setSelected] = useState<ChatEntry | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async (q = "") => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      const params = new URLSearchParams({ limit: "50", ...(q ? { search: q } : {}) });
      const data = await adminFetch(`/api/admin/chats?${params}`);
      setChats(data);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    load(searchInput);
  };

  const openChat = async (chat: ChatEntry) => {
    setSelected(chat);
    setMessages([]);
    setMsgLoading(true);
    try {
      const data = await adminFetch(`/api/admin/chats/${chat.id}/messages`);
      setMessages(data);
    } catch (e: any) { toast.error(e.message); }
    setMsgLoading(false);
  };

  const toggleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === chats.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(chats.map(c => c.id)));
    }
  };

  const deleteChat = async (chatId: string) => {
    setDeletingId(chatId);
    try {
      await adminFetch(`/api/admin/chats/${chatId}`, { method: "DELETE" });
      setChats(prev => prev.filter(c => c.id !== chatId));
      setSelectedIds(prev => { const n = new Set(prev); n.delete(chatId); return n; });
      setSelected(null);
      toast.success("Chat berhasil dihapus");
    } catch (e: any) { toast.error(e.message); }
    setDeletingId(null);
  };

  const bulkDeleteSelected = async () => {
    if (!window.confirm(`Hapus ${selectedIds.size} chat yang dipilih secara permanen?`)) return;
    setBulkDeleting(true);
    try {
      const data = await adminFetch("/api/admin/chats/bulk-selected", {
        method: "DELETE",
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      toast.success(`${data.deleted} chat berhasil dihapus`);
      load(search);
    } catch (e: any) { toast.error(e.message); }
    setBulkDeleting(false);
  };

  const bulkDeleteOld = async () => {
    setBulkDeleting(true);
    setConfirmBulk(false);
    try {
      const data = await adminFetch("/api/admin/chats/bulk-old?days=90", { method: "DELETE" });
      toast.success(`${data.deleted} chat lama (>90 hari) berhasil dihapus`);
      load(search);
    } catch (e: any) { toast.error(e.message); }
    setBulkDeleting(false);
  };

  const allSelected = chats.length > 0 && selectedIds.size === chats.length;
  const someSelected = selectedIds.size > 0;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Monitor Chat</h2>
            <p className="text-sm text-muted-foreground">{chats.length} percakapan terbaru</p>
          </div>
          <div className="flex items-center gap-2">
            {confirmBulk ? (
              <div className="flex items-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-1.5">
                <span className="text-xs text-destructive">Hapus semua &gt;90 hari?</span>
                <button onClick={bulkDeleteOld} disabled={bulkDeleting} className="text-xs font-semibold text-destructive hover:underline">Ya</button>
                <span className="text-xs text-muted-foreground">·</span>
                <button onClick={() => setConfirmBulk(false)} className="text-xs text-muted-foreground hover:text-foreground">Batal</button>
              </div>
            ) : (
              <button onClick={() => setConfirmBulk(true)} disabled={bulkDeleting}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-destructive/40 hover:text-destructive transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
                Hapus Lama
              </button>
            )}
            <button onClick={() => load(search)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSearch} className="relative flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Cari nama, email, atau isi pesan..."
              className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
          <button type="submit" className="rounded-xl border border-border bg-card px-4 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            Cari
          </button>
        </form>

        {/* Bulk action bar */}
        {someSelected && (
          <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <button onClick={toggleSelectAll} className="text-xs text-primary hover:underline">
                {allSelected ? "Batal Pilih Semua" : "Pilih Semua"}
              </button>
              <span className="text-xs text-muted-foreground">{selectedIds.size} dipilih</span>
            </div>
            <button
              onClick={bulkDeleteSelected}
              disabled={bulkDeleting}
              className="flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
            >
              {bulkDeleting ? <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" /> : <Trash2 className="h-3.5 w-3.5" />}
              Hapus {selectedIds.size} Chat
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-card" />)}</div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Tidak ada chat ditemukan.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Select all row */}
            {chats.length > 1 && (
              <div className="flex items-center gap-3 px-1 pb-1">
                <button
                  onClick={toggleSelectAll}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${allSelected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-transparent hover:border-primary/50"}`}
                >
                  <Check className="h-3 w-3" />
                </button>
                <span className="text-xs text-muted-foreground">{allSelected ? "Batal pilih semua" : "Pilih semua"}</span>
              </div>
            )}
            {chats.map(c => {
              const isSelected = selectedIds.has(c.id);
              return (
                <div key={c.id}
                  className={`flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 transition-colors ${isSelected ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/30 hover:bg-card/80"}`}>
                  {/* Checkbox */}
                  <button
                    onClick={e => toggleSelect(e, c.id)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-transparent hover:border-primary/50"}`}
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  {/* Chat row — click to open */}
                  <button onClick={() => openChat(c)} className="flex flex-1 items-center gap-3 min-w-0 text-left">
                    <AvatarDisplay name={c.profile?.full_name ?? null} avatarUrl={c.profile?.avatar_url ?? null} size={9} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{c.profile?.full_name ?? c.profile?.email ?? "Pengguna"}</p>
                        <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(c.updated_at)}</span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{c.title}</p>
                      {c.lastUserMessage && (
                        <p className="truncate text-xs text-muted-foreground/60 mt-0.5">"{c.lastUserMessage}"</p>
                      )}
                    </div>
                    <Eye className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Conversation Viewer Dialog */}
      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl gap-0 p-0 overflow-hidden max-h-[90vh] flex flex-col">
          {selected && (
            <>
              {/* Header — no delete button here anymore */}
              <div className="flex items-center gap-3 border-b border-border p-4 shrink-0">
                <AvatarDisplay name={selected.profile?.full_name ?? null} avatarUrl={selected.profile?.avatar_url ?? null} size={9} />
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-sm font-semibold text-foreground truncate">{selected.profile?.full_name ?? selected.profile?.email ?? "Pengguna"}</DialogTitle>
                  <p className="text-xs text-muted-foreground truncate">{selected.title}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(selected.updated_at)}</span>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {msgLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada pesan.</p>
                ) : (
                  messages.map(m => (
                    <div key={m.id} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      {m.role === "assistant" && (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 mt-0.5">
                          <Shield className="h-3.5 w-3.5 text-white" />
                        </div>
                      )}
                      {m.role === "user" ? (
                        <div className="max-w-[70%] rounded-2xl bg-primary px-3 py-2 text-xs leading-relaxed text-primary-foreground">
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                          <p className="mt-1 text-[10px] text-primary-foreground/60">
                            {new Date(m.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      ) : (
                        <div className="max-w-[85%] rounded-2xl bg-secondary px-3 py-2.5 text-xs text-secondary-foreground">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MONITOR_MD}>
                            {m.content}
                          </ReactMarkdown>
                          <p className="mt-1.5 text-[10px] text-muted-foreground/60">
                            {new Date(m.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      )}
                      {m.role === "user" && (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted mt-0.5">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Footer with delete button */}
              <div className="shrink-0 border-t border-border px-4 py-3 flex justify-end">
                <button
                  onClick={() => {
                    if (window.confirm(`Hapus chat "${selected.title}"? Semua pesan akan ikut terhapus permanen.`)) {
                      deleteChat(selected.id);
                    }
                  }}
                  disabled={deletingId === selected.id}
                  className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/15 transition-colors disabled:opacity-50"
                >
                  {deletingId === selected.id
                    ? <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                  Hapus Chat Ini
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Pinned Updates Tab ─────────────────────────────── */
interface PinnedUpdate {
  id: string; topic: string; content: string;
  expires_at: string | null; active: boolean; created_at: string;
}

function PinnedUpdatesTab() {
  const [updates, setUpdates] = useState<PinnedUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch("/api/admin/pinned-updates");
      setUpdates(data);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!topic.trim() || !content.trim()) return toast.error("Topic dan konten wajib diisi");
    setSaving(true);
    try {
      await adminFetch("/api/admin/pinned-updates", {
        method: "POST",
        body: JSON.stringify({ topic, content, expires_at: expiresAt || null }),
      });
      toast.success("Breaking update berhasil dibuat!");
      setTopic(""); setContent(""); setExpiresAt(""); setFormOpen(false);
      load();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const toggleActive = async (u: PinnedUpdate) => {
    try {
      await adminFetch(`/api/admin/pinned-updates/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !u.active }),
      });
      toast.success(u.active ? "Update dinonaktifkan" : "Update diaktifkan");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Yakin hapus breaking update ini?")) return;
    try {
      await adminFetch(`/api/admin/pinned-updates/${id}`, { method: "DELETE" });
      toast.success("Update dihapus");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const activeCount = updates.filter(u => u.active).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold text-foreground">Breaking Updates</h2>
            {activeCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-400">
                <Zap className="h-3 w-3" /> {activeCount} aktif
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Update yang aktif otomatis masuk ke konteks semua percakapan AI.</p>
        </div>
        <Button onClick={() => setFormOpen(!formOpen)} size="sm" className="shrink-0 gap-1.5 bg-gradient-purple text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Buat Update
        </Button>
      </div>

      {formOpen && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> Buat Breaking Update Baru
          </p>
          <Input
            placeholder="Topik singkat (misal: Perubahan Iqomah, Jadwal Registrasi)"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            className="bg-card"
          />
          <Textarea
            placeholder="Isi informasi terbaru yang perlu diketahui semua pengguna..."
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={4}
            className="bg-card"
          />
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Kadaluarsa (opsional)</label>
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              className="bg-card"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={saving} size="sm" className="bg-gradient-purple text-white hover:opacity-90">
              {saving ? "Menyimpan..." : "Publikasikan Update"}
            </Button>
            <Button onClick={() => setFormOpen(false)} size="sm" variant="outline">Batal</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-card" />)}</div>
      ) : updates.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Bell className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Belum ada breaking update. Buat update untuk menginformasikan perubahan kebijakan terkini.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {updates.map(u => (
            <div key={u.id} className={`rounded-2xl border p-4 ${u.active ? "border-primary/30 bg-primary/5" : "border-border bg-card opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${u.active ? "bg-red-500/15 text-red-400" : "bg-muted text-muted-foreground"}`}>
                      {u.active ? "🔴 Aktif" : "Nonaktif"}
                    </span>
                    <span className="text-xs text-muted-foreground">{fmtDate(u.created_at)}</span>
                    {u.expires_at && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Kadaluarsa: {fmtDate(u.expires_at)}
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-foreground text-sm">{u.topic}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{u.content}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <Button
                    size="sm" variant="outline"
                    className={`h-8 gap-1 ${u.active ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10" : "border-green-500/30 text-green-400 hover:bg-green-500/10"}`}
                    onClick={() => toggleActive(u)}
                    title={u.active ? "Nonaktifkan" : "Aktifkan"}
                  >
                    {u.active ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1 border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => handleDelete(u.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Reports Tab ────────────────────────────────────── */
interface MessageReport {
  id: string; user_id: string; message_id: string | null;
  message_content: string | null; user_question: string | null;
  additional_note: string | null; reason: string; status: string;
  admin_note: string | null; created_at: string;
  reporter?: { full_name: string | null; email: string | null };
}

function ReportsTab() {
  const [reports, setReports] = useState<MessageReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "reviewed" | "dismissed">("pending");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch(`/api/admin/reports?status=${filter}`);
      setReports(data);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: "reviewed" | "dismissed") => {
    try {
      const result = await adminFetch(`/api/admin/reports/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (status === "reviewed") {
        if (result?.kb_approved > 0) {
          toast.success("Laporan ditinjau — koreksi KB langsung disetujui dan aktif di Knowledge Base!");
        } else {
          toast.success("Laporan ditandai sudah ditinjau");
        }
      } else {
        toast.success("Laporan diabaikan");
      }
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const deleteReport = async (id: string) => {
    if (!window.confirm("Hapus laporan ini secara permanen?")) return;
    try {
      await adminFetch(`/api/admin/reports/${id}`, { method: "DELETE" });
      toast.success("Laporan dihapus");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const REASON_COLORS: Record<string, string> = {
    "Informasi tidak akurat": "bg-red-500/15 text-red-400",
    "Sumber tidak sesuai": "bg-orange-500/15 text-orange-400",
    "Jawaban tidak relevan": "bg-yellow-500/15 text-yellow-400",
    "Lainnya": "bg-muted text-muted-foreground",
  };

  const REPORT_STATUS_COLORS: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    reviewed: "bg-green-500/20 text-green-400 border-green-500/30",
    dismissed: "bg-muted text-muted-foreground border-border",
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">Laporan Pengguna</h2>
        <p className="text-sm text-muted-foreground">Tinjau laporan info tidak akurat dari pengguna.</p>
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
        {(["pending", "reviewed", "dismissed"] as const).map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${filter === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "pending" ? "Menunggu" : t === "reviewed" ? "Ditinjau" : "Diabaikan"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-card" />)}</div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Flag className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {filter === "pending" ? "Tidak ada laporan yang menunggu review." : `Tidak ada laporan dengan status "${filter}".`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${REASON_COLORS[r.reason] ?? "bg-muted text-muted-foreground"}`}>
                      {r.reason}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${REPORT_STATUS_COLORS[r.status]}`}>
                      {r.status === "pending" ? "Menunggu" : r.status === "reviewed" ? "Ditinjau" : "Diabaikan"}
                    </span>
                    <span className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {r.reporter && (
                      <p className="text-xs text-muted-foreground">
                        Dari: <span className="text-foreground">{r.reporter.full_name ?? r.reporter.email ?? "Unknown"}</span>
                      </p>
                    )}
                    {r.message_id?.startsWith("article:") ? (
                      <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400">Laporan Artikel</span>
                    ) : (
                      <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">Laporan Chat</span>
                    )}
                  </div>
                  {(r.user_question || r.message_content) && (
                    <div className="mt-2">
                      <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                        <Eye className="h-3 w-3" /> {expanded === r.id ? "Sembunyikan konteks" : "Lihat konteks percakapan"}
                      </button>
                      {expanded === r.id && (
                        <div className="mt-2 space-y-2">
                          {r.user_question && (
                            <div className="rounded-xl bg-secondary/60 border border-border px-3 py-2">
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Pertanyaan user</p>
                              <p className="text-xs text-foreground leading-relaxed">{r.user_question}</p>
                            </div>
                          )}
                          {r.message_content && !r.message_id?.startsWith("article:") && (
                            <div className="rounded-xl bg-primary/5 border border-primary/20 px-3 py-2 max-h-40 overflow-y-auto">
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary/60">Jawaban AINA yang dilaporkan</p>
                              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{r.message_content}</p>
                            </div>
                          )}
                          {r.message_content && r.message_id?.startsWith("article:") && (
                            <div className="rounded-xl bg-secondary/60 border border-border px-3 py-2">
                              <p className="text-xs text-muted-foreground">{r.message_content}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {r.additional_note && (
                    <div className="mt-2 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-500/70">Catatan dari pelapor</p>
                      <p className="text-xs text-foreground/80 leading-relaxed">{r.additional_note}</p>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-col gap-2">
                  {r.status === "pending" && (
                    <>
                      <Button size="sm" variant="outline" className="h-8 gap-1 border-green-500/30 text-green-400 hover:bg-green-500/10" onClick={() => updateStatus(r.id, "reviewed")} title="Tandai Ditinjau">
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-muted-foreground hover:text-foreground" onClick={() => updateStatus(r.id, "dismissed")} title="Abaikan">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" className="h-8 gap-1 border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => deleteReport(r.id)} title="Hapus laporan">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

/* ─── Security Logs Tab (master admin only) ──────────── */
interface SecurityEvent {
  id: string;
  timestamp: string;
  type: "AUTH-FAIL" | "FORBIDDEN" | "RATE-LIMITED";
  status: number;
  method: string;
  path: string;
  ip: string;
  ua: string;
}

const TYPE_COLORS: Record<string, string> = {
  "AUTH-FAIL":    "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  "FORBIDDEN":    "bg-red-500/15 text-red-400 border-red-500/30",
  "RATE-LIMITED": "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

const TYPE_META: Record<string, { label: string; desc: string; warn: string }> = {
  "AUTH-FAIL":    { label: "Gagal Login",       desc: "Token tidak valid atau akses ditolak",              warn: "Banyak dari 1 IP = brute force" },
  "FORBIDDEN":    { label: "Akses Terlarang",   desc: "Request ke endpoint admin tanpa izin",              warn: "Banyak muncul = seseorang mencoba masuk paksa" },
  "RATE-LIMITED": { label: "Rate Limit Terlampaui", desc: "IP mengirim terlalu banyak request sekaligus", warn: "Banyak muncul = kemungkinan bot/DDoS" },
};

function SecurityLogsTab() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [clearing, setClearing] = useState(false);

  const load = async (filter = typeFilter) => {
    setLoading(true);
    try {
      const qs = filter !== "all" ? `?type=${filter}&limit=200` : "?limit=200";
      const data = await adminFetch(`/api/admin/security-logs${qs}`);
      setEvents(data.events ?? []);
      setTotal(data.total ?? 0);
    } catch {
      toast.error("Gagal memuat security log");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleFilter = (val: string) => {
    setTypeFilter(val);
    load(val);
  };

  const handleClear = async () => {
    if (!window.confirm("Hapus semua log keamanan?")) return;
    setClearing(true);
    try {
      await adminFetch("/api/admin/security-logs", { method: "DELETE" });
      toast.success("Log keamanan dihapus");
      setEvents([]);
      setTotal(0);
    } catch {
      toast.error("Gagal menghapus log");
    } finally {
      setClearing(false);
    }
  };

  const counts = {
    "AUTH-FAIL":    events.filter(e => e.type === "AUTH-FAIL").length,
    "FORBIDDEN":    events.filter(e => e.type === "FORBIDDEN").length,
    "RATE-LIMITED": events.filter(e => e.type === "RATE-LIMITED").length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-400" /> Security Log
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {total} event tersimpan · maks. 500 · reset saat server restart
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => load(typeFilter)}
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
          <button onClick={handleClear} disabled={clearing || events.length === 0}
            className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40">
            <Trash className="h-3 w-3" /> Hapus
          </button>
        </div>
      </div>

      {/* Guide */}
      <PerfGuide items={[
        { term: "Gagal Login (AUTH-FAIL)", desc: "Token tidak valid atau request tidak terautentikasi. Wajar terjadi sesekali. Waspada jika banyak dari 1 IP dalam waktu singkat — bisa brute force.", color: "text-yellow-400" },
        { term: "Akses Terlarang (FORBIDDEN)", desc: "Seseorang mencoba mengakses endpoint admin tanpa izin. 1–2 bisa normal, tapi banyak dari IP yang sama = probing/scanning sistem.", color: "text-red-400" },
        { term: "Rate Limit (RATE-LIMITED)", desc: "IP mengirim terlalu banyak request sekaligus dan kena batas. Wajar untuk 1 user aktif, curigai jika muncul ratusan kali dari 1 IP.", color: "text-orange-400" },
        { term: "Kolom Method", desc: "GET = membaca data, POST = mengirim data, DELETE = menghapus. POST/DELETE ke endpoint admin yang gagal lebih berbahaya dari GET." },
        { term: "Kolom Path", desc: "Endpoint server yang dituju. Jika banyak percobaan ke /api/admin/* dari IP asing, segera waspadai." },
        { term: "Kolom IP", desc: "Alamat IP pengirim. Salin ke situs seperti ipinfo.io untuk lihat lokasi & pemilik IP tersebut.", color: "text-primary" },
        { term: "User-Agent (UA)", desc: "Identitas browser/alat pengirim. Hover untuk lihat teks lengkap. 'python-requests' atau 'curl' biasanya tanda bot/scanner.", color: "text-muted-foreground" },
      ]} />

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(["AUTH-FAIL", "FORBIDDEN", "RATE-LIMITED"] as const).map(t => {
          const meta = TYPE_META[t];
          const isAlert = counts[t] > 10;
          return (
            <div key={t} className={`rounded-xl border p-3 space-y-1 ${TYPE_COLORS[t]}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold opacity-80">{meta.label}</span>
                {isAlert && <span className="rounded-full bg-current/10 px-2 py-0.5 text-[10px] font-bold opacity-90">⚠ Tinggi</span>}
              </div>
              <div className="text-2xl font-bold">{counts[t]}</div>
              <div className="text-[11px] opacity-70 leading-snug">{meta.desc}</div>
              <div className="text-[10px] opacity-50 italic">{meta.warn}</div>
            </div>
          );
        })}
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {[
          { id: "all",          label: "Semua" },
          { id: "AUTH-FAIL",    label: "Gagal Login" },
          { id: "FORBIDDEN",    label: "Akses Terlarang" },
          { id: "RATE-LIMITED", label: "Rate Limit" },
        ].map(f => (
          <button key={f.id} onClick={() => handleFilter(f.id)}
            className={`rounded-full border px-3 py-0.5 text-xs transition-colors ${typeFilter === f.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {f.label}{f.id !== "all" && counts[f.id as keyof typeof counts] > 0 ? ` (${counts[f.id as keyof typeof counts]})` : ""}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
          <ShieldAlert className="h-8 w-8 opacity-30" />
          <p className="text-sm font-medium">Tidak ada event keamanan yang tercatat.</p>
          <p className="text-xs opacity-70">Bagus! Sistem aman.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full min-w-max text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-muted-foreground">Waktu</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-muted-foreground">Tipe</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-muted-foreground">Method</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-muted-foreground">Path</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-muted-foreground">IP</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-muted-foreground">User-Agent</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => (
                <tr key={ev.id} className={`border-b border-border/50 last:border-0 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-muted-foreground">
                    {new Date(ev.timestamp).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TYPE_COLORS[ev.type]}`}>
                      {TYPE_META[ev.type]?.label ?? ev.type}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-foreground">{ev.method}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-foreground max-w-[200px] truncate">{ev.path}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-primary">{ev.ip}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground max-w-[220px] truncate" title={ev.ua}>{ev.ua}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Waitlist Pro Tab (Master Admin only) ───────────── */
interface WaitlistEntry { id: string; email: string | null; user_id: string | null; created_at: string; }

function WaitlistTab() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch("/api/admin/waitlist");
      setEntries(data);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const exportCSV = () => {
    const rows = entries.map(e => `"${e.email ?? ""}","${fmtDate(e.created_at)}"`);
    const csv = `"Email","Tanggal Daftar"\n${rows.join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `waitlist_pro_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">Waitlist Pro</h2>
          <p className="text-sm text-muted-foreground">{entries.length} pendaftar</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {entries.length > 0 && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={exportCSV}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-card" />)}</div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <ListChecks className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Belum ada pendaftar waitlist Pro</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">#</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Tanggal Daftar</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.id} className="border-b border-border/50 last:border-0 hover:bg-card/60">
                  <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium text-foreground">{e.email ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Performance Tab (Master Admin only) ────────────── */
type PerfView = "summary" | "ratings" | "retrieval" | "edge_cases" | "faq" | "eval";

interface IntelSummary {
  top_faqs: { topic_cluster: string; sample_query: string | null; frequency: number }[];
  top_edge_cases: { pattern_type: string; topic_hint: string; frequency: number }[];
  overall_satisfaction_rate: number | null;
  total_ratings: number;
  source_breakdown: {
    kb_usage_pct: number | null;
    pinned_usage_pct: number | null;
    perplexity_usage_pct: number | null;
    wiki_usage_pct: number | null;
    ddg_usage_pct: number | null;
    total_turns: number;
  };
  needs_verification_rate: number | null;
}
interface RatingRow  { intent: string; confidence: string; positive: number; negative: number; total: number; satisfaction_rate: number | null; }
interface RetrievalRow { intent: string; kb_strength: string; confidence_level: string; had_kb: number; had_wiki: number; had_ddg: number; had_pinned: number; had_perplexity: number; total: number; }
interface EdgeCaseRow  { id: string; pattern_type: string; topic_hint: string; frequency: number; last_seen_at: string; }
interface FaqRow       { id: string; topic_cluster: string; sample_query: string | null; frequency: number; last_seen_at: string; }
interface EvalSummaryRow { version_tag: string; avg_total: number; count: number; }
interface BenchmarkRow { id: string; category: string; question: string; is_active: boolean; }

interface ModelTier { label: string; description: string; primary: string; fallback: string; emergency: string; routes_for: string[]; }
interface SourcePipelineItem { name: string; trust: number; always_checked?: boolean; condition?: string; active?: boolean; }
interface ModelConfig {
  tiers: { lightweight: ModelTier; standard: ModelTier };
  vision_model: string;
  source_pipeline: SourcePipelineItem[];
  perplexity_configured: boolean;
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${color ?? "text-foreground"}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function PerfTable({ cols, rows, empty }: { cols: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="rounded-2xl border border-border overflow-x-auto">
      <table className="w-full min-w-max text-xs">
        <thead>
          <tr className="border-b border-border bg-card">
            {cols.map(c => <th key={c} className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-muted-foreground">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-card/60">
              {row.map((cell, j) => <td key={j} className="whitespace-nowrap px-3 py-2.5 text-foreground/90">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PerfGuide({ items }: { items: Array<{ term: string; desc: string; color?: string }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5 font-medium">
          <span className="text-base leading-none">📖</span> Cara membaca tabel ini
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-border/40 px-3 py-2.5 space-y-2">
          {items.map(({ term, desc, color }) => (
            <div key={term} className="flex gap-2 text-xs">
              <span className={`shrink-0 font-semibold ${color ?? "text-primary"}`}>{term}</span>
              <span className="text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PerformanceTab() {
  const [view, setView]         = useState<PerfView>("summary");
  const [loading, setLoading]   = useState(false);
  const [summary, setSummary]   = useState<IntelSummary | null>(null);
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
  const [ratings, setRatings]   = useState<RatingRow[]>([]);
  const [retrieval, setRetrieval] = useState<RetrievalRow[]>([]);
  const [edgeCases, setEdgeCases] = useState<EdgeCaseRow[]>([]);
  const [faq, setFaq]           = useState<FaqRow[]>([]);
  const [evalSum, setEvalSum]   = useState<EvalSummaryRow[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkRow[]>([]);

  const load = useCallback(async (v: PerfView) => {
    setLoading(true);
    try {
      if (v === "summary") {
        const [d, mc] = await Promise.all([
          adminFetch("/api/admin/intel/summary"),
          adminFetch("/api/admin/intel/model-config"),
        ]);
        setSummary(d);
        setModelConfig(mc);
      } else if (v === "ratings") {
        const d = await adminFetch("/api/admin/intel/ratings");
        setRatings(d);
      } else if (v === "retrieval") {
        const d = await adminFetch("/api/admin/intel/retrieval-stats");
        setRetrieval(d);
      } else if (v === "edge_cases") {
        const d = await adminFetch("/api/admin/intel/edge-cases");
        setEdgeCases(d);
      } else if (v === "faq") {
        const d = await adminFetch("/api/admin/intel/query-patterns");
        setFaq(d);
      } else if (v === "eval") {
        const [es, bm] = await Promise.all([
          adminFetch("/api/admin/eval/summary"),
          adminFetch("/api/admin/eval/benchmarks"),
        ]);
        setEvalSum(Array.isArray(es) ? es : (es?.summary ?? []));
        setBenchmarks(Array.isArray(bm) ? bm : (bm?.benchmarks ?? []));
      }
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(view); }, [view, load]);

  const pctBar = (pct: number | null) => {
    const val = pct ?? 0;
    const color = val >= 70 ? "bg-green-500" : val >= 40 ? "bg-yellow-500" : "bg-red-500";
    return (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(val, 100)}%` }} />
        </div>
        <span className="text-xs text-muted-foreground">{val}%</span>
      </div>
    );
  };

  const subViews: Array<{ id: PerfView; label: string }> = [
    { id: "summary",    label: "Ringkasan" },
    { id: "ratings",    label: "Rating" },
    { id: "retrieval",  label: "Retrieval" },
    { id: "edge_cases", label: "Edge Cases" },
    { id: "faq",        label: "FAQ Patterns" },
    { id: "eval",       label: "Eval" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">Performa AINA</h2>
          <p className="text-sm text-muted-foreground">Intelijen agregat sistem — semua data anonim, tidak ada data pribadi user</p>
        </div>
        <button onClick={() => load(view)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Sub-navigation */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
        {subViews.map(sv => (
          <button key={sv.id} onClick={() => setView(sv.id)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${view === sv.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {sv.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-card" />)}</div>
      ) : (
        <>
          {/* ── SUMMARY ── */}
          {view === "summary" && summary && (
            <div className="space-y-5">
              <PerfGuide items={[
                { term: "Satisfaction Rate", desc: "Persentase user yang memberi rating 👍. Target ≥70% (hijau), 40–69% perlu perhatian (kuning), <40% kritis (merah).", color: "text-green-400" },
                { term: "KB Usage", desc: "Seberapa sering AINA menjawab dari Knowledge Base (trust score: 90) — sumber paling terpercaya. Semakin tinggi semakin baik." },
                { term: "Perplexity Usage", desc: "Sumber pencarian web real-time (trust: 78). Aktif jika PERPLEXITY_API_KEY dikonfigurasi. Dipakai saat KB lemah/tidak ada.", color: "text-blue-400" },
                { term: "Wikipedia / DuckDuckGo", desc: "Fallback terakhir (trust: 60 / 35) — hanya dipakai jika Perplexity tidak dikonfigurasi. Jika Perplexity aktif, Wiki & DDG tidak pernah dipanggil.", color: "text-yellow-400" },
                { term: "Needs Verification", desc: "Persentase jawaban tanpa sumber kuat (model menjawab dari memori sendiri). Jika >30% (merah), KB perlu diperkaya.", color: "text-red-400" },
                { term: "Top FAQ Topics", desc: "Pertanyaan paling sering ditanyakan — jadikan panduan topik artikel KB berikutnya." },
                { term: "Top Edge Cases", desc: "Pola kegagalan yang terdeteksi otomatis. Semakin kosong semakin baik.", color: "text-red-400" },
              ]} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard
                  label="Satisfaction Rate"
                  value={summary.overall_satisfaction_rate !== null ? `${summary.overall_satisfaction_rate}%` : "—"}
                  sub={`dari ${summary.total_ratings} rating`}
                  color={summary.overall_satisfaction_rate !== null && summary.overall_satisfaction_rate >= 70 ? "text-green-400" : "text-yellow-400"}
                />
                <StatCard label="KB Usage" value={summary.source_breakdown.kb_usage_pct !== null ? `${summary.source_breakdown.kb_usage_pct}%` : "—"} sub="trust 90 — sumber utama" />
                <StatCard label="Perplexity Usage" value={summary.source_breakdown.perplexity_usage_pct !== null ? `${summary.source_breakdown.perplexity_usage_pct}%` : "—"} sub={modelConfig?.perplexity_configured ? "trust 78 — web real-time ✓" : "tidak dikonfigurasi"} color={modelConfig?.perplexity_configured ? "text-blue-400" : "text-muted-foreground"} />
                <StatCard label="Wikipedia Usage" value={summary.source_breakdown.wiki_usage_pct !== null ? `${summary.source_breakdown.wiki_usage_pct}%` : "—"} sub={modelConfig?.perplexity_configured ? "tidak aktif (Perplexity dipakai)" : "trust 60 — fallback aktif"} />
                <StatCard label="DuckDuckGo Usage" value={summary.source_breakdown.ddg_usage_pct !== null ? `${summary.source_breakdown.ddg_usage_pct}%` : "—"} sub={modelConfig?.perplexity_configured ? "tidak aktif (Perplexity dipakai)" : "trust 35 — fallback aktif"} />
                <StatCard label="Needs Verification" value={summary.needs_verification_rate !== null ? `${summary.needs_verification_rate}%` : "—"} sub="turn tanpa sumber kuat" color={summary.needs_verification_rate !== null && summary.needs_verification_rate > 30 ? "text-red-400" : "text-foreground"} />
                <StatCard label="Total Turn Dianalisis" value={summary.source_breakdown.total_turns} />
              </div>

              {/* ── Model Config ── */}
              {modelConfig && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Otak AINA — Konfigurasi Model Aktif</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(["lightweight", "standard"] as const).map(tier => {
                      const t = modelConfig.tiers[tier];
                      return (
                        <div key={tier} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tier === "lightweight" ? "bg-blue-500/10 text-blue-400" : "bg-purple-500/10 text-purple-400"}`}>{t.label}</span>
                            <span className="text-[11px] text-muted-foreground">{t.description}</span>
                          </div>
                          <div className="space-y-1.5 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="shrink-0 w-16 text-muted-foreground">Primary</span>
                              <span className="font-mono text-foreground truncate">{t.primary}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="shrink-0 w-16 text-muted-foreground">Fallback</span>
                              <span className="font-mono text-foreground/70 truncate">{t.fallback}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="shrink-0 w-16 text-muted-foreground">Emergency</span>
                              <span className="font-mono text-muted-foreground truncate">{t.emergency}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1 pt-1 border-t border-border/50">
                            {t.routes_for.map(r => (
                              <span key={r} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{r}</span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-foreground">Pipeline Sumber (urutan prioritas)</h4>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${modelConfig.perplexity_configured ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                        Perplexity {modelConfig.perplexity_configured ? "✓ Aktif" : "✗ Tidak dikonfigurasi"}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {modelConfig.source_pipeline.map((s, i) => (
                        <div key={i} className={`flex items-center gap-2 text-xs ${s.active === false ? "opacity-40" : ""}`}>
                          <span className="shrink-0 w-5 text-center text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-foreground">{s.name}</span>
                            {s.condition && <span className="text-muted-foreground"> — {s.condition}</span>}
                          </div>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${s.trust >= 90 ? "bg-green-500/15 text-green-400" : s.trust >= 75 ? "bg-blue-500/15 text-blue-400" : s.trust >= 50 ? "bg-yellow-500/15 text-yellow-400" : "bg-muted text-muted-foreground"}`}>
                            {s.trust}
                          </span>
                          {s.active === false && <span className="shrink-0 text-[10px] text-muted-foreground/60">tidak aktif</span>}
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                      Vision model: <span className="font-mono text-foreground">{modelConfig.vision_model}</span>
                    </p>
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Top FAQ Topics</h3>
                  {summary.top_faqs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Belum ada data — SQL Phase 12 perlu dijalankan dulu</p>
                  ) : summary.top_faqs.map((f, i) => (
                    <div key={i} className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">{f.topic_cluster}</p>
                        {f.sample_query && <p className="text-[11px] text-muted-foreground truncate">{f.sample_query}</p>}
                      </div>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">{f.frequency}×</span>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Top Edge Cases</h3>
                  {summary.top_edge_cases.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Belum ada edge case terdeteksi</p>
                  ) : summary.top_edge_cases.map((e, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground">{e.pattern_type}</p>
                        <p className="text-[11px] text-muted-foreground">{e.topic_hint}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-bold text-red-400">{e.frequency}×</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {view === "summary" && !summary && !loading && (
            <p className="py-12 text-center text-sm text-muted-foreground">Gagal memuat data. Pastikan SQL Phase 12 sudah dijalankan di Supabase.</p>
          )}

          {/* ── RATINGS ── */}
          {view === "ratings" && (
            <div className="space-y-3">
            <PerfGuide items={[
              { term: "Intent", desc: "Kategori pertanyaan yang dideteksi AINA — misalnya procedural, factual, confused, dll." },
              { term: "Confidence", desc: "Keyakinan AINA saat menjawab: high (punya KB kuat), medium (sumber campuran), low (tanpa sumber).", color: "text-yellow-400" },
              { term: "👍 Positif / 👎 Negatif", desc: "Jumlah rating dari user. User menekan tombol jempol di bawah setiap jawaban AINA." },
              { term: "Satisfaction", desc: "Persentase positif dari total rating. ≥70% hijau = bagus, <40% merah = perlu perbaikan.", color: "text-green-400" },
              { term: "Cara pakai", desc: "Perhatikan baris dengan Satisfaction rendah — itu topik yang perlu artikel KB baru atau perbaikan prompt.", color: "text-muted-foreground" },
            ]} />
            <PerfTable
              cols={["Intent", "Confidence", "👍 Positif", "👎 Negatif", "Total", "Satisfaction"]}
              empty="Belum ada rating. User perlu menekan tombol 👍/👎 di chat terlebih dahulu."
              rows={ratings.map(r => [
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary font-mono text-[11px]">{r.intent ?? "—"}</span>,
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{r.confidence ?? "—"}</span>,
                <span className="text-green-400 font-semibold">{r.positive}</span>,
                <span className="text-red-400 font-semibold">{r.negative}</span>,
                r.total,
                pctBar(r.satisfaction_rate),
              ])}
            />
            </div>
          )}

          {/* ── RETRIEVAL ── */}
          {view === "retrieval" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Agregat per kombinasi intent × kb_strength × confidence. Menunjukkan seberapa sering tiap sumber digunakan per turn.</p>
              <PerfGuide items={[
                { term: "Intent", desc: "Kategori topik pertanyaan yang dideteksi AINA (factual, procedural, casual, fiqh, dll)." },
                { term: "KB Strength", desc: "Kualitas artikel KB yang ditemukan: strong (relevan & lengkap → Tier A), weak (ada tapi kurang → Tier B), none (tidak ada → Tier B).", color: "text-yellow-400" },
                { term: "Confidence", desc: "Tingkat keyakinan AINA saat menjawab: high / medium / low / needs_verification." },
                { term: "KB%", desc: "Persentase turn yang memakai Knowledge Base. KB% tinggi = semakin sedikit ketergantungan ke sumber eksternal.", color: "text-green-400" },
                { term: "Perplexity%", desc: "Persentase turn yang memakai Perplexity (web real-time, trust 78). Aktif hanya jika PERPLEXITY_API_KEY dikonfigurasi.", color: "text-blue-400" },
                { term: "Wiki% / DDG%", desc: "Fallback terakhir — hanya dipakai jika Perplexity tidak dikonfigurasi. Jika Perplexity aktif, kolom ini selalu 0%.", color: "text-yellow-400" },
                { term: "Pinned%", desc: "Persentase turn yang menggunakan artikel yang di-pin oleh admin (trust 100)." },
                { term: "Cara pakai", desc: "Baris dengan KB Strength = 'none' & banyak turn → prioritaskan artikel KB baru untuk intent tersebut.", color: "text-muted-foreground" },
              ]} />
              <PerfTable
                cols={["Intent", "KB Strength", "Confidence", "Turn", "KB%", "Perplexity%", "Wiki%", "DDG%", "Pinned%"]}
                empty="Belum ada data retrieval. Pastikan SQL Phase 12 sudah dijalankan."
                rows={retrieval.map(r => {
                  const pct = (n: number) => r.total > 0 ? `${Math.round(n / r.total * 100)}%` : "—";
                  return [
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary font-mono text-[11px]">{r.intent ?? "—"}</span>,
                    r.kb_strength ?? "—",
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{r.confidence_level ?? "—"}</span>,
                    <span className="font-semibold">{r.total}</span>,
                    pct(r.had_kb),
                    <span className="text-blue-400">{pct(r.had_perplexity)}</span>,
                    pct(r.had_wiki),
                    pct(r.had_ddg),
                    pct(r.had_pinned),
                  ];
                })}
              />
            </div>
          )}

          {/* ── EDGE CASES ── */}
          {view === "edge_cases" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Pola kegagalan yang terdeteksi otomatis per turn chat. Semakin tinggi frekuensi, semakin perlu perhatian.</p>
              <PerfGuide items={[
                { term: "Pola (pattern_type)", desc: "Jenis kegagalan yang terdeteksi, misalnya: off_topic (pertanyaan di luar konteks), sensitive (topik sensitif), jailbreak (percobaan manipulasi), confused (AINA tidak yakin).", color: "text-red-400" },
                { term: "Topik", desc: "Petunjuk topik spesifik dari turn yang terdeteksi — dianonimkan, bukan teks asli user." },
                { term: "Frekuensi", desc: "Berapa kali pola ini muncul. Semakin besar angka, semakin perlu ditangani." },
                { term: "Terakhir", desc: "Kapan terakhir kali pola ini terdeteksi." },
                { term: "Cara pakai", desc: "Jika off_topic sering muncul → KB perlu dilengkapi. Jika jailbreak tinggi → system prompt perlu diperkuat.", color: "text-muted-foreground" },
              ]} />
              <PerfTable
                cols={["Pola", "Topik", "Frekuensi", "Terakhir"]}
                empty="Belum ada edge case. Bagus — artinya AINA belum pernah terdeteksi masuk pola berbahaya."
                rows={edgeCases.map(e => [
                  <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-400 font-mono text-[11px]">{e.pattern_type}</span>,
                  e.topic_hint || "—",
                  <span className="font-bold text-foreground">{e.frequency}</span>,
                  <span className="text-muted-foreground">{fmtDate(e.last_seen_at)}</span>,
                ])}
              />
            </div>
          )}

          {/* ── FAQ PATTERNS ── */}
          {view === "faq" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Topik pertanyaan yang paling sering muncul (dihash, anonim). Gunakan ini untuk menentukan artikel KB berikutnya.</p>
              <PerfGuide items={[
                { term: "Topik Cluster", desc: "Kelompok topik yang dideteksi dari pola pertanyaan user — dianonimkan agar tidak ada data pribadi." },
                { term: "Contoh Pertanyaan", desc: "Satu contoh pertanyaan dari cluster tersebut (disamarkan). Membantu memahami apa yang dimaksud user." },
                { term: "Frekuensi", desc: "Berapa kali topik ini ditanyakan. Semakin tinggi = semakin banyak user membutuhkan info ini." },
                { term: "Cara pakai", desc: "Topik dengan frekuensi tinggi tapi belum ada artikel KB → prioritaskan untuk ditulis oleh kontributor.", color: "text-muted-foreground" },
              ]} />
              <PerfTable
                cols={["Topik Cluster", "Contoh Pertanyaan", "Frekuensi", "Terakhir"]}
                empty="Belum ada pola FAQ. SQL Phase 12 perlu dijalankan terlebih dahulu."
                rows={faq.map(f => [
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary font-mono text-[11px]">{f.topic_cluster}</span>,
                  <span className="text-muted-foreground italic">{f.sample_query ?? "—"}</span>,
                  <span className="font-bold text-foreground">{f.frequency}</span>,
                  <span className="text-muted-foreground">{fmtDate(f.last_seen_at)}</span>,
                ])}
              />
            </div>
          )}

          {/* ── EVAL ── */}
          {view === "eval" && (
            <div className="space-y-5">
              <PerfGuide items={[
                { term: "Skor per Versi", desc: "Rata-rata skor evaluasi per versi sistem (prompt + model). Skor dihitung dari benchmark questions yang sudah ditentukan." },
                { term: "Skala skor", desc: "0–100. ≥80 bagus (hijau), 60–79 perlu peningkatan (kuning), <60 kritis (merah).", color: "text-green-400" },
                { term: "Benchmark Questions", desc: "Pertanyaan uji standar yang dikelompokkan per kategori: factual, procedural, confused, dll. Dijalankan secara manual untuk mengukur kualitas respons AINA." },
                { term: "Titik hijau / abu", desc: "Hijau = soal aktif digunakan dalam evaluasi. Abu = soal dinonaktifkan." },
                { term: "Cara pakai", desc: "Bandingkan skor antar versi setelah perubahan prompt atau model — pastikan skor tidak turun sebelum deploy.", color: "text-muted-foreground" },
              ]} />
              <div>
                <h3 className="mb-3 text-sm font-semibold text-foreground">Skor per Versi</h3>
                {evalSum.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Belum ada hasil evaluasi. Jalankan eval via API dan submit skor manual.</p>
                ) : (
                  <div className="space-y-2">
                    {evalSum.map(e => (
                      <div key={e.version_tag} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground font-mono">{e.version_tag}</p>
                          <p className="text-[11px] text-muted-foreground">{e.count} benchmark diuji</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className={`text-xl font-bold ${e.avg_total >= 80 ? "text-green-400" : e.avg_total >= 60 ? "text-yellow-400" : "text-red-400"}`}>
                              {Math.round(e.avg_total)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">/ 100</p>
                          </div>
                          <div className="h-10 w-10 rounded-full border-2 flex items-center justify-center"
                            style={{ borderColor: e.avg_total >= 80 ? "#4ade80" : e.avg_total >= 60 ? "#facc15" : "#f87171" }}>
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-3 text-sm font-semibold text-foreground">Benchmark Questions ({benchmarks.length})</h3>
                {benchmarks.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Belum ada benchmark. Jalankan seed via POST /api/admin/eval/benchmarks/seed</p>
                ) : (
                  <div className="space-y-2">
                    {(["factual","procedural","confused","recommendation","brainstorming","current_role","kb_first","memory"] as const).map(cat => {
                      const items = benchmarks.filter(b => b.category === cat);
                      if (items.length === 0) return null;
                      return (
                        <div key={cat} className="rounded-xl border border-border bg-card overflow-hidden">
                          <div className="flex items-center justify-between border-b border-border px-4 py-2.5 bg-muted/30">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</span>
                            <span className="text-[11px] text-muted-foreground">{items.length} soal</span>
                          </div>
                          <div className="divide-y divide-border/50">
                            {items.map(b => (
                              <div key={b.id} className="flex items-start gap-3 px-4 py-2.5">
                                <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${b.is_active ? "bg-green-400" : "bg-muted-foreground/30"}`} />
                                <p className="text-xs text-foreground/90">{b.question}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Announcements Tab (Master Admin) ───────────────── */
interface Announcement {
  id: string; title: string; message: string; type: string;
  target_audience: string; is_active: boolean;
  button_text?: string; button_link?: string; dismissible: boolean;
  image_url?: string;
  start_at?: string; end_at?: string;
  created_by?: string; created_at: string; updated_at: string;
}

function AnnouncementsTab() {
  const [list, setList] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [preview, setPreview] = useState<Announcement | null>(null);
  const [imgUploading, setImgUploading] = useState(false);
  const [imgUrl, setImgUrl] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);

  const blank = { title: "", message: "", type: "announcement", target_audience: "all_users", is_active: true, button_text: "", button_link: "", dismissible: true, start_at: "", end_at: "" };
  const [form, setForm] = useState<typeof blank>(blank);

  const load = async () => {
    setLoading(true);
    try { const d = await adminFetch("/api/master/announcements"); setList(d); }
    catch (e: any) { toast.error(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(blank); setImgUrl(""); setShowForm(true); };
  const openEdit = (a: Announcement) => {
    setEditing(a);
    setImgUrl(a.image_url ?? "");
    setForm({
      title: a.title, message: a.message, type: a.type, target_audience: a.target_audience,
      is_active: a.is_active, button_text: a.button_text ?? "", button_link: a.button_link ?? "",
      dismissible: a.dismissible, start_at: a.start_at ? a.start_at.slice(0, 16) : "",
      end_at: a.end_at ? a.end_at.slice(0, 16) : "",
    });
    setShowForm(true);
  };

  const uploadImage = async (file: File) => {
    setImgUploading(true);
    try {
      const auth = await getAuthHeader();
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/upload-image", {
        method: "POST",
        headers: { Authorization: auth },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Gagal upload gambar"); return; }
      setImgUrl(json.publicUrl);
      toast.success("Gambar berhasil diupload");
    } catch {
      toast.error("Upload gagal. Coba lagi.");
    } finally {
      setImgUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.message.trim()) { toast.error("Judul dan pesan harus diisi"); return; }
    setSaving(true);
    try {
      const body = {
        ...form,
        button_text: form.button_text || null,
        button_link: form.button_link || null,
        start_at: form.start_at || null,
        end_at: form.end_at || null,
        image_url: imgUrl || null,
      };
      if (editing) await adminFetch(`/api/master/announcements/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await adminFetch("/api/master/announcements", { method: "POST", body: JSON.stringify(body) });
      toast.success(editing ? "Pengumuman diperbarui" : "Pengumuman dibuat");
      setShowForm(false); load();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Hapus pengumuman ini secara permanen?")) return;
    setDeleting(id);
    try { await adminFetch(`/api/master/announcements/${id}`, { method: "DELETE" }); toast.success("Dihapus"); load(); }
    catch (e: any) { toast.error(e.message); }
    setDeleting(null);
  };

  const handleResetViews = async (id: string) => {
    setResetting(id);
    try {
      const result = await adminFetch(`/api/master/announcements/${id}/views`, { method: "DELETE" });
      toast.success(`Berhasil direset — pengumuman akan muncul lagi untuk semua pengguna`);
    } catch (e: any) { toast.error(e.message); }
    setResetting(null);
  };

  const handleToggle = async (a: Announcement) => {
    try {
      await adminFetch(`/api/master/announcements/${a.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !a.is_active }) });
      setList(prev => prev.map(x => x.id === a.id ? { ...x, is_active: !x.is_active } : x));
    } catch (e: any) { toast.error(e.message); }
  };

  const audienceLabel: Record<string, string> = { all_users: "Semua Pengguna", new_users: "User Baru (≤7 hari)", old_users: "User Lama" };
  const typeLabel: Record<string, string> = { welcome: "Selamat Datang", announcement: "Pengumuman" };

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">Pengumuman / Popup</h2>
          <p className="text-sm text-muted-foreground">Kelola popup yang tampil saat pengguna buka dashboard.</p>
        </div>
        <Button variant="hero" size="sm" className="gap-1.5" onClick={openNew}>
          <Plus className="h-4 w-4" /> Buat Baru
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-2xl border border-primary/20 bg-card p-4 space-y-3">
          <h3 className="font-medium text-foreground text-sm">{editing ? "Edit Pengumuman" : "Buat Pengumuman Baru"}</h3>

          <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Judul pengumuman" className="bg-secondary" />
          <Textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} placeholder="Isi pesan (markdown didukung)" rows={4} className="bg-secondary resize-none" />

          {/* Image upload */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Poster / Gambar <span className="text-muted-foreground/60">(opsional)</span></p>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ""; }}
            />
            {imgUrl ? (
              <div className="relative overflow-hidden rounded-xl border border-border bg-secondary">
                <img src={imgUrl} alt="Preview" className="max-h-48 w-full object-contain" />
                <button
                  type="button"
                  onClick={() => setImgUrl("")}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={imgUploading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary px-4 py-5 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors disabled:opacity-50"
              >
                {imgUploading ? (
                  <><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" /> Mengupload...</>
                ) : (
                  <><Upload className="h-4 w-4" /> Upload poster / gambar (JPG, PNG, WebP, GIF)</>
                )}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Tipe</p>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger className="bg-secondary h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="announcement">Pengumuman</SelectItem>
                  <SelectItem value="welcome">Selamat Datang</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Target</p>
              <Select value={form.target_audience} onValueChange={v => setForm(p => ({ ...p, target_audience: v }))}>
                <SelectTrigger className="bg-secondary h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_users">Semua</SelectItem>
                  <SelectItem value="new_users">User Baru</SelectItem>
                  <SelectItem value="old_users">User Lama</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Input value={form.button_text} onChange={e => setForm(p => ({ ...p, button_text: e.target.value }))} placeholder="Teks tombol (opsional)" className="bg-secondary text-xs" />
            <Input value={form.button_link} onChange={e => setForm(p => ({ ...p, button_link: e.target.value }))} placeholder="Link tombol (opsional)" className="bg-secondary text-xs" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Mulai (opsional)</p>
              <Input type="datetime-local" value={form.start_at} onChange={e => setForm(p => ({ ...p, start_at: e.target.value }))} className="bg-secondary text-xs" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Berakhir (opsional)</p>
              <Input type="datetime-local" value={form.end_at} onChange={e => setForm(p => ({ ...p, end_at: e.target.value }))} className="bg-secondary text-xs" />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="rounded" />
              <span className="text-xs text-foreground">Aktif</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.dismissible} onChange={e => setForm(p => ({ ...p, dismissible: e.target.checked }))} className="rounded" />
              <span className="text-xs text-foreground">Bisa ditutup</span>
            </label>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Batal</Button>
            <Button size="sm" disabled={saving} onClick={handleSave} className="gap-1.5 bg-gradient-purple text-primary-foreground hover:opacity-90">
              <Save className="h-3.5 w-3.5" /> {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-card" />)}</div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Megaphone className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Belum ada pengumuman. Buat pengumuman pertama!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(a => (
            <div key={a.id} className={`rounded-2xl border bg-card p-4 ${a.is_active ? "border-primary/20" : "border-border opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-foreground text-sm">{a.title}</p>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${a.is_active ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-border bg-secondary text-muted-foreground"}`}>
                      {a.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                    <span className="rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{typeLabel[a.type] ?? a.type}</span>
                    <span className="rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{audienceLabel[a.target_audience] ?? a.target_audience}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{a.message}</p>
                  {a.image_url && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                      <Image className="h-3 w-3" /> Ada poster
                    </div>
                  )}
                  {(a.start_at || a.end_at) && (
                    <p className="mt-1 text-[10px] text-muted-foreground/60">
                      {a.start_at ? `Mulai: ${fmtDate(a.start_at)}` : ""}{a.start_at && a.end_at ? " · " : ""}{a.end_at ? `Berakhir: ${fmtDate(a.end_at)}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary" onClick={() => setPreview(a)} title="Preview popup">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-400" disabled={resetting === a.id} onClick={() => handleResetViews(a.id)} title="Reset semua views (popup muncul lagi)">
                    {resetting === a.id ? <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => handleToggle(a)} title={a.is_active ? "Nonaktifkan" : "Aktifkan"}>
                    {a.is_active ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => openEdit(a)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" disabled={deleting === a.id} onClick={() => handleDelete(a.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    {/* Preview dialog */}
    <Dialog open={!!preview} onOpenChange={open => !open && setPreview(null)}>
      <DialogContent className="max-w-md gap-0 p-0 overflow-hidden">
        {preview && (() => {
          const Icon = preview.type === "welcome" ? PartyPopper : Megaphone;
          return (
            <>
              <div className="flex items-start gap-3 border-b border-border px-5 py-4">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${preview.type === "welcome" ? "bg-amber-500/20" : "bg-primary/20"}`}>
                  <Icon className={`h-4 w-4 ${preview.type === "welcome" ? "text-amber-400" : "text-primary"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="font-display font-bold text-foreground leading-tight">{preview.title}</DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{preview.type === "welcome" ? "Selamat datang" : "Pengumuman dari AINA"}</p>
                </div>
              </div>
              <div className="px-5 py-4 space-y-3">
                {preview.image_url && (
                  <div className="overflow-hidden rounded-xl border border-border bg-secondary">
                    <img src={preview.image_url} alt={preview.title} className="w-full max-h-72 object-contain" />
                  </div>
                )}
                <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{preview.message}</p>
              </div>
              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <p className="text-xs text-muted-foreground italic">Preview saja — tidak ada data yang tersimpan</p>
                <Button size="sm" variant="outline" onClick={() => setPreview(null)}>Tutup</Button>
              </div>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
    </>
  );
}

/* ─── Feedback Signals Tab (Master Admin only) ───────── */
interface FeedbackRow {
  id: string; user_id: string; message_id: string; feedback_type: string;
  note: string | null; intent: string | null; confidence: string | null;
  sources: string[] | null; created_at: string;
  user: { full_name: string | null; email: string | null } | null;
}
interface SavedAnswerAdmin {
  id: string; user_id: string; message_id: string; content: string;
  sources: string[] | null; source_summary: string | null; intent: string | null;
  promoted_to_kb: boolean; created_at: string;
  user: { full_name: string | null; email: string | null } | null;
}

function FeedbackSignalsTab() {
  const [subTab, setSubTab] = useState<"helpful" | "bookmarks">("helpful");
  const [helpful, setHelpful] = useState<FeedbackRow[]>([]);
  const [saved, setSaved] = useState<SavedAnswerAdmin[]>([]);
  const [loadingH, setLoadingH] = useState(true);
  const [loadingS, setLoadingS] = useState(true);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [promoteDialog, setPromoteDialog] = useState<SavedAnswerAdmin | null>(null);
  const [promoteTitle, setPromoteTitle] = useState("");
  const [promoteCategory, setPromoteCategory] = useState("Umum");

  useEffect(() => {
    adminFetch("/api/admin/answer-feedback?type=helpful").then(d => { setHelpful(d); setLoadingH(false); }).catch(() => setLoadingH(false));
    adminFetch("/api/admin/all-saved-answers").then(d => { setSaved(d); setLoadingS(false); }).catch(() => setLoadingS(false));
  }, []);

  const handlePromote = async () => {
    if (!promoteDialog || !promoteTitle.trim()) return;
    setPromoting(promoteDialog.id);
    try {
      await adminFetch(`/api/admin/saved-answers/${promoteDialog.id}/promote-to-kb`, {
        method: "POST",
        body: JSON.stringify({ title: promoteTitle.trim(), category: promoteCategory }),
      });
      toast.success(`"${promoteTitle}" berhasil ditambahkan ke Knowledge Base!`);
      setSaved(prev => prev.map(s => s.id === promoteDialog.id ? { ...s, promoted_to_kb: true } : s));
      setPromoteDialog(null);
      setPromoteTitle("");
    } catch (e: any) {
      toast.error(e.message ?? "Gagal mempatenkan ke KB");
    }
    setPromoting(null);
  };

  const KB_CATEGORIES = ["Umum", "Administrasi", "Kehidupan", "Al-Azhar", "Akademik", "Keuangan", "Kesehatan", "Transportasi", "Komunitas"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">Sinyal User</h2>
          <p className="text-sm text-muted-foreground">Feedback dan bookmark dari pengguna AINA</p>
        </div>
      </div>

      {/* Sub tabs */}
      <div className="flex gap-1 rounded-xl bg-secondary/50 p-1">
        {([["helpful", "👍 Thumbs Up", helpful.length], ["bookmarks", "🔖 Jawaban Disimpan", saved.length]] as const).map(([id, label, count]) => (
          <button key={id} onClick={() => setSubTab(id)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${subTab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {label} {count > 0 && <span className="ml-1 rounded-full bg-primary/15 px-1.5 text-primary">{count}</span>}
          </button>
        ))}
      </div>

      {subTab === "helpful" && (
        <div className="space-y-2">
          {loadingH ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-card" />)}</div>
          ) : helpful.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <ThumbsUp className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Belum ada sinyal thumbs up</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-card">
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">User</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Intent</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Confidence</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Sumber</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {helpful.map(row => (
                    <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-card/60">
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-foreground">{row.user?.full_name ?? "—"}</div>
                        <div className="text-muted-foreground/60">{row.user?.email ?? row.user_id.slice(0, 8)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground capitalize">{row.intent ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${row.confidence === "high" ? "bg-green-500/15 text-green-400" : row.confidence === "medium" ? "bg-amber-500/15 text-amber-400" : "bg-zinc-500/15 text-zinc-400"}`}>
                          {row.confidence ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground/70 max-w-[140px] truncate">
                        {(row.sources ?? []).slice(0, 2).join(", ") || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground/60">{fmtDate(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === "bookmarks" && (
        <div className="space-y-3">
          {loadingS ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-card" />)}</div>
          ) : saved.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Bookmark className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Belum ada jawaban yang di-bookmark user</p>
            </div>
          ) : (
            saved.map(item => (
              <div key={item.id} className="rounded-2xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-foreground">{item.user?.full_name ?? "—"}</div>
                    <div className="text-[10px] text-muted-foreground/60">{item.user?.email ?? item.user_id.slice(0, 8)}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground/40">{fmtDate(item.created_at)}</span>
                    {item.promoted_to_kb ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 text-[10px] text-emerald-400">
                        <Check className="h-2.5 w-2.5" /> Di KB
                      </span>
                    ) : (
                      <button
                        onClick={() => { setPromoteDialog(item); setPromoteTitle(""); }}
                        className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
                      >
                        <Star className="h-2.5 w-2.5" /> Patenkan ke KB
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-foreground/80 leading-relaxed line-clamp-3">
                  {item.content.replace(/[#*`>\-]/g, "").trim()}
                </p>
                {(item.sources ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(item.sources ?? []).slice(0, 3).map((s, i) => (
                      <span key={i} className="rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] text-muted-foreground">{s}</span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Promote to KB dialog */}
      {promoteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
                <Star className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Patenkan ke Knowledge Base</h3>
                <p className="text-xs text-muted-foreground">Jawaban ini akan jadi artikel KB yang disetujui</p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-secondary/30 p-3 max-h-32 overflow-y-auto">
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-5">
                {promoteDialog.content.slice(0, 300).replace(/[#*`>\-]/g, "").trim()}…
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Judul Artikel *</label>
                <input
                  value={promoteTitle}
                  onChange={e => setPromoteTitle(e.target.value)}
                  placeholder="Masukkan judul artikel KB…"
                  className="w-full rounded-xl border border-border bg-secondary/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Kategori</label>
                <select
                  value={promoteCategory}
                  onChange={e => setPromoteCategory(e.target.value)}
                  className="w-full rounded-xl border border-border bg-secondary/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {KB_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setPromoteDialog(null)}
                className="flex-1 rounded-xl border border-border py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handlePromote}
                disabled={!promoteTitle.trim() || !!promoting}
                className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {promoting ? "Menyimpan…" : "Tambahkan ke KB"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── News Management Tab ───────────────────────────── */
interface NewsItem {
  id: string;
  title: string;
  content: string;
  category: string;
  image_url?: string;
  source_url?: string;
  source_name?: string;
  is_pinned: boolean;
  is_active: boolean;
  published_at: string;
}

const NEWS_CATS = [
  { id: "breaking_news", label: "Breaking News", icon: Zap, color: "text-red-500" },
  { id: "administrasi", label: "Administrasi", icon: FileText, color: "text-blue-500" },
  { id: "kuliner", label: "Kuliner", icon: Utensils, color: "text-orange-500" },
  { id: "kehidupan_mesir", label: "Kehidupan Mesir", icon: Globe, color: "text-green-500" },
  { id: "transportasi", label: "Transportasi", icon: Bus, color: "text-cyan-500" },
  { id: "aigypt", label: "Berita AIGYPT", icon: GraduationCap, color: "text-violet-500" },
];

function getCatLabel(id: string) {
  return NEWS_CATS.find(c => c.id === id)?.label ?? id;
}

function NewsManagementTab() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<NewsItem | null>(null);
  const [form, setForm] = useState({ title: "", content: "", category: "kehidupan_mesir", image_url: "", source_url: "", source_name: "", is_pinned: false });
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news?limit=100", { credentials: "include" });
      const data = await res.json();
      setNews(data.news ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }

  function openCreate() {
    setEditing(null);
    setForm({ title: "", content: "", category: "kehidupan_mesir", image_url: "", source_url: "", source_name: "", is_pinned: false });
    setShowForm(true);
  }

  function openEdit(item: NewsItem) {
    setEditing(item);
    setForm({ title: item.title, content: item.content, category: item.category, image_url: item.image_url ?? "", source_url: item.source_url ?? "", source_name: item.source_name ?? "", is_pinned: item.is_pinned });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) return toast.error("Judul dan konten wajib diisi");
    setSaving(true);
    try {
      const token = await getToken();
      const url = editing ? `/api/admin/news/${editing.id}` : "/api/admin/news";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast.success(editing ? "Berita diperbarui" : "Berita ditambahkan");
      setShowForm(false);
      fetchNews();
    } catch (e: any) { toast.error(e.message ?? "Gagal menyimpan"); } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus berita ini?")) return;
    const token = await getToken();
    const res = await fetch(`/api/admin/news/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { toast.success("Berita dihapus"); setSelected(s => { const n = new Set(s); n.delete(id); return n; }); fetchNews(); }
    else toast.error("Gagal menghapus");
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`Hapus ${ids.length} berita yang dipilih?`)) return;
    setBulkDeleting(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/news/bulk", { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ ids }) });
      if (res.ok) { toast.success(`${ids.length} berita dihapus`); setSelected(new Set()); fetchNews(); }
      else { const d = await res.json(); toast.error(d.error ?? "Gagal menghapus"); }
    } catch { toast.error("Gagal menghapus"); } finally { setBulkDeleting(false); }
  }

  function toggleSelect(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAll() { setSelected(new Set(news.map(n => n.id))); }
  function clearAll()  { setSelected(new Set()); }

  async function togglePin(item: NewsItem) {
    const token = await getToken();
    await fetch(`/api/admin/news/${item.id}`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ is_pinned: !item.is_pinned }) });
    fetchNews();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">Berita Masisir</h2>
          <p className="text-xs text-muted-foreground">{news.length} berita aktif</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" /> {bulkDeleting ? "Menghapus..." : `Hapus ${selected.size}`}
            </Button>
          )}
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Tambah Berita
          </Button>
        </div>
      </div>

      {/* Bulk select bar */}
      {!loading && news.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <button onClick={selected.size === news.length ? clearAll : selectAll} className="hover:text-foreground transition-colors">
            {selected.size === news.length ? "Batalkan semua" : `Pilih semua (${news.length})`}
          </button>
          {selected.size > 0 && <span className="text-primary font-medium">{selected.size} dipilih</span>}
        </div>
      )}

      {/* Form dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Berita" : "Tambah Berita Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Judul *</label>
              <Input placeholder="Judul berita..." value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Kategori</label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NEWS_CATS.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Konten *</label>
              <Textarea placeholder="Isi berita..." value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={6} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">URL Gambar (opsional)</label>
              <Input placeholder="https://..." value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">URL Sumber (opsional)</label>
                <Input placeholder="https://..." value={form.source_url} onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nama Sumber</label>
                <Input placeholder="mis: KBRI Kairo" value={form.source_name} onChange={e => setForm(f => ({ ...f, source_name: e.target.value }))} />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_pinned} onChange={e => setForm(f => ({ ...f, is_pinned: e.target.checked }))} className="rounded" />
              <span className="text-sm">Pinned (tampil di atas)</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Batal</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Menyimpan..." : (editing ? "Simpan Perubahan" : "Tambah")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* News list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : news.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <Newspaper className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Belum ada berita. Klik "Tambah Berita" untuk memulai.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {news.map(item => {
            const cat = NEWS_CATS.find(c => c.id === item.category);
            const Icon = cat?.icon ?? Newspaper;
            const isSel = selected.has(item.id);
            return (
              <div key={item.id} className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${isSel ? "border-primary/40 bg-primary/5" : item.is_pinned ? "border-primary/20 bg-primary/5" : "border-border bg-card"}`}>
                <input type="checkbox" checked={isSel} onChange={() => toggleSelect(item.id)} className="mt-1 shrink-0 rounded cursor-pointer accent-primary" />
                <div className={`mt-0.5 shrink-0 ${cat?.color ?? "text-muted-foreground"}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground truncate">{item.title}</span>
                    {item.is_pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                    <span className="text-[10px] text-muted-foreground">{getCatLabel(item.category)}</span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-2">{item.content}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => togglePin(item)} title={item.is_pinned ? "Unpin" : "Pin"} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    <Pin className={`h-3.5 w-3.5 ${item.is_pinned ? "text-primary fill-primary" : ""}`} />
                  </button>
                  <button onClick={() => openEdit(item)} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="rounded-lg p-1.5 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Procedure Management Tab (master admin only) ───── */
const PROC_ICON_OPTIONS = ["CreditCard","GraduationCap","Stamp","FileText","Building2","BookOpen","Shield","Star","Bell","Target"];
const PROC_COLOR_OPTIONS = [
  { value: "text-violet-400", label: "Ungu" }, { value: "text-amber-400", label: "Kuning" },
  { value: "text-blue-400",   label: "Biru"  }, { value: "text-rose-400",  label: "Merah" },
  { value: "text-green-400",  label: "Hijau" }, { value: "text-cyan-400",  label: "Cyan"  },
  { value: "text-orange-400", label: "Oranye"}, { value: "text-pink-400",  label: "Pink"  },
];

interface ProcedureAdmin { id: string; title: string; subtitle?: string; icon_name: string; color: string; steps: Array<{ label: string; detail?: string }>; display_order: number; is_active: boolean; }

async function adminFetchProc(method: string, path: string, body?: object) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? "";
  const r = await fetch(`/api${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "Gagal"); }
  return r.json();
}

function ProcedureManagementTab() {
  const [procs, setProcs] = useState<ProcedureAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editProc, setEditProc] = useState<ProcedureAdmin | null>(null);
  const [form, setForm] = useState({ title: "", subtitle: "", icon_name: "FileText", color: "text-violet-400", steps: [{ label: "", detail: "" }] });
  const [saving, setSaving] = useState(false);

  const loadProcs = useCallback(async () => {
    setLoading(true);
    try { const d = await adminFetchProc("GET", "/procedures"); setProcs(d.procedures ?? []); }
    catch { /* fallback */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadProcs(); }, [loadProcs]);

  function openCreate() {
    setEditProc(null);
    setForm({ title: "", subtitle: "", icon_name: "FileText", color: "text-violet-400", steps: [{ label: "", detail: "" }] });
    setShowForm(true);
  }

  function openEdit(p: ProcedureAdmin) {
    setEditProc(p);
    setForm({ title: p.title, subtitle: p.subtitle ?? "", icon_name: p.icon_name, color: p.color, steps: p.steps.map(s => ({ label: s.label, detail: s.detail ?? "" })) });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.title.trim()) return toast.error("Judul wajib diisi");
    const steps = form.steps.filter(s => s.label.trim()).map(s => ({ label: s.label.trim(), ...(s.detail?.trim() ? { detail: s.detail.trim() } : {}) }));
    if (steps.length === 0) return toast.error("Minimal 1 langkah");
    setSaving(true);
    try {
      if (editProc) {
        await adminFetchProc("PUT", `/admin/procedures/${editProc.id}`, { title: form.title.trim(), subtitle: form.subtitle.trim() || null, icon_name: form.icon_name, color: form.color, steps });
        toast.success("Prosedur diperbarui");
      } else {
        await adminFetchProc("POST", "/admin/procedures", { title: form.title.trim(), subtitle: form.subtitle.trim() || null, icon_name: form.icon_name, color: form.color, steps, display_order: procs.length });
        toast.success("Prosedur ditambahkan");
      }
      setShowForm(false); loadProcs();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus prosedur ini?")) return;
    await adminFetchProc("DELETE", `/admin/procedures/${id}`).then(() => { toast.success("Prosedur dihapus"); loadProcs(); }).catch(e => toast.error(e.message));
  }

  async function toggleActive(p: ProcedureAdmin) {
    await adminFetchProc("PUT", `/admin/procedures/${p.id}`, { is_active: !p.is_active }).then(() => loadProcs()).catch(e => toast.error(e.message));
  }

  function addStep() { setForm(f => ({ ...f, steps: [...f.steps, { label: "", detail: "" }] })); }
  function removeStep(i: number) { setForm(f => ({ ...f, steps: f.steps.filter((_, j) => j !== i) })); }
  function updateStep(i: number, field: "label" | "detail", val: string) { setForm(f => ({ ...f, steps: f.steps.map((s, j) => j === i ? { ...s, [field]: val } : s) })); }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">Panduan Prosedur</h2>
          <p className="text-xs text-muted-foreground">{procs.length} prosedur • Hanya master admin yang dapat mengedit</p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Tambah Prosedur</Button>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editProc ? "Edit Prosedur" : "Tambah Prosedur"}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Judul *</label>
              <Input placeholder="mis: Perpanjang Iqama" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Subtitle</label>
              <Input placeholder="mis: Izin tinggal tahunan" value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Ikon</label>
                <Select value={form.icon_name} onValueChange={v => setForm(f => ({ ...f, icon_name: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PROC_ICON_OPTIONS.map(ic => <SelectItem key={ic} value={ic}>{ic}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Warna</label>
                <Select value={form.color} onValueChange={v => setForm(f => ({ ...f, color: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PROC_COLOR_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-muted-foreground">Langkah-langkah *</label>
                <button onClick={addStep} className="text-xs text-primary hover:text-primary/80 transition-colors">+ Tambah langkah</button>
              </div>
              <div className="space-y-2">
                {form.steps.map((s, i) => (
                  <div key={i} className="space-y-1.5 rounded-lg border border-border bg-secondary/30 p-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}.</span>
                      <Input size={undefined} className="flex-1 h-7 text-xs" placeholder="Label langkah *" value={s.label} onChange={e => updateStep(i, "label", e.target.value)} />
                      {form.steps.length > 1 && (
                        <button onClick={() => removeStep(i)} className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                    <Input size={undefined} className="h-7 text-xs text-muted-foreground" placeholder="Detail (opsional)" value={s.detail} onChange={e => updateStep(i, "detail", e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Batal</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Menyimpan..." : (editProc ? "Simpan" : "Tambah")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="flex justify-center py-10"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : procs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Belum ada prosedur. Klik "Tambah Prosedur" untuk memulai.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {procs.map(p => (
            <div key={p.id} className={`flex items-start gap-3 rounded-xl border p-3 ${p.is_active ? "border-border bg-card" : "border-border/40 bg-secondary/20 opacity-60"}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-foreground">{p.title}</span>
                  {p.subtitle && <span className="text-[10px] text-muted-foreground">{p.subtitle}</span>}
                  {!p.is_active && <span className="text-[10px] rounded-full bg-secondary px-1.5 py-0.5 text-muted-foreground">Non-aktif</span>}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{p.steps.length} langkah • ikon: {p.icon_name}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => toggleActive(p)} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title={p.is_active ? "Nonaktifkan" : "Aktifkan"}>
                  <Eye className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => openEdit(p)} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleDelete(p.id)} className="rounded-lg p-1.5 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main AdminPage ─────────────────────────────────── */
type Tab = "overview" | "users" | "monitor" | "requests" | "knowledge" | "updates" | "reports" | "security" | "waitlist" | "performance" | "announcements" | "signals" | "news" | "procedures";

const TAB_ORDER_KEY = "aina_admin_tab_order";

const AdminPage = () => {
  const [isAdmin, setIsAdmin]           = useState(false);
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);
  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab]       = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats>({ totalUsers: 0, totalChats: 0, pendingRequests: 0, pendingArticles: 0, approvedArticles: 0, totalArticles: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  // ── Drag-and-drop state (desktop only) ────────────────
  const [tabOrder, setTabOrder]   = useState<Tab[]>([]);
  const dragIdx = useRef<number | null>(null);
  const overIdx = useRef<number | null>(null);
  const [dragOverId, setDragOverId] = useState<Tab | null>(null);
  const [draggingId, setDraggingId] = useState<Tab | null>(null);

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

  // Full ordered list (all possible tabs in default order)
  const allNavItems: Array<{ id: Tab; label: string; icon: React.ElementType; masterOnly?: boolean; badge?: number }> = [
    { id: "overview",      label: "Overview",        icon: LayoutDashboard },
    { id: "users",         label: "Users",           icon: Users,       masterOnly: true, badge: stats.totalUsers || undefined },
    { id: "monitor",       label: "Monitor",         icon: Eye,         masterOnly: true },
    { id: "requests",      label: "Requests",        icon: UserCheck,   badge: stats.pendingRequests || undefined },
    { id: "knowledge",     label: "Knowledge Base",  icon: FileText,    badge: stats.pendingArticles || undefined },
    { id: "updates",       label: "Breaking Updates",icon: Zap },
    { id: "news",          label: "Berita",          icon: Newspaper },
    { id: "reports",       label: "Laporan",         icon: Flag },
    { id: "waitlist",      label: "Waitlist Pro",    icon: Crown,       masterOnly: true },
    { id: "security",      label: "Security",        icon: ShieldAlert, masterOnly: true },
    { id: "performance",   label: "Performa AI",     icon: TrendingUp,  masterOnly: true },
    { id: "announcements", label: "Pengumuman",      icon: Megaphone,   masterOnly: true },
    { id: "signals",       label: "Sinyal User",     icon: ThumbsUp,    masterOnly: true },
    { id: "procedures",    label: "Prosedur",         icon: BookOpen,    masterOnly: true },
  ];

  // Visible tabs for this admin level
  const visibleItems = allNavItems.filter(t => !t.masterOnly || isMasterAdmin);
  const visibleIds   = visibleItems.map(t => t.id);

  // Resolve order: saved order (filtered to visible) + any new tabs appended
  const resolveOrder = (): Tab[] => {
    try {
      const saved: Tab[] = JSON.parse(localStorage.getItem(TAB_ORDER_KEY) || "[]");
      const valid = saved.filter(id => visibleIds.includes(id));
      const missing = visibleIds.filter(id => !valid.includes(id));
      return [...valid, ...missing];
    } catch {
      return visibleIds;
    }
  };

  // Initialize order once (after isMasterAdmin is known)
  const orderedIds = tabOrder.length > 0 ? tabOrder : resolveOrder();

  // Map id → nav item (for badge/label/icon access)
  const navMap = Object.fromEntries(allNavItems.map(t => [t.id, t]));

  // Ordered visible nav items (with live badge values)
  const navItems = orderedIds
    .filter(id => visibleIds.includes(id))
    .map(id => ({ ...navMap[id], badge: navMap[id]?.badge }));

  // ── Drag handlers ─────────────────────────────────────
  const onDragStart = (idx: number, id: Tab) => {
    dragIdx.current = idx;
    setDraggingId(id);
  };

  const onDragOver = (e: React.DragEvent, idx: number, id: Tab) => {
    e.preventDefault();
    overIdx.current = idx;
    setDragOverId(id);
  };

  const onDrop = () => {
    const from = dragIdx.current;
    const to   = overIdx.current;
    if (from === null || to === null || from === to) {
      cleanup(); return;
    }
    const next = [...orderedIds];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setTabOrder(next);
    try { localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(next)); } catch {}
    cleanup();
  };

  const cleanup = () => {
    dragIdx.current = null;
    overIdx.current = null;
    setDraggingId(null);
    setDragOverId(null);
  };

  const tabContent = (
    <>
      {activeTab === "overview"      && <OverviewTab stats={stats} loading={statsLoading} />}
      {activeTab === "users"         && isMasterAdmin && <UsersTab />}
      {activeTab === "monitor"       && isMasterAdmin && <ChatMonitorTab />}
      {activeTab === "requests"      && <RequestsTab />}
      {activeTab === "knowledge"     && <KnowledgeBaseTab isMasterAdmin={isMasterAdmin} />}
      {activeTab === "updates"       && <PinnedUpdatesTab />}
      {activeTab === "reports"       && <ReportsTab />}
      {activeTab === "waitlist"      && isMasterAdmin && <WaitlistTab />}
      {activeTab === "security"      && isMasterAdmin && <SecurityLogsTab />}
      {activeTab === "performance"   && isMasterAdmin && <PerformanceTab />}
      {activeTab === "announcements" && isMasterAdmin && <AnnouncementsTab />}
      {activeTab === "signals"       && isMasterAdmin && <FeedbackSignalsTab />}
      {activeTab === "news"          && <NewsManagementTab />}
      {activeTab === "procedures"    && isMasterAdmin && <ProcedureManagementTab />}
    </>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* ── MOBILE: horizontal scrollable tab bar ─────────── */}
      <div className="md:hidden flex flex-col h-full overflow-hidden">
        {/* Mobile header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-purple">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="font-display text-base font-bold text-foreground">Admin Panel</h1>
          </div>
        </div>
        {/* Mobile tab bar */}
        <div className="flex overflow-x-auto border-b border-border px-4 scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] shrink-0">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-xs font-medium transition-colors
                  ${isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" />
                {item.label}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {/* Mobile content */}
        <div className="flex-1 overflow-y-auto p-4">{tabContent}</div>
      </div>

      {/* ── DESKTOP: left sidebar + content ───────────────── */}
      <div className="hidden md:flex h-full overflow-hidden">

        {/* Sidebar */}
        <div className="flex w-52 shrink-0 flex-col border-r border-border overflow-hidden">
          {/* Sidebar header */}
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-4 shrink-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-purple">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-sm font-bold text-foreground leading-tight">Admin Panel</h1>
              <p className="text-[10px] text-muted-foreground truncate">Kelola platform AINA</p>
            </div>
          </div>

          {/* Nav items */}
          <div className="flex-1 overflow-y-auto py-2 scrollbar-none [scrollbar-width:none]">
            {navItems.map((item, idx) => {
              const isActive   = activeTab === item.id;
              const isDragging = draggingId === item.id;
              const isOver     = dragOverId === item.id && dragOverId !== draggingId;

              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => onDragStart(idx, item.id)}
                  onDragOver={e => onDragOver(e, idx, item.id)}
                  onDrop={onDrop}
                  onDragEnd={cleanup}
                  className={`mx-2 my-0.5 rounded-lg transition-all duration-150 select-none
                    ${isDragging ? "opacity-40 scale-95" : "opacity-100"}
                    ${isOver ? "border-t-2 border-t-primary/60" : "border-t-2 border-t-transparent"}
                  `}
                >
                  <button
                    onClick={() => setActiveTab(item.id)}
                    className={`group w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors text-left
                      ${isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"}
                    `}
                  >
                    <GripVertical className="shrink-0 h-3 w-3 text-muted-foreground/20 group-hover:text-muted-foreground/50 cursor-grab active:cursor-grabbing transition-colors" />
                    <item.icon className={`shrink-0 h-3.5 w-3.5 ${isActive ? "text-primary" : ""}`} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="shrink-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                        {item.badge}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Sidebar footer — drag hint */}
          <div className="border-t border-border px-4 py-2.5 shrink-0">
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground/40 select-none">
              <GripVertical className="h-3 w-3" /> drag to reorder
            </p>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-5">{tabContent}</div>
      </div>

    </div>
  );
};

export default AdminPage;
