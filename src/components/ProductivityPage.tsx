import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { triggerConfetti } from "@/utils/confetti";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Plus, Trash2, Calendar, ChevronRight, CheckCircle2, Circle,
  ArrowLeft, Clock, FileText, CreditCard, Building2, Stamp,
  GraduationCap, Sparkles, Brain, Pencil, AlertTriangle, Loader2,
  Target, ClipboardList, BookOpen, RefreshCw, Bell, Mail, Send,
  CheckCheck, SkipForward, X, Save, StickyNote, ListTodo, ListChecks, Layers,
  ShieldCheck, Timer, Bot,
} from "lucide-react";
import FlashcardPage from "./FlashcardPage";

/* ════════════════════════════════════════════════════════
   GAMIFICATION — levels, streak, progress
   ════════════════════════════════════════════════════════ */
const MASISIR_LEVELS = [
  { min: 0,   max: 4,          icon: "🌱", label: "Benih",                 color: "text-emerald-400",  bg: "bg-emerald-500/10 border-emerald-500/20" },
  { min: 5,   max: 19,         icon: "⚡", label: "Pelajar Aktif",         color: "text-blue-400",     bg: "bg-blue-500/10 border-blue-500/20" },
  { min: 20,  max: 49,         icon: "🔥", label: "Santri Produktif",      color: "text-orange-400",   bg: "bg-orange-500/10 border-orange-500/20" },
  { min: 50,  max: 99,         icon: "🌟", label: "Masisir Berpengalaman", color: "text-amber-400",    bg: "bg-amber-500/10 border-amber-500/20" },
  { min: 100, max: Infinity,   icon: "🏆", label: "Veteran Masisir",       color: "text-violet-400",   bg: "bg-violet-500/10 border-violet-500/20" },
];

function getMasisirLevel(totalDone: number) {
  return MASISIR_LEVELS.find(l => totalDone >= l.min && totalDone <= l.max) ?? MASISIR_LEVELS[0];
}

function getCairoDateStr(d?: Date): string {
  return (d ?? new Date()).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
}

