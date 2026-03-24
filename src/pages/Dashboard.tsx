import { useState, useEffect, lazy, Suspense, Component, ReactNode, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardSidebar from "@/components/DashboardSidebar";
import ChatArea from "@/components/ChatArea";
import FeedbackButton from "@/components/FeedbackButton";
import WelcomeModal from "@/components/WelcomeModal";
import BreakingUpdatesBanner from "@/components/BreakingUpdatesBanner";
import SetupProfileModal from "@/components/SetupProfileModal";
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
const ThreadsPage = lazy(() => import("@/components/ThreadsPage"));
const LeaderboardPage = lazy(() => import("@/components/LeaderboardPage"));

interface Chat {
  id: string;
  title: string;
  updated_at: string;
}

const tabTitles: Record<string, string> = {
  chat: "Chat AI",
  productivity: "Productivity",
  berita: "Berita Masisir",
  threads: "Threads",
  leaderboard: "Leaderboard",
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

const VALID_TABS = ["chat", "berita", "productivity", "threads", "leaderboard", "contributor", "profile", "admin"];

const Dashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = VALID_TABS.includes(searchParams.get("tab") ?? "") ? searchParams.get("tab")! : "chat";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [profileInitial, setProfileInitial] = useState<{
    fullName?: string; originCity?: string; faculty?: string;
    studyField?: string; arrivalYear?: string; avatarUrl?: string;
  }>({});

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | undefined>(undefined);

  // Persist last active chat across page reloads
  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem("aina_last_chat_id", activeChatId);
    }
  }, [activeChatId]);

  const navigate = useNavigate();

  useEffect(() => {
    let initialized = false;

    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const uid = session.user.id;
        setUserId(uid);

        const [{ data: roles }, { data: profile }] = await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", uid),
          supabase.from("profiles").select("*").eq("user_id", uid).single(),
        ]);

        if (profile?.is_banned) {
          await supabase.auth.signOut();
          navigate("/banned");
          return;
        }

        setIsAdmin(roles?.some((r) => r.role === "admin") ?? false);

        const setupDoneKey = `aina_setup_done_${uid}`;
        const localSetupDone = !!localStorage.getItem(setupDoneKey);
        const hasName = !!profile?.full_name?.trim();

        if (!hasName || !localSetupDone) {
          const googleAvatar =
            session.user.user_metadata?.avatar_url ||
            session.user.user_metadata?.picture ||
            "";
          setProfileInitial({
            fullName: profile?.full_name ?? "",
            originCity: profile?.origin_city ?? "",
            faculty: profile?.faculty ?? "",
            studyField: profile?.study_field ?? "",
            arrivalYear: profile?.arrival_year ? String(profile.arrival_year) : "",
            avatarUrl: profile?.avatar_url || googleAvatar || "",
          });
          setShowSetup(true);
        }

        setAuthReady(true);
        initialized = true;
      } else {
        navigate("/login");
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!initialized) return;
      if (!session) {
        navigate("/login");
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  useEffect(() => {
    if (authReady) {
      const stored = sessionStorage.getItem("pendingMessage");
      const hasPending = !!stored;
      if (hasPending) {
        sessionStorage.removeItem("pendingMessage");
        setPendingMessage(stored);
        loadChats(false);
      } else {
        loadChats(true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady]);

  const loadChats = useCallback(async (restoreLast = false) => {
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
      if (data) {
        setChats(data);
        if (restoreLast && data.length > 0) {
          const lastId = localStorage.getItem("aina_last_chat_id");
          const found = lastId && data.find((c) => c.id === lastId);
          setActiveChatId(found ? found.id : data[0].id);
        }
      }
    } catch {
      // Silent — sidebar just shows empty if chats can't load
    }
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveChatId(null);
    localStorage.removeItem("aina_last_chat_id");
    setActiveTab("chat");
    setSidebarOpen(false);
  }, []);

  const handleSelectChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
    setActiveTab("chat");
    setSidebarOpen(false);
  }, []);

  const handleChatCreated = useCallback((chatId: string, title: string) => {
    setActiveChatId(chatId);
    setChats((prev) => [
      { id: chatId, title, updated_at: new Date().toISOString() },
      ...prev.filter((c) => c.id !== chatId),
    ]);
  }, []);

  const handleDeleteChat = useCallback(async (chatId: string) => {
    setChats((c) => {
      const prev = c;
      const next = prev.filter((x) => x.id !== chatId);
      supabase.from("chats").delete().eq("id", chatId).then(({ error }) => {
        if (error) {
          setChats(prev);
          toast.error("Gagal menghapus chat");
        } else {
          toast.success("Chat dihapus");
        }
      });
      return next;
    });
    setActiveChatId((id) => (id === chatId ? null : id));
  }, []);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  }, []);

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

      <main className="flex-1 overflow-hidden min-w-0 flex flex-col">
        <BreakingUpdatesBanner />

        {/* Chat — always mounted, hidden when not active */}
        <div className={activeTab === "chat" ? "flex-1 min-h-0" : "hidden"}>
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
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Mobile header */}
            <header className="safe-top flex items-center gap-3 border-b border-border px-4 md:hidden shrink-0 min-h-14">
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

            <div className="flex-1 overflow-hidden" key={activeTab}>
              {activeTab === "berita" && <BeritaPlaceholder />}

              {activeTab === "productivity" && (
                <TabErrorBoundary tabName="Productivity">
                  <Suspense fallback={<TabLoader />}>
                    <ProductivityPage userId={userId} />
                  </Suspense>
                </TabErrorBoundary>
              )}

              {activeTab === "threads" && (
                <TabErrorBoundary tabName="Threads">
                  <Suspense fallback={<TabLoader />}>
                    <ThreadsPage userId={userId} isAdmin={isAdmin} />
                  </Suspense>
                </TabErrorBoundary>
              )}

              {activeTab === "leaderboard" && (
                <TabErrorBoundary tabName="Leaderboard">
                  <Suspense fallback={<TabLoader />}>
                    <LeaderboardPage />
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
      {showSetup && userId && (
        <SetupProfileModal
          userId={userId}
          onComplete={() => setShowSetup(false)}
          initialValues={profileInitial}
        />
      )}
      <FeedbackButton />
      {!showSetup && <WelcomeModal />}
    </div>
  );
};

export default Dashboard;
