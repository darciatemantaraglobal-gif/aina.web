import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
  ChevronDown,
  Check,
  Search,
  Compass,
  FileText,
  Settings2,
  Bookmark,
  History,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  RESPONSE_STYLES,
  RESPONSE_STYLE_ORDER,
  DEFAULT_RESPONSE_STYLE,
  type ResponseStyleKey,
} from "@/lib/responseStyles";
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
  onStartTour?: () => void;
}

const PERSONALIZATION_KEY = "aina_personalization";

export interface AinaPersonalization {
  chatStyle: "santai" | "formal";
  responseLength: "ringkas" | "detail";
  responseStyle: ResponseStyleKey;
  userName: string;
}

export function getPersonalization(): AinaPersonalization {
  try {
    const raw = localStorage.getItem(PERSONALIZATION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AinaPersonalization>;
      return {
        chatStyle: parsed.chatStyle ?? "santai",
        responseLength: parsed.responseLength ?? "detail",
        responseStyle: (parsed.responseStyle && parsed.responseStyle in RESPONSE_STYLES)
          ? parsed.responseStyle
          : DEFAULT_RESPONSE_STYLE,
        userName: parsed.userName ?? "",
      };
    }
  } catch {}
  return { chatStyle: "santai", responseLength: "detail", responseStyle: DEFAULT_RESPONSE_STYLE, userName: "" };
}

function savePersonalization(p: AinaPersonalization) {
  localStorage.setItem(PERSONALIZATION_KEY, JSON.stringify(p));
}

