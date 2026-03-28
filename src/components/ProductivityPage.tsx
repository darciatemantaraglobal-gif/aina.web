import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Plus, Trash2, Calendar, ChevronRight, CheckCircle2, Circle,
  ArrowLeft, Clock, FileText, CreditCard, Building2, Stamp,
  GraduationCap, Sparkles, Brain, Pencil, AlertTriangle, Loader2,
  Target, ClipboardList, BookOpen, RefreshCw,
} from "lucide-react";

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
  icon: React.ElementType; color: string; steps: ProcedureStep[];
}

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
function FocusTab() {
  const [items, setItems] = useState<FocusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"none" | "manual" | "ai_assist" | "ai_suggest">("none");
  const [manualTitle, setManualTitle] = useState("");
  const [manualDesc, setManualDesc] = useState("");
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{ title: string; description: string | null; priority: number }[]>([]);
  const [saving, setSaving] = useState(false);

  const today = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
  const activeCount = items.filter(i => i.status !== "done").length;
  const doneCount = items.filter(i => i.status === "done").length;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { items: data } = await apiCall("GET", "/productivity/focus/today");
      setItems(data);
    } catch { /* silent */ }
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
      setItems(prev => prev.map(i => i.id === id ? item : i));
    } catch (e: any) { toast.error(e.message); }
  };

  const deleteItem = async (id: string) => {
    try {
      await apiCall("DELETE", `/productivity/focus/${id}`);
      setItems(prev => prev.filter(i => i.id !== id));
      toast.success("Fokus dihapus");
    } catch (e: any) { toast.error(e.message); }
  };

  const statusCycle: Record<FocusItem["status"], FocusItem["status"]> = {
    pending: "in_progress", in_progress: "done", done: "pending",
  };

  return (
    <div className="space-y-4">
      {/* Date header + progress */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground capitalize">{today}</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              {items.length === 0 ? "Belum ada fokus hari ini" : `${doneCount}/${items.length} selesai`}
            </p>
          </div>
          {items.length > 0 && (
            <div className="text-right">
              <div className="flex gap-1 justify-end mb-1">
                {items.map(i => (
                  <div key={i.id} className={`h-2 w-8 rounded-full ${i.status === "done" ? "bg-emerald-500" : i.status === "in_progress" ? "bg-amber-400" : "bg-secondary"}`} />
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">{activeCount} aktif</p>
            </div>
          )}
        </div>
      </div>

      {/* Focus items */}
      {loading ? (
        <div className="space-y-2">
          {[1,2].map(i => <div key={i} className="h-16 rounded-xl bg-secondary/40 animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className={`group flex items-start gap-3 rounded-xl border px-3 py-3 transition-all ${
              item.status === "done" ? "border-border bg-card/50 opacity-60" :
              item.status === "in_progress" ? "border-amber-500/20 bg-amber-500/5" :
              "border-border bg-card"
            }`}>
              <button
                onClick={() => updateStatus(item.id, statusCycle[item.status])}
                className="shrink-0 mt-0.5 transition-colors"
              >
                {item.status === "done"
                  ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
                  : item.status === "in_progress"
                  ? <div className="h-4.5 w-4.5 rounded-full border-2 border-amber-400 flex items-center justify-center"><div className="h-2 w-2 rounded-full bg-amber-400" /></div>
                  : <Circle className="h-4.5 w-4.5 text-muted-foreground/50" />
                }
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium leading-snug ${item.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {item.title}
                </p>
                {item.description && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{item.description}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {item.source_type !== "manual" && (
                    <span className="text-[10px] text-violet-400 flex items-center gap-0.5">
                      <Sparkles className="h-2.5 w-2.5" />
                      AI
                    </span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                    item.status === "done" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" :
                    item.status === "in_progress" ? "text-amber-400 border-amber-500/20 bg-amber-500/5" :
                    "text-muted-foreground border-border"
                  }`}>
                    {item.status === "done" ? "Selesai" : item.status === "in_progress" ? "Sedang berjalan" : "Pending"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => deleteItem(item.id)}
                className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add mode buttons */}
      {mode === "none" && activeCount < 3 && (
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setMode("manual")}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all"
          >
            <Pencil className="h-4 w-4" />
            Manual
          </button>
          <button
            onClick={() => setMode("ai_assist")}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 text-xs text-violet-400 hover:border-violet-500/40 hover:bg-violet-500/10 transition-all"
          >
            <Brain className="h-4 w-4" />
            AI Bantu
          </button>
          <button
            onClick={() => { setMode("ai_suggest"); handleAiSuggest(); }}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 text-xs text-violet-400 hover:border-violet-500/40 hover:bg-violet-500/10 transition-all"
          >
            <Sparkles className="h-4 w-4" />
            AI Sarankan
          </button>
        </div>
      )}

      {/* Manual form */}
      {mode === "manual" && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Pencil className="h-3.5 w-3.5" /> Fokus Manual</p>
          <Input placeholder="Apa yang mau kamu fokuskan hari ini?" value={manualTitle} onChange={e => setManualTitle(e.target.value)} className="bg-secondary text-sm" autoFocus />
          <Input placeholder="Catatan singkat (opsional)" value={manualDesc} onChange={e => setManualDesc(e.target.value)} className="bg-secondary text-sm" />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setMode("none")} className="flex-1 h-8 text-xs">Batal</Button>
            <Button size="sm" onClick={addManual} disabled={saving} className="flex-1 h-8 text-xs">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Simpan"}
            </Button>
          </div>
        </div>
      )}

      {/* AI Assist form */}
      {mode === "ai_assist" && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Brain className="h-3.5 w-3.5 text-violet-400" /> AI Bantu Rapi-in Rencanamu</p>
          <textarea
            placeholder='Tulis rencanamu bebas... contoh: "Hari ini gue mau belajar, urus iqomah, sama lanjut revisi tugas"'
            value={aiInput}
            onChange={e => setAiInput(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-violet-500/20 bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-500/40 resize-none"
          />
          {aiLoading && (
            <div className="flex items-center gap-2 text-xs text-violet-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> AI sedang memproses...
            </div>
          )}
          {aiSuggestions.length > 0 && !aiLoading && (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">Hasil dari AI — simpan semua atau edit dulu:</p>
              {aiSuggestions.map((s, i) => (
                <div key={i} className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2">
                  <p className="text-xs font-medium text-foreground">{i + 1}. {s.title}</p>
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
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-violet-400" /> Saran Fokus dari AINA</p>
          {aiLoading && (
            <div className="flex items-center gap-2 text-xs text-violet-400 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> AINA sedang analisis konteksmu...
            </div>
          )}
          {aiSuggestions.length > 0 && !aiLoading && (
            <div className="space-y-2">
              {aiSuggestions.map((s, i) => (
                <div key={i} className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2">
                  <p className="text-xs font-medium text-foreground">{i + 1}. {s.title}</p>
                  {s.description && <p className="text-[11px] text-muted-foreground mt-0.5">{s.description}</p>}
                </div>
              ))}
            </div>
          )}
          {!aiLoading && aiSuggestions.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">Gagal mendapatkan saran.</p>
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
        <p className="text-center text-xs text-muted-foreground py-2">
          Sudah 3 fokus aktif — selesaikan dulu sebelum menambah yang baru.
        </p>
      )}
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { items: data } = await apiCall("GET", "/productivity/tracker");
      setItems(data);
    } catch { /* silent */ }
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

  const STATUS_CYCLE: Record<TrackerItem["status"], TrackerItem["status"]> = {
    not_started: "preparing", preparing: "submitted", submitted: "completed", completed: "not_started",
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const filtered = filterStatus === "all"
    ? items.filter(i => i.status !== "completed")
    : filterStatus === "completed"
    ? items.filter(i => i.status === "completed")
    : items.filter(i => i.status === filterStatus);

  const urgentCount = items.filter(i => i.is_urgent && i.status !== "completed").length;
  const pendingCount = items.filter(i => i.status !== "completed").length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">{pendingCount} pending</p>
          {urgentCount > 0 && (
            <span className="text-xs text-orange-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />{urgentCount} urgent
            </span>
          )}
        </div>
        <Button size="sm" onClick={() => setShowForm(v => !v)} className="gap-1.5 h-8 text-xs">
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
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">Urusan Baru</p>
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
          {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-secondary/40 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center opacity-40">
          <ClipboardList className="h-8 w-8 mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {filterStatus === "completed" ? "Belum ada yang selesai" : "Tidak ada urusan yang pending"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Tambahkan urusan penting seperti iqomah, visa, atau dokumen kampus</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => {
            const due = dueBadge(item.due_date);
            return (
              <div
                key={item.id}
                className={`group flex items-start gap-3 rounded-xl border px-3 py-3 transition-all ${
                  item.status === "completed" ? "border-border bg-card/50 opacity-60" :
                  item.is_urgent ? "border-orange-500/20 bg-orange-500/5" :
                  "border-border bg-card"
                }`}
              >
                {/* Status cycle button */}
                <button
                  onClick={() => updateStatus(item.id, STATUS_CYCLE[item.status])}
                  className={`shrink-0 mt-0.5 rounded-full border-2 h-4.5 w-4.5 flex items-center justify-center transition-colors ${
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
                    onClick={() => toggleUrgent(item.id, item.is_urgent)}
                    className={`rounded-lg p-1.5 transition-all ${item.is_urgent ? "text-orange-400 hover:bg-orange-500/10" : "text-muted-foreground hover:bg-secondary"}`}
                    title={item.is_urgent ? "Hapus urgent" : "Tandai urgent"}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   TAB 3: PROCEDURE GUIDE (existing, preserved)
   ════════════════════════════════════════════════════════ */
const PROCEDURES: Procedure[] = [
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
  const [selected, setSelected] = useState<Procedure | null>(null);
  const [progress, setProgress] = useState<Set<number>>(new Set());

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
    const Icon = selected.icon;
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
      <p className="text-xs text-muted-foreground">Panduan langkah demi langkah untuk prosedur umum Masisir.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PROCEDURES.map(proc => {
          const done = getProcProgress(userId, proc.id).size;
          const total = proc.steps.length;
          const pct = Math.round((done / total) * 100);
          const Icon = proc.icon;
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
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════ */
const ProductivityPage = ({ userId: userIdProp }: { userId?: string }) => {
  const [userId, setUserId] = useState(userIdProp ?? "");
  const [tab, setTab] = useState<"fokus" | "dokumen" | "prosedur">("fokus");

  useEffect(() => {
    if (userIdProp) { setUserId(userIdProp); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setUserId(session.user.id);
    });
  }, [userIdProp]);

  const tabs = [
    { id: "fokus" as const, label: "Fokus Harian", icon: Target },
    { id: "dokumen" as const, label: "Dokumen & Admin", icon: ClipboardList },
    { id: "prosedur" as const, label: "Prosedur", icon: BookOpen },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-5 pt-5 pb-4 border-b border-border">
        <h1 className="text-lg font-bold font-display text-foreground">Ruang Produktif</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Fokus harian, urusan penting, dan panduan prosedur Masisir</p>

        {/* Tab pills */}
        <div className="flex gap-1 mt-4 overflow-x-auto scrollbar-hide">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tab === "fokus" && <FocusTab />}
        {tab === "dokumen" && <TrackerTab />}
        {tab === "prosedur" && userId && <ProcedureTab userId={userId} />}
      </div>
    </div>
  );
};

export default ProductivityPage;
