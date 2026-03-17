import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Mail, Lock, ArrowRight, ArrowLeft, X, Eye, EyeOff, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ainaLogo from "@/assets/aina-logo.png";

type View = "main" | "emailForm";
type Mode = "login" | "register";

const GoogleIcon = () => (
  <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const Login = () => {
  const navigate = useNavigate();

  const [view, setView] = useState<View>("main");
  const [mode, setMode] = useState<Mode>("register");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setVerificationSent(false);
  };

  const goToEmailForm = (m: Mode) => {
    resetForm();
    setMode(m);
    setView("emailForm");
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + "/auth/callback" },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || "Gagal login dengan Google");
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
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
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + "/auth/callback" },
      });
      if (error) throw error;
      setVerificationSent(true);
    } catch (err: any) {
      toast.error(err.message || "Gagal mendaftar");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Email atau password salah");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">

      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute -top-20 -left-20 h-[300px] w-[300px] rounded-full bg-[radial-gradient(ellipse,hsl(270_60%_18%/0.5),transparent_70%)] blur-[60px]" />
        <div className="absolute -bottom-20 -right-20 h-[300px] w-[300px] rounded-full bg-[radial-gradient(ellipse,hsl(270_55%_15%/0.45),transparent_70%)] blur-[60px]" />
      </div>

      {/* Close button */}
      <button
        onClick={() => navigate(-1)}
        className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-secondary hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>

      {/* ── MAIN VIEW — choose method ── */}
      {view === "main" && (
        <div className="relative z-10 w-full max-w-sm">
          {/* Logo + title */}
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <img src={ainaLogo} alt="AINA" className="h-14 w-14 object-contain drop-shadow-[0_0_20px_hsl(270_80%_65%/0.4)]" />
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">Selamat datang</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">Pilih cara untuk masuk ke AINA</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card/80 backdrop-blur-sm">

            {/* Google option */}
            <div className="p-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Masuk dengan akun lain
              </p>
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-secondary/60 px-4 py-3.5 text-sm font-medium text-foreground transition-all hover:border-primary/30 hover:bg-secondary disabled:opacity-50"
              >
                <GoogleIcon />
                <span className="flex-1 text-left">Lanjutkan dengan Google</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 px-5">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">atau daftar langsung</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* AINA direct options */}
            <div className="space-y-2.5 p-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Akun AINA
              </p>

              {/* Register */}
              <button
                onClick={() => goToEmailForm("register")}
                className="group flex w-full items-center gap-3 rounded-xl bg-gradient-purple px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_0_16px_hsl(270_80%_65%/0.3)] transition-all hover:shadow-[0_0_24px_hsl(270_80%_65%/0.5)] hover:opacity-95"
              >
                <Mail className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">Buat Akun Baru</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>

              {/* Login */}
              <button
                onClick={() => goToEmailForm("login")}
                className="group flex w-full items-center gap-3 rounded-xl border border-border bg-secondary/40 px-4 py-3.5 text-sm font-medium text-foreground transition-all hover:border-primary/30 hover:bg-secondary/70"
              >
                <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-left text-muted-foreground group-hover:text-foreground">
                  Sudah punya akun? Masuk
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Dengan masuk, kamu menyetujui{" "}
            <Link to="/terms" className="text-primary/80 hover:text-primary underline underline-offset-2">syarat & ketentuan</Link>{" "}
            AINA.
          </p>
        </div>
      )}

      {/* ── EMAIL FORM VIEW ── */}
      {view === "emailForm" && (
        <div className="relative z-10 w-full max-w-sm">
          {/* Back + Logo */}
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <img src={ainaLogo} alt="AINA" className="h-12 w-12 object-contain drop-shadow-[0_0_16px_hsl(270_80%_65%/0.4)]" />
            <div>
              <h1 className="font-display text-xl font-bold text-foreground">
                {mode === "register" ? "Buat Akun AINA" : "Masuk ke AINA"}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {mode === "register"
                  ? "Isi data di bawah, lalu verifikasi email"
                  : "Masukkan email dan password kamu"}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-6">

            {/* Email verification success state */}
            {verificationSent ? (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Cek email kamu!</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Kami mengirim link verifikasi ke{" "}
                    <span className="font-medium text-foreground">{email}</span>. Klik link tersebut untuk mengaktifkan akun.
                  </p>
                </div>
                <button
                  onClick={() => { setVerificationSent(false); setView("main"); }}
                  className="mt-2 text-sm text-primary hover:underline"
                >
                  Kembali ke halaman login
                </button>
              </div>
            ) : (
              <form onSubmit={mode === "register" ? handleRegister : handleLogin} className="space-y-3">
                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="email@contoh.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9"
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder={mode === "register" ? "Minimal 6 karakter" : "Password kamu"}
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

                {/* Confirm Password — register only */}
                {mode === "register" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Konfirmasi Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Ulangi password"
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
                )}

                {/* Submit */}
                <Button
                  type="submit"
                  className="mt-1 w-full gap-2 bg-gradient-purple text-primary-foreground shadow-[0_0_16px_hsl(270_80%_65%/0.3)] hover:opacity-90 hover:shadow-[0_0_24px_hsl(270_80%_65%/0.5)]"
                  disabled={loading}
                >
                  {loading
                    ? mode === "register" ? "Mendaftarkan..." : "Masuk..."
                    : mode === "register" ? "Daftar & Kirim Verifikasi" : "Masuk"}
                  {!loading && <ArrowRight className="h-4 w-4" />}
                </Button>

                {/* Toggle mode */}
                <div className="pt-1 text-center text-xs text-muted-foreground">
                  {mode === "register" ? (
                    <>
                      Sudah punya akun?{" "}
                      <button
                        type="button"
                        onClick={() => { resetForm(); setMode("login"); }}
                        className="font-medium text-primary hover:underline"
                      >
                        Masuk di sini
                      </button>
                    </>
                  ) : (
                    <>
                      Belum punya akun?{" "}
                      <button
                        type="button"
                        onClick={() => { resetForm(); setMode("register"); }}
                        className="font-medium text-primary hover:underline"
                      >
                        Daftar sekarang
                      </button>
                    </>
                  )}
                </div>
              </form>
            )}
          </div>

          {/* Back to main */}
          {!verificationSent && (
            <button
              onClick={() => { setView("main"); resetForm(); }}
              className="mt-4 flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Kembali ke pilihan login
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default Login;
