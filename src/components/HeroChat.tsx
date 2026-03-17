import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Clock, ArrowRightLeft, X } from "lucide-react";
import ainaHero from "@/assets/aina-hero.png";
import { supabase } from "@/integrations/supabase/client";

const suggestions = [
  "Bagaimana cara daftar kuliah di Al-Azhar?",
  "Cara mengurus visa pelajar Mesir",
];

const HeroChat = () => {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsLoggedIn(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Two base rates — everything else is derived
  const [egpToIdr, setEgpToIdr] = useState(245);
  const [usdToIdr, setUsdToIdr] = useState(15800);

  const egpToUsd = egpToIdr / usdToIdr;
  const idrToUsd = 1 / usdToIdr;

  const initUsd = (1 * (egpToIdr / usdToIdr)).toFixed(4);
  const [currencies, setCurrencies] = useState({ egp: "1", idr: "245", usd: initUsd });
  const [focusedCurrency, setFocusedCurrency] = useState<string | null>(null);
  const [focusedRate, setFocusedRate] = useState<string | null>(null);

  // Format helpers — Indonesian style: dots for thousands, comma for decimal
  const fmtInt = (n: number) => Math.round(n).toLocaleString("id-ID");
  const fmtDec = (n: number, d: number) =>
    n.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });

  // Parse user input — handles plain numbers AND Indonesian-formatted (dots as thousands)
  const parseInput = (value: string): number => {
    if (!value) return 0;
    // If comma exists → Indonesian decimal format: strip dots, swap comma→dot
    if (value.includes(",")) return parseFloat(value.replace(/\./g, "").replace(",", ".")) || 0;
    // Multiple dots → all are thousands separators
    if ((value.match(/\./g) || []).length > 1) return parseFloat(value.replace(/\./g, "")) || 0;
    // Single dot: treat as thousands separator only if before-dot part is non-zero (e.g. "245.000" → 245000, but "0.015" → 0.015)
    const singleDotMatch = value.match(/^([1-9]\d*)\.(\d{3})$/);
    if (singleDotMatch) return parseFloat(value.replace(".", "")) || 0;
    return parseFloat(value) || 0;
  };

  // Smart formatter: abbreviates very large numbers so they always fit
  const fmtSmart = (n: number, field: string): string => {
    if (field === "idr") {
      if (n >= 1e12) return fmtDec(n / 1e12, 2) + " T";
      if (n >= 1e9)  return fmtDec(n / 1e9,  2) + " M";
      if (n >= 1e6)  return fmtDec(n / 1e6,  2) + " Jt";
      return fmtInt(n);
    }
    if (field === "egp") {
      if (n >= 1e6) return fmtDec(n / 1e6, 2) + " Jt";
      if (n >= 1e3) return fmtInt(n);
      return fmtDec(n, n % 1 === 0 ? 0 : 2);
    }
    if (field === "usd") {
      if (n >= 1000) return fmtInt(n);
      if (n >= 1)    return fmtDec(n, 2);
      return fmtDec(n, 4);
    }
    return String(n);
  };

  // Clean raw value for editing: remove unnecessary trailing zeros
  const cleanRaw = (raw: string): string => {
    const n = parseFloat(raw);
    if (isNaN(n)) return raw;
    return parseFloat(n.toPrecision(10)).toString();
  };

  const getCurrencyClass = (displayValue: string) => {
    const len = displayValue.length;
    if (len <= 7)  return "currency-val-short";
    if (len <= 11) return "currency-val-medium";
    return "currency-val-long";
  };

  const getDisplayValue = (field: string, raw: string) => {
    if (focusedCurrency === field) return cleanRaw(raw);
    const n = parseFloat(raw);
    if (isNaN(n)) return raw;
    return fmtSmart(n, field);
  };

  useEffect(() => {
    const egp = parseInput(currencies.egp) || 1;
    setCurrencies({
      egp: currencies.egp,
      idr: (egp * egpToIdr).toFixed(0),
      usd: (egp * egpToUsd).toFixed(6),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [egpToIdr, usdToIdr]);

  const handleCurrencyChange = (field: string, value: string) => {
    const num = parseInput(value);
    if (field === "egp") {
      setCurrencies({ egp: value, idr: (num * egpToIdr).toFixed(0), usd: (num * egpToUsd).toFixed(6) });
    } else if (field === "idr") {
      setCurrencies({ egp: (num / egpToIdr).toFixed(6), idr: value, usd: (num * idrToUsd).toFixed(6) });
    } else {
      setCurrencies({ egp: (num / egpToUsd).toFixed(6), idr: (num * usdToIdr).toFixed(0), usd: value });
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
    if (isLoggedIn) {
      if (message.trim()) sessionStorage.setItem("pendingMessage", message.trim());
      navigate("/dashboard");
    } else {
      if (message.trim()) navigate("/login", { state: { pendingMessage: message } });
    }
  };

  const handleSuggestion = (text: string) => {
    if (isLoggedIn) {
      sessionStorage.setItem("pendingMessage", text);
      navigate("/dashboard");
    } else {
      navigate("/login", { state: { pendingMessage: text } });
    }
  };

  return (
    <section className="relative flex h-full">

      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-purple-subtle/10 to-background" />
        <div className="absolute left-1/2 top-1/3 h-[60vw] w-[60vw] max-h-[500px] max-w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute right-1/4 bottom-1/4 h-[30vw] w-[30vw] max-h-[300px] max-w-[300px] rounded-full bg-accent/5 blur-[100px]" />
        <div className="absolute -top-24 -left-24 h-[50vw] w-[50vw] max-h-[420px] max-w-[420px] rounded-full bg-[radial-gradient(ellipse,hsl(270_60%_18%/0.6),transparent_70%)] blur-[70px]" />
        <div className="absolute -bottom-24 -right-24 h-[50vw] w-[50vw] max-h-[420px] max-w-[420px] rounded-full bg-[radial-gradient(ellipse,hsl(270_55%_15%/0.55),transparent_70%)] blur-[70px]" />
        <div className="absolute -top-12 -right-12 h-[28vw] w-[28vw] max-h-[240px] max-w-[240px] rounded-full bg-[radial-gradient(ellipse,hsl(280_50%_20%/0.4),transparent_70%)] blur-[55px]" />
        <div className="absolute -bottom-12 -left-12 h-[28vw] w-[28vw] max-h-[240px] max-w-[240px] rounded-full bg-[radial-gradient(ellipse,hsl(260_50%_18%/0.38),transparent_70%)] blur-[55px]" />
      </div>

      {/* Main content — single centered column */}
      <div
        className={`relative z-10 mx-auto flex w-full max-w-2xl flex-col justify-evenly px-4 transition-all duration-700 md:max-w-3xl ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
        style={{ paddingTop: "clamp(0.75rem, 2.5vh, 1.5rem)", paddingBottom: "clamp(0.75rem, 2.5vh, 1.5rem)" }}
      >

        {/* Hero Image */}
        <div className="flex flex-col items-center">
          <img
            src={ainaHero}
            alt="AINA"
            className="w-auto object-contain drop-shadow-[0_0_60px_hsl(270_80%_65%/0.4)]"
            style={{ height: "clamp(8rem, 26vh, 17rem)" }}
          />
        </div>

        {/* Chat Input — spinning glow border */}
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
                rows={3}
                className="w-full resize-none rounded-xl bg-transparent px-4 py-3 pr-14 text-foreground placeholder:text-muted-foreground focus:outline-none"
                style={{ fontSize: "clamp(0.9rem, 1.9vh, 1.05rem)" }}
              />
              <button
                type="submit"
                className="absolute bottom-4 right-4 flex items-center justify-center rounded-xl bg-gradient-purple text-primary-foreground transition-all hover:scale-105 hover:opacity-90"
                style={{ width: "clamp(2.2rem, 5vh, 2.75rem)", height: "clamp(2.2rem, 5vh, 2.75rem)" }}
              >
                <Send style={{ width: "clamp(0.9rem, 2vh, 1.1rem)", height: "clamp(0.9rem, 2vh, 1.1rem)" }} />
              </button>
            </div>
          </div>
        </form>

        {/* Suggestion pills */}
        <div className="flex flex-wrap justify-center gap-2">
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

            <div className="flex flex-1 items-center justify-around gap-1 overflow-hidden">
              {(
                [
                  { code: "EGP", flag: "🇪🇬", field: "egp" },
                  { code: "IDR", flag: "🇮🇩", field: "idr" },
                  { code: "USD", flag: "🇺🇸", field: "usd" },
                ] as const
              ).map((c, i) => (
                <div key={c.code} className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                  {i > 0 && <div className="h-4 w-px shrink-0 bg-border/40" />}
                  <span className="shrink-0 text-sm">{c.flag}</span>
                  <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                    <span className="text-[10px] leading-none text-muted-foreground">{c.code}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={getDisplayValue(c.field, currencies[c.field])}
                      onChange={(e) => handleCurrencyChange(c.field, e.target.value)}
                      onFocus={() => setFocusedCurrency(c.field)}
                      onBlur={() => setFocusedCurrency(null)}
                      className={`min-w-0 w-full bg-transparent font-display font-bold text-foreground tabular-nums focus:outline-none ${getCurrencyClass(getDisplayValue(c.field, currencies[c.field]))}`}
                      placeholder="0"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Rate editor popover */}
            {rateOpen && (
              <div className="absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-xl border border-border/70 bg-card/95 shadow-xl shadow-black/50 backdrop-blur-xl">
                <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Atur Kurs</span>
                  <button
                    onClick={() => setRateOpen(false)}
                    className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="space-y-1 px-3 pb-3">
                  {[
                    { flag: "🇪🇬", label: "EGP", value: egpToIdr, onChange: (v: number) => setEgpToIdr(v) },
                    { flag: "🇺🇸", label: "USD", value: usdToIdr, onChange: (v: number) => setUsdToIdr(v) },
                  ].map((r) => (
                    <div
                      key={r.label}
                      className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-secondary/40 px-2.5 py-1.5 focus-within:border-primary/50 focus-within:bg-primary/5"
                    >
                      <span className="text-sm">{r.flag}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">1 {r.label} =</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={focusedRate === r.label ? r.value.toString() : fmtInt(r.value)}
                        onChange={(e) => r.onChange(parseFloat(e.target.value.replace(/\./g, "").replace(",", ".")) || 0)}
                        onFocus={() => setFocusedRate(r.label)}
                        onBlur={() => setFocusedRate(null)}
                        className="min-w-0 flex-1 bg-transparent text-right text-xs font-display font-bold text-foreground focus:outline-none"
                        placeholder="0"
                      />
                      <span className="shrink-0 text-[10px] font-bold text-primary">IDR 🇮🇩</span>
                    </div>
                  ))}
                  <p className="pt-0.5 text-center text-[10px] text-muted-foreground">
                    1 EGP ≈ <span className="font-semibold text-foreground/70">{egpToUsd.toFixed(4)} USD</span>
                  </p>
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
