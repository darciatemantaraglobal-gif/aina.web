import { Bot, ListTodo, DollarSign, FileText, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";

const features = [
  {
    icon: Bot,
    title: "Chat AI",
    description: "Dapatkan informasi dari internet dan memory yang diinput oleh kontributor. Tanyakan apa saja seputar kehidupan di Mesir!",
    gradient: "from-primary to-purple-glow",
  },
  {
    icon: ListTodo,
    title: "Productivity",
    description: "Notes & Tasks, serta prioritas belajar yang dipersonalisasi sesuai kebutuhanmu setelah login.",
    gradient: "from-purple-glow to-accent",
  },
  {
    icon: DollarSign,
    title: "Kurs Mata Uang",
    description: "Cek kurs real-time EGP ↔ IDR ↔ USD menggunakan data terkini.",
    gradient: "from-accent to-primary",
  },
  {
    icon: FileText,
    title: "Panduan Administrasi",
    description: "Informasi lengkap tentang Iqomah, Paspor, Daftar Kuliah, Visa Entry Mesir, VOA Mesir, dan lainnya.",
    gradient: "from-primary to-accent",
  },
];

const FeaturesSection = () => {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(true); }, []);

  return (
    <section className="relative py-20 px-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-purple-subtle/20 to-background" />
        <div className="absolute right-0 top-1/2 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-primary/8 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl">
        <div className={`mb-14 text-center transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            Fitur <span className="text-gradient-purple">Unggulan</span>
          </h2>
          <p className="mt-3 text-muted-foreground text-sm sm:text-base">
            Semua yang kamu butuhkan untuk kehidupan mahasiswa di Mesir, dalam satu platform.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {features.map((f, i) => (
            <div
              key={f.title}
              className={`group relative overflow-hidden rounded-2xl border border-border/50 bg-card/40 backdrop-blur-xl p-6 transition-all duration-500 hover:border-primary/40 hover:bg-card/70 hover:glow-purple-sm ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{ transitionDelay: `${200 + i * 100}ms` }}
            >
              {/* Glass highlight */}
              <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/5 blur-3xl transition-all group-hover:bg-primary/10" />
              
              <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${f.gradient}`}>
                <f.icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <h3 className="mb-2 font-display text-lg font-semibold text-foreground">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{f.description}</p>
              <div className="mt-4 flex items-center gap-1 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
                <span>Pelajari</span>
                <ArrowRight className="h-3 w-3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
