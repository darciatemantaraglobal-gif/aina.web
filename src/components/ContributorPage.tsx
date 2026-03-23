import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Users, FileText, Plus, Clock, CheckCircle, XCircle, Send, Bot,
  Upload, X, RefreshCw, Sparkles, Pencil, Check, ChevronDown, ChevronUp,
} from "lucide-react";

const categories = ["Administrasi", "Akademik", "Kehidupan Mesir", "Transport", "Tempat Tinggal", "Kuliner"];
const articleTypes = [
  { value: "narrative", label: "Informasi Umum", desc: "Penjelasan/narasi tentang topik tertentu" },
  { value: "step_by_step", label: "Panduan Langkah-langkah", desc: "Prosedur yang bisa langsung diikuti" },
];

interface ChatMessage {
  id: string;
  role: "assistant";
  content: string;
  delay: number;
}

const WELCOME_MESSAGES: ChatMessage[] = [
  {
    id: "1",
    role: "assistant",
    content: "Halo! Terima kasih sudah mendaftar sebagai kontributor AINA. Permintaanmu sudah kami terima dan sedang ditinjau oleh admin. 🎉",
    delay: 300,
  },
  {
    id: "2",
    role: "assistant",
    content: "Sambil menunggu persetujuan, yuk kenali format penulisan artikel yang baik untuk Knowledge Base AINA!",
    delay: 1200,
  },
  {
    id: "3",
    role: "assistant",
    content: `📝 *Format Artikel Knowledge Base*

*Judul*
Tulis judul yang jelas dan spesifik.
Contoh: "Cara Mengurus Iqomah di Kairo 2024"

*Kategori*
Pilih salah satu kategori yang paling sesuai:
• Administrasi — iqomah, visa, paspor, dll
• Akademik — perkuliahan, pendaftaran, ujian
• Kehidupan Mesir — tips sehari-hari di Mesir
• Transport — metro, taksi, bus, dll
• Tempat Tinggal — sewa flat, lokasi, harga
• Kuliner — restoran halal, masakan, harga makanan

*Konten*
– Tulis dengan bahasa yang jelas dan mudah dipahami
– Gunakan paragraf terstruktur (pendahuluan, isi, penutup)
– Sertakan langkah-langkah jika berupa prosedur
– Tambahkan tips praktis dari pengalamanmu sendiri
– Usahakan minimal 150 kata agar informasi cukup lengkap`,
    delay: 2400,
  },
  {
    id: "4",
    role: "assistant",
    content: "Artikel yang disetujui admin akan langsung tampil di Knowledge Base dan membantu ribuan Masisir lainnya. Semangat berkontribusi! 💪",
    delay: 4200,
  },
];

