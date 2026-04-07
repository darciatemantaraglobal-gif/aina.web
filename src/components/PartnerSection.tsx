import { Handshake, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInView } from "@/hooks/useInView";

const PartnerSection = () => {
  const { ref: sectionRef, inView: visible } = useInView<HTMLElement>();

  const waNumber = "6281311506025";
  const waMessage = encodeURIComponent("Halo, saya tertarik untuk menjadi partner AINA. Bisa jelaskan lebih lanjut?");

  return (
    <section ref={sectionRef} className="relative py-20 px-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-purple-subtle/15 to-background" />
      </div>

      <div className={`relative z-10 mx-auto max-w-2xl text-center transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 backdrop-blur-sm border border-primary/20">
          <Handshake className="h-7 w-7 text-primary" />
        </div>
        <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
          Jadi <span className="text-gradient-purple">Partner</span>
        </h2>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          Kolaborasi dengan AINA untuk menjangkau komunitas mahasiswa Indonesia di Mesir.
        </p>

        {/* Partner logos */}
        <div className={`mt-10 space-y-3 transition-all duration-700 delay-150 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Partner Resmi</p>
          <div className="flex flex-wrap items-center justify-center gap-6">
            <div className="flex items-center justify-center rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm px-8 py-5">
              <img
                src="/temantiket-logo.png"
                alt="Temantiket — mudah, cepat, amanah"
                className="h-10 object-contain opacity-90 hover:opacity-100 transition-opacity"
              />
            </div>
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm px-8 py-5">
              <img
                src="/ppmi-mesir-logo.png"
                alt="PPMI Mesir — Persatuan Pelajar & Mahasiswa Indonesia"
                className="h-14 w-14 object-contain opacity-90 hover:opacity-100 transition-opacity"
              />
              <span className="text-[10px] font-semibold tracking-wide text-muted-foreground/70 uppercase">PPMI Mesir</span>
            </div>
          </div>
        </div>

        <div className={`mt-8 rounded-2xl border border-border/50 bg-card/40 backdrop-blur-xl px-8 py-14 transition-all duration-700 delay-300 ${visible ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}>
          <p className="font-display text-2xl font-bold text-gradient-purple">Bergabung Sebagai Partner</p>
          <p className="mt-3 text-sm text-muted-foreground">
            Program partnership sedang disiapkan. Tertarik? Hubungi kami!
          </p>
          <a href={`https://wa.me/${waNumber}?text=${waMessage}`} target="_blank" rel="noopener noreferrer" className="mt-6 inline-block">
            <Button variant="hero" size="lg">
              <MessageCircle className="mr-2 h-4 w-4" />
              Hubungi via WhatsApp
            </Button>
          </a>
        </div>
      </div>
    </section>
  );
};

export default PartnerSection;
