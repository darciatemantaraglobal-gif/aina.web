import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ainaLogo from "@/assets/aina-logo.png";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // Supabase JS v2 automatically parses the token from the URL hash/query.
    // We listen for the auth state change — SIGNED_IN fires once session is ready.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        navigate("/dashboard", { replace: true });
      } else if (event === "PASSWORD_RECOVERY") {
        navigate("/reset-password", { replace: true });
      }
    });

    // Also try getSession immediately in case the client already parsed the token
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        setStatus("error");
        setErrorMsg(error.message);
        return;
      }
      if (session) {
        navigate("/dashboard", { replace: true });
      }
    });

    // Timeout fallback — if nothing fires after 8s, show error
    const timeout = setTimeout(() => {
      setStatus("error");
      setErrorMsg("Verifikasi membutuhkan waktu terlalu lama. Coba login kembali.");
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-[100px]" />
      </div>

      <img
        src={ainaLogo}
        alt="AINA"
        className="h-14 w-14 object-contain drop-shadow-[0_0_20px_hsl(270_80%_65%/0.5)]"
      />

      {status === "loading" && (
        <div className="flex flex-col items-center gap-3 text-center">
          {/* Spinner */}
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          <p className="text-sm font-medium text-foreground">Memverifikasi akun...</p>
          <p className="text-xs text-muted-foreground">Mohon tunggu sebentar</p>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-medium text-foreground">Verifikasi gagal</p>
          <p className="text-xs text-muted-foreground">{errorMsg}</p>
          <button
            onClick={() => navigate("/login")}
            className="mt-2 rounded-xl bg-gradient-purple px-6 py-2 text-sm font-semibold text-primary-foreground"
          >
            Kembali ke Login
          </button>
        </div>
      )}
    </div>
  );
};

export default AuthCallback;
