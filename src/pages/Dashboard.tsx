import { useState, useEffect, useMemo, lazy, Suspense, Component, ReactNode, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardSidebar from "@/components/DashboardSidebar";
import ChatArea from "@/components/ChatArea";
import FeedbackButton from "@/components/FeedbackButton";
import WelcomeModal from "@/components/WelcomeModal";
import BreakingUpdatesBanner from "@/components/BreakingUpdatesBanner";
import SetupProfileModal from "@/components/SetupProfileModal";
import AnnouncementPopup from "@/components/AnnouncementPopup";
import GuidedTour, { type TourStep } from "@/components/GuidedTour";
import { supabase } from "@/integrations/supabase/client";
import { Menu, Newspaper, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const TOUR_KEY = "aina_tour_seen_v1";

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
const SavedAnswersPage = lazy(() => import("@/components/SavedAnswersPage"));
const NewsPage = lazy(() => import("@/components/NewsPage"));

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
  saved: "Jawaban Tersimpan",
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

const VALID_TABS = ["chat", "berita", "productivity", "threads", "leaderboard", "contributor", "profile", "admin", "saved"];

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
  const [fadingChatIds, setFadingChatIds] = useState<Set<string>>(new Set());
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | undefined>(undefined);
  const [showTour, setShowTour] = useState(false);

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

  // Show guided tour for first-time users
  useEffect(() => {
    if (!authReady) return;
    if (localStorage.getItem(TOUR_KEY)) return;
    const t = setTimeout(() => setShowTour(true), 1500);
    return () => clearTimeout(t);
  }, [authReady]);

  // Realtime: when admin deletes a chat, fade it out and remove from sidebar
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`chat-deletions-${userId}`)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chats" }, (payload) => {
        const deletedId = (payload.old as any)?.id as string | undefined;
        if (!deletedId) return;
        // Only react if this chat is in our list
        setChats(prev => {
          if (!prev.find(c => c.id === deletedId)) return prev;
          // Kick off fade-out animation, then remove after delay
          setFadingChatIds(f => new Set(f).add(deletedId));
          setTimeout(() => {
            setChats(c => c.filter(x => x.id !== deletedId));
            setFadingChatIds(f => { const n = new Set(f); n.delete(deletedId); return n; });
          }, 400);
          return prev; // keep in list during animation
        });
        setActiveChatId(prev => prev === deletedId ? null : prev);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

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

  const handleGoContributor = useCallback(() => {
    setActiveTab("contributor");
    setSidebarOpen(false);
  }, []);

  const handleStartTour = useCallback(() => {
    setShowTour(true);
  }, []);

  const handleTourComplete = useCallback(() => {
    localStorage.setItem(TOUR_KEY, "1");
    setShowTour(false);
  }, []);

  const tourSteps = useMemo<TourStep[]>(() => [
    {
      title: "Selamat datang di AINA! 👋",
      content: "AINA adalah asisten AI khusus untuk Masisir — mahasiswa Indonesia di Mesir. Yuk, kenalan sama fitur-fitur utamanya dalam 1 menit!",
    },
    {
      target: '[data-tour="nav-chat"]',
      title: "Chat AI",
      content: "Tanyakan apa saja ke AINA — info kampus Al-Azhar, visa, kehidupan di Mesir, sampai bantu nulis tugas atau terjemah. AINA dilatih khusus untuk kebutuhan Masisir.",
      onBefore: () => setSidebarOpen(true),
      delay: 600,
    },
    {
      target: '[data-tour="chat-input"]',
      title: "Mulai Bertanya",
      content: "Ketik pertanyaanmu di sini dan tekan Enter. Bisa juga upload gambar atau dokumen! Pengguna gratis dapat 3 chat/hari — jadi Kontributor untuk lebih banyak.",
      onBefore: () => setSidebarOpen(false),
      delay: 500,
    },
    {
      target: '[data-tour="nav-threads"]',
      title: "Threads — Diskusi Komunitas",
      content: "Forum diskusi sesama Masisir. Tanya, jawab, dan berbagi pengalaman. Jawaban terbaik dari komunitas bisa masuk ke knowledge base AINA!",
      onBefore: () => setSidebarOpen(true),
      delay: 600,
    },
    {
      target: '[data-tour="nav-productivity"]',
      title: "Productivity Tools",
      content: "Kalkulator IP/GPA, konverter tanggal Hijriyah, to-do list, pencatat keuangan, dan banyak tools harian lain yang berguna untuk Masisir.",
      onBefore: () => setSidebarOpen(true),
      delay: 600,
    },
    {
      target: '[data-tour="nav-leaderboard"]',
      title: "Leaderboard",
      content: "Lihat siapa Masisir paling aktif dan bermanfaat di AINA. Semakin banyak kontribusimu, semakin tinggi peringkat dan semakin besar manfaatnya!",
      onBefore: () => setSidebarOpen(true),
      delay: 600,
    },
    {
      target: '[data-tour="nav-contributor"]',
      title: "Jadi Kontributor",
      content: "Kontributor AINA dapat akses chat lebih banyak, badge eksklusif, dan ikut membangun knowledge base untuk seluruh Masisir. Yuk, lihat cara daftarnya!",
      onBefore: () => setSidebarOpen(true),
      delay: 600,
    },
    {
      target: '[data-tour="contributor-registration"]',
      title: "Formulir Pendaftaran Kontributor",
      content: "Isi nama, pendidikan, tahun masuk, dan bidang keahlianmu. Tuliskan juga alasan ingin berkontribusi — ini membantu admin mengenal kamu lebih baik.",
      onBefore: () => { setActiveTab("contributor"); setSidebarOpen(false); },
      delay: 900,
    },
    {
      target: '[data-tour="contributor-article-sample"]',
      title: "Artikel Sampel — Wajib Diisi",
      content: "Admin akan menilai kemampuan menulismu melalui artikel sampel ini. Bisa tulis langsung di kotak teks, atau upload file PDF / DOCX / TXT. Topik bebas — seputar kehidupan Masisir di Mesir.",
      delay: 400,
    },
    {
      target: '[data-tour="contributor-submit"]',
      title: "Kirim Pendaftaran",
      content: "Klik tombol ini untuk mengirim pendaftaranmu. Admin akan meninjau artikel sampelmu dan memberi keputusan. Biasanya dalam 1–3 hari kerja. Kamu akan diberi tahu hasilnya.",
      delay: 400,
    },
    {
      target: '[data-tour="contributor-write-area"]',
      title: "Upload Artikel (Setelah Jadi Kontributor)",
      content: "Setelah disetujui, kamu bisa: ① Klik 'Tulis Artikel' untuk nulis langsung di editor, atau ② 'Upload PDF / Dokumen' untuk upload file — AI akan otomatis membaca dan mengkategorikan isinya! Artikel yang lolos review admin langsung masuk Knowledge Base AINA.",
      delay: 400,
    },
    {
      title: "Siap Menjelajahi AINA! 🚀",
      content: "Itu semua fitur utama AINA. Kalau mau ulangi panduan ini kapan saja, klik 'Panduan Fitur' di bagian bawah sidebar. Selamat belajar dan berkontribusi!",
      onBefore: () => { setActiveTab("chat"); setSidebarOpen(false); },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

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
          fadingChatIds={fadingChatIds}
          activeChatId={activeChatId}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
          onDeleteChat={handleDeleteChat}
          onStartTour={handleStartTour}
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
            onGoContributor={handleGoContributor}
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
                <img src="/aina-icon.png" alt="AINA" className="h-5 w-5 object-contain" />
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

              {activeTab === "saved" && (
                <TabErrorBoundary tabName="Jawaban Tersimpan">
                  <Suspense fallback={<TabLoader />}>
                    <SavedAnswersPage />
                  </Suspense>
                </TabErrorBoundary>
              )}

              {activeTab === "berita" && (
                <TabErrorBoundary tabName="Berita Masisir">
                  <Suspense fallback={<TabLoader />}>
                    <NewsPage />
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
      {!showSetup && <WelcomeModal onGoContributor={handleGoContributor} />}
      {!showSetup && <AnnouncementPopup />}
      {showTour && (
        <GuidedTour
          steps={tourSteps}
          onComplete={handleTourComplete}
          onSkip={handleTourComplete}
        />
      )}
    </div>
  );
};

export default Dashboard;
