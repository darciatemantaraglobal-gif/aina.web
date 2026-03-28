import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Plus, Trash2, Calendar, ChevronRight, ChevronDown,
  CheckCircle2, Circle, ArrowLeft, Clock, BookOpen,
  FileText, CreditCard, Building2, Stamp, GraduationCap,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────── */
interface Deadline {
  id: string;
  title: string;
  due_date: string;
  category: string;
  completed: boolean;
}

interface ProcedureStep {
  label: string;
  detail?: string;
}

interface Procedure {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  steps: ProcedureStep[];
}

/* ── Procedure Templates ────────────────────────────────── */
const PROCEDURES: Procedure[] = [
  {
    id: "iqama",
    title: "Perpanjang Iqama",
    subtitle: "Izin tinggal tahunan",
    icon: CreditCard,
    color: "text-violet-400",
    steps: [
      { label: "Siapkan paspor asli + fotokopi halaman foto & visa", detail: "Minimal 6 bulan sebelum paspor kadaluarsa" },
      { label: "Siapkan Shahada Qaid (surat keterangan mahasiswa aktif) dari Al-Azhar", detail: "Bisa diambil di bagian qaid dengan membawa kartu mahasiswa" },
      { label: "Foto terbaru ukuran 4×6 berlatar putih (2 lembar)" },
      { label: "Pergi ke kantor Imigrasi (Jawazat) di area domisili" },
      { label: "Ambil nomor antrean dan isi formulir perpanjangan iqama" },
      { label: "Serahkan berkas ke loket, bayar biaya perpanjangan" },
      { label: "Tunggu proses 1–3 hari kerja, ambil iqama baru" },
    ],
  },
  {
    id: "pendaftaran-azhar",
    title: "Pendaftaran Ulang Al-Azhar",
    subtitle: "Setiap awal semester",
    icon: GraduationCap,
    color: "text-amber-400",
    steps: [
      { label: "Cek jadwal pendaftaran ulang di portal Al-Azhar atau pengumuman resmi" },
      { label: "Lunasi biaya kuliah (rasm) semester berjalan", detail: "Bisa via bank atau loket kampus" },
      { label: "Bawa bukti pembayaran, kartu mahasiswa, dan pas foto ke bagian Qaid" },
      { label: "Serahkan berkas dan minta Shahada Qaid (surat aktif mahasiswa)" },
      { label: "Simpan Shahada Qaid — diperlukan untuk urusan iqama, KBRI, dll" },
      { label: "Update data di SIMAK (Sistem Informasi Mahasiswa) jika tersedia" },
    ],
  },
  {
    id: "visa-belajar",
    title: "Perpanjang Visa Belajar",
    subtitle: "Visa pelajar tahunan",
    icon: Stamp,
    color: "text-blue-400",
    steps: [
      { label: "Siapkan paspor asli + fotokopi (semua halaman)" },
      { label: "Surat penerimaan/aktif dari Al-Azhar (Shahada Qaid terbaru)" },
      { label: "Foto terbaru ukuran 4×6 berlatar putih (4 lembar)" },
      { label: "Iqama yang masih berlaku atau sedang dalam proses perpanjangan" },
      { label: "Datang ke kantor Imigrasi Mesir (Mohadreen el-Kharigiyeen)" },
      { label: "Isi formulir permohonan perpanjangan visa belajar" },
      { label: "Bayar biaya visa, simpan kwitansi", detail: "Nominal bisa berubah, cek ke senior atau KBRI" },
      { label: "Tunggu proses dan ambil paspor dengan visa baru" },
    ],
  },
  {
    id: "legalisir-kbri",
    title: "Legalisir Dokumen di KBRI",
    subtitle: "Ijazah, transkrip, dll",
    icon: Stamp,
    color: "text-green-400",
    steps: [
      { label: "Hubungi atau kunjungi KBRI Kairo untuk cek jadwal layanan legalisir" },
      { label: "Siapkan dokumen asli yang ingin dilegalisir (ijazah, transkrip, akta, dll)" },
      { label: "Siapkan fotokopi dokumen (biasanya 2 rangkap)" },
      { label: "Siapkan paspor asli + fotokopi sebagai identitas" },
      { label: "Datang ke KBRI sesuai jadwal dan serahkan berkas ke loket konsuler" },
      { label: "Bayar biaya legalisir dan ambil tanda terima" },
      { label: "Ambil dokumen yang sudah dilegalisir sesuai waktu yang ditentukan" },
    ],
  },
  {
    id: "buka-rekening",
    title: "Buka Rekening Bank",
    subtitle: "Bank lokal Mesir",
    icon: Building2,
    color: "text-cyan-400",
    steps: [
      { label: "Pilih bank yang banyak digunakan Masisir (Banque Misr, CIB, Bank of Alexandria)" },
      { label: "Siapkan paspor asli + fotokopi" },
      { label: "Siapkan iqama yang masih berlaku + fotokopi" },
      { label: "Siapkan pas foto terbaru (1–2 lembar)" },
      { label: "Datang ke cabang bank, minta formulir pembukaan rekening tabungan" },
      { label: "Isi formulir, serahkan berkas ke teller, setorkan saldo awal minimum", detail: "Cek minimal setoran ke masing-masing bank" },
    ],
  },
  {
    id: "paspor-kbri",
    title: "Perpanjang Paspor di KBRI",
    subtitle: "Paspor RI di luar negeri",
    icon: FileText,
    color: "text-rose-400",
    steps: [
      { label: "Cek jadwal layanan paspor KBRI Kairo (walk-in atau booking)" },
      { label: "Siapkan paspor lama asli + fotokopi halaman foto" },
      { label: "Siapkan fotokopi KTP dan Kartu Keluarga terbaru" },
      { label: "Pas foto terbaru ukuran 4×6 berlatar putih (4 lembar)" },
      { label: "Bukti mahasiswa aktif (Shahada Qaid dari Al-Azhar)" },
      { label: "Datang ke KBRI sesuai jadwal, ambil nomor antrean paspor" },
      { label: "Serahkan berkas dan bayar biaya paspor (sesuai kebijakan KBRI)" },
      { label: "Tunggu proses (biasanya 3–7 hari kerja), ambil paspor baru" },
    ],
  },
];

