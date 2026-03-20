import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Users, FileText, Plus, Clock, CheckCircle, XCircle, Send, Bot, Upload, X } from "lucide-react";

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

const ContributorPage = ({ userId: userIdProp }: { userId?: string }) => {
  const [hasRequest, setHasRequest] = useState(false);
  const [requestStatus, setRequestStatus] = useState("");
  const [isContributor, setIsContributor] = useState(false);
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [submitterName, setSubmitterName] = useState("");

  const [regName, setRegName] = useState("");
  const [regEdu, setRegEdu] = useState("");
  const [regYear, setRegYear] = useState("");
  const [regExpertise, setRegExpertise] = useState("");

  const [artTitle, setArtTitle] = useState("");
  const [artContent, setArtContent] = useState("");
  const [artCategory, setArtCategory] = useState("");
  const [artType, setArtType] = useState("narrative");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const user = { id: uid };

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 10000)
      );

      const [reqRes, rolesRes, articlesRes] = await Promise.race([
        Promise.all([
          supabase.from("contributor_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
          supabase.from("user_roles").select("role").eq("user_id", user.id),
          supabase.from("knowledge_base").select("*").eq("author_id", user.id).order("created_at", { ascending: false }),
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

      if (error) {
        toast.error("Gagal mengirim permintaan: " + error.message);
        return;
      }

      setSubmitterName(regName.trim());
      setHasRequest(true);
      setRequestStatus("pending");
      setJustSubmitted(true);
      toast.success("Permintaan berhasil dikirim! Menunggu persetujuan admin.");
    } catch (err: any) {
      toast.error("Koneksi gagal. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!e.target) return;
    e.target.value = "";
    if (!file) return;

    const allowed = ["application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowed.includes(file.type)) {
      toast.error("Format tidak didukung. Gunakan PDF, DOCX, atau TXT.");
      return;
    }

    setExtracting(true);
    setUploadedFilename(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/extract-file", {
        method: "POST",
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal mengekstrak file");

      setArtContent(json.text);
      setUploadedFilename(json.filename);
      toast.success(`Berhasil membaca ${json.chars.toLocaleString("id-ID")} karakter dari ${json.filename}`);
    } catch (err: any) {
      toast.error(err.message || "Gagal membaca file, coba lagi.");
    } finally {
      setExtracting(false);
    }
  };

  const submitArticle = async () => {
    if (!artTitle.trim() || !artContent.trim() || !artCategory) {
      toast.error("Semua field harus diisi");
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

      const payload: Record<string, any> = {
        author_id: uid,
        title: artTitle.trim(),
        content: artContent.trim(),
        category: artCategory,
        article_type: artType,
      };

      let { data, error } = await supabase.from("knowledge_base").insert(payload).select().single();

      // If article_type column doesn't exist yet, retry without it
      if (error && error.message?.includes("article_type")) {
        const { data: d2, error: e2 } = await supabase.from("knowledge_base").insert({
          author_id: uid,
          title: artTitle.trim(),
          content: artContent.trim(),
          category: artCategory,
        }).select().single();
        data = d2;
        error = e2;
      }

      if (error) {
        toast.error(`Gagal mengirim artikel: ${error.message}`);
        return;
      }
      if (data) setArticles((prev) => [data, ...prev]);
      setArtTitle("");
      setArtContent("");
      setArtCategory("");
      setArtType("narrative");
      setDialogOpen(false);
      toast.success("Artikel dikirim! Menunggu persetujuan admin.");
    } catch {
      toast.error("Koneksi gagal. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
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
                  <div className="flex items-center gap-3 rounded-xl bg-secondary p-4">
                    {statusIcon(requestStatus)}
                    <div>
                      <p className="text-sm font-medium text-foreground capitalize">
                        Status: {requestStatus}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {requestStatus === "pending"
                          ? "Permintaanmu sedang ditinjau admin."
                          : requestStatus === "approved"
                          ? "Selamat! Kamu sudah menjadi kontributor."
                          : "Maaf, permintaanmu ditolak."}
                      </p>
                    </div>
                  </div>

                  {justSubmitted && <WelcomeChat name={submitterName} />}
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

        {/* Article Submission (contributor only) */}
        {isContributor && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-foreground">Artikel Knowledge Base</h2>
              <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setUploadedFilename(null); }}>
                <DialogTrigger asChild>
                  <Button variant="hero" size="sm" className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    Tulis Artikel
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="font-display">Tulis Artikel Baru</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <Input placeholder="Judul artikel" value={artTitle} onChange={(e) => setArtTitle(e.target.value)} className="bg-secondary" />
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
                    {/* File upload */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground">Konten Artikel</p>
                        <div className="flex items-center gap-2">
                          {uploadedFilename && (
                            <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] text-green-400">
                              <FileText className="h-2.5 w-2.5" />
                              {uploadedFilename}
                              <button
                                type="button"
                                onClick={() => { setUploadedFilename(null); setArtContent(""); }}
                                className="ml-0.5 hover:text-green-200"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          )}
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.txt,.docx"
                            className="hidden"
                            onChange={handleFileUpload}
                          />
                          <button
                            type="button"
                            disabled={extracting}
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                          >
                            {extracting ? (
                              <>
                                <span className="h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
                                Membaca...
                              </>
                            ) : (
                              <>
                                <Upload className="h-3 w-3" />
                                Upload File
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground/60">Tulis langsung atau upload PDF / DOCX / TXT — teks diekstrak otomatis</p>
                    </div>

                    <Textarea
                      placeholder={artType === "step_by_step"
                        ? "Tulis langkah-langkah secara urut...\nContoh:\n1. Siapkan dokumen X\n2. Kunjungi kantor Y\n3. Isi formulir Z"
                        : "Tulis konten artikel atau upload file di atas..."}
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
            </div>

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
