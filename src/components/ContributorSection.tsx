import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Users, CheckCircle, Star, BookOpen, Award } from "lucide-react";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInView } from "@/hooks/useInView";

const benefits = [
  { icon: Star, text: "Dapatkan badge Contributor eksklusif di profil kamu" },
  { icon: BookOpen, text: "Kontribusi artikel pengetahuan untuk membantu sesama mahasiswa" },
  { icon: Award, text: "Naik level menjadi Senior Contributor dengan kontribusi aktif" },
  { icon: Users, text: "Bergabung dengan komunitas kontributor AINA" },
];

const requirements = [
  "Mahasiswa Indonesia aktif di Mesir",
  "Bersedia berbagi pengetahuan dan pengalaman",
  "Mengisi formulir pendaftaran dengan lengkap",
  "Verifikasi oleh admin sebelum mendapatkan peran kontributor",
];

const ContributorSection = () => {
  const navigate = useNavigate();
  const { ref: sectionRef, inView: visible } = useInView<HTMLElement>();

  const handleGoContributor = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      navigate("/dashboard?tab=contributor");
    } else {
      navigate("/login", { state: { redirectAfter: "/dashboard?tab=contributor" } });
    }
  }, [navigate]);

  return (
    <section ref={sectionRef} className="relative py-20 px-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-purple-subtle/15 to-background" />
        <div className="absolute left-1/4 top-1/3 h-[300px] w-[300px] rounded-full bg-primary/8 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl">
        <div className={`mb-14 text-center transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            Jadi <span className="text-gradient-purple">Kontributor</span>
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Bantu sesama mahasiswa Indonesia di Mesir dengan berbagi pengetahuan dan pengalamanmu.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className={`rounded-2xl border border-border/50 bg-card/40 backdrop-blur-xl p-6 transition-all duration-700 delay-200 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            <h3 className="mb-4 font-display text-lg font-semibold text-foreground">Keuntungan Kontributor</h3>
            <div className="space-y-3">
              {benefits.map((b) => (
                <div key={b.text} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
                    <b.icon className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">{b.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className={`rounded-2xl border border-border/50 bg-card/40 backdrop-blur-xl p-6 transition-all duration-700 delay-400 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            <h3 className="mb-4 font-display text-lg font-semibold text-foreground">Ketentuan</h3>
            <div className="space-y-3">
              {requirements.map((r) => (
                <div key={r} className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-sm text-muted-foreground">{r}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={`mt-10 text-center transition-all duration-700 delay-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <Button variant="hero" size="lg" onClick={handleGoContributor}>
            <Users className="mr-2 h-4 w-4" />
            Daftar Jadi Kontributor
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            Kamu akan diarahkan ke formulir pendaftaran.
          </p>
        </div>
      </div>
    </section>
  );
};

export default ContributorSection;
