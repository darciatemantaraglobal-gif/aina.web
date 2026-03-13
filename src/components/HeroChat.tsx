import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Clock, ArrowRightLeft, X } from "lucide-react";
import ainaHero from "@/assets/aina-hero.png";

const suggestions = [
  "Bagaimana cara daftar kuliah di Al-Azhar?",
  "Cara mengurus visa pelajar Mesir",
];

const HeroChat = () => {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  // Two base rates — everything else is derived
  const [egpToIdr, setEgpToIdr] = useState(245);
  const [usdToIdr, setUsdToIdr] = useState(15800);

  // Derived rates
  const egpToUsd = egpToIdr / usdToIdr;
  const idrToUsd = 1 / usdToIdr;

  // Currency amounts shown in the card
  const [currencies, setCurrencies] = useState({ egp: "1", idr: "245", usd: "" });

  // Recompute displayed values whenever base rates change
  useEffect(() => {
    const egp = parseFloat(currencies.egp) || 1;
    setCurrencies({
      egp: currencies.egp,
      idr: (egp * egpToIdr).toFixed(0),
      usd: (egp * egpToUsd).toFixed(4),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [egpToIdr, usdToIdr]);

  const handleCurrencyChange = (field: string, value: string) => {
    const num = parseFloat(value) || 0;
    if (field === "egp") {
      setCurrencies({ egp: value, idr: (num * egpToIdr).toFixed(0), usd: (num * egpToUsd).toFixed(4) });
    } else if (field === "idr") {
      setCurrencies({ egp: (num / egpToIdr).toFixed(2), idr: value, usd: (num * idrToUsd).toFixed(6) });
    } else {
      setCurrencies({ egp: (num / egpToUsd).toFixed(2), idr: (num * usdToIdr).toFixed(0), usd: value });
    }
  };

  // Popover
  const [rateOpen, setRateOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rateOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setRateOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [rateOpen]);

  // Clock
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) navigate("/login", { state: { pendingMessage: message } });
  };

  const handleSuggestion = (text: string) => {
    navigate("/login", { state: { pendingMessage: text } });
  };

  return (
    <section className="relative flex h-full overflow-hidden">
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

        {/* Chat Input */}
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

        {/* Suggestions */}
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

        {/* Utility Cards */}
        <div className="flex flex-col gap-2">

          {/* Clock Card */}
          <div
            className="flex items-center gap-3 rounded-xl border border-border bg-card/60 backdrop-blur-md"
            style={{ padding: "clamp(0.5rem, 1.4vh, 0.875rem) clamp(0.75rem, 2vw, 1.25rem)" }}
          >
            <div className="flex shrink-0 items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" />
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

          {/* Currency Card */}
          <div
            className="relative flex items-center gap-3 rounded-xl border border-border bg-card/60 backdrop-blur-md"
            style={{ padding: "clamp(0.5rem, 1.4vh, 0.875rem) clamp(0.75rem, 2vw, 1.25rem)" }}
            ref={popoverRef}
          >
            {/* Kurs label — click to open rate editor */}
            <button
              onClick={() => setRateOpen((o) => !o)}
              title="Atur kurs"
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-1.5 py-1 transition-all duration-200 ${
                rateOpen ? "bg-primary/20 text-primary" : "text-primary hover:bg-primary/10"
              }`}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              <span className="font-modernist text-xs font-bold text-foreground">Kurs</span>
            </button>

            <div className="h-4 w-px bg-border/60" />

            {/* Live currency converter */}
            <div className="flex flex-1 items-center justify-around gap-1">
              {(
                [
                  { code: "EGP", flag: "🇪🇬", field: "egp" },
                  { code: "IDR", flag: "🇮🇩", field: "idr" },
                  { code: "USD", flag: "🇺🇸", field: "usd" },
                ] as const
              ).map((c, i) => (
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

            {/* Rate editor popover */}
            {rateOpen && (
              <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-2xl border border-border/70 bg-card/95 shadow-2xl shadow-black/50 backdrop-blur-xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-bold text-foreground font-modernist">Atur Kurs Hari Ini</span>
                  </div>
                  <button
                    onClick={() => setRateOpen(false)}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Two simple inputs — live update */}
                <div className="space-y-2 p-4">
                  {/* EGP → IDR */}
                  <div className="group flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/40 px-4 py-3 transition-colors focus-within:border-primary/50 focus-within:bg-primary/5">
                    <span className="text-base">🇪🇬</span>
                    <span className="shrink-0 text-xs font-semibold text-muted-foreground">1 EGP =</span>
                    <input
                      type="number"
                      value={egpToIdr}
                      onChange={(e) => setEgpToIdr(parseFloat(e.target.value) || 0)}
                      className="flex-1 bg-transparent text-right text-sm font-display font-bold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      placeholder="0"
                      step="any"
                    />
                    <span className="shrink-0 text-xs font-bold text-primary">IDR</span>
                    <span className="text-base">🇮🇩</span>
                  </div>

                  {/* USD → IDR */}
                  <div className="group flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/40 px-4 py-3 transition-colors focus-within:border-primary/50 focus-within:bg-primary/5">
                    <span className="text-base">🇺🇸</span>
                    <span className="shrink-0 text-xs font-semibold text-muted-foreground">1 USD =</span>
                    <input
                      type="number"
                      value={usdToIdr}
                      onChange={(e) => setUsdToIdr(parseFloat(e.target.value) || 0)}
                      className="flex-1 bg-transparent text-right text-sm font-display font-bold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      placeholder="0"
                      step="any"
                    />
                    <span className="shrink-0 text-xs font-bold text-primary">IDR</span>
                    <span className="text-base">🇮🇩</span>
                  </div>
                </div>

                {/* Derived rate hint */}
                <div className="flex items-center justify-center gap-1.5 border-t border-border/30 px-4 py-2.5 text-[11px] text-muted-foreground">
                  <span>Otomatis:</span>
                  <span className="font-semibold text-foreground/80">
                    1 EGP ≈ {egpToUsd.toFixed(5)} USD
                  </span>
                  <span>·</span>
                  <span className="font-semibold text-foreground/80">
                    1 USD ≈ {(usdToIdr / egpToIdr).toFixed(2)} EGP
                  </span>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </section>
  );
};

export default HeroChat;
