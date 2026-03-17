import { Link } from "react-router-dom";
import ainaLogo from "@/assets/aina-logo.png";

const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/40 bg-background/60 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2 md:col-span-1">
            <Link to="/" className="mb-3 flex items-center gap-2">
              <img src={ainaLogo} alt="AINA" className="h-7 w-7 object-contain" />
              <span className="font-sunspire text-lg text-foreground tracking-wider">AINA</span>
            </Link>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Asisten pintar khusus mahasiswa Indonesia di Mesir. Temukan jawaban, kelola aktivitas, dan tumbuh bersama komunitas.
            </p>
          </div>

          {/* Platform */}
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">Platform</p>
            <ul className="space-y-2.5">
              {[
                { label: "Features", to: "/features" },
                { label: "Pricing", to: "/pricing" },
                { label: "Berita Masisir", to: "/berita" },
              ].map(({ label, to }) => (
                <li key={to}>
                  <Link to={to} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Komunitas */}
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">Komunitas</p>
            <ul className="space-y-2.5">
              {[
                { label: "Jadi Kontributor", to: "/contributor" },
                { label: "Jadi Partner", to: "/partner" },
                { label: "Masuk / Daftar", to: "/login" },
              ].map(({ label, to }) => (
                <li key={to}>
                  <Link to={to} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">Legal</p>
            <ul className="space-y-2.5">
              {[
                { label: "Syarat & Ketentuan", to: "/terms" },
                { label: "Kebijakan Privasi", to: "/terms#privacy" },
              ].map(({ label, to }) => (
                <li key={to}>
                  <Link to={to} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border/30 pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground/60">
            © {year} AINA. Dibuat dengan ❤️ untuk Masisir.
          </p>
          <p className="text-xs text-muted-foreground/40">
            Asisten Pintar Khusus Mahasiswa Indonesia di Mesir
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
