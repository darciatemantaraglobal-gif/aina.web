import { Link } from "react-router-dom";

const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/20 bg-background/40 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="text-xs text-muted-foreground/40">
            © {year} AINA
          </p>
          <div className="flex items-center gap-4">
            <Link to="/terms" className="text-xs text-muted-foreground/40 transition-colors hover:text-muted-foreground">
              Syarat & Ketentuan
            </Link>
            <Link to="/privacy" className="text-xs text-muted-foreground/40 transition-colors hover:text-muted-foreground">
              Kebijakan Privasi
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
