import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Users, CheckCircle, Star, BookOpen, Award } from "lucide-react";

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
  return (
    <section id="contributor" className="py-24 px-4">
      <div className="mx-auto max-w-4xl">
        <div className="mb-16 text-center">
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            Jadi <span className="text-gradient-purple">Kontributor</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            Bantu sesama mahasiswa Indonesia di Mesir dengan berbagi pengetahuan dan pengalamanmu.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Benefits */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="mb-4 font-display text-lg font-semibold text-foreground">
              Keuntungan Kontributor
            </h3>
            <div className="space-y-4">
              {benefits.map((b) => (
                <div key={b.text} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <b.icon className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">{b.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Requirements */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="mb-4 font-display text-lg font-semibold text-foreground">
              Ketentuan
            </h3>
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

        <div className="mt-10 text-center">
          <Link to="/login" state={{ redirectTo: "/dashboard", tab: "contributor" }}>
            <Button variant="hero" size="lg">
              <Users className="mr-2 h-4 w-4" />
              Daftar Jadi Kontributor
            </Button>
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">
            Kamu akan diminta login dan mengisi formulir pendaftaran.
          </p>
        </div>
      </div>
    </section>
  );
};

export default ContributorSection;
