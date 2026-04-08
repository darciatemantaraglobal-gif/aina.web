import { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
const MD_LINK = { a: ({ href, children }: any) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors break-all">{children}</a> };
import { supabase } from "@/integrations/supabase/client";
import NewsImageCropper from "@/components/NewsImageCropper";
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
  Wand2, FileUp, CheckCircle2, AlertTriangle, ChevronRight, Sparkles, Tags, Heading,
  Loader2, BarChart2,
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
  has_embedding?: boolean; keywords?: string | null;
  content_ar?: string | null;
  article_type?: string | null;
  summary?: string | null;
  important_notes?: string | null;
  image_url?: string | null;
}
interface Stats {
  totalUsers: number; totalChats: number; pendingRequests: number;
  pendingArticles: number; approvedArticles: number; totalArticles: number;
}

/* ─── Helpers ────────────────────────────────────────── */
const CATEGORIES = ["Administrasi", "Akademik", "Kehidupan Mesir", "Transport", "Tempat Tinggal", "Kuliner", "Bahasa"];
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

async function adminFetch(path: string, options: RequestInit = {}, timeoutMs = 15000) {
  const auth = await getAuthHeader();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
type UsageDay = { date: string; label: string; queries: number; dau: number; new_users: number };
type UsageStats = {
  today: { queries: number; active_users: number; new_users: number; new_chats: number };
  daily_14d: UsageDay[];
  totals: { threads: number; messages: number };
};

function OverviewTab({ stats, loading }: { stats: Stats; loading: boolean }) {
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [chartMode, setChartMode] = useState<"queries" | "dau">("queries");

  useEffect(() => {
    adminFetch("/api/admin/usage-stats")
      .then(d => setUsage(d))
      .catch(() => {})
      .finally(() => setUsageLoading(false));
  }, []);

  const cards = [
    { label: "Total User", value: stats.totalUsers, icon: Users, color: "text-violet-400", bg: "bg-violet-500/10" },
    { label: "Total Chat", value: stats.totalChats, icon: MessageSquare, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Req. Pending", value: stats.pendingRequests, icon: UserCheck, color: "text-yellow-400", bg: "bg-yellow-500/10" },
    { label: "Artikel Pending", value: stats.pendingArticles, icon: AlertCircle, color: "text-orange-400", bg: "bg-orange-500/10" },
    { label: "Artikel Aktif", value: stats.approvedArticles, icon: BookOpen, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "Total Artikel", value: stats.totalArticles, icon: TrendingUp, color: "text-pink-400", bg: "bg-pink-500/10" },
  ];

  const daily = usage?.daily_14d ?? [];
  const maxVal = Math.max(...daily.map(d => chartMode === "queries" ? d.queries : d.dau), 1);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">Gambaran Umum</h2>
        <p className="text-sm text-muted-foreground">Statistik platform AINA secara real-time.</p>
      </div>

      {/* Static counters */}
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

      {/* Today's live metrics */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-4 font-medium text-foreground">Aktivitas Hari Ini</h3>
        {usageLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0,1,2,3].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Query AI", value: usage?.today.queries ?? 0, color: "text-violet-400" },
              { label: "User Aktif", value: usage?.today.active_users ?? 0, color: "text-green-400" },
              { label: "User Baru", value: usage?.today.new_users ?? 0, color: "text-blue-400" },
              { label: "Chat Baru", value: usage?.today.new_chats ?? 0, color: "text-yellow-400" },
            ].map(m => (
              <div key={m.label} className="rounded-xl border border-border bg-secondary/40 p-3 text-center">
                <p className={`font-display text-2xl font-bold ${m.color}`}>{m.value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{m.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 14-day trend chart */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-medium text-foreground">Tren 14 Hari Terakhir</h3>
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            <button
              onClick={() => setChartMode("queries")}
              className={`px-3 py-1 transition-colors ${chartMode === "queries" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Query AI
            </button>
            <button
              onClick={() => setChartMode("dau")}
              className={`px-3 py-1 transition-colors ${chartMode === "dau" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              DAU
            </button>
          </div>
        </div>
        {usageLoading ? (
          <div className="flex items-end gap-1 h-28">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="flex-1 animate-pulse rounded-t bg-muted" style={{ height: `${Math.random() * 70 + 20}%` }} />
            ))}
          </div>
        ) : daily.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data query.</p>
        ) : (
          <div className="flex items-end gap-[3px] h-28">
            {daily.map(d => {
              const val = chartMode === "queries" ? d.queries : d.dau;
              const pct = maxVal > 0 ? Math.max((val / maxVal) * 100, val > 0 ? 4 : 0) : 0;
              const isToday = d.date === new Date().toISOString().split("T")[0];
              return (
                <div key={d.date} className="group relative flex-1 flex flex-col items-center justify-end h-full">
                  <div
                    className={`w-full rounded-t transition-opacity ${isToday ? "bg-primary" : "bg-primary/40 group-hover:bg-primary/60"}`}
                    style={{ height: `${pct}%` }}
                  />
                  {/* tooltip */}
                  <div className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-10 hidden group-hover:flex flex-col items-center">
                    <div className="rounded-lg bg-popover border border-border px-2 py-1.5 text-[11px] text-center shadow-md whitespace-nowrap">
                      <p className="font-semibold text-foreground">{val} {chartMode === "queries" ? "query" : "user"}</p>
                      <p className="text-muted-foreground">{d.label}</p>
                    </div>
                    <div className="h-1.5 w-px bg-border" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!usageLoading && daily.length > 0 && (
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground/50">
            <span>{daily[0]?.label}</span>
            <span>Hari ini</span>
          </div>
        )}
        {!usageLoading && usage && (
          <div className="mt-4 flex gap-4 text-xs text-muted-foreground border-t border-border pt-3">
            <span>Total pesan: <span className="text-foreground font-medium">{usage.totals.messages.toLocaleString("id-ID")}</span></span>
            <span>Total thread: <span className="text-foreground font-medium">{usage.totals.threads.toLocaleString("id-ID")}</span></span>
          </div>
        )}
      </div>

      {/* Role structure */}
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
      const auth = await getAuthHeader();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);
      const res = await fetch("/api/admin/articles/bulk-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ rawText: combined }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Gagal" })); throw new Error(err.error); }
      const data = await res.json();
      setArticles(data.articles.map((a: ParsedArticle) => ({ ...a, maps_url: "", contact_number: "" })));
      setStep("preview");
    } catch (e: any) { toast.error(e.name === "AbortError" ? "Timeout — coba kurangi jumlah konten" : e.message); setStep("results"); }
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

  const htmlInputRef = useRef<HTMLInputElement>(null);

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

  const handleHtmlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    let pending = files.length;
    const results: { name: string; text: string }[] = [];

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const html = ev.target?.result as string;
        const doc = new DOMParser().parseFromString(html, "text/html");
        // Remove script/style tags before extracting text
        doc.querySelectorAll("script, style, noscript, nav, footer, header").forEach(el => el.remove());
        // Preserve heading structure and paragraph breaks
        doc.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach(el => {
          el.textContent = `\n\n## ${el.textContent?.trim()}\n`;
        });
        doc.querySelectorAll("p, li, br, tr").forEach(el => {
          el.insertAdjacentText("afterend", "\n");
        });
        const text = (doc.body?.textContent || "")
          .replace(/\n{3,}/g, "\n\n") // collapse excess blank lines
          .trim();
        results.push({ name: file.name, text });
        pending--;
        if (pending === 0) {
          const combined = results.map(r => `<!-- ${r.name} -->\n${r.text}`).join("\n\n---\n\n");
          setRawText(prev => prev ? `${prev}\n\n---\n\n${combined}` : combined);
          toast.success(`${files.length} file HTML berhasil dimuat`);
        }
      };
      reader.readAsText(file, "utf-8");
    });
    e.target.value = "";
  };

  const [imageProgress, setImageProgress] = useState("");

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const tooBig = files.filter(f => f.size > 10 * 1024 * 1024);
    if (tooBig.length) { toast.error(`${tooBig.length} file melebihi 10 MB`); return; }

    setImageLoading(true);
    const extracted: string[] = [];
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setImageProgress(`Membaca gambar ${i + 1} / ${files.length}…`);
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
        if (!res.ok) { failed++; continue; }
        const data = await res.json();
        extracted.push(data.text);
      } catch { failed++; }
    }

    if (extracted.length) {
      setRawText(prev => prev ? prev + "\n\n" + extracted.join("\n\n") : extracted.join("\n\n"));
      toast.success(`${extracted.length} gambar berhasil diekstrak${failed ? `, ${failed} gagal` : ""}`);
    } else {
      toast.error("Semua gambar gagal diproses");
    }
    setImageLoading(false);
    setImageProgress("");
    e.target.value = "";
  };

  const handleParse = async () => {
    if (!rawText.trim()) { toast.error("Paste teks dulu!"); return; }
    setStep("parsing"); setParseError("");
    try {
      const auth = await getAuthHeader();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000); // 90s — AI needs time for large text
      const res = await fetch("/api/admin/articles/bulk-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ rawText }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Gagal" }));
        throw new Error(err.error || "Gagal memproses teks");
      }
      const data = await res.json();
      setArticles(data.articles.map((a: ParsedArticle) => ({ ...a, maps_url: "", contact_number: "" })));
      setStep("preview");
    } catch (e: any) {
      if (e.name === "AbortError") {
        setParseError("Teks terlalu panjang dan AI membutuhkan waktu lebih. Coba kurangi jumlah gambar dan parse per batch.");
      } else {
        setParseError(e.message || "Gagal memproses teks");
      }
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
      if (data.errors?.length) {
        data.errors.forEach((e: string) => console.warn("[bulk-import]", e));
        toast.error(`${data.errors.length} artikel gagal diimpor: ${data.errors[0]}`);
      }
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
                      ? <><div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />{imageProgress || "Membaca..."}</>
                      : <><Image className="h-3.5 w-3.5" /> Gambar (bulk)</>
                    }
                  </button>
                  <button
                    onClick={() => htmlInputRef.current?.click()}
                    disabled={step === "parsing" || imageLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-dashed border-orange-500/40 bg-orange-500/5 hover:bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-400 transition-colors disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    .html
                  </button>
                  <input ref={fileInputRef}  type="file" accept=".txt,text/plain" className="hidden" onChange={handleFileUpload} />
                  <input ref={htmlInputRef}  type="file" accept=".html,.htm,text/html" multiple className="hidden" onChange={handleHtmlUpload} />
                  <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
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

type ArticleFormData = {
  title: string; content: string; category: string;
  article_type?: string; keywords?: string;
  summary?: string; important_notes?: string;
  maps_url?: string; contact_number?: string;
  image_url?: string;
};

function ArticleFormDialog({
  open, onClose, onSave, initial, articleId,
}: {
  open: boolean; onClose: () => void;
  onSave: (data: ArticleFormData) => Promise<void>;
  initial?: ArticleFormData;
  articleId?: string;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [articleType, setArticleType] = useState(initial?.article_type ?? "narrative");
  const [keywords, setKeywords] = useState(initial?.keywords ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [importantNotes, setImportantNotes] = useState(initial?.important_notes ?? "");
  const [mapsUrl, setMapsUrl] = useState(initial?.maps_url ?? "");
  const [contactNumber, setContactNumber] = useState(initial?.contact_number ?? "");
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [contentAr, setContentAr] = useState<string | null>(null);
  const [showAr, setShowAr] = useState(false);
  const [previewContent, setPreviewContent] = useState(false);
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? "");
  const [imgUploading, setImgUploading] = useState(false);
  const kbImgInputRef = useRef<HTMLInputElement>(null);
  const prevOpenRef = useRef(false);

  // Client-side image compression — resize to max 900px, target <200KB JPEG
  const compressImage = (file: File): Promise<File> => new Promise(resolve => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      const MAX_W = 900;
      if (width > MAX_W) { height = Math.round(height * MAX_W / width); width = MAX_W; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      const tryBlob = (q: number) => {
        canvas.toBlob(blob => {
          if (!blob) { resolve(file); return; }
          if (blob.size <= 200 * 1024 || q <= 0.3) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
          } else { tryBlob(Math.max(0.3, q - 0.12)); }
        }, "image/jpeg", q);
      };
      tryBlob(0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });

  const uploadKbImage = async (file: File) => {
    setImgUploading(true);
    try {
      const compressed = await compressImage(file);
      const auth = await getAuthHeader();
      const fd = new FormData();
      fd.append("file", compressed);
      const res = await fetch("/api/admin/upload-image", { method: "POST", headers: { Authorization: auth }, body: fd });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Gagal upload gambar"); return; }
      setImageUrl(json.publicUrl);
      toast.success(`Poster diupload (${Math.round(compressed.size / 1024)} KB)`);
    } catch { toast.error("Upload gagal. Coba lagi."); }
    finally { setImgUploading(false); }
  };

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setTitle(initial?.title ?? "");
      setContent(initial?.content ?? "");
      setCategory(initial?.category ?? "");
      setArticleType(initial?.article_type ?? "narrative");
      setKeywords(initial?.keywords ?? "");
      setSummary(initial?.summary ?? "");
      setImportantNotes(initial?.important_notes ?? "");
      setMapsUrl(initial?.maps_url ?? "");
      setContactNumber(initial?.contact_number ?? "");
      setImageUrl(initial?.image_url ?? "");
      setContentAr(null);
      setShowAr(false);
      setPreviewContent(false);
    }
    prevOpenRef.current = open;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!title.trim() || !content.trim() || !category) { toast.error("Semua field harus diisi"); return; }
    setSaving(true);
    await onSave({
      title: title.trim(), content: content.trim(), category,
      article_type: articleType,
      keywords: keywords.trim() || undefined,
      summary: summary.trim() || undefined,
      important_notes: importantNotes.trim() || undefined,
      maps_url: mapsUrl.trim() || undefined,
      contact_number: contactNumber.trim() || undefined,
      image_url: imageUrl.trim() || undefined,
    });
    setSaving(false);
  };

  const handleTranslateArabic = async () => {
    if (!articleId) return;
    setTranslating(true);
    try {
      const data = await adminFetch(`/api/admin/articles/${articleId}/translate-arabic`, { method: "POST" });
      setContentAr(data.content_ar);
      setShowAr(true);
      toast.success("Terjemahan Arab berhasil dibuat");
    } catch (e: any) {
      toast.error(e.message || "Terjemahan gagal");
    }
    setTranslating(false);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{initial ? "Edit Artikel" : "Tambah Artikel Baru"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Row: Judul */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Judul</label>
            <Input placeholder="Judul artikel" value={title} onChange={e => setTitle(e.target.value)} className="bg-secondary" />
          </div>

          {/* Row: Kategori + Tipe Artikel */}
          <div className="grid grid-cols-2 gap-3">
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
              <label className="text-xs font-medium text-muted-foreground">Tipe Artikel</label>
              <Select value={articleType} onValueChange={setArticleType}>
                <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="narrative">Narasi (paragraf)</SelectItem>
                  <SelectItem value="step_by_step">Langkah demi langkah</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Konten + Markdown Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Konten</label>
              <div className="flex items-center gap-3">
                <span className={`text-[11px] ${content.length > 9000 ? "text-red-400" : "text-muted-foreground/60"}`}>
                  {content.length.toLocaleString("id-ID")} karakter
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewContent(v => !v)}
                  className="text-[11px] text-primary hover:underline"
                >
                  {previewContent ? "Edit" : "Preview"}
                </button>
              </div>
            </div>
            {previewContent ? (
              <div className="min-h-[200px] max-h-[340px] overflow-y-auto rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground prose prose-sm prose-invert max-w-none
                prose-headings:text-foreground prose-headings:font-semibold prose-p:my-1 prose-ul:my-1 prose-li:my-0.5
                prose-strong:text-foreground prose-code:text-primary prose-code:bg-secondary prose-code:px-1 prose-code:rounded prose-code:text-xs">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_LINK}>{content || "_Konten kosong_"}</ReactMarkdown>
              </div>
            ) : (
              <Textarea
                placeholder="Tulis isi artikel (mendukung Markdown)..."
                value={content}
                onChange={e => setContent(e.target.value)}
                className="min-h-[200px] max-h-[340px] bg-secondary resize-y font-mono text-xs leading-relaxed"
              />
            )}
          </div>

          {/* Keywords */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Keywords <span className="font-normal text-muted-foreground/60">(opsional, pisahkan dengan koma)</span>
              </label>
              <span className={`text-[11px] ${keywords.length > 450 ? "text-red-400" : "text-muted-foreground/60"}`}>
                {keywords.length}/500
              </span>
            </div>
            <Input
              placeholder="visa, imigrasi, dokumen, KBRI, pendaftaran"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              maxLength={500}
              className="bg-secondary text-xs"
            />
            <p className="text-[11px] text-muted-foreground/60">
              Kata kunci meningkatkan akurasi pencarian AINA. Pisahkan dengan koma.
            </p>
          </div>

          {/* Summary */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Ringkasan <span className="font-normal text-muted-foreground/60">(opsional, 2-3 kalimat)</span>
              </label>
              <span className={`text-[11px] ${summary.length > 550 ? "text-red-400" : "text-muted-foreground/60"}`}>
                {summary.length}/600
              </span>
            </div>
            <Textarea
              placeholder="Ringkasan singkat artikel untuk preview & relevansi pencarian..."
              value={summary}
              onChange={e => setSummary(e.target.value)}
              maxLength={600}
              className="min-h-[70px] bg-secondary resize-none text-xs"
            />
          </div>

          {/* Important Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Catatan Penting / Peringatan <span className="font-normal text-muted-foreground/60">(opsional)</span>
            </label>
            <Textarea
              placeholder="Peringatan, pengecualian, atau catatan khusus yang perlu disampaikan AINA..."
              value={importantNotes}
              onChange={e => setImportantNotes(e.target.value)}
              maxLength={1000}
              className="min-h-[70px] bg-secondary resize-none text-xs"
            />
            <p className="text-[11px] text-muted-foreground/60">
              AINA akan menyertakan catatan ini saat menjawab pertanyaan terkait artikel ini (misal: "Perhatian: proses ini bisa memakan waktu 3-4 minggu").
            </p>
          </div>

          {/* Arabic translation — only shown when editing an existing article */}
          {articleId && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  🌙 Terjemahan Bahasa Arab
                  <span className="text-[11px] font-normal text-muted-foreground/60">(opsional)</span>
                </label>
                <div className="flex items-center gap-2">
                  {contentAr && (
                    <button
                      type="button"
                      onClick={() => setShowAr(v => !v)}
                      className="text-[11px] text-primary hover:underline"
                    >
                      {showAr ? "Sembunyikan" : "Lihat"}
                    </button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleTranslateArabic}
                    disabled={translating}
                    className="h-7 text-[11px] gap-1.5 border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
                  >
                    {translating ? (
                      <><Loader2 className="h-3 w-3 animate-spin" />Menerjemahkan...</>
                    ) : (
                      <>✨ {contentAr ? "Terjemahkan Ulang" : "Terjemahkan ke Arab"}</>
                    )}
                  </Button>
                </div>
              </div>
              {showAr && contentAr && (
                <div className="rounded-xl border border-border bg-secondary/50 px-3.5 py-3">
                  <p className="text-xs text-muted-foreground/60 mb-2 text-right" dir="rtl">المحتوى بالعربية</p>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap text-right" dir="rtl">{contentAr}</p>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground/60">
                AINA akan menggunakan terjemahan ini untuk menjawab pertanyaan dalam Bahasa Arab dan meningkatkan pencarian multibahasa.
              </p>
            </div>
          )}

          {/* Maps & Contact */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                🗺️ Link Google Maps <span className="font-normal text-muted-foreground/60">(opsional)</span>
              </label>
              <Input
                placeholder="https://maps.google.com/?q=..."
                value={mapsUrl}
                onChange={e => setMapsUrl(e.target.value)}
                className="bg-secondary text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                📞 Nomor Telepon / WA <span className="font-normal text-muted-foreground/60">(opsional)</span>
              </label>
              <Input
                type="tel"
                placeholder="+62 812-3456-7890"
                value={contactNumber}
                onChange={e => setContactNumber(e.target.value)}
                maxLength={50}
                className="bg-secondary text-xs"
              />
            </div>
          </div>

          {/* Poster / Gambar — dengan kompresi client-side */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              🖼️ Poster / Gambar
              <span className="font-normal text-muted-foreground/60">(opsional — otomatis dikompres &lt;200KB)</span>
            </label>
            <input
              ref={kbImgInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadKbImage(f); e.target.value = ""; }}
            />
            {imageUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-border">
                <img src={imageUrl} alt="Preview poster" className="w-full max-h-44 object-contain bg-black/10" />
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => kbImgInputRef.current?.click()}
                    disabled={imgUploading}
                    className="rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-black/80 transition-colors"
                  >
                    {imgUploading ? "Mengupload..." : "Ganti"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageUrl("")}
                    className="rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-600/80 transition-colors"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => kbImgInputRef.current?.click()}
                disabled={imgUploading}
                className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 py-5 text-center hover:bg-muted/50 transition-colors disabled:opacity-60"
              >
                {imgUploading
                  ? <><RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" /><span className="text-xs text-muted-foreground">Mengompresi & mengupload...</span></>
                  : <><Image className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Upload poster (JPG/PNG/WebP) — dikompres otomatis</span></>
                }
              </button>
            )}
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
  const [kwGenLoading, setKwGenLoading] = useState(false);
  const [kwGenProgress, setKwGenProgress] = useState<{
    running: boolean; total: number; generated: number; errors: number;
    withKeywords: number; totalArticles: number;
    startedAt: string | null; completedAt: string | null;
  } | null>(null);
  const kwGenPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [autoCatLoading, setAutoCatLoading] = useState(false);
  const [autoCatProgress, setAutoCatProgress] = useState<{
    running: boolean; total: number; processed: number; updated: number; errors: number;
    totalArticles: number; startedAt: string | null; completedAt: string | null;
  } | null>(null);
  const autoCatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [embedLoading, setEmbedLoading] = useState(false);
  const [selectionEmbedLoading, setSelectionEmbedLoading] = useState(false);
  const [embedProgress, setEmbedProgress] = useState<{
    running: boolean; total: number; embedded: number; errors: number;
    withEmbedding: number; totalArticles: number;
    startedAt: string | null; completedAt: string | null;
    openaiConfigured?: boolean;
  } | null>(null);
  const embedPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [bulkHideLoading, setBulkHideLoading] = useState(false);
  const [selectionAutoCatLoading, setSelectionAutoCatLoading] = useState(false);
  const [autoTitleingId, setAutoTitleingId] = useState<string | null>(null);
  const [autoCatOneId, setAutoCatOneId] = useState<string | null>(null);
  const [selectionAutoTitleLoading, setSelectionAutoTitleLoading] = useState(false);

  const handleReformatOne = async (id: string) => {
    setReformattingId(id);
    try {
      await adminFetch(`/api/admin/articles/${id}/reformat`, { method: "POST" }, 120000);
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
      const result = await adminFetch("/api/admin/articles/reformat-all", { method: "POST" }, 600000);
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

  const [bulkReformatLoading, setBulkReformatLoading] = useState(false);

  const handleBulkReformat = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Reformat ${selected.size} artikel dengan AI? Konten akan diperbaiki strukturnya tanpa mengubah isi. Proses ini bisa memakan waktu beberapa menit.`)) return;
    setBulkReformatLoading(true);
    try {
      const auth = await getAuthHeader();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 menit
      const res = await fetch("/api/admin/articles/bulk-reformat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ ids: Array.from(selected) }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Gagal" })); throw new Error(err.error); }
      const result = await res.json();
      toast.success(`Selesai! ${result.reformatted} artikel berhasil diformat${result.failed > 0 ? `, ${result.failed} gagal` : ""}.`);
      load();
    } catch (e: any) {
      toast.error(e.name === "AbortError" ? "Timeout — coba kurangi jumlah artikel yang dipilih" : e.message);
    }
    setBulkReformatLoading(false);
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

  const handleAdd = async (data: ArticleFormData) => {
    try {
      await adminFetch("/api/admin/articles", { method: "POST", body: JSON.stringify(data) });
      toast.success("Artikel ditambahkan!");
      setAddOpen(false);
      if (filter === "approved") load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleEdit = async (data: ArticleFormData) => {
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

  const fetchKwGenStatus = useCallback(async () => {
    try {
      const s = await adminFetch("/api/admin/articles/generate-keywords/status");
      setKwGenProgress(s);
      if (!s.running) {
        setKwGenLoading(false);
        if (kwGenPollRef.current) { clearInterval(kwGenPollRef.current); kwGenPollRef.current = null; }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchKwGenStatus();
    return () => { if (kwGenPollRef.current) clearInterval(kwGenPollRef.current); };
  }, [fetchKwGenStatus]);

  const fetchAutoCatStatus = useCallback(async () => {
    try {
      const s = await adminFetch("/api/admin/articles/auto-categorize/status");
      setAutoCatProgress(s);
      if (!s.running) {
        setAutoCatLoading(false);
        if (autoCatPollRef.current) { clearInterval(autoCatPollRef.current); autoCatPollRef.current = null; }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchAutoCatStatus();
    return () => { if (autoCatPollRef.current) clearInterval(autoCatPollRef.current); };
  }, [fetchAutoCatStatus]);

  const handleGenerateKeywords = async () => {
    if (kwGenProgress?.running) return;
    const total = kwGenProgress?.totalArticles ?? 0;
    const mins = Math.max(1, Math.round((total * 0.2) / 60));
    if (!confirm(`Generate kata kunci AI untuk ${total} artikel approved?\nEstimasi waktu: ~${mins} menit. Proses berjalan di background.`)) return;
    setKwGenLoading(true);
    try {
      const result = await adminFetch("/api/admin/articles/generate-keywords", {
        method: "POST",
        body: JSON.stringify({ regenerate: true }),
      });
      if (result.alreadyRunning) {
        toast.info("Proses generate keyword sedang berjalan.");
      } else if (result.started) {
        toast.success(`Dimulai — ${result.total} artikel sedang diproses.`);
        kwGenPollRef.current = setInterval(fetchKwGenStatus, 3000);
        fetchKwGenStatus();
      } else {
        toast.info("Tidak ada artikel yang perlu diproses.");
        setKwGenLoading(false);
      }
    } catch (e: any) { toast.error(e.message); setKwGenLoading(false); }
  };

  const handleBulkAutoCategorize = async () => {
    if (autoCatProgress?.running) return;
    const total = autoCatProgress?.totalArticles ?? 0;
    const mins = Math.max(1, Math.round((total * 0.35) / 60));
    if (!confirm(`Auto-kategorisasi AI untuk semua ${total} artikel di KB?\nKategori & tipe artikel akan di-update berdasarkan konten.\nEstimasi waktu: ~${mins} menit. Proses berjalan di background.`)) return;
    setAutoCatLoading(true);
    try {
      const result = await adminFetch("/api/admin/articles/auto-categorize/bulk", { method: "POST" });
      if (result.alreadyRunning) {
        toast.info("Proses auto-kategorisasi sedang berjalan.");
      } else if (result.started) {
        toast.success(`Dimulai — ${result.total} artikel sedang dikategorisasi.`);
        autoCatPollRef.current = setInterval(fetchAutoCatStatus, 3000);
        fetchAutoCatStatus();
      } else {
        toast.info("Tidak ada artikel yang perlu diproses.");
        setAutoCatLoading(false);
      }
    } catch (e: any) { toast.error(e.message); setAutoCatLoading(false); }
  };

  const fetchEmbedStatus = useCallback(async () => {
    try {
      const s = await adminFetch("/api/admin/articles/generate-embeddings/status");
      setEmbedProgress(s);
      if (!s.running) {
        setEmbedLoading(false);
        setSelectionEmbedLoading(false);
        if (embedPollRef.current) { clearInterval(embedPollRef.current); embedPollRef.current = null; }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchEmbedStatus();
    return () => { if (embedPollRef.current) clearInterval(embedPollRef.current); };
  }, [fetchEmbedStatus]);

  const startEmbedPoll = () => {
    if (!embedPollRef.current) {
      embedPollRef.current = setInterval(fetchEmbedStatus, 2000);
      fetchEmbedStatus();
    }
  };

  const handleGenerateEmbeddings = async () => {
    if (embedLoading || embedProgress?.running) return;
    const total = embedProgress?.totalArticles ?? 0;
    const mins = Math.max(1, Math.round((total * 0.2) / 60));
    if (!confirm(`Generate embedding RAG untuk semua ${total} artikel approved?\nEstimasi: ~${mins} menit. Proses berjalan di background.`)) return;
    setEmbedLoading(true);
    try {
      const result = await adminFetch("/api/admin/articles/generate-embeddings", { method: "POST" });
      if (result.alreadyRunning) {
        toast.info("Proses embedding sedang berjalan.");
        startEmbedPoll();
      } else if (result.started) {
        toast.success(`Dimulai — ${result.total} artikel sedang di-embed.`);
        startEmbedPoll();
      } else {
        toast.info("Tidak ada artikel yang perlu diproses.");
        setEmbedLoading(false);
      }
    } catch (e: any) { toast.error(e.message); setEmbedLoading(false); }
  };

  const handleSelectionEmbed = async () => {
    if (selected.size === 0 || selectionEmbedLoading || embedProgress?.running) return;
    const ids = [...selected];
    const mins = Math.max(1, Math.round((ids.length * 0.2) / 60));
    if (!confirm(`Generate RAG embedding untuk ${ids.length} artikel yang dipilih?\nEstimasi: ~${mins} menit.`)) return;
    setSelectionEmbedLoading(true);
    try {
      const result = await adminFetch("/api/admin/articles/generate-embeddings", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      if (result.alreadyRunning) {
        toast.info("Proses embedding sedang berjalan.");
        startEmbedPoll();
      } else if (result.started) {
        toast.success(`Dimulai — ${ids.length} artikel sedang di-embed.`);
        setSelected(new Set());
        startEmbedPoll();
      } else {
        toast.info("Tidak ada artikel yang perlu diproses.");
        setSelectionEmbedLoading(false);
      }
    } catch (e: any) { toast.error(e.message); setSelectionEmbedLoading(false); }
  };

  const handleAutoTitleOne = async (art: Article) => {
    if (autoTitleingId) return;
    setAutoTitleingId(art.id);
    try {
      const result = await adminFetch(`/api/admin/articles/${art.id}/auto-title`, { method: "POST" });
      if (result.newTitle) {
        setArticles(prev => prev.map(a => a.id === art.id ? { ...a, title: result.newTitle } : a));
        toast.success(`Judul diperbarui AI`, { description: result.newTitle });
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setAutoTitleingId(null); }
  };

  const handleAutoCatOne = async (art: Article) => {
    if (autoCatOneId) return;
    setAutoCatOneId(art.id);
    try {
      const result = await adminFetch(`/api/admin/articles/${art.id}/auto-categorize`, { method: "POST" });
      if (result.category || result.type) {
        setArticles(prev => prev.map(a => a.id === art.id
          ? { ...a, ...(result.category && { category: result.category }), ...(result.type && { type: result.type }) }
          : a
        ));
        toast.success(`Kategori diperbarui AI`, { description: `${result.category ?? ""}${result.type ? ` · ${result.type}` : ""}` });
      } else {
        toast.info("AI tidak menemukan perubahan kategori");
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setAutoCatOneId(null); }
  };

  const handleSelectionAutoTitle = async () => {
    if (selected.size === 0 || selectionAutoTitleLoading) return;
    const ids = [...selected];
    if (!confirm(`Auto-judul AI untuk ${ids.length} artikel yang dipilih?\nJudul akan di-rewrite satu per satu (masing-masing ~5 detik).`)) return;
    setSelectionAutoTitleLoading(true);
    let updated = 0, errors = 0;
    for (const id of ids) {
      try {
        const result = await adminFetch(`/api/admin/articles/${id}/auto-title`, { method: "POST" });
        if (result.newTitle) {
          setArticles(prev => prev.map(a => a.id === id ? { ...a, title: result.newTitle } : a));
          updated++;
        } else { errors++; }
      } catch { errors++; }
    }
    toast.success(`${updated}/${ids.length} judul diperbarui AI${errors > 0 ? `, ${errors} gagal` : ""}`);
    setSelected(new Set());
    setSelectionAutoTitleLoading(false);
  };

  const handleBulkHide = async (hide: boolean) => {
    if (selected.size === 0 || bulkHideLoading) return;
    const label = hide ? "sembunyikan" : "tampilkan kembali";
    if (!confirm(`Yakin ${label} ${selected.size} artikel sekaligus dari publik?`)) return;
    setBulkHideLoading(true);
    try {
      await adminFetch("/api/admin/articles/bulk-visibility", {
        method: "PATCH",
        body: JSON.stringify({ ids: [...selected], hidden: hide }),
      });
      toast.success(hide ? `${selected.size} artikel disembunyikan dari publik` : `${selected.size} artikel ditampilkan kembali`);
      setArticles(prev => prev.map(a => selected.has(a.id) ? { ...a, hidden: hide } : a));
      setSelected(new Set());
    } catch (e: any) { toast.error(e.message); }
    finally { setBulkHideLoading(false); }
  };

  const handleSelectionAutoCat = async () => {
    if (selected.size === 0 || selectionAutoCatLoading) return;
    const ids = [...selected];
    if (!confirm(`Auto-kategorisasi AI untuk ${ids.length} artikel yang dipilih?\nKategori & tipe akan di-update satu per satu (masing-masing ~5 detik).`)) return;
    setSelectionAutoCatLoading(true);
    let updated = 0, errors = 0;
    for (const id of ids) {
      try {
        const result = await adminFetch(`/api/admin/articles/${id}/auto-categorize`, { method: "POST" });
        if (result.category) {
          setArticles(prev => prev.map(a =>
            a.id === id ? { ...a, category: result.category, ...(result.article_type ? { article_type: result.article_type } : {}) } : a
          ));
          updated++;
        } else { errors++; }
      } catch { errors++; }
    }
    toast.success(`${updated}/${ids.length} artikel dikategorisasi${errors > 0 ? `, ${errors} gagal` : ""}`);
    setSelected(new Set());
    setSelectionAutoCatLoading(false);
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
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-foreground sm:text-lg">Moderasi Knowledge Base</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">Review, terbitkan, dan kelola artikel KB.</p>
        </div>
        <Button onClick={() => setAddOpen(true)} size="sm" className="shrink-0 gap-1.5 bg-gradient-purple text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Tambah Artikel
        </Button>
      </div>

      {/* ── Toolbar ── */}
      <div className="rounded-xl border border-border bg-card/60 p-2 flex flex-wrap items-center gap-1.5">
        {/* Content tools */}
        <Button onClick={() => setScraperOpen(true)} size="sm" variant="ghost"
          className="h-8 gap-1.5 text-xs text-sky-400 hover:bg-sky-500/10 hover:text-sky-300">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current shrink-0" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.883 13.7l-2.963-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.268.859z"/>
          </svg>
          Ambil dari Bot
        </Button>
        <Button onClick={() => setBulkImportOpen(true)} size="sm" variant="ghost"
          className="h-8 gap-1.5 text-xs text-primary hover:bg-primary/10 hover:text-primary">
          <Wand2 className="h-3.5 w-3.5" /> Import Massal
        </Button>

        {isMasterAdmin && (
          <>
            {/* Separator */}
            <div className="h-5 w-px bg-border mx-0.5" />

            {/* AI tools */}
            <span className="text-[10px] text-muted-foreground/60 font-medium px-1 uppercase tracking-wide">AI Tools</span>
            <Button
              size="sm" variant="ghost"
              className="h-8 gap-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
              disabled={kwGenLoading || kwGenProgress?.running}
              onClick={handleGenerateKeywords}
              title="Generate kata kunci AI untuk semua artikel — meningkatkan kemampuan AINA menemukan artikel dari berbagai cara bertanya"
            >
              {(kwGenLoading || kwGenProgress?.running)
                ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                    {kwGenProgress?.running && kwGenProgress.total > 0
                      ? `${kwGenProgress.generated}/${kwGenProgress.total}...`
                      : "Generating..."}
                  </>
                : <><Sparkles className="h-3.5 w-3.5" /> Gen Keywords</>
              }
            </Button>
            <Button
              size="sm" variant="ghost"
              className="h-8 gap-1.5 text-xs text-violet-400 hover:bg-violet-500/10 hover:text-violet-300"
              disabled={autoCatLoading || autoCatProgress?.running}
              onClick={handleBulkAutoCategorize}
              title="Auto-kategorisasi semua artikel KB menggunakan AI — update kategori & tipe artikel secara massal"
            >
              {(autoCatLoading || autoCatProgress?.running)
                ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
                    {autoCatProgress?.running && autoCatProgress.total > 0
                      ? `${autoCatProgress.processed}/${autoCatProgress.total}...`
                      : "Auto-cat..."}
                  </>
                : <><Tags className="h-3.5 w-3.5" /> Auto-Kategori</>
              }
            </Button>
            <Button
              size="sm" variant="ghost"
              className={`h-8 gap-1.5 text-xs hover:bg-blue-500/10 ${embedProgress?.openaiConfigured === false ? "text-orange-400 hover:text-orange-300" : "text-blue-400 hover:text-blue-300"}`}
              disabled={embedLoading || embedProgress?.running}
              onClick={handleGenerateEmbeddings}
              title={
                embedProgress?.openaiConfigured === false
                  ? "OPENAI_API_KEY belum dikonfigurasi — vector RAG tidak tersedia. Hanya keyword search yang aktif."
                  : embedProgress
                  ? `${embedProgress.withEmbedding}/${embedProgress.totalArticles} artikel sudah ter-embed. Klik untuk re-embed semua.`
                  : "Generate embedding RAG untuk semua artikel KB"
              }
            >
              {(embedLoading || embedProgress?.running)
                ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" /> {embedProgress?.running ? `${embedProgress.embedded}/${embedProgress.total}...` : "Memulai..."}</>
                : embedProgress?.openaiConfigured === false
                ? <><AlertCircle className="h-3.5 w-3.5" /> RAG (No API Key)</>
                : <><Zap className="h-3.5 w-3.5" /> Gen RAG {embedProgress ? `(${embedProgress.withEmbedding}/${embedProgress.totalArticles})` : ""}</>
              }
            </Button>

            {/* Separator */}
            <div className="h-5 w-px bg-border mx-0.5" />

            {/* Export */}
            <Button
              size="sm" variant="ghost"
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
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
      </div>

      {/* ── Keyword generation progress / summary panel ─────────────────── */}
      {kwGenProgress && (kwGenProgress.running || kwGenProgress.completedAt) && (
        <div className={`rounded-xl border px-4 py-3 text-xs space-y-2 ${kwGenProgress.running ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card"}`}>
          {kwGenProgress.running ? (
            <>
              <div className="flex items-center justify-between">
                <span className="font-medium text-emerald-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Sedang generate keywords...
                </span>
                <span className="text-muted-foreground tabular-nums">{kwGenProgress.generated}/{kwGenProgress.total} artikel</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                  style={{ width: kwGenProgress.total > 0 ? `${Math.round(kwGenProgress.generated / kwGenProgress.total * 100)}%` : "0%" }}
                />
              </div>
              <p className="text-muted-foreground">
                {Math.round(kwGenProgress.generated / kwGenProgress.total * 100)}% selesai
                {kwGenProgress.total > kwGenProgress.generated && ` — estimasi ${Math.max(1, Math.ceil((kwGenProgress.total - kwGenProgress.generated) * 0.2 / 60))} menit lagi`}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground flex items-center gap-1.5">
                  <span className="text-emerald-400">✓</span> Generate keywords selesai
                </span>
                <span className="text-muted-foreground tabular-nums">{kwGenProgress.generated}/{kwGenProgress.total} berhasil
                  {kwGenProgress.errors > 0 && `, ${kwGenProgress.errors} gagal`}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                <div className="h-full rounded-full bg-emerald-400" style={{ width: "100%" }} />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 text-muted-foreground">
                <span>Artikel dengan keyword:</span>
                <span className="font-medium text-foreground">{kwGenProgress.withKeywords} / {kwGenProgress.totalArticles} artikel</span>
                <span>Efek ke AINA:</span>
                <span className="font-medium text-emerald-400">Pencarian makin akurat ↑</span>
              </div>
              <p className="text-muted-foreground border-t border-border pt-2 leading-relaxed">
                Keyword yang di-generate membantu AINA mencocokkan pertanyaan user dengan artikel yang tepat, meskipun user memakai kata yang berbeda dari judul artikel.
                Makin banyak artikel berkeyword → makin sering AINA jawab dari KB sendiri tanpa perlu ke internet.
              </p>
            </>
          )}
        </div>
      )}

      {/* Auto-categorize bulk progress */}
      {autoCatProgress && (autoCatProgress.running || autoCatProgress.completedAt) && (
        <div className={`rounded-xl border px-4 py-3 text-xs space-y-2 ${autoCatProgress.running ? "border-violet-500/30 bg-violet-500/5" : "border-border bg-card"}`}>
          {autoCatProgress.running ? (
            <>
              <div className="flex items-center justify-between">
                <span className="font-medium text-violet-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
                  Sedang auto-kategorisasi...
                </span>
                <span className="text-muted-foreground tabular-nums">{autoCatProgress.processed}/{autoCatProgress.total} artikel</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-violet-400 transition-all duration-500"
                  style={{ width: autoCatProgress.total > 0 ? `${Math.round(autoCatProgress.processed / autoCatProgress.total * 100)}%` : "0%" }}
                />
              </div>
              <p className="text-muted-foreground">
                {autoCatProgress.total > 0 ? Math.round(autoCatProgress.processed / autoCatProgress.total * 100) : 0}% selesai
                {autoCatProgress.total > autoCatProgress.processed && ` — estimasi ${Math.max(1, Math.ceil((autoCatProgress.total - autoCatProgress.processed) * 0.35 / 60))} menit lagi`}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground flex items-center gap-1.5">
                  <span className="text-violet-400">✓</span> Auto-kategorisasi selesai
                </span>
                <span className="text-muted-foreground tabular-nums">{autoCatProgress.updated}/{autoCatProgress.total} diupdate
                  {autoCatProgress.errors > 0 && `, ${autoCatProgress.errors} gagal`}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                <div className="h-full rounded-full bg-violet-400" style={{ width: "100%" }} />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 text-muted-foreground">
                <span>Artikel diupdate:</span>
                <span className="font-medium text-foreground">{autoCatProgress.updated} / {autoCatProgress.total} artikel</span>
                <span>Efek ke filter:</span>
                <span className="font-medium text-violet-400">Filter kategori makin akurat ↑</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Static keyword coverage indicator (always shown when data available) */}
      {kwGenProgress && !kwGenProgress.running && !kwGenProgress.completedAt && kwGenProgress.totalArticles > 0 && (
        <div className="rounded-xl border border-border bg-card px-4 py-2.5 text-xs flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Coverage keyword KB</span>
          <div className="flex items-center gap-2 flex-1 max-w-[200px]">
            <div className="h-1.5 flex-1 rounded-full bg-border overflow-hidden">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.round(kwGenProgress.withKeywords / kwGenProgress.totalArticles * 100)}%` }} />
            </div>
            <span className="tabular-nums shrink-0 text-foreground font-medium">{kwGenProgress.withKeywords}/{kwGenProgress.totalArticles}</span>
          </div>
        </div>
      )}

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
            <div className="flex flex-wrap items-center gap-2">
              {/* Standard admin actions */}
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
                  size="sm" disabled={bulkLoading || bulkReformatLoading}
                  className="h-7 gap-1.5 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs"
                  variant="outline"
                  onClick={handleBulkDelete}
                >
                  <Trash2 className="h-3 w-3" /> Hapus {selected.size}
                </Button>
              )}

              {/* Master admin only actions */}
              {isMasterAdmin && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <Button
                    size="sm" disabled={bulkHideLoading || bulkLoading}
                    className="h-7 gap-1.5 bg-slate-500/10 border border-slate-500/30 text-slate-400 hover:bg-slate-500/20 text-xs"
                    variant="outline"
                    onClick={() => handleBulkHide(true)}
                    title="Sembunyikan artikel dari publik (tidak dihapus)"
                  >
                    {bulkHideLoading
                      ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" /> Menyembunyikan...</>
                      : <><EyeOff className="h-3 w-3" /> Sembunyikan {selected.size}</>
                    }
                  </Button>
                  <Button
                    size="sm" disabled={bulkHideLoading || bulkLoading}
                    className="h-7 gap-1.5 bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 text-xs"
                    variant="outline"
                    onClick={() => handleBulkHide(false)}
                    title="Tampilkan kembali artikel ke publik"
                  >
                    <Eye className="h-3 w-3" /> Tampilkan {selected.size}
                  </Button>
                  <Button
                    size="sm" disabled={selectionAutoCatLoading || bulkLoading}
                    className="h-7 gap-1.5 bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 text-xs"
                    variant="outline"
                    onClick={handleSelectionAutoCat}
                    title="Auto-kategorisasi AI untuk artikel yang dipilih"
                  >
                    {selectionAutoCatLoading
                      ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" /> Mengkategorisasi...</>
                      : <><Tags className="h-3 w-3" /> Auto-Kategori {selected.size}</>
                    }
                  </Button>
                  <Button
                    size="sm" disabled={selectionAutoTitleLoading || bulkLoading}
                    className="h-7 gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-xs"
                    variant="outline"
                    onClick={handleSelectionAutoTitle}
                    title="Auto-generate judul optimal AI untuk artikel yang dipilih"
                  >
                    {selectionAutoTitleLoading
                      ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" /> Menggenerate judul...</>
                      : <><Heading className="h-3 w-3" /> Auto-Judul {selected.size}</>
                    }
                  </Button>
                  <Button
                    size="sm" disabled={selectionEmbedLoading || embedProgress?.running || bulkLoading}
                    className="h-7 gap-1.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 text-xs"
                    variant="outline"
                    onClick={handleSelectionEmbed}
                    title="Generate RAG embedding untuk artikel yang dipilih"
                  >
                    {(selectionEmbedLoading || embedProgress?.running)
                      ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" /> {embedProgress?.running ? `${embedProgress.embedded}/${embedProgress.total}...` : "Memulai..."}</>
                      : <><Zap className="h-3 w-3" /> Gen RAG {selected.size}</>
                    }
                  </Button>
                </>
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
                        {art.keywords?.includes("dari-klarifikasi-user") && (
                          <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-400 flex items-center gap-1">
                            💬 Klarifikasi User
                          </span>
                        )}
                        {art.image_url && (
                          <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-400 flex items-center gap-1" title="Artikel ini punya poster — akan dikirim AINA saat menjawab">
                            <Image className="h-2.5 w-2.5" /> Poster
                          </span>
                        )}
                        {art.status === "approved" && (
                          art.has_embedding
                            ? (
                              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400 flex items-center gap-1" title="Artikel ini sudah ter-index dengan vector search (RAG semantik aktif)">
                                <Zap className="h-2.5 w-2.5" /> RAG ✓
                              </span>
                            ) : art.keywords
                            ? (
                              <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-400 flex items-center gap-1" title="Hanya keyword search — belum ada vector embedding. Generate RAG untuk pencarian semantik.">
                                <Search className="h-2.5 w-2.5" /> Keyword
                              </span>
                            ) : (
                              <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-400 flex items-center gap-1" title="Belum ter-index sama sekali — artikel mungkin tidak ditemukan AI. Generate keywords atau RAG.">
                                <AlertCircle className="h-2.5 w-2.5" /> No Index
                              </span>
                            )
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
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_LINK}>{art.content}</ReactMarkdown>
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
                    {isMasterAdmin && (
                      <Button
                        size="sm" variant="outline"
                        className="h-8 gap-1 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                        disabled={autoTitleingId === art.id}
                        onClick={() => handleAutoTitleOne(art)}
                        title="Auto-generate judul optimal dengan AI"
                      >
                        {autoTitleingId === art.id
                          ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                          : <Heading className="h-3.5 w-3.5" />
                        }
                      </Button>
                    )}
                    {isMasterAdmin && (
                      <Button
                        size="sm" variant="outline"
                        className="h-8 gap-1 border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
                        disabled={autoCatOneId === art.id}
                        onClick={() => handleAutoCatOne(art)}
                        title="Auto-kategorisasi dengan AI"
                      >
                        {autoCatOneId === art.id
                          ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
                          : <Tags className="h-3.5 w-3.5" />
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
        articleId={editArticle?.id}
        initial={editArticle ? {
          title: editArticle.title,
          content: editArticle.content,
          category: editArticle.category,
          article_type: editArticle.article_type ?? "narrative",
          keywords: editArticle.keywords ?? "",
          summary: editArticle.summary ?? "",
          important_notes: editArticle.important_notes ?? "",
          maps_url: editArticle.maps_url ?? "",
          contact_number: editArticle.contact_number ?? "",
          image_url: editArticle.image_url ?? "",
        } : undefined}
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

/* ─── Markdown components for chat viewer — mirrors real ChatArea styling ── */
// ── ARABIC_BLOCK renderer (mirrored from ChatArea) ──────────────────────────
function parseArabicBlockMonitor(raw: string) {
  const get = (label: string) => {
    const re = new RegExp(`${label}:\\s*([^\\n]+(?:\\n(?!Arabic Text:|Reading \\(Latin\\):|Meaning:)[^\\n]*)*)`, "i");
    const m = raw.match(re);
    if (!m) return "";
    return m[1].replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  };
  return { arabic: get("Arabic Text"), reading: get("Reading \\(Latin\\)"), meaning: get("Meaning") };
}

function ArabicBlockCardMonitor({ arabic, reading, meaning }: { arabic: string; reading: string; meaning: string }) {
  return (
    <div className="my-3 rounded-xl border border-primary/25 bg-primary/5 overflow-hidden">
      <div className="px-4 pt-3 pb-2.5 border-b border-primary/10">
        <p dir="rtl" className="text-left leading-loose text-foreground tracking-wide" style={{ fontFamily: "'Amiri', serif", fontSize: "20px", lineHeight: "2.0" }}>
          {arabic}
        </p>
      </div>
      <div className="px-4 py-2.5 space-y-1.5" dir="ltr">
        {reading && <p className="text-sm flex items-start gap-1.5 text-left"><span className="mt-px shrink-0">🔊</span><span dir="ltr" className="break-words text-sky-400 italic">{reading}</span></p>}
        {meaning && <p className="text-sm flex items-start gap-1.5 text-left"><span className="mt-px shrink-0 text-primary/70">✦</span><span dir="ltr" className="break-words text-white italic">{meaning}</span></p>}
      </div>
    </div>
  );
}

const MONITOR_ARABIC_RE = /\[ARABIC_BLOCK\]([\s\S]*?)\[\/ARABIC_BLOCK\]/g;

function renderMonitorContent(content: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  MONITOR_ARABIC_RE.lastIndex = 0;
  while ((match = MONITOR_ARABIC_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const prose = content.slice(lastIndex, match.index).trim();
      if (prose) {
        parts.push(
          <ReactMarkdown key={key++} remarkPlugins={[remarkGfm]} components={MONITOR_MD}>
            {prose}
          </ReactMarkdown>
        );
      }
    }
    const data = parseArabicBlockMonitor(match[1]);
    if (data.arabic || data.meaning) {
      parts.push(<ArabicBlockCardMonitor key={key++} {...data} />);
    }
    lastIndex = match.index + match[0].length;
  }
  const tail = content.slice(lastIndex).trim();
  if (tail) {
    parts.push(
      <ReactMarkdown key={key++} remarkPlugins={[remarkGfm]} components={MONITOR_MD}>
        {tail}
      </ReactMarkdown>
    );
  }
  if (parts.length === 0) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MONITOR_MD}>
        {content}
      </ReactMarkdown>
    );
  }
  return <>{parts}</>;
}

const MONITOR_MD = {
  br: () => <br />,
  a: ({ href, children }: any) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors break-all">{children}</a>,
  p: ({ children }: any) => <p className="mb-3 last:mb-0 break-words leading-[1.7] text-[15px]">{children}</p>,
  strong: ({ children }: any) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }: any) => <em className="italic text-muted-foreground/80">{children}</em>,
  ul: ({ children }: any) => <ul className="mb-3 ml-5 list-disc space-y-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="mb-3 ml-5 list-decimal space-y-1">{children}</ol>,
  li: ({ children }: any) => <li className="text-[15px] leading-[1.7] break-words">{children}</li>,
  h1: ({ children }: any) => <h1 className="mb-2 mt-4 text-lg font-bold text-foreground first:mt-0">{children}</h1>,
  h2: ({ children }: any) => <h2 className="mb-1.5 mt-3.5 text-base font-bold text-foreground first:mt-0">{children}</h2>,
  h3: ({ children }: any) => <h3 className="mb-1 mt-3 text-sm font-semibold text-foreground first:mt-0">{children}</h3>,
  code: ({ children, className }: any) => {
    if (className?.includes("language-")) return <code className={className}>{children}</code>;
    return <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[13px] text-foreground break-all">{children}</code>;
  },
  pre: ({ children }: any) => (
    <div className="mb-3 overflow-x-auto rounded-xl bg-muted/60">
      <pre className="p-3.5 font-mono text-[13px] text-foreground">{children}</pre>
    </div>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="mb-3 border-l-2 border-primary/40 pl-4 text-muted-foreground leading-[1.7]">{children}</blockquote>
  ),
  hr: () => <hr className="my-4 border-border/50" />,
  table: ({ children }: any) => <div className="mb-3 overflow-x-auto rounded-xl border border-border"><table className="w-full text-[14px]">{children}</table></div>,
  thead: ({ children }: any) => <thead className="bg-muted/40">{children}</thead>,
  th: ({ children }: any) => <th className="px-3 py-2 text-left font-semibold text-foreground">{children}</th>,
  td: ({ children }: any) => <td className="border-t border-border/50 px-3 py-2 text-foreground/90">{children}</td>,
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

  /* Fix It state */
  const [fixPanel, setFixPanel] = useState<{
    msgId: string; chatId: string;
    userQuestion: string; wrongAnswer: string;
  } | null>(null);
  const [fixCorrect, setFixCorrect] = useState("");
  const [fixTitle, setFixTitle] = useState("");
  const [fixLoading, setFixLoading] = useState(false);

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

  /* Fix It helpers */
  const openFixPanel = (msgId: string, idx: number) => {
    if (!selected) return;
    // Find the user question immediately before this AI message
    const prevUser = [...messages].slice(0, idx).reverse().find(m => m.role === "user");
    const wrongAnswer = messages[idx]?.content ?? "";
    setFixPanel({
      msgId,
      chatId: selected.id,
      userQuestion: prevUser?.content ?? "",
      wrongAnswer,
    });
    setFixCorrect("");
    setFixTitle(`Koreksi: ${(prevUser?.content ?? "").slice(0, 60).trim()}`);
  };

  const submitFix = async (autoFix: boolean) => {
    if (!fixPanel) return;
    setFixLoading(true);
    try {
      const result = await adminFetch(
        `/api/admin/chats/${fixPanel.chatId}/messages/${fixPanel.msgId}/fix`,
        {
          method: "POST",
          body: JSON.stringify({
            user_question: fixPanel.userQuestion,
            wrong_answer: fixPanel.wrongAnswer,
            correct_answer: fixCorrect.trim() || undefined,
            auto_fix: autoFix,
            article_title: fixTitle.trim() || undefined,
          }),
        }
      );
      if (autoFix && result.corrected_answer) {
        setFixCorrect(result.corrected_answer);
        toast.success("AI menghasilkan jawaban koreksi — periksa dan simpan jika sudah benar");
      } else {
        toast.success("Koreksi berhasil disimpan ke knowledge base AINA");
        setFixPanel(null);
        setFixCorrect("");
      }
    } catch (e: any) { toast.error(e.message); }
    setFixLoading(false);
  };

  const allSelected = chats.length > 0 && selectedIds.size === chats.length;
  const someSelected = selectedIds.size > 0;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Log Sesi</h2>
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

      {/* Conversation Viewer Dialog — mirrors exact ChatArea user view */}
      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl gap-0 p-0 overflow-hidden max-h-[92vh] flex flex-col">
          {selected && (
            <>
              {/* Header — matches ChatArea top bar style */}
              <div className="flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 shrink-0 backdrop-blur">
                <AvatarDisplay name={selected.profile?.full_name ?? null} avatarUrl={selected.profile?.avatar_url ?? null} size={8} />
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-sm font-semibold text-foreground truncate">
                    {selected.profile?.full_name ?? selected.profile?.email ?? "Pengguna"}
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground truncate">{selected.title}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{fmtDate(selected.updated_at)}</span>
                  <button
                    onClick={() => {
                      if (window.confirm(`Hapus chat "${selected.title}"? Semua pesan akan ikut terhapus permanen.`)) {
                        deleteChat(selected.id);
                      }
                    }}
                    disabled={deletingId === selected.id}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40"
                    title="Hapus chat ini"
                  >
                    {deletingId === selected.id
                      ? <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Messages — exact same layout as ChatArea */}
              <div className="flex-1 overflow-y-auto">
                {msgLoading ? (
                  <div className="flex justify-center py-16">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center py-16 text-center">
                    <MessageSquare className="mb-3 h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Tidak ada pesan.</p>
                  </div>
                ) : (
                  <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 md:px-8">
                    {messages.map((m, msgIdx) => (
                      <div
                        key={m.id}
                        className={`flex gap-3 min-w-0 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        {/* AINA logo — same as real chat */}
                        {m.role === "assistant" && (
                          <img src="/aina-icon.png" alt="AINA" className="mt-1 h-7 w-7 shrink-0 object-contain" />
                        )}

                        {m.role === "user" ? (
                          /* User bubble — exact copy from ChatArea */
                          <div className="max-w-[85%] space-y-2">
                            <div
                              className="rounded-3xl bg-secondary px-5 py-3.5 text-base text-foreground whitespace-pre-wrap break-words"
                              dir="auto"
                            >
                              {m.content}
                            </div>
                            <p className="text-right text-[10px] text-muted-foreground/50 pr-1">
                              {new Date(m.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : (
                          /* AI response — exact copy from ChatArea + Fix It button */
                          <div className="min-w-0 flex-1 min-h-0 group">
                            <div className="py-1.5 text-[15px] leading-[1.7]">
                              {renderMonitorContent(m.content)}
                            </div>
                            <div className="mt-1.5 flex items-center gap-3">
                              <p className="text-[10px] text-muted-foreground/40">
                                {new Date(m.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                              </p>
                              <button
                                onClick={() => openFixPanel(m.id, msgIdx)}
                                className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 opacity-0 group-hover:opacity-100 transition-all hover:bg-amber-500/20"
                              >
                                <Wand2 className="h-2.5 w-2.5" />
                                Fix It
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Fake input bar — read-only, just for visual mirroring */}
              <div className="shrink-0 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground/40 cursor-default select-none">
                  <MessageSquare className="h-4 w-4 shrink-0" />
                  <span>Kirim pesan…</span>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Fix It Dialog */}
      <Dialog open={!!fixPanel} onOpenChange={open => !open && setFixPanel(null)}>
        <DialogContent className="max-w-2xl gap-0 p-0 overflow-hidden max-h-[90vh] flex flex-col">
          {fixPanel && (
            <>
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-border px-5 py-4 shrink-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15">
                  <Wand2 className="h-4 w-4 text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-sm font-semibold text-foreground">Fix It — Koreksi Jawaban AINA</DialogTitle>
                  <p className="text-xs text-muted-foreground">Perbaiki jawaban yang salah & simpan ke knowledge base</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {/* Context: user question */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pertanyaan User</label>
                  <div className="rounded-xl bg-secondary/60 px-4 py-3 text-sm text-foreground leading-relaxed max-h-24 overflow-y-auto">
                    {fixPanel.userQuestion || <span className="italic text-muted-foreground">Tidak ditemukan (pesan sistem/pertama)</span>}
                  </div>
                </div>

                {/* Context: wrong answer */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
                    Jawaban AINA yang Perlu Diperbaiki
                  </label>
                  <div className="rounded-xl border border-red-200/40 bg-red-50/5 px-4 py-3 text-sm text-foreground/80 leading-relaxed max-h-40 overflow-y-auto font-mono text-xs">
                    {fixPanel.wrongAnswer.slice(0, 600)}{fixPanel.wrongAnswer.length > 600 ? "…" : ""}
                  </div>
                </div>

                {/* Correct answer input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
                    Jawaban yang Benar
                  </label>
                  <Textarea
                    value={fixCorrect}
                    onChange={e => setFixCorrect(e.target.value)}
                    placeholder="Tulis jawaban yang benar di sini, atau kosongkan dan klik 'Biarkan AI Perbaiki' untuk auto-fix..."
                    rows={7}
                    className="resize-none text-sm font-mono bg-secondary/50 leading-relaxed"
                  />
                  <p className="text-[11px] text-muted-foreground/60">
                    Boleh tulis petunjuk singkat (AI akan kembangkan), atau langsung tulis jawaban lengkap.
                    Disimpan ke knowledge base sebagai artikel "Koreksi AI" — langsung aktif untuk query serupa.
                  </p>
                </div>

                {/* Article title */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Judul Artikel KB</label>
                  <input
                    value={fixTitle}
                    onChange={e => setFixTitle(e.target.value)}
                    className="w-full rounded-xl border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                    placeholder="Judul untuk artikel knowledge base..."
                  />
                </div>
              </div>

              {/* Footer actions */}
              <div className="shrink-0 border-t border-border px-5 py-3.5 flex items-center justify-between gap-3 bg-card/50">
                <button
                  onClick={() => setFixPanel(null)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Batal
                </button>
                <div className="flex items-center gap-2">
                  {/* Auto-fix button */}
                  <button
                    onClick={() => submitFix(true)}
                    disabled={fixLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                  >
                    {fixLoading
                      ? <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                      : <Sparkles className="h-3 w-3" />}
                    Biarkan AI Perbaiki
                  </button>
                  {/* Save button */}
                  <button
                    onClick={() => submitFix(false)}
                    disabled={fixLoading || !fixCorrect.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
                  >
                    {fixLoading
                      ? <span className="h-3 w-3 animate-spin rounded-full border border-white/50 border-t-white" />
                      : <Save className="h-3 w-3" />}
                    Simpan ke KB
                  </button>
                </div>
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

const PERF_AUTO_REFRESH_MS = 60_000; // 60 detik
const PERF_STALE_MS        = 120_000; // data dianggap basi setelah 2 menit

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
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [now, setNow]           = useState(() => Date.now());
  const autoTimerRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockRef                = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (v: PerfView, silent = false) => {
    if (!silent) setLoading(true);
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
      setLastUpdated(new Date());
    } catch (e: any) { if (!silent) toast.error(e.message); }
    if (!silent) setLoading(false);
  }, []);

  // Fetch when view changes
  useEffect(() => { load(view); }, [view, load]);

  // Auto-refresh every 60s (silent — no spinner)
  useEffect(() => {
    autoTimerRef.current = setInterval(() => { load(view, true); }, PERF_AUTO_REFRESH_MS);
    return () => { if (autoTimerRef.current) clearInterval(autoTimerRef.current); };
  }, [view, load]);

  // Clock tick every 10s to update the "X detik lalu" label
  useEffect(() => {
    clockRef.current = setInterval(() => setNow(Date.now()), 10_000);
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, []);

  const isStale = lastUpdated ? (now - lastUpdated.getTime()) > PERF_STALE_MS : false;

  const relativeTime = (date: Date) => {
    const secs = Math.floor((now - date.getTime()) / 1000);
    if (secs < 10)  return "baru saja";
    if (secs < 60)  return `${secs} detik lalu`;
    const mins = Math.floor(secs / 60);
    if (mins < 60)  return `${mins} menit lalu`;
    return `${Math.floor(mins / 60)} jam lalu`;
  };

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">Performa AINA</h2>
          <p className="text-sm text-muted-foreground">Intelijen agregat sistem — semua data anonim, tidak ada data pribadi user</p>
          <div className="mt-1 flex items-center gap-2">
            {lastUpdated ? (
              <>
                <span className={`text-[11px] ${isStale ? "text-amber-500" : "text-muted-foreground/60"}`}>
                  {isStale ? "⚠ Data mungkin basi — " : ""}Diperbarui {relativeTime(lastUpdated)}
                </span>
                <span className="text-[10px] text-muted-foreground/30">· auto-refresh tiap 60 dtk</span>
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground/50">Memuat data pertama kali…</span>
            )}
          </div>
        </div>
        <button
          onClick={() => load(view)}
          disabled={loading}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Memuat…" : "Refresh"}
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
                    <p className="text-xs text-muted-foreground">Belum ada data — akan muncul setelah ada percakapan.</p>
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
            <p className="py-12 text-center text-sm text-muted-foreground">Gagal memuat data performa. Coba refresh halaman ini.</p>
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
                empty="Belum ada data retrieval. Data akan muncul setelah ada percakapan dengan AINA."
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
                empty="Belum ada pola FAQ. Data akan muncul setelah ada percakapan dengan AINA."
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
  show_once_per_user: boolean;
  trigger_type: string;
  delay_seconds: number;
  selected_user_ids?: string[] | null;
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

  const blank = { title: "", message: "", type: "announcement", target_audience: "all_users", is_active: true, button_text: "", button_link: "", dismissible: true, start_at: "", end_at: "", show_once_per_user: false, trigger_type: "on_dashboard_open", delay_seconds: 5, selected_user_ids: "" };
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
      show_once_per_user: a.show_once_per_user ?? false,
      trigger_type: a.trigger_type ?? "on_dashboard_open",
      delay_seconds: a.delay_seconds ?? 5,
      selected_user_ids: Array.isArray(a.selected_user_ids) ? a.selected_user_ids.join("\n") : "",
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
        delay_seconds: Number(form.delay_seconds) || 5,
        selected_user_ids: form.target_audience === "selected_users" ? form.selected_user_ids : null,
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

  const audienceLabel: Record<string, string> = { all_users: "Semua", new_users: "User Baru", old_users: "User Lama", contributors: "Kontributor", non_contributors: "Non-Kontributor", selected_users: "User Pilihan", admins: "Admin" };
  const triggerLabel: Record<string, string> = { on_dashboard_open: "Buka Dashboard", after_first_chat: "Setelah Chat Pertama" };
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
              <p className="text-xs text-muted-foreground">Target Audiens</p>
              <Select value={form.target_audience} onValueChange={v => setForm(p => ({ ...p, target_audience: v }))}>
                <SelectTrigger className="bg-secondary h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_users">Semua Pengguna</SelectItem>
                  <SelectItem value="new_users">User Baru (≤7 hari)</SelectItem>
                  <SelectItem value="old_users">User Lama (&gt;7 hari)</SelectItem>
                  <SelectItem value="contributors">Kontributor</SelectItem>
                  <SelectItem value="non_contributors">Non-Kontributor</SelectItem>
                  <SelectItem value="admins">Admin Saja</SelectItem>
                  <SelectItem value="selected_users">User Pilihan (manual)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Selected user IDs — shown only when target_audience = selected_users */}
          {form.target_audience === "selected_users" && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">User ID yang ditarget <span className="text-muted-foreground/60">(satu per baris atau pisahkan koma)</span></p>
              <Textarea
                value={form.selected_user_ids}
                onChange={e => setForm(p => ({ ...p, selected_user_ids: e.target.value }))}
                placeholder={"uuid-user-1\nuuid-user-2\nuuid-user-3"}
                rows={4}
                className="bg-secondary resize-none text-xs font-mono"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Trigger</p>
              <Select value={form.trigger_type} onValueChange={v => setForm(p => ({ ...p, trigger_type: v }))}>
                <SelectTrigger className="bg-secondary h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="on_dashboard_open">Saat Buka Dashboard</SelectItem>
                  <SelectItem value="after_first_chat">Setelah Chat Pertama</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Delay (detik)</p>
              <input
                type="number" min={0} max={60}
                value={form.delay_seconds}
                onChange={e => setForm(p => ({ ...p, delay_seconds: parseInt(e.target.value) || 0 }))}
                className="flex h-8 w-full rounded-md border border-input bg-secondary px-3 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
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

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="rounded" />
              <span className="text-xs text-foreground">Aktif</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.dismissible} onChange={e => setForm(p => ({ ...p, dismissible: e.target.checked }))} className="rounded" />
              <span className="text-xs text-foreground">Bisa ditutup</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.show_once_per_user} onChange={e => setForm(p => ({ ...p, show_once_per_user: e.target.checked }))} className="rounded" />
              <span className="text-xs text-foreground">Tampil sekali per user</span>
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
                    <span className="rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{triggerLabel[a.trigger_type ?? "on_dashboard_open"] ?? a.trigger_type}</span>
                    {a.show_once_per_user && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-500">1× per user</span>}
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
  const todayLocal = () => new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ title: "", content: "", category: "kehidupan_mesir", image_url: "", source_url: "", source_name: "", is_pinned: false, is_active: true, published_at: todayLocal() });
  const [saving, setSaving] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const [aiPolishing, setAiPolishing] = useState(false);
  const [contentTab, setContentTab] = useState<"edit" | "preview">("edit");
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const newsImgInputRef = useRef<HTMLInputElement>(null);

  const uploadNewsImage = async (file: File) => {
    setImgUploading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/upload-image", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Gagal upload gambar"); return; }
      setForm(f => ({ ...f, image_url: json.publicUrl }));
      toast.success("Foto berhasil diupload");
    } catch {
      toast.error("Upload gagal. Coba lagi.");
    } finally {
      setImgUploading(false);
    }
  };

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? "";
      const res = await fetch("/api/admin/news", { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      setNews(d.news ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }

  function openCreate() {
    setEditing(null);
    setForm({ title: "", content: "", category: "kehidupan_mesir", image_url: "", source_url: "", source_name: "", is_pinned: false, is_active: true, published_at: todayLocal() });
    setContentTab("edit");
    setShowForm(true);
  }

  function openEdit(item: NewsItem) {
    setEditing(item);
    setForm({
      title: item.title,
      content: item.content,
      category: item.category,
      image_url: item.image_url ?? "",
      source_url: item.source_url ?? "",
      source_name: item.source_name ?? "",
      is_pinned: item.is_pinned,
      is_active: item.is_active,
      published_at: item.published_at ? item.published_at.slice(0, 10) : todayLocal(),
    });
    setContentTab("edit");
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) return toast.error("Judul dan konten wajib diisi");
    setSaving(true);
    try {
      const token = await getToken();
      const url = editing ? `/api/admin/news/${editing.id}` : "/api/admin/news";
      const method = editing ? "PUT" : "POST";
      // Convert YYYY-MM-DD to full ISO timestamp
      const publishedAtISO = form.published_at
        ? new Date(form.published_at + "T12:00:00").toISOString()
        : new Date().toISOString();
      const payload = { ...form, published_at: publishedAtISO };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Gagal menyimpan berita"); }
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

  async function toggleActive(item: NewsItem) {
    const token = await getToken();
    await fetch(`/api/admin/news/${item.id}`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ is_active: !item.is_active }) });
    fetchNews();
  }

  async function handleAiPolish() {
    if (!form.content.trim()) return toast.error("Tulis konten dulu sebelum diperbaiki AI");
    setAiPolishing(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/news/ai-polish", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: form.title, content: form.content, category: form.category }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "AI gagal memproses"); return; }
      setForm(f => ({ ...f, content: data.content }));
      setContentTab("preview");
      toast.success("Konten berhasil diperbaiki AI!");
    } catch { toast.error("Gagal terhubung ke AI"); } finally { setAiPolishing(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">Berita Masisir</h2>
          <p className="text-xs text-muted-foreground">{news.filter(n => n.is_active).length} aktif · {news.filter(n => !n.is_active).length} nonaktif</p>
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
      <Dialog open={showForm} onOpenChange={open => { if (!open && !cropFile) setShowForm(false); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <div className="relative">
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
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-muted-foreground">Konten * <span className="text-muted-foreground/60">(Markdown didukung)</span></label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setContentTab("edit")}
                    className={`px-2 py-0.5 text-[11px] rounded-md transition-colors ${contentTab === "edit" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >Edit</button>
                  <button
                    type="button"
                    onClick={() => setContentTab("preview")}
                    className={`px-2 py-0.5 text-[11px] rounded-md transition-colors ${contentTab === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >Preview</button>
                </div>
              </div>
              {contentTab === "edit" ? (
                <Textarea
                  placeholder="Isi berita... (Markdown: **bold**, ## heading, - bullet)"
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  rows={8}
                  className="font-mono text-xs"
                />
              ) : (
                <div className="min-h-[10rem] rounded-md border border-border bg-muted/20 px-3 py-2 text-sm prose prose-sm prose-invert max-w-none overflow-y-auto">
                  {form.content.trim() ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_LINK}>{form.content}</ReactMarkdown>
                  ) : (
                    <span className="text-muted-foreground text-xs">Belum ada konten...</span>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={handleAiPolish}
                disabled={aiPolishing || !form.content.trim()}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {aiPolishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {aiPolishing ? "AI sedang memproses..." : "Perbaiki dengan AI"}
              </button>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Foto Berita (opsional)</label>
              <input
                ref={newsImgInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.target.value = ""; }}
              />
              {form.image_url ? (
                <div className="relative rounded-xl overflow-hidden border border-border">
                  <img src={form.image_url} alt="Preview" className="w-full h-36 object-cover" />
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => newsImgInputRef.current?.click()}
                      disabled={imgUploading}
                      className="rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-black/80 transition-colors"
                    >
                      {imgUploading ? "Mengupload..." : "Ganti Foto"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, image_url: "" }))}
                      className="rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-600/80 transition-colors"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => newsImgInputRef.current?.click()}
                  disabled={imgUploading}
                  className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 py-6 text-center hover:bg-muted/50 transition-colors disabled:opacity-60"
                >
                  {imgUploading ? (
                    <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    <Image className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {imgUploading ? "Mengupload foto..." : "Klik untuk upload foto (JPG, PNG, WebP)"}
                  </span>
                </button>
              )}
              {/* Fallback URL manual jika perlu */}
              {!form.image_url && (
                <Input
                  placeholder="atau tempel URL gambar langsung..."
                  value={form.image_url}
                  onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                  className="mt-2 text-xs"
                />
              )}
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
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tanggal Publish</label>
              <Input
                type="date"
                value={form.published_at}
                onChange={e => setForm(f => ({ ...f, published_at: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_pinned} onChange={e => setForm(f => ({ ...f, is_pinned: e.target.checked }))} className="rounded" />
                <span className="text-sm">Pinned (tampil di atas)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded" />
                <span className="text-sm">Aktif (tampil ke publik)</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Batal</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Menyimpan..." : (editing ? "Simpan Perubahan" : "Tambah")}</Button>
            </div>
          </div>

          {/* Crop overlay — inside relative wrapper so absolute inset-0 works */}
          {cropFile && (
            <NewsImageCropper
              file={cropFile}
              onDone={croppedFile => { setCropFile(null); uploadNewsImage(croppedFile); }}
              onCancel={() => setCropFile(null)}
            />
          )}
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
              <div key={item.id} className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${isSel ? "border-primary/40 bg-primary/5" : !item.is_active ? "border-border/40 bg-muted/20 opacity-60" : item.is_pinned ? "border-primary/20 bg-primary/5" : "border-border bg-card"}`}>
                <input type="checkbox" checked={isSel} onChange={() => toggleSelect(item.id)} className="mt-1 shrink-0 rounded cursor-pointer accent-primary" />
                <div className={`mt-0.5 shrink-0 ${cat?.color ?? "text-muted-foreground"}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground truncate">{item.title}</span>
                    {item.is_pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                    {!item.is_active && <span className="text-[10px] font-medium rounded-full px-1.5 py-0.5 bg-muted text-muted-foreground">Nonaktif</span>}
                    <span className="text-[10px] text-muted-foreground">{getCatLabel(item.category)}</span>
                    {item.image_url && <Image className="h-3 w-3 text-muted-foreground shrink-0" />}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                    {new Date(item.published_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-2">{item.content}</p>
                </div>
                {item.image_url && (
                  <div className="shrink-0 w-12 h-10 rounded-lg overflow-hidden border border-border">
                    <img src={item.image_url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }} />
                  </div>
                )}
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => togglePin(item)} title={item.is_pinned ? "Unpin" : "Pin"} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    <Pin className={`h-3.5 w-3.5 ${item.is_pinned ? "text-primary fill-primary" : ""}`} />
                  </button>
                  <button onClick={() => toggleActive(item)} title={item.is_active ? "Nonaktifkan" : "Aktifkan"} className={`rounded-lg p-1.5 transition-colors ${item.is_active ? "hover:bg-muted text-muted-foreground hover:text-foreground" : "text-primary hover:bg-primary/10"}`}>
                    {item.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
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

/* ─── Insights Tab (Self-Improvement Dashboard) ─────── */
type InsightsData = {
  top_queries: Array<{ sample_query: string; count: number; intent_type: string | null; source_used: string | null; last_seen: string }>;
  bad_responses: Array<{ query_text: string; intent_type: string | null; source_used: string | null; confidence: string | null; created_at: string }>;
  missing_topics: Array<{ sample_query: string; count: number; intent_type: string | null; last_seen: string }>;
  weekly_summary: {
    total_queries: number; bad_responses: number; kb_hits: number; transport_queries: number;
    source_kb: number; source_perplexity: number; source_wiki: number; source_model: number;
    conf_high: number; conf_medium: number; conf_low: number;
  };
  daily_trend: Array<{ day: string; count: number }>;
  intent_breakdown: Array<{ intent: string; count: number }>;
  generated_at: string;
};

function InsightsTab() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<"summary" | "top" | "bad" | "missing">("summary");

  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch("/api/admin/insights");
        setData(res);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (error) return <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error}</div>;
  if (!data) return null;

  const { weekly_summary: ws } = data;
  const kbRate  = ws.total_queries > 0 ? Math.round((ws.kb_hits / ws.total_queries) * 100) : 0;
  const badRate = ws.total_queries > 0 ? Math.round((ws.bad_responses / ws.total_queries) * 100) : 0;

  const sectionTabs: Array<{ id: typeof section; label: string }> = [
    { id: "summary", label: "Ringkasan 7 Hari" },
    { id: "top",     label: `Top Queries (${data.top_queries.length})` },
    { id: "bad",     label: `Respons Buruk (${data.bad_responses.length})` },
    { id: "missing", label: `KB Gaps (${data.missing_topics.length})` },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-bold text-foreground">Self-Improvement Insights</h2>
        <p className="text-sm text-muted-foreground">
          Analisis pola pertanyaan user untuk meningkatkan AINA secara otomatis.
          Data diperbarui real-time setiap kali user chat.
        </p>
        <p className="text-[10px] text-muted-foreground/60">
          Generated: {new Date(data.generated_at).toLocaleString("id-ID")}
        </p>
      </div>

      {/* Section tabs */}
      <div className="flex flex-wrap gap-2">
        {sectionTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSection(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              section === t.id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Summary ── */}
      {section === "summary" && (
        <div className="space-y-4">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total Query (7hr)",    value: ws.total_queries ?? 0,    color: "text-foreground" },
              { label: "KB Hit Rate",           value: `${kbRate}%`,             color: kbRate >= 60 ? "text-green-500" : kbRate >= 30 ? "text-amber-500" : "text-destructive" },
              { label: "Respons Buruk",         value: ws.bad_responses ?? 0,    color: ws.bad_responses > 0 ? "text-destructive" : "text-green-500" },
              { label: "Tingkat Keluhan",       value: `${badRate}%`,            color: badRate > 10 ? "text-destructive" : badRate > 5 ? "text-amber-500" : "text-green-500" },
            ].map(card => (
              <div key={card.label} className="rounded-xl border border-border bg-card p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{card.label}</p>
                <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* Source breakdown */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Sumber Jawaban (7 hari)</p>
            <div className="space-y-2">
              {[
                { label: "Knowledge Base",   count: ws.source_kb,          color: "bg-green-500" },
                { label: "Model AI",         count: ws.source_model,        color: "bg-blue-500" },
                { label: "Wikipedia",        count: ws.source_wiki,         color: "bg-purple-500" },
                { label: "Perplexity",       count: ws.source_perplexity,   color: "bg-amber-500" },
              ].map(s => {
                const pct = ws.total_queries > 0 ? Math.round((s.count / ws.total_queries) * 100) : 0;
                return (
                  <div key={s.label} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-28 shrink-0">{s.label}</span>
                    <div className="flex-1 bg-secondary rounded-full h-2">
                      <div className={`h-2 rounded-full ${s.color}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-medium text-foreground w-10 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Confidence + Intent */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Tingkat Kepercayaan</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-green-500">High</span><span className="font-medium">{ws.conf_high ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-amber-500">Medium</span><span className="font-medium">{ws.conf_medium ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-destructive">Needs Verification</span><span className="font-medium">{ws.conf_low ?? 0}</span></div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Intent Breakdown</p>
              <div className="space-y-1 text-xs">
                {data.intent_breakdown.slice(0, 6).map(ib => (
                  <div key={ib.intent} className="flex justify-between">
                    <span className="text-muted-foreground capitalize">{ib.intent}</span>
                    <span className="font-medium">{ib.count}</span>
                  </div>
                ))}
                {data.intent_breakdown.length === 0 && <p className="text-muted-foreground">Belum ada data</p>}
              </div>
            </div>
          </div>

          {/* Daily trend */}
          {data.daily_trend.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Tren Query Harian (14 hari)</p>
              <div className="flex items-end gap-1 h-16">
                {data.daily_trend.map(d => {
                  const max = Math.max(...data.daily_trend.map(x => x.count), 1);
                  const pct = Math.round((d.count / max) * 100);
                  return (
                    <div key={d.day} className="flex flex-col items-center flex-1 gap-1" title={`${d.day}: ${d.count} queries`}>
                      <div className="w-full bg-primary/80 rounded-t" style={{ height: `${Math.max(pct, 4)}%` }} />
                      <span className="text-[8px] text-muted-foreground/60 rotate-45 origin-left hidden sm:block">
                        {new Date(d.day).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Top Queries ── */}
      {section === "top" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Top 20 pertanyaan paling sering ditanya user (30 hari terakhir).</p>
          {data.top_queries.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Belum ada query tercatat. Data akan muncul setelah user mulai chat.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Query</th>
                    <th className="px-4 py-3 font-medium">Freq</th>
                    <th className="px-4 py-3 font-medium">Intent</th>
                    <th className="px-4 py-3 font-medium">Sumber</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_queries.map((q, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2.5 text-foreground font-medium max-w-xs"><span className="line-clamp-2">{q.sample_query}</span></td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${q.count >= 10 ? "bg-destructive/20 text-destructive" : q.count >= 5 ? "bg-amber-500/20 text-amber-500" : "bg-secondary text-muted-foreground"}`}>
                          {q.count}×
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground capitalize">{q.intent_type ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{q.source_used ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Bad Responses ── */}
      {section === "bad" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Query yang mendapat thumbs-down dari user — tinjau dan perbaiki KB atau model untuk topik ini.</p>
          {data.bad_responses.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Tidak ada respons buruk tercatat. Bagus!
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Query (mendapat 👎)</th>
                    <th className="px-4 py-3 font-medium">Intent</th>
                    <th className="px-4 py-3 font-medium">Sumber</th>
                    <th className="px-4 py-3 font-medium">Konfidensi</th>
                    <th className="px-4 py-3 font-medium">Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bad_responses.map((b, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2.5 text-foreground font-medium max-w-xs"><span className="line-clamp-2">{b.query_text}</span></td>
                      <td className="px-4 py-2.5 text-muted-foreground capitalize">{b.intent_type ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{b.source_used ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${b.confidence === "high" ? "bg-green-500/20 text-green-500" : b.confidence === "medium" ? "bg-amber-500/20 text-amber-500" : "bg-destructive/20 text-destructive"}`}>
                          {b.confidence ?? "?"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {new Date(b.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Missing KB Topics ── */}
      {section === "missing" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Pertanyaan user yang tidak menemukan jawaban di Knowledge Base (30 hari terakhir). Tambah artikel KB untuk topik ini.</p>
          {data.missing_topics.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Tidak ada KB gap tercatat. KB sudah cukup lengkap!
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Topik yang Tidak Ada di KB</th>
                    <th className="px-4 py-3 font-medium">Frekuensi</th>
                    <th className="px-4 py-3 font-medium">Intent</th>
                    <th className="px-4 py-3 font-medium">Terakhir Ditanya</th>
                  </tr>
                </thead>
                <tbody>
                  {data.missing_topics.map((t, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2.5 text-foreground font-medium max-w-xs"><span className="line-clamp-2">{t.sample_query}</span></td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${t.count >= 5 ? "bg-destructive/20 text-destructive" : t.count >= 3 ? "bg-amber-500/20 text-amber-500" : "bg-secondary text-muted-foreground"}`}>
                          {t.count}×
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground capitalize">{t.intent_type ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {new Date(t.last_seen).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">💡 Merah ≥5× = prioritas tinggi. Buat artikel KB baru dari tab Knowledge Base.</p>
        </div>
      )}
    </div>
  );
}

/* ─── Coverage Tab (KB Gap Analysis) ────────────────── */
function CoverageTab() {
  const [data, setData] = useState<{ total: number; topics: Array<{ query: string; count: number; intent_type: string | null; created_at: string }> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch("/api/admin/missing-topics?limit=200");
        setData(res);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (error) return <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error}</div>;

  const topics = data?.topics ?? [];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h2 className="font-display text-xl font-bold text-foreground">KB Coverage Gaps</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Pertanyaan user yang tidak menemukan artikel KB — {data?.total ?? 0} total query tercatat.
          Gunakan ini untuk menentukan artikel apa yang perlu ditambahkan ke Knowledge Base.
        </p>
      </div>

      {topics.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Belum ada missing topic tercatat. KB sudah cukup lengkap, atau fitur baru saja diaktifkan.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Query yang Tidak Terjawab KB</th>
                <th className="px-4 py-3 font-medium">Frekuensi</th>
                <th className="px-4 py-3 font-medium">Intent</th>
                <th className="px-4 py-3 font-medium">Terakhir Ditanya</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((t, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-2.5 text-foreground font-medium max-w-xs">
                    <span className="line-clamp-2">{t.query}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      t.count >= 5 ? "bg-destructive/20 text-destructive" :
                      t.count >= 3 ? "bg-amber-500/20 text-amber-500" :
                      "bg-secondary text-muted-foreground"
                    }`}>
                      {t.count}×
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground capitalize">{t.intent_type ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                    {new Date(t.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        💡 Query dengan frekuensi tinggi (merah) adalah prioritas tertinggi untuk ditambahkan ke KB.
        Buat artikel baru di tab Knowledge Base menggunakan topik-topik di atas.
      </p>
    </div>
  );
}

/* ─── Library Management Tab ─────────────────────────── */
const LIB_CATEGORIES = [
  { id: "muqorror",  label: "Muqorror" },
  { id: "panduan",   label: "Panduan" },
  { id: "referensi", label: "Referensi" },
  { id: "umum",      label: "Umum" },
];
const LIB_FACULTIES = ["__all__", "Ushuluddin", "Syariah wal Qanun", "Dirasah Islamiyah wal Arabiyah", "Bahasa Arab", "Lainnya"];
const LIB_YEARS    = ["__all__", "Tahun 1", "Tahun 2", "Tahun 3", "Tahun 4", "Semua Tahun"];

interface LibItem {
  id: string; title: string; description: string | null;
  category: string; faculty: string | null; year_level: string | null;
  drive_url: string; file_type: string; tags: string | null;
  is_published: boolean; created_at: string;
}

const emptyLib = (): Omit<LibItem, "id" | "created_at"> => ({
  title: "", description: "", category: "muqorror", faculty: "",
  year_level: "", drive_url: "", file_type: "pdf", tags: "", is_published: true,
});

interface MuqArticle {
  title: string; content: string; summary: string;
  keywords: string; article_type: string; category: string;
}

function LibraryManagementTab() {
  const [items, setItems] = useState<LibItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LibItem | null>(null);
  const [form, setForm] = useState<ReturnType<typeof emptyLib>>(emptyLib());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [urlMode, setUrlMode] = useState<"upload" | "drive">("upload");
  const [fileUploading, setFileUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const libFileRef = useRef<HTMLInputElement>(null);

  // Import ke KB wizard state
  const [showImport, setShowImport] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2 | 3>(1);
  const [importMeta, setImportMeta] = useState({ kitab_name: "", faculty: "", year_level: "" });
  const [importText, setImportText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [previewArticles, setPreviewArticles] = useState<MuqArticle[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);

  const openImport = () => {
    setImportStep(1);
    setImportMeta({ kitab_name: "", faculty: "", year_level: "" });
    setImportText("");
    setPreviewArticles([]);
    setEditingIdx(null);
    setShowImport(true);
  };

  const analyzeText = async () => {
    if (!importMeta.kitab_name.trim()) { toast.error("Nama kitab wajib diisi"); return; }
    if (!importText.trim()) { toast.error("Teks wajib diisi"); return; }
    if (importText.length > 20_000) { toast.error("Teks terlalu panjang (maks 20.000 karakter)"); return; }
    setAnalyzing(true);
    try {
      const res = await adminFetch("/api/admin/library/analyze-text", {
        method: "POST",
        body: JSON.stringify({ ...importMeta, text: importText }),
      });
      if (!res.articles?.length) { toast.error("AI tidak berhasil menganalisis teks. Coba sederhanakan."); return; }
      setPreviewArticles(res.articles);
      setImportStep(2);
    } catch (e: any) {
      toast.error(e.message ?? "Gagal menganalisis teks");
    } finally {
      setAnalyzing(false);
    }
  };

  const removePreview = (idx: number) => setPreviewArticles(p => p.filter((_, i) => i !== idx));
  const updatePreview = (idx: number, field: keyof MuqArticle, val: string) =>
    setPreviewArticles(p => p.map((a, i) => i === idx ? { ...a, [field]: val } : a));

  const doImport = async () => {
    if (previewArticles.length === 0) { toast.error("Tidak ada artikel untuk diimport"); return; }
    setImporting(true);
    try {
      const res = await adminFetch("/api/admin/articles/bulk-import", {
        method: "POST",
        body: JSON.stringify({ articles: previewArticles }),
      });
      toast.success(`${res.imported ?? previewArticles.length} artikel berhasil masuk ke Knowledge Base`);
      setShowImport(false);
      setImportStep(1);
    } catch (e: any) {
      toast.error(e.message ?? "Gagal import ke KB");
    } finally {
      setImporting(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/library");
      const data = Array.isArray(res) ? res : [];
      setItems(data);
    } catch { setItems([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleLibFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { toast.error("Ukuran file maksimal 50MB"); return; }
    setFileUploading(true);
    try {
      const reader = new FileReader();
      const b64: string = await new Promise((res, rej) => {
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const result = await adminFetch("/api/admin/library/upload-file", {
        method: "POST",
        body: JSON.stringify({ fileBase64: b64, mimeType: file.type, fileName: file.name }),
      }, 90000); // 90s timeout — large files need time to encode + upload
      setForm(p => ({ ...p, drive_url: result.url, file_type: result.ext ?? p.file_type }));
      setUploadedFileName(file.name);
      toast.success("File berhasil diupload");
    } catch (e: any) { toast.error(e.message ?? "Gagal upload file"); }
    finally { setFileUploading(false); if (libFileRef.current) libFileRef.current.value = ""; }
  };

  const openAdd = () => {
    setEditing(null); setForm(emptyLib()); setUrlMode("upload");
    setUploadedFileName(null); setShowForm(true);
  };
  const openEdit = (item: LibItem) => {
    setEditing(item);
    setForm({ title: item.title, description: item.description ?? "", category: item.category,
      faculty: item.faculty ?? "", year_level: item.year_level ?? "",
      drive_url: item.drive_url, file_type: item.file_type, tags: item.tags ?? "",
      is_published: item.is_published });
    setUrlMode("drive");
    setUploadedFileName(null);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error("Judul wajib diisi"); return; }
    if (!form.drive_url.trim()) { toast.error(urlMode === "upload" ? "Upload file terlebih dahulu" : "Link wajib diisi"); return; }
    setSaving(true);
    try {
      const payload = { ...form,
        faculty: form.faculty || null, year_level: form.year_level || null,
        description: form.description || null, tags: form.tags || null };
      if (editing) {
        await adminFetch(`/api/admin/library/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast.success("Item diperbarui");
      } else {
        await adminFetch("/api/admin/library", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Item ditambahkan");
      }
      setShowForm(false);
      load();
    } catch (e: any) { toast.error(e.message ?? "Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Hapus item ini?")) return;
    setDeleting(id);
    try {
      await adminFetch(`/api/admin/library/${id}`, { method: "DELETE" });
      toast.success("Item dihapus");
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e: any) { toast.error(e.message ?? "Gagal menghapus"); }
    finally { setDeleting(null); }
  };

  const togglePublish = async (item: LibItem) => {
    try {
      await adminFetch(`/api/admin/library/${item.id}`, { method: "PATCH", body: JSON.stringify({ is_published: !item.is_published }) });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_published: !i.is_published } : i));
    } catch { toast.error("Gagal mengubah status"); }
  };

  const filtered = items.filter(i =>
    !search || i.title.toLowerCase().includes(search.toLowerCase()) ||
    (i.faculty ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (i.tags ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const catMeta: Record<string, string> = { muqorror: "Muqorror", panduan: "Panduan", referensi: "Referensi", umum: "Umum" };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Library</h2>
            <p className="text-xs text-muted-foreground">Kelola muqorror, panduan, dan referensi untuk Masisir</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={openImport} className="gap-1.5">
              <Sparkles className="h-4 w-4 text-violet-400" /> Import ke KB
            </Button>
            <Button size="sm" onClick={openAdd} className="gap-1.5">
              <Plus className="h-4 w-4" /> Tambah Item
            </Button>
          </div>
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari judul, fakultas, tag..." className="pl-9" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{search ? "Tidak ada hasil" : "Belum ada item — klik Tambah Item"}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(item => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                    <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {catMeta[item.category] ?? item.category}
                    </span>
                    {!item.is_published && (
                      <span className="shrink-0 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-400">Draft</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 flex-wrap">
                    {item.faculty && <span className="text-xs text-muted-foreground">{item.faculty}</span>}
                    {item.year_level && <span className="text-xs text-muted-foreground">{item.year_level}</span>}
                    <a href={item.drive_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> Buka Drive
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => togglePublish(item)} title={item.is_published ? "Sembunyikan" : "Publikasikan"}>
                    {item.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => remove(item.id)} disabled={deleting === item.id}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Item Library" : "Tambah Item Library"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Judul *</label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Contoh: Fathul Qarib - Thaharah" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Deskripsi</label>
              <Textarea value={form.description ?? ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Deskripsi singkat isi dokumen" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">Kategori *</label>
                <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LIB_CATEGORIES.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">Tipe File</label>
                <Select value={form.file_type} onValueChange={v => setForm(p => ({ ...p, file_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["pdf", "docx", "pptx", "video", "link"].map(t => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">Fakultas</label>
                <Select value={form.faculty || "__all__"} onValueChange={v => setForm(p => ({ ...p, faculty: v === "__all__" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Semua fakultas" /></SelectTrigger>
                  <SelectContent>{LIB_FACULTIES.map(f => <SelectItem key={f} value={f}>{f === "__all__" ? "Semua fakultas" : f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">Tahun</label>
                <Select value={form.year_level || "__all__"} onValueChange={v => setForm(p => ({ ...p, year_level: v === "__all__" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Semua tahun" /></SelectTrigger>
                  <SelectContent>{LIB_YEARS.map(y => <SelectItem key={y} value={y}>{y === "__all__" ? "Semua tahun" : y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">File / URL *</label>
              {/* Tab toggle */}
              <div className="mb-2 flex rounded-lg border border-border overflow-hidden text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setUrlMode("upload")}
                  className={`flex-1 py-1.5 transition-colors ${urlMode === "upload" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                >
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setUrlMode("drive")}
                  className={`flex-1 py-1.5 transition-colors ${urlMode === "drive" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                >
                  URL Drive / Link
                </button>
              </div>

              {urlMode === "upload" ? (
                <div>
                  <input ref={libFileRef} type="file" accept=".pdf,.docx,.pptx,.doc,.ppt" className="hidden" onChange={handleLibFileChange} />
                  {uploadedFileName || form.drive_url ? (
                    <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2">
                      <FileText className="h-4 w-4 text-green-400 shrink-0" />
                      <span className="flex-1 min-w-0 text-xs text-green-300 truncate">{uploadedFileName ?? "File sudah diupload"}</span>
                      <button type="button" onClick={() => { setUploadedFileName(null); setForm(p => ({ ...p, drive_url: "" })); }} className="text-muted-foreground hover:text-foreground text-xs shrink-0">Ganti</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => libFileRef.current?.click()}
                      disabled={fileUploading}
                      className="w-full flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-white/20 bg-white/[0.02] py-5 text-xs text-muted-foreground hover:border-white/30 hover:bg-white/[0.04] transition-colors disabled:opacity-50"
                    >
                      {fileUploading
                        ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" /> Mengupload...</>
                        : <><Upload className="h-5 w-5 text-foreground/30" /> Klik untuk pilih file<span className="text-foreground/30">PDF, DOCX, PPTX — maks 50MB</span></>
                      }
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <Input value={form.drive_url} onChange={e => setForm(p => ({ ...p, drive_url: e.target.value }))} placeholder="https://drive.google.com/file/d/... atau URL lainnya" />
                  <p className="mt-1 text-[11px] text-muted-foreground">Google Drive: pastikan sudah di-share "Anyone with the link can view"</p>
                </div>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Tags (opsional)</label>
              <Input value={form.tags ?? ""} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} placeholder="fiqh, thaharah, semester 1" />
              <p className="mt-1 text-[11px] text-muted-foreground">Dipisah dengan koma, memudahkan pencarian</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setForm(p => ({ ...p, is_published: !p.is_published }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.is_published ? "bg-primary" : "bg-muted"}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.is_published ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
              <span className="text-sm text-foreground">{form.is_published ? "Dipublikasikan" : "Draft (tidak terlihat pengguna)"}</span>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Batal</Button>
              <Button className="flex-1" onClick={save} disabled={saving}>{saving ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Tambahkan"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Import ke KB Wizard ── */}
      <Dialog open={showImport} onOpenChange={open => { if (!analyzing && !importing) setShowImport(open); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-400" />
              Import Muqorror ke Knowledge Base
            </DialogTitle>
            {/* Step indicator */}
            <div className="flex items-center gap-2 mt-3">
              {([1, 2] as const).map(s => (
                <div key={s} className="flex items-center gap-2">
                  {s > 1 && <div className={`h-px w-8 ${importStep >= s ? "bg-primary" : "bg-border"}`} />}
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${importStep >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{s}</div>
                  <span className={`text-xs ${importStep >= s ? "text-foreground" : "text-muted-foreground"}`}>
                    {s === 1 ? "Input Teks" : "Review & Import"}
                  </span>
                </div>
              ))}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">

            {/* Step 1: Input */}
            {importStep === 1 && (
              <div className="space-y-4">
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                  <p className="text-xs text-violet-300 leading-relaxed">
                    Paste teks Arab dari kitab (copy dari PDF atau web). AI akan otomatis memisahkan per bab/fasl dan membuat ringkasan Indonesia untuk setiap bagian.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-foreground">Nama Kitab *</label>
                    <Input
                      value={importMeta.kitab_name}
                      onChange={e => setImportMeta(p => ({ ...p, kitab_name: e.target.value }))}
                      placeholder="Contoh: Fathul Qarib"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-foreground">Fakultas (opsional)</label>
                    <Select value={importMeta.faculty || "__all__"} onValueChange={v => setImportMeta(p => ({ ...p, faculty: v === "__all__" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="Semua fakultas" /></SelectTrigger>
                      <SelectContent>{LIB_FACULTIES.map(f => <SelectItem key={f} value={f}>{f === "__all__" ? "Semua fakultas" : f}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground">Teks Arab *</label>
                  <div className="relative">
                    <Textarea
                      value={importText}
                      onChange={e => setImportText(e.target.value)}
                      placeholder="بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ&#10;&#10;كِتَابُ الطَّهَارَةِ&#10;&#10;الطَّهَارَةُ لُغَةً: النَّظَافَةُ وَالنَّزَاهَةُ..."
                      rows={12}
                      className="resize-none font-mono text-sm"
                      dir="auto"
                    />
                    <div className={`absolute bottom-2 right-2 text-[10px] ${importText.length > 18000 ? "text-red-400" : "text-muted-foreground"}`}>
                      {importText.length.toLocaleString()} / 20.000
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Tips: Paste satu bab atau beberapa bab sekaligus. Maksimal ~5–10 halaman per analisis.
                  </p>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => setShowImport(false)}>Batal</Button>
                  <Button className="flex-1 gap-2" onClick={analyzeText} disabled={analyzing}>
                    {analyzing ? (
                      <><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" /> Menganalisis...</>
                    ) : (
                      <><Sparkles className="h-4 w-4" /> Analisis dengan AI</>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Preview & Edit */}
            {importStep === 2 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    AI menemukan <span className="font-semibold text-foreground">{previewArticles.length} bagian</span> — review sebelum import ke KB
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => setImportStep(1)} className="text-xs gap-1">
                    ← Kembali
                  </Button>
                </div>

                {previewArticles.length === 0 ? (
                  <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">Semua artikel dihapus</div>
                ) : (
                  previewArticles.map((art, idx) => (
                    <div key={idx} className="rounded-xl border border-border bg-card overflow-hidden">
                      {/* Card header */}
                      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">{idx + 1}</span>
                          {editingIdx === idx ? (
                            <Input
                              value={art.title}
                              onChange={e => updatePreview(idx, "title", e.target.value)}
                              className="h-7 text-sm py-0"
                            />
                          ) : (
                            <p className="text-sm font-medium text-foreground truncate">{art.title}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => removePreview(idx)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Card body */}
                      <div className="p-4 space-y-3">
                        {editingIdx === idx ? (
                          <>
                            <div>
                              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Ringkasan</label>
                              <Textarea value={art.summary} onChange={e => updatePreview(idx, "summary", e.target.value)} rows={2} className="mt-1 text-xs resize-none" />
                            </div>
                            <div>
                              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Keywords</label>
                              <Input value={art.keywords} onChange={e => updatePreview(idx, "keywords", e.target.value)} className="mt-1 text-xs" />
                            </div>
                            <div>
                              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Konten Arab</label>
                              <Textarea value={art.content} onChange={e => updatePreview(idx, "content", e.target.value)} rows={4} className="mt-1 text-xs resize-none font-mono" dir="rtl" />
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="text-xs text-muted-foreground leading-relaxed">{art.summary}</p>
                            <div className="flex flex-wrap gap-1">
                              {(art.keywords ?? "").split(",").slice(0, 6).map((kw, ki) => (
                                <span key={ki} className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{kw.trim()}</span>
                              ))}
                            </div>
                            <div className="rounded-lg bg-muted/30 px-3 py-2 text-xs font-mono text-foreground/60 line-clamp-2" dir="rtl">
                              {art.content.slice(0, 120)}...
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}

                <div className="flex gap-2 pt-2 sticky bottom-0 bg-background pb-1">
                  <Button variant="outline" className="flex-1" onClick={() => setShowImport(false)} disabled={importing}>Batal</Button>
                  <Button
                    className="flex-1 gap-2"
                    onClick={doImport}
                    disabled={importing || previewArticles.length === 0}
                  >
                    {importing ? (
                      <><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" /> Mengimport...</>
                    ) : (
                      <><CheckCircle2 className="h-4 w-4" /> Import {previewArticles.length} Artikel ke KB</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Query Analytics Tab (Master Admin only) ─────────── */
type QASummary  = { period_days: number; total_queries: number; by_intent_class: Record<string,number>; by_retrieval_mode: Record<string,number>; used_external_fallback: number; external_fallback_pct: number };
type QATopQ     = { query: string; count: number };
type QAWeakQ    = { query_text: string | null; intent_class: string | null; kb_strength: string | null; retrieval_mode: string; used_external_fallback: boolean; created_at: string };
type QASrcMix   = { total: number; by_origin: { legacy: number; news: number; mixed: number }; pct: { legacy: number; news: number; mixed: number } };
type QAFeedback = { total: number; up: number; down: number; approval: number | null };

function QueryAnalyticsTab() {
  const [summary,   setSummary]   = useState<QASummary | null>(null);
  const [topQ,      setTopQ]      = useState<QATopQ[]>([]);
  const [weakQ,     setWeakQ]     = useState<QAWeakQ[]>([]);
  const [srcMix,    setSrcMix]    = useState<QASrcMix | null>(null);
  const [fb,        setFb]        = useState<QAFeedback | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [days,      setDays]      = useState(7);
  const [migration, setMigration] = useState(false);
  const [err,       setErr]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null); setMigration(false);
    try {
      const [s, t, w, m, f] = await Promise.all([
        adminFetch(`/api/internal/knowledge-analytics/summary?days=${days}`),
        adminFetch(`/api/internal/knowledge-analytics/top-queries?limit=10&days=${days}`),
        adminFetch(`/api/internal/knowledge-analytics/weak-queries?limit=10`),
        adminFetch(`/api/internal/knowledge-analytics/source-mix?days=${days}`),
        adminFetch(`/api/internal/knowledge-analytics/feedback-summary`),
      ]);
      setSummary(s); setTopQ(t.queries ?? []); setWeakQ(w.queries ?? []);
      setSrcMix(m);  setFb(f);
    } catch (e: any) {
      if (e.message?.includes("belum ada") || e.message?.includes("migration")) setMigration(true);
      else setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const MODE_COLOR: Record<string, string> = { smart: "text-violet-400", hybrid: "text-blue-400", legacy: "text-muted-foreground" };
  const KB_COLOR:   Record<string, string> = { strong: "text-green-400", weak: "text-yellow-400", absent: "text-red-400" };

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (migration) return (
    <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-6 space-y-3">
      <div className="flex items-center gap-2 text-yellow-400 font-semibold text-sm">
        <AlertTriangle className="h-4 w-4" />Migration diperlukan
      </div>
      <p className="text-sm text-muted-foreground">Tabel analytics belum tersedia. Jalankan file ini di Supabase SQL Editor:</p>
      <code className="block rounded-lg bg-secondary px-3 py-2 text-xs font-mono text-foreground">migrations/001_query_analytics.sql</code>
      <p className="text-xs text-muted-foreground">Setelah dijalankan, data analytics otomatis terkumpul dari setiap percakapan — tanpa mengubah flow chat.</p>
    </div>
  );

  if (err) return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">Error: {err}</div>
  );

  const dominantMode = Object.entries(summary?.by_retrieval_mode ?? {}).sort(([,a],[,b]) => b - a)[0]?.[0] ?? "—";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Query Analytics</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Pola retrieval &amp; pertanyaan user — {days} hari terakhir</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="rounded-lg border border-border bg-secondary px-2 py-1.5 text-xs text-foreground"
          >
            <option value={7}>7 hari</option>
            <option value={14}>14 hari</option>
            <option value={30}>30 hari</option>
          </select>
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-3 w-3" />Refresh
          </button>
        </div>
      </div>

      {/* Stat cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total Query",       value: summary.total_queries.toString(),              sub: `${summary.period_days} hari`,             cls: "text-foreground" },
            { label: "External Fallback", value: `${summary.external_fallback_pct}%`,           sub: `${summary.used_external_fallback} query`,  cls: summary.external_fallback_pct > 30 ? "text-yellow-400" : "text-foreground" },
            { label: "Feedback Approval", value: fb?.total ? `${fb.approval ?? 0}%` : "—",     sub: fb?.total ? `👍${fb.up} 👎${fb.down}` : "Belum ada", cls: "text-green-400" },
            { label: "Retrieval Mode",    value: dominantMode,                                  sub: "dominan saat ini",                         cls: MODE_COLOR[dominantMode] ?? "text-foreground" },
          ].map(c => (
            <div key={c.label} className="rounded-xl border border-border bg-card p-4 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
              <p className={`text-2xl font-bold capitalize tabular-nums ${c.cls}`}>{c.value}</p>
              <p className="text-[10px] text-muted-foreground">{c.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Retrieval mode + Source mix */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {summary && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-semibold text-foreground">Retrieval Mode</p>
            {Object.keys(summary.by_retrieval_mode).length === 0
              ? <p className="text-xs text-muted-foreground">Belum ada data</p>
              : <div className="space-y-2">
                  {Object.entries(summary.by_retrieval_mode).sort(([,a],[,b]) => b - a).map(([mode, count]) => {
                    const pct = summary.total_queries > 0 ? Math.round(count / summary.total_queries * 100) : 0;
                    return (
                      <div key={mode} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className={`capitalize ${MODE_COLOR[mode] ?? "text-muted-foreground"}`}>{mode}</span>
                          <span className="text-muted-foreground tabular-nums">{count} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                          <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        )}

        {srcMix && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-semibold text-foreground">Source Mix</p>
            {srcMix.total === 0
              ? <p className="text-xs text-muted-foreground">Belum ada data</p>
              : <div className="space-y-2">
                  {([
                    ["legacy", "Legacy KB", "bg-blue-500/60"],
                    ["news",   "News",      "bg-green-500/60"],
                    ["mixed",  "Mixed",     "bg-purple-500/60"],
                  ] as const).map(([key, label, color]) => {
                    const cnt = srcMix.by_origin[key] ?? 0;
                    const pct = srcMix.pct[key] ?? 0;
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="text-muted-foreground tabular-nums">{cnt} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        )}
      </div>

      {/* Top Queries */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-3 flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">Pertanyaan Paling Sering</p>
          <span className="text-[10px] text-muted-foreground">{days} hari terakhir</span>
        </div>
        {topQ.length === 0
          ? <div className="px-4 py-6 text-center text-xs text-muted-foreground">Belum ada data query</div>
          : <div className="divide-y divide-border">
              {topQ.map((q, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-5 shrink-0 text-center text-[10px] font-bold text-muted-foreground/40 tabular-nums">{i + 1}</span>
                  <p className="flex-1 text-xs text-foreground truncate">{q.query}</p>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary tabular-nums">{q.count}×</span>
                </div>
              ))}
            </div>
        }
      </div>

      {/* Weak Queries */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-foreground">Query KB Lemah</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Kandidat konten baru untuk Knowledge Base</p>
          </div>
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
        </div>
        {weakQ.length === 0
          ? <div className="px-4 py-6 text-center text-xs text-muted-foreground">KB kuat — tidak ada query lemah saat ini</div>
          : <div className="divide-y divide-border">
              {weakQ.map((q, i) => (
                <div key={i} className="px-4 py-2.5 space-y-0.5">
                  <p className="text-xs text-foreground truncate">{q.query_text ?? "—"}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className={KB_COLOR[q.kb_strength ?? ""] ?? ""}>{q.kb_strength ?? "—"}</span>
                    <span>·</span>
                    <span className={MODE_COLOR[q.retrieval_mode] ?? ""}>{q.retrieval_mode}</span>
                    {q.used_external_fallback && <><span>·</span><span className="text-yellow-400">external</span></>}
                    {q.intent_class && <><span>·</span><span>{q.intent_class}</span></>}
                  </div>
                </div>
              ))}
            </div>
        }
      </div>

      {/* Intent distribution */}
      {summary && Object.keys(summary.by_intent_class).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">Distribusi Intent</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(summary.by_intent_class).sort(([,a],[,b]) => b - a).map(([intent, count]) => (
              <div key={intent} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2">
                <span className="text-xs text-muted-foreground capitalize">{intent}</span>
                <span className="text-xs font-semibold text-foreground tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main AdminPage ─────────────────────────────────── */
type Tab = "overview" | "users" | "monitor" | "requests" | "knowledge" | "updates" | "reports" | "security" | "waitlist" | "performance" | "announcements" | "signals" | "news" | "procedures" | "coverage" | "insights" | "library" | "query-analytics";

interface NavItem { id: Tab; label: string; icon: React.ElementType; masterOnly?: boolean; badge?: number }
interface NavGroup { label: string; masterOnly?: boolean; items: NavItem[] }

const AdminPage = () => {
  const [isAdmin, setIsAdmin]           = useState(false);
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);
  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab]       = useState<Tab>("overview");
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

  // ── Grouped nav structure ──────────────────────────────
  const navGroups: NavGroup[] = [
    {
      label: "Umum",
      items: [
        { id: "overview", label: "Overview", icon: LayoutDashboard },
      ],
    },
    {
      label: "Konten",
      items: [
        { id: "knowledge",  label: "Knowledge Base",   icon: FileText,  badge: stats.pendingArticles || undefined },
        { id: "library",    label: "Library",          icon: BookOpen },
        { id: "updates",    label: "Breaking Updates", icon: Zap },
        { id: "news",       label: "Berita",           icon: Newspaper },
        { id: "procedures", label: "Prosedur",         icon: BookOpen,  masterOnly: true },
      ],
    },
    {
      label: "Pengguna",
      items: [
        { id: "users",    label: "Users",    icon: Users,    masterOnly: true, badge: stats.totalUsers || undefined },
        { id: "requests", label: "Requests", icon: UserCheck, badge: stats.pendingRequests || undefined },
        { id: "reports",  label: "Laporan",  icon: Flag },
        { id: "waitlist", label: "Waitlist Pro", icon: Crown, masterOnly: true },
      ],
    },
    {
      label: "Monitoring",
      masterOnly: true,
      items: [
        { id: "monitor",  label: "Log Sesi",     icon: Eye },
        { id: "security", label: "Security",     icon: ShieldAlert },
        { id: "signals",  label: "Sinyal User",  icon: ThumbsUp },
      ],
    },
    {
      label: "Komunikasi",
      masterOnly: true,
      items: [
        { id: "announcements", label: "Pengumuman", icon: Megaphone },
      ],
    },
    {
      label: "Analitik",
      masterOnly: true,
      items: [
        { id: "performance",     label: "Performa AI",       icon: TrendingUp },
        { id: "coverage",        label: "Coverage KB",        icon: Search },
        { id: "insights",        label: "Insights",           icon: Sparkles },
        { id: "query-analytics", label: "Query Analytics",   icon: BarChart2 },
      ],
    },
  ];

  // Filter groups and items based on admin level
  const visibleGroups = navGroups
    .filter(g => !g.masterOnly || isMasterAdmin)
    .map(g => ({ ...g, items: g.items.filter(item => !item.masterOnly || isMasterAdmin) }))
    .filter(g => g.items.length > 0);

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
      {activeTab === "coverage"        && isMasterAdmin && <CoverageTab />}
      {activeTab === "insights"        && isMasterAdmin && <InsightsTab />}
      {activeTab === "library"         && <LibraryManagementTab />}
      {activeTab === "query-analytics" && isMasterAdmin && <QueryAnalyticsTab />}
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
        {/* Mobile tab bar — flat, grouped with dividers */}
        <div className="flex overflow-x-auto border-b border-border px-2 scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] shrink-0">
          {visibleGroups.map((group, gi) => (
            <div key={group.label} className="flex items-center">
              {gi > 0 && <div className="mx-1 h-4 w-px bg-border shrink-0" />}
              {group.items.map(item => {
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
          ))}
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

          {/* Nav items — categorized */}
          <div className="flex-1 overflow-y-auto py-2 scrollbar-none [scrollbar-width:none]">
            {visibleGroups.map((group, gi) => (
              <div key={group.label}>
                {/* Category header */}
                <p className={`px-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40 select-none ${gi === 0 ? "pt-2" : "pt-4"}`}>
                  {group.label}
                </p>
                {group.items.map(item => {
                  const isActive = activeTab === item.id;
                  return (
                    <div key={item.id} className="mx-2 my-0.5">
                      <button
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors text-left
                          ${isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground"}
                        `}
                      >
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
            ))}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-5">{tabContent}</div>
      </div>

    </div>
  );
};

export default AdminPage;
