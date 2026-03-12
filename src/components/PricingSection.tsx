import { Zap } from "lucide-react";
import { useState, useEffect } from "react";

const PricingSection = () => {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(true); }, []);

  return (
    <section className="relative py-20 px-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-purple-subtle/15 to-background" />
      </div>

      <div className={`relative z-10 mx-auto max-w-2xl text-center transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 backdrop-blur-sm border border-primary/20">
          <Zap className="h-7 w-7 text-primary" />
        </div>
        <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
          <span className="text-gradient-purple">Pricing</span>
        </h2>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          Rencana harga untuk fitur premium AINA.
        </p>

        <div className={`mt-10 rounded-2xl border border-border/50 bg-card/40 backdrop-blur-xl px-8 py-14 transition-all duration-700 delay-300 ${visible ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}>
          <p className="font-display text-2xl font-bold text-gradient-purple">Coming Soon</p>
          <p className="mt-3 text-sm text-muted-foreground">
            Saat ini semua fitur AINA gratis. Detail pricing akan segera diumumkan!
          </p>
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
