import { MessageCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInView } from "@/hooks/useInView";

interface Partner {
  logo: string;
  name: string;
  wide?: boolean;
}

const PARTNERS: Partner[] = [
  { logo: "/temantiket-logo.png", name: "Temantiket", wide: true },
  { logo: "/ppmi-mesir-logo.png", name: "PPMI Mesir" },
];

const PartnerSection = () => {
  const { ref: sectionRef, inView: visible } = useInView<HTMLElement>();

  const waNumber = "6281311506025";
  const waMessage = encodeURIComponent("Halo, saya tertarik untuk menjadi partner AINA. Bisa jelaskan lebih lanjut?");

  return (
    <section ref={sectionRef} className="relative py-20 px-4 overflow-hidden">
      {/* Subtle background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-purple-subtle/10 to-background" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl">

        {/* ── Main block: title left + logos right ── */}
        <div className={`flex flex-col sm:flex-row sm:items-center gap-8 sm:gap-12 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>

          {/* Left: title */}
          <div className="sm:w-52 shrink-0">
            <p className="font-display text-2xl sm:text-3xl font-bold text-foreground leading-snug">
              Dipercaya oleh<br />
              <span className="text-gradient-purple">komunitas &amp;</span><br />
              partner kami
            </p>
          </div>

          {/* Vertical divider — desktop only */}
          <div className="hidden sm:block w-px self-stretch bg-border/50" />

          {/* Right: logo grid */}
          <div className="flex-1 min-w-0">
            {/* Row 1 */}
            <div className="flex items-center gap-6 sm:gap-10 py-4">
              {PARTNERS.map((p) => (
                <div key={p.name} className="flex items-center gap-2.5 group cursor-default">
                  <img
                    src={p.logo}
                    alt={p.name}
                    className={`object-contain opacity-60 group-hover:opacity-100 transition-opacity duration-200 ${p.wide ? "h-7 w-20" : "h-8 w-8"}`}
                  />
                  <span className="text-sm font-semibold text-muted-foreground/70 group-hover:text-foreground transition-colors duration-200 whitespace-nowrap">
                    {p.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="h-px bg-border/40" />

            {/* Row 2 — "Jadi partner berikutnya" placeholder slot */}
            <div className="flex items-center py-4">
              <a
                href={`https://wa.me/${waNumber}?text=${waMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 group"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-primary/40 bg-primary/5 group-hover:border-primary/70 group-hover:bg-primary/10 transition-all duration-200">
                  <span className="text-primary/60 text-lg leading-none group-hover:text-primary transition-colors">+</span>
                </div>
                <span className="text-sm font-medium text-muted-foreground/50 group-hover:text-primary transition-colors duration-200">
                  Jadi partner berikutnya
                </span>
              </a>
            </div>
          </div>
        </div>

        {/* ── CTA ── */}
        <div className={`mt-10 transition-all duration-700 delay-200 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
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
