import { MessageCircle, ArrowRight, Plus } from "lucide-react";
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

          {/* ── Left panel ── */}
          <div className="sm:w-56 shrink-0 flex flex-col justify-between bg-gradient-to-br from-[#1a1040] via-[#160d38] to-[#0d0824] px-7 py-8">
            <div>
              <p className="font-display text-[13px] font-semibold uppercase tracking-[0.18em] text-white/50">Our</p>
              <h2 className="font-display text-4xl sm:text-5xl font-black text-white leading-[1.05] mt-1">
                PARTNER
              </h2>
              <div className="mt-3 flex items-center gap-2">
                <img src="/aina-icon.png" alt="AINA" className="h-6 w-6 object-contain opacity-80" />
                <span className="text-xs font-bold tracking-widest text-primary/80 uppercase">AINA</span>
              </div>
            </div>
            <p className="mt-8 sm:mt-0 text-xs text-white/35 leading-relaxed">
              Kolaborasi kami dengan mitra terpercaya untuk mendukung komunitas Masisir.
            </p>
          </div>

          {/* ── Right panel: logo grid ── */}
          <div className="flex-1 bg-card/30">
            {/* Row 1 */}
            <div className="grid grid-cols-2 divide-x divide-border/50">
              {PARTNERS.map((p) => (
                <div
                  key={p.name}
                  className="flex flex-col items-center justify-center gap-2.5 px-6 py-8 hover:bg-primary/[0.04] transition-colors duration-200 group"
                >
                  <img
                    src={p.logo}
                    alt={p.name}
                    className={`object-contain opacity-60 group-hover:opacity-100 transition-opacity duration-300 ${p.wide ? "h-9 w-28" : "h-12 w-12"}`}
                  />
                  <span className="text-[11px] font-semibold tracking-wide text-muted-foreground/50 group-hover:text-muted-foreground transition-colors duration-200 uppercase">
                    {p.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="h-px bg-border/50" />

            {/* Row 2 — CTA + placeholder */}
            <div className="grid grid-cols-2 divide-x divide-border/50">
              {/* Join slot */}
              <a
                href={`https://wa.me/${waNumber}?text=${waMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center gap-2 px-6 py-8 hover:bg-primary/[0.06] transition-colors duration-200 group"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-primary/40 group-hover:border-primary/80 group-hover:bg-primary/10 transition-all duration-200">
                  <Plus className="h-4 w-4 text-primary/50 group-hover:text-primary transition-colors" />
                </div>
                <div className="text-center">
                  <p className="text-[11px] font-semibold text-muted-foreground/40 group-hover:text-primary/70 transition-colors uppercase tracking-wide">
                    Jadi Partner
                  </p>
                  <p className="text-[10px] text-muted-foreground/30 group-hover:text-muted-foreground/50 transition-colors mt-0.5">
                    Hubungi kami
                  </p>
                </div>
              </a>

              {/* Coming soon slot */}
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-8 opacity-30">
                <div className="h-10 w-10 rounded-full border border-dashed border-border/60" />
                <p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wide">Segera</p>
              </div>
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
      </div>
    </section>
  );
};

export default PartnerSection;
