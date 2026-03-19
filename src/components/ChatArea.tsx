import { useState, useRef, useEffect, useCallback } from "react";
import { Send, User, AlertCircle, Menu, Plus, Zap, Crown, BookOpen, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatAreaProps {
  onMenuClick?: () => void;
  chatId: string | null;
  onChatCreated: (chatId: string, title: string) => void;
  onNewChat?: () => void;
  initialMessage?: string;
}

const API_URL = "/api/chat";

const SUGGESTIONS = [
  "Bagaimana cara daftar kuliah di Al-Azhar?",
  "Cara mengurus visa pelajar Mesir",
  "Biaya hidup di Kairo untuk mahasiswa",
  "Tips mencari tempat tinggal di Mesir",
];

const AinaLogo = ({ className }: { className?: string }) => (
  <img src="/aina-icon.png" alt="AINA" className={className} />
);

function cleanMarkdown(text: string): string {
  return text
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

const DAILY_LIMIT = 3;
const REMARK_PLUGINS = [remarkGfm];

const MD_COMPONENTS = {
  br: () => <br />,
  p: ({ children }: any) => <p className="mb-2 last:mb-0 break-words leading-relaxed">{children}</p>,
  strong: ({ children }: any) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }: any) => <em className="italic text-muted-foreground">{children}</em>,
  ul: ({ children }: any) => <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>,
  li: ({ children }: any) => <li className="leading-relaxed break-words">{children}</li>,
  h1: ({ children }: any) => <h1 className="mb-2 mt-3 text-base font-bold text-foreground first:mt-0">{children}</h1>,
  h2: ({ children }: any) => <h2 className="mb-1.5 mt-3 text-sm font-bold text-foreground first:mt-0">{children}</h2>,
  h3: ({ children }: any) => <h3 className="mb-1 mt-2 text-sm font-semibold text-foreground first:mt-0">{children}</h3>,
  code: ({ children, className }: any) => {
    if (className?.includes("language-")) return <code className={className}>{children}</code>;
    return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground break-all">{children}</code>;
  },
  pre: ({ children }: any) => (
    <div className="mb-2 overflow-x-auto rounded-lg bg-muted">
      <pre className="p-3 font-mono text-xs text-foreground">{children}</pre>
    </div>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="mb-2 border-l-2 border-primary/50 pl-3 text-muted-foreground">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
  table: ({ children }: any) => (
    <div className="mb-3 overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => <thead className="bg-muted/60">{children}</thead>,
  tbody: ({ children }: any) => <tbody className="divide-y divide-border">{children}</tbody>,
  tr: ({ children }: any) => <tr className="hover:bg-muted/30 transition-colors">{children}</tr>,
  th: ({ children }: any) => <th className="px-3 py-2 text-left font-semibold text-foreground whitespace-nowrap">{children}</th>,
  td: ({ children }: any) => <td className="px-3 py-2 text-secondary-foreground">{children}</td>,
};

const ChatArea = ({ onMenuClick, chatId, onChatCreated, onNewChat, initialMessage }: ChatAreaProps) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [dailyCount, setDailyCount] = useState<number | null>(null);
  const [isPaidUser, setIsPaidUser] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeChatIdRef = useRef<string | null>(chatId);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    activeChatIdRef.current = chatId;
    // Don't reset while a send is in-flight (e.g. new chat just created mid-send)
    if (isLoading) return;
    setMessages([]);
    setError(null);
    setInput("");
    if (chatId) {
      loadMessages(chatId);
    }
  }, [chatId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialMessage) {
      const timer = setTimeout(() => handleSend(initialMessage), 400);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch daily chat count and check paid status on mount
  useEffect(() => {
    const fetchDailyUsage = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const userId = session.user.id;

      // Check if paid user (contributor/senior_contributor/admin)
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const paid = roles?.some(r =>
        ["contributor", "senior_contributor", "admin"].includes(r.role)
      ) ?? false;
      setIsPaidUser(paid);

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

  const handleSend = async (text?: string) => {
    const userText = (text ?? input).trim();
    if (!userText || isLoading) return;

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    setInput("");
    setError(null);
    setLimitReached(false);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userText,
      timestamp: new Date(),
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

      await supabase.from("messages").insert({
        chat_id: currentChatId,
        user_id: userId,
        role: "user",
        content: userText,
      });

      const allMessages = [...messages, userMsg];
      const history = allMessages.map((m) => ({ role: m.role, content: m.content }));

      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 30000);
      let res: Response;
      try {
        res = await fetch(API_URL, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ messages: history }),
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
          return;
        }
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.reply,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      // Increment daily count
      setDailyCount(prev => (prev ?? 0) + 1);

      await supabase.from("messages").insert({
        chat_id: currentChatId,
        user_id: userId,
        role: "assistant",
        content: data.reply,
      });

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
      <header className="flex h-14 items-center justify-between border-b border-border px-4 md:hidden shrink-0">
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
            <AinaLogo className="mb-4 h-16 w-16 object-contain drop-shadow-[0_0_18px_rgba(139,92,246,0.85)]" />
            <h1 className="font-display text-2xl font-bold text-foreground">Halo! Saya AINA</h1>
            <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
              Asisten AI khusus mahasiswa Indonesia di Mesir. Tanya apa saja tentang kehidupan di Kairo!
            </p>

            <div className="mt-4 sm:mt-8 grid w-full max-w-md grid-cols-2 gap-1.5 sm:gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setInput(s);
                    setTimeout(() => {
                      textareaRef.current?.focus();
                      autoResize();
                    }, 0);
                  }}
                  className="rounded-xl border border-border bg-card px-3 py-2 sm:px-4 sm:py-3 text-left text-xs sm:text-sm text-muted-foreground transition-all hover:border-primary/40 hover:bg-secondary hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-2xl space-y-6 px-3 py-6 md:px-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 min-w-0 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <AinaLogo className="h-8 w-8 shrink-0 object-contain" />
                )}

                {msg.role === "user" ? (
                  <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground whitespace-pre-wrap break-words">
                    {msg.content}
                  </div>
                ) : (
                  <div className="min-w-0 flex-1 rounded-2xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
                    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
                      {cleanMarkdown(msg.content)}
                    </ReactMarkdown>
                  </div>
                )}

                {msg.role === "user" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2.5">
                <AinaLogo className="h-8 w-8 shrink-0 object-contain" />
                <div className="rounded-2xl bg-secondary px-4 py-3">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
                  </div>
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
                  onClick={() => navigate("/pricing")}
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
                  onClick={() => navigate("/contributor")}
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
      <div className="shrink-0 px-3 pb-4 pt-2 md:px-6 md:pb-6">
        {limitReached ? (
          <div
            onClick={() => setLimitReached(true)}
            className="mx-auto flex max-w-2xl cursor-pointer items-center justify-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400 transition-colors hover:border-amber-500/40"
          >
            <Zap className="h-4 w-4 shrink-0" />
            <span>Batas harian tercapai — <span className="font-semibold underline-offset-2 hover:underline">Upgrade atau jadi Kontributor</span></span>
          </div>
        ) : (
          <form onSubmit={handleFormSubmit} className="mx-auto max-w-2xl">
            <div className="relative rounded-2xl border border-border bg-card p-1.5 shadow-sm transition-all focus-within:border-primary/50 focus-within:glow-purple-sm">
              <textarea
                ref={textareaRef}
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
                className="w-full resize-none rounded-xl bg-transparent px-4 py-3 pr-14 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl bg-gradient-purple text-primary-foreground transition-opacity hover:opacity-80 disabled:opacity-30"
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
