import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Shield, Users, FileText, Check, X, Clock } from "lucide-react";

const AdminPage = () => {
  const [requests, setRequests] = useState<any[]>([]);
  const [articles, setArticles] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdminAndLoad();
  }, []);

  const checkAdminAndLoad = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const admin = roles?.some((r) => r.role === "admin") || false;
    setIsAdmin(admin);

    if (admin) {
      const [reqRes, artRes] = await Promise.all([
        supabase.from("contributor_requests").select("*").eq("status", "pending").order("created_at", { ascending: false }),
        supabase.from("knowledge_base").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      ]);
      if (reqRes.data) setRequests(reqRes.data);
      if (artRes.data) setArticles(artRes.data);
    }
    setLoading(false);
  };

  const handleRequest = async (id: string, userId: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("contributor_requests").update({ status }).eq("id", id);
    if (error) {
      toast.error("Gagal memperbarui status");
      return;
    }

    if (status === "approved") {
      // Add contributor role
      await supabase.from("user_roles").insert({ user_id: userId, role: "contributor" as any });
      // Update profile level
      await supabase.from("profiles").update({ level: "Contributor" }).eq("user_id", userId);
    }

    setRequests((prev) => prev.filter((r) => r.id !== id));
    toast.success(`Permintaan ${status === "approved" ? "disetujui" : "ditolak"}`);
  };

  const handleArticle = async (id: string, authorId: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("knowledge_base").update({ status }).eq("id", id);
    if (error) {
      toast.error("Gagal memperbarui status");
      return;
    }

    if (status === "approved") {
      // Increment contribution count
      const { data: profile } = await supabase.from("profiles").select("contribution_count").eq("user_id", authorId).single();
      if (profile) {
        const newCount = (profile.contribution_count || 0) + 1;
        const level = newCount >= 10 ? "Senior Contributor" : newCount >= 1 ? "Contributor" : "User";
        await supabase.from("profiles").update({ contribution_count: newCount, level }).eq("user_id", authorId);

        if (newCount >= 10) {
          await supabase.from("user_roles").upsert({ user_id: authorId, role: "senior_contributor" as any }, { onConflict: "user_id,role" });
        }
      }
    }

    setArticles((prev) => prev.filter((a) => a.id !== id));
    toast.success(`Artikel ${status === "approved" ? "disetujui" : "ditolak"}`);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <Shield className="mb-4 h-12 w-12 text-destructive" />
        <h2 className="font-display text-xl font-bold text-foreground">Akses Ditolak</h2>
        <p className="mt-2 text-sm text-muted-foreground">Halaman ini hanya untuk admin.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">Kelola permintaan kontributor dan artikel.</p>
        </div>

        <Tabs defaultValue="requests">
          <TabsList className="w-full bg-secondary">
            <TabsTrigger value="requests" className="flex-1 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Users className="h-4 w-4" />
              Permintaan ({requests.length})
            </TabsTrigger>
            <TabsTrigger value="articles" className="flex-1 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FileText className="h-4 w-4" />
              Artikel ({articles.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="requests" className="mt-4 space-y-3">
            {requests.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada permintaan pending.</p>
            )}
            {requests.map((req) => (
              <Card key={req.id} className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-foreground">{req.full_name}</h3>
                      <p className="text-sm text-muted-foreground">{req.education}</p>
                      <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                        <span>Tahun masuk: {req.enrollment_year}</span>
                        <span>•</span>
                        <span>Keahlian: {req.expertise}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="gap-1 text-green-500 hover:bg-green-500/10" onClick={() => handleRequest(req.id, req.user_id, "approved")}>
                        <Check className="h-3.5 w-3.5" />
                        Setuju
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-destructive hover:bg-destructive/10" onClick={() => handleRequest(req.id, req.user_id, "rejected")}>
                        <X className="h-3.5 w-3.5" />
                        Tolak
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="articles" className="mt-4 space-y-3">
            {articles.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada artikel pending.</p>
            )}
            {articles.map((article) => (
              <Card key={article.id} className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-foreground">{article.title}</h3>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full bg-secondary px-2 py-0.5">{article.category}</span>
                        <span>{new Date(article.created_at).toLocaleDateString("id-ID")}</span>
                      </div>
                      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{article.content}</p>
                    </div>
                    <div className="ml-3 flex flex-col gap-2">
                      <Button size="sm" variant="outline" className="gap-1 text-green-500 hover:bg-green-500/10" onClick={() => handleArticle(article.id, article.author_id, "approved")}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-destructive hover:bg-destructive/10" onClick={() => handleArticle(article.id, article.author_id, "rejected")}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminPage;
