import { MessageCircle, ChevronRight } from "lucide-react";
import { useInView } from "@/hooks/useInView";

const waNumber = "6281311506025";
const waMessage = encodeURIComponent("Halo, saya tertarik untuk menjadi partner AINA. Bisa jelaskan lebih lanjut?");

const PARTNERS = [
  {
    logo: "/temantiket-logo.png",
    name: "Temantiket",
    tagline: "Travel Partner",
    wide: true,
  },
  {
    logo: "/ppmi-mesir-logo.png",
    name: "PPMI Mesir",
    tagline: "Community Partner",
    wide: false,
  },
];

const PartnerSection = () => {
  const { ref, inView: visible } = useInView<HTMLElement>();

  return (
    <section ref={ref} className="relative w-full overflow-hidden bg-background py-16">

      {/* Cinematic top fade */}
      <div className="pointer-events-none absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-background to-transparent z-10" />
      {/* Cinematic bottom fade */}
      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-background to-transparent z-10" />

      {/* Full-bleed background image strip */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-20"
        style={{ backgroundImage: "url('/partner-bg.jpg')" }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-background" />

      <div className="relative z-20 px-6 sm:px-12 lg:px-20">

        {/* Row header — Netflix-style */}
        <div className={`flex items-baseline gap-3 mb-6 transition-all duration-700 ${visible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
          <h2 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight">
            Partner Resmi
          </h2>
          <a
            href={`https://wa.me/${waNumber}?text=${waMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors group"
          >
            Gabung
            <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </a>
        </div>

        {/* Partner logos row */}
        <div className={`flex items-center gap-12 sm:gap-20 transition-all duration-700 delay-100 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          {PARTNERS.map((p) => (
            <div
              key={p.name}
              className="group flex flex-col items-center gap-3 cursor-default"
            >
              <img
                src={p.logo}
                alt={p.name}
                className={`object-contain grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500 ease-out group-hover:scale-110 ${p.wide ? "h-10 w-36 sm:h-12 sm:w-44" : "h-14 w-14 sm:h-16 sm:w-16"}`}
              />
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/20 group-hover:text-white/60 transition-colors duration-300">
                {p.tagline}
              </span>
            </div>
          ))}
        </div>

        {/* CTA — Netflix-style inline */}
        <div className={`mt-16 sm:mt-20 transition-all duration-700 delay-200 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/70 mb-2">
              Jadi Bagian dari AINA
            </p>
            <h3 className="font-display text-2xl sm:text-3xl font-bold text-white leading-snug">
              Bergabung sebagai<br />
              <span className="text-gradient-purple">Partner AINA</span>
            </h3>
            <p className="mt-3 text-sm text-white/40 max-w-sm leading-relaxed">
              Jangkau 15.000+ mahasiswa Indonesia di Mesir. Program partnership terbuka untuk semua kategori.
            </p>
            <a
              href={`https://wa.me/${waNumber}?text=${waMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 group"
            >
              <MessageCircle className="h-4 w-4" />
              Hubungi via WhatsApp
              <ChevronRight className="h-4 w-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" />
            </a>
          </div>
        </div>

      </div>
    </section>
  );
};

export default PartnerSection;
