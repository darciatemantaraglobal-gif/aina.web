import { Link } from "react-router-dom";

const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/20 bg-background/40 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-6 py-4">
        <p className="text-xs text-muted-foreground/40 text-center">
          © {year} AINA
        </p>
      </div>
    </footer>
  );
};

export default Footer;
