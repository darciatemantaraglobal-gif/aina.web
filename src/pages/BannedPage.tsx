import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ShieldOff } from "lucide-react";
import ainaLogo from "@/assets/aina-logo.png";

const BannedPage = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-background px-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/8 blur-[100px]" />
      </div>

      <img src={ainaLogo} alt="AINA" className="h-14 w-14 object-contain opacity-50" />

      <div className="flex flex-col items-center gap-3 text-center max-w-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10">
          <ShieldOff className="h-7 w-7 text-red-400" />
        </div>
        <h1 className="text-lg font-bold text-foreground">Akun Ditangguhkan</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Akun kamu telah ditangguhkan oleh admin karena melanggar ketentuan penggunaan AINA.
          Jika kamu merasa ini adalah kesalahan, hubungi tim kami.
        </p>
        <button
          onClick={handleLogout}
          className="mt-2 rounded-xl border border-border px-6 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          Keluar
        </button>
      </div>
    </div>
  );
};

export default BannedPage;
