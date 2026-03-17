import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, AlertCircle, Menu, Plus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatAreaProps {
  onMenuClick?: () => void;
}

const API_URL = "/api/chat";

const SUGGESTIONS = [
  "Bagaimana cara daftar kuliah di Al-Azhar?",
  "Cara mengurus visa pelajar Mesir",
  "Biaya hidup di Kairo untuk mahasiswa",
  "Tips mencari tempat tinggal di Mesir",
];

const ChatArea = ({ onMenuClick }: ChatAreaProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  };

  const handleSend = async (text?: string) => {
    const userText = (text ?? input).trim();
    if (!userText || isLoading) return;

    setInput("");
    setError(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const allMessages = [...messages, userMsg];
      const history = allMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
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
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-purple">
            <Bot className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="font-display text-base font-bold text-foreground">AINA</span>
        </div>

        <button
          onClick={() => setMessages([])}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Plus className="h-5 w-5" />
        </button>
      </header>

      {/* Messages area or empty state */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          /* Empty / welcome state — ChatGPT-style centered */
          <div className="flex h-full flex-col items-center justify-center px-4 pb-4">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-purple shadow-lg shadow-primary/20">
              <Bot className="h-7 w-7 text-primary-foreground" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">Halo! Saya AINA</h1>
            <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
              Asisten AI khusus mahasiswa Indonesia di Mesir. Tanya apa saja tentang kehidupan di Kairo!
            </p>

            {/* Suggestion chips */}
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
          /* Chat messages */
          <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 md:px-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
              >
                {msg.role === "assistant" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-purple">
                    <Bot className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground whitespace-pre-wrap"
                      : "bg-secondary text-secondary-foreground prose prose-sm prose-invert max-w-none"
                  }`}
                >
                  {msg.role === "user" ? (
                    msg.content
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                        em: ({ children }) => <em className="italic text-muted-foreground">{children}</em>,
                        ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>,
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        h1: ({ children }) => <h1 className="mb-2 text-base font-bold text-foreground">{children}</h1>,
                        h2: ({ children }) => <h2 className="mb-1.5 text-sm font-bold text-foreground">{children}</h2>,
                        h3: ({ children }) => <h3 className="mb-1 text-sm font-semibold text-foreground">{children}</h3>,
                        code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">{children}</code>,
                        pre: ({ children }) => <pre className="mb-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">{children}</pre>,
                        blockquote: ({ children }) => <blockquote className="mb-2 border-l-2 border-primary/50 pl-3 text-muted-foreground">{children}</blockquote>,
                        hr: () => <hr className="my-2 border-border" />,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-purple">
                  <Bot className="h-4 w-4 text-primary-foreground" />
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
                <span>{error}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar — always at bottom */}
      <div className="shrink-0 px-4 pb-4 pt-2 md:pb-6">
        <form onSubmit={handleFormSubmit} className="mx-auto max-w-2xl">
          <div className="relative rounded-2xl border border-border bg-card p-1.5 shadow-sm transition-all focus-within:border-primary/50 focus-within:shadow-primary/10 focus-within:glow-purple-sm">
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
      </div>
    </div>
  );
};

export default ChatArea;
