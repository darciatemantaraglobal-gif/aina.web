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
    description: "Tiket perjalanan mudah, cepat, amanah",
    badge: "Travel Partner",
    wide: true,
  },
  {
    logo: "/ppmi-mesir-logo.png",
    name: "PPMI Mesir",
    description: "Persatuan Pelajar & Mahasiswa Indonesia",
    badge: "Community Partner",
  },
];

const PartnerSection = () => {
  const { ref: sectionRef, inView: visible } = useInView<HTMLElement>();

  const waNumber = "6281311506025";
  const waMessage = encodeURIComponent("Halo, saya tertarik untuk menjadi partner AINA. Bisa jelaskan lebih lanjut?");

  return (
    <section ref={sectionRef} className="relative py-20 px-4 overflow-hidden">
      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-purple-subtle/20 to-background" />
        <div className="absolute left-1/4 top-1/3 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute right-1/4 bottom-1/3 h-48 w-48 rounded-full bg-purple-500/5 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-lg">
        {/* Header */}
        <div className={`text-center transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 backdrop-blur-sm border border-primary/20">
            <Handshake className="h-6 w-6 text-primary" />
          </div>
          <h2 className="font-display text-3xl font-bold text-foreground">
            Partner <span className="text-gradient-purple">AINA</span>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto">
            Kolaborasi dengan ekosistem terpercaya untuk Masisir.
          </p>
        </div>

        {/* Divider */}
        <div className={`mt-8 flex items-center gap-4 transition-all duration-700 delay-100 ${visible ? "opacity-100" : "opacity-0"}`}>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/50">Partner Resmi</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>

        {/* Partner list — no cards, clean rows */}
        <div className={`mt-6 space-y-5 transition-all duration-700 delay-150 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          {PARTNERS.map((p) => (
            <div key={p.name} className="flex items-center gap-4">
              {/* Logo */}
              <img
                src={p.logo}
                alt={p.name}
                className={`shrink-0 object-contain ${p.wide ? "h-10 w-28" : "h-12 w-12"}`}
              />
              {/* Divider */}
              <div className="w-px self-stretch bg-border/50" />
              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{p.name}</p>
                  <span className="inline-flex items-center rounded-full bg-primary/8 border border-primary/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary/60">
                    {p.badge}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className={`mt-10 transition-all duration-700 delay-300 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="relative rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card/60 to-purple-500/5 backdrop-blur-xl px-6 py-8 text-center overflow-hidden">
            <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 h-24 w-40 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative">
              <p className="font-display text-xl font-bold text-gradient-purple">Bergabung Sebagai Partner</p>
              <p className="mt-1.5 text-xs text-muted-foreground max-w-xs mx-auto">
                Jangkau 15.000+ mahasiswa Indonesia di Mesir. Hubungi kami sekarang.
              </p>
              <a
                href={`https://wa.me/${waNumber}?text=${waMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-block"
              >
                <Button variant="hero" size="default" className="group/btn">
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
