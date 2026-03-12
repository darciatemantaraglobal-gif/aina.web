import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";

const navItems = [
  { label: "Home", href: "#" },
  { label: "Features", href: "#features" },
  { label: "Berita", href: "#berita" },
  { label: "Contributor", href: "#contributor" },
  { label: "Partner", href: "#partner" },
  { label: "Pricing", href: "#pricing" },
];

const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-purple">
            <Bot className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-bold text-foreground">AINA</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </div>

        <Link to="/login">
          <Button variant="hero" size="sm">Login</Button>
        </Link>
      </div>
    </nav>
  );
};

export default Navbar;
