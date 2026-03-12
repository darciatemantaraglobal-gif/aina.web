import { Handshake, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const PartnerSection = () => {
  const waNumber = "6281311506025";
  const waMessage = encodeURIComponent("Halo, saya tertarik untuk menjadi partner AINA. Bisa jelaskan lebih lanjut?");

  return (
    <section id="partner" className="py-24 px-4">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Handshake className="h-8 w-8 text-primary" />
        </div>
        <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
          Jadi <span className="text-gradient-purple">Partner</span>
        </h2>
        <p className="mt-4 text-muted-foreground">
          Kolaborasi dengan AINA untuk menjangkau komunitas mahasiswa Indonesia di Mesir.
        </p>

        <div className="mt-10 rounded-2xl border border-dashed border-primary/30 bg-card px-8 py-12">
          <p className="font-display text-2xl font-bold text-gradient-purple">Coming Soon</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Program partnership sedang disiapkan. Tertarik? Hubungi kami!
          </p>
          <a
            href={`https://wa.me/${waNumber}?text=${waMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-block"
          >
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
