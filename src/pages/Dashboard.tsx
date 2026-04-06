import { useState, useEffect, useRef, lazy, Suspense, Component, ReactNode, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardSidebar from "@/components/DashboardSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import PwaSplash from "@/components/PwaSplash";
import ChatArea from "@/components/ChatArea";
import FeedbackButton from "@/components/FeedbackButton";
import WelcomeModal from "@/components/WelcomeModal";
import BreakingUpdatesBanner from "@/components/BreakingUpdatesBanner";
import SetupProfileModal from "@/components/SetupProfileModal";
import AnnouncementPopup from "@/components/AnnouncementPopup";
import SystemRestartBanner from "@/components/SystemRestartBanner";
import GuidedTour, { type TourStep } from "@/components/GuidedTour";
import { supabase } from "@/integrations/supabase/client";
import { Menu, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// Per-feature tour storage keys (each feature has its own first-visit tracking)
const FEAT_TOUR_KEYS: Record<string, string> = {
  chat:         "aina_feat_tour_chat_v1",
  threads:      "aina_feat_tour_threads_v1",
  productivity: "aina_feat_tour_productivity_v1",
  leaderboard:  "aina_feat_tour_leaderboard_v1",
  contributor:  "aina_feat_tour_contributor_v1",
};

// Per-feature tour step definitions (static — no component-level callbacks needed)
const FEATURE_TOURS: Record<string, TourStep[]> = {
  chat: [
    {
      title: "Chat AI 🤖",
      content: "Tanya apa saja soal kehidupan Masisir — iqama, visa, Al-Azhar, terjemah dokumen, atau bantu nulis tugas. AINA menjawab berdasarkan Knowledge Base khusus Masisir.",
    },
    {
      target: '[data-tour="chat-input"]',
      title: "Ketik & Kirim ✍️",
      content: "Tulis pertanyaanmu lalu tekan Enter. Bisa juga lampirkan foto atau PDF. Pengguna gratis dapat kuota harian — jadi Kontributor untuk akses lebih banyak.",
      delay: 400,
    },
  ],
  threads: [
    {
      title: "Threads 💬",
      content: "Forum tanya jawab sesama Masisir. Buat thread, balas, upvote jawaban terbaik. Diskusi yang aktif ikut memperkaya jawaban AINA.",
    },
  ],
  productivity: [
    {
      title: "Ruang Produktif 📋",
      content: "4 tab sekaligus: Fokus (tugas harian + bantuan AI), Dokumen (lacak tenggat & tandai urgenti), Prosedur (panduan iqama, visa, Al-Azhar, dll.), Pengingat (catatan bebas).",
    },
  ],
  leaderboard: [
    {
      title: "Leaderboard 🏆",
      content: "Lihat peringkat Kontributor dan artikel terpopuler. Baca, upvote, dan buktikan kontribusimu ada di atas!",
    },
  ],
  contributor: [
    {
      target: '[data-tour="contributor-registration"]',
      title: "Data Diri 📝",
      content: "Isi nama, pendidikan, tahun masuk, bidang keahlian, dan alasan bergabung. Data ini yang admin baca sebelum memutuskan.",
      delay: 500,
    },
    {
      target: '[data-tour="contributor-article-sample"]',
      title: "Artikel Sampel ✍️",
      content: "Tulis langsung atau upload PDF/DOCX/TXT. Topik bebas — seputar kehidupan Masisir. Inilah yang dinilai admin.",
      delay: 400,
    },
    {
      target: '[data-tour="contributor-submit"]',
      title: "Kirim! 🚀",
      content: "Tekan tombol ini untuk mendaftar. Admin memutuskan dalam 1–3 hari. Jika disetujui, kamu bisa langsung menulis untuk ribuan Masisir.",
      delay: 400,
    },
  ],
};

const CHUNK_RELOAD_KEY = "aina_chunk_reload_at";

function isChunkError(msg: string) {
  return (
    msg.includes("Failed to fetch dynamically imported") ||
    msg.includes("ChunkLoadError") ||
    msg.includes("Loading chunk") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module")
  );
}

class TabErrorBoundary extends Component<
  { children: ReactNode; tabName: string },
  { hasError: boolean; error: string; reloading: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: "", reloading: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error) {
    console.error("Tab error:", error);
    if (isChunkError(error.message)) {
      const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
      const now = Date.now();
      if (now - last > 15_000) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
        this.setState({ reloading: true });
        window.location.reload();
      }
    }
  }
  render() {
    if (this.state.reloading) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          <p className="text-sm text-muted-foreground">Memuat versi terbaru...</p>
        </div>
      );
    }
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
            <RefreshCw className="h-7 w-7 text-destructive" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Halaman {this.props.tabName} mengalami error</p>
            <p className="mt-1 text-sm text-muted-foreground">Klik tombol di bawah untuk memuat ulang</p>
            {this.state.error && (
              <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive font-mono break-all">{this.state.error}</p>
            )}
          </div>
          <button
            onClick={() => {
              if (isChunkError(this.state.error)) {
                window.location.reload();
              } else {
                this.setState({ hasError: false, error: "" });
              }
            }}
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
const NewsPage = lazy(() => import("@/components/NewsPage"));
const LibraryPage = lazy(() => import("@/components/LibraryPage"));

