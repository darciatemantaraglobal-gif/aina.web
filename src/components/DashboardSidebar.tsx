import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bot,
  MessageSquare,
  Newspaper,
  Users,
  UserCircle,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Plus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DashboardSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const menuItems = [
  { id: "chat", label: "Chat AI", icon: MessageSquare },
  { id: "productivity", label: "Productivity", icon: LayoutDashboard },
  { id: "berita", label: "Berita Masisir", icon: Newspaper },
  { id: "contributor", label: "Contributor", icon: Users },
  { id: "profile", label: "Profile", icon: UserCircle },
];

const DashboardSidebar = ({ activeTab, onTabChange }: DashboardSidebarProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Berhasil logout");
    navigate("/");
  };

  return (
    <aside
      className={`flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-purple">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-bold text-sidebar-foreground">AINA</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {/* New Chat */}
      <div className="p-3">
        <button
          onClick={() => onTabChange("chat")}
          className={`flex w-full items-center gap-2 rounded-xl border border-dashed border-sidebar-border px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:border-primary/40 hover:bg-sidebar-accent ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <Plus className="h-4 w-4" />
          {!collapsed && "Chat Baru"}
        </button>
      </div>

      {/* Menu */}
      <nav className="flex-1 space-y-1 px-3">
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

      {/* Logout */}
      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={handleLogout}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-destructive/10 hover:text-destructive ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && "Logout"}
        </button>
      </div>
    </aside>
  );
};

export default DashboardSidebar;