function calcStreak(doneDates: string[]): number {
  if (!doneDates.length) return 0;
  const doneSet = new Set(doneDates);
  const cairoToday = getCairoDateStr();
  const [y, m, day] = cairoToday.split("-").map(Number);
  let cursor = new Date(Date.UTC(y, m - 1, day, 12));
  if (!doneSet.has(getCairoDateStr(cursor))) cursor = new Date(cursor.getTime() - 86400000);
  let streak = 0;
  while (doneSet.has(getCairoDateStr(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - 86400000);
  }
  return streak;
}

function GamificationBar({
  userId, refreshKey,
}: { userId: string; refreshKey: number }) {
  const [stats, setStats] = useState<{
    streak: number; totalDone: number;
    todayDone: number; todayTotal: number;
  } | null>(null);

  useEffect(() => {
    if (!userId) return;
    const todayStr = getCairoDateStr();
    (async () => {
      try {
        // Fetch last 120 days of done items for streak + level
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 120);
        const { data: allDone } = await supabase
          .from("daily_focus_items")
          .select("focus_date")
          .eq("user_id", userId)
          .eq("status", "done")
          .gte("focus_date", cutoff.toISOString().slice(0, 10));

        // Today's total items
        const { data: todayItems } = await supabase
          .from("daily_focus_items")
          .select("status")
          .eq("user_id", userId)
          .eq("focus_date", todayStr);

        const doneDates = [...new Set((allDone ?? []).map((d: any) => d.focus_date))];
        const todayDone  = (todayItems ?? []).filter((i: any) => i.status === "done").length;
        const todayTotal = (todayItems ?? []).length;
        setStats({ streak: calcStreak(doneDates), totalDone: (allDone ?? []).length, todayDone, todayTotal });
      } catch {}
    })();
  }, [userId, refreshKey]);

  if (!stats) return null;

  const level = getMasisirLevel(stats.totalDone);
  const pct   = stats.todayTotal > 0 ? Math.round((stats.todayDone / stats.todayTotal) * 100) : 0;

  let motivText: string;
  if (stats.todayTotal === 0)   motivText = "Yuk tambah fokus hari ini! 💪";
  else if (pct === 100)         motivText = "Semua fokus hari ini selesai! Lo luar biasa 🎉";
  else if (pct >= 67)           motivText = `Hampir selesai! Tinggal ${stats.todayTotal - stats.todayDone} fokus lagi 🔥`;
  else if (stats.todayDone > 0) motivText = `Hari ini lo udah nyelesain ${stats.todayDone} dari ${stats.todayTotal} fokus 🔥`;
  else                          motivText = `Ada ${stats.todayTotal} fokus menunggumu hari ini 💪`;

  const nextLevel = MASISIR_LEVELS.find(l => l.min > (getMasisirLevel(stats.totalDone).min));
  const toNext = nextLevel ? nextLevel.min - stats.totalDone : 0;

  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference - (pct / 100) * circumference;

  return (
    <div className="mt-3 rounded-2xl border border-border/60 bg-gradient-to-br from-card to-card/60 px-4 py-3.5 md:px-5 md:py-4">
      <div className="flex items-center gap-4 md:gap-5">
        {/* Progress ring */}
        <div className="relative shrink-0 w-14 h-14 md:w-16 md:h-16">
          <svg className="w-14 h-14 md:w-16 md:h-16 -rotate-90" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r={radius} strokeWidth="4" className="stroke-secondary fill-none" />
            <circle
              cx="28" cy="28" r={radius} strokeWidth="4"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={stats.todayTotal === 0 ? circumference : progressOffset}
              className={`transition-all duration-700 ${pct === 100 ? "stroke-emerald-400" : "stroke-primary"}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-sm md:text-base font-bold tabular-nums leading-none ${pct === 100 ? "text-emerald-400" : "text-foreground"}`}>
              {stats.todayTotal === 0 ? "–" : `${stats.todayDone}/${stats.todayTotal}`}
            </span>
            <span className="text-[9px] md:text-[11px] text-muted-foreground mt-0.5">hari ini</span>
          </div>
        </div>

        {/* Right side */}
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-[11px] md:text-sm text-muted-foreground leading-snug">{motivText}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] md:text-xs font-semibold ${
              stats.streak > 0
                ? "bg-orange-500/10 border-orange-500/25 text-orange-400"
                : "bg-secondary border-border text-muted-foreground"
            }`}>
              🔥 {stats.streak > 0 ? `${stats.streak} hari` : "Mulai streak"}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] md:text-xs font-semibold ${level.bg} ${level.color}`}>
              {level.icon} {level.label}
            </span>
          </div>
          {nextLevel && (
            <p className="text-[10px] md:text-xs text-muted-foreground/50">
              {toNext} fokus lagi → <span className="font-medium">{nextLevel.icon} {nextLevel.label}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   TYPES
   ════════════════════════════════════════════════════════ */
interface FocusItem {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "done";
  source_type: "manual" | "ai_assist" | "ai_suggest";
  priority: number | null;
  focus_date: string;
}

interface TrackerItem {
  id: string;
  title: string;
  category: string;
  notes: string | null;
  due_date: string | null;
  status: "not_started" | "preparing" | "submitted" | "completed";
  is_urgent: boolean;
  reminder_enabled: boolean;
}

interface ProcedureStep { label: string; detail?: string; }
interface Procedure {
  id: string; title: string; subtitle: string;
  icon?: React.ElementType; icon_name?: string; color: string; steps: ProcedureStep[];
}

const PROC_ICON_MAP: Record<string, React.ElementType> = {
  CreditCard, GraduationCap, Stamp, FileText, Building2, BookOpen,
};

/* ════════════════════════════════════════════════════════
   API HELPER
   ════════════════════════════════════════════════════════ */
async function apiCall(method: string, path: string, body?: object) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request gagal");
  return json;
}

/* ════════════════════════════════════════════════════════
   CONSTANTS
   ════════════════════════════════════════════════════════ */
const TRACKER_CATEGORIES = [
  { value: "iqomah", label: "Iqomah", color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  { value: "paspor", label: "Paspor", color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
  { value: "visa", label: "Visa", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  { value: "kampus", label: "Kampus", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  { value: "safar", label: "Safar", color: "text-green-400 bg-green-500/10 border-green-500/20" },
  { value: "lainnya", label: "Lainnya", color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20" },
];

const TRACKER_STATUSES = [
  { value: "not_started", label: "Belum Mulai", color: "text-zinc-400" },
  { value: "preparing", label: "Disiapkan", color: "text-amber-400" },
  { value: "submitted", label: "Diajukan", color: "text-blue-400" },
  { value: "completed", label: "Selesai", color: "text-emerald-400" },
];

function getCatStyle(cat: string) {
  return TRACKER_CATEGORIES.find(c => c.value === cat)?.color ?? "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
}
function getCatLabel(cat: string) {
  return TRACKER_CATEGORIES.find(c => c.value === cat)?.label ?? cat;
}
function getStatusStyle(s: string) {
  return TRACKER_STATUSES.find(x => x.value === s)?.color ?? "text-zinc-400";
}
function getStatusLabel(s: string) {
  return TRACKER_STATUSES.find(x => x.value === s)?.label ?? s;
}
function getCatTopColor(cat: string): string {
  const map: Record<string, string> = {
    iqomah: "bg-violet-500/50",
    paspor: "bg-rose-500/50",
    visa:   "bg-blue-500/50",
    kampus: "bg-amber-500/50",
    safar:  "bg-emerald-500/50",
    lainnya:"bg-zinc-500/30",
  };
  return map[cat] ?? "bg-zinc-500/30";
}

function daysUntil(dateStr: string) {
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(dateStr); due.setHours(0,0,0,0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}
function dueBadge(dateStr: string | null) {
  if (!dateStr) return null;
  const d = daysUntil(dateStr);
  if (d < 0)  return { label: `${Math.abs(d)}h terlewat`, cls: "text-red-400" };
  if (d === 0) return { label: "Hari ini!", cls: "text-orange-400" };
  if (d <= 3)  return { label: `${d} hari lagi`, cls: "text-orange-400" };
  if (d <= 7)  return { label: `${d} hari lagi`, cls: "text-yellow-400" };
  return { label: `${d} hari lagi`, cls: "text-emerald-400" };
}

/* ════════════════════════════════════════════════════════
   TAB 1: DAILY FOCUS
   ════════════════════════════════════════════════════════ */
function FocusTab({ onFocusChange }: { onFocusChange?: () => void }) {
  const [items, setItems] = useState<FocusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"none" | "manual" | "ai_assist" | "ai_suggest">("none");
  const [manualTitle, setManualTitle] = useState("");
  const [manualDesc, setManualDesc] = useState("");
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{ title: string; description: string | null; priority: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "" });

  // Notify parent when items change so GamificationBar can refresh
  const doneCount_ = items.filter(i => i.status === "done").length;
  useEffect(() => { onFocusChange?.(); }, [doneCount_, items.length]);

  const today = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Cairo" });
  const activeCount = items.filter(i => i.status !== "done").length;
  const doneCount = items.filter(i => i.status === "done").length;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { items: data } = await apiCall("GET", "/productivity/focus/today");
      setItems(data);
    } catch (e: any) { toast.error(e.message || "Gagal memuat fokus"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addManual = async () => {
    if (!manualTitle.trim()) { toast.error("Tulis judul fokus dulu"); return; }
    if (activeCount >= 3) { toast.error("Maksimal 3 fokus aktif per hari"); return; }
    setSaving(true);
    try {
      const { item } = await apiCall("POST", "/productivity/focus", {
        title: manualTitle, description: manualDesc || null, source_type: "manual",
      });
      setItems(prev => [...prev, item]);
      setManualTitle(""); setManualDesc(""); setMode("none");
      toast.success("Fokus ditambahkan");
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const handleAiAssist = async () => {
    if (!aiInput.trim()) { toast.error("Tulis rencanamu dulu"); return; }
    setAiLoading(true); setAiSuggestions([]);
    try {
      const { items: suggestions } = await apiCall("POST", "/productivity/focus/ai-assist", { userInput: aiInput });
      setAiSuggestions(suggestions);
    } catch (e: any) { toast.error(e.message); }
    setAiLoading(false);
  };

  const handleAiSuggest = async () => {
    setAiLoading(true); setAiSuggestions([]);
    try {
      const { items: suggestions } = await apiCall("POST", "/productivity/focus/ai-suggest");
      setAiSuggestions(suggestions);
    } catch (e: any) { toast.error(e.message); }
    setAiLoading(false);
  };

  const saveAiSuggestions = async () => {
    if (!aiSuggestions.length) return;
    const canAdd = 3 - activeCount;
    if (canAdd <= 0) { toast.error("Sudah 3 fokus aktif hari ini"); return; }
    setSaving(true);
    const toSave = aiSuggestions.slice(0, canAdd);
    let added = 0;
    for (const s of toSave) {
      try {
        const { item } = await apiCall("POST", "/productivity/focus", {
          title: s.title, description: s.description, source_type: mode === "ai_assist" ? "ai_assist" : "ai_suggest",
          priority: s.priority, original_input: mode === "ai_assist" ? aiInput : undefined,
        });
        setItems(prev => [...prev, item]);
        added++;
      } catch { /* skip */ }
    }
    if (added > 0) {
      setAiSuggestions([]); setAiInput(""); setMode("none");
      toast.success(`${added} fokus ditambahkan`);
    }
    setSaving(false);
  };

  const updateStatus = async (id: string, status: FocusItem["status"]) => {
    try {
      const { item } = await apiCall("PATCH", `/productivity/focus/${id}`, { status });
      setItems(prev => {
        const updated = prev.map(i => i.id === id ? item : i);
        if (status === "done" && updated.length > 0 && updated.every(i => i.status === "done")) {
          setTimeout(() => triggerConfetti(), 200);
        }
        return updated;
      });
    } catch (e: any) { toast.error(e.message); }
  };

  const deleteItem = async (id: string) => {
    try {
      await apiCall("DELETE", `/productivity/focus/${id}`);
      setItems(prev => prev.filter(i => i.id !== id));
      toast.success("Fokus dihapus");
    } catch (e: any) { toast.error(e.message); }
  };

  const startEditFocus = (item: FocusItem) => {
    setEditingId(item.id);
    setEditForm({ title: item.title, description: item.description ?? "" });
  };

  const saveEditFocus = async (id: string) => {
    if (!editForm.title.trim()) { toast.error("Judul tidak boleh kosong"); return; }
    try {
      const { item } = await apiCall("PATCH", `/productivity/focus/${id}`, {
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
      });
      setItems(prev => prev.map(i => i.id === id ? item : i));
      setEditingId(null);
      toast.success("Fokus diperbarui");
    } catch (e: any) { toast.error(e.message); }
  };

  const statusCycle: Record<FocusItem["status"], FocusItem["status"]> = {
    pending: "in_progress", in_progress: "done", done: "pending",
  };

  return (
    <div className="space-y-3">
      {/* Date header + slot indicator */}
      <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-card to-card/40 px-4 py-3.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground capitalize tracking-wide">{today}</p>
            <p className="text-base font-bold text-foreground mt-0.5 leading-tight">
              {items.length === 0
                ? "Tentukan fokusmu hari ini"
                : doneCount === items.length
                ? "Semua fokus selesai! 🎉"
                : `${doneCount} dari ${items.length} selesai`}
            </p>
          </div>
          {/* Slot bubbles */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-1.5">
              {[0, 1, 2].map(idx => {
                const item = items.filter(i => i.status !== "done")[idx];
                return (
                  <div key={idx} className={`h-3 w-3 rounded-full border-2 transition-all ${
                    item
                      ? item.status === "in_progress"
                        ? "border-amber-400 bg-amber-400/40"
                        : "border-primary bg-primary/40"
                      : "border-border bg-transparent"
                  }`} />
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">{3 - activeCount} slot tersisa</p>
          </div>
        </div>
      </div>

      {/* Focus items */}
      {loading ? (
        <div className="space-y-2">
          {[1,2].map(i => <div key={i} className="h-20 rounded-2xl bg-secondary/30 animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <div className="w-14 h-14 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Target className="h-7 w-7 text-violet-400/60" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Belum ada fokus hari ini</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[220px] leading-relaxed">Tentukan 1–3 hal terpenting yang ingin kamu selesaikan. AI bisa bantu!</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className={`group rounded-2xl border transition-all duration-200 overflow-hidden ${
                editingId === item.id
                  ? "border-primary/50 bg-card"
                  : item.status === "done"
                  ? "border-border/40 bg-card/30 opacity-55"
                  : item.status === "in_progress"
                  ? "border-amber-500/25 bg-gradient-to-r from-amber-500/5 to-card"
                  : "border-border/60 bg-card hover:border-primary/30 hover:bg-card/80"
              }`}
            >
              {/* Coloured left bar */}
              {editingId !== item.id && (
                <div className={`h-0.5 w-full ${
                  item.status === "done" ? "bg-emerald-500/30" :
                  item.status === "in_progress" ? "bg-amber-400/50" :
                  "bg-primary/20"
                }`} />
              )}

              <div className="px-4 py-3">
                {/* ── Edit mode ── */}
                {editingId === item.id ? (
                  <div className="space-y-2 py-1">
                    <Input
                      value={editForm.title}
                      onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                      className="bg-secondary text-sm h-8"
                      placeholder="Judul fokus..."
                      autoFocus
                      onKeyDown={e => { if (e.key === "Enter") saveEditFocus(item.id); if (e.key === "Escape") setEditingId(null); }}
                    />
                    <Input
                      value={editForm.description}
                      onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                      className="bg-secondary text-xs h-7"
                      placeholder="Deskripsi (opsional)..."
                      onKeyDown={e => { if (e.key === "Escape") setEditingId(null); }}
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditingId(null)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-secondary transition-all">
                        <X className="h-3 w-3" /> Batal
                      </button>
                      <button onClick={() => saveEditFocus(item.id)} className="flex items-center gap-1 text-[11px] text-primary font-medium px-2 py-1 rounded-lg hover:bg-primary/10 transition-all">
                        <Save className="h-3 w-3" /> Simpan
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Normal view ── */
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => updateStatus(item.id, statusCycle[item.status])}
                      className="shrink-0 mt-0.5 transition-transform active:scale-90"
                    >
                      {item.status === "done"
                        ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        : item.status === "in_progress"
                        ? <div className="h-5 w-5 rounded-full border-2 border-amber-400 flex items-center justify-center"><div className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse" /></div>
                        : <Circle className="h-5 w-5 text-muted-foreground/40 hover:text-primary/60 transition-colors" />
                      }
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold leading-snug ${item.status === "done" ? "line-through text-muted-foreground/60" : "text-foreground"}`}>
                        {item.title}
                      </p>
                      {item.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{item.description}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        {item.source_type !== "manual" && (
                          <span className="text-[10px] text-violet-400/80 flex items-center gap-0.5 bg-violet-500/8 border border-violet-500/15 rounded-full px-1.5 py-0.5">
                            <Sparkles className="h-2.5 w-2.5" /> AI
                          </span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                          item.status === "done" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" :
                          item.status === "in_progress" ? "text-amber-400 border-amber-500/20 bg-amber-500/5" :
                          "text-muted-foreground/60 border-border/50"
                        }`}>
                          {item.status === "done" ? "Selesai ✓" : item.status === "in_progress" ? "Berjalan..." : "Pending"}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => startEditFocus(item)} className="rounded-xl p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-all" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteItem(item.id)} className="rounded-xl p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all" title="Hapus">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add mode buttons */}
      {mode === "none" && activeCount < 3 && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setMode("manual")}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card/60 px-2 py-3.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-card transition-all group"
            >
              <Pencil className="h-4.5 w-4.5 group-hover:text-primary transition-colors" />
              <span className="font-medium">Manual</span>
            </button>
            <button
              onClick={() => setMode("ai_assist")}
              className="flex flex-col items-center gap-2 rounded-2xl border border-violet-500/25 bg-gradient-to-b from-violet-500/8 to-violet-500/4 px-2 py-3.5 text-xs text-violet-400 hover:border-violet-500/50 hover:from-violet-500/15 hover:to-violet-500/8 transition-all"
            >
              <Brain className="h-4.5 w-4.5" />
              <span className="font-semibold">AI Bantu</span>
            </button>
            <button
              onClick={() => { setMode("ai_suggest"); handleAiSuggest(); }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-violet-500/25 bg-gradient-to-b from-violet-500/8 to-violet-500/4 px-2 py-3.5 text-xs text-violet-400 hover:border-violet-500/50 hover:from-violet-500/15 hover:to-violet-500/8 transition-all"
            >
              <Sparkles className="h-4.5 w-4.5" />
              <span className="font-semibold">AI Sarankan</span>
            </button>
          </div>
        </div>
      )}

      {/* Manual form */}
      {mode === "manual" && (
        <div className="rounded-2xl border border-primary/30 bg-card/60 p-4 space-y-3">
          <p className="text-xs font-bold text-foreground flex items-center gap-1.5"><Pencil className="h-3.5 w-3.5 text-primary" /> Fokus Manual</p>
          <Input placeholder="Apa yang mau kamu selesaikan hari ini?" value={manualTitle} onChange={e => setManualTitle(e.target.value)} className="bg-secondary text-sm" autoFocus />
          <Input placeholder="Catatan singkat (opsional)" value={manualDesc} onChange={e => setManualDesc(e.target.value)} className="bg-secondary text-sm" />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setMode("none")} className="flex-1 h-8 text-xs">Batal</Button>
            <Button size="sm" onClick={addManual} disabled={saving} className="flex-1 h-8 text-xs">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Tambah Fokus"}
            </Button>
          </div>
        </div>
      )}

      {/* AI Assist form */}
      {mode === "ai_assist" && (
        <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-b from-violet-500/8 to-card p-4 space-y-3">
          <p className="text-xs font-bold text-foreground flex items-center gap-1.5"><Brain className="h-3.5 w-3.5 text-violet-400" /> AI Bantu Rapi-in Rencanamu</p>
          <textarea
            placeholder='Tulis rencanamu bebas... contoh: "Hari ini gue mau belajar, urus iqomah, sama lanjut revisi tugas"'
            value={aiInput}
            onChange={e => setAiInput(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-violet-500/20 bg-secondary/80 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-violet-500/40 resize-none"
          />
          {aiLoading && (
            <div className="flex items-center gap-2 text-xs text-violet-400 py-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> AI sedang memproses...
            </div>
          )}
          {aiSuggestions.length > 0 && !aiLoading && (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">Hasil dari AI:</p>
              {aiSuggestions.map((s, i) => (
                <div key={i} className="rounded-xl border border-violet-500/20 bg-violet-500/8 px-3 py-2.5">
                  <p className="text-xs font-semibold text-foreground">{i + 1}. {s.title}</p>
                  {s.description && <p className="text-[11px] text-muted-foreground mt-0.5">{s.description}</p>}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setMode("none"); setAiSuggestions([]); setAiInput(""); }} className="flex-1 h-8 text-xs">Batal</Button>
            {aiSuggestions.length === 0
              ? <Button size="sm" onClick={handleAiAssist} disabled={aiLoading} className="flex-1 h-8 text-xs bg-violet-600 hover:bg-violet-700 border-0">
                  {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Proses dengan AI"}
                </Button>
              : <Button size="sm" onClick={saveAiSuggestions} disabled={saving} className="flex-1 h-8 text-xs bg-violet-600 hover:bg-violet-700 border-0">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Simpan Fokus"}
                </Button>
            }
          </div>
        </div>
      )}

      {/* AI Suggest */}
      {mode === "ai_suggest" && (
        <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-b from-violet-500/8 to-card p-4 space-y-3">
          <p className="text-xs font-bold text-foreground flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-violet-400" /> Saran Fokus dari AINA</p>
          {aiLoading && (
            <div className="flex items-center gap-2 text-xs text-violet-400 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> AINA sedang analisis konteksmu...
            </div>
          )}
          {aiSuggestions.length > 0 && !aiLoading && (
            <div className="space-y-2">
              {aiSuggestions.map((s, i) => (
                <div key={i} className="rounded-xl border border-violet-500/20 bg-violet-500/8 px-3 py-2.5">
                  <p className="text-xs font-semibold text-foreground">{i + 1}. {s.title}</p>
                  {s.description && <p className="text-[11px] text-muted-foreground mt-0.5">{s.description}</p>}
                </div>
              ))}
            </div>
          )}
          {!aiLoading && aiSuggestions.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">Gagal mendapatkan saran. Coba lagi.</p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setMode("none"); setAiSuggestions([]); }} className="flex-1 h-8 text-xs">Batal</Button>
            {!aiLoading && aiSuggestions.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={handleAiSuggest} disabled={aiLoading} className="h-8 text-xs px-3">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" onClick={saveAiSuggestions} disabled={saving} className="flex-1 h-8 text-xs bg-violet-600 hover:bg-violet-700 border-0">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Simpan Fokus"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {activeCount >= 3 && mode === "none" && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-center">
          <p className="text-xs font-semibold text-amber-400">3 fokus aktif sudah penuh</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Selesaikan dulu sebelum menambah yang baru.</p>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   IQOMAH COUNTDOWN CARD
   ════════════════════════════════════════════════════════ */
const IQOMAH_LS_KEY = "aina_iqomah_dates";

interface IqomahDates { issue_date: string; expiry_date: string; }

function loadIqomahDates(): IqomahDates | null {
  try {
    const raw = localStorage.getItem(IQOMAH_LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveIqomahDates(d: IqomahDates) {
  localStorage.setItem(IQOMAH_LS_KEY, JSON.stringify(d));
}

function iqomahCountdown(expiry_date: string): number {
  const now  = new Date(); now.setHours(0, 0, 0, 0);
  const exp  = new Date(expiry_date + "T00:00:00");
  return Math.round((exp.getTime() - now.getTime()) / 86400000);
}

function iqomahProgress(issue_date: string, expiry_date: string): number {
  const start  = new Date(issue_date  + "T00:00:00").getTime();
  const end    = new Date(expiry_date + "T00:00:00").getTime();
  const now    = Date.now();
  if (end <= start) return 100;
  const pct = ((now - start) / (end - start)) * 100;
  return Math.min(100, Math.max(0, pct));
}

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function IqomahCountdownCard() {
  const [dates,    setDates]    = useState<IqomahDates | null>(null);
  const [editing,  setEditing]  = useState(false);
  const [form,     setForm]     = useState({ issue_date: "", expiry_date: "" });

  useEffect(() => {
    const saved = loadIqomahDates();
    setDates(saved);
  }, []);

  const openEdit = () => {
    setForm(dates ?? { issue_date: "", expiry_date: "" });
    setEditing(true);
  };

  const handleSave = () => {
    if (!form.issue_date || !form.expiry_date) {
      toast.error("Isi kedua tanggal dulu");
      return;
    }
    if (form.expiry_date <= form.issue_date) {
      toast.error("Tanggal expired harus setelah tanggal terbit");
      return;
    }
    saveIqomahDates(form);
    setDates(form);
    setEditing(false);
    toast.success("Data iqomah disimpan");
  };

  const handleDelete = () => {
    localStorage.removeItem(IQOMAH_LS_KEY);
    setDates(null);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-violet-400 shrink-0" />
          <p className="text-xs font-semibold text-violet-300">Masa Berlaku Iqomah</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Tanggal Terbit</label>
            <input
              type="date"
              value={form.issue_date}
              onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500/40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Tanggal Expired</label>
            <input
              type="date"
              value={form.expiry_date}
              onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500/40"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} className="h-8 text-xs gap-1.5 flex-1">
            <Save className="h-3.5 w-3.5" /> Simpan
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="h-8 text-xs">
            Batal
          </Button>
          {dates && (
            <Button size="sm" variant="ghost" onClick={handleDelete} className="h-8 text-xs text-destructive hover:text-destructive px-2">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!dates) {
    return (
      <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 px-4 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <ShieldCheck className="h-4 w-4 text-violet-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">Countdown Iqomah</p>
            <p className="text-[11px] text-muted-foreground">Atur tanggal iqomah kamu untuk pantau masa berlakunya</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={openEdit} className="shrink-0 h-7 text-[11px] border-violet-500/30 text-violet-300 hover:bg-violet-500/10">
          Atur
        </Button>
      </div>
    );
  }

  const daysLeft   = iqomahCountdown(dates.expiry_date);
  const progress   = iqomahProgress(dates.issue_date, dates.expiry_date);
  const isCritical = daysLeft <= 30;
  const isWarn     = daysLeft > 30 && daysLeft <= 60;
  const isGood     = daysLeft > 60;
  const isExpired  = daysLeft < 0;

  const colorRing  = isExpired  ? "border-red-600/60 bg-red-500/8"
                   : isCritical ? "border-red-500/50 bg-red-500/8"
                   : isWarn     ? "border-orange-500/40 bg-orange-500/6"
                   :              "border-emerald-500/30 bg-emerald-500/5";

  const colorNum   = isExpired  ? "text-red-500"
                   : isCritical ? "text-red-400"
                   : isWarn     ? "text-orange-400"
                   :              "text-emerald-400";

  const colorBar   = isExpired  ? "bg-red-500"
                   : isCritical ? "bg-red-400"
                   : isWarn     ? "bg-orange-400"
                   :              "bg-emerald-400";

  const label      = isExpired  ? "Iqomah Kadaluarsa!"
                   : isCritical ? "Segera Perbarui Iqomah"
                   : isWarn     ? "Masa Berlaku Hampir Habis"
                   :              "Iqomah Aktif";

  const labelColor = isExpired  ? "text-red-400"
                   : isCritical ? "text-red-400"
                   : isWarn     ? "text-orange-400"
                   :              "text-emerald-400";

  const circumference = 2 * Math.PI * 34;
  const remainingFraction = Math.max(0, Math.min(1, 1 - progress / 100));
  const strokeDashoffset = circumference * (1 - remainingFraction);

  const ainaMessage = isExpired
    ? `Iqomah kamu sudah kadaluarsa ${Math.abs(daysLeft)} hari yang lalu! Ini darurat — urus ke imigrasi sekarang sebelum ada masalah hukum.`
    : isCritical
    ? `Tinggal ${daysLeft} hari lagi! Segera hubungi pihak universitas dan urus perpanjangan iqomah ke imigrasi, jangan ditunda ya.`
    : isWarn
    ? `Iqomah kamu mulai mendekati batas. Gue sarankan mulai siapkan dokumen perpanjangan dari sekarang supaya nggak panik nanti.`
    : `Iqomah kamu masih aman kok, santai. Gue akan terus pantau dan ingatkan kamu jauh sebelum jatuh tempo — fokus belajar dulu! 📚`;

  const ringColor = isExpired  ? "#ef4444"
                  : isCritical ? "#f87171"
                  : isWarn     ? "#fb923c"
                  :              "#34d399";

  const glowClass = isExpired  ? "shadow-red-500/20"
                  : isCritical ? "shadow-red-500/20"
                  : isWarn     ? "shadow-orange-500/20"
                  :              "shadow-emerald-500/10";

  return (
    <div className={`rounded-2xl border overflow-hidden ${colorRing}`}>
      {/* AINA speaking bubble */}
      <div className="px-4 pt-3.5 pb-3 border-b border-white/[0.05] flex items-start gap-3">
        <div className="relative shrink-0 mt-0.5">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center ring-2 ${
            isExpired || isCritical ? "bg-red-500/20 ring-red-500/30"
            : isWarn ? "bg-orange-500/20 ring-orange-500/30"
            : "bg-primary/20 ring-primary/30"
          }`}>
            <Bot className={`h-3.5 w-3.5 ${
              isExpired || isCritical ? "text-red-400"
              : isWarn ? "text-orange-400"
              : "text-primary"
            }`} />
          </div>
          {(isCritical || isExpired) && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-background animate-pulse" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[10px] font-semibold mb-0.5 ${
            isExpired || isCritical ? "text-red-400" : isWarn ? "text-orange-400" : "text-primary/80"
          }`}>AINA · Asisten Iqomah</p>
          <p className="text-[11.5px] text-foreground/85 leading-relaxed">{ainaMessage}</p>
        </div>
        <button
          onClick={openEdit}
          className="shrink-0 mt-0.5 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>

      {/* Countdown body */}
      <div className="px-4 py-4 flex items-center gap-5">
        {/* Ring countdown */}
        <div className={`relative shrink-0 shadow-lg ${glowClass}`}>
          <svg viewBox="0 0 80 80" className="w-[78px] h-[78px] -rotate-90">
            <circle
              cx="40" cy="40" r="34"
              fill="none" strokeWidth="6"
              stroke="rgba(255,255,255,0.07)"
            />
            <circle
              cx="40" cy="40" r="34"
              fill="none" strokeWidth="6"
              stroke={ringColor}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.8s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-[22px] font-black tabular-nums leading-none ${colorNum}`}>
              {isExpired ? Math.abs(daysLeft) : daysLeft}
            </span>
            <span className="text-[8px] font-medium text-muted-foreground mt-0.5 tracking-wide uppercase">
              {isExpired ? "terlambat" : "hari lagi"}
            </span>
          </div>
        </div>

        {/* Info section */}
        <div className="flex-1 min-w-0 space-y-2.5">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <ShieldCheck className={`h-3.5 w-3.5 shrink-0 ${labelColor}`} />
              <p className={`text-[12px] font-bold leading-tight ${labelColor}`}>{label}</p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Berakhir <span className="font-medium text-foreground/70">{fmtDate(dates.expiry_date)}</span>
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground/70">
              <span className="flex items-center gap-1">
                <Timer className="h-2.5 w-2.5" />
                Masa berlaku terpakai
              </span>
              <span className="font-medium text-muted-foreground">{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${colorBar}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[9.5px] text-muted-foreground/50">
              Terbit {fmtDate(dates.issue_date)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   TAB 2: ADMIN TRACKER
   ════════════════════════════════════════════════════════ */
function TrackerTab() {
  const [items, setItems] = useState<TrackerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", category: "lainnya", notes: "", due_date: "", is_urgent: false });
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", category: "lainnya", notes: "", due_date: "", is_urgent: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { items: data } = await apiCall("GET", "/productivity/tracker");
      setItems(data);
    } catch (e: any) { toast.error(e.message || "Gagal memuat dokumen"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.title.trim()) { toast.error("Tulis judul dulu"); return; }
    setSaving(true);
    try {
      const { item } = await apiCall("POST", "/productivity/tracker", {
        title: form.title,
        category: form.category,
        notes: form.notes || null,
        due_date: form.due_date || null,
        is_urgent: form.is_urgent,
      });
      setItems(prev => [item, ...prev]);
      setForm({ title: "", category: "lainnya", notes: "", due_date: "", is_urgent: false });
      setShowForm(false);
      toast.success("Item ditambahkan");
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const updateStatus = async (id: string, status: TrackerItem["status"]) => {
    try {
      const { item } = await apiCall("PATCH", `/productivity/tracker/${id}`, { status });
      setItems(prev => prev.map(i => i.id === id ? item : i));
      if (status === "completed") toast.success("Item selesai! 🎉");
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleUrgent = async (id: string, current: boolean) => {
    try {
      const { item } = await apiCall("PATCH", `/productivity/tracker/${id}`, { is_urgent: !current });
      setItems(prev => prev.map(i => i.id === id ? item : i));
    } catch (e: any) { toast.error(e.message); }
  };

  const deleteItem = async (id: string) => {
    try {
      await apiCall("DELETE", `/productivity/tracker/${id}`);
      setItems(prev => prev.filter(i => i.id !== id));
      toast.success("Item dihapus");
    } catch (e: any) { toast.error(e.message); }
  };

  const startEditTracker = (item: TrackerItem) => {
    setEditingId(item.id);
    setEditForm({
      title: item.title,
      category: item.category,
      notes: item.notes ?? "",
      due_date: item.due_date ?? "",
      is_urgent: item.is_urgent,
    });
  };

  const saveEditTracker = async (id: string) => {
    if (!editForm.title.trim()) { toast.error("Judul tidak boleh kosong"); return; }
    try {
      const { item } = await apiCall("PATCH", `/productivity/tracker/${id}`, {
        title: editForm.title.trim(),
        category: editForm.category,
        notes: editForm.notes.trim() || null,
        due_date: editForm.due_date || null,
        is_urgent: editForm.is_urgent,
      });
      setItems(prev => prev.map(i => i.id === id ? item : i));
      setEditingId(null);
      toast.success("Item diperbarui");
    } catch (e: any) { toast.error(e.message); }
  };

  const STATUS_CYCLE: Record<TrackerItem["status"], TrackerItem["status"]> = {
    not_started: "preparing", preparing: "submitted", submitted: "completed", completed: "not_started",
  };

  const todayStr = getCairoDateStr();
  const filtered = filterStatus === "all"
    ? items.filter(i => i.status !== "completed")
    : filterStatus === "completed"
    ? items.filter(i => i.status === "completed")
    : items.filter(i => i.status === filterStatus);

  const urgentCount = items.filter(i => i.is_urgent && i.status !== "completed").length;
  const pendingCount = items.filter(i => i.status !== "completed").length;

  // Smart expiry alerts — compute days remaining for items with due_date
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const expiryAlerts = items
    .filter(i => i.status !== "completed" && i.due_date)
    .map(i => {
      const due  = new Date(i.due_date + "T00:00:00");
      const days = Math.round((due.getTime() - now.getTime()) / 86400000);
      return { ...i, daysLeft: days };
    })
    .filter(i => i.daysLeft >= 0 && i.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const criticalAlerts = expiryAlerts.filter(i => i.daysLeft <= 1);
  const warnAlerts     = expiryAlerts.filter(i => i.daysLeft > 1 && i.daysLeft <= 7);
  const noticeAlerts   = expiryAlerts.filter(i => i.daysLeft > 7 && i.daysLeft <= 30);

  return (
    <div className="space-y-4">
      {/* Iqomah Countdown Card */}
      <IqomahCountdownCard />

      {/* Smart Expiry Alert Banners */}
      {criticalAlerts.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/8 px-3.5 py-3">
          <span className="text-base shrink-0 mt-0.5">🔴</span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-red-400 mb-1">Jatuh tempo hari ini / besok!</p>
            <ul className="space-y-0.5">
              {criticalAlerts.map(i => (
                <li key={i.id} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{i.title}</span>
                  {" — "}
                  {i.daysLeft === 0 ? "hari ini" : "besok"}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {warnAlerts.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-orange-500/30 bg-orange-500/8 px-3.5 py-3">
          <span className="text-base shrink-0 mt-0.5">🟠</span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-orange-400 mb-1">Jatuh tempo dalam 7 hari</p>
            <ul className="space-y-0.5">
              {warnAlerts.map(i => (
                <li key={i.id} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{i.title}</span>
                  {" — "}{i.daysLeft} hari lagi
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {noticeAlerts.length > 0 && criticalAlerts.length === 0 && warnAlerts.length === 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-3.5 py-3">
          <span className="text-base shrink-0 mt-0.5">🟡</span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-yellow-400 mb-1">Tenggat dalam 30 hari</p>
            <ul className="space-y-0.5">
              {noticeAlerts.slice(0, 3).map(i => (
                <li key={i.id} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{i.title}</span>
                  {" — "}{i.daysLeft} hari lagi
                </li>
              ))}
              {noticeAlerts.length > 3 && (
                <li className="text-xs text-muted-foreground/60">+{noticeAlerts.length - 3} lainnya...</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <p className="text-xs text-muted-foreground font-medium">
            {pendingCount > 0 ? `${pendingCount} urusan aktif` : "Semua urusan selesai 🎉"}
          </p>
          {urgentCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-orange-400 bg-orange-500/8 border border-orange-500/20 rounded-full px-2 py-0.5 font-semibold">
              <AlertTriangle className="h-3 w-3" />{urgentCount} urgent
            </span>
          )}
        </div>
        <Button size="sm" onClick={() => setShowForm(v => !v)} className="gap-1.5 h-8 text-xs rounded-xl">
          <Plus className="h-3.5 w-3.5" /> Tambah
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide">
        {[
          { v: "all", l: "Aktif" },
          { v: "not_started", l: "Belum Mulai" },
          { v: "preparing", l: "Disiapkan" },
          { v: "submitted", l: "Diajukan" },
          { v: "completed", l: "Selesai" },
        ].map(f => (
          <button
            key={f.v}
            onClick={() => setFilterStatus(f.v)}
            className={`shrink-0 text-[11px] px-3 py-1.5 rounded-full border transition-all ${
              filterStatus === f.v
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.l}
          </button>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-2xl border border-primary/30 bg-card/60 p-4 space-y-3">
          <p className="text-xs font-bold text-foreground">Urusan Baru</p>
          <Input
            placeholder="Nama urusan / dokumen..."
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="bg-secondary text-sm"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Kategori</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              >
                {TRACKER_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Tenggat (opsional)</label>
              <input
                type="date"
                value={form.due_date}
                min={todayStr}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
          </div>
          <Input
            placeholder="Catatan (opsional)"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="bg-secondary text-sm"
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_urgent}
              onChange={e => setForm(f => ({ ...f, is_urgent: e.target.checked }))}
              className="rounded border-border"
            />
            <span className="text-xs text-foreground">Tandai sebagai urgent</span>
          </label>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)} className="flex-1 h-8 text-xs">Batal</Button>
            <Button size="sm" onClick={handleAdd} disabled={saving} className="flex-1 h-8 text-xs">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Simpan"}
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-secondary/30 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-500/8 border border-amber-500/15 flex items-center justify-center">
            <ClipboardList className="h-7 w-7 text-amber-400/50" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {filterStatus === "completed" ? "Belum ada yang selesai" : "Tidak ada urusan aktif"}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[220px] leading-relaxed">Tambahkan urusan penting seperti iqomah, visa, atau dokumen kampus</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => {
            const due = dueBadge(item.due_date);
            const isEditing = editingId === item.id;
            const catColor = getCatTopColor(item.category);
            return (
              <div
                key={item.id}
                className={`group rounded-2xl border transition-all overflow-hidden ${
                  isEditing ? "border-primary/40 bg-card" :
                  item.status === "completed" ? "border-border/40 bg-card/30 opacity-55" :
                  item.is_urgent ? "border-orange-500/25 bg-gradient-to-r from-orange-500/5 to-card" :
                  "border-border/60 bg-card hover:border-primary/30"
                }`}
              >
                {/* Category top strip */}
                {!isEditing && (
                  <div className={`h-0.5 w-full ${catColor}`} />
                )}
                {/* ── Edit mode ── */}
                {isEditing ? (
                  <div className="p-4 space-y-2">
                    <Input
                      value={editForm.title}
                      onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                      className="bg-secondary text-sm h-8"
                      placeholder="Nama urusan / dokumen..."
                      autoFocus
                      onKeyDown={e => { if (e.key === "Escape") setEditingId(null); }}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={editForm.category}
                        onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                        className="w-full rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                      >
                        {TRACKER_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                      <input
                        type="date"
                        value={editForm.due_date}
                        onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))}
                        className="w-full rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                      />
                    </div>
                    <Input
                      value={editForm.notes}
                      onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                      className="bg-secondary text-xs h-7"
                      placeholder="Catatan (opsional)..."
                    />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editForm.is_urgent}
                          onChange={e => setEditForm(f => ({ ...f, is_urgent: e.target.checked }))}
                          className="rounded border-border"
                        />
                        <span className="text-xs text-foreground">Urgent</span>
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-secondary transition-all"
                        >
                          <X className="h-3 w-3" /> Batal
                        </button>
                        <button
                          onClick={() => saveEditTracker(item.id)}
                          className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 px-2 py-1 rounded-lg hover:bg-primary/10 transition-all font-medium"
                        >
                          <Save className="h-3 w-3" /> Simpan
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Normal view ── */
                  <div className="flex items-start gap-3 px-4 py-3">
                    {/* Status cycle button */}
                    <button
                      onClick={() => updateStatus(item.id, STATUS_CYCLE[item.status])}
                      className={`shrink-0 mt-0.5 rounded-full border-2 h-5 w-5 flex items-center justify-center transition-colors active:scale-90 ${
                        item.status === "completed"
                          ? "border-emerald-500 bg-emerald-500"
                          : item.status === "submitted"
                          ? "border-blue-400 bg-blue-400/20"
                          : item.status === "preparing"
                          ? "border-amber-400 bg-amber-400/20"
                          : "border-muted-foreground/30"
                      }`}
                    >
                      {item.status === "completed" && (
                        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className={`text-sm font-medium leading-snug ${item.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {item.title}
                        </p>
                        {item.is_urgent && item.status !== "completed" && (
                          <AlertTriangle className="h-3 w-3 text-orange-400 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-[10px] border rounded-full px-2 py-0.5 ${getCatStyle(item.category)}`}>
                          {getCatLabel(item.category)}
                        </span>
                        <span className={`text-[11px] font-medium ${getStatusStyle(item.status)}`}>
                          {getStatusLabel(item.status)}
                        </span>
                        {due && item.status !== "completed" && (
                          <span className={`text-[11px] flex items-center gap-0.5 ${due.cls}`}>
                            <Clock className="h-2.5 w-2.5" />{due.label}
                          </span>
                        )}
                      </div>
                      {item.notes && (
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-relaxed">{item.notes}</p>
                      )}
                    </div>

                    <div className="shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => startEditTracker(item)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => toggleUrgent(item.id, item.is_urgent)}
                        className={`rounded-lg p-1.5 transition-all ${item.is_urgent ? "text-orange-400 hover:bg-orange-500/10" : "text-muted-foreground hover:bg-secondary"}`}
                        title={item.is_urgent ? "Hapus urgent" : "Tandai urgent"}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                        title="Hapus"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   TAB 3: PROCEDURE GUIDE (dynamic, loaded from API)
   ════════════════════════════════════════════════════════ */
function getProcIcon(proc: Procedure): React.ElementType {
  if (proc.icon) return proc.icon;
  return PROC_ICON_MAP[proc.icon_name ?? "FileText"] ?? FileText;
}

/* Legacy fallback: shown only if API fails */
const FALLBACK_PROCEDURES: Procedure[] = [
  {
    id: "iqama", title: "Perpanjang Iqama", subtitle: "Izin tinggal tahunan",
    icon: CreditCard, color: "text-violet-400",
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
    id: "pendaftaran-azhar", title: "Pendaftaran Ulang Al-Azhar", subtitle: "Setiap awal semester",
    icon: GraduationCap, color: "text-amber-400",
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
    id: "visa-belajar", title: "Perpanjang Visa Belajar", subtitle: "Visa pelajar tahunan",
    icon: Stamp, color: "text-blue-400",
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
    id: "paspor-kbri", title: "Perpanjang Paspor di KBRI", subtitle: "Paspor RI di luar negeri",
    icon: FileText, color: "text-rose-400",
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
  {
    id: "legalisir-kbri", title: "Legalisir Dokumen di KBRI", subtitle: "Ijazah, transkrip, dll",
    icon: Stamp, color: "text-green-400",
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
    id: "buka-rekening", title: "Buka Rekening Bank", subtitle: "Bank lokal Mesir",
    icon: Building2, color: "text-cyan-400",
    steps: [
      { label: "Pilih bank yang banyak digunakan Masisir (Banque Misr, CIB, Bank of Alexandria)" },
      { label: "Siapkan paspor asli + fotokopi" },
      { label: "Siapkan iqama yang masih berlaku + fotokopi" },
      { label: "Siapkan pas foto terbaru (1–2 lembar)" },
      { label: "Datang ke cabang bank, minta formulir pembukaan rekening tabungan" },
      { label: "Isi formulir, serahkan berkas ke teller, setorkan saldo awal minimum", detail: "Cek minimal setoran ke masing-masing bank" },
    ],
  },
];

function getProcProgress(userId: string, procId: string) {
  try { const r = localStorage.getItem(`aina_proc_${userId}_${procId}`); if (r) return new Set(JSON.parse(r) as number[]); } catch {}
  return new Set<number>();
}
function saveProcProgress(userId: string, procId: string, done: Set<number>) {
  localStorage.setItem(`aina_proc_${userId}_${procId}`, JSON.stringify([...done]));
}

function ProcedureTab({ userId }: { userId: string }) {
  const [procedures, setProcedures] = useState<Procedure[]>(FALLBACK_PROCEDURES);
  const [loadingProcs, setLoadingProcs] = useState(true);
  const [selected, setSelected] = useState<Procedure | null>(null);
  const [progress, setProgress] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/procedures")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.procedures?.length) setProcedures(d.procedures); })
      .catch(() => {})
      .finally(() => setLoadingProcs(false));
  }, []);

  const openProcedure = (proc: Procedure) => {
    setSelected(proc);
    setProgress(getProcProgress(userId, proc.id));
  };

  const toggleStep = (idx: number) => {
    if (!selected) return;
    const next = new Set(progress);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    setProgress(next);
    saveProcProgress(userId, selected.id, next);
  };

  if (selected) {
    const done = progress.size;
    const total = selected.steps.length;
    const pct = Math.round((done / total) * 100);
    const Icon = getProcIcon(selected);
    return (
      <div className="space-y-4">
        <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke daftar
        </button>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-xl bg-secondary p-2.5"><Icon className={`h-5 w-5 ${selected.color}`} /></div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground">{selected.title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{selected.subtitle}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-bold text-foreground">{pct}%</p>
              <p className="text-[10px] text-muted-foreground">{done}/{total} selesai</p>
            </div>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-primary transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="space-y-2">
          {selected.steps.map((step, i) => {
            const isDone = progress.has(i);
            return (
              <button key={i} onClick={() => toggleStep(i)} className={`w-full flex items-start gap-3 rounded-xl border px-3 py-3 text-left transition-all ${isDone ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-card hover:bg-secondary/50"}`}>
                <div className={`shrink-0 mt-0.5 rounded-full border-2 h-4 w-4 flex items-center justify-center transition-colors ${isDone ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground/40"}`}>
                  {isDone && <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${isDone ? "text-muted-foreground line-through" : "text-foreground"}`}>
                    <span className="font-medium text-muted-foreground/60 mr-1.5">{i + 1}.</span>{step.label}
                  </p>
                  {step.detail && <p className="text-[11px] text-muted-foreground/60 mt-0.5">{step.detail}</p>}
                </div>
              </button>
            );
          })}
        </div>
        {done > 0 && (
          <button onClick={() => { const e = new Set<number>(); setProgress(e); saveProcProgress(userId, selected.id, e); toast.success("Progress direset"); }} className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
            Reset progress
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-blue-500/20 bg-blue-500/5 px-3.5 py-3">
        <BookOpen className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Panduan <span className="text-foreground font-medium">langkah demi langkah</span> untuk prosedur umum Masisir. Centang tiap langkah saat selesai — progressmu tersimpan otomatis.
        </p>
      </div>
      {loadingProcs ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {procedures.map(proc => {
            const done = getProcProgress(userId, proc.id).size;
            const total = proc.steps.length;
            const pct = Math.round((done / total) * 100);
            const Icon = getProcIcon(proc);
            return (
              <button key={proc.id} onClick={() => openProcedure(proc)} className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left hover:bg-secondary/40 hover:border-primary/20 transition-all">
                <div className="shrink-0 rounded-xl bg-secondary p-2.5"><Icon className={`h-4.5 w-4.5 ${proc.color}`} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground leading-snug">{proc.title}</p>
                  <p className="text-[11px] text-muted-foreground">{proc.subtitle}</p>
                  {done > 0 && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-primary" style={{ width: `${pct}%` }} />
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
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   TAB 4: REMINDER — summary + email triggers
   ════════════════════════════════════════════════════════ */

type ReminderStatus = "idle" | "loading" | "sent" | "skipped";

interface ReminderSummary {
  focus: { total: number; done: number; pending: Array<{ id: string; title: string }> };
  urgentAdmin: Array<{ id: string; title: string; due_date: string | null; is_urgent: boolean; category: string }>;
}

function ReminderTab() {
  const [summary, setSummary]   = useState<ReminderSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [dailyStatus,  setDailyStatus]  = useState<ReminderStatus>("idle");
  const [adminStatus,  setAdminStatus]  = useState<ReminderStatus>("idle");
  const [weeklyStatus, setWeeklyStatus] = useState<ReminderStatus>("idle");

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const data = await apiCall("GET", "/productivity/reminders/summary");
      setSummary(data);
    } catch { /* silent */ }
    setLoadingSummary(false);
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const sendReminder = async (
    type: "daily" | "admin" | "weekly-recap",
    setStatus: (s: ReminderStatus) => void,
  ) => {
    setStatus("loading");
    try {
      const res = await apiCall("POST", `/productivity/reminders/${type}`);
      if (res.skipped) {
        setStatus("skipped");
        toast.info(res.reason || "Tidak perlu dikirim sekarang");
      } else {
        setStatus("sent");
        toast.success("Pengingat berhasil dikirim ke emailmu!");
      }
    } catch (e: any) {
      setStatus("idle");
      toast.error(e.message);
    }
  };

  const ReminderButton = ({
    label, sublabel, icon: Icon, status, colorClass, onSend,
  }: {
    label: string; sublabel: string; icon: React.ElementType;
    status: ReminderStatus; colorClass: string; onSend: () => void;
  }) => (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-3.5 py-3">
      <div className={`shrink-0 mt-0.5 rounded-lg p-2 ${colorClass}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{sublabel}</p>
      </div>
      <button
        onClick={onSend}
        disabled={status === "loading" || status === "sent" || status === "skipped"}
        className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${
          status === "sent"
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            : status === "skipped"
            ? "bg-secondary text-muted-foreground border border-border"
            : status === "loading"
            ? "bg-secondary text-muted-foreground border border-border"
            : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
        }`}
      >
        {status === "loading" && <Loader2 className="h-3 w-3 animate-spin" />}
        {status === "sent"    && <CheckCheck className="h-3 w-3" />}
        {status === "skipped" && <SkipForward className="h-3 w-3" />}
        {status === "idle"    && <Send className="h-3 w-3" />}
        <span>
          {status === "loading" ? "Mengirim..." :
           status === "sent"    ? "Terkirim" :
           status === "skipped" ? "Tidak perlu" : "Kirim"}
        </span>
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Panel description */}
      <div className="flex items-start gap-2.5 rounded-xl border border-violet-500/20 bg-violet-500/5 px-3.5 py-3">
        <Bell className="h-4 w-4 text-violet-400 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Kirim pengingat ke emailmu untuk fokus yang belum selesai atau urusan yang mendesak.
          <span className="text-foreground font-medium"> Anti-spam aktif</span> — tidak akan terkirim 2x di hari yang sama.
        </p>
      </div>

      {/* Today's summary */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs font-semibold text-foreground">Ringkasan Hari Ini</p>
          <button
            onClick={loadSummary}
            disabled={loadingSummary}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingSummary ? "animate-spin" : ""}`} />
          </button>
        </div>

        {loadingSummary ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-secondary/40 animate-pulse" />)}
          </div>
        ) : summary ? (
          <div className="space-y-2">
            {/* Focus progress */}
            <div className="rounded-xl border border-border bg-card px-3.5 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 text-violet-400" /> Fokus Harian
                </p>
                <span className={`text-xs font-bold ${
                  summary.focus.done >= summary.focus.total && summary.focus.total > 0
                    ? "text-emerald-400" : "text-foreground"
                }`}>
                  {summary.focus.done}/{summary.focus.total}
                </span>
              </div>
              {summary.focus.total > 0 ? (
                <>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden mb-2">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-primary transition-all"
                      style={{ width: `${summary.focus.total > 0 ? Math.round((summary.focus.done / summary.focus.total) * 100) : 0}%` }}
                    />
                  </div>
                  {summary.focus.pending.length > 0 && (
                    <div className="space-y-1">
                      {summary.focus.pending.slice(0, 3).map(f => (
                        <p key={f.id} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                          <Circle className="h-2.5 w-2.5 shrink-0" /> {f.title}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">Belum ada fokus hari ini — tambahkan di tab Fokus Harian.</p>
              )}
            </div>

            {/* Urgent admin */}
            <div className="rounded-xl border border-border bg-card px-3.5 py-3">
              <p className="text-xs font-medium text-foreground flex items-center gap-1.5 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-400" /> Urusan Mendesak
              </p>
              {summary.urgentAdmin.length > 0 ? (
                <div className="space-y-1.5">
                  {summary.urgentAdmin.map(a => {
                    const db = dueBadge(a.due_date);
                    return (
                      <div key={a.id} className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-foreground truncate">{a.title}</p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[10px] border rounded-full px-1.5 py-0.5 ${getCatStyle(a.category)}`}>
                            {getCatLabel(a.category)}
                          </span>
                          {db && (
                            <span className={`text-[10px] ${db.cls}`}>{db.label}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">Tidak ada urusan mendesak saat ini.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Gagal memuat ringkasan.</p>
        )}
      </div>

      {/* Email reminder triggers */}
      <div>
        <p className="text-xs font-semibold text-foreground mb-2.5 flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" /> Kirim Email Pengingat
        </p>
        <div className="space-y-2">
          <ReminderButton
            label="Pengingat Fokus Harian"
            sublabel="Kirim daftar fokus yang belum selesai hari ini ke emailmu (1x/hari)"
            icon={Target}
            status={dailyStatus}
            colorClass="bg-violet-500/10 text-violet-400"
            onSend={() => sendReminder("daily", setDailyStatus)}
          />
          <ReminderButton
            label="Pengingat Urusan Admin"
            sublabel="Kirim list urusan urgent atau yang hampir jatuh tempo (1x/hari)"
            icon={AlertTriangle}
            status={adminStatus}
            colorClass="bg-orange-500/10 text-orange-400"
            onSend={() => sendReminder("admin", setAdminStatus)}
          />
          <ReminderButton
            label="Recap Mingguan"
            sublabel="Kirim rekap fokus dan urusan admin selama 7 hari terakhir (1x/minggu)"
            icon={ClipboardList}
            status={weeklyStatus}
            colorClass="bg-blue-500/10 text-blue-400"
            onSend={() => sendReminder("weekly-recap", setWeeklyStatus)}
          />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground/50 text-center pb-2">
        Email dikirim via Resend · Jadwal otomatis aktif setiap hari
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   NOTES TAB
   ════════════════════════════════════════════════════════ */
type NoteFormat = "note" | "todo" | "checklist";
interface NoteItem { id: string; text: string; checked: boolean; }
interface Note {
  id: string;
  title: string;
  format: NoteFormat;
  content: string | null;
  items: NoteItem[];
  created_at: string;
  updated_at: string;
}

const NOTE_FORMATS: { value: NoteFormat; label: string; icon: React.ElementType; desc: string; color: string }[] = [
  { value: "note",      label: "Catatan",   icon: StickyNote,  desc: "Teks bebas",          color: "text-amber-400  bg-amber-500/10  border-amber-500/20" },
  { value: "todo",      label: "To-Do",     icon: ListTodo,    desc: "Daftar tugas",         color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  { value: "checklist", label: "Checklist", icon: ListChecks,  desc: "Langkah berurutan",   color: "text-blue-400   bg-blue-500/10   border-blue-500/20" },
];

function fmtRelTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  return `${d} hari lalu`;
}

function makeItemId() { return Math.random().toString(36).slice(2, 10); }

function NoteEditor({ note, onBack, onSaved, onDeleted }: {
  note: Note;
  onBack: () => void;
  onSaved: (n: Note) => void;
  onDeleted: (id: string) => void;
}) {
  const [title, setTitle]     = useState(note.title);
  const [content, setContent] = useState(note.content ?? "");
  const [items, setItems]     = useState<NoteItem[]>(note.items ?? []);
  const [newItemText, setNewItemText] = useState("");
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = title !== note.title || content !== (note.content ?? "") || JSON.stringify(items) !== JSON.stringify(note.items ?? []);

  const fmt = NOTE_FORMATS.find(f => f.value === note.format)!;
  const FmtIcon = fmt.icon;

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { title };
      if (note.format === "note") body.content = content || null;
      else body.items = items;
      const { note: updated } = await apiCall("PATCH", `/productivity/notes/${note.id}`, body);
      onSaved(updated);
      toast.success("Disimpan");
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const del = async () => {
    if (!confirm("Hapus catatan ini?")) return;
    setDeleting(true);
    try {
      await apiCall("DELETE", `/productivity/notes/${note.id}`);
      onDeleted(note.id);
      toast.success("Catatan dihapus");
    } catch (e: any) { toast.error(e.message); }
    setDeleting(false);
  };

  const addItem = () => {
    if (!newItemText.trim()) return;
    setItems(prev => [...prev, { id: makeItemId(), text: newItemText.trim(), checked: false }]);
    setNewItemText("");
  };

  const toggleItem = (id: string) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, checked: !it.checked } : it));

  const removeItem = (id: string) =>
    setItems(prev => prev.filter(it => it.id !== id));

  const updateItemText = (id: string, text: string) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, text } : it));

  return (
    <div className="flex flex-col h-full">
      {/* Topbar */}
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <button
          onClick={() => {
            if (dirty && !confirm("Ada perubahan yang belum disimpan. Keluar tanpa menyimpan?")) return;
            onBack();
          }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </button>
        <span className="ml-auto flex items-center gap-1.5">
          <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${fmt.color}`}>
            <FmtIcon className="h-3 w-3" /> {fmt.label}
          </span>
        </span>
      </div>

      {/* Title */}
      <input
        className="w-full bg-transparent text-lg font-bold text-foreground outline-none placeholder:text-muted-foreground/40 mb-4 shrink-0"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Judul catatan..."
        maxLength={200}
      />

      {/* Content area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {note.format === "note" && (
          <textarea
            className="w-full h-full min-h-[200px] resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40 leading-relaxed"
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Tulis catatanmu di sini..."
          />
        )}

        {(note.format === "todo" || note.format === "checklist") && (
          <div className="space-y-1.5">
            {items.map((it, idx) => (
              <div key={it.id} className="group flex items-start gap-2">
                {note.format === "checklist" && (
                  <span className="shrink-0 mt-0.5 w-5 text-center text-[11px] font-bold text-muted-foreground/50">{idx + 1}.</span>
                )}
                <button
                  onClick={() => toggleItem(it.id)}
                  className={`shrink-0 mt-0.5 transition-colors ${it.checked ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground"}`}
                >
                  {it.checked ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                </button>
                <input
                  className={`flex-1 bg-transparent text-sm outline-none transition-colors ${it.checked ? "line-through text-muted-foreground/40" : "text-foreground"}`}
                  value={it.text}
                  onChange={e => updateItemText(it.id, e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") { e.preventDefault(); addItem(); }
                  }}
                />
                <button
                  onClick={() => removeItem(it.id)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-red-400 transition-all"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {/* Add item input */}
            <div className="flex items-center gap-2 pt-1 border-t border-border/40 mt-2">
              {note.format === "checklist" && (
                <span className="shrink-0 w-5 text-center text-[11px] text-muted-foreground/30">{items.length + 1}.</span>
              )}
              <Plus className="shrink-0 h-3.5 w-3.5 text-muted-foreground/40" />
              <input
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/30"
                value={newItemText}
                onChange={e => setNewItemText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
                placeholder={note.format === "todo" ? "Tambah tugas..." : "Tambah langkah..."}
              />
              {newItemText.trim() && (
                <button onClick={addItem} className="shrink-0 text-xs text-primary hover:opacity-80">
                  + Tambah
                </button>
              )}
            </div>
            {/* Progress for todo */}
            {note.format === "todo" && items.length > 0 && (
              <div className="flex items-center gap-2 pt-3 border-t border-border/30 mt-3">
                <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.round(items.filter(i => i.checked).length / items.length * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {items.filter(i => i.checked).length}/{items.length}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="shrink-0 flex items-center gap-2 pt-4 border-t border-border mt-4">
        <button
          onClick={del}
          disabled={deleting}
          className="text-xs text-red-400/70 hover:text-red-400 transition-colors flex items-center gap-1"
        >
          <Trash2 className="h-3.5 w-3.5" /> Hapus
        </button>
        <Button
          onClick={save}
          disabled={saving || !dirty}
          size="sm"
          className="ml-auto text-xs bg-primary text-primary-foreground"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </div>
  );
}

function NotesTab() {
  const [notes, setNotes]       = useState<Note[]>([]);
  const [loading, setLoading]   = useState(true);
  const [openNote, setOpenNote] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);
  const [newFormat, setNewFormat] = useState<NoteFormat>("note");
  const [newTitle, setNewTitle]  = useState("");
  const [saving, setSaving]      = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { notes: data } = await apiCall("GET", "/productivity/notes");
      setNotes(data);
    } catch (e: any) { toast.error(e.message || "Gagal memuat catatan"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createNote = async () => {
    setSaving(true);
    try {
      const { note } = await apiCall("POST", "/productivity/notes", {
        title: newTitle.trim() || "Catatan Baru",
        format: newFormat,
        content: null,
        items: [],
      });
      setNotes(prev => [note, ...prev]);
      setNewTitle("");
      setCreating(false);
      setOpenNote(note);
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const handleSaved = (updated: Note) => {
    setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
    setOpenNote(updated);
  };

  const handleDeleted = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    setOpenNote(null);
  };

  if (openNote) {
    return (
      <NoteEditor
        note={openNote}
        onBack={() => setOpenNote(null)}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    );
  }

  const previewNote = (n: Note) => {
    if (n.format === "note") return n.content?.slice(0, 80) || "";
    const items = (n.items ?? []) as NoteItem[];
    const done = items.filter(i => i.checked).length;
    if (items.length === 0) return "Belum ada item";
    return `${done}/${items.length} selesai`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            {notes.length === 0 ? "Belum ada catatan" : `${notes.length} catatan`}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)} className="text-xs gap-1.5 bg-primary text-primary-foreground">
          <Plus className="h-3.5 w-3.5" /> Buat Catatan
        </Button>
      </div>

      {/* Create new note panel */}
      {creating && (
        <div className="rounded-2xl border border-primary/30 bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">Buat Catatan Baru</p>
          {/* Format picker */}
          <div className="grid grid-cols-3 gap-2">
            {NOTE_FORMATS.map(f => {
              const FIcon = f.icon;
              return (
                <button
                  key={f.value}
                  onClick={() => setNewFormat(f.value)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-all ${
                    newFormat === f.value
                      ? `${f.color} ring-1 ring-current/30`
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  <FIcon className="h-4 w-4" />
                  <span>{f.label}</span>
                  <span className="text-[10px] font-normal opacity-70">{f.desc}</span>
                </button>
              );
            })}
          </div>
          {/* Title input */}
          <Input
            placeholder="Judul catatan (opsional)..."
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") createNote(); }}
            className="bg-secondary text-sm"
            autoFocus
          />
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => { setCreating(false); setNewTitle(""); }}>
              Batal
            </Button>
            <Button size="sm" className="flex-1 text-xs bg-primary text-primary-foreground" onClick={createNote} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Buat & Edit"}
            </Button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-card" />)}</div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <StickyNote className="h-10 w-10 text-muted-foreground/20" />
          <div>
            <p className="text-sm font-medium text-foreground">Belum ada catatan</p>
            <p className="text-xs text-muted-foreground mt-1">Buat catatan pertamamu — bisa to-do, checklist, atau teks bebas</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map(n => {
            const fmt = NOTE_FORMATS.find(f => f.value === n.format)!;
            const FmtIcon = fmt.icon;
            const prev = previewNote(n);
            return (
              <button
                key={n.id}
                onClick={() => setOpenNote(n)}
                className="w-full text-left rounded-2xl border border-border bg-card px-4 py-3.5 hover:border-primary/40 hover:bg-card/80 transition-all space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-foreground truncate">{n.title}</span>
                  <span className={`shrink-0 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${fmt.color}`}>
                    <FmtIcon className="h-2.5 w-2.5" /> {fmt.label}
                  </span>
                </div>
                {prev && <p className="text-xs text-muted-foreground truncate">{prev}</p>}
                <p className="text-[11px] text-muted-foreground/50">{fmtRelTime(n.updated_at)}</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   GREETING HELPER
   ════════════════════════════════════════════════════════ */
function getDayGreeting(): { text: string; emoji: string } {
  const h = new Date().getHours();
  if (h >= 4  && h < 11) return { text: "Selamat pagi",  emoji: "☀️" };
  if (h >= 11 && h < 15) return { text: "Selamat siang", emoji: "🌤️" };
  if (h >= 15 && h < 18) return { text: "Selamat sore",  emoji: "🌅" };
  return { text: "Selamat malam", emoji: "🌙" };
}

/* ════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════ */
const ProductivityPage = ({ userId: userIdProp }: { userId?: string }) => {
  const [userId, setUserId] = useState(userIdProp ?? "");
  const [userName, setUserName] = useState<string>("Masisir");
  const [tab, setTab] = useState<"fokus" | "dokumen" | "flashcard" | "catatan" | "pengingat">("fokus");
  const [gamRefreshKey, setGamRefreshKey] = useState(0);
  const handleFocusChange = useCallback(() => setGamRefreshKey(k => k + 1), []);
  const greeting = getDayGreeting();

  useEffect(() => {
    const init = async () => {
      let uid = userIdProp;
      if (!uid) {
        const { data: { session } } = await supabase.auth.getSession();
        uid = session?.user?.id;
      }
      if (!uid) return;
      setUserId(uid);
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", uid)
        .single();
      if (data?.full_name) {
        const firstName = data.full_name.trim().split(" ")[0];
        setUserName(firstName);
      }
    };
    init();
  }, [userIdProp]);

  const tabs = [
    { id: "fokus"     as const, label: "Fokus",     icon: Target,        desc: "Harian" },
    { id: "dokumen"   as const, label: "Dokumen",   icon: ClipboardList, desc: "& Admin" },
    { id: "flashcard" as const, label: "Flashcard", icon: Layers,        desc: "AI" },
    { id: "catatan"   as const, label: "Catatan",   icon: StickyNote,    desc: "" },
    { id: "pengingat" as const, label: "Pengingat", icon: Bell,          desc: "" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border/50">
        <div className="px-5 md:px-10 pt-5 md:pt-7 pb-0 md:max-w-5xl md:mx-auto">
          {/* Greeting */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <p className="text-[11px] md:text-xs text-muted-foreground font-medium tracking-wide uppercase">
                {greeting.emoji} {greeting.text}, {userName}
              </p>
              <h1 className="text-xl md:text-2xl font-extrabold text-foreground leading-tight mt-0.5">
                Ruang Produktif
              </h1>
            </div>
            <div className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-primary/10 border border-violet-500/20 flex items-center justify-center mt-0.5">
              <Target className="h-5 w-5 md:h-6 md:w-6 text-violet-400" />
            </div>
          </div>

          {/* Gamification bar */}
          {userId && (
            <GamificationBar userId={userId} refreshKey={gamRefreshKey} />
          )}

          {/* Tab nav */}
          <div className="flex gap-1 mt-4 pb-0 overflow-x-auto scrollbar-hide -mx-1 px-1">
            {tabs.map(t => {
              const Icon = t.icon;
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative flex items-center gap-1.5 shrink-0 px-3.5 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-semibold transition-all rounded-t-xl ${
                    isActive
                      ? "text-foreground bg-background border border-b-background border-border/60 -mb-px z-10 pb-[calc(0.5rem+1px)] md:pb-[calc(0.625rem+1px)]"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50 mb-0"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 md:h-4 md:w-4 ${isActive ? "text-primary" : ""}`} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab content */}
      {tab === "flashcard" ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <FlashcardPage />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 md:px-10 py-4 md:py-7 md:max-w-5xl md:mx-auto">
            {tab === "fokus"     && <FocusTab onFocusChange={handleFocusChange} />}
            {tab === "dokumen"   && <TrackerTab />}
            {tab === "catatan"   && <NotesTab />}
            {tab === "pengingat" && <ReminderTab />}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductivityPage;
