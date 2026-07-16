import { useState } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { Mail, User, MapPin, BookOpen, ArrowRight, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useDemoMode } from "@/hooks/useDemoMode";
import ainaLogo from "@/assets/aina-logo.png";

const PageLoader = () => (
  <div className="relative flex min-h-screen items-center justify-center bg-background">
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-[120px]" />
    </div>
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
  </div>
);

export default function DemoAccessPage() {
  const navigate = useNavigate();
  const { demoMode, loading } = useDemoMode();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [originCity, setOriginCity] = useState("");
  const [faculty, setFaculty] = useState("");
  const [studyField, setStudyField] = useState("");
  const [aiImportance, setAiImportance] = useState<number | null>(null);
  const [aiReason, setAiReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [result, setResult] = useState<{ access_code: string; already_registered?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  if (loading) return <PageLoader />;
  if (!demoMode) {
    return <Navigate to="/login" replace />;
  }

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.access_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    if (!fullName.trim() || fullName.trim().length > 100) {
      toast.error("Nama lengkap wajib diisi (maks. 100 karakter)");
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Masukkan alamat email yang valid");
      return;
    }
    if (!studyField.trim() || studyField.trim().length > 100) {
      toast.error("Bidang studi wajib diisi (maks. 100 karakter)");
      return;
    }
    if (!aiImportance || aiImportance < 1 || aiImportance > 5) {
      toast.error("Pilih tingkat kepentingan AI (1–5)");
      return;
    }
    if (aiReason.length > 500) {
      toast.error("Alasan terlalu panjang (maks. 500 karakter)");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/demo/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          origin_city: originCity.trim() || undefined,
          faculty: faculty.trim() || undefined,
          study_field: studyField.trim(),
          ai_importance: aiImportance,
          ai_importance_reason: aiReason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Terjadi kesalahan. Coba lagi.");
        return;
      }
      setResult(data);
    } catch {
      toast.error("Gagal menghubungi server. Periksa koneksi internet kamu.");
    } finally {
      setSubmitting(false);
    }
  };

  const importanceLabels: Record<number, string> = {
    1: "Tidak penting",
    2: "Kurang penting",
    3: "Cukup penting",
    4: "Penting",
    5: "Sangat penting",
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute -top-20 -left-20 h-[300px] w-[300px] rounded-full bg-[radial-gradient(ellipse,hsl(270_60%_18%/0.5),transparent_70%)] blur-[60px]" />
        <div className="absolute -bottom-20 -right-20 h-[300px] w-[300px] rounded-full bg-[radial-gradient(ellipse,hsl(270_55%_15%/0.45),transparent_70%)] blur-[60px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo + title */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img src={ainaLogo} alt="AINA" className="h-14 w-14 object-contain" />
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Daftar Akses Demo</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Isi form di bawah untuk mendapatkan kode akses AINA</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card/80 backdrop-blur-sm">
          {result ? (
            /* ── Success state ── */
            <div className="flex flex-col items-center gap-5 p-6 text-center">
              {result.already_registered && (
                <div className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-400">
                  Email ini sudah terdaftar sebelumnya — ini adalah kode akses kamu yang lama.
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-muted-foreground">Kode Akses AINA kamu:</p>
                <p className="mt-2 font-mono text-3xl font-bold tracking-widest text-primary">{result.access_code}</p>
              </div>

              <button
                onClick={handleCopy}
                className="flex items-center gap-2 rounded-xl border border-border bg-secondary/60 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                {copied ? "Tersalin!" : "Salin Kode"}
              </button>

              <p className="text-xs text-muted-foreground">
                Simpan kode ini — kamu akan memakainya bersama email untuk login.
              </p>

              <Button
                className="w-full gap-2 bg-gradient-purple text-primary-foreground shadow-[0_0_16px_hsl(270_80%_65%/0.3)] hover:opacity-90"
                onClick={() => navigate("/login")}
              >
                Lanjut ke Login
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            /* ── Registration form ── */
            <form onSubmit={handleSubmit} className="space-y-3 p-5">
              {/* Nama lengkap */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Nama Lengkap *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Nama lengkap kamu"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-9"
                    maxLength={100}
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Email *</label>
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

              {/* Asal kota */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Asal Kota/Daerah</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Contoh: Jakarta, Surabaya"
                    value={originCity}
                    onChange={(e) => setOriginCity(e.target.value)}
                    className="pl-9"
                    maxLength={100}
                  />
                </div>
              </div>

              {/* Kampus/Fakultas */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Kampus / Fakultas</label>
                <div className="relative">
                  <BookOpen className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Contoh: Al-Azhar, Ushuluddin"
                    value={faculty}
                    onChange={(e) => setFaculty(e.target.value)}
                    className="pl-9"
                    maxLength={100}
                  />
                </div>
              </div>

              {/* Bidang studi */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Bidang Studi *</label>
                <Input
                  type="text"
                  placeholder="Contoh: Hukum Islam, Pendidikan Bahasa Arab"
                  value={studyField}
                  onChange={(e) => setStudyField(e.target.value)}
                  maxLength={100}
                  required
                />
              </div>

              {/* AI importance */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Seberapa penting AI untuk Masisir? *
                </label>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAiImportance(n)}
                      className={`flex-1 rounded-lg border py-2 text-sm font-bold transition-colors ${
                        aiImportance === n
                          ? "border-primary bg-primary/20 text-primary"
                          : "border-border bg-secondary/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                {aiImportance && (
                  <p className="text-xs text-muted-foreground">
                    {aiImportance} = {importanceLabels[aiImportance]}
                  </p>
                )}
              </div>

              {/* Alasan */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Kenapa menurutmu begitu? (opsional)</label>
                <textarea
                  placeholder="Ceritakan pendapatmu..."
                  value={aiReason}
                  onChange={(e) => setAiReason(e.target.value)}
                  maxLength={500}
                  rows={3}
                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0"
                />
              </div>

              <Button
                type="submit"
                className="mt-1 w-full gap-2 bg-gradient-purple text-primary-foreground shadow-[0_0_16px_hsl(270_80%_65%/0.3)] hover:opacity-90 hover:shadow-[0_0_24px_hsl(270_80%_65%/0.5)]"
                disabled={submitting || loading}
              >
                {submitting ? "Memproses..." : "Dapatkan Kode Akses"}
                {!submitting && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>
          )}
        </div>

        {!result && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Sudah punya kode?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Login di sini
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
