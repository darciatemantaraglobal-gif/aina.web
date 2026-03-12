import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Users, FileText, Plus, Clock, CheckCircle, XCircle, Send } from "lucide-react";

const categories = ["Administrasi", "Akademik", "Kehidupan Mesir", "Transport", "Tempat Tinggal", "Kuliner"];

const ContributorPage = () => {
  const [hasRequest, setHasRequest] = useState(false);
  const [requestStatus, setRequestStatus] = useState("");
  const [isContributor, setIsContributor] = useState(false);
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Registration form
  const [regName, setRegName] = useState("");
  const [regEdu, setRegEdu] = useState("");
  const [regYear, setRegYear] = useState("");
  const [regExpertise, setRegExpertise] = useState("");

  // Article form
  const [artTitle, setArtTitle] = useState("");
  const [artContent, setArtContent] = useState("");
  const [artCategory, setArtCategory] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [reqRes, rolesRes, articlesRes] = await Promise.all([
      supabase.from("contributor_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
      supabase.from("knowledge_base").select("*").eq("author_id", user.id).order("created_at", { ascending: false }),
    ]);

    if (reqRes.data && reqRes.data.length > 0) {
      setHasRequest(true);
      setRequestStatus(reqRes.data[0].status);
    }

    if (rolesRes.data) {
      const roleNames = rolesRes.data.map((r) => r.role);
      setIsContributor(roleNames.includes("contributor") || roleNames.includes("senior_contributor"));
    }

    if (articlesRes.data) setArticles(articlesRes.data);
    setLoading(false);
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("contributor_requests").insert({
      user_id: user.id,
      full_name: regName.trim(),
      education: regEdu.trim(),
      enrollment_year: year,
      expertise: regExpertise.trim(),
    });

    if (error) {
      toast.error("Gagal mengirim permintaan");
      return;
    }
    toast.success("Permintaan berhasil dikirim! Menunggu persetujuan admin.");
    setHasRequest(true);
    setRequestStatus("pending");
  };

  const submitArticle = async () => {
    if (!artTitle.trim() || !artContent.trim() || !artCategory) {
      toast.error("Semua field harus diisi");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase.from("knowledge_base").insert({
      author_id: user.id,
      title: artTitle.trim(),
      content: artContent.trim(),
      category: artCategory,
    }).select().single();

    if (error) {
      toast.error("Gagal mengirim artikel");
      return;
    }
    if (data) setArticles((prev) => [data, ...prev]);
    setArtTitle("");
    setArtContent("");
    setArtCategory("");
    setDialogOpen(false);
    toast.success("Artikel dikirim! Menunggu persetujuan admin.");
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
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
            <CardContent>
              {hasRequest ? (
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
              ) : (
                <div className="space-y-3">
                  <Input placeholder="Nama lengkap" value={regName} onChange={(e) => setRegName(e.target.value)} className="bg-secondary" />
                  <Input placeholder="Pendidikan (misal: S1 Syariah Al-Azhar)" value={regEdu} onChange={(e) => setRegEdu(e.target.value)} className="bg-secondary" />
                  <Input placeholder="Tahun masuk (misal: 2022)" value={regYear} onChange={(e) => setRegYear(e.target.value)} className="bg-secondary" />
                  <Input placeholder="Keahlian (misal: Administrasi, Bahasa Arab)" value={regExpertise} onChange={(e) => setRegExpertise(e.target.value)} className="bg-secondary" />
                  <Button variant="hero" onClick={submitRequest} className="gap-1.5">
                    <Send className="h-4 w-4" />
                    Kirim Permintaan
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
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="hero" size="sm" className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    Tulis Artikel
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border">
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
                    <Textarea
                      placeholder="Tulis konten artikel..."
                      value={artContent}
                      onChange={(e) => setArtContent(e.target.value)}
                      className="min-h-[150px] bg-secondary"
                    />
                    <Button variant="hero" onClick={submitArticle} className="w-full gap-1.5">
                      <Send className="h-4 w-4" />
                      Kirim Artikel
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
