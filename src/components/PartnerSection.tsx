import { Handshake, MessageCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInView } from "@/hooks/useInView";

interface Partner {
  logo: string;
  name: string;
  description: string;
  badge: string;
  wide?: boolean;
}

const PARTNERS: Partner[] = [
  {
    logo: "/temantiket-logo.png",
    name: "Temantiket",
    description: "Tiket perjalanan mudah, cepat, amanah untuk Masisir",
    badge: "Travel Partner",
    wide: true,
  },
  {
    logo: "/ppmi-mesir-logo.png",
    name: "PPMI Mesir",
    description: "Persatuan Pelajar & Mahasiswa Indonesia di Mesir",
    badge: "Community Partner",
  },
];

const PartnerSection = () => {
  const { ref: sectionRef, inView: visible } = useInView<HTMLElement>();

  const waNumber = "6281311506025";
  const waMessage = encodeURIComponent("Halo, saya tertarik untuk menjadi partner AINA. Bisa jelaskan lebih lanjut?");

  return (
    <section ref={sectionRef} className="relative py-24 px-4 overflow-hidden">
      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-purple-subtle/20 to-background" />
        <div className="absolute left-1/4 top-1/3 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute right-1/4 bottom-1/3 h-56 w-56 rounded-full bg-purple-500/5 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl">
        {/* Header */}
        <div className={`text-center transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 backdrop-blur-sm border border-primary/20">
            <Handshake className="h-7 w-7 text-primary" />
          </div>
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            Partner <span className="text-gradient-purple">AINA</span>
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base max-w-lg mx-auto">
            Kolaborasi dengan ekosistem terpercaya untuk mendukung kehidupan mahasiswa Indonesia di Mesir.
          </p>
        </div>

        {/* Divider with label */}
        <div className={`mt-10 flex items-center gap-4 transition-all duration-700 delay-100 ${visible ? "opacity-100" : "opacity-0"}`}>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/50">Partner Resmi</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>

        {/* Partner cards */}
        <div className={`mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 transition-all duration-700 delay-150 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          {PARTNERS.map((p) => (
            <div
              key={p.name}
              className="group relative rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-6 hover:border-primary/30 hover:bg-card/70 transition-all duration-300 hover:shadow-[0_0_32px_-8px_hsl(var(--primary)/0.15)] hover:-translate-y-0.5"
            >
              {/* Badge */}
              <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/8 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary/70">
                {p.badge}
              </span>

              {/* Logo + info */}
              <div className="mt-4 flex items-center gap-4">
                <div className={`shrink-0 flex items-center justify-center rounded-xl bg-transparent shadow-[0_0_18px_-4px_hsl(var(--primary)/0.35)] ${p.wide ? "h-20 w-36 p-3" : "h-20 w-20 p-2"}`}>
                  <img
                    src={p.logo}
                    alt={p.name}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground text-sm leading-tight">{p.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{p.description}</p>
                </div>
              </div>

              {/* Subtle corner glow on hover */}
              <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-primary/[0.03] to-transparent" />
            </div>
          ))}
        </div>

        {/* CTA — Become a partner */}
        <div className={`mt-8 transition-all duration-700 delay-300 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="relative rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card/60 to-purple-500/5 backdrop-blur-xl p-8 text-center overflow-hidden">
            {/* Decorative glow */}
            <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 h-32 w-48 rounded-full bg-primary/10 blur-3xl" />

            <div className="relative">
              <p className="font-display text-2xl font-bold text-gradient-purple">Bergabung Sebagai Partner</p>
              <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
                Jangkau 15.000+ mahasiswa Indonesia di Mesir. Program partnership terbuka — hubungi kami sekarang.
              </p>
              <a
                href={`https://wa.me/${waNumber}?text=${waMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-block"
              >
                <Button variant="hero" size="lg" className="group/btn">
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Hubungi via WhatsApp
                  <ArrowRight className="ml-2 h-4 w-4 opacity-0 -translate-x-1 group-hover/btn:opacity-100 group-hover/btn:translate-x-0 transition-all duration-200" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PartnerSection;
