import { useState, useRef, useEffect, useCallback } from "react";
import { Send, AlertCircle, Menu, Plus, Zap, Crown, BookOpen, X, Flag, Check, Paperclip, FileText, ImageIcon, Copy, ThumbsUp, ThumbsDown, BookMarked, Mic, MicOff, Globe, TrendingUp, ShieldCheck, Bookmark, BookmarkCheck, MapPin } from "lucide-react";
import { RESPONSE_STYLES, RESPONSE_STYLE_ORDER, type ResponseStyleKey } from "@/lib/responseStyles";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getPersonalization } from "@/components/DashboardSidebar";

interface SourceMetadata {
  confidence: "verified" | "community_based" | "web_result" | "fallback";
  primary_source: string;
  may_be_outdated: boolean;
  source_summary: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  imageDataUrl?: string;
  fileName?: string;
  intent?: string;
  confidence?: string;
  sources?: string[];
  sourceMetadata?: SourceMetadata;
}

interface AttachedFile {
  type: "image" | "pdf";
  dataUrl?: string;
  text?: string;
  name: string;
  sizeKb: number;
}

interface ChatAreaProps {
  onMenuClick?: () => void;
  chatId: string | null;
  onChatCreated: (chatId: string, title: string) => void;
  onNewChat?: () => void;
  initialMessage?: string;
  onGoContributor?: () => void;
}

const API_URL = "/api/chat";

const SUGGESTION_CATEGORIES = [
  { id: "semua", label: "Semua" },
  { id: "akademik", label: "Akademik" },
  { id: "dokumen", label: "Dokumen" },
  { id: "keuangan", label: "Keuangan" },
  { id: "kehidupan", label: "Kehidupan" },
];

const ALL_SUGGESTIONS = [
  { text: "Bagaimana cara daftar kuliah di Al-Azhar?", cat: "akademik" },
  { text: "Apa saja fakultas di Al-Azhar University?", cat: "akademik" },
  { text: "Jadwal semester dan ujian di Al-Azhar", cat: "akademik" },
  { text: "Tips lulus ujian lebih cepat di Mesir", cat: "akademik" },
  { text: "Cara mengurus visa pelajar Mesir", cat: "dokumen" },
  { text: "Cara perpanjang iqomah di Mesir", cat: "dokumen" },
  { text: "Prosedur legalisasi dokumen di Mesir", cat: "dokumen" },
  { text: "Apa itu KITAS dan bagaimana cara membuatnya?", cat: "dokumen" },
  { text: "Biaya hidup di Kairo untuk mahasiswa", cat: "keuangan" },
  { text: "Cara kirim uang dari Indonesia ke Mesir", cat: "keuangan" },
  { text: "Estimasi biaya kos dan makan per bulan", cat: "keuangan" },
  { text: "Berapa kurs Pound Mesir vs Rupiah?", cat: "keuangan" },
  { text: "Tips mencari tempat tinggal di Kairo", cat: "kehidupan" },
  { text: "Makanan halal dan warung Indonesia di Kairo", cat: "kehidupan" },
  { text: "Transportasi umum di Kairo", cat: "kehidupan" },
  { text: "Tempat wisata wajib dikunjungi di Mesir", cat: "kehidupan" },
];

const AinaLogo = ({ className }: { className?: string }) => (
  <img src="/aina-icon.png" alt="AINA" className={className} />
);

