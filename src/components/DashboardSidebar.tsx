import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageSquare,
  Newspaper,
  Users,
  UserCircle,
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

const baseMenuItems = [
  { id: "chat", label: "Chat AI", icon: MessageSquare },
  { id: "productivity", label: "Productivity", icon: LayoutDashboard },
  { id: "berita", label: "Berita Masisir", icon: Newspaper },
  { id: "threads", label: "Threads", icon: Hash },
  { id: "leaderboard", label: "Leaderboard", icon: Trophy },
  { id: "contributor", label: "Contributor", icon: Users },
  { id: "profile", label: "Profile", icon: UserCircle },
];

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
  const menuItems = isAdmin
    ? [...baseMenuItems, { id: "admin", label: "Admin", icon: Shield }]
    : baseMenuItems;
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore errors — force logout regardless
    }
    toast.success("Berhasil logout");
    navigate("/login");
  };

  const handleGoHome = () => {
    navigate("/");
  };

  return (
    <aside
      className={`flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4 shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <img src="/aina-icon.png" alt="AINA" className="h-8 w-8 object-contain" />
            <span className="font-display text-lg font-bold text-sidebar-foreground">AINA</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          {onClose && (
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent md:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent md:flex"
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* New chat button */}
      <div className="px-3 pt-3 shrink-0">
        <button
          onClick={onNewChat}
          className={`flex w-full items-center gap-2 rounded-xl border border-dashed border-sidebar-border px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:border-primary/40 hover:bg-sidebar-accent ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <Plus className="h-4 w-4 shrink-0" />
          {!collapsed && "Chat Baru"}
        </button>
      </div>

      {/* Chat history list — scrollable middle section */}
      {!collapsed && (
        <div className="mx-3 mt-3 min-h-0 flex-1 overflow-y-auto">
          {chats.length > 0 && (
            <>
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                Riwayat Chat
              </p>
              <div className="space-y-0.5 pb-2">
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
                      <MessageCircle className="h-3.5 w-3.5 shrink-0 opacity-50" />
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
          )}
        </div>
      )}

      {/* Collapsed: flex-1 spacer */}
      {collapsed && <div className="flex-1" />}

      {/* Nav items + Logout — pinned to bottom */}
      <div className="shrink-0 border-t border-sidebar-border">
        <nav className="space-y-1 p-3">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                activeTab === item.id
                  ? "bg-primary/15 text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && item.label}
            </button>
          ))}
        </nav>

        <div className="px-3 pb-3 space-y-1">
          <NotificationBell collapsed={collapsed} />
          <button
            onClick={handleGoHome}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent ${
              collapsed ? "justify-center" : ""
            }`}
            title="Kembali ke Halaman Utama"
          >
            <Home className="h-4 w-4 shrink-0" />
            {!collapsed && "Halaman Utama"}
          </button>
          <button
            onClick={handleLogout}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-destructive/10 hover:text-destructive ${
              collapsed ? "justify-center" : ""
            }`}
            title="Logout"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && "Logout"}
          </button>
        </div>
      </div>
    </aside>
  );
};

export default DashboardSidebar;