const DEADLINE_CATEGORIES = ["Akademik", "Administrasi", "Pribadi", "Lainnya"];

const CAT_COLORS: Record<string, string> = {
  Akademik: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  Administrasi: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  Pribadi: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  Lainnya: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

/* ── Helpers ────────────────────────────────────────────── */
function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyStyle(days: number, completed: boolean) {
  if (completed) return { bar: "bg-emerald-500", badge: "text-emerald-400", label: "Selesai" };
  if (days < 0)  return { bar: "bg-red-500",     badge: "text-red-400",     label: `${Math.abs(days)} hari terlewat` };
  if (days === 0) return { bar: "bg-orange-500",  badge: "text-orange-400",  label: "Hari ini!" };
  if (days <= 3)  return { bar: "bg-orange-400",  badge: "text-orange-300",  label: `${days} hari lagi` };
  if (days <= 7)  return { bar: "bg-yellow-400",  badge: "text-yellow-300",  label: `${days} hari lagi` };
  return           { bar: "bg-emerald-500",        badge: "text-emerald-400", label: `${days} hari lagi` };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function getProcProgress(userId: string, procId: string, total: number): Set<number> {
  try {
    const raw = localStorage.getItem(`aina_proc_${userId}_${procId}`);
    if (raw) return new Set(JSON.parse(raw) as number[]);
  } catch {}
  return new Set();
}

function saveProcProgress(userId: string, procId: string, done: Set<number>) {
  localStorage.setItem(`aina_proc_${userId}_${procId}`, JSON.stringify([...done]));
}

/* ── Deadline Tab ───────────────────────────────────────── */
function DeadlineTab({ userId }: { userId: string }) {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Akademik");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tasks")
      .select("id, title, content, completed")
      .eq("user_id", userId)
      .eq("task_type", "deadline")
      .order("content", { ascending: true });

    if (data) {
      setDeadlines(
        data.map(r => {
          let meta = { due_date: "", category: "Lainnya" };
          try { meta = JSON.parse(r.content ?? "{}"); } catch {}
          return { id: r.id, title: r.title, due_date: meta.due_date, category: meta.category, completed: r.completed };
        }).sort((a, b) => (a.due_date > b.due_date ? 1 : -1))
      );
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!title.trim() || !dueDate) { toast.error("Isi judul dan tanggal tenggat"); return; }
    setSaving(true);
    const { data, error } = await supabase.from("tasks").insert({
      user_id: userId,
      title: title.trim(),
      task_type: "deadline",
      content: JSON.stringify({ due_date: dueDate, category }),
      completed: false,
    }).select("id, title, content, completed").single();
    setSaving(false);
    if (error || !data) { toast.error("Gagal menyimpan"); return; }
    let meta = { due_date: "", category: "Lainnya" };
    try { meta = JSON.parse(data.content ?? "{}"); } catch {}
    setDeadlines(prev => [...prev, { id: data.id, title: data.title, due_date: meta.due_date, category: meta.category, completed: data.completed }]
      .sort((a, b) => (a.due_date > b.due_date ? 1 : -1)));
    setTitle(""); setDueDate(""); setCategory("Akademik"); setShowForm(false);
    toast.success("Tenggat ditambahkan");
  };

  const toggleComplete = async (d: Deadline) => {
    await supabase.from("tasks").update({ completed: !d.completed }).eq("id", d.id);
    setDeadlines(prev => prev.map(x => x.id === d.id ? { ...x, completed: !x.completed } : x));
  };

  const handleDelete = async (id: string) => {
    await supabase.from("tasks").delete().eq("id", id);
    setDeadlines(prev => prev.filter(x => x.id !== id));
    toast.success("Tenggat dihapus");
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {deadlines.filter(d => !d.completed).length} tenggat aktif
        </p>
        <Button size="sm" onClick={() => setShowForm(v => !v)} className="gap-1.5 h-8 text-xs">
          <Plus className="h-3.5 w-3.5" /> Tambah Tenggat
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">Tenggat Baru</p>
          <Input
            placeholder="Nama tenggat / tugas..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="bg-secondary text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Kategori</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              >
                {DEADLINE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Tanggal Tenggat</label>
              <input
                type="date"
                value={dueDate}
                min={todayStr}
                onChange={e => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)} className="flex-1 h-8 text-xs">Batal</Button>
            <Button size="sm" onClick={handleAdd} disabled={saving} className="flex-1 h-8 text-xs">
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-xl bg-secondary/40 animate-pulse" />
          ))}
        </div>
      ) : deadlines.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center opacity-40">
          <Calendar className="h-8 w-8 mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Belum ada tenggat</p>
          <p className="text-xs text-muted-foreground mt-1">Tambahkan deadline ujian, dokumen, atau tugas pentingmu</p>
        </div>
      ) : (
        <div className="space-y-2">
          {deadlines.map(d => {
            const days = daysUntil(d.due_date);
            const u = urgencyStyle(days, d.completed);
            return (
              <div
                key={d.id}
                className={`group flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 transition-opacity ${
                  d.completed ? "opacity-50" : ""
                }`}
              >
                {/* Urgency bar */}
                <div className={`w-1 self-stretch rounded-full shrink-0 ${u.bar}`} />

                {/* Complete toggle */}
                <button
                  onClick={() => toggleComplete(d)}
                  className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                >
                  {d.completed
                    ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
                    : <Circle className="h-4.5 w-4.5" />
                  }
                </button>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium leading-tight truncate ${d.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {d.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-[10px] border rounded-full px-2 py-0.5 ${CAT_COLORS[d.category] ?? CAT_COLORS["Lainnya"]}`}>
                      {d.category}
                    </span>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {formatDate(d.due_date)}
                    </span>
                    <span className={`text-[11px] font-medium ${u.badge}`}>{u.label}</span>
                  </div>
                </div>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(d.id)}
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Procedure Tab ──────────────────────────────────────── */
function ProcedureTab({ userId }: { userId: string }) {
  const [selected, setSelected] = useState<Procedure | null>(null);
  const [progress, setProgress] = useState<Set<number>>(new Set());

  const openProcedure = (proc: Procedure) => {
    setSelected(proc);
    setProgress(getProcProgress(userId, proc.id, proc.steps.length));
  };

  const toggleStep = (idx: number) => {
    if (!selected) return;
    const next = new Set(progress);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setProgress(next);
    saveProcProgress(userId, selected.id, next);
  };

  const resetProgress = () => {
    if (!selected) return;
    const empty = new Set<number>();
    setProgress(empty);
    saveProcProgress(userId, selected.id, empty);
    toast.success("Progress direset");
  };

  if (selected) {
    const done = progress.size;
    const total = selected.steps.length;
    const pct = Math.round((done / total) * 100);
    const Icon = selected.icon;

    return (
      <div className="space-y-4">
        {/* Back */}
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke daftar prosedur
        </button>

        {/* Header */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-xl bg-secondary p-2.5">
              <Icon className={`h-5 w-5 ${selected.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground">{selected.title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{selected.subtitle}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-bold text-foreground">{pct}%</p>
              <p className="text-[10px] text-muted-foreground">{done}/{total} selesai</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-2">
          {selected.steps.map((step, i) => {
            const isDone = progress.has(i);
            return (
              <button
                key={i}
                onClick={() => toggleStep(i)}
                className={`w-full flex items-start gap-3 rounded-xl border px-3 py-3 text-left transition-all ${
                  isDone
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "border-border bg-card hover:bg-secondary/50"
                }`}
              >
                <div className={`shrink-0 mt-0.5 rounded-full border-2 h-4 w-4 flex items-center justify-center transition-colors ${
                  isDone ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground/40"
                }`}>
                  {isDone && <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${isDone ? "text-muted-foreground line-through" : "text-foreground"}`}>
                    <span className="font-medium text-muted-foreground/60 mr-1.5">{i + 1}.</span>
                    {step.label}
                  </p>
                  {step.detail && (
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">{step.detail}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {done > 0 && (
          <button
            onClick={resetProgress}
            className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            Reset progress
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Panduan langkah demi langkah untuk prosedur umum Masisir. Klik untuk mulai.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PROCEDURES.map(proc => {
          const done = getProcProgress(userId, proc.id, proc.steps.length).size;
          const total = proc.steps.length;
          const pct = Math.round((done / total) * 100);
          const Icon = proc.icon;

          return (
            <button
              key={proc.id}
              onClick={() => openProcedure(proc)}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left hover:bg-secondary/40 hover:border-primary/20 transition-all"
            >
              <div className="shrink-0 rounded-xl bg-secondary p-2.5 group-hover:bg-secondary/80 transition-colors">
                <Icon className={`h-4.5 w-4.5 ${proc.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground leading-snug">{proc.title}</p>
                <p className="text-[11px] text-muted-foreground">{proc.subtitle}</p>
                {done > 0 && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{done}/{total}</span>
                  </div>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────── */
const ProductivityPage = ({ userId: userIdProp }: { userId?: string }) => {
  const [userId, setUserId] = useState(userIdProp ?? "");
  const [tab, setTab] = useState<"deadline" | "prosedur">("deadline");

  useEffect(() => {
    if (userIdProp) { setUserId(userIdProp); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setUserId(session.user.id);
    });
  }, [userIdProp]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-5 pt-5 pb-4 border-b border-border">
        <h1 className="text-lg font-bold font-display text-foreground">Ruang Produktif</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Kelola tenggat waktu dan panduan prosedur Masisir</p>

        {/* Tab pills */}
        <div className="flex gap-1 mt-4">
          {([
            { id: "deadline", label: "Tenggatku", icon: Calendar },
            { id: "prosedur", label: "Prosedur Masisir", icon: BookOpen },
          ] as const).map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  tab === t.id
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {userId ? (
          tab === "deadline"
            ? <DeadlineTab userId={userId} />
            : <ProcedureTab userId={userId} />
        ) : (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            Memuat...
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductivityPage;
