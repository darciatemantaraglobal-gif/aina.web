import { Handshake, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

const PartnerSection = () => {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(true); }, []);

  const waNumber = "6281311506025";
  const waMessage = encodeURIComponent("Halo, saya tertarik untuk menjadi partner AINA. Bisa jelaskan lebih lanjut?");

  return (
    <section className="relative py-20 px-4">
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

        <div className={`mt-10 rounded-2xl border border-border/50 bg-card/40 backdrop-blur-xl px-8 py-14 transition-all duration-700 delay-300 ${visible ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}>
          <p className="font-display text-2xl font-bold text-gradient-purple">Coming Soon</p>
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
