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

  // Currency converter state
  const [currencies, setCurrencies] = useState({ egp: "1", idr: "", usd: "" });
  const [rates] = useState({ egpToIdr: 245.5, egpToUsd: 0.02, idrToUsd: 0.0000615 });
  const [activeField, setActiveField] = useState<string | null>(null);

  // Real-time clocks
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

  // Currency conversion
  const handleCurrencyChange = (field: string, value: string) => {
    const num = parseFloat(value) || 0;
    setActiveField(field);
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
    <section className="relative flex h-screen flex-col items-center justify-center px-3 pt-14 pb-4 overflow-hidden">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-purple-subtle/10 to-background" />
        <div className="absolute left-1/2 top-1/4 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-[150px]" />
        <div className="absolute right-1/4 bottom-1/4 h-[300px] w-[300px] rounded-full bg-accent/5 blur-[120px]" />
      </div>

      <div className={`relative z-10 w-full max-w-2xl text-center transition-all duration-1000 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        {/* Hero Image */}
        <div className={`mb-2 flex justify-center transition-all duration-1000 delay-200 ${visible ? "opacity-100 scale-100" : "opacity-0 scale-90"}`}>
          <img src={ainaHero} alt="AINA" className="h-32 sm:h-48 lg:h-56 w-auto object-contain drop-shadow-[0_0_40px_hsl(270_80%_65%/0.3)]" />
        </div>

        <p className={`mb-4 font-modernist text-sm text-primary-foreground sm:text-base transition-all duration-700 delay-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          Teman Pintar Mahasiswa Indonesia di Mesir
        </p>

        {/* Chat Input */}
        <form onSubmit={handleSubmit} className={`relative mx-auto w-full max-w-xl transition-all duration-700 delay-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="group relative rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-2 transition-all focus-within:border-primary/50 focus-within:glow-purple-sm">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
              placeholder="Tanyakan apa saja kepada AINA tentang kuliah atau kehidupan di Mesir..."
              rows={3}
              className="w-full resize-none rounded-xl bg-transparent px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button type="submit" className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-purple text-primary-foreground transition-opacity hover:opacity-80">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>

        {/* Suggestions */}
        <div className={`mt-4 flex flex-wrap justify-center gap-2 px-2 transition-all duration-700 delay-900 ${visible ? "opacity-100" : "opacity-0"}`}>
          {suggestions.map((s) => (
            <button key={s} onClick={() => handleSuggestion(s)} className="rounded-full border border-border bg-secondary/80 backdrop-blur-sm px-3 py-1.5 text-xs text-secondary-foreground transition-colors hover:border-primary/40 hover:bg-primary/10">
              {s}
            </button>
          ))}
        </div>

        {/* Utility Cards */}
        <div className={`mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 transition-all duration-700 delay-1000 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          {/* Clock Card */}
          <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-xs font-modernist font-bold text-foreground">Waktu Real-Time</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-secondary/50 p-3 text-center">
                <p className="text-[10px] text-muted-foreground mb-1">🇪🇬 Mesir</p>
                <p className="font-display text-lg font-bold text-foreground tabular-nums">{egyptTime}</p>
                <p className="text-[10px] text-muted-foreground">{egyptDate}</p>
              </div>
              <div className="rounded-xl bg-secondary/50 p-3 text-center">
                <p className="text-[10px] text-muted-foreground mb-1">🇮🇩 Jakarta</p>
                <p className="font-display text-lg font-bold text-foreground tabular-nums">{jakartaTime}</p>
                <p className="text-[10px] text-muted-foreground">{jakartaDate}</p>
              </div>
            </div>
          </div>

          {/* Currency Card */}
          <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-4">
            <div className="flex items-center gap-2 mb-3">
              <ArrowRightLeft className="h-4 w-4 text-primary" />
              <span className="text-xs font-modernist font-bold text-foreground">Konversi Kurs</span>
            </div>
            <div className="space-y-2">
              {[
                { code: "EGP", flag: "🇪🇬", field: "egp" as const },
                { code: "IDR", flag: "🇮🇩", field: "idr" as const },
                { code: "USD", flag: "🇺🇸", field: "usd" as const },
              ].map((c) => (
                <div key={c.code} className="flex items-center gap-2 rounded-xl bg-secondary/50 px-3 py-2">
                  <span className="text-sm">{c.flag}</span>
                  <span className="text-xs font-bold text-muted-foreground w-8">{c.code}</span>
                  <input
                    type="number"
                    value={currencies[c.field]}
                    onChange={(e) => handleCurrencyChange(c.field, e.target.value)}
                    className="flex-1 bg-transparent text-right text-sm font-display font-semibold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