const baseNavItems = [
  { id: "chat", label: "Chat AI", icon: MessageSquare },
  { id: "saved", label: "Jawaban Tersimpan", icon: Bookmark },
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
async function apiFetch(path: string, options?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
}

type PrefNavId = "personalisasi" | "instruksi" | "tentang";

interface DropdownOption {
  value: string;
  label: string;
  desc?: string;
}

function SettingsDropdown({
  options,
  value,
  onChange,
}: {
  options: DropdownOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-white/5"
      >
        {selected.label}
        <ChevronDown className={`h-3.5 w-3.5 text-foreground/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#2d2d38] shadow-2xl">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{opt.label}</p>
                {opt.desc && <p className="text-xs text-foreground/50">{opt.desc}</p>}
              </div>
              {value === opt.value && <Check className="h-3.5 w-3.5 shrink-0 text-foreground/70" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsRow({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5 border-b border-white/5 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {desc && <p className="mt-0.5 text-xs leading-relaxed text-foreground/50">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function PersonalizationModal({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs]                           = useState<AinaPersonalization>(getPersonalization);
  const [customAbout, setCustomAbout]               = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [loadingCI, setLoadingCI]                   = useState(true);
  const [saving, setSaving]                         = useState(false);
  const [activeNav, setActiveNav]                   = useState<PrefNavId>("personalisasi");

  useEffect(() => {
    apiFetch("/api/profile/custom-instructions")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setCustomAbout(d.custom_about ?? "");
          setCustomInstructions(d.custom_instructions ?? "");
        }
      })
      .catch(() => {})
      .finally(() => setLoadingCI(false));
  }, []);

  const save = async () => {
    setSaving(true);
    savePersonalization(prefs);
    try {
      await apiFetch("/api/profile/custom-instructions", {
        method: "PATCH",
        body: JSON.stringify({ custom_about: customAbout, custom_instructions: customInstructions }),
      });
      toast.success("Preferensi disimpan");
      onClose();
    } catch {
      toast.error("Gagal menyimpan instruksi personal");
    } finally {
      setSaving(false);
    }
  };

  const chatStyleOptions: DropdownOption[] = [
    { value: "santai", label: "Santai", desc: "Bahasa akrab, seperti ngobrol sama teman" },
    { value: "formal", label: "Formal", desc: "Bahasa resmi dan sopan" },
  ];

  const responseStyleOptions: DropdownOption[] = RESPONSE_STYLE_ORDER.map((k) => ({
    value: k,
    label: RESPONSE_STYLES[k].label,
    desc: RESPONSE_STYLES[k].desc,
  }));

  const navItems: { id: PrefNavId; label: string; icon: React.ElementType; dot?: boolean }[] = [
    { id: "personalisasi", label: "Personalisasi", icon: SlidersHorizontal },
    {
      id: "instruksi",
      label: "Instruksi Personal",
      icon: FileText,
      dot: !loadingCI && (customAbout.trim().length > 0 || customInstructions.trim().length > 0),
    },
    { id: "tentang", label: "Tentang Kamu", icon: UserCircle },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
      <div
        className="relative flex w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#1c1c23] shadow-2xl"
        style={{ maxHeight: "min(85vh, 600px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Left sidebar ── */}
        <div className="flex w-48 shrink-0 flex-col border-r border-white/[0.07] bg-[#16161c] py-4">
          {/* Header */}
          <div className="flex items-center justify-between px-4 pb-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-foreground/30">Pengaturan</span>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-foreground/40 hover:bg-white/5 hover:text-foreground/70 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Nav items */}
          <nav className="flex-1 space-y-0.5 px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    active
                      ? "bg-white/10 font-medium text-foreground"
                      : "text-foreground/50 hover:bg-white/5 hover:text-foreground/80"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {item.dot && (
                    <span className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </nav>
          {/* Save button at bottom */}
          <div className="px-3 pt-4">
            <button
              onClick={save}
              disabled={saving}
              className="w-full rounded-xl bg-primary py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>

        {/* ── Right content ── */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Personalisasi ── */}
          {activeNav === "personalisasi" && (
            <div className="p-7">
              <h2 className="mb-1 text-lg font-semibold text-foreground">Personalisasi</h2>
              <div className="mb-5 h-px bg-white/[0.07]" />

              {/* Gaya dasar */}
              <p className="mb-0.5 text-sm font-semibold text-foreground">Gaya Dasar dan Nada</p>
              <p className="mb-3 text-xs text-foreground/50">Atur gaya dan nada dasar bagaimana AINA merespons kamu.</p>

              <SettingsRow label="Gaya Bahasa">
                <SettingsDropdown
                  options={chatStyleOptions}
                  value={prefs.chatStyle}
                  onChange={(v) => setPrefs((p) => ({ ...p, chatStyle: v as "santai" | "formal" }))}
                />
              </SettingsRow>

              {/* Karakteristik */}
              <div className="mb-3 mt-6">
                <p className="mb-0.5 text-sm font-semibold text-foreground">Karakteristik</p>
                <p className="text-xs text-foreground/50">Pilih kustomisasi tambahan di atas gaya dasar.</p>
              </div>

              <SettingsRow
                label="Format Jawaban"
                desc="Tentukan bagaimana AINA menyusun setiap respons."
              >
                <SettingsDropdown
                  options={responseStyleOptions}
                  value={prefs.responseStyle}
                  onChange={(v) => setPrefs((p) => ({ ...p, responseStyle: v as ResponseStyleKey }))}
                />
              </SettingsRow>
            </div>
          )}

          {/* ── Instruksi Personal ── */}
          {activeNav === "instruksi" && (
            <div className="p-7">
              <h2 className="mb-1 text-lg font-semibold text-foreground">Instruksi Personal</h2>
              <div className="mb-5 h-px bg-white/[0.07]" />
              <p className="mb-6 text-xs leading-relaxed text-foreground/50">
                Beri tahu AINA instruksi khusus yang berlaku di setiap sesi — cara merespons, hal yang perlu dihindari, atau preferensi lainnya.
              </p>

              {loadingCI ? (
                <div className="flex items-center justify-center py-10">
                  <p className="text-sm text-foreground/30">Memuat instruksi tersimpan...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">Instruksi tambahan</p>
                      <span className={`text-xs ${customInstructions.length > 450 ? "text-orange-400" : "text-foreground/30"}`}>
                        {customInstructions.length}/500
                      </span>
                    </div>
                    <textarea
                      value={customInstructions}
                      onChange={(e) => setCustomInstructions(e.target.value.slice(0, 500))}
                      placeholder="Contoh: Selalu kasih contoh praktis. Kalau ada istilah Arab, tolong terjemahkan. Jawab dengan poin-poin."
                      rows={5}
                      className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-foreground placeholder:text-foreground/25 focus:border-white/20 focus:outline-none focus:ring-0"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Tentang Kamu ── */}
          {activeNav === "tentang" && (
            <div className="p-7">
              <h2 className="mb-1 text-lg font-semibold text-foreground">Tentang Kamu</h2>
              <div className="mb-5 h-px bg-white/[0.07]" />

              <p className="mb-6 text-xs leading-relaxed text-foreground/50">
                Informasi ini membantu AINA memahami konteksmu — jurusan, angkatan, dan latar belakangmu — supaya jawaban lebih relevan.
              </p>

              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">Nama Panggilan</p>
                  </div>
                  <input
                    type="text"
                    value={prefs.userName}
                    onChange={(e) => setPrefs((p) => ({ ...p, userName: e.target.value }))}
                    placeholder="Nama yang kamu mau AINA pakai (opsional)"
                    maxLength={30}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-foreground placeholder:text-foreground/25 focus:border-white/20 focus:outline-none focus:ring-0"
                  />
                </div>

                {!loadingCI && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">Tentang dirimu</p>
                      <span className={`text-xs ${customAbout.length > 450 ? "text-orange-400" : "text-foreground/30"}`}>
                        {customAbout.length}/500
                      </span>
                    </div>
                    <textarea
                      value={customAbout}
                      onChange={(e) => setCustomAbout(e.target.value.slice(0, 500))}
                      placeholder="Contoh: Saya mahasiswa semester 3 jurusan Syariah di Al-Azhar, baru 1 tahun di Mesir, asal dari Jawa Tengah."
                      rows={5}
                      className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-foreground placeholder:text-foreground/25 focus:border-white/20 focus:outline-none focus:ring-0"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xs max-h-[80vh] overflow-y-auto rounded-2xl border border-sidebar-border bg-sidebar p-5 shadow-2xl"
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
    return createPortal(
      <PersonalizationModal onClose={() => { setShowPersonalization(false); onClose(); }} />,
      document.body
    );
  }
  if (showHelp) {
    return createPortal(
      <HelpModal onClose={() => { setShowHelp(false); onClose(); }} />,
      document.body
    );
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
              onTabChange("contributor");
              onClose?.();
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

/* ─── Chat History Popup ─────────────────────────────────────── */
function ChatHistoryPopup({
  open, onClose, chats, activeChatId, fadingChatIds, onSelectChat, onDeleteChat,
}: {
  open: boolean;
  onClose: () => void;
  chats: Chat[];
  activeChatId?: string | null;
  fadingChatIds?: Set<string>;
  onSelectChat?: (id: string) => void;
  onDeleteChat?: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = chats.filter(c =>
    !search || c.title.toLowerCase().includes(search.toLowerCase())
  );

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-card border border-border shadow-2xl flex flex-col"
        style={{ maxHeight: "80vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm text-foreground">Riwayat Chat</span>
            <span className="text-[11px] text-muted-foreground bg-secondary rounded-full px-2 py-0.5">{chats.length}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2.5 shrink-0 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari riwayat..."
              className="w-full rounded-lg border border-border bg-secondary py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 py-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center opacity-40">
              <MessageCircle className="h-6 w-6 mb-2 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                {search ? "Tidak ditemukan" : "Belum ada riwayat chat"}
              </p>
            </div>
          ) : (
            filtered.map(chat => (
              <div
                key={chat.id}
                className={`group flex items-center gap-2 px-3 py-2 mx-2 rounded-xl transition-all duration-300 ${
                  fadingChatIds?.has(chat.id)
                    ? "opacity-0 scale-95 pointer-events-none"
                    : activeChatId === chat.id
                      ? "bg-primary/15 text-primary"
                      : "text-foreground hover:bg-secondary"
                }`}
                style={fadingChatIds?.has(chat.id) ? { transition: "opacity 0.4s ease, transform 0.4s ease" } : undefined}
              >
                <button
                  onClick={() => { onSelectChat?.(chat.id); onClose(); }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <MessageCircle className="h-3.5 w-3.5 shrink-0 opacity-40" />
                  <span className="truncate text-sm">{chat.title}</span>
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onDeleteChat?.(chat.id); }}
                  className="shrink-0 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                  title="Hapus chat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
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
  onStartTour,
}: DashboardSidebarProps) => {
  const navItems = isAdmin
    ? [...baseNavItems, { id: "admin", label: "Admin", icon: Shield }]
    : baseNavItems;

  const [collapsed, setCollapsed] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [showHistoryPopup, setShowHistoryPopup] = useState(false);
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
            <img src="/aina-icon.png" alt="AINA" className="h-5 w-5 object-contain" />
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

        <button
          onClick={() => setShowHistoryPopup(true)}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors text-sidebar-foreground hover:bg-sidebar-accent ${
            collapsed ? "justify-center" : ""
          }`}
          title="Riwayat Chat"
        >
          <History className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <span className="flex flex-1 items-center justify-between">
              Riwayat Chat
              {chats.length > 0 && (
                <span className="text-[10px] bg-secondary text-muted-foreground rounded-full px-1.5 py-0.5 leading-none">
                  {chats.length}
                </span>
              )}
            </span>
          )}
        </button>

        {navItems.map((item) => (
          <button
            key={item.id}
            data-tour={`nav-${item.id}`}
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

      {/* ── Middle: flex spacer ──────────────────────────── */}
      <div className="flex-1" />

      {/* ── Bottom: Notifications + Home + Profile ───────── */}
      <div className="shrink-0 border-t border-sidebar-border px-3 pt-2 pb-3 space-y-0.5">
        <NotificationBell collapsed={collapsed} />

        {onStartTour && (
          <button
            onClick={onStartTour}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground ${
              collapsed ? "justify-center" : ""
            }`}
            title="Panduan Fitur"
          >
            <Compass className="h-4 w-4 shrink-0" />
            {!collapsed && "Panduan Fitur"}
          </button>
        )}

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

      {/* ── Chat History Popup ────────────────────────────── */}
      <ChatHistoryPopup
        open={showHistoryPopup}
        onClose={() => setShowHistoryPopup(false)}
        chats={chats}
        activeChatId={activeChatId}
        fadingChatIds={fadingChatIds}
        onSelectChat={onSelectChat}
        onDeleteChat={onDeleteChat}
      />
    </aside>
  );
};

export default DashboardSidebar;
