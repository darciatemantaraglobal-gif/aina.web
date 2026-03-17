import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardSidebar from "@/components/DashboardSidebar";
import ChatArea from "@/components/ChatArea";
import ProductivityPage from "@/components/ProductivityPage";
import ContributorPage from "@/components/ContributorPage";
import ProfilePage from "@/components/ProfilePage";
import AdminPage from "@/components/AdminPage";
import { supabase } from "@/integrations/supabase/client";
import { Menu, Newspaper } from "lucide-react";

interface Chat {
  id: string;
  title: string;
  updated_at: string;
}

const tabTitles: Record<string, string> = {
  chat: "Chat AI",
  productivity: "Productivity",
  berita: "Berita Masisir",
  contributor: "Contributor",
  profile: "Profile",
  admin: "Admin",
};

const BeritaPlaceholder = () => (
  <div className="flex h-full flex-col items-center justify-center text-center">
    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
      <Newspaper className="h-8 w-8 text-primary" />
    </div>
    <h2 className="font-display text-xl font-bold text-foreground">Berita Masisir</h2>
    <p className="mt-2 max-w-sm text-sm text-muted-foreground">Berita terkini seputar mahasiswa Indonesia di Mesir. Segera hadir!</p>
  </div>
);

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("chat");
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | undefined>(undefined);

  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        setAuthReady(true);
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id);
        setIsAdmin(roles?.some((r) => r.role === "admin") ?? false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        setAuthReady(true);
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id);
        setIsAdmin(roles?.some((r) => r.role === "admin") ?? false);
      } else if (authReady) {
        navigate("/login");
      } else {
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: { session: s } }) => {
            if (!s) navigate("/login");
          });
        }, 500);
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  useEffect(() => {
    if (authReady) {
      loadChats();
      const stored = sessionStorage.getItem("pendingMessage");
      if (stored) {
        sessionStorage.removeItem("pendingMessage");
        setPendingMessage(stored);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady]);

  const loadChats = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from("chats")
      .select("id, title, updated_at")
      .eq("user_id", session.user.id)
      .order("updated_at", { ascending: false })
      .limit(40);
    if (data) setChats(data);
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setActiveTab("chat");
    setSidebarOpen(false);
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setActiveTab("chat");
    setSidebarOpen(false);
  };

  const handleChatCreated = (chatId: string, title: string) => {
    setActiveChatId(chatId);
    setChats((prev) => [
      { id: chatId, title, updated_at: new Date().toISOString() },
      ...prev.filter((c) => c.id !== chatId),
    ]);
  };

  if (!authReady) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <p className="text-sm text-muted-foreground">Memuat dashboard...</p>
      </div>
    );
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  const renderContent = () => {
    if (activeTab === "chat") {
      return (
        <ChatArea
          onMenuClick={() => setSidebarOpen(true)}
          chatId={activeChatId}
          onChatCreated={handleChatCreated}
          onNewChat={handleNewChat}
          initialMessage={pendingMessage}
        />
      );
    }

    return (
      <div className="flex h-full flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border px-4 md:hidden shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-purple p-1">
              <img src="/aina-icon.png" alt="AINA" className="h-full w-full object-contain" />
            </div>
            <span className="font-display text-base font-bold text-foreground">
              {tabTitles[activeTab] ?? "AINA"}
            </span>
          </div>
        </header>
        <div className="flex-1 overflow-hidden">
          {activeTab === "productivity" && <ProductivityPage />}
          {activeTab === "berita" && <BeritaPlaceholder />}
          {activeTab === "contributor" && <ContributorPage />}
          {activeTab === "profile" && <ProfilePage />}
          {activeTab === "admin" && <AdminPage />}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className={`
          fixed inset-y-0 left-0 z-40 md:relative md:z-auto md:flex md:translate-x-0
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <DashboardSidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          isAdmin={isAdmin}
          onClose={() => setSidebarOpen(false)}
          chats={chats}
          activeChatId={activeChatId}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
        />
      </div>

      <main className="flex-1 overflow-hidden min-w-0">
        {renderContent()}
      </main>
    </div>
  );
};

export default Dashboard;