interface Chat {
  id: string;
  title: string;
  updated_at: string;
}

const tabTitles: Record<string, string> = {
  chat: "Chat AI",
  productivity: "Productivity",
  berita: "Berita Masisir",
  library: "Library",
  threads: "Threads",
  leaderboard: "Leaderboard",
  contributor: "Contributor",
  profile: "Profile",
  admin: "Admin",
};


const TabLoader = () => (
  <div className="flex h-full items-center justify-center">
    <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
  </div>
);

const VALID_TABS = ["chat", "berita", "productivity", "library", "threads", "leaderboard", "contributor", "profile", "admin"];

const Dashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = VALID_TABS.includes(searchParams.get("tab") ?? "")
    ? searchParams.get("tab")!
    : (VALID_TABS.includes(localStorage.getItem("aina_active_tab") ?? "") ? localStorage.getItem("aina_active_tab")! : "chat");
  const [activeTab, setActiveTab] = useState(initialTab);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarPanelRef  = useRef<HTMLDivElement>(null);
  const sidebarOverlayRef = useRef<HTMLDivElement>(null);
  const sidebarOpenRef   = useRef(sidebarOpen);
  useEffect(() => { sidebarOpenRef.current = sidebarOpen; }, [sidebarOpen]);
  const [showSetup, setShowSetup] = useState(false);
  const [profileInitial, setProfileInitial] = useState<{
    fullName?: string; originCity?: string; faculty?: string;
    studyField?: string; arrivalYear?: string; avatarUrl?: string;
  }>({});

  const [chats, setChats] = useState<Chat[]>([]);
  const [fadingChatIds, setFadingChatIds] = useState<Set<string>>(new Set());
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | undefined>(undefined);
  const [hasMoreChats, setHasMoreChats] = useState(false);
  const [chatOffset, setChatOffset] = useState(0);
  const [showTour, setShowTour] = useState(false);
  const [activeTourSteps, setActiveTourSteps] = useState<TourStep[]>([]);
  const [activeTourKey, setActiveTourKey] = useState<string>("");

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

  const PAGE_SIZE = 25;

  const loadChats = useCallback(async (restoreLast = false) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase
        .from("chats")
        .select("id, title, updated_at")
        .eq("user_id", session.user.id)
        .order("updated_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (error) throw error;
      if (data) {
        setChats(data);
        setChatOffset(data.length);
        setHasMoreChats(data.length === PAGE_SIZE);
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

  const loadMoreChats = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase
        .from("chats")
        .select("id, title, updated_at")
        .eq("user_id", session.user.id)
        .order("updated_at", { ascending: false })
        .range(chatOffset, chatOffset + PAGE_SIZE - 1);
      if (error) throw error;
      if (data) {
        setChats(prev => {
          const existingIds = new Set(prev.map(c => c.id));
          const fresh = data.filter(c => !existingIds.has(c.id));
          return [...prev, ...fresh];
        });
        setChatOffset(prev => prev + data.length);
        setHasMoreChats(data.length === PAGE_SIZE);
      }
    } catch {
      // Silent
    }
  }, [chatOffset]);

  const handleRenameChat = useCallback(async (chatId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, title: trimmed } : c));
    const { error } = await supabase
      .from("chats")
      .update({ title: trimmed })
      .eq("id", chatId);
    if (error) {
      toast.error("Gagal mengubah judul chat");
      // Revert on error
      loadChats(false);
    }
  }, [loadChats]);

  const handleNewChat = useCallback(() => {
    setActiveChatId(null);
    localStorage.removeItem("aina_last_chat_id");
    setActiveTab("chat");
    localStorage.setItem("aina_active_tab", "chat");
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

  // Trigger the per-feature tour for a given tab.
  // `force = true` bypasses the "already seen" check (used by the sidebar button).
  const triggerFeatureTour = useCallback((tab: string, force = false) => {
    const steps = FEATURE_TOURS[tab];
    const key   = FEAT_TOUR_KEYS[tab];
    if (!steps || !key) return;
    if (!force && localStorage.getItem(key)) return; // already seen
    setActiveTourSteps(steps);
    setActiveTourKey(key);
    const delay = tab === "contributor" ? 800 : 600;
    setTimeout(() => setShowTour(true), delay);
  }, []);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    localStorage.setItem("aina_active_tab", tab);
    setSidebarOpen(false);
    triggerFeatureTour(tab);
  }, [triggerFeatureTour]);

  const handleGoContributor = useCallback(() => {
    setActiveTab("contributor");
    localStorage.setItem("aina_active_tab", "contributor");
    setSidebarOpen(false);
    triggerFeatureTour("contributor");
  }, [triggerFeatureTour]);

  // Show the tour for the initial tab on first-ever load (e.g. chat).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { triggerFeatureTour(initialTab); }, []);

  const handleTourComplete = useCallback(() => {
    if (activeTourKey) localStorage.setItem(activeTourKey, "1");
    setShowTour(false);
  }, [activeTourKey]);

  // Sidebar "Panduan Fitur" button — replays the current tab's tour
  const handleStartTour = useCallback(() => {
    triggerFeatureTour(activeTab, true);
  }, [activeTab, triggerFeatureTour]);

  // ── Swipe gesture: swipe right from left edge → open; swipe left → close ──
  useEffect(() => {
    const SIDEBAR_W = 256;
    const EDGE_ZONE = 40;
    const THRESHOLD = 72;

    let startX  = 0, startY = 0;
    let active  = false, decided = false, isHoriz = false;

    const panel   = () => sidebarPanelRef.current;
    const overlay = () => sidebarOverlayRef.current;
    const clamp   = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    function onStart(e: TouchEvent) {
      if (window.innerWidth >= 768) return;
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      active = false; decided = false; isHoriz = false;
      if (!sidebarOpenRef.current && startX > EDGE_ZONE) return;
      active = true;
    }

    function onMove(e: TouchEvent) {
      if (!active) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        isHoriz = Math.abs(dx) > Math.abs(dy);
        decided = true;
        if (!isHoriz) { active = false; return; }
        const p = panel();
        if (p) p.style.transition = "none";
      }
      if (!isHoriz) return;
      e.preventDefault();
      const p = panel(); const o = overlay();
      if (!p) return;
      if (sidebarOpenRef.current) {
        const tx = clamp(dx, -SIDEBAR_W, 0);
        p.style.transform = `translateX(${tx}px)`;
        if (o) o.style.opacity = String(clamp(1 + tx / SIDEBAR_W, 0, 1));
      } else {
        if (dx <= 0) return;
        const tx = clamp(dx - SIDEBAR_W, -SIDEBAR_W, 0);
        p.style.transform = `translateX(${tx}px)`;
        if (o) { o.style.display = "block"; o.style.opacity = String(clamp(dx / SIDEBAR_W, 0, 0.85)); }
      }
    }

    function onEnd(e: TouchEvent) {
      if (!active || !isHoriz) { active = false; return; }
      const dx = e.changedTouches[0].clientX - startX;
      const p = panel(); const o = overlay();
      if (p) { p.style.transition = ""; p.style.transform = ""; }
      if (o) { o.style.opacity = ""; o.style.display = ""; }
      if (!sidebarOpenRef.current && dx > THRESHOLD) setSidebarOpen(true);
      else if (sidebarOpenRef.current && dx < -THRESHOLD) setSidebarOpen(false);
      active = false; decided = false; isHoriz = false;
    }

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove",  onMove,  { passive: false });
    document.addEventListener("touchend",   onEnd,   { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove",  onMove);
      document.removeEventListener("touchend",   onEnd);
    };
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
      {/* Sidebar overlay — always in DOM so swipe-drag can animate opacity */}
      <div
        ref={sidebarOverlayRef}
        className={`fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden transition-opacity duration-300 ${sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setSidebarOpen(false)}
      />

      <div
        ref={sidebarPanelRef}
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
          onRenameChat={handleRenameChat}
          onLoadMoreChats={loadMoreChats}
          hasMoreChats={hasMoreChats}
          onStartTour={handleStartTour}
        />
      </div>

      <main className="flex-1 overflow-hidden min-w-0 flex flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:pb-0">
        <BreakingUpdatesBanner />

        {/* Chat — always mounted, hidden when not active */}
        <div className={activeTab === "chat" ? "flex-1 min-h-0 flex flex-col" : "hidden"}>
          <WelcomeModal onGoContributor={handleGoContributor} onStartTour={handleStartTour} />
          <div className="flex-1 min-h-0">
            <ChatArea
              onMenuClick={() => setSidebarOpen(true)}
              chatId={activeChatId}
              onChatCreated={handleChatCreated}
              onNewChat={handleNewChat}
              initialMessage={pendingMessage}
              onGoContributor={handleGoContributor}
              isAdmin={isAdmin}
            />
          </div>
        </div>

        {/* Non-chat tabs — only the active one is mounted at a time */}
        {activeTab !== "chat" && (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Mobile header */}
            <header
              className="md:hidden shrink-0 border-b border-border bg-background"
              style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
            >
              <div className="flex h-14 items-center gap-3 px-4">
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
              </div>
            </header>

            <div className="flex-1 min-h-0 h-full overflow-hidden" key={activeTab}>
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

              {activeTab === "berita" && (
                <TabErrorBoundary tabName="Berita Masisir">
                  <Suspense fallback={<TabLoader />}>
                    <NewsPage />
                  </Suspense>
                </TabErrorBoundary>
              )}

              {activeTab === "library" && (
                <TabErrorBoundary tabName="Library">
                  <Suspense fallback={<TabLoader />}>
                    <LibraryPage />
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
      <SystemRestartBanner isAdmin={isAdmin} />
      <FeedbackButton />
      {!showSetup && <AnnouncementPopup />}
      {showTour && activeTourSteps.length > 0 && (
        <GuidedTour
          steps={activeTourSteps}
          onComplete={handleTourComplete}
          onSkip={handleTourComplete}
        />
      )}
      <MobileBottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      <PwaSplash />
    </div>
  );
};

export default Dashboard;
