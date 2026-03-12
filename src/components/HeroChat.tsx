import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Sparkles } from "lucide-react";

const suggestions = [
  "Bagaimana cara daftar kuliah di Al-Azhar?",
  "Tips kehidupan sehari-hari di Kairo",
  "Cara mengurus visa pelajar Mesir",
  "Rekomendasi tempat tinggal mahasiswa",
];

const HeroChat = () => {
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      navigate("/login", { state: { pendingMessage: message } });
    }
  };

  const handleSuggestion = (text: string) => {
    navigate("/login", { state: { pendingMessage: text } });
  };

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center px-4 pt-16">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-2xl text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary">
          <Sparkles className="h-4 w-4" />
          AI Assistant Masisir
        </div>

        <h1 className="mb-4 font-display text-4xl font-bold leading-tight text-foreground sm:text-5xl lg:text-6xl">
          Teman Pintar Mahasiswa{" "}
          <span className="text-gradient-purple">Indonesia di Mesir</span>
        </h1>

        <p className="mb-10 text-lg text-muted-foreground">
          AINA membantu kamu menyelesaikan masalah administrasi, akademik, dan kehidupan sehari-hari di Mesir.
        </p>

        {/* Chat Input */}
        <form onSubmit={handleSubmit} className="relative mx-auto w-full max-w-xl">
          <div className="group relative rounded-2xl border border-border bg-card p-1.5 transition-all focus-within:border-primary/50 focus-within:glow-purple-sm">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tanyakan apa saja kepada AINA tentang kuliah atau kehidupan di Mesir..."
              className="w-full rounded-xl bg-transparent px-4 py-3.5 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button
              type="submit"
              className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-gradient-purple text-primary-foreground transition-opacity hover:opacity-80"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>

        {/* Suggestions */}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => handleSuggestion(s)}
              className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs text-secondary-foreground transition-colors hover:border-primary/40 hover:bg-primary/10"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HeroChat;
