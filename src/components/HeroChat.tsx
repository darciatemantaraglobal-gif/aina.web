import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Sparkles } from "lucide-react";
import ainaLogo from "@/assets/aina-logo.png";

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
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <img src={ainaLogo} alt="AINA Logo" className="h-20 w-20 sm:h-24 sm:w-24 object-contain" />
        </div>

        <h1 className="mb-3 font-sunspire text-6xl leading-tight text-gradient-purple-white sm:text-7xl lg:text-8xl">
          AINA
        </h1>

        <p className="mb-10 font-modernist text-base text-primary-foreground sm:text-lg">
          Teman Pintar Mahasiswa Indonesia di Mesir
        </p>

        {/* Chat Input - larger */}
        <form onSubmit={handleSubmit} className="relative mx-auto w-full max-w-xl">
          <div className="group relative rounded-2xl border border-border bg-card p-2 transition-all focus-within:border-primary/50 focus-within:glow-purple-sm">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Tanyakan apa saja kepada AINA tentang kuliah atau kehidupan di Mesir..."
              rows={3}
              className="w-full resize-none rounded-xl bg-transparent px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button
              type="submit"
              className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-purple text-primary-foreground transition-opacity hover:opacity-80"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>

        {/* Suggestions */}
        <div className="mt-5 flex flex-wrap justify-center gap-2 px-2">
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
