import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Shield,
  Users,
  FileText,
  Check,
  X,
  LayoutDashboard,
  MessageSquare,
  BookOpen,
  Clock,
  ChevronDown,
  Search,
  RefreshCw,
  TrendingUp,
  UserCheck,
  AlertCircle,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────── */
interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  level: string;
  contribution_count: number;
  created_at: string;
  roles: string[];
}

interface ContributorRequest {
  id: string;
  user_id: string;
  full_name: string;
  education: string;
  enrollment_year: number;
  expertise: string;
  status: string;
  created_at: string;
}

interface Article {
  id: string;
  author_id: string;
  title: string;
  content: string;
  category: string;
  status: string;
  created_at: string;
}

interface Stats {
  totalUsers: number;
  totalChats: number;
  pendingRequests: number;
  pendingArticles: number;
  approvedArticles: number;
}

/* ─── Helpers ────────────────────────────────────────── */
const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  senior_contributor: "Sr. Contributor",
  contributor: "Contributor",
  user: "User",
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
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

function Initials({ name }: { name: string | null }) {
  const letters = (name ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-purple text-xs font-bold text-white">
      {letters}
    </div>
  );
}

/* ─── Overview Tab ───────────────────────────────────── */
function OverviewTab({ stats, loading }: { stats: Stats; loading: boolean }) {
  const cards = [
    { label: "Total User", value: stats.totalUsers, icon: Users, color: "text-violet-400", bg: "bg-violet-500/10" },
    { label: "Total Chat", value: stats.totalChats, icon: MessageSquare, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Req. Pending", value: stats.pendingRequests, icon: UserCheck, color: "text-yellow-400", bg: "bg-yellow-500/10" },
    { label: "Artikel Pending", value: stats.pendingArticles, icon: AlertCircle, color: "text-orange-400", bg: "bg-orange-500/10" },
    { label: "Artikel Aktif", value: stats.approvedArticles, icon: BookOpen, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "Pertumbuhan", value: "Live", icon: TrendingUp, color: "text-pink-400", bg: "bg-pink-500/10" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">Gambaran Umum</h2>
        <p className="text-sm text-muted-foreground">Statistik platform AINA secara real-time.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map((c) => (
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
          ].map((r) => (
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

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: profiles }, { data: allRoles }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);

    const roleMap: Record<string, string[]> = {};
    (allRoles ?? []).forEach((r) => {
      if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
      roleMap[r.user_id].push(r.role);
    });

    setUsers(
      (profiles ?? []).map((p) => ({
        ...p,
        roles: roleMap[p.user_id] ?? ["user"],
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const topRole = (roles: string[]) => {
    const order = ["admin", "senior_contributor", "contributor", "user"];
    return order.find((r) => roles.includes(r)) ?? "user";
  };

  const setRole = async (userId: string, role: string) => {
    setOpenRoleMenu(null);
    const allRoles = ["admin", "senior_contributor", "contributor", "user"];
    // Remove all roles first, then insert the new one
    for (const r of allRoles) {
      await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", r as any);
    }
    await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
    // Also sync profile level
    const levelMap: Record<string, string> = {
      admin: "Admin",
      senior_contributor: "Senior Contributor",
      contributor: "Contributor",
      user: "User",
    };
    await supabase.from("profiles").update({ level: levelMap[role] }).eq("user_id", userId);
    toast.success(`Role berhasil diubah ke ${ROLE_LABELS[role]}`);
    load();
  };

  const filtered = users.filter(
    (u) =>
      !search ||
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">Manajemen User</h2>
          <p className="text-sm text-muted-foreground">{users.length} akun terdaftar</p>
        </div>
        <button onClick={load} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama atau email..."
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => {
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
                  {/* Role picker */}
                  <div className="relative">
                    <button
                      onClick={() => setOpenRoleMenu(openRoleMenu === u.user_id ? null : u.user_id)}
                      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors hover:opacity-80 ${ROLE_COLORS[role]}`}
                    >
                      {ROLE_LABELS[role]}
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    {openRoleMenu === u.user_id && (
                      <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
                        {Object.entries(ROLE_LABELS).map(([r, label]) => (
                          <button
                            key={r}
                            onClick={() => setRole(u.user_id, r)}
                            className={`flex w-full items-center justify-between px-3 py-2 text-xs transition-colors hover:bg-accent ${
                              role === r ? "text-primary" : "text-foreground"
                            }`}
                          >
                            {label}
                            {role === r && <Check className="h-3 w-3" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada user ditemukan.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Requests Tab ───────────────────────────────────── */
function RequestsTab() {
  const [requests, setRequests] = useState<ContributorRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("contributor_requests")
      .select("*")
      .eq("status", filter)
      .order("created_at", { ascending: false });
    setRequests(data ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handle = async (id: string, userId: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("contributor_requests").update({ status }).eq("id", id);
    if (error) { toast.error("Gagal memperbarui"); return; }

    if (status === "approved") {
      await supabase.from("user_roles").upsert({ user_id: userId, role: "contributor" as any }, { onConflict: "user_id,role" });
      await supabase.from("profiles").update({ level: "Contributor" }).eq("user_id", userId);
      toast.success("Permintaan disetujui — user jadi Contributor");
    } else {
      toast.success("Permintaan ditolak");
    }
    load();
  };

  const tabs: Array<"pending" | "approved" | "rejected"> = ["pending", "approved", "rejected"];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">Permintaan Kontributor</h2>
        <p className="text-sm text-muted-foreground">Review dan kelola pengajuan menjadi kontributor.</p>
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium capitalize transition-colors ${
              filter === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
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
          {requests.map((req) => (
            <div key={req.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Initials name={req.full_name} />
                  <div>
                    <p className="font-medium text-foreground">{req.full_name}</p>
                    <p className="text-xs text-muted-foreground">{req.education}</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                        Masuk {req.enrollment_year}
                      </span>
                      <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                        {req.expertise}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_COLORS[req.status]}`}>
                        {req.status === "pending" ? "Menunggu" : req.status === "approved" ? "Disetujui" : "Ditolak"}
                      </span>
                    </div>
                  </div>
                </div>
                {req.status === "pending" && (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 border-green-500/30 text-green-400 hover:bg-green-500/10"
                      onClick={() => handle(req.id, req.user_id, "approved")}
                    >
                      <Check className="h-3.5 w-3.5" /> Setuju
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10"
                      onClick={() => handle(req.id, req.user_id, "rejected")}
                    >
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

/* ─── Knowledge Base Tab ─────────────────────────────── */
function KnowledgeBaseTab() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("knowledge_base")
      .select("*")
      .eq("status", filter)
      .order("created_at", { ascending: false });
    setArticles(data ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handle = async (id: string, authorId: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("knowledge_base").update({ status }).eq("id", id);
    if (error) { toast.error("Gagal memperbarui"); return; }

    if (status === "approved") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("contribution_count")
        .eq("user_id", authorId)
        .single();
      if (profile) {
        const newCount = (profile.contribution_count || 0) + 1;
        const level = newCount >= 10 ? "Senior Contributor" : "Contributor";
        await supabase.from("profiles").update({ contribution_count: newCount, level }).eq("user_id", authorId);
        if (newCount >= 10) {
          await supabase.from("user_roles").upsert(
            { user_id: authorId, role: "senior_contributor" as any },
            { onConflict: "user_id,role" }
          );
        }
      }
      toast.success("Artikel disetujui dan dipublikasikan");
    } else {
      toast.success("Artikel ditolak");
    }
    load();
  };

  const CATEGORY_COLORS: Record<string, string> = {
    Administrasi: "bg-violet-500/15 text-violet-400",
    Akademik: "bg-blue-500/15 text-blue-400",
    "Kehidupan Mesir": "bg-green-500/15 text-green-400",
    Transport: "bg-yellow-500/15 text-yellow-400",
    "Tempat Tinggal": "bg-orange-500/15 text-orange-400",
    Kuliner: "bg-pink-500/15 text-pink-400",
  };

  const tabs: Array<"pending" | "approved" | "rejected"> = ["pending", "approved", "rejected"];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">Moderasi Knowledge Base</h2>
        <p className="text-sm text-muted-foreground">Review dan terbitkan artikel dari kontributor.</p>
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
              filter === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "pending" ? "Menunggu" : t === "approved" ? "Disetujui" : "Ditolak"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-card" />)}</div>
      ) : articles.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <BookOpen className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Tidak ada artikel {filter === "pending" ? "menunggu review" : filter === "approved" ? "yang disetujui" : "yang ditolak"}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((art) => (
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
                  </div>
                  <h3 className="mt-1.5 font-medium text-foreground">{art.title}</h3>
                  <p
                    className={`mt-1 text-sm text-muted-foreground ${expanded === art.id ? "" : "line-clamp-2"}`}
                  >
                    {art.content}
                  </p>
                  <button
                    onClick={() => setExpanded(expanded === art.id ? null : art.id)}
                    className="mt-1 text-xs text-primary hover:underline"
                  >
                    {expanded === art.id ? "Tampilkan lebih sedikit" : "Baca selengkapnya"}
                  </button>
                </div>
                {art.status === "pending" && (
                  <div className="flex shrink-0 flex-col gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 border-green-500/30 text-green-400 hover:bg-green-500/10"
                      onClick={() => handle(art.id, art.author_id, "approved")}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                      onClick={() => handle(art.id, art.author_id, "rejected")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="mt-2 text-right text-xs text-muted-foreground">{fmtDate(art.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main AdminPage ─────────────────────────────────── */
type Tab = "overview" | "users" | "requests" | "knowledge";

const AdminPage = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    totalChats: 0,
    pendingRequests: 0,
    pendingArticles: 0,
    approvedArticles: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const admin = roles?.some((r) => r.role === "admin") ?? false;
      setIsAdmin(admin);
      setLoading(false);

      if (admin) {
        const [
          { count: totalUsers },
          { count: totalChats },
          { count: pendingRequests },
          { count: pendingArticles },
          { count: approvedArticles },
        ] = await Promise.all([
          supabase.from("profiles").select("*", { count: "exact", head: true }),
          supabase.from("chats").select("*", { count: "exact", head: true }),
          supabase.from("contributor_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("knowledge_base").select("*", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("knowledge_base").select("*", { count: "exact", head: true }).eq("status", "approved"),
        ]);
        setStats({
          totalUsers: totalUsers ?? 0,
          totalChats: totalChats ?? 0,
          pendingRequests: pendingRequests ?? 0,
          pendingArticles: pendingArticles ?? 0,
          approvedArticles: approvedArticles ?? 0,
        });
        setStatsLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center p-6">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
          <Shield className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="font-display text-xl font-bold text-foreground">Akses Ditolak</h2>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
          Halaman ini hanya dapat diakses oleh admin. Hubungi admin untuk mendapatkan akses.
        </p>
      </div>
    );
  }

  const navItems: Array<{ id: Tab; label: string; icon: React.ElementType; badge?: number }> = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "users", label: "Users", icon: Users, badge: stats.totalUsers },
    { id: "requests", label: "Requests", icon: UserCheck, badge: stats.pendingRequests || undefined },
    { id: "knowledge", label: "Knowledge Base", icon: FileText, badge: stats.pendingArticles || undefined },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-purple">
          <Shield className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="font-display text-base font-bold text-foreground">Admin Panel</h1>
          <p className="text-xs text-muted-foreground">Kontrol penuh atas platform AINA</p>
        </div>
      </div>

      {/* Tab Nav */}
      <div className="flex gap-0.5 border-b border-border px-4 pt-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`relative flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm transition-colors ${
              activeTab === item.id
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <item.icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{item.label}</span>
            {item.badge != null && item.badge > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/20 px-1 text-[10px] font-bold text-primary">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-3xl">
          {activeTab === "overview" && <OverviewTab stats={stats} loading={statsLoading} />}
          {activeTab === "users" && <UsersTab />}
          {activeTab === "requests" && <RequestsTab />}
          {activeTab === "knowledge" && <KnowledgeBaseTab />}
        </div>
      </div>
    </div>
  );
};

export default AdminPage;
