import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Clock, ArrowRightLeft, X, Sparkles } from "lucide-react";
import ainaHero from "@/assets/aina-hero.png";

const suggestions = [
  "Bagaimana cara daftar kuliah di Al-Azhar?",
  "Cara mengurus visa pelajar Mesir",
  "Rekomendasi kos murah di Cairo",
  "Jadwal ujian Azhar semester ini",
];

const HeroChat = () => {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  // Two base rates — everything else is derived
  const [egpToIdr, setEgpToIdr] = useState(245);
  const [usdToIdr, setUsdToIdr] = useState(15800);

  const egpToUsd = egpToIdr / usdToIdr;
  const idrToUsd = 1 / usdToIdr;

  const [currencies, setCurrencies] = useState({ egp: "1", idr: "245", usd: "" });

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

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    setVisible(true);
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (d: Date, tz: string) =>
    d.toLocaleTimeString("id-ID", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const formatDate = (d: Date, tz: string) =>
    d.toLocaleDateString("id-ID", { timeZone: tz, weekday: "short", day: "numeric", month: "short" });

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

      {/* ── Background ── */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-purple-subtle/10 to-background" />
        <div className="absolute left-1/2 top-1/3 h-[55vw] w-[55vw] max-h-[600px] max-w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/7 blur-[130px]" />
        <div className="absolute -top-24 -left-24 h-[50vw] w-[50vw] max-h-[420px] max-w-[420px] rounded-full bg-[radial-gradient(ellipse,hsl(270_60%_18%/0.6),transparent_70%)] blur-[70px]" />
        <div className="absolute -bottom-24 -right-24 h-[50vw] w-[50vw] max-h-[420px] max-w-[420px] rounded-full bg-[radial-gradient(ellipse,hsl(270_55%_15%/0.55),transparent_70%)] blur-[70px]" />
        <div className="absolute -top-12 -right-12 h-[28vw] w-[28vw] max-h-[240px] max-w-[240px] rounded-full bg-[radial-gradient(ellipse,hsl(280_50%_20%/0.4),transparent_70%)] blur-[55px]" />
        <div className="absolute -bottom-12 -left-12 h-[28vw] w-[28vw] max-h-[240px] max-w-[240px] rounded-full bg-[radial-gradient(ellipse,hsl(260_50%_18%/0.38),transparent_70%)] blur-[55px]" />
      </div>

      {/* ── Content wrapper ── */}
      <div
        className={`relative z-10 mx-auto flex h-full w-full max-w-7xl items-center px-6 transition-all duration-700 lg:gap-16 lg:px-16 xl:px-24 ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >

        {/* ════════════════════════════════
            LEFT COLUMN — desktop only
            ════════════════════════════════ */}
        <div className="hidden lg:flex lg:flex-1 lg:flex-col lg:items-center lg:justify-center lg:gap-8">

          {/* Hero image — large on desktop */}
          <img
            src={ainaHero}
            alt="AINA"
            className="w-auto object-contain drop-shadow-[0_0_80px_hsl(270_80%_65%/0.45)]"
            style={{ height: "clamp(14rem, 30vh, 22rem)" }}
          />

          {/* Tagline */}
          <p className="font-modernist text-center text-base leading-relaxed text-primary-foreground/75 lg:text-lg">
            Teman Pintar Mahasiswa Indonesia di Mesir
          </p>

          {/* Suggestion list — vertical on desktop */}
          <div className="flex w-full flex-col gap-2.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" />
              Coba tanyakan
            </p>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => handleSuggestion(s)}
                className="group flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/50 px-4 py-3 text-left text-sm text-secondary-foreground backdrop-blur-sm transition-all duration-200 hover:border-primary/40 hover:bg-primary/8 hover:text-foreground"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50 transition-all group-hover:bg-primary group-hover:shadow-[0_0_6px_hsl(270_80%_65%/0.8)]" />
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* ════════════════════════════════
            RIGHT COLUMN — chat + widgets
            (full width on mobile, 1/2 on desktop)
            ════════════════════════════════ */}
        <div className="flex w-full flex-col justify-evenly gap-4 py-6 lg:flex-1 lg:justify-center lg:gap-5 lg:py-0">

          {/* Mobile-only: hero image + tagline */}
          <div className="flex flex-col items-center gap-3 lg:hidden">
            <img
              src={ainaHero}
              alt="AINA"
              className="w-auto object-contain drop-shadow-[0_0_50px_hsl(270_80%_65%/0.35)]"
              style={{ height: "clamp(8rem, 22vh, 13rem)" }}
            />
            <p
              className="font-modernist text-center text-primary-foreground/80"
              style={{ fontSize: "clamp(0.85rem, 2vh, 1.05rem)" }}
            >
              Teman Pintar Mahasiswa Indonesia di Mesir
            </p>
          </div>

          {/* ── Chat Input ── */}
          <form onSubmit={handleSubmit} className="w-full">
            <div className="chatbox-border-wrapper">
              <div
                className="group relative rounded-[calc(1rem-1.5px)] bg-[hsl(240_10%_6%)] backdrop-blur-sm"
                style={{ padding: "clamp(0.5rem, 1.2vh, 0.875rem)" }}
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
                  rows={4}
                  className="w-full resize-none rounded-xl bg-transparent px-4 py-3 pr-14 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none lg:text-base"
                />
                <button
                  type="submit"
                  className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-purple text-primary-foreground transition-all hover:scale-105 hover:opacity-90 lg:h-11 lg:w-11"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </form>

          {/* Mobile-only: horizontal suggestion pills */}
          <div className="flex flex-wrap justify-center gap-2 lg:hidden">
            {suggestions.slice(0, 2).map((s) => (
              <button
                key={s}
                onClick={() => handleSuggestion(s)}
                className="rounded-full border border-border bg-secondary/80 px-3 py-1.5 text-xs text-secondary-foreground backdrop-blur-sm transition-colors hover:border-primary/40 hover:bg-primary/10"
              >
                {s}
              </button>
            ))}
          </div>

          {/* ── Utility Cards ── */}
          <div className="flex flex-col gap-2.5">

            {/* Clock Card */}
            <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/60 px-4 py-3 backdrop-blur-md lg:py-3.5">
              <div className="flex shrink-0 items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-primary" />
                <span className="font-modernist text-xs font-bold text-foreground">Waktu</span>
              </div>
              <div className="h-4 w-px bg-border/60" />
              <div className="flex flex-1 items-center justify-around gap-4">
                {[
                  { flag: "🇪🇬", label: "Mesir", time: egyptTime, date: egyptDate },
                  { flag: "🇮🇩", label: "Jakarta", time: jakartaTime, date: jakartaDate },
                ].map((city) => (
                  <div key={city.label} className="flex items-center gap-2.5">
                    <span className="text-base">{city.flag}</span>
                    <div>
                      <p className="text-[10px] leading-none text-muted-foreground">{city.label}</p>
                      <p className="font-display font-bold tabular-nums text-foreground lg:text-base">
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
              className="relative flex items-center gap-3 rounded-xl border border-border/70 bg-card/60 px-4 py-3 backdrop-blur-md lg:py-3.5"
              ref={popoverRef}
            >
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

              <div className="flex flex-1 items-center justify-around gap-1">
                {(
                  [
                    { code: "EGP", flag: "🇪🇬", field: "egp" },
                    { code: "IDR", flag: "🇮🇩", field: "idr" },
                    { code: "USD", flag: "🇺🇸", field: "usd" },
                  ] as const
                ).map((c, i) => (
                  <div key={c.code} className="flex flex-1 items-center gap-2">
                    {i > 0 && <div className="h-4 w-px bg-border/40" />}
                    <span className="text-base">{c.flag}</span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[10px] leading-none text-muted-foreground">{c.code}</span>
                      <input
                        type="number"
                        value={currencies[c.field]}
                        onChange={(e) => handleCurrencyChange(c.field, e.target.value)}
                        className="w-full bg-transparent font-display font-semibold text-foreground focus:outline-none lg:text-base [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        placeholder="0"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Rate editor popover */}
              {rateOpen && (
                <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-2xl border border-border/70 bg-card/95 shadow-2xl shadow-black/50 backdrop-blur-xl">
                  <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
                      <span className="font-modernist text-xs font-bold text-foreground">Atur Kurs Hari Ini</span>
                    </div>
                    <button
                      onClick={() => setRateOpen(false)}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="space-y-2 p-4">
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
                  <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-border/30 px-4 py-2.5 text-[11px] text-muted-foreground">
                    <span>Otomatis:</span>
                    <span className="font-semibold text-foreground/80">1 EGP ≈ {egpToUsd.toFixed(5)} USD</span>
                    <span>·</span>
                    <span className="font-semibold text-foreground/80">1 USD ≈ {(usdToIdr / egpToIdr).toFixed(2)} EGP</span>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

      </div>
    </section>
  );
};

export default HeroChat;
