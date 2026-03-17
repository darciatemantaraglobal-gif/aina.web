import { useState, useRef, useEffect } from "react";
import { Send, User, AlertCircle, Menu, Plus, Zap } from "lucide-react";
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

const ChatArea = ({ onMenuClick, chatId, onChatCreated, onNewChat, initialMessage }: ChatAreaProps) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeChatIdRef = useRef<string | null>(chatId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

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

  const loadMessages = async (id: string) => {
    setLoadingHistory(true);
    try {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", id)
        .order("created_at", { ascending: true });
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

      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ messages: history }),
      });

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
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-purple p-2.5 shadow-lg shadow-primary/20">
              <AinaLogo className="h-full w-full object-contain" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">Halo! Saya AINA</h1>
            <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
              Asisten AI khusus mahasiswa Indonesia di Mesir. Tanya apa saja tentang kehidupan di Kairo!
            </p>

            <div className="mt-8 grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-all hover:border-primary/40 hover:bg-secondary hover:text-foreground"
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
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-purple p-1.5">
                    <AinaLogo className="h-full w-full object-contain" />
                  </div>
                )}

                {msg.role === "user" ? (
                  <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground whitespace-pre-wrap break-words">
                    {msg.content}
                  </div>
                ) : (
                  <div className="min-w-0 flex-1 rounded-2xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        br: () => <br />,
                        p: ({ children }) => (
                          <p className="mb-2 last:mb-0 break-words leading-relaxed">{children}</p>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-semibold text-foreground">{children}</strong>
                        ),
                        em: ({ children }) => (
                          <em className="italic text-muted-foreground">{children}</em>
                        ),
                        ul: ({ children }) => (
                          <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>
                        ),
                        li: ({ children }) => (
                          <li className="leading-relaxed break-words">{children}</li>
                        ),
                        h1: ({ children }) => (
                          <h1 className="mb-2 mt-3 text-base font-bold text-foreground first:mt-0">{children}</h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="mb-1.5 mt-3 text-sm font-bold text-foreground first:mt-0">{children}</h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="mb-1 mt-2 text-sm font-semibold text-foreground first:mt-0">{children}</h3>
                        ),
                        code: ({ children, className }) => {
                          const isBlock = className?.includes("language-");
                          if (isBlock) return <code className={className}>{children}</code>;
                          return (
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground break-all">
                              {children}
                            </code>
                          );
                        },
                        pre: ({ children }) => (
                          <div className="mb-2 overflow-x-auto rounded-lg bg-muted">
                            <pre className="p-3 font-mono text-xs text-foreground">{children}</pre>
                          </div>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="mb-2 border-l-2 border-primary/50 pl-3 text-muted-foreground">
                            {children}
                          </blockquote>
                        ),
                        hr: () => <hr className="my-3 border-border" />,
                        table: ({ children }) => (
                          <div className="mb-3 overflow-x-auto rounded-lg border border-border">
                            <table className="min-w-full text-xs">{children}</table>
                          </div>
                        ),
                        thead: ({ children }) => (
                          <thead className="bg-muted/60">{children}</thead>
                        ),
                        tbody: ({ children }) => (
                          <tbody className="divide-y divide-border">{children}</tbody>
                        ),
                        tr: ({ children }) => (
                          <tr className="hover:bg-muted/30 transition-colors">{children}</tr>
                        ),
                        th: ({ children }) => (
                          <th className="px-3 py-2 text-left font-semibold text-foreground whitespace-nowrap">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="px-3 py-2 text-secondary-foreground">{children}</td>
                        ),
                      }}
                    >
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
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-purple p-1.5">
                  <AinaLogo className="h-full w-full object-contain" />
                </div>
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
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-6 py-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-purple">
                  <Zap className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Batas chat harian tercapai</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Kamu sudah menggunakan 3 chat gratis hari ini. Upgrade ke AINA Pro untuk chat tanpa batas!
                  </p>
                </div>
                <button
                  onClick={() => navigate("/pricing")}
                  className="mt-1 rounded-xl bg-gradient-purple px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Lihat Paket Upgrade →
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar — always at bottom */}
      <div className="shrink-0 px-3 pb-4 pt-2 md:px-6 md:pb-6">
        {limitReached ? (
          <div className="mx-auto max-w-2xl rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-center text-sm text-muted-foreground">
            Chat dinonaktifkan hari ini. <button onClick={() => navigate("/pricing")} className="font-semibold text-primary underline-offset-2 hover:underline">Upgrade sekarang</button> untuk lanjut.
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
            <p className="mt-2 text-center text-xs text-muted-foreground/50">
              AINA dapat membuat kesalahan. Periksa informasi penting.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default ChatArea;
