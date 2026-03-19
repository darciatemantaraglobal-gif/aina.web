import { useState, useEffect, useRef, useCallback } from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Award, Shield, FileText, Calendar, Pencil, Check, X, AlertCircle, Camera, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 80 }, aspect, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight
  );
}

async function getCroppedBlob(image: HTMLImageElement, crop: PixelCrop): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const size = Math.min(crop.width * scaleX, crop.height * scaleY);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0, 0, size, size
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas is empty"));
    }, "image/jpeg", 0.9);
  });
}

const ProfilePage = ({ userId: userIdProp }: { userId?: string }) => {
  const [profile, setProfile] = useState<any>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [articleCount, setArticleCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imgSrc, setImgSrc] = useState("");
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [scale, setScale] = useState(1);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (attempt = 1) => {
    if (attempt === 1) {
      setLoadError(false);
      setLoading(true);
    }
    try {
      let uid = userIdProp;
      if (!uid) {
        const { data: { session } } = await supabase.auth.getSession();
        uid = session?.user?.id;
      }
      if (!uid) { setLoading(false); return; }

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 25000)
      );

      const [profileRes, rolesRes, articlesRes] = await Promise.race([
        Promise.all([
          supabase.from("profiles").select("*").eq("user_id", uid).single(),
          supabase.from("user_roles").select("role").eq("user_id", uid),
          supabase.from("knowledge_base").select("id").eq("author_id", uid).eq("status", "approved"),
        ]),
        timeout,
      ]);

      if (profileRes.data) setProfile(profileRes.data);
      if (rolesRes.data) setRoles(rolesRes.data.map((r) => r.role));
      if (articlesRes.data) setArticleCount(articlesRes.data.length);
      setLoading(false);
    } catch (err) {
      console.error(`ProfilePage error (attempt ${attempt}):`, err);
      if (attempt < 3) {
        setTimeout(() => loadData(attempt + 1), 3000);
        return;
      }
      setLoadError(true);
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

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar (JPG, PNG, dll)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Ukuran foto maksimal 10MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImgSrc(reader.result as string);
      setScale(1);
      setCrop(undefined);
      setCompletedCrop(undefined);
      setCropModalOpen(true);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, 1));
  }, []);

  const handleCropConfirm = async () => {
    if (!completedCrop || !imgRef.current) {
      toast.error("Pilih area crop terlebih dahulu");
      return;
    }

    setUploadingAvatar(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Silakan login terlebih dahulu"); return; }

      const blob = await getCroppedBlob(imgRef.current, completedCrop);
      const filePath = `${session.user.id}/avatar.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(filePath, blob, { contentType: "image/jpeg", upsert: true });

      if (uploadErr) throw new Error(uploadErr.message);

      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const cacheBustedUrl = `${publicUrl}?t=${Date.now()}`;

      await supabase.from("profiles").update({ avatar_url: cacheBustedUrl }).eq("user_id", session.user.id);
      setProfile((prev: any) => ({ ...prev, avatar_url: cacheBustedUrl }));
      setCropModalOpen(false);
      setImgSrc("");
      toast.success("Foto profil berhasil diperbarui!");
    } catch (err: any) {
      toast.error(err.message || "Gagal mengupload foto");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleCropCancel = () => {
    setCropModalOpen(false);
    setImgSrc("");
    setCrop(undefined);
    setCompletedCrop(undefined);
    setScale(1);
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
          onClick={() => loadData()}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  const topRole = roles.includes("admin") ? "Admin"
    : roles.includes("senior_contributor") ? "Senior Contributor"
    : roles.includes("contributor") ? "Contributor"
    : "User";

  const initials = profile?.full_name?.charAt(0)?.toUpperCase() || "U";

  return (
    <>
      <div className="h-full overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-md space-y-6">
          <Card className="border-border bg-card overflow-hidden">
            <div className="h-24 bg-gradient-purple" />
            <CardContent className="-mt-12 p-6">
              <div className="flex flex-col items-center text-center">
                <div className="relative">
                  <Avatar className="h-20 w-20 border-4 border-card">
                    <AvatarImage src={profile?.avatar_url} alt={profile?.full_name} />
                    <AvatarFallback className="bg-secondary text-2xl font-bold text-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    onClick={handleAvatarClick}
                    disabled={uploadingAvatar}
                    className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground transition-opacity hover:opacity-80 disabled:opacity-50"
                    title="Ganti foto profil"
                  >
                    {uploadingAvatar
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Camera className="h-3.5 w-3.5" />
                    }
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>

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
                  <span className="text-sm font-medium text-foreground">{profile?.level || "Anggota"}</span>
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

      <Dialog open={cropModalOpen} onOpenChange={(open) => { if (!open) handleCropCancel(); }}>
        <DialogContent className="max-w-sm w-full gap-4 p-5">
          <DialogHeader>
            <DialogTitle className="text-base">Crop Foto Profil</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3">
            <p className="text-xs text-muted-foreground text-center">
              Geser dan ubah ukuran kotak untuk memilih area foto
            </p>

            <div className="w-full overflow-hidden rounded-xl border border-border bg-black flex items-center justify-center" style={{ maxHeight: 320 }}>
              {imgSrc && (
                <ReactCrop
                  crop={crop}
                  onChange={(_, pct) => setCrop(pct)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={1}
                  circularCrop
                  minWidth={60}
                  minHeight={60}
                >
                  <img
                    ref={imgRef}
                    src={imgSrc}
                    alt="Crop preview"
                    style={{ transform: `scale(${scale})`, transformOrigin: "center", maxHeight: 300, maxWidth: "100%", display: "block" }}
                    onLoad={onImageLoad}
                  />
                </ReactCrop>
              )}
            </div>

            <div className="flex w-full items-center gap-2">
              <button
                onClick={() => setScale(s => Math.max(0.5, parseFloat((s - 0.1).toFixed(1))))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.05}
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                className="flex-1 accent-purple-500"
              />
              <button
                onClick={() => setScale(s => Math.min(3, parseFloat((s + 0.1).toFixed(1))))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <span className="w-10 text-right text-xs text-muted-foreground">{Math.round(scale * 100)}%</span>
            </div>
          </div>

          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="ghost" size="sm" onClick={handleCropCancel} disabled={uploadingAvatar} className="flex-1 sm:flex-none">
              Batal
            </Button>
            <Button size="sm" onClick={handleCropConfirm} disabled={uploadingAvatar || !completedCrop} className="flex-1 sm:flex-none bg-primary">
              {uploadingAvatar ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Mengupload...</>
              ) : (
                "Simpan Foto"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProfilePage;
