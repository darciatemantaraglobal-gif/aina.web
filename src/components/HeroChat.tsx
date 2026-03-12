import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Clock, ArrowRightLeft } from "lucide-react";
import ainaHero from "@/assets/aina-hero.png";

const suggestions = [
  "Bagaimana cara daftar kuliah di Al-Azhar?",
  "Tips kehidupan sehari-hari di Kairo",
  "Cara mengurus visa pelajar Mesir",
  "Rekomendasi tempat tinggal mahasiswa",
];

const HeroChat = () => {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  const [currencies, setCurrencies] = useState({ egp: "1", idr: "", usd: "" });
  const [rates] = useState({ egpToIdr: 245.5, egpToUsd: 0.02, idrToUsd: 0.0000615 });

  const [now, setNow] = useState(new Date());

  useEffect(() => {
    setVisible(true);
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date, tz: string) =>
    date.toLocaleTimeString("id-ID", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const formatDate = (date: Date, tz: string) =>
    date.toLocaleDateString("id-ID", { timeZone: tz, weekday: "short", day: "numeric", month: "short" });

  const egyptTime = formatTime(now, "Africa/Cairo");
  const egyptDate = formatDate(now, "Africa/Cairo");
  const jakartaTime = formatTime(now, "Asia/Jakarta");
  const jakartaDate = formatDate(now, "Asia/Jakarta");

  const handleCurrencyChange = (field: string, value: string) => {
    const num = parseFloat(value) || 0;
    if (field === "egp") {
      setCurrencies({ egp: value, idr: (num * rates.egpToIdr).toFixed(0), usd: (num * rates.egpToUsd).toFixed(4) });
    } else if (field === "idr") {
      setCurrencies({ egp: (num / rates.egpToIdr).toFixed(2), idr: value, usd: (num * rates.idrToUsd).toFixed(4) });
    } else {
      setCurrencies({ egp: (num / rates.egpToUsd).toFixed(2), idr: (num / rates.idrToUsd).toFixed(0), usd: value });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) navigate("/login", { state: { pendingMessage: message } });
  };

  const handleSuggestion = (text: string) => {
    navigate("/login", { state: { pendingMessage: text } });
  };

  return (
    <section className="relative flex h-[calc(100vh-3.5rem)] flex-col items-center justify-center overflow-hidden px-4 py-4 sm:h-[calc(100vh-4rem)] sm:py-6">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-purple-subtle/10 to-background" />
        <div className="absolute left-1/2 top-1/4 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute right-1/4 bottom-1/4 h-[250px] w-[250px] rounded-full bg-accent/5 blur-[100px]" />
      </div>

      <div
        className={`relative z-10 flex w-full max-w-xl flex-col items-center gap-3 text-center transition-all duration-700 sm:gap-4 ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        {/* Hero Image */}
        <img
          src={ainaHero}
          alt="AINA"
          className="h-24 w-auto object-contain drop-shadow-[0_0_40px_hsl(270_80%_65%/0.3)] sm:h-36 lg:h-44"
        />

        {/* Subtitle */}
        <p className="font-modernist text-xs text-primary-foreground/80 sm:text-sm">
          Teman Pintar Mahasiswa Indonesia di Mesir
        </p>

        {/* Chat Input */}
        <form onSubmit={handleSubmit} className="w-full">
          <div className="group relative rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-1.5 transition-all focus-within:border-primary/50 focus-within:glow-purple-sm">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Tanyakan apa saja kepada AINA..."
              rows={2}
              className="w-full resize-none rounded-xl bg-transparent px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button
              type="submit"
              className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-purple text-primary-foreground transition-opacity hover:opacity-80"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>

        {/* Suggestions */}
        <div className="flex flex-wrap justify-center gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => handleSuggestion(s)}
              className="rounded-full border border-border bg-secondary/80 backdrop-blur-sm px-2.5 py-1 text-[10px] text-secondary-foreground transition-colors hover:border-primary/40 hover:bg-primary/10"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Utility Cards */}
        <div className="grid w-full grid-cols-2 gap-2">
          {/* Clock Card */}
          <div className="rounded-xl border border-border bg-card/60 backdrop-blur-md p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-modernist font-bold text-foreground">Waktu</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="rounded-lg bg-secondary/50 p-1.5 text-center">
                <p className="text-[8px] text-muted-foreground">🇪🇬 Mesir</p>
                <p className="font-display text-[11px] font-bold text-foreground tabular-nums">{egyptTime}</p>
                <p className="text-[8px] text-muted-foreground">{egyptDate}</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-1.5 text-center">
                <p className="text-[8px] text-muted-foreground">🇮🇩 Jakarta</p>
                <p className="font-display text-[11px] font-bold text-foreground tabular-nums">{jakartaTime}</p>
                <p className="text-[8px] text-muted-foreground">{jakartaDate}</p>
              </div>
            </div>
          </div>

          {/* Currency Card */}
          <div className="rounded-xl border border-border bg-card/60 backdrop-blur-md p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <ArrowRightLeft className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-modernist font-bold text-foreground">Kurs</span>
            </div>
            <div className="space-y-1">
              {[
                { code: "EGP", flag: "🇪🇬", field: "egp" as const },
                { code: "IDR", flag: "🇮🇩", field: "idr" as const },
                { code: "USD", flag: "🇺🇸", field: "usd" as const },
              ].map((c) => (
                <div key={c.code} className="flex items-center gap-1.5 rounded-lg bg-secondary/50 px-2 py-1">
                  <span className="text-[10px]">{c.flag}</span>
                  <span className="w-6 text-[10px] font-bold text-muted-foreground">{c.code}</span>
                  <input
                    type="number"
                    value={currencies[c.field]}
                    onChange={(e) => handleCurrencyChange(c.field, e.target.value)}
                    className="flex-1 bg-transparent text-right text-[11px] font-display font-semibold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroChat;
