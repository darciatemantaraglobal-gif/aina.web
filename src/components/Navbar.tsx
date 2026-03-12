import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import ainaLogo from "@/assets/aina-logo.png";

const navItems = [
  { label: "Features", href: "/features" },
  { label: "Berita", href: "/berita" },
  { label: "Contributor", href: "/contributor" },
  { label: "Partner", href: "/partner" },
  { label: "Pricing", href: "/pricing" },
];

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-14 items-center justify-between px-4 sm:h-16">
        <Link to="/" className="flex items-center gap-2">
          <img src={ainaLogo} alt="AINA" className="h-8 w-8 object-contain" />
          <span className="font-sunspire text-xl text-foreground">AINA</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.label}
              to={item.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="hero" size="sm">Login</Button>
          </Link>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-border/50 bg-background/95 backdrop-blur-xl md:hidden">
          <div className="flex flex-col px-4 py-3 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.label}
                to={item.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