function cleanMarkdown(text: string): string {
  return text
    // Strip "Sumber: ..." lines — already rendered as small styled badges below the message
    .replace(/^\*{0,2}sumber\*{0,2}[\s:*]+.+$/gim, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?p>/gi, "\n")
    .replace(/<\/?b>/gi, "**")
    .replace(/<\/?strong>/gi, "**")
    .replace(/<\/?i>/gi, "_")
    .replace(/<\/?em>/gi, "_")
    .replace(/<\/?ul>/gi, "")
    .replace(/<\/?ol>/gi, "")
    .replace(/<li>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractSources(content: string): string[] {
  const results: string[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const m = line.match(/\*{0,2}sumber\*{0,2}[\s:*]+(.+)/i);
    if (m) {
      const src = m[1].replace(/\*+/g, "").replace(/^\[|\]$/g, "").trim();
      if (src && src.length < 120) results.push(src);
    }
  }
  return results;
}

/* ── Source badge config map ─────────────────────────────────────────────── */

type SourceConfig = {
  icon: React.ElementType;
  label: string;
  className: string;
};

function getSourceConfig(src: string): SourceConfig {
  const s = src.toLowerCase();
  if (s.includes("breaking") || s.includes("update resmi"))
    return { icon: Zap,          label: src, className: "border-amber-500/30 bg-amber-500/10 text-amber-500 dark:text-amber-400" };
  if (s.includes("knowledge base"))
    return { icon: BookOpen,     label: src, className: "border-primary/30 bg-primary/10 text-primary" };
  if (s.includes("kurs") || s.includes("real-time") || s.includes("exchange"))
    return { icon: TrendingUp,   label: src, className: "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400" };
  if (s.includes("dorar"))
    return { icon: BookMarked,   label: src, className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
  if (s.includes("pencarian web") || s.includes("perplexity"))
    return { icon: Globe,        label: src, className: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400" };
  if (s.includes("wikipedia"))
    return { icon: Globe,        label: src, className: "border-slate-400/30 bg-slate-400/10 text-slate-500 dark:text-slate-400" };
  if (s.includes("duckduckgo"))
    return { icon: Globe,        label: src, className: "border-orange-500/30 bg-orange-500/10 text-orange-500 dark:text-orange-400" };
  if (s.includes("pengetahuan umum") || s.includes("model"))
    return { icon: AlertCircle,  label: src, className: "border-zinc-400/30 bg-zinc-400/10 text-zinc-500 dark:text-zinc-400" };
  return { icon: BookMarked,     label: src, className: "border-primary/20 bg-primary/5 text-primary/70" };
}

/* ── Confidence badge config ─────────────────────────────────────────────── */

function getConfidenceBadgeConfig(confidence: string | undefined) {
  switch (confidence) {
    case "verified":
      return { label: "Terverifikasi", icon: ShieldCheck, className: "text-green-600 dark:text-green-500" };
    case "web_result":
      return { label: "Dari Web", icon: Globe, className: "text-blue-500 dark:text-blue-400" };
    case "community_based":
      return { label: "Komunitas", icon: BookOpen, className: "text-primary" };
    case "fallback":
      return { label: "Perlu Verifikasi", icon: AlertCircle, className: "text-amber-500" };
    default:
      return null;
  }
}

const FEEDBACK_STORE_KEY = "aina_msg_feedback";
function loadStoredFeedback(): Record<string, "up" | "down"> {
  try { return JSON.parse(localStorage.getItem(FEEDBACK_STORE_KEY) ?? "{}"); } catch { return {}; }
}

const DAILY_LIMIT = 3;
const REMARK_PLUGINS = [remarkGfm];

const MD_COMPONENTS = {
  br: () => <br />,
  p: ({ children }: any) => (
    <p className="mb-4 last:mb-0 break-words leading-7 text-foreground/90">{children}</p>
  ),
  strong: ({ children }: any) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }: any) => (
    <em className="italic text-foreground/80">{children}</em>
  ),
  ul: ({ children }: any) => (
    <ul className="mb-4 last:mb-0 ml-5 list-disc space-y-2 text-foreground/90">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="mb-4 last:mb-0 ml-5 list-decimal space-y-2 text-foreground/90">{children}</ol>
  ),
  li: ({ children }: any) => (
    <li className="leading-7 break-words pl-1">{children}</li>
  ),
  h1: ({ children }: any) => (
    <h1 className="mb-3 mt-6 first:mt-0 text-xl font-bold text-foreground tracking-tight">{children}</h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="mb-2 mt-5 first:mt-0 text-base font-bold text-foreground tracking-tight">{children}</h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="mb-2 mt-4 first:mt-0 text-sm font-semibold text-foreground">{children}</h3>
  ),
  code: ({ children, className }: any) => {
    if (className?.includes("language-")) return <code className={className}>{children}</code>;
    return (
      <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px] text-primary/90 break-all">{children}</code>
    );
  },
  pre: ({ children }: any) => (
    <div className="mb-4 overflow-x-auto rounded-xl bg-muted border border-border">
      <pre className="p-4 font-mono text-sm text-foreground leading-relaxed">{children}</pre>
    </div>
  ),
  blockquote: ({ children }: any) => {
    // Detect if the blockquote contains Arabic text
    function extractText(node: any): string {
      if (typeof node === "string") return node;
      if (Array.isArray(node)) return node.map(extractText).join("");
      if (node?.props?.children) return extractText(node.props.children);
      return "";
    }
    const text = extractText(children);
    const isArabic = /[\u0600-\u06FF]/.test(text);

    if (isArabic) {
      return (
        <blockquote
          dir="rtl"
          className="my-4 rounded-xl border border-emerald-500/20 bg-emerald-950/30 px-6 py-4 text-right text-foreground"
          style={{ fontFamily: "'Amiri', serif", fontSize: "1.25rem", lineHeight: "2.2" }}
        >
          {children}
        </blockquote>
      );
    }
    return (
      <blockquote className="mb-4 border-l-[3px] border-primary/40 pl-4 text-foreground/70 italic">{children}</blockquote>
    );
  },
  hr: () => <hr className="my-5 border-border/60" />,
  a: ({ href, children }: any) => {
    const isGoogleMaps = href && (
      href.includes("google.com/maps") ||
      href.includes("maps.google.com") ||
      href.includes("goo.gl/maps")
    );
    if (isGoogleMaps) {
      const label = typeof children === "string"
        ? children.replace(/^📍\s*/, "").trim()
        : "Lihat di Maps";
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 my-1 px-3 py-2 rounded-lg border border-green-500/30 bg-green-500/8 hover:bg-green-500/15 transition-colors text-green-600 dark:text-green-400 text-sm font-medium no-underline"
        >
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>{label}</span>
          <span className="text-xs text-green-500/70 ml-1">↗ Google Maps</span>
        </a>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors break-all"
      >
        {children}
      </a>
    );
  },
  table: ({ children }: any) => (
    <div className="mb-4 overflow-x-auto rounded-xl border border-border">
      <table className="min-w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => <thead className="bg-muted/50">{children}</thead>,
  tbody: ({ children }: any) => <tbody className="divide-y divide-border">{children}</tbody>,
  tr: ({ children }: any) => <tr className="hover:bg-muted/20 transition-colors">{children}</tr>,
  th: ({ children }: any) => (
    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{children}</th>
  ),
  td: ({ children }: any) => (
    <td className="px-4 py-2.5 text-foreground/90">{children}</td>
  ),
};

interface StreamingMsg {
  id: string;
  full: string;
  displayed: string;
  intent?: string;
  confidence?: string;
  sources?: string[];
  sourceMetadata?: SourceMetadata;
}

const STREAM_CHARS_PER_TICK = 6;
const STREAM_INTERVAL_MS = 16;

const ChatArea = ({ onMenuClick, chatId, onChatCreated, onNewChat, initialMessage, onGoContributor }: ChatAreaProps) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [dailyCount, setDailyCount] = useState<number | null>(null);
  const [isPaidUser, setIsPaidUser] = useState(false);
  const [userProfile, setUserProfile] = useState<Record<string, any> | null>(null);
  const [reportingMsgId, setReportingMsgId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<string>("");
  const [reportNote, setReportNote] = useState<string>("");
  const [reportedMsgIds, setReportedMsgIds] = useState<Set<string>>(new Set());
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [revisedAnswer, setRevisedAnswer] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [streamingMsg, setStreamingMsg] = useState<StreamingMsg | null>(null);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, "up" | "down">>(loadStoredFeedback);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [currentStyle, setCurrentStyle] = useState<ResponseStyleKey>(() => getPersonalization().responseStyle ?? "step_by_step");
  const [suggestionCat, setSuggestionCat] = useState("semua");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeChatIdRef = useRef<string | null>(chatId);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, streamingMsg?.displayed, scrollToBottom]);

  // Load saved answer IDs so bookmark buttons can show the right state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) return;
      fetch("/api/saved-answers", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then(r => r.ok ? r.json() : [])
        .then((data: any[]) => {
          if (Array.isArray(data)) setSavedIds(new Set(data.map(s => s.message_id)));
        })
        .catch(() => {});
    });
  }, []);

  const toggleSave = async (msgId: string, content: string, sources?: string[], meta?: SourceMetadata) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const isSaved = savedIds.has(msgId);
    setSavedIds(prev => { const n = new Set(prev); isSaved ? n.delete(msgId) : n.add(msgId); return n; });

    if (isSaved) {
      fetch(`/api/saved-answers/${msgId}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {});
    } else {
      fetch("/api/saved-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ message_id: msgId, content, sources, source_summary: meta?.source_summary ?? null }),
      }).catch(() => {});
      // Also log as "saved" in answer_feedback for admin analytics
      fetch(`/api/messages/${msgId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ feedback_type: "saved", sources }),
      }).catch(() => {});
    }
  };

  /* ── Typewriter animation ── */
  useEffect(() => {
    if (!streamingMsg) return;
    if (streamingMsg.displayed.length >= streamingMsg.full.length) {
      setMessages(prev => [...prev, {
        id: streamingMsg.id,
        role: "assistant",
        content: streamingMsg.full,
        timestamp: new Date(),
        intent:         streamingMsg.intent,
        confidence:     streamingMsg.confidence,
        sources:        streamingMsg.sources,
        sourceMetadata: streamingMsg.sourceMetadata,
      }]);
      setStreamingMsg(null);
      return;
    }
    const timer = setTimeout(() => {
      setStreamingMsg(prev => {
        if (!prev) return null;
        const nextLen = Math.min(prev.displayed.length + STREAM_CHARS_PER_TICK, prev.full.length);
        return { ...prev, displayed: prev.full.slice(0, nextLen) };
      });
    }, STREAM_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [streamingMsg]);

  useEffect(() => {
    activeChatIdRef.current = chatId;
    // Don't reset while a send is in-flight (e.g. new chat just created mid-send)
    if (isLoading) return;
    setMessages([]);
    setStreamingMsg(null);
    setError(null);
    setInput("");
    if (chatId) {
      loadMessages(chatId);
    }
  }, [chatId]); // eslint-disable-line react-hooks/exhaustive-deps

  const initialMessageFired = useRef(false);
  useEffect(() => {
    if (initialMessage && !initialMessageFired.current) {
      initialMessageFired.current = true;
      const timer = setTimeout(() => handleSend(initialMessage), 300);
      return () => clearTimeout(timer);
    }
  }, [initialMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch daily chat count, paid status, and user profile on mount
  useEffect(() => {
    const fetchDailyUsage = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const userId = session.user.id;

      // Parallel: fetch roles and profile
      const [rolesRes, profileRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("profiles").select("*").eq("user_id", userId).single(),
      ]);

      const paid = rolesRes.data?.some(r =>
        ["contributor", "senior_contributor", "admin"].includes(r.role)
      ) ?? false;
      setIsPaidUser(paid);

      if (profileRes.data) {
        setUserProfile(profileRes.data);
      }

      if (!paid) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("role", "user")
          .gte("created_at", todayStart.toISOString());
        setDailyCount(count ?? 0);
        if ((count ?? 0) >= DAILY_LIMIT) setLimitReached(true);
      }
    };
    fetchDailyUsage();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMessages = async (id: string) => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (data) {
        setMessages(
          data.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: new Date(m.created_at),
          }))
        );
      }
    } catch (err: any) {
      setError("Gagal memuat riwayat chat. Coba refresh halaman.");
    } finally {
      setLoadingHistory(false);
    }
  };

  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  };

  const toggleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Browser kamu tidak mendukung input suara. Coba Chrome atau Edge.");
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = "id-ID";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onstart = () => setIsListening(true);
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput(prev => (prev ? prev + " " + transcript : transcript));
      setTimeout(autoResize, 50);
    };
    rec.onerror = () => {
      setIsListening(false);
      toast.error("Gagal mendengarkan suara. Coba lagi.");
    };
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
  };

  const submitReport = async (msgId: string, msgContent: string) => {
    if (!reportReason.trim() || submittingReport) return;
    setSubmittingReport(true);
    // Find the user message that immediately preceded the reported AI message
    const msgIndex = messages.findIndex(m => m.id === msgId);
    const precedingUserMsg = msgIndex > 0
      ? [...messages].slice(0, msgIndex).reverse().find(m => m.role === "user")
      : null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/report-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          message_id: msgId,
          message_content: msgContent,
          user_question: precedingUserMsg?.content ?? null,
          reason: reportReason,
          additional_note: reportNote.trim() || null,
          revised_answer: revisedAnswer.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Gagal mengirim laporan" }));
        throw new Error(err.error || "Gagal mengirim laporan");
      }
      const result = await res.json().catch(() => ({}));
      setReportedMsgIds(prev => new Set(prev).add(msgId));
      setReportingMsgId(null);
      setReportReason("");
      setReportNote("");
      setRevisedAnswer("");
      toast.success(result.has_revision
        ? "Laporan terkirim! Revisi kamu akan ditinjau admin sebelum masuk KB."
        : "Laporan berhasil dikirim");
    } catch (e: any) {
      toast.error(e.message || "Gagal mengirim laporan, coba lagi");
    } finally {
      setSubmittingReport(false);
    }
  };

  const submitFeedback = (msgId: string, vote: "up" | "down") => {
    setFeedbackMap(prev => {
      const next = { ...prev };
      const isToggleOff = prev[msgId] === vote;
      if (isToggleOff) {
        delete next[msgId];
      } else {
        next[msgId] = vote;
      }
      localStorage.setItem(FEEDBACK_STORE_KEY, JSON.stringify(next));

      // Fire-and-forget: send rating signals to backend
      if (!isToggleOff) {
        const msg = messages.find(m => m.id === msgId);
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session?.access_token) return;
          const token = session.access_token;
          // 1. Anonymized intel aggregate (for AI improvement analytics)
          fetch("/api/chat/rate", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              rating:     vote === "up" ? 1 : -1,
              intent:     msg?.intent     ?? null,
              confidence: msg?.confidence ?? null,
              messageTs:  msg?.timestamp?.getTime() ?? Date.now(),
            }),
          }).catch(() => {});
          // 2. Identified signal — thumbs up only (admin can see who found it helpful)
          if (vote === "up") {
            fetch(`/api/messages/${msgId}/feedback`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                feedback_type: "helpful",
                intent:        msg?.intent     ?? null,
                confidence:    msg?.confidence ?? null,
                sources:       msg?.sources    ?? null,
              }),
            }).catch(() => {});
          }
        });
      }

      return next;
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!e.target) return;
    (e.target as HTMLInputElement).value = "";
    if (!file) return;

    const sizeKb = Math.round(file.size / 1024);
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf" || file.type === "text/plain";

    if (!isImage && !isPdf) {
      toast.error("Format tidak didukung. Gunakan gambar (JPG/PNG/WebP) atau PDF/TXT.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File terlalu besar. Maksimal 10 MB.");
      return;
    }

    if (isImage) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setAttachedFile({ type: "image", dataUrl, name: file.name, sizeKb });
      };
      reader.readAsDataURL(file);
    } else {
      setIsUploadingFile(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const authHeaders = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} as Record<string, string>;

        // Step 1: Get a presigned upload URL (small JSON request, no size limit issue)
        const urlRes = await fetch("/api/chat/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ filename: file.name }),
        });
        const urlJson = await urlRes.json().catch(() => ({ error: "Gagal mendapatkan URL upload" }));
        if (!urlRes.ok) throw new Error(urlJson.error || "Gagal mendapatkan URL upload");

        // Step 2: Upload file DIRECTLY to Supabase Storage (bypasses all proxy size limits)
        const uploadRes = await fetch(urlJson.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!uploadRes.ok) throw new Error(`Gagal mengupload file (${uploadRes.status}). Coba lagi.`);

        // Step 3: Server extracts text from Storage and returns it
        const extractRes = await fetch("/api/extract-from-storage", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ path: urlJson.path, filename: file.name }),
        });
        const data = await extractRes.json().catch(() => ({ error: `Gagal mengekstrak file (${extractRes.status})` }));
        if (!extractRes.ok) throw new Error(data.error || "Gagal membaca file");

        setAttachedFile({ type: "pdf", text: data.text, name: data.filename, sizeKb });
        toast.success(`File berhasil dibaca (${data.chars.toLocaleString()} karakter)`);
      } catch (e: any) {
        toast.error(e.message || "Gagal mengupload file");
      } finally {
        setIsUploadingFile(false);
      }
    }
  };

  const handleSend = async (text?: string) => {
    const userText = (text ?? input).trim();
    if ((!userText && !attachedFile) || isLoading) return;

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    // Block immediately if we already know the limit is reached
    if (!isPaidUser && limitReached) return;

    const fileToSend = attachedFile;
    setInput("");
    setAttachedFile(null);
    setError(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userText || (fileToSend?.type === "pdf" ? `[PDF: ${fileToSend.name}]` : ""),
      timestamp: new Date(),
      ...(fileToSend?.type === "image" ? { imageDataUrl: fileToSend.dataUrl, fileName: fileToSend.name } : {}),
      ...(fileToSend?.type === "pdf" ? { fileName: fileToSend.name } : {}),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    let currentChatId = activeChatIdRef.current;

    try {
      if (!currentChatId) {
        const title = userText.length > 50 ? userText.slice(0, 50).trim() + "…" : userText;
        const { data: newChat, error: chatError } = await supabase
          .from("chats")
          .insert({ user_id: userId, title })
          .select()
          .single();
        if (chatError || !newChat) throw new Error("Gagal membuat chat baru");
        currentChatId = newChat.id;
        activeChatIdRef.current = currentChatId;
        onChatCreated(newChat.id, newChat.title);
      }

      const allMessages = [...messages, userMsg];
      const history = allMessages.map((m) => ({ role: m.role, content: m.content }));

      // Build attached file payload for the API (image as dataUrl or PDF as extracted text)
      const attachedFilePayload = fileToSend
        ? fileToSend.type === "image"
          ? { type: "image", dataUrl: fileToSend.dataUrl, name: fileToSend.name }
          : { type: "pdf", text: fileToSend.text, name: fileToSend.name }
        : undefined;

      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 120000);
      let res: Response;
      try {
        res = await fetch(API_URL, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({
            messages: history,
            userProfile: { ...userProfile, ...getPersonalization() },
            ...(attachedFilePayload ? { attachedFile: attachedFilePayload } : {}),
          }),
        });
      } catch (fetchErr: any) {
        if (fetchErr.name === "AbortError") {
          throw new Error("Koneksi timeout. AI sedang sibuk, coba lagi dalam beberapa detik.");
        }
        throw new Error("Gagal terhubung ke server. Periksa koneksi internetmu.");
      } finally {
        clearTimeout(fetchTimeout);
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 429 && errData.limitReached) {
          setLimitReached(true);
          setDailyCount(DAILY_LIMIT);
          return;
        }
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      const fullContent = cleanMarkdown(data.reply);
      const msgId = (Date.now() + 1).toString();

      // Save user message to DB only after server confirms success
      await supabase.from("messages").insert({
        chat_id: currentChatId,
        user_id: userId,
        role: "user",
        content: userText,
      });

      // Increment daily count
      setDailyCount(prev => {
        const next = (prev ?? 0) + 1;
        if (!isPaidUser && next >= DAILY_LIMIT) setLimitReached(true);
        return next;
      });

      // Save assistant reply to DB
      await supabase.from("messages").insert({
        chat_id: currentChatId,
        user_id: userId,
        role: "assistant",
        content: data.reply,
      });

      // Start typewriter animation (carry intent, confidence, sources, and sourceMetadata for badge rendering)
      setStreamingMsg({ id: msgId, full: fullContent, displayed: "", intent: data.intent, confidence: data.confidence, sources: data.sources ?? [], sourceMetadata: data.sourceMetadata ?? undefined });

      await supabase
        .from("chats")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", currentChatId);
    } catch (err: any) {
      setError(err.message || "Gagal menghubungi server. Coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend();
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Mobile top header */}
      <header className="safe-top flex items-center justify-between border-b border-border px-4 md:hidden shrink-0 min-h-14">
        <button
          onClick={onMenuClick}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <AinaLogo className="h-7 w-7 object-contain" />
          <span className="font-display text-base font-bold text-foreground">AINA</span>
        </div>

        <button
          onClick={onNewChat}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Plus className="h-5 w-5" />
        </button>
      </header>

      {/* Messages area or empty state */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {loadingHistory ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          </div>
        ) : isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center px-4 pb-4">
            <AinaLogo className="mb-5 h-14 w-14 object-contain drop-shadow-[0_0_18px_rgba(139,92,246,0.85)]" />
            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">Halo! Saya AINA</h1>
            <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
              Asisten AI khusus mahasiswa Indonesia di Mesir. Tanya apa saja tentang kehidupan di Kairo!
            </p>

            <div className="mt-6 sm:mt-8 w-full max-w-lg">
              {/* Category filter tabs */}
              <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                {SUGGESTION_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSuggestionCat(cat.id)}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      suggestionCat === cat.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              {/* Suggestion buttons */}
              <div className="grid grid-cols-2 gap-2">
                {ALL_SUGGESTIONS
                  .filter(s => suggestionCat === "semua" || s.cat === suggestionCat)
                  .slice(0, 6)
                  .map((s) => (
                    <button
                      key={s.text}
                      onClick={() => {
                        setInput(s.text);
                        setTimeout(() => {
                          textareaRef.current?.focus();
                          autoResize();
                        }, 0);
                      }}
                      className="rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-all hover:border-primary/40 hover:bg-secondary hover:text-foreground"
                    >
                      {s.text}
                    </button>
                  ))
                }
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 md:px-6">
            {messages.map((msg, msgIdx) => {
              const isLastAI = msg.role === "assistant" && msgIdx === messages.length - 1 && !isLoading && !streamingMsg;
              return (
              <div
                key={msg.id}
                className={`flex gap-3 min-w-0 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <AinaLogo className="mt-1 h-7 w-7 shrink-0 object-contain" />
                )}

                {msg.role === "user" ? (
                  <div className="max-w-[85%] space-y-2">
                    {msg.imageDataUrl && (
                      <img
                        src={msg.imageDataUrl}
                        alt={msg.fileName ?? "Gambar"}
                        className="rounded-2xl max-h-72 object-contain border border-border"
                      />
                    )}
                    {msg.fileName && !msg.imageDataUrl && (
                      <div className="flex items-center gap-2 rounded-2xl border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground">
                        <FileText className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate max-w-[220px]">{msg.fileName}</span>
                      </div>
                    )}
                    {msg.content && (
                      <div className="rounded-3xl bg-secondary px-5 py-3.5 text-base text-foreground whitespace-pre-wrap break-words">
                        {msg.content}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="min-w-0 flex-1 min-h-0">
                    <div className="py-1" dir="auto">
                      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
                        {cleanMarkdown(msg.content)}
                      </ReactMarkdown>
                    </div>

                    {/* Source badges + confidence badge + freshness warning */}
                    {(() => {
                      if (msg.intent === "casual") return null;
                      const sources = msg.sources?.length ? msg.sources : extractSources(msg.content);
                      const confCfg = getConfidenceBadgeConfig(msg.sourceMetadata?.confidence);
                      const ConfIcon = confCfg?.icon;
                      return (sources.length > 0 || confCfg) ? (
                        <div className="mt-2 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {sources.map((src, i) => {
                              const cfg = getSourceConfig(src);
                              const Icon = cfg.icon;
                              return (
                                <span
                                  key={i}
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.className}`}
                                >
                                  <Icon className="h-2.5 w-2.5 shrink-0" />
                                  <span>{cfg.label}</span>
                                </span>
                              );
                            })}
                            {confCfg && ConfIcon && (
                              <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${confCfg.className}`}>
                                <span className="text-muted-foreground/30">·</span>
                                <ConfIcon className="h-2.5 w-2.5 shrink-0" />
                                {confCfg.label}
                              </span>
                            )}
                          </div>
                          {msg.sourceMetadata?.may_be_outdated && (
                            <p className="text-[10px] text-amber-500/70 italic">
                              ⚠️ Info ini mungkin sudah berubah — cek ke sumber terbaru.
                            </p>
                          )}
                        </div>
                      ) : null;
                    })()}

                    {/* Action row: copy + feedback (left) + report (right) */}
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-0.5">
                      {/* Copy button */}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(msg.content);
                          setCopiedMsgId(msg.id);
                          setTimeout(() => setCopiedMsgId(null), 2000);
                        }}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-muted-foreground/50 transition-colors hover:bg-secondary hover:text-muted-foreground"
                        title="Salin sebagai markdown"
                      >
                        {copiedMsgId === msg.id
                          ? <><Check className="h-3 w-3 text-green-500" /><span className="text-green-500">Tersalin</span></>
                          : <><Copy className="h-3 w-3" />Salin</>
                        }
                      </button>
                      {/* Thumbs up */}
                      <button
                        onClick={() => submitFeedback(msg.id, "up")}
                        className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] transition-colors hover:bg-secondary ${
                          feedbackMap[msg.id] === "up"
                            ? "text-green-500"
                            : "text-muted-foreground/50 hover:text-muted-foreground"
                        }`}
                        title="Jawaban membantu"
                      >
                        <ThumbsUp className="h-3 w-3" />
                      </button>
                      {/* Thumbs down */}
                      <button
                        onClick={() => submitFeedback(msg.id, "down")}
                        className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] transition-colors hover:bg-secondary ${
                          feedbackMap[msg.id] === "down"
                            ? "text-red-400"
                            : "text-muted-foreground/50 hover:text-muted-foreground"
                        }`}
                        title="Jawaban kurang membantu"
                      >
                        <ThumbsDown className="h-3 w-3" />
                      </button>
                      {/* Bookmark / Save */}
                      <button
                        onClick={() => toggleSave(msg.id, msg.content, msg.sources, msg.sourceMetadata)}
                        className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] transition-colors hover:bg-secondary ${
                          savedIds.has(msg.id)
                            ? "text-amber-500"
                            : "text-muted-foreground/50 hover:text-muted-foreground"
                        }`}
                        title={savedIds.has(msg.id) ? "Hapus dari tersimpan" : "Simpan jawaban ini"}
                      >
                        {savedIds.has(msg.id)
                          ? <BookmarkCheck className="h-3 w-3" />
                          : <Bookmark className="h-3 w-3" />
                        }
                      </button>
                      </div>

                      {/* Report */}
                      <div>
                      {reportedMsgIds.has(msg.id) ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-500/70">
                          <Check className="h-3 w-3" /> Laporan terkirim
                        </span>
                      ) : reportingMsgId === msg.id ? (
                        <div className="w-full rounded-xl border border-border bg-card p-3 space-y-2.5">
                          <p className="text-xs font-medium text-foreground">Pilih alasan laporan:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {["Informasi tidak akurat", "Info sudah berubah", "Sumber tidak sesuai", "Jawaban tidak relevan", "Lainnya"].map(r => (
                              <button
                                key={r}
                                onClick={() => setReportReason(r)}
                                className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${reportReason === r ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                          {reportReason && (
                            <div className="space-y-2">
                              <div className="space-y-1">
                                <p className="text-[10px] text-muted-foreground">Catatan tambahan <span className="opacity-60">(opsional)</span></p>
                                <textarea
                                  value={reportNote}
                                  onChange={e => setReportNote(e.target.value)}
                                  placeholder="Tulis detail masalahnya di sini, contoh: angka yang salah, prosedur yang berubah, dll."
                                  rows={2}
                                  maxLength={400}
                                  className="w-full resize-none rounded-lg border border-input bg-secondary px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                />
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] text-muted-foreground">
                                  Kirim revisi ke KB <span className="opacity-60">(opsional — admin akan meninjau sebelum dipublish)</span>
                                </p>
                                <textarea
                                  value={revisedAnswer}
                                  onChange={e => setRevisedAnswer(e.target.value)}
                                  placeholder="Tuliskan jawaban yang lebih tepat di sini. Jika disetujui admin, akan masuk ke Knowledge Base AINA."
                                  rows={3}
                                  maxLength={5000}
                                  className="w-full resize-none rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                                />
                              </div>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button
                              disabled={!reportReason || submittingReport}
                              onClick={() => submitReport(msg.id, msg.content)}
                              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
                            >
                              {submittingReport ? <span className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" /> : <Flag className="h-3 w-3" />}
                              {revisedAnswer.trim() ? "Kirim + Usulkan Revisi" : "Kirim Laporan"}
                            </button>
                            <button
                              onClick={() => { setReportingMsgId(null); setReportReason(""); setReportNote(""); setRevisedAnswer(""); }}
                              className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Batal
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setReportingMsgId(msg.id); setReportReason(""); }}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-muted-foreground/50 transition-colors hover:bg-secondary hover:text-muted-foreground"
                        >
                          <Flag className="h-2.5 w-2.5" /> Laporkan
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Report hint — always visible below action row */}
                  {!reportedMsgIds.has(msg.id) && reportingMsgId !== msg.id && (
                    <p className="mt-1 pl-0.5 text-[10px] text-muted-foreground/35">
                      Jawaban tidak akurat? Gunakan 🚩 Laporkan di atas untuk membantu AINA berkembang.
                    </p>
                  )}

                  {/* Follow-up suggestions — only on last AI message */}
                  {isLastAI && (() => {
                    const arabicRatio = (msg.content.match(/[\u0600-\u06FF]/g)?.length ?? 0) / Math.max(msg.content.length, 1);
                    const isArabicReply = arabicRatio > 0.25;
                    const suggestions = isArabicReply
                      ? ["أعطني مثالاً آخر", "وضّح أكثر", "اكتب نسخة أطول"]
                      : ["Jelaskan lebih detail", "Buat panduan langkah-langkah", "Ada hal lain terkait ini?"];
                    return (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {suggestions.map(s => (
                          <button
                            key={s}
                            onClick={() => handleSend(s)}
                            className="rounded-full border border-border/50 bg-secondary/30 px-3 py-1 text-[11px] text-muted-foreground/70 transition-all hover:border-primary/40 hover:bg-secondary hover:text-foreground"
                            dir={isArabicReply ? "rtl" : "ltr"}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                  </div>
                )}

              </div>
              );
            })}

            {/* Streaming typewriter bubble */}
            {streamingMsg && (
              <div className="flex gap-3 min-w-0 justify-start">
                <AinaLogo className="mt-1 h-7 w-7 shrink-0 object-contain" />
                <div className="min-w-0 flex-1 py-1">
                  <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
                    {streamingMsg.displayed}
                  </ReactMarkdown>
                  <span className="inline-block h-4 w-0.5 animate-pulse bg-primary/70 align-middle ml-0.5" />
                </div>
              </div>
            )}

            {isLoading && (
              <div className="flex gap-3">
                <AinaLogo className="mt-1 h-7 w-7 shrink-0 object-contain" />
                <div className="flex items-center gap-1 py-2">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="break-words">{error}</span>
              </div>
            )}

            {limitReached && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <p className="text-sm text-amber-300/90">
                  Batas 3 chat gratis hari ini sudah habis. Upgrade atau jadi Kontributor untuk chat tanpa batas.
                </p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Limit Reached Modal */}
      {limitReached && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-3xl border border-border bg-card shadow-2xl overflow-hidden">
            {/* Purple glow top bar */}
            <div className="h-1 w-full bg-gradient-to-r from-violet-600 via-purple-500 to-fuchsia-500" />

            <div className="p-6">
              {/* Header */}
              <div className="mb-5 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 shadow-lg shadow-purple-900/40">
                    <Zap className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Batas Harian Tercapai</p>
                    <p className="text-xs text-muted-foreground">3/3 chat gratis hari ini</p>
                  </div>
                </div>
                <button
                  onClick={() => setLimitReached(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mb-5 text-sm text-muted-foreground leading-relaxed">
                Kamu sudah menggunakan <span className="font-semibold text-foreground">3 chat gratis</span> hari ini. Pilih salah satu cara berikut untuk terus menggunakan AINA tanpa batas:
              </p>

              {/* Progress indicator */}
              <div className="mb-5 flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-1.5 flex-1 rounded-full bg-amber-500" />
                ))}
              </div>

              {/* CTA Options */}
              <div className="space-y-3">
                {/* Upgrade option */}
                <button
                  onClick={() => onGoContributor ? onGoContributor() : navigate("/dashboard?tab=contributor")}
                  className="group w-full rounded-2xl border border-purple-500/30 bg-gradient-to-br from-violet-600/10 to-purple-700/10 p-4 text-left transition-all hover:border-purple-500/60 hover:from-violet-600/20 hover:to-purple-700/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-purple-700">
                      <Crown className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">Upgrade ke AINA Pro</p>
                      <p className="text-xs text-muted-foreground">Chat tanpa batas + fitur eksklusif</p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-purple-400 group-hover:text-purple-300">
                      Lihat Paket →
                    </span>
                  </div>
                </button>

                {/* Contributor option */}
                <button
                  onClick={() => onGoContributor ? onGoContributor() : navigate("/dashboard?tab=contributor")}
                  className="group w-full rounded-2xl border border-border bg-secondary/50 p-4 text-left transition-all hover:border-border/80 hover:bg-secondary"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                      <BookOpen className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">Jadi Kontributor</p>
                      <p className="text-xs text-muted-foreground">Tulis artikel dan dapatkan akses penuh gratis</p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-muted-foreground group-hover:text-foreground">
                      Daftar →
                    </span>
                  </div>
                </button>
              </div>

              <p className="mt-4 text-center text-xs text-muted-foreground/60">
                Batas akan direset setiap hari pukul 00.00 waktu Kairo
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Input bar — always at bottom */}
      <div className="safe-bottom shrink-0 px-4 pb-5 pt-2 md:px-6 md:pb-7">
        {limitReached ? (
          <div
            onClick={() => setLimitReached(true)}
            className="mx-auto flex max-w-3xl cursor-pointer items-center justify-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400 transition-colors hover:border-amber-500/40"
          >
            <Zap className="h-4 w-4 shrink-0" />
            <span>Batas harian tercapai — <span className="font-semibold underline-offset-2 hover:underline">Upgrade atau jadi Kontributor</span></span>
          </div>
        ) : (
          <form onSubmit={handleFormSubmit} className="mx-auto max-w-3xl">
            {/* Response style pills */}
            <div className="mb-2 flex items-center gap-1 flex-wrap">
              {RESPONSE_STYLE_ORDER.map((key) => {
                const s = RESPONSE_STYLES[key];
                const SIcon = s.icon;
                const isActive = key === currentStyle;
                return (
                  <button
                    key={key}
                    type="button"
                    title={s.desc}
                    onClick={() => {
                      const prefs = getPersonalization();
                      localStorage.setItem("aina_personalization", JSON.stringify({ ...prefs, responseStyle: key }));
                      setCurrentStyle(key);
                    }}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] transition-all ${
                      isActive
                        ? "bg-primary/15 text-primary border border-primary/30 font-medium"
                        : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary border border-transparent"
                    }`}
                  >
                    <SIcon className="h-2.5 w-2.5 shrink-0" />
                    {s.shortLabel}
                  </button>
                );
              })}
            </div>
            {/* File preview above textarea */}
            {(attachedFile || isUploadingFile) && (
              <div className="mb-2 flex items-center gap-2 rounded-2xl border border-border bg-secondary/60 px-3 py-2">
                {isUploadingFile ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent shrink-0" />
                    <span className="text-xs text-muted-foreground">Membaca PDF...</span>
                  </>
                ) : attachedFile?.type === "image" ? (
                  <>
                    <img src={attachedFile.dataUrl} alt="preview" className="h-10 w-10 rounded-lg object-cover border border-border shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{attachedFile.name}</p>
                      <p className="text-[10px] text-muted-foreground">{attachedFile.sizeKb} KB · Gambar</p>
                    </div>
                    <button type="button" onClick={() => setAttachedFile(null)} className="ml-auto shrink-0 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : attachedFile?.type === "pdf" ? (
                  <>
                    <FileText className="h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{attachedFile.name}</p>
                      <p className="text-[10px] text-muted-foreground">{attachedFile.sizeKb} KB · PDF siap dianalisis</p>
                    </div>
                    <button type="button" onClick={() => setAttachedFile(null)} className="ml-auto shrink-0 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : null}
              </div>
            )}
            <div className="relative rounded-2xl border border-border bg-card shadow-sm transition-all focus-within:border-primary/50 focus-within:glow-purple-sm">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,.pdf,text/plain"
                className="hidden"
                onChange={handleFileChange}
              />
              {/* Paperclip button */}
              <button
                type="button"
                disabled={isLoading || isUploadingFile}
                onClick={() => fileInputRef.current?.click()}
                className="absolute left-3.5 bottom-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
                title="Lampirkan gambar atau PDF"
              >
                {isUploadingFile
                  ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  : <Paperclip className="h-4 w-4" />
                }
              </button>
              <textarea
                ref={textareaRef}
                data-tour="chat-input"
                dir="auto"
                value={input}
                onChange={(e) => { setInput(e.target.value); autoResize(); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Tanyakan sesuatu kepada AINA..."
                rows={1}
                className="w-full resize-none rounded-2xl bg-transparent px-5 py-4 pl-12 pr-24 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="button"
                onClick={toggleVoice}
                disabled={isLoading}
                className={`absolute right-[3.25rem] bottom-3 flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${
                  isListening
                    ? "text-red-400 animate-pulse hover:bg-red-500/10"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
                title={isListening ? "Berhenti mendengarkan" : "Input suara (Bahasa Indonesia)"}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <button
                type="submit"
                disabled={isLoading || (!input.trim() && !attachedFile)}
                className="absolute right-3.5 bottom-3 flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-purple text-primary-foreground transition-opacity hover:opacity-80 disabled:opacity-30"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground/50">
                AINA dapat membuat kesalahan. Periksa informasi penting.
              </p>
              {!isPaidUser && dailyCount !== null && (
                <button
                  type="button"
                  onClick={() => setLimitReached(true)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    dailyCount >= DAILY_LIMIT
                      ? "bg-red-500/10 text-red-400"
                      : dailyCount >= DAILY_LIMIT - 1
                      ? "bg-amber-500/10 text-amber-400"
                      : "bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                  title="Klik untuk info lebih lanjut"
                >
                  <Zap className="h-3 w-3" />
                  {dailyCount}/{DAILY_LIMIT} chat
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ChatArea;
