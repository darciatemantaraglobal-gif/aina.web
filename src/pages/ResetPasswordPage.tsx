import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Eye, EyeOff, CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ainaLogo from "@/assets/aina-logo.png";

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true);
      } else {
        toast.error("Link reset password tidak valid atau sudah kedaluwarsa.");
        navigate("/login");
      }
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password minimal 6 karakter");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Password dan konfirmasi tidak cocok");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => navigate("/dashboard"), 2500);
    } catch (err: any) {
      toast.error(err.message || "Gagal mereset password");
    } finally {
      setLoading(false);
    }
  };

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src={ainaLogo} alt="AINA" className="h-12 w-12 object-contain" />
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">Buat Password Baru</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Masukkan password baru untuk akun AINA-mu</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-6">
          {done ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Password berhasil diubah!</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Kamu akan diarahkan ke dashboard dalam beberapa detik...
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Password Baru</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimal 6 karakter"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Konfirmasi Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Ulangi password baru"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-9 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="mt-1 w-full gap-2 bg-gradient-purple text-primary-foreground shadow-[0_0_16px_hsl(270_80%_65%/0.3)] hover:opacity-90"
                disabled={loading}
              >
                {loading ? "Menyimpan..." : "Simpan Password Baru"}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
