import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import ainaLogo from "@/assets/aina-logo.png";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { label: "Features", href: "/features" },
  { label: "Berita", href: "/berita" },
  { label: "Contributor", href: "/contributor" },
  { label: "Partner", href: "/partner" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
];

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setIsLoggedIn(!!session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setIsLoggedIn(!!session));
    return () => subscription.unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full safe-top">
      {/* Main bar */}
      <nav className="relative bg-background/30 backdrop-blur-2xl">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4 md:h-14 md:px-6">

          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-2 group"
            onClick={() => setMobileOpen(false)}
          >
            <img
              src={ainaLogo}
              alt="AINA"
              className="h-5 w-5 object-contain transition-all duration-300 group-hover:drop-shadow-[0_0_10px_hsl(270_80%_65%/0.8)] md:h-6 md:w-6"
            />
            <span className="font-sunspire text-lg text-foreground tracking-wider transition-colors duration-300 group-hover:text-primary md:text-xl">
              AINA
            </span>
          </Link>

          {/* Desktop nav links — centered */}
          <div className="hidden items-center gap-0.5 md:flex">
            {navItems.map((item) => {
              const active = location.pathname === item.href;
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  className={`relative px-3.5 py-1.5 text-sm font-medium transition-colors duration-200 ${
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                  {/* Underline glow */}
                  <span
                    className={`absolute bottom-0 left-1/2 h-px -translate-x-1/2 rounded-full bg-primary transition-all duration-300 ${
                      active ? "w-4/5 opacity-100" : "w-0 opacity-0 group-hover:w-4/5 group-hover:opacity-100"
                    }`}
                  />
                </Link>
              );
            })}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Auth-aware button */}
            {isLoggedIn ? (
              <button
                onClick={() => navigate("/dashboard")}
                className="relative overflow-hidden rounded-full bg-gradient-purple px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-[0_0_12px_hsl(270_80%_65%/0.35)] transition-all duration-300 hover:shadow-[0_0_20px_hsl(270_80%_65%/0.6)] hover:scale-105 md:px-5 md:py-2 md:text-sm"
              >
                <span className="relative z-10">Dashboard</span>
                <span className="absolute inset-0 bg-white/10 opacity-0 transition-opacity hover:opacity-100" />
              </button>
            ) : (
              <Link to="/login">
                <button className="relative overflow-hidden rounded-full bg-gradient-purple px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-[0_0_12px_hsl(270_80%_65%/0.35)] transition-all duration-300 hover:shadow-[0_0_20px_hsl(270_80%_65%/0.6)] hover:scale-105 md:px-5 md:py-2 md:text-sm">
                  <span className="relative z-10">Login</span>
                  <span className="absolute inset-0 bg-white/10 opacity-0 transition-opacity hover:opacity-100" />
                </button>
              </Link>
            )}

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground md:hidden"
            >
              <span className={`absolute transition-all duration-200 ${mobileOpen ? "opacity-100 rotate-0" : "opacity-0 rotate-90"}`}>
                <X className="h-4.5 w-4.5" />
              </span>
              <span className={`absolute transition-all duration-200 ${mobileOpen ? "opacity-0 -rotate-90" : "opacity-100 rotate-0"}`}>
                <Menu className="h-4.5 w-4.5" />
              </span>
            </button>
          </div>
        </div>

        {/* Bottom gradient line */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      </nav>

      {/* Mobile dropdown menu */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out md:hidden ${
          mobileOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="bg-background/80 backdrop-blur-2xl border-b border-border/30">
          <div className="mx-auto max-w-7xl px-4 py-3 space-y-0.5">
            {navItems.map((item) => {
              const active = location.pathname === item.href;
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200 ${
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  {item.label}
                </Link>
              );
            })}
            <div className="mt-2 border-t border-border/20 pt-2 flex items-center gap-4 px-3">
              <Link
                to="/terms"
                onClick={() => setMobileOpen(false)}
                className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                Syarat & Ketentuan
              </Link>
              <Link
                to="/privacy"
                onClick={() => setMobileOpen(false)}
                className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                Kebijakan Privasi
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
