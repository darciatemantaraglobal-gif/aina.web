import { useState, useEffect, useRef } from "react";
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
  Zap,
  SlidersHorizontal,
  UserCircle,
  HelpCircle,
  ChevronRight,
  Check,
  Search,
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
  fadingChatIds?: Set<string>;
  activeChatId?: string | null;
  onNewChat?: () => void;
  onSelectChat?: (chatId: string) => void;
  onDeleteChat?: (chatId: string) => void;
}

const PERSONALIZATION_KEY = "aina_personalization";

export interface AinaPersonalization {
  chatStyle: "santai" | "formal";
  responseLength: "ringkas" | "detail";
  userName: string;
}

export function getPersonalization(): AinaPersonalization {
  try {
    const raw = localStorage.getItem(PERSONALIZATION_KEY);
    if (raw) return JSON.parse(raw) as AinaPersonalization;
  } catch {}
  return { chatStyle: "santai", responseLength: "detail", userName: "" };
}

function savePersonalization(p: AinaPersonalization) {
  localStorage.setItem(PERSONALIZATION_KEY, JSON.stringify(p));
}

const baseNavItems = [
  { id: "chat", label: "Chat AI", icon: MessageSquare },
  { id: "productivity", label: "Productivity", icon: LayoutDashboard },
  { id: "berita", label: "Berita Masisir", icon: Newspaper },
  { id: "threads", label: "Threads", icon: Hash },
  { id: "leaderboard", label: "Leaderboard", icon: Trophy },
  { id: "contributor", label: "Contributor", icon: Users },
];

function AvatarDisplay({ name, avatarUrl, size = "sm" }: { name: string | null; avatarUrl: string | null; size?: "sm" | "md" | "lg" }) {
  const [imgError, setImgError] = useState(false);
  const dim = size === "lg" ? "h-10 w-10" : size === "md" ? "h-9 w-9" : "h-8 w-8";
  const text = size === "lg" ? "text-sm" : "text-xs";
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
    <div className={`${dim} shrink-0 flex items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-purple-500 ${text} font-bold text-white`}>
      {letters}
    </div>
  );
}

