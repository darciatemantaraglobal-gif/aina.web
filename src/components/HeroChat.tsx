import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Clock, ArrowRightLeft } from "lucide-react";
import ainaHero from "@/assets/aina-hero.png";

const suggestions = [
  "Bagaimana cara daftar kuliah di Al-Azhar?",
  "Cara mengurus visa pelajar Mesir",
];

const HeroChat = () => {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  const [currencies, setCurrencies] = useState({ egp: "1", idr: "245", usd: "0.0200" });
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
    <section
      className="relative flex overflow-hidden"
      style={{ height: "calc(100dvh - 3.5rem)" }}
    >
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-purple-subtle/10 to-background" />
        <div className="absolute left-1/2 top-1/3 h-[60vw] w-[60vw] max-h-[500px] max-w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute right-1/4 bottom-1/4 h-[30vw] w-[30vw] max-h-[300px] max-w-[300px] rounded-full bg-accent/5 blur-[100px]" />
      </div>

      {/* Main content */}
      <div
        className={`relative z-10 mx-auto flex w-full max-w-2xl flex-col justify-evenly px-4 transition-all duration-700 ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
        style={{ paddingTop: "clamp(0.75rem, 2.5vh, 1.5rem)", paddingBottom: "clamp(0.75rem, 2.5vh, 1.5rem)" }}
      >
        {/* Hero Image + Title */}
        <div className="flex flex-col items-center gap-[clamp(0.4rem,1.2vh,0.75rem)]">
          <img
            src={ainaHero}
            alt="AINA"
            className="w-auto object-contain drop-shadow-[0_0_50px_hsl(270_80%_65%/0.35)]"
            style={{ height: "clamp(8rem, 25vh, 15rem)" }}
          />
          <p
            className="font-modernist text-center text-primary-foreground/80"
            style={{ fontSize: "clamp(0.9rem, 2vh, 1.15rem)" }}
          >
            Teman Pintar Mahasiswa Indonesia di Mesir
          </p>
        </div>

        {/* Chat Input — bigger */}
        <form onSubmit={handleSubmit} className="w-full">
          <div
            className="group relative rounded-2xl border border-border bg-card/80 backdrop-blur-sm transition-all focus-within:border-primary/50 focus-within:glow-purple-sm"
            style={{ padding: "clamp(0.5rem, 1.2vh, 0.75rem)" }}
          >
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
              rows={3}
              className="w-full resize-none rounded-xl bg-transparent px-4 py-3 pr-14 text-foreground placeholder:text-muted-foreground focus:outline-none"
              style={{ fontSize: "clamp(0.9rem, 1.9vh, 1.05rem)" }}
            />
            <button
              type="submit"
              className="absolute bottom-4 right-4 flex items-center justify-center rounded-xl bg-gradient-purple text-primary-foreground transition-opacity hover:opacity-80"
              style={{ width: "clamp(2.2rem, 5vh, 2.75rem)", height: "clamp(2.2rem, 5vh, 2.75rem)" }}
            >
              <Send style={{ width: "clamp(0.9rem, 2vh, 1.1rem)", height: "clamp(0.9rem, 2vh, 1.1rem)" }} />
            </button>
          </div>
        </form>

        {/* Suggestions — 2 only */}
        <div className="flex justify-center gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => handleSuggestion(s)}
              className="rounded-full border border-border bg-secondary/80 backdrop-blur-sm text-secondary-foreground transition-colors hover:border-primary/40 hover:bg-primary/10"
              style={{
                paddingInline: "clamp(0.6rem, 1.5vw, 1rem)",
                paddingBlock: "clamp(0.3rem, 0.9vh, 0.5rem)",
                fontSize: "clamp(0.7rem, 1.5vh, 0.8rem)",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Utility Cards — full width horizontal rows */}
        <div className="flex flex-col gap-2">

          {/* Clock Card — single horizontal row */}
          <div
            className="flex items-center gap-3 rounded-xl border border-border bg-card/60 backdrop-blur-md"
            style={{ padding: "clamp(0.5rem, 1.4vh, 0.875rem) clamp(0.75rem, 2vw, 1.25rem)" }}
          >
            <div className="flex shrink-0 items-center gap-1.5 text-primary">
              <Clock className="h-3.5 w-3.5" />
              <span className="font-modernist text-xs font-bold text-foreground">Waktu</span>
            </div>

            <div className="h-4 w-px bg-border/60" />

            <div className="flex flex-1 items-center justify-around gap-2">
              {[
                { flag: "🇪🇬", label: "Mesir", time: egyptTime, date: egyptDate },
                { flag: "🇮🇩", label: "Jakarta", time: jakartaTime, date: jakartaDate },
              ].map((city) => (
                <div key={city.label} className="flex items-center gap-2">
                  <span className="text-sm">{city.flag}</span>
                  <div>
                    <p className="text-[10px] leading-none text-muted-foreground">{city.label}</p>
                    <p
                      className="font-display font-bold text-foreground tabular-nums"
                      style={{ fontSize: "clamp(0.75rem, 1.7vh, 0.95rem)" }}
                    >
                      {city.time}
                    </p>
                    <p className="text-[10px] leading-none text-muted-foreground">{city.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Currency Card — single horizontal row */}
          <div
            className="flex items-center gap-3 rounded-xl border border-border bg-card/60 backdrop-blur-md"
            style={{ padding: "clamp(0.5rem, 1.4vh, 0.875rem) clamp(0.75rem, 2vw, 1.25rem)" }}
          >
            <div className="flex shrink-0 items-center gap-1.5 text-primary">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              <span className="font-modernist text-xs font-bold text-foreground">Kurs</span>
            </div>

            <div className="h-4 w-px bg-border/60" />

            <div className="flex flex-1 items-center justify-around gap-1">
              {[
                { code: "EGP", flag: "🇪🇬", field: "egp" as const },
                { code: "IDR", flag: "🇮🇩", field: "idr" as const },
                { code: "USD", flag: "🇺🇸", field: "usd" as const },
              ].map((c, i) => (
                <div key={c.code} className="flex flex-1 items-center gap-1.5">
                  {i > 0 && <div className="h-4 w-px bg-border/40" />}
                  <span className="text-sm">{c.flag}</span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[10px] leading-none text-muted-foreground">{c.code}</span>
                    <input
                      type="number"
                      value={currencies[c.field]}
                      onChange={(e) => handleCurrencyChange(c.field, e.target.value)}
                      className="w-full bg-transparent font-display font-semibold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      style={{ fontSize: "clamp(0.75rem, 1.7vh, 0.95rem)" }}
                      placeholder="0"
                    />
                  </div>
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
