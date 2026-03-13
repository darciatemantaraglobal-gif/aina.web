import { Bot, ListTodo, DollarSign, FileText, ArrowUpRight, Check, MessageSquare, TrendingUp, BookOpen, Shield, Map, Plane } from "lucide-react";
import { useState, useEffect } from "react";

const adminTopics = [
  { icon: Shield, label: "Iqomah & Residensi" },
  { icon: Plane, label: "Visa & VOA Mesir" },
  { icon: BookOpen, label: "Daftar Kuliah Al-Azhar" },
  { icon: Map, label: "Panduan Paspor" },
];

const chatMessages = [
  { role: "user", text: "Bagaimana cara urus Iqomah pertama kali?" },
  { role: "ai", text: "Untuk Iqomah pertama, kamu perlu menyiapkan paspor, foto, dan formulir dari KBRI Kairo..." },
  { role: "user", text: "Di mana makanan halal di Kairo?" },
];

const taskItems = [
  { done: true, text: "Perpanjang Iqomah" },
  { done: true, text: "Daftar ulang semester" },
  { done: false, text: "Kirim berkas ke KBRI" },
  { done: false, text: "Bayar biaya kuliah" },
  { done: false, text: "Buat jadwal belajar" },
];

const FeaturesSection = () => {
  const [visible, setVisible] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="relative overflow-hidden px-4 py-20">

      {/* Dotted grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(circle, hsl(270 60% 55% / 0.2) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Ambient glow orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/3 top-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/8 blur-[140px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-purple-glow/5 blur-[120px]" />
        <div className="absolute -left-24 bottom-1/3 h-[300px] w-[300px] rounded-full bg-primary/5 blur-[100px]" />
      </div>

      <div
        className={`relative z-10 mx-auto max-w-6xl transition-all duration-700 ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        {/* ── Header ── */}
        <div className="mb-16 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="font-modernist text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
              Platform AINA
            </span>
          </div>

          <h2 className="font-display text-4xl font-bold leading-tight text-foreground sm:text-5xl lg:text-6xl">
            Dirancang untuk
            <br />
            <span className="text-gradient-purple">Mahasiswa Modern</span>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            Semua yang kamu butuhkan untuk kehidupan mahasiswa di Mesir, dalam satu platform cerdas.
          </p>
        </div>

        {/* ── Bento Grid ── */}
        <div className="grid auto-rows-[200px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">

          {/* ── Card 1: Chat AI — wide, tall ── */}
          <div
            className="group relative col-span-1 row-span-2 overflow-hidden rounded-2xl border border-border/50 bg-card/50 backdrop-blur-xl transition-all duration-500 hover:border-primary/40 sm:col-span-2 lg:col-span-2"
            style={{ transitionDelay: "100ms" }}
          >
            {/* Big background number */}
            <span className="pointer-events-none absolute -right-4 -top-6 select-none font-display text-[9rem] font-black text-primary/5 leading-none">
              01
            </span>

            {/* Animated glow sweep */}
            <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
              <div className="absolute -top-20 left-1/2 h-40 w-[60%] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
            </div>

            <div className="flex h-full flex-col justify-between p-6 sm:p-8">
              {/* Top: label + icon */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                    <Bot className="h-3 w-3" />
                    AI-Powered
                  </div>
                  <h3 className="font-display text-2xl font-bold text-foreground sm:text-3xl">Chat AI</h3>
                  <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
                    Tanyakan apa saja seputar kehidupan di Mesir — administrasi, kuliah, tempat tinggal, dan lebih banyak lagi.
                  </p>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-purple shadow-lg shadow-primary/30">
                  <Bot className="h-5 w-5 text-white" />
                </div>
              </div>

              {/* Chat preview */}
              <div className="space-y-2 rounded-xl border border-border/50 bg-background/50 p-3">
                {chatMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex gap-2 transition-all duration-500 ${
                      visible ? "opacity-100 translate-x-0" : m.role === "user" ? "opacity-0 translate-x-4" : "opacity-0 -translate-x-4"
                    }`}
                    style={{ transitionDelay: `${400 + i * 200}ms` }}
                  >
                    {m.role === "ai" && (
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gradient-purple">
                        <Bot className="h-3 w-3 text-white" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-xl px-3 py-1.5 text-xs leading-relaxed ${
                        m.role === "user"
                          ? "ml-auto bg-primary/15 text-foreground"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {m.text}
                      {i === chatMessages.length - 1 && m.role === "user" && (
                        <span className="ml-1 inline-flex gap-0.5">
                          {[0, 1, 2].map((j) => (
                            <span
                              key={j}
                              className="inline-block h-1 w-1 rounded-full bg-primary/60 animate-bounce"
                              style={{ animationDelay: `${j * 150}ms` }}
                            />
                          ))}
                        </span>
                      )}
                    </div>
                    {m.role === "user" && (
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-secondary">
                        <span className="text-[10px]">👤</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Bottom CTA */}
              <div className="flex items-center gap-1.5 text-xs font-medium text-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <span>Mulai chat</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>

          {/* ── Card 2: Productivity — right column, tall ── */}
          <div
            className="group relative col-span-1 row-span-2 overflow-hidden rounded-2xl border border-border/50 bg-card/50 backdrop-blur-xl transition-all duration-500 hover:border-primary/40"
            style={{ transitionDelay: "200ms" }}
          >
            <span className="pointer-events-none absolute -right-4 -top-6 select-none font-display text-[9rem] font-black text-primary/5 leading-none">
              02
            </span>

            <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
              <div className="absolute -top-10 left-1/2 h-32 w-[80%] -translate-x-1/2 rounded-full bg-primary/8 blur-3xl" />
            </div>

            <div className="flex h-full flex-col p-6">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                    <ListTodo className="h-3 w-3" />
                    Produktivitas
                  </div>
                  <h3 className="font-display text-xl font-bold text-foreground">Tasks & Notes</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Kelola jadwal dan catatan harianmu.
                  </p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-purple shadow-lg shadow-primary/30">
                  <ListTodo className="h-4 w-4 text-white" />
                </div>
              </div>

              {/* Task list */}
              <div className="flex-1 space-y-2">
                {taskItems.map((task, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-all duration-500 ${
                      task.done
                        ? "border-primary/20 bg-primary/5"
                        : "border-border/40 bg-secondary/30"
                    } ${visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"}`}
                    style={{ transitionDelay: `${300 + i * 100}ms` }}
                  >
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        task.done ? "border-primary bg-primary" : "border-border/60"
                      }`}
                    >
                      {task.done && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                    <span
                      className={`text-xs transition-colors ${
                        task.done ? "text-muted-foreground line-through" : "text-foreground"
                      }`}
                    >
                      {task.text}
                    </span>
                  </div>
                ))}
              </div>

              {/* Progress */}
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Progress hari ini</span>
                  <span className="font-semibold text-primary">40%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gradient-purple transition-all duration-1000"
                    style={{ width: visible ? "40%" : "0%" }}
                  />
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <span>Buka dashboard</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>

          {/* ── Card 3: Kurs Mata Uang ── */}
          <div
            className="group relative col-span-1 overflow-hidden rounded-2xl border border-border/50 bg-card/50 backdrop-blur-xl transition-all duration-500 hover:border-primary/40"
            style={{ transitionDelay: "300ms" }}
          >
            <span className="pointer-events-none absolute -right-3 -top-4 select-none font-display text-[7rem] font-black text-primary/5 leading-none">
              03
            </span>

            <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
              <div className="absolute -top-8 left-1/2 h-24 w-3/4 -translate-x-1/2 rounded-full bg-primary/8 blur-3xl" />
            </div>

            <div className="flex h-full flex-col justify-between p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                    <TrendingUp className="h-3 w-3" />
                    Live
                  </div>
                  <h3 className="font-display text-lg font-bold text-foreground">Kurs Mata Uang</h3>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-purple shadow-lg shadow-primary/30">
                  <DollarSign className="h-4 w-4 text-white" />
                </div>
              </div>

              {/* Rates display */}
              <div className="space-y-1.5">
                {[
                  { from: "🇪🇬 EGP", to: "🇮🇩 IDR", rate: "245" },
                  { from: "🇺🇸 USD", to: "🇮🇩 IDR", rate: "15.800" },
                ].map((r) => (
                  <div key={r.from} className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">
                      1 {r.from} →
                    </span>
                    <span className="font-display font-bold text-foreground">
                      {r.rate} {r.to}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-1.5 text-xs font-medium text-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <span>Lihat kurs lengkap</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>

          {/* ── Card 4: Panduan Administrasi ── */}
          <div
            className="group relative col-span-1 overflow-hidden rounded-2xl border border-border/50 bg-card/50 backdrop-blur-xl transition-all duration-500 hover:border-primary/40"
            style={{ transitionDelay: "400ms" }}
          >
            <span className="pointer-events-none absolute -right-3 -top-4 select-none font-display text-[7rem] font-black text-primary/5 leading-none">
              04
            </span>

            <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
              <div className="absolute -top-8 left-1/2 h-24 w-3/4 -translate-x-1/2 rounded-full bg-primary/8 blur-3xl" />
            </div>

            <div className="flex h-full flex-col justify-between p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                    <BookOpen className="h-3 w-3" />
                    Knowledge Base
                  </div>
                  <h3 className="font-display text-lg font-bold text-foreground">Panduan Admin</h3>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-purple shadow-lg shadow-primary/30">
                  <FileText className="h-4 w-4 text-white" />
                </div>
              </div>

              {/* Topic list */}
              <div className="space-y-1.5">
                {adminTopics.map((topic) => (
                  <div
                    key={topic.label}
                    className="flex items-center gap-2 rounded-lg border border-border/30 bg-secondary/30 px-3 py-1.5"
                  >
                    <topic.icon className="h-3 w-3 shrink-0 text-primary" />
                    <span className="text-xs text-foreground">{topic.label}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-1.5 text-xs font-medium text-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <span>Buka panduan</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>

        </div>

        {/* ── Bottom stat bar ── */}
        <div
          className={`mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4 transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
          style={{ transitionDelay: "600ms" }}
        >
          {[
            { num: "4+", label: "Fitur Utama" },
            { num: "100%", label: "Gratis" },
            { num: "24/7", label: "AI Aktif" },
            { num: "∞", label: "Pengetahuan" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-border/30 bg-card/30 px-4 py-4 text-center backdrop-blur-sm"
            >
              <p className="font-display text-2xl font-black text-gradient-purple">{s.num}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