/* ─── Personalization Modal ──────────────────────────────────── */
function PersonalizationModal({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = useState<AinaPersonalization>(getPersonalization);

  const save = () => {
    savePersonalization(prefs);
    toast.success("Preferensi disimpan");
    onClose();
  };

  const OptionButton = ({
    active,
    onClick,
    children,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
      }`}
    >
      {active && <Check className="h-3 w-3 shrink-0" />}
      {children}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-start sm:items-center sm:justify-start sm:pl-4" onClick={onClose}>
      <div
        className="relative mb-4 ml-4 w-72 rounded-2xl border border-sidebar-border bg-sidebar p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-sidebar-foreground">Personalisasi AINA</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-sidebar-accent">
            <X className="h-4 w-4 text-sidebar-foreground/50" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Gaya bahasa */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
              Gaya Bahasa AINA
            </p>
            <div className="flex gap-2">
              <OptionButton
                active={prefs.chatStyle === "santai"}
                onClick={() => setPrefs((p) => ({ ...p, chatStyle: "santai" }))}
              >
                Santai
              </OptionButton>
              <OptionButton
                active={prefs.chatStyle === "formal"}
                onClick={() => setPrefs((p) => ({ ...p, chatStyle: "formal" }))}
              >
                Formal
              </OptionButton>
            </div>
          </div>

          {/* Panjang jawaban */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
              Panjang Jawaban
            </p>
            <div className="flex gap-2">
              <OptionButton
                active={prefs.responseLength === "ringkas"}
                onClick={() => setPrefs((p) => ({ ...p, responseLength: "ringkas" }))}
              >
                Ringkas
              </OptionButton>
              <OptionButton
                active={prefs.responseLength === "detail"}
                onClick={() => setPrefs((p) => ({ ...p, responseLength: "detail" }))}
              >
                Detail
              </OptionButton>
            </div>
          </div>

          {/* Nama panggilan */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
              Nama Panggilanmu
            </p>
            <input
              type="text"
              value={prefs.userName}
              onChange={(e) => setPrefs((p) => ({ ...p, userName: e.target.value }))}
              placeholder="Kosongkan jika tidak ingin dipanggil"
              maxLength={30}
              className="w-full rounded-lg border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <button
          onClick={save}
          className="mt-5 w-full rounded-xl bg-primary py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Simpan Preferensi
        </button>
      </div>
    </div>
  );
}

/* ─── Help Modal ─────────────────────────────────────────────── */
function HelpModal({ onClose }: { onClose: () => void }) {
  const faqs = [
    {
      q: "Apa itu AINA?",
      a: "AINA (Asisten Pintar Masisir) adalah asisten AI khusus untuk mahasiswa Indonesia yang belajar di Mesir, membantu menjawab pertanyaan seputar kehidupan, akademik, dan administrasi.",
    },
    {
      q: "Berapa limit chat per hari?",
      a: "Pengguna gratis mendapat 3 chat per hari. Upgrade ke Contributor untuk mendapat hingga 10 chat per hari.",
    },
    {
      q: "Bagaimana cara jadi Contributor?",
      a: "Kamu bisa daftar sebagai Contributor melalui menu Contributor di sidebar. Setelah disetujui admin, kamu mendapat akses lebih banyak.",
    },
    {
      q: "Data saya aman?",
      a: "Ya, semua data disimpan secara aman di database kami dengan autentikasi yang terenkripsi. Kami tidak menjual data pengguna.",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-start sm:items-center sm:justify-start sm:pl-4" onClick={onClose}>
      <div
        className="relative mb-4 ml-4 w-72 max-h-[80vh] overflow-y-auto rounded-2xl border border-sidebar-border bg-sidebar p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-sidebar-foreground">Bantuan</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-sidebar-accent">
            <X className="h-4 w-4 text-sidebar-foreground/50" />
          </button>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-3">
              <p className="mb-1 text-xs font-semibold text-sidebar-foreground">{faq.q}</p>
              <p className="text-[11px] leading-relaxed text-sidebar-foreground/60">{faq.a}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-[10px] text-sidebar-foreground/30">
          AINA v1.0 · Made with ❤️ for Masisir
        </p>
      </div>
    </div>
  );
}

/* ─── Profile Dropdown ───────────────────────────────────────── */
function ProfileDropdown({
  profile,
  userEmail,
  onTabChange,
  onLogout,
  onClose,
}: {
  profile: UserProfile | null;
  userEmail: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [showPersonalization, setShowPersonalization] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const MenuItem = ({
    icon: Icon,
    label,
    sublabel,
    onClick,
    danger,
    hasArrow,
    accent,
  }: {
    icon: React.ElementType;
    label: string;
    sublabel?: string;
    onClick: () => void;
    danger?: boolean;
    hasArrow?: boolean;
    accent?: boolean;
  }) => (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
        danger
          ? "text-destructive hover:bg-destructive/10"
          : accent
          ? "text-primary hover:bg-primary/10"
          : "text-sidebar-foreground hover:bg-sidebar-accent"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-tight ${accent ? "text-primary" : ""}`}>{label}</p>
        {sublabel && <p className="text-[11px] text-sidebar-foreground/50 mt-0.5">{sublabel}</p>}
      </div>
      {hasArrow && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40" />}
    </button>
  );

  if (showPersonalization) {
    return <PersonalizationModal onClose={() => { setShowPersonalization(false); onClose(); }} />;
  }
  if (showHelp) {
    return <HelpModal onClose={() => { setShowHelp(false); onClose(); }} />;
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute bottom-full left-0 right-0 z-50 mb-2 mx-1 rounded-2xl border border-sidebar-border bg-sidebar shadow-2xl overflow-hidden">
        {/* User info header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-sidebar-border">
          <AvatarDisplay name={profile?.full_name ?? null} avatarUrl={profile?.avatar_url ?? null} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">
              {profile?.full_name || "Pengguna"}
            </p>
            <p className="truncate text-[11px] text-sidebar-foreground/50">{userEmail}</p>
          </div>
        </div>

        {/* Menu items */}
        <div className="p-1.5 space-y-0.5">
          <MenuItem
            icon={Zap}
            label="Upgrade Plan"
            sublabel="Jadi Contributor — gratis!"
            accent
            onClick={() => {
              navigate("/pricing");
              onClose();
            }}
          />
          <MenuItem
            icon={SlidersHorizontal}
            label="Personalisasi"
            sublabel="Atur gaya chat AINA"
            onClick={() => setShowPersonalization(true)}
          />
          <MenuItem
            icon={UserCircle}
            label="Profil"
            onClick={() => {
              onTabChange("profile");
              onClose();
            }}
          />
        </div>

        <div className="mx-3 border-t border-sidebar-border" />

        <div className="p-1.5 space-y-0.5">
          <MenuItem
            icon={HelpCircle}
            label="Bantuan"
            hasArrow
            onClick={() => setShowHelp(true)}
          />
        </div>

        <div className="mx-3 border-t border-sidebar-border" />

        <div className="p-1.5">
          <MenuItem
            icon={LogOut}
            label="Logout"
            danger
            onClick={() => {
              onLogout();
              onClose();
            }}
          />
        </div>
      </div>
    </>
  );
}

/* ─── Main Sidebar ───────────────────────────────────────────── */
const DashboardSidebar = ({
  activeTab,
  onTabChange,
  isAdmin = false,
  onClose,
  chats = [],
  fadingChatIds,
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
  const [userEmail, setUserEmail] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  const profileRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      setUserEmail(session.user.email ?? "");
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
    } catch {}
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
      <div className={`safe-top flex shrink-0 items-center border-b border-sidebar-border px-3 min-h-14 ${collapsed ? "justify-center" : "justify-between"}`}>
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
              {/* Search input */}
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-sidebar-foreground/30 pointer-events-none" />
                <input
                  type="text"
                  value={chatSearch}
                  onChange={e => setChatSearch(e.target.value)}
                  placeholder="Cari riwayat..."
                  className="w-full rounded-lg border border-sidebar-border bg-sidebar-accent py-1.5 pl-7 pr-3 text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                {chatSearch && (
                  <button
                    onClick={() => setChatSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-sidebar-foreground/40 hover:text-sidebar-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="space-y-0.5 pb-3">
                {chats
                  .filter(c => !chatSearch || c.title.toLowerCase().includes(chatSearch.toLowerCase()))
                  .map((chat) => (
                  <div
                    key={chat.id}
                    className={`group flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all duration-400 ${
                      fadingChatIds?.has(chat.id)
                        ? "opacity-0 scale-95 pointer-events-none"
                        : activeChatId === chat.id
                          ? "bg-primary/15 text-primary"
                          : "text-sidebar-foreground hover:bg-sidebar-accent"
                    }`}
                    style={fadingChatIds?.has(chat.id) ? { transition: "opacity 0.4s ease, transform 0.4s ease" } : undefined}
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
                {chatSearch && chats.filter(c => c.title.toLowerCase().includes(chatSearch.toLowerCase())).length === 0 && (
                  <p className="py-3 text-center text-xs text-sidebar-foreground/40">Tidak ditemukan</p>
                )}
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

        {/* Profile card — triggers dropdown */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => {
              if (!collapsed) setProfileMenuOpen((o) => !o);
              else onTabChange("profile");
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-sidebar-accent ${
              profileMenuOpen ? "bg-sidebar-accent" : ""
            } ${collapsed ? "justify-center" : ""}`}
            title={collapsed ? "Profil" : "Buka menu profil"}
          >
            <AvatarDisplay name={profile?.full_name ?? null} avatarUrl={profile?.avatar_url ?? null} />
            {!collapsed && (
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium text-sidebar-foreground leading-tight">
                  {profile?.full_name || "Pengguna"}
                </p>
                <p className="text-[11px] text-sidebar-foreground/50 leading-tight mt-0.5">
                  {profile?.level || "User"}
                </p>
              </div>
            )}
          </button>

          {profileMenuOpen && (
            <ProfileDropdown
              profile={profile}
              userEmail={userEmail}
              onTabChange={onTabChange}
              onLogout={handleLogout}
              onClose={() => setProfileMenuOpen(false)}
            />
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