function WelcomeChat({ name }: { name: string }) {
  const [visibleMessages, setVisibleMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timeouts: ReturnType<typeof setTimeout>[] = [];
    WELCOME_MESSAGES.forEach((msg, i) => {
      const showTyping = setTimeout(() => setTyping(true), msg.delay - 200 < 0 ? 0 : msg.delay - 200);
      const showMsg = setTimeout(() => {
        setTyping(false);
        setVisibleMessages((prev) => [...prev, msg]);
      }, msg.delay + (i === 0 ? 0 : 600));
      timeouts.push(showTyping, showMsg);
    });
    return () => timeouts.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages, typing]);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-purple">
          <Bot className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">AINA</p>
          <p className="text-xs text-muted-foreground">Panduan Kontributor</p>
        </div>
      </div>
      <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
        {visibleMessages.map((msg) => (
          <div key={msg.id} className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-purple">
              <Bot className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-secondary px-4 py-3 text-sm leading-relaxed text-secondary-foreground whitespace-pre-wrap">
              {msg.content}
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex gap-3 animate-in fade-in duration-200">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-purple">
              <Bot className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-secondary px-4 py-3">
              <div className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

type ParsedArticle = { title: string; category: string; article_type: string; content: string };

const ContributorPage = ({ userId: userIdProp }: { userId?: string }) => {
  const [hasRequest, setHasRequest] = useState(false);
  const [requestStatus, setRequestStatus] = useState("");
  const [isContributor, setIsContributor] = useState(false);
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [submitterName, setSubmitterName] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [regName, setRegName] = useState("");
  const [regEdu, setRegEdu] = useState("");
  const [regYear, setRegYear] = useState("");
  const [regExpertise, setRegExpertise] = useState("");

  // Manual article write dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [artTitle, setArtTitle] = useState("");
  const [artContent, setArtContent] = useState("");
  const [artCategory, setArtCategory] = useState("");
  const [artType, setArtType] = useState("narrative");
  const [submitting, setSubmitting] = useState(false);

  // PDF upload dialog
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfStep, setPdfStep] = useState<"upload" | "preview" | "parsing">("upload");
  const [pdfExtracting, setPdfExtracting] = useState(false);
  const [pdfFilename, setPdfFilename] = useState<string | null>(null);
  const [pdfChars, setPdfChars] = useState(0);
  const [pdfText, setPdfText] = useState("");
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Parsed article cards
  const [parsedArticles, setParsedArticles] = useState<ParsedArticle[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editCard, setEditCard] = useState<ParsedArticle>({ title: "", category: "", article_type: "narrative", content: "" });
  const [cardSubmitting, setCardSubmitting] = useState<number | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      let uid = userIdProp;
      if (!uid) {
        const { data: { session } } = await supabase.auth.getSession();
        uid = session?.user?.id;
      }
      if (!uid) { setLoading(false); return; }

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 10000)
      );

      const [reqRes, rolesRes, articlesRes] = await Promise.race([
        Promise.all([
          supabase.from("contributor_requests").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
          supabase.from("user_roles").select("role").eq("user_id", uid),
          supabase.from("knowledge_base").select("*").eq("author_id", uid).order("created_at", { ascending: false }),
        ]),
        timeout,
      ]);

      if (reqRes.data && reqRes.data.length > 0) {
        setHasRequest(true);
        setRequestStatus(reqRes.data[0].status);
      }
      if (rolesRes.data) {
        const roleNames = rolesRes.data.map((r) => r.role);
        setIsContributor(
          roleNames.includes("contributor") ||
          roleNames.includes("senior_contributor") ||
          roleNames.includes("admin")
        );
      }
      if (articlesRes.data) setArticles(articlesRes.data);
    } catch (err: any) {
      console.error("ContributorPage error:", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const refreshRoles = async () => {
    setRefreshing(true);
    try {
      let uid = userIdProp;
      if (!uid) {
        const { data: { session } } = await supabase.auth.getSession();
        uid = session?.user?.id;
      }
      if (!uid) return;
      const { data: rolesData } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      if (rolesData) {
        const roleNames = rolesData.map((r) => r.role);
        const isNow = roleNames.includes("contributor") || roleNames.includes("senior_contributor") || roleNames.includes("admin");
        setIsContributor(isNow);
        if (isNow) toast.success("Akses kontributor aktif! Kamu sekarang bisa submit artikel.");
        else toast.info("Akses belum aktif. Hubungi admin jika ini terjadi terus.");
      }
    } catch {
      toast.error("Gagal memuat ulang, coba lagi.");
    } finally {
      setRefreshing(false);
    }
  };

  const submitRequest = async () => {
    if (!regName.trim() || !regEdu.trim() || !regYear.trim() || !regExpertise.trim()) {
      toast.error("Semua field harus diisi");
      return;
    }
    const year = parseInt(regYear);
    if (isNaN(year) || year < 2000 || year > 2030) {
      toast.error("Tahun masuk tidak valid");
      return;
    }
    setSubmitting(true);
    try {
      let uid = userIdProp;
      if (!uid) {
        const { data: { session } } = await supabase.auth.getSession();
        uid = session?.user?.id;
      }
      if (!uid) return;
      const { error } = await supabase.from("contributor_requests").insert({
        user_id: uid,
        full_name: regName.trim(),
        education: regEdu.trim(),
        enrollment_year: year,
        expertise: regExpertise.trim(),
      });
      if (error) { toast.error("Gagal mengirim permintaan: " + error.message); return; }
      setSubmitterName(regName.trim());
      setHasRequest(true);
      setRequestStatus("pending");
      setJustSubmitted(true);
      toast.success("Permintaan berhasil dikirim! Menunggu persetujuan admin.");
    } catch {
      toast.error("Koneksi gagal. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  // Manual article submit
  const submitArticle = async () => {
    if (!artTitle.trim() || !artContent.trim() || !artCategory) {
      toast.error("Semua field harus diisi");
      return;
    }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { toast.error("Sesi berakhir, login ulang."); return; }
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ title: artTitle.trim(), content: artContent.trim(), category: artCategory, article_type: artType }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(`Gagal mengirim artikel: ${json.error || res.statusText}`); return; }
      setArticles((prev) => [json, ...prev]);
      setArtTitle(""); setArtContent(""); setArtCategory(""); setArtType("narrative");
      setDialogOpen(false);
      toast.success("Artikel dikirim! Menunggu persetujuan admin.");
    } catch {
      toast.error("Koneksi gagal. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  // PDF upload & extraction
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!e.target) return;
    e.target.value = "";
    if (!file) return;

    const allowed = ["application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowed.includes(file.type)) {
      toast.error("Format tidak didukung. Gunakan PDF, DOCX, atau TXT.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error(`File terlalu besar (${(file.size / 1024 / 1024).toFixed(1)} MB). Maksimal 4 MB.`);
      return;
    }

    setPdfExtracting(true);
    setPdfFilename(null);
    setPdfText("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/extract-file", {
        method: "POST",
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: formData,
      });
      const json = await res.json().catch(() => ({
        error: res.status === 413 ? "File terlalu besar. Maksimal 4 MB." : `Gagal mengekstrak file (${res.status})`,
      }));
      if (!res.ok) throw new Error(json.error || "Gagal mengekstrak file");
      setPdfText(json.text);
      setPdfFilename(json.filename);
      setPdfChars(json.chars);
      setPdfStep("preview");
    } catch (err: any) {
      toast.error(err.message || "Gagal membaca file, coba lagi.");
    } finally {
      setPdfExtracting(false);
    }
  };

  // Categorize extracted PDF text with AI
  const handleCategorize = async () => {
    if (!pdfText.trim()) return;
    setPdfStep("parsing");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/parse-articles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ text: pdfText, filename: pdfFilename }),
      });
      const json = await res.json().catch(() => ({ error: "Gagal memparse respons" }));
      if (!res.ok) throw new Error(json.error || "Gagal mengategorikan dokumen");
      const arts: ParsedArticle[] = json.articles || [];
      if (arts.length === 0) throw new Error("AI tidak menemukan topik yang bisa dipisah dari teks ini");
      setParsedArticles((prev) => [...prev, ...arts]);
      setPdfDialogOpen(false);
      setPdfStep("upload");
      setPdfText(""); setPdfFilename(null); setPdfChars(0);
      toast.success(`${arts.length} topik berhasil dideteksi dari dokumen`);
    } catch (err: any) {
      toast.error(err.message || "Gagal mengategorikan dokumen");
      setPdfStep("preview");
    }
  };

  const closePdfDialog = () => {
    if (pdfStep === "parsing") return;
    setPdfDialogOpen(false);
    setPdfStep("upload");
    setPdfText(""); setPdfFilename(null); setPdfChars(0);
  };

  // Submit a single parsed card directly
  const submitParsedCard = async (i: number) => {
    const article = editingIndex === i ? editCard : parsedArticles[i];
    if (!article.title.trim() || !article.content.trim() || !article.category) {
      toast.error("Judul, kategori, dan konten harus diisi");
      return;
    }
    setCardSubmitting(i);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { toast.error("Sesi berakhir, login ulang."); return; }
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          title: article.title.trim(),
          content: article.content.trim(),
          category: article.category,
          article_type: article.article_type,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(`Gagal kirim: ${json.error || res.statusText}`); return; }
      setArticles((prev) => [json, ...prev]);
      setParsedArticles((prev) => prev.filter((_, j) => j !== i));
      if (editingIndex === i) { setEditingIndex(null); }
      if (expandedIndex === i) { setExpandedIndex(null); }
      toast.success("Artikel dikirim! Menunggu persetujuan admin.");
    } catch {
      toast.error("Koneksi gagal. Coba lagi.");
    } finally {
      setCardSubmitting(null);
    }
  };

  const startEdit = (i: number) => {
    setEditCard({ ...parsedArticles[i] });
    setEditingIndex(i);
    setExpandedIndex(i);
  };

  const saveEdit = (i: number) => {
    setParsedArticles((prev) => prev.map((a, j) => j === i ? { ...editCard } : a));
    setEditingIndex(null);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
  };

  const removeParsed = (i: number) => {
    setParsedArticles((prev) => prev.filter((_, j) => j !== i));
    if (editingIndex === i) setEditingIndex(null);
    if (expandedIndex === i) setExpandedIndex(null);
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="h-4 w-4 text-yellow-500" />;
      case "approved": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "rejected": return <XCircle className="h-4 w-4 text-destructive" />;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-xs text-muted-foreground">Menghubungi server...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
          <XCircle className="h-7 w-7 text-destructive" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Koneksi ke database gagal</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Supabase project mungkin sedang tidur (free tier). Buka{" "}
            <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-primary underline">
              supabase.com/dashboard
            </a>{" "}
            dan pastikan project tidak di-pause, lalu coba lagi.
          </p>
        </div>
        <button
          onClick={() => { setLoadError(false); setLoading(true); loadData(); }}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Contributor</h1>
          <p className="text-sm text-muted-foreground">Bergabung sebagai kontributor dan bagikan pengetahuanmu.</p>
        </div>

        {/* Registration / Status */}
        {!isContributor && (
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-primary" />
                Daftar Contributor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasRequest ? (
                <>
                  {requestStatus === "approved" ? (
                    <div className="space-y-4">
                      <div className="flex items-start gap-3 rounded-xl bg-green-500/10 border border-green-500/20 p-4">
                        <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-green-400">Permintaanmu disetujui!</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Kamu sekarang bisa mulai mengirim artikel ke Knowledge Base AINA.
                          </p>
                        </div>
                      </div>
                      <Button variant="hero" className="w-full gap-2" onClick={refreshRoles} disabled={refreshing}>
                        {refreshing ? (
                          <>
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                            Mengaktifkan akses...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4" />
                            Aktifkan Akses & Mulai Berkontribusi
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl bg-secondary p-4">
                      {statusIcon(requestStatus)}
                      <div>
                        <p className="text-sm font-medium text-foreground capitalize">Status: {requestStatus}</p>
                        <p className="text-xs text-muted-foreground">
                          {requestStatus === "pending" ? "Permintaanmu sedang ditinjau admin." : "Maaf, permintaanmu ditolak."}
                        </p>
                      </div>
                    </div>
                  )}
                  {justSubmitted && requestStatus === "pending" && <WelcomeChat name={submitterName} />}
                </>
              ) : (
                <div className="space-y-3">
                  <Input placeholder="Nama lengkap" value={regName} onChange={(e) => setRegName(e.target.value)} className="bg-secondary" />
                  <Input placeholder="Pendidikan (misal: S1 Syariah Al-Azhar)" value={regEdu} onChange={(e) => setRegEdu(e.target.value)} className="bg-secondary" />
                  <Input placeholder="Tahun masuk (misal: 2022)" value={regYear} onChange={(e) => setRegYear(e.target.value)} className="bg-secondary" />
                  <Input placeholder="Keahlian (misal: Administrasi, Bahasa Arab)" value={regExpertise} onChange={(e) => setRegExpertise(e.target.value)} className="bg-secondary" />
                  <Button variant="hero" onClick={submitRequest} disabled={submitting} className="gap-1.5">
                    {submitting ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                        Mengirim...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Kirim Permintaan
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Contributor area */}
        {isContributor && (
          <>
            {/* Welcome banner */}
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-purple">
                  <Sparkles className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-base font-bold text-foreground">Kamu adalah Kontributor AINA!</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Bagikan pengetahuanmu tentang kehidupan di Mesir. Artikel yang disetujui akan langsung digunakan AINA untuk menjawab pertanyaan ribuan Masisir.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="hero" size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
                      <Plus className="h-4 w-4" />
                      Tulis Artikel
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => { setPdfStep("upload"); setPdfDialogOpen(true); }}
                    >
                      <Upload className="h-4 w-4" />
                      Upload PDF / Dokumen
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── PDF Upload Dialog ─────────────────────────── */}
            <Dialog open={pdfDialogOpen} onOpenChange={(open) => { if (!open) closePdfDialog(); }}>
              <DialogContent className="bg-card border-border sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-display">Upload Dokumen</DialogTitle>
                </DialogHeader>

                {/* Step: upload */}
                {pdfStep === "upload" && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Upload PDF, DOCX, atau TXT yang berisi informasi tentang kehidupan di Mesir. AI akan membaca dan mengkategorikan isinya secara otomatis.
                    </p>
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept=".pdf,.txt,.docx"
                      className="hidden"
                      onChange={handlePdfUpload}
                    />
                    <button
                      type="button"
                      disabled={pdfExtracting}
                      onClick={() => pdfInputRef.current?.click()}
                      className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-secondary/50 py-10 transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
                    >
                      {pdfExtracting ? (
                        <>
                          <span className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          <p className="text-sm font-medium text-muted-foreground">Membaca dokumen...</p>
                          <p className="text-xs text-muted-foreground/60">Ini mungkin butuh beberapa saat</p>
                        </>
                      ) : (
                        <>
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                            <Upload className="h-6 w-6 text-primary" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-medium text-foreground">Pilih file untuk diupload</p>
                            <p className="mt-1 text-xs text-muted-foreground">PDF · DOCX · TXT — maks. 4 MB</p>
                          </div>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Step: preview — file read, ready to categorize */}
                {pdfStep === "preview" && pdfFilename && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/10 p-3">
                      <FileText className="h-5 w-5 shrink-0 text-green-400" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-green-300">{pdfFilename}</p>
                        <p className="text-xs text-muted-foreground">{pdfChars.toLocaleString("id-ID")} karakter berhasil dibaca</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setPdfStep("upload"); setPdfText(""); setPdfFilename(null); setPdfChars(0); }}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="rounded-xl border border-border bg-secondary/50 p-3">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60 mb-1.5">Preview teks</p>
                      <p className="line-clamp-5 text-xs text-muted-foreground leading-relaxed">
                        {pdfText.slice(0, 600)}{pdfText.length > 600 ? "..." : ""}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleCategorize}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-purple py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-opacity hover:opacity-90"
                    >
                      <Sparkles className="h-4 w-4" />
                      Kategorikan dengan AI
                    </button>
                    <p className="text-center text-[10px] text-muted-foreground/60">
                      AI akan memisahkan isi dokumen menjadi kartu-kartu artikel per topik
                    </p>
                  </div>
                )}

                {/* Step: parsing in progress */}
                {pdfStep === "parsing" && (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <div className="relative flex h-16 w-16 items-center justify-center">
                      <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-purple">
                        <Sparkles className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-foreground">AI sedang membaca dokumen...</p>
                      <p className="mt-1 text-sm text-muted-foreground">Mengidentifikasi dan mengkategorikan setiap informasi</p>
                    </div>
                    <div className="flex gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* ── Parsed article cards ──────────────────────── */}
            {parsedArticles.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-base font-semibold text-foreground">
                      {parsedArticles.length} Topik Siap Dikirim
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Review setiap topik — edit jika perlu, lalu kirim satu per satu
                    </p>
                  </div>
                  <button
                    onClick={() => { setParsedArticles([]); setEditingIndex(null); setExpandedIndex(null); }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Hapus semua
                  </button>
                </div>

                <div className="space-y-3">
                  {parsedArticles.map((article, i) => {
                    const isEditing = editingIndex === i;
                    const isExpanded = expandedIndex === i;
                    const isSubmitting = cardSubmitting === i;
                    const display = isEditing ? editCard : article;

                    return (
                      <div
                        key={i}
                        className={`rounded-2xl border bg-card transition-all ${
                          isEditing ? "border-primary/40 shadow-md shadow-primary/10" : "border-border"
                        }`}
                      >
                        {/* Card header — always visible */}
                        <div className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              {isEditing ? (
                                <Input
                                  value={editCard.title}
                                  onChange={(e) => setEditCard((c) => ({ ...c, title: e.target.value }))}
                                  placeholder="Judul artikel"
                                  className="bg-secondary text-sm font-semibold"
                                />
                              ) : (
                                <p className="font-semibold text-foreground leading-tight">{display.title}</p>
                              )}

                              {!isEditing && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                                    {display.category}
                                  </span>
                                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                                    {display.article_type === "step_by_step" ? "Panduan Langkah" : "Informasi Umum"}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Action buttons (right side) */}
                            <div className="flex shrink-0 items-center gap-1.5">
                              {!isEditing && (
                                <button
                                  onClick={() => setExpandedIndex(isExpanded ? null : i)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground"
                                >
                                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                </button>
                              )}
                              {!isEditing && (
                                <button
                                  onClick={() => startEdit(i)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => removeParsed(i)}
                                disabled={isSubmitting}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-40"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Collapsed preview */}
                          {!isEditing && !isExpanded && (
                            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                              {display.content}
                            </p>
                          )}
                        </div>

                        {/* Expanded / edit area */}
                        {(isEditing || isExpanded) && (
                          <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                            {isEditing ? (
                              <>
                                <div className="grid grid-cols-2 gap-2">
                                  <Select
                                    value={editCard.category}
                                    onValueChange={(v) => setEditCard((c) => ({ ...c, category: v }))}
                                  >
                                    <SelectTrigger className="bg-secondary text-xs">
                                      <SelectValue placeholder="Kategori" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {categories.map((cat) => (
                                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Select
                                    value={editCard.article_type}
                                    onValueChange={(v) => setEditCard((c) => ({ ...c, article_type: v }))}
                                  >
                                    <SelectTrigger className="bg-secondary text-xs">
                                      <SelectValue placeholder="Tipe" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="narrative">Informasi Umum</SelectItem>
                                      <SelectItem value="step_by_step">Panduan Langkah</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <Textarea
                                  value={editCard.content}
                                  onChange={(e) => setEditCard((c) => ({ ...c, content: e.target.value }))}
                                  placeholder="Konten artikel..."
                                  className="min-h-[140px] bg-secondary text-xs"
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => saveEdit(i)}
                                    className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                    Simpan
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEdit}
                                    className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                                  >
                                    Batal
                                  </button>
                                </div>
                              </>
                            ) : (
                              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{display.content}</p>
                            )}
                          </div>
                        )}

                        {/* Submit button — full width at bottom */}
                        {!isEditing && (
                          <div className="border-t border-border px-4 py-3">
                            <Button
                              variant="hero"
                              size="sm"
                              className="w-full gap-1.5"
                              disabled={isSubmitting}
                              onClick={() => submitParsedCard(i)}
                            >
                              {isSubmitting ? (
                                <>
                                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                                  Mengirim...
                                </>
                              ) : (
                                <>
                                  <Send className="h-3.5 w-3.5" />
                                  Kirim Artikel
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Artikelku ─────────────────────────────────── */}
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-foreground">Artikelku</h2>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                Tulis Artikel
              </Button>
            </div>

            {/* Manual write dialog */}
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setArtTitle(""); setArtContent(""); setArtCategory(""); setArtType("narrative"); } }}>
              <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-display">Tulis Artikel Baru</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <Input
                    placeholder="Judul artikel"
                    value={artTitle}
                    onChange={(e) => setArtTitle(e.target.value)}
                    className="bg-secondary"
                  />
                  <Select value={artCategory} onValueChange={setArtCategory}>
                    <SelectTrigger className="bg-secondary">
                      <SelectValue placeholder="Pilih kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Tipe Artikel</p>
                    <div className="grid grid-cols-2 gap-2">
                      {articleTypes.map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setArtType(t.value)}
                          className={`rounded-xl border p-3 text-left transition-all ${
                            artType === t.value
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border bg-secondary text-muted-foreground hover:border-border/80 hover:text-foreground"
                          }`}
                        >
                          <p className="text-xs font-semibold">{t.label}</p>
                          <p className="mt-0.5 text-[10px] leading-tight opacity-70">{t.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <Textarea
                    placeholder={artType === "step_by_step"
                      ? "Tulis langkah-langkah secara urut...\nContoh:\n1. Siapkan dokumen X\n2. Kunjungi kantor Y\n3. Isi formulir Z"
                      : "Tulis konten artikel di sini..."}
                    value={artContent}
                    onChange={(e) => setArtContent(e.target.value)}
                    className="min-h-[150px] bg-secondary"
                  />
                  <Button variant="hero" onClick={submitArticle} disabled={submitting} className="w-full gap-1.5">
                    {submitting ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                        Mengirim...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Kirim Artikel
                      </>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {articles.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Belum ada artikel. Tulis artikel pertamamu!</p>
            ) : (
              <div className="space-y-3">
                {articles.map((article) => (
                  <Card key={article.id} className="border-border bg-card">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <h3 className="font-medium text-foreground">{article.title}</h3>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="rounded-full bg-secondary px-2 py-0.5">{article.category}</span>
                            <span>•</span>
                            <span>{new Date(article.created_at).toLocaleDateString("id-ID")}</span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{article.content}</p>
                        </div>
                        <div className="ml-3 flex items-center gap-1.5">
                          {statusIcon(article.status)}
                          <span className="text-xs capitalize text-muted-foreground">{article.status}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ContributorPage;
