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

const waNumber = "6281311506025";
const waMessage = encodeURIComponent("Halo, saya tertarik untuk menjadi partner AINA. Bisa jelaskan lebih lanjut?");

const PartnerSection = () => {
  const { ref: sectionRef, inView: visible } = useInView<HTMLElement>();

  return (
    <section ref={sectionRef} className="relative py-20 px-4 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background via-purple-subtle/10 to-background" />

      <div className={`relative z-10 mx-auto max-w-4xl transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <div className="flex flex-col sm:flex-row rounded-2xl overflow-hidden border border-border/50 shadow-xl">

          {/* ── Left panel — image background ── */}
          <div
            className="sm:w-56 shrink-0 min-h-[180px] sm:min-h-0 bg-cover bg-center relative"
            style={{ backgroundImage: "url('/partner-bg.jpg')" }}
          >
            {/* Overlay so text stays readable */}
            <div className="absolute inset-0 bg-black/30" />
            <div className="relative h-full flex flex-col justify-between px-7 py-8">
              <div>
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">Our</p>
                <h2 className="font-display text-4xl sm:text-5xl font-black text-white leading-[1.05] mt-1">
                  PART<br />NER
                </h2>
              </div>
              <p className="text-xs text-white/40 leading-relaxed hidden sm:block">
                Kolaborasi terpercaya untuk komunitas Masisir.
              </p>
            </div>
          </div>

          {/* ── Right panel: logo grid ── */}
          <div className="flex-1 bg-card/30">
            {/* Logo row — only logos, no labels */}
            <div className="grid grid-cols-2 divide-x divide-border/50">
              {PARTNERS.map((p) => (
                <div
                  key={p.name}
                  className="flex items-center justify-center px-8 py-10 hover:bg-primary/[0.04] transition-colors duration-200 group"
                >
                  <img
                    src={p.logo}
                    alt={p.name}
                    className={`object-contain opacity-55 group-hover:opacity-100 transition-opacity duration-300 ${p.wide ? "h-9 w-28" : "h-14 w-14"}`}
                  />
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="h-px bg-border/50" />

            {/* Footer bar */}
            <div className="flex items-center justify-between px-6 py-3">
              <p className="text-[10px] text-muted-foreground/30 uppercase tracking-widest">Partner Resmi</p>
              <a
                href={`https://wa.me/${waNumber}?text=${waMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] font-medium text-primary/50 hover:text-primary transition-colors group"
              >
                <MessageCircle className="h-3 w-3" />
                Daftar Partnership
                <ArrowRight className="h-3 w-3 opacity-0 -translate-x-0.5 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150" />
              </a>
            </div>
          </div>

        </div>

        {/* ── CTA ── */}
        <div className={`mt-6 transition-all duration-700 delay-200 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
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
