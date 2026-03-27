import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User, MapPin, GraduationCap, BookOpen, Calendar, ChevronRight, Loader2, Sparkles, Camera } from "lucide-react";
import ainaLogo from "@/assets/aina-logo.png";

const FACULTIES = [
  "Ushuluddin",
  "Syariah",
  "Bahasa Arab",
  "Studi Islam",
  "Dakwah",
  "Lainnya",
];

interface InitialValues {
  fullName?: string;
  originCity?: string;
  faculty?: string;
  studyField?: string;
  arrivalYear?: string;
  avatarUrl?: string;
}

interface SetupProfileModalProps {
  userId: string;
  onComplete: () => void;
  initialValues?: InitialValues;
}

const SETUP_DONE_KEY = (uid: string) => `aina_setup_done_${uid}`;

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 1999 }, (_, i) => String(currentYear - i));

export default function SetupProfileModal({ userId, onComplete, initialValues }: SetupProfileModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState(initialValues?.fullName ?? "");
  const [originCity, setOriginCity] = useState(initialValues?.originCity ?? "");
  const [faculty, setFaculty] = useState(initialValues?.faculty ?? "");
  const [studyField, setStudyField] = useState(initialValues?.studyField ?? "");
  const [arrivalYear, setArrivalYear] = useState(initialValues?.arrivalYear ?? "");
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>(initialValues?.avatarUrl ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ukuran foto maksimal 5MB");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile) return null;
    const ext = avatarFile.name.split(".").pop() ?? "jpg";
    const filePath = `${userId}/avatar.${ext}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(filePath, avatarFile, { contentType: avatarFile.type, upsert: true });
    if (error) throw new Error(error.message);
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(filePath);
    return `${publicUrl}?t=${Date.now()}`;
  };

  const handleNext = () => {
    if (!fullName.trim()) {
      toast.error("Nama lengkap wajib diisi");
      return;
    }
    setStep(2);
  };

  const handleSave = async () => {
    if (!fullName.trim()) { toast.error("Nama lengkap wajib diisi"); return; }
    setSaving(true);
    try {
      let newAvatarUrl: string | null = null;
      if (avatarFile) {
        newAvatarUrl = await uploadAvatar();
      }

      const year = arrivalYear ? parseInt(arrivalYear) : null;
      const updates: Record<string, any> = {
        full_name: fullName.trim(),
        origin_city: originCity.trim() || null,
        faculty: faculty || null,
        study_field: studyField.trim() || null,
        arrival_year: year,
      };
      if (newAvatarUrl) updates.avatar_url = newAvatarUrl;

      const { error } = await supabase.from("profiles").update(updates).eq("user_id", userId);
      if (error) {
        if (error.message?.includes("column") || error.code === "42703") {
          await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("user_id", userId);
        } else {
          throw error;
        }
      }
      localStorage.setItem(SETUP_DONE_KEY(userId), "1");
      toast.success("Profil berhasil disimpan!");
      onComplete();
    } catch (e: any) {
      toast.error("Gagal menyimpan profil: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (step === 1) {
      if (!fullName.trim()) { toast.error("Nama lengkap wajib diisi, yuk isi dulu!"); return; }
      setStep(2);
      return;
    }
    await handleSave();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="pointer-events-none absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className={`relative z-10 w-full max-w-md rounded-3xl border border-border bg-background shadow-2xl transition-all duration-500 ${
          visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-4 scale-95"
        }`}
      >
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-3xl overflow-hidden">
          <div
            className="h-full bg-gradient-purple transition-all duration-500"
            style={{ width: step === 1 ? "50%" : "100%" }}
          />
        </div>

        <div className="px-6 pt-8 pb-6">
          {/* Logo & Welcome */}
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="relative mb-4">
              <img src={ainaLogo} alt="AINA" className="h-14 w-14 object-contain" />
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px]">
                <Sparkles className="h-3 w-3 text-white" />
              </span>
            </div>
            {step === 1 ? (
              <>
                <h1 className="font-display text-xl font-bold text-foreground">Selamat datang di AINA!</h1>
                <p className="mt-1.5 text-sm text-muted-foreground max-w-xs">
                  Isi profilmu dulu supaya AINA bisa mengenalmu lebih baik dan memberikan bantuan yang lebih personal.
                </p>
              </>
            ) : (
              <>
                <h1 className="font-display text-xl font-bold text-foreground">Info Studi <span className="text-gradient-purple">(opsional)</span></h1>
                <p className="mt-1.5 text-sm text-muted-foreground max-w-xs">
                  Isi info studi supaya AINA bisa kasih saran yang lebih relevan. Bisa dilewati dan diisi nanti.
                </p>
              </>
            )}
          </div>

          {/* Step 1: Basic Info + Avatar */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Avatar picker */}
              <div className="flex flex-col items-center gap-2">
                <div className="relative">
                  <div
                    className="h-20 w-20 rounded-full overflow-hidden border-2 border-border bg-secondary flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary border-2 border-background hover:bg-primary/90 transition-colors"
                  >
                    <Camera className="h-3.5 w-3.5 text-white" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {avatarPreview
                    ? <span className="text-primary/80">Foto terpilih — klik untuk ganti</span>
                    : "Upload foto profil (opsional)"}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <User className="h-3.5 w-3.5 text-primary" />
                  Nama Lengkap <span className="text-red-400">*</span>
                </label>
                <input
                  autoFocus
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleNext()}
                  placeholder="Nama kamu seperti di KTP"
                  maxLength={100}
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  Kota Asal <span className="text-muted-foreground font-normal">(opsional)</span>
                </label>
                <input
                  type="text"
                  value={originCity}
                  onChange={e => setOriginCity(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleNext()}
                  placeholder="Contoh: Surabaya, Jakarta, Bandung..."
                  maxLength={100}
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-colors"
                />
              </div>

              <button
                onClick={handleNext}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-purple py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              >
                Lanjut <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Step 2: Study Info */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <GraduationCap className="h-3.5 w-3.5 text-primary" />
                  Fakultas
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {FACULTIES.map(f => (
                    <button
                      key={f}
                      onClick={() => setFaculty(faculty === f ? "" : f)}
                      className={`rounded-xl border px-3 py-2.5 text-xs font-medium text-left transition-colors ${
                        faculty === f
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <BookOpen className="h-3.5 w-3.5 text-primary" />
                  Jurusan / Program Studi
                </label>
                <input
                  type="text"
                  value={studyField}
                  onChange={e => setStudyField(e.target.value)}
                  placeholder="Contoh: Tafsir Hadits, Qadha, Balaghah..."
                  maxLength={100}
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  Tahun Tiba di Mesir
                </label>
                <div className="flex flex-wrap gap-2">
                  {YEARS.slice(0, 8).map(y => (
                    <button
                      key={y}
                      onClick={() => setArrivalYear(arrivalYear === y ? "" : y)}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                        arrivalYear === y
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                      }`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setStep(1); }}
                  className="flex-1 rounded-xl border border-border py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  Kembali
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-purple py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {saving ? "Menyimpan..." : "Simpan & Mulai"}
                </button>
              </div>

              <button
                onClick={handleSkip}
                disabled={saving}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Lewati, isi nanti
              </button>
            </div>
          )}

          {/* Step indicator */}
          <div className="mt-5 flex items-center justify-center gap-1.5">
            <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 1 ? "w-6 bg-primary" : "w-2 bg-border"}`} />
            <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 2 ? "w-6 bg-primary" : "w-2 bg-border"}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
