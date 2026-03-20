import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageSquare,
  Newspaper,
  Users,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Plus,
  Shield,
  X,
  MessageCircle,
  Trash2,
  Home,
  Hash,
  Trophy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import NotificationBell from "@/components/NotificationBell";

interface Chat {
  id: string;
  title: string;
  updated_at: string;
}

interface UserProfile {
  full_name: string | null;
  avatar_url: string | null;
  level: string | null;
}

interface DashboardSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isAdmin?: boolean;
  onClose?: () => void;
  chats?: Chat[];
  activeChatId?: string | null;
  onNewChat?: () => void;
  onSelectChat?: (chatId: string) => void;
  onDeleteChat?: (chatId: string) => void;
}

const baseNavItems = [
  { id: "chat", label: "Chat AI", icon: MessageSquare },
  { id: "productivity", label: "Productivity", icon: LayoutDashboard },
  { id: "berita", label: "Berita Masisir", icon: Newspaper },
  { id: "threads", label: "Threads", icon: Hash },
  { id: "leaderboard", label: "Leaderboard", icon: Trophy },
  { id: "contributor", label: "Contributor", icon: Users },
];

function AvatarDisplay({ name, avatarUrl, size = "sm" }: { name: string | null; avatarUrl: string | null; size?: "sm" | "md" }) {
  const [imgError, setImgError] = useState(false);
  const dim = size === "md" ? "h-9 w-9" : "h-8 w-8";
  const letters = (name ?? "?").split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name ?? "avatar"}
        className={`${dim} shrink-0 rounded-xl object-cover`}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div className={`${dim} shrink-0 flex items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-purple-500 text-xs font-bold text-white`}>
      {letters}
    </div>
  );
}

const DashboardSidebar = ({
  activeTab,
  onTabChange,
  isAdmin = false,
  onClose,
  chats = [],
  activeChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
}: DashboardSidebarProps) => {
  const navItems = isAdmin
    ? [...baseNavItems, { id: "admin", label: "Admin", icon: Shield }]
    : baseNavItems;

  const [collapsed, setCollapsed] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, level")
        .eq("user_id", session.user.id)
        .single();
      if (data) setProfile(data as UserProfile);
    });
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // force logout regardless
    }
    toast.success("Berhasil logout");
    navigate("/login");
  };

  const handleGoHome = () => navigate("/");

  return (
    <aside
      className={`flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* ── Header ─────────────────────────────────────── */}
      <div className={`flex h-14 shrink-0 items-center border-b border-sidebar-border px-3 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed && (
          <div className="flex items-center gap-2 pl-1">
            <img src="/aina-icon.png" alt="AINA" className="h-7 w-7 object-contain" />
            <span className="font-display text-lg font-bold text-sidebar-foreground">AINA</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          {onClose && (
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground md:flex"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* ── Top: Nav items ──────────────────────────────── */}
      <div className="shrink-0 px-3 pt-3 pb-1 space-y-0.5">
        {/* New Chat */}
        <button
          onClick={onNewChat}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent ${
            collapsed ? "justify-center" : ""
          }`}
          title="Chat Baru"
        >
          <Plus className="h-4 w-4 shrink-0" />
          {!collapsed && "Chat Baru"}
        </button>

        {/* Feature nav items */}
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
              activeTab === item.id
                ? "bg-primary/15 text-primary font-medium"
                : "text-sidebar-foreground hover:bg-sidebar-accent"
            } ${collapsed ? "justify-center" : ""}`}
            title={item.label}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && item.label}
          </button>
        ))}
      </div>

      {/* ── Middle: Scrollable chat history ─────────────── */}
      {!collapsed ? (
        <div className="mx-3 mt-3 min-h-0 flex-1 overflow-y-auto">
          {chats.length > 0 ? (
            <>
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                Riwayat Chat
              </p>
              <div className="space-y-0.5 pb-3">
                {chats.map((chat) => (
                  <div
                    key={chat.id}
                    className={`group flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                      activeChatId === chat.id
                        ? "bg-primary/15 text-primary"
                        : "text-sidebar-foreground hover:bg-sidebar-accent"
                    }`}
                  >
                    <button
                      onClick={() => onSelectChat?.(chat.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <MessageCircle className="h-3.5 w-3.5 shrink-0 opacity-40" />
                      <span className="truncate">{chat.title}</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteChat?.(chat.id); }}
                      className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      title="Hapus chat"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center opacity-40">
              <MessageCircle className="h-6 w-6 mb-2 text-sidebar-foreground" />
              <p className="text-xs text-sidebar-foreground">Belum ada riwayat chat</p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* ── Bottom: Notifications + Home + Profile ───────── */}
      <div className="shrink-0 border-t border-sidebar-border px-3 pt-2 pb-3 space-y-0.5">
        <NotificationBell collapsed={collapsed} />

        <button
          onClick={handleGoHome}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent ${
            collapsed ? "justify-center" : ""
          }`}
          title="Halaman Utama"
        >
          <Home className="h-4 w-4 shrink-0" />
          {!collapsed && "Halaman Utama"}
        </button>

        {/* Profile card */}
        <div
          className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-sidebar-accent ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <button
            onClick={() => onTabChange("profile")}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            title="Profile"
          >
            <AvatarDisplay name={profile?.full_name ?? null} avatarUrl={profile?.avatar_url ?? null} />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-sidebar-foreground leading-tight">
                  {profile?.full_name || "Pengguna"}
                </p>
                <p className="text-[11px] text-sidebar-foreground/50 leading-tight mt-0.5">
                  {profile?.level || "User"}
                </p>
              </div>
            )}
          </button>

          {!collapsed && (
            <button
              onClick={handleLogout}
              className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-sidebar-foreground/50 transition-colors hover:bg-destructive/15 hover:text-destructive"
              title="Logout"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center rounded-xl px-3 py-2 text-sidebar-foreground/50 transition-colors hover:bg-destructive/15 hover:text-destructive"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );
};

export default DashboardSidebar;
