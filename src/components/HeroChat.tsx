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

      {/* Main content — full height flex column, space evenly distributed */}
      <div
        className={`relative z-10 mx-auto flex w-full max-w-xl flex-col justify-evenly px-4 transition-all duration-700 ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
        style={{ paddingTop: "clamp(0.75rem, 2.5vh, 1.5rem)", paddingBottom: "clamp(0.75rem, 2.5vh, 1.5rem)" }}
      >
        {/* Hero Image */}
        <div className="flex flex-col items-center gap-[clamp(0.4rem,1.2vh,0.75rem)]">
          <img
            src={ainaHero}
            alt="AINA"
            className="w-auto object-contain drop-shadow-[0_0_50px_hsl(270_80%_65%/0.35)]"
            style={{ height: "clamp(8rem, 24vh, 14rem)" }}
          />
          <p
            className="font-modernist text-center text-primary-foreground/80"
            style={{ fontSize: "clamp(0.75rem, 1.6vh, 1rem)" }}
          >
            Teman Pintar Mahasiswa Indonesia di Mesir
          </p>
        </div>

        {/* Chat Input */}
        <form onSubmit={handleSubmit} className="w-full">
          <div className="group relative rounded-2xl border border-border bg-card/80 backdrop-blur-sm transition-all focus-within:border-primary/50 focus-within:glow-purple-sm"
            style={{ padding: "clamp(0.375rem, 1vh, 0.5rem)" }}
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
              rows={2}
              className="w-full resize-none rounded-xl bg-transparent px-3 py-2 pr-12 text-foreground placeholder:text-muted-foreground focus:outline-none"
              style={{ fontSize: "clamp(0.8rem, 1.6vh, 0.95rem)" }}
            />
            <button
              type="submit"
              className="absolute bottom-3 right-3 flex items-center justify-center rounded-xl bg-gradient-purple text-primary-foreground transition-opacity hover:opacity-80"
              style={{ width: "clamp(2rem, 4.5vh, 2.5rem)", height: "clamp(2rem, 4.5vh, 2.5rem)" }}
            >
              <Send style={{ width: "clamp(0.85rem, 1.8vh, 1rem)", height: "clamp(0.85rem, 1.8vh, 1rem)" }} />
            </button>
          </div>
        </form>

        {/* Suggestions */}
        <div className="flex flex-wrap justify-center gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => handleSuggestion(s)}
              className="rounded-full border border-border bg-secondary/80 backdrop-blur-sm text-secondary-foreground transition-colors hover:border-primary/40 hover:bg-primary/10"
              style={{
                paddingInline: "clamp(0.5rem, 1.5vw, 0.75rem)",
                paddingBlock: "clamp(0.25rem, 0.8vh, 0.375rem)",
                fontSize: "clamp(0.65rem, 1.4vh, 0.75rem)",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Utility Cards */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {/* Clock Card */}
          <div
            className="rounded-xl border border-border bg-card/60 backdrop-blur-md"
            style={{ padding: "clamp(0.625rem, 1.8vh, 1rem)" }}
          >
            <div className="mb-[clamp(0.375rem,1vh,0.625rem)] flex items-center gap-1.5">
              <Clock style={{ width: "clamp(0.7rem,1.6vh,0.875rem)", height: "clamp(0.7rem,1.6vh,0.875rem)" }} className="text-primary" />
              <span
                className="font-modernist font-bold text-foreground"
                style={{ fontSize: "clamp(0.65rem, 1.4vh, 0.8rem)" }}
              >
                Waktu
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { flag: "🇪🇬", label: "Mesir", time: egyptTime, date: egyptDate },
                { flag: "🇮🇩", label: "Jakarta", time: jakartaTime, date: jakartaDate },
              ].map((city) => (
                <div
                  key={city.label}
                  className="rounded-lg bg-secondary/50 text-center"
                  style={{ padding: "clamp(0.375rem, 1vh, 0.625rem)" }}
                >
                  <p style={{ fontSize: "clamp(0.6rem, 1.2vh, 0.7rem)" }} className="text-muted-foreground">
                    {city.flag} {city.label}
                  </p>
                  <p
                    className="font-display font-bold text-foreground tabular-nums"
                    style={{ fontSize: "clamp(0.7rem, 1.6vh, 0.9rem)" }}
                  >
                    {city.time}
                  </p>
                  <p style={{ fontSize: "clamp(0.55rem, 1.1vh, 0.65rem)" }} className="text-muted-foreground">
                    {city.date}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Currency Card */}
          <div
            className="rounded-xl border border-border bg-card/60 backdrop-blur-md"
            style={{ padding: "clamp(0.625rem, 1.8vh, 1rem)" }}
          >
            <div className="mb-[clamp(0.375rem,1vh,0.625rem)] flex items-center gap-1.5">
              <ArrowRightLeft style={{ width: "clamp(0.7rem,1.6vh,0.875rem)", height: "clamp(0.7rem,1.6vh,0.875rem)" }} className="text-primary" />
              <span
                className="font-modernist font-bold text-foreground"
                style={{ fontSize: "clamp(0.65rem, 1.4vh, 0.8rem)" }}
              >
                Kurs
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {[
                { code: "EGP", flag: "🇪🇬", field: "egp" as const },
                { code: "IDR", flag: "🇮🇩", field: "idr" as const },
                { code: "USD", flag: "🇺🇸", field: "usd" as const },
              ].map((c) => (
                <div
                  key={c.code}
                  className="flex items-center gap-1.5 rounded-lg bg-secondary/50"
                  style={{ paddingInline: "clamp(0.375rem, 1vw, 0.625rem)", paddingBlock: "clamp(0.3rem, 0.9vh, 0.5rem)" }}
                >
                  <span style={{ fontSize: "clamp(0.65rem, 1.4vh, 0.8rem)" }}>{c.flag}</span>
                  <span
                    className="font-bold text-muted-foreground"
                    style={{ fontSize: "clamp(0.6rem, 1.3vh, 0.75rem)", width: "1.75rem" }}
                  >
                    {c.code}
                  </span>
                  <input
                    type="number"
                    value={currencies[c.field]}
                    onChange={(e) => handleCurrencyChange(c.field, e.target.value)}
                    className="flex-1 bg-transparent text-right font-display font-semibold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    style={{ fontSize: "clamp(0.7rem, 1.5vh, 0.85rem)" }}
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
