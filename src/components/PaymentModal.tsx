import { useState } from "react";
import { X, Bell, CheckCircle2, Zap, CreditCard, Smartphone, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
}

const PAYMENT_METHODS = [
  {
    category: "E-Wallet",
    icon: Smartphone,
    methods: ["GoPay", "OVO", "ShopeePay", "DANA"],
  },
  {
    category: "QRIS",
    icon: CreditCard,
    methods: ["Semua QRIS (scan & bayar)"],
  },
  {
    category: "Virtual Account",
    icon: Building2,
    methods: ["BCA", "BRI", "BNI", "Mandiri", "Permata"],
  },
];

const PaymentModal = ({ open, onClose }: PaymentModalProps) => {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleNotify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);

    try {
      // Get current user email if logged in
      const { data: { user } } = await supabase.auth.getUser();
      const notifyEmail = email.trim() || user?.email || "";

      // Store in beta_feedback as a waitlist entry (reuses existing table)
      await supabase.from("beta_feedback").insert({
        type: "general",
        message: `[WAITLIST PRO] ${notifyEmail}`,
        user_id: user?.id ?? null,
        user_email: notifyEmail,
      });

      setSubmitted(true);
    } catch {
      setSubmitted(true); // still show success — don't block user
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl border border-border/60 bg-card/95 shadow-2xl backdrop-blur-xl">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 sm:p-8">
          {submitted ? (
            /* Success state */
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-green-500/30 bg-green-500/10">
                <CheckCircle2 className="h-7 w-7 text-green-400" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-foreground">Siap! Kamu masuk daftar.</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Kamu akan jadi yang pertama tahu saat AINA Pro diluncurkan.
                </p>
              </div>
              <button
                onClick={onClose}
                className="mt-2 rounded-xl bg-gradient-purple px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_20px_hsl(270_80%_65%/0.3)]"
              >
                Tutup
              </button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="mb-6 flex flex-col items-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-bold text-foreground">AINA Pro — Segera Hadir</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Daftarkan emailmu dan jadilah yang pertama tahu saat paket Pro diluncurkan.
                  </p>
                </div>
              </div>

              {/* What's included preview */}
              <div className="mb-5 rounded-xl border border-primary/15 bg-primary/5 p-4">
                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-primary/70">Yang Akan Kamu Dapatkan</p>
                <ul className="space-y-1.5 text-xs text-foreground/70">
                  <li>✦ Chat unlimited dengan AINA</li>
                  <li>✦ Upload & analisis dokumen (PDF, Word)</li>
                  <li>✦ Riwayat chat lengkap tanpa batas</li>
                  <li>✦ Badge Pro eksklusif di profil</li>
                  <li>✦ Early access fitur-fitur baru</li>
                </ul>
              </div>

              {/* Notify form */}
              <form onSubmit={handleNotify} className="mb-5">
                <label className="mb-1.5 block text-xs font-medium text-foreground/80">Email kamu</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="flex-1 rounded-xl border border-border/60 bg-secondary/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                    required
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded-xl bg-gradient-purple px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-[0_0_16px_hsl(270_80%_65%/0.3)] transition-all hover:shadow-[0_0_24px_hsl(270_80%_65%/0.5)] disabled:opacity-60"
                  >
                    <Bell className="h-3.5 w-3.5" />
                    {loading ? "..." : "Notifikasi"}
                  </button>
                </div>
              </form>

              {/* Payment methods */}
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Metode Pembayaran</p>
                <div className="space-y-2">
                  {PAYMENT_METHODS.map(({ category, icon: Icon, methods }) => (
                    <div key={category} className="flex items-start gap-3 rounded-lg border border-border/30 bg-secondary/20 px-3 py-2.5">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" />
                      <div>
                        <p className="text-[11px] font-semibold text-foreground/70">{category}</p>
                        <p className="text-[11px] text-muted-foreground">{methods.join(", ")}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2.5 text-center text-[10px] text-muted-foreground/60">
                  Pembayaran aman diproses oleh Midtrans · Terdaftar & diawasi OJK
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
