import { Bot, ListTodo, DollarSign, FileText } from "lucide-react";

const features = [
  {
    icon: Bot,
    title: "Chat AI",
    description:
      "Dapatkan informasi dari internet dan memory yang diinput oleh kontributor. Tanyakan apa saja seputar kehidupan di Mesir!",
  },
  {
    icon: ListTodo,
    title: "Productivity",
    description:
      "Notes & Tasks, serta prioritas belajar yang dipersonalisasi sesuai kebutuhanmu setelah login.",
  },
  {
    icon: DollarSign,
    title: "Kurs Mata Uang",
    description:
      "Cek kurs real-time EGP ↔ IDR ↔ USD menggunakan data terkini dari XE.",
  },
  {
    icon: FileText,
    title: "Panduan Administrasi",
    description:
      "Informasi lengkap tentang Iqomah, Paspor, Daftar Kuliah, Visa Entry Mesir, VOA Mesir, dan lainnya.",
  },
];

const FeaturesSection = () => {
  return (
    <section id="features" className="relative py-24 px-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-0 top-1/2 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-primary/5 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl">
        <div className="mb-16 text-center">
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            Fitur <span className="text-gradient-purple">Unggulan</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            Semua yang kamu butuhkan untuk kehidupan mahasiswa di Mesir, dalam satu platform.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:glow-purple-sm"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-purple">
                <f.icon className="h-6 w-6 text-primary-foreground" />
              </div>
              <h3 className="mb-2 font-display text-lg font-semibold text-foreground">
                {f.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
