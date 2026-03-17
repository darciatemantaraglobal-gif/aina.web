import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Award, Shield, FileText, Calendar, Pencil, Check, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const ProfilePage = () => {
  const [profile, setProfile] = useState<any>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [articleCount, setArticleCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoadError(false);
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { setLoading(false); return; }

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 10000)
      );

      const [profileRes, rolesRes, articlesRes] = await Promise.race([
        Promise.all([
          supabase.from("profiles").select("*").eq("user_id", user.id).single(),
          supabase.from("user_roles").select("role").eq("user_id", user.id),
          supabase.from("knowledge_base").select("id").eq("author_id", user.id).eq("status", "approved"),
        ]),
        timeout,
      ]);

      if (profileRes.data) setProfile(profileRes.data);
      if (rolesRes.data) setRoles(rolesRes.data.map((r) => r.role));
      if (articlesRes.data) setArticleCount(articlesRes.data.length);
    } catch (err) {
      console.error("ProfilePage error:", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = () => {
    setEditName(profile?.full_name || "");
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditName("");
  };

  const saveName = async () => {
    const trimmed = editName.trim();
    if (!trimmed) { toast.error("Nama tidak boleh kosong"); return; }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const { error } = await supabase
        .from("profiles")
        .update({ full_name: trimmed })
        .eq("user_id", user.id);

      if (error) { toast.error("Gagal menyimpan"); return; }
      setProfile((prev: any) => ({ ...prev, full_name: trimmed }));
      setEditing(false);
      toast.success("Profil diperbarui");
    } finally {
      setSaving(false);
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
          <AlertCircle className="h-7 w-7 text-destructive" />
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
          onClick={loadData}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  const topRole = roles.includes("admin") ? "Admin" : roles.includes("senior_contributor") ? "Senior Contributor" : roles.includes("contributor") ? "Contributor" : "User";

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-md space-y-6">
        <Card className="border-border bg-card overflow-hidden">
          <div className="h-24 bg-gradient-purple" />
          <CardContent className="-mt-12 p-6">
            <div className="flex flex-col items-center text-center">
              <Avatar className="h-20 w-20 border-4 border-card">
                <AvatarFallback className="bg-secondary text-2xl font-bold text-foreground">
                  {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>

              {editing ? (
                <div className="mt-3 flex w-full max-w-xs items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") cancelEdit(); }}
                    className="h-9 bg-secondary text-center font-display text-base font-bold"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" onClick={saveName} disabled={saving} className="h-9 w-9 shrink-0 text-green-500 hover:bg-green-500/10">
                    {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-green-500 border-t-transparent" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={cancelEdit} className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2">
                  <h2 className="font-display text-xl font-bold text-foreground">
                    {profile?.full_name || "User"}
                  </h2>
                  <button
                    onClick={startEdit}
                    className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    title="Edit nama"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <p className="text-sm text-muted-foreground">{profile?.email}</p>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-secondary p-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Shield className="h-4 w-4" />
                  Role
                </span>
                <span className="text-sm font-medium text-foreground">{topRole}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-secondary p-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Award className="h-4 w-4" />
                  Level
                </span>
                <span className="text-sm font-medium text-foreground">{profile?.level}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-secondary p-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  Kontribusi
                </span>
                <span className="text-sm font-medium text-foreground">{articleCount} artikel</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-secondary p-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Bergabung
                </span>
                <span className="text-sm font-medium text-foreground">
                  {profile?.created_at ? new Date(profile.created_at).toLocaleDateString("id-ID") : "-"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProfilePage;
