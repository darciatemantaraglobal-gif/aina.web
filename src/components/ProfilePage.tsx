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
  const [badges, setBadges] = useState<Array<{badge_type: string; name: string; emoji: string; rare: boolean; awarded_at: string}>>([]);

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

      // Fetch badges (non-blocking, fails silently)
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (s?.access_token) {
          const badgeRes = await fetch("/api/my-badges", {
            headers: { Authorization: `Bearer ${s.access_token}` },
          });
          if (badgeRes.ok) {
            const badgeData = await badgeRes.json();
            setBadges(badgeData);
          }
        }
      } catch {
        // Badges are non-critical, ignore error
      }

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
        <div className="mx-auto max-w-md space-y-4">
          <Card className="border-border bg-card overflow-hidden">
            {/* Header — no banner, just ambient glow background */}
            <div className="relative flex flex-col items-center px-6 pb-6 pt-10">
              {/* Ambient background glows */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-violet-900/20 via-purple-900/8 to-transparent" />
                <div className="absolute left-1/2 top-0 h-48 w-48 -translate-x-1/2 -translate-y-1/4 rounded-full bg-primary/15 blur-3xl" />
                <div className="absolute left-1/4 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-fuchsia-600/10 blur-2xl" />
                <div className="absolute right-1/4 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-violet-600/10 blur-2xl" />
              </div>

              {/* Avatar with spinning glow ring */}
              <div className="relative z-10">
                <div className="avatar-glow-ring">
                  <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-card">
                    <Avatar className="h-[92px] w-[92px]">
                      <AvatarImage src={profile?.avatar_url} alt={profile?.full_name} />
                      <AvatarFallback className="rounded-full bg-gradient-to-br from-violet-700 to-purple-900 text-2xl font-bold text-white">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </div>

                {/* Camera button — outside the glow ring */}
                <button
                  onClick={handleAvatarClick}
                  disabled={uploadingAvatar}
                  className="absolute -bottom-0.5 -right-0.5 z-20 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-lg transition-opacity hover:opacity-80 disabled:opacity-50"
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

              {/* Role badge */}
              <div className="relative z-10 mt-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  topRole === "Admin"
                    ? "bg-red-500/15 text-red-400 border border-red-500/20"
                    : topRole === "Senior Contributor"
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                    : topRole === "Contributor"
                    ? "bg-primary/15 text-primary border border-primary/20"
                    : "bg-secondary text-muted-foreground border border-border"
                }`}>
                  <Shield className="h-3 w-3" />
                  {topRole}
                </span>
              </div>

              {/* Name & email */}
              <div className="relative z-10 mt-3 flex flex-col items-center text-center">
                {editing ? (
                  <div className="flex w-full max-w-xs items-center gap-2">
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
                  <div className="flex items-center gap-2">
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
                <p className="mt-0.5 text-sm text-muted-foreground">{profile?.email}</p>
              </div>
            </div>

            {/* Divider */}
            <div className="mx-6 border-t border-border/60" />

            {/* Stats */}
            <CardContent className="p-6 pt-5">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-4 py-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Award className="h-4 w-4" />
                    Level
                  </span>
                  <span className="text-sm font-medium text-foreground">{profile?.level || "Anggota"}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-4 py-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    Kontribusi
                  </span>
                  <span className="text-sm font-medium text-foreground">{articleCount} artikel</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-4 py-3">
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

          {/* Badges Card */}
          {badges.length > 0 && (
            <Card className="border-border bg-card overflow-hidden">
              <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Award className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Badges</h3>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                    {badges.length}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {badges.map((badge) => (
                    <div
                      key={badge.badge_type}
                      className={`group relative flex flex-col items-center gap-1.5 overflow-hidden rounded-2xl border p-3 text-center transition-transform hover:scale-[1.02] ${
                        badge.rare
                          ? "border-violet-500/30 bg-gradient-to-b from-violet-900/20 to-purple-900/10"
                          : "border-border bg-secondary/40"
                      }`}
                    >
                      {/* Rare shimmer effect */}
                      {badge.rare && (
                        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
                          <div className="absolute inset-0 bg-gradient-to-br from-violet-400/5 via-transparent to-fuchsia-400/5" />
                          <div
                            className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,transparent_0%,transparent_40%,hsl(270_80%_65%/0.08)_50%,transparent_60%,transparent_100%)]"
                            style={{ animation: "chatbox-spin 6s linear infinite" }}
                          />
                        </div>
                      )}

                      {/* Emoji */}
                      <div className={`relative z-10 flex h-11 w-11 items-center justify-center rounded-xl text-2xl ${
                        badge.rare
                          ? "bg-gradient-to-br from-violet-700/30 to-purple-800/30 shadow-lg shadow-purple-900/20"
                          : "bg-secondary"
                      }`}>
                        {badge.emoji}
                      </div>

                      {/* Name */}
                      <p className="relative z-10 text-xs font-semibold leading-tight text-foreground">
                        {badge.name}
                      </p>

                      {/* Rare label */}
                      {badge.rare && (
                        <span className="relative z-10 rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-violet-300">
                          EKSKLUSIF
                        </span>
                      )}

                      {/* Awarded date tooltip on hover */}
                      <p className="relative z-10 text-[10px] text-muted-foreground/60">
                        {new Date(badge.awarded_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
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
