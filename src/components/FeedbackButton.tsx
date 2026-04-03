import { useState } from "react";
import { MessageSquarePlus, X, Send, CheckCircle, Bug, Lightbulb, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type FeedbackType = "bug" | "suggestion" | "general";

const FEEDBACK_TYPES: { value: FeedbackType; label: string; icon: typeof Bug; color: string }[] = [
  { value: "bug", label: "Bug / Error", icon: Bug, color: "text-red-400" },
  { value: "suggestion", label: "Saran", icon: Lightbulb, color: "text-yellow-400" },
  { value: "general", label: "Umum", icon: Star, color: "text-blue-400" },
];

const FeedbackButton = () => {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("general");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ type, message: message.trim() }),
      });

      if (!res.ok) throw new Error("Server error");
      setDone(true);
      setMessage("");
      setTimeout(() => {
        setDone(false);
        setOpen(false);
      }, 2500);
    } catch {
      toast.error("Gagal mengirim feedback. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        title="Kirim Feedback Beta"
        className="bottom-nav-safe fixed right-4 z-40 flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 text-sm font-medium text-muted-foreground shadow-lg transition-all hover:border-primary/40 hover:bg-secondary hover:text-foreground hover:shadow-xl md:bottom-6 md:right-6 sm:px-4"
      >
        <MessageSquarePlus className="h-4 w-4 text-primary" />
        <span className="hidden sm:inline">Feedback Beta</span>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />

          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
            <div className="h-1 w-full bg-gradient-to-r from-violet-600 via-purple-500 to-fuchsia-500" />

            <div className="p-6">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <p className="font-semibold text-foreground">Kirim Feedback</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Versi Beta AINA — Masukan kamu sangat berarti!</p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {done ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10">
                    <CheckCircle className="h-7 w-7 text-green-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Terima kasih!</p>
                    <p className="mt-1 text-sm text-muted-foreground">Feedback kamu sudah kami terima dan akan ditinjau oleh tim.</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Type selector */}
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Jenis Feedback</p>
                    <div className="flex gap-2">
                      {FEEDBACK_TYPES.map((t) => {
                        const Icon = t.icon;
                        return (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => setType(t.value)}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-medium transition-all ${
                              type === t.value
                                ? "border-primary/50 bg-primary/10 text-foreground"
                                : "border-border bg-secondary/50 text-muted-foreground hover:border-border/80 hover:bg-secondary"
                            }`}
                          >
                            <Icon className={`h-3.5 w-3.5 ${type === t.value ? t.color : ""}`} />
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Message */}
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Pesan</p>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={
                        type === "bug"
                          ? "Ceritakan bug yang kamu temukan: apa yang terjadi, di halaman mana, langkah reproduksinya..."
                          : type === "suggestion"
                          ? "Fitur apa yang menurutmu perlu ditambahkan atau diperbaiki?"
                          : "Bagikan pendapat, pengalamanmu menggunakan AINA..."
                      }
                      rows={4}
                      className="w-full resize-none rounded-xl border border-border bg-secondary/50 px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-0"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !message.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {loading ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Kirim Feedback
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FeedbackButton;
