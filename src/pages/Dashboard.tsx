import { useState, useEffect, lazy, Suspense, Component, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import DashboardSidebar from "@/components/DashboardSidebar";
import ChatArea from "@/components/ChatArea";
import FeedbackButton from "@/components/FeedbackButton";
import WelcomeModal from "@/components/WelcomeModal";
import { supabase } from "@/integrations/supabase/client";
import { Menu, Newspaper, RefreshCw } from "lucide-react";
import { toast } from "sonner";

class TabErrorBoundary extends Component<
  { children: ReactNode; tabName: string },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error) {
    console.error("Tab error:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
            <RefreshCw className="h-7 w-7 text-destructive" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Halaman {this.props.tabName} mengalami error</p>
            <p className="mt-1 text-sm text-muted-foreground">Klik tombol di bawah untuk memuat ulang</p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: "" })}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Muat Ulang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const ProductivityPage = lazy(() => import("@/components/ProductivityPage"));
const ContributorPage = lazy(() => import("@/components/ContributorPage"));
const ProfilePage = lazy(() => import("@/components/ProfilePage"));
const AdminPage = lazy(() => import("@/components/AdminPage"));

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

const TabLoader = () => (
  <div className="flex h-full items-center justify-center">
    <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
  </div>
);

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("chat");
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | undefined>(undefined);
  const [tabKey, setTabKey] = useState(0);

  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        setUserId(session.user.id);
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
        setUserId(session.user.id);
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
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase
        .from("chats")
        .select("id, title, updated_at")
        .eq("user_id", session.user.id)
        .order("updated_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      if (data) setChats(data);
    } catch {
      // Silent — sidebar just shows empty if chats can't load
    }
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

  const handleDeleteChat = async (chatId: string) => {
    const prev = chats;
    setChats((c) => c.filter((x) => x.id !== chatId));
    if (activeChatId === chatId) setActiveChatId(null);
    const { error } = await supabase.from("chats").delete().eq("id", chatId);
    if (error) {
      setChats(prev);
      toast.error("Gagal menghapus chat");
      return;
    }
    toast.success("Chat dihapus");
  };

  const handleTabChange = (tab: string) => {
    if (tab !== activeTab) setTabKey(k => k + 1);
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  if (!authReady) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <p className="text-sm text-muted-foreground">Memuat dashboard...</p>
      </div>
    );
  }

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
          onDeleteChat={handleDeleteChat}
        />
      </div>

      <main className="flex-1 overflow-hidden min-w-0">
        {/* Chat — always mounted, hidden when not active */}
        <div className={activeTab === "chat" ? "h-full" : "hidden"}>
          <ChatArea
            onMenuClick={() => setSidebarOpen(true)}
            chatId={activeChatId}
            onChatCreated={handleChatCreated}
            onNewChat={handleNewChat}
            initialMessage={pendingMessage}
          />
        </div>

        {/* Non-chat tabs — only the active one is mounted at a time */}
        {activeTab !== "chat" && (
          <div className="h-full flex flex-col">
            {/* Mobile header */}
            <header className="flex h-14 items-center gap-3 border-b border-border px-4 md:hidden shrink-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2">
                <img src="/aina-icon.png" alt="AINA" className="h-7 w-7 object-contain" />
                <span className="font-display text-base font-bold text-foreground">
                  {tabTitles[activeTab] ?? "AINA"}
                </span>
              </div>
            </header>

            <div className="flex-1 overflow-hidden" key={`${activeTab}-${tabKey}`}>
              {activeTab === "berita" && <BeritaPlaceholder />}

              {activeTab === "productivity" && (
                <TabErrorBoundary tabName="Productivity">
                  <Suspense fallback={<TabLoader />}>
                    <ProductivityPage userId={userId} />
                  </Suspense>
                </TabErrorBoundary>
              )}

              {activeTab === "contributor" && (
                <TabErrorBoundary tabName="Contributor">
                  <Suspense fallback={<TabLoader />}>
                    <ContributorPage userId={userId} />
                  </Suspense>
                </TabErrorBoundary>
              )}

              {activeTab === "profile" && (
                <TabErrorBoundary tabName="Profile">
                  <Suspense fallback={<TabLoader />}>
                    <ProfilePage userId={userId} />
                  </Suspense>
                </TabErrorBoundary>
              )}

              {activeTab === "admin" && isAdmin && (
                <TabErrorBoundary tabName="Admin">
                  <Suspense fallback={<TabLoader />}>
                    <AdminPage />
                  </Suspense>
                </TabErrorBoundary>
              )}
            </div>
          </div>
        )}
      </main>
      <FeedbackButton />
      <WelcomeModal />
    </div>
  );
};

export default Dashboard;
