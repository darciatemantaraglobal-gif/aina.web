import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CheckSquare, Target, StickyNote, Plus, Trash2, Flame, Pencil, Check, X } from "lucide-react";

interface Task {
  id: string;
  title: string;
  completed: boolean;
  task_type: string;
  content: string | null;
  updated_at: string;
}

interface HabitMeta {
  streak: number;
  lastCompleted: string | null;
}

function parseHabitMeta(content: string | null): HabitMeta {
  if (!content) return { streak: 0, lastCompleted: null };
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && "streak" in parsed) return parsed as HabitMeta;
  } catch {}
  return { streak: 0, lastCompleted: null };
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getStreakNotification(streak: number): string | null {
  if (streak === 3) return "Streak 3 hari! Mulai terbentuk kebiasaan baik!";
  if (streak === 7) return "Streak 7 hari! Satu minggu penuh, luar biasa!";
  if (streak === 14) return "Streak 14 hari! Dua minggu konsisten, kamu hebat!";
  if (streak === 30) return "Streak 30 hari! Satu bulan penuh! Luar biasa!";
  if (streak > 0 && streak % 30 === 0) return `Streak ${streak} hari! Pencapaian yang menakjubkan!`;
  return null;
}

const ProductivityPage = ({ userId: userIdProp }: { userId?: string }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newHabit, setNewHabit] = useState("");
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteContent, setEditNoteContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    loadTasks();
  }, []);

  const getUserId = async (): Promise<string | undefined> => {
    if (userIdProp) return userIdProp;
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id;
  };

  const loadTasks = async () => {
    try {
      const uid = await getUserId();
      if (!uid) { setLoading(false); return; }

      const { data } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });

      if (!data) { setLoading(false); return; }

      const today = todayStr();
      const toReset = data.filter(
        t => t.task_type === "daily" &&
          t.completed &&
          t.updated_at.slice(0, 10) < today
      );

      if (toReset.length > 0) {
        const ids = toReset.map(t => t.id);
        await supabase.from("tasks").update({ completed: false }).in("id", ids);
        const resetData = data.map(t =>
          ids.includes(t.id) ? { ...t, completed: false } : t
        );
        setTasks(resetData);
        toast.info(`${toReset.length} tugas harian direset untuk hari ini`, {
          description: "Semangat selesaikan tugas harianmu!",
        });
      } else {
        setTasks(data);
      }
    } catch (err) {
      console.error("ProductivityPage error:", err);
    } finally {
      setLoading(false);
    }
  };

  const addTask = async (type: string, title: string, content?: string) => {
    if (!title.trim() || adding) return;
    setAdding(true);
    try {
      const uid = await getUserId();
      if (!uid) return;

      const insertContent = type === "habit"
        ? JSON.stringify({ streak: 0, lastCompleted: null })
        : content || null;

      const { data, error } = await supabase.from("tasks").insert({
        user_id: uid,
        title: title.trim(),
        task_type: type,
        content: insertContent,
      }).select().single();

      if (error) { toast.error("Gagal menambah item. Coba lagi."); return; }
      if (data) setTasks((prev) => [data, ...prev]);
      if (type === "daily") setNewTask("");
      if (type === "habit") setNewHabit("");
      if (type === "note") setNewNote("");
      toast.success(
        type === "daily" ? "Tugas ditambahkan!"
        : type === "habit" ? "Kebiasaan ditambahkan! Mulai streak-mu hari ini."
        : "Catatan disimpan!"
      );
    } catch {
      toast.error("Koneksi gagal. Coba lagi.");
    } finally {
      setAdding(false);
    }
  };

  const toggleTask = async (id: string, completed: boolean) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !completed } : t)));
    const { error } = await supabase.from("tasks").update({ completed: !completed }).eq("id", id);
    if (error) {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed } : t)));
      toast.error("Gagal mengubah status. Coba lagi.");
    }
  };

  const toggleHabit = async (task: Task) => {
    const meta = parseHabitMeta(task.content);
    const today = todayStr();
    const yesterday = yesterdayStr();

    let newStreak = meta.streak;
    let newCompleted: boolean;

    if (!task.completed) {
      if (meta.lastCompleted === today) {
        newStreak = meta.streak;
      } else if (meta.lastCompleted === yesterday) {
        newStreak = meta.streak + 1;
      } else {
        newStreak = 1;
      }
      newCompleted = true;
    } else {
      newCompleted = false;
      newStreak = meta.streak;
    }

    const newMeta: HabitMeta = {
      streak: newStreak,
      lastCompleted: newCompleted ? today : meta.lastCompleted,
    };
    const newContent = JSON.stringify(newMeta);

    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, completed: newCompleted, content: newContent }
          : t
      )
    );

    const { error } = await supabase
      .from("tasks")
      .update({ completed: newCompleted, content: newContent })
      .eq("id", task.id);

    if (error) {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, completed: task.completed, content: task.content } : t))
      );
      toast.error("Gagal mengubah status. Coba lagi.");
      return;
    }

    if (newCompleted) {
      const msg = getStreakNotification(newStreak);
      if (msg) {
        toast.success(`🔥 ${msg}`, { duration: 4000 });
      } else {
        toast.success(`Habit selesai! Streak: ${newStreak} hari 🔥`);
      }
    }
  };

  const deleteTask = async (id: string) => {
    const prev = tasks;
    setTasks((t) => t.filter((x) => x.id !== id));
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      setTasks(prev);
      toast.error("Gagal menghapus. Coba lagi.");
      return;
    }
    toast.success("Berhasil dihapus");
  };

  const startEditNote = (note: Task) => {
    setEditingNoteId(note.id);
    setEditNoteContent(note.content || note.title);
  };

  const cancelEditNote = () => {
    setEditingNoteId(null);
    setEditNoteContent("");
  };

  const saveEditNote = async (note: Task) => {
    const trimmed = editNoteContent.trim();
    if (!trimmed) { toast.error("Catatan tidak boleh kosong"); return; }
    setSavingNote(true);
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ title: trimmed, content: trimmed })
        .eq("id", note.id);

      if (error) { toast.error("Gagal menyimpan catatan"); return; }
      setTasks((prev) =>
        prev.map((t) => t.id === note.id ? { ...t, title: trimmed, content: trimmed } : t)
      );
      setEditingNoteId(null);
      toast.success("Catatan diperbarui!");
    } finally {
      setSavingNote(false);
    }
  };

  const dailyTasks = tasks.filter((t) => t.task_type === "daily");
  const habits = tasks.filter((t) => t.task_type === "habit");
  const notes = tasks.filter((t) => t.task_type === "note");

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">Productivity</h1>
          <p className="text-sm text-muted-foreground">Kelola tugas, kebiasaan, dan catatan harianmu.</p>
        </div>

        <Tabs defaultValue="daily" className="w-full">
          <TabsList className="w-full bg-secondary">
            <TabsTrigger
              value="daily"
              className="flex-1 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <CheckSquare className="h-4 w-4" />
              Daily Tasks
            </TabsTrigger>
            <TabsTrigger
              value="habit"
              className="flex-1 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Target className="h-4 w-4" />
              Habit Tracker
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="flex-1 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <StickyNote className="h-4 w-4" />
              Notes
            </TabsTrigger>
          </TabsList>

          {/* Daily Tasks */}
          <TabsContent value="daily" className="mt-4 space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Tambah tugas baru..."
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask("daily", newTask)}
                className="bg-secondary"
              />
              <Button variant="hero" size="icon" disabled={adding} onClick={() => addTask("daily", newTask)}>
                {adding
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  : <Plus className="h-4 w-4" />
                }
              </Button>
            </div>
            <p className="text-xs text-muted-foreground/60">
              Tugas harian direset otomatis setiap hari.
            </p>
            {dailyTasks.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Belum ada tugas. Tambahkan tugas pertamamu!
              </p>
            )}
            {dailyTasks.map((task) => (
              <Card key={task.id} className="border-border bg-card">
                <CardContent className="flex items-center gap-3 p-3">
                  <Checkbox
                    checked={task.completed}
                    onCheckedChange={() => toggleTask(task.id, task.completed)}
                  />
                  <span
                    className={`flex-1 text-sm ${
                      task.completed ? "text-muted-foreground line-through" : "text-foreground"
                    }`}
                  >
                    {task.title}
                  </span>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Habit Tracker */}
          <TabsContent value="habit" className="mt-4 space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Tambah kebiasaan baru..."
                value={newHabit}
                onChange={(e) => setNewHabit(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask("habit", newHabit)}
                className="bg-secondary"
              />
              <Button variant="hero" size="icon" disabled={adding} onClick={() => addTask("habit", newHabit)}>
                {adding
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  : <Plus className="h-4 w-4" />
                }
              </Button>
            </div>
            {habits.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Belum ada kebiasaan. Mulai track kebiasaanmu!
              </p>
            )}
            {habits.map((habit) => {
              const meta = parseHabitMeta(habit.content);
              return (
                <Card key={habit.id} className="border-border bg-card">
                  <CardContent className="flex items-center gap-3 p-3">
                    <Checkbox
                      checked={habit.completed}
                      onCheckedChange={() => toggleHabit(habit)}
                    />
                    <span
                      className={`flex-1 text-sm ${
                        habit.completed ? "text-muted-foreground line-through" : "text-foreground"
                      }`}
                    >
                      {habit.title}
                    </span>
                    {meta.streak > 0 && (
                      <div className="flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-semibold text-orange-400">
                        <Flame className="h-3 w-3" />
                        {meta.streak}
                      </div>
                    )}
                    <button
                      onClick={() => deleteTask(habit.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* Notes */}
          <TabsContent value="notes" className="mt-4 space-y-3">
            <div className="space-y-2">
              <Textarea
                placeholder="Tulis catatan baru..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="min-h-[80px] bg-secondary"
              />
              <Button
                variant="hero"
                size="sm"
                disabled={adding}
                onClick={() => addTask("note", newNote, newNote)}
                className="gap-1.5"
              >
                {adding
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  : <Plus className="h-4 w-4" />
                }
                {adding ? "Menyimpan..." : "Simpan Catatan"}
              </Button>
            </div>
            {notes.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Belum ada catatan.</p>
            )}
            {notes.map((note) => (
              <Card key={note.id} className="border-border bg-card">
                <CardContent className="flex items-start gap-3 p-3">
                  <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {editingNoteId === note.id ? (
                    <div className="flex-1 space-y-2">
                      <Textarea
                        value={editNoteContent}
                        onChange={(e) => setEditNoteContent(e.target.value)}
                        className="min-h-[80px] bg-secondary text-sm"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => saveEditNote(note)}
                          disabled={savingNote}
                          className="h-7 gap-1 text-green-500 hover:bg-green-500/10"
                        >
                          {savingNote
                            ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
                            : <Check className="h-3.5 w-3.5" />
                          }
                          Simpan
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={cancelEditNote}
                          className="h-7 gap-1 text-muted-foreground hover:bg-secondary"
                        >
                          <X className="h-3.5 w-3.5" />
                          Batal
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="flex-1 text-sm text-foreground whitespace-pre-wrap">
                      {note.content || note.title}
                    </p>
                  )}
                  {editingNoteId !== note.id && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEditNote(note)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit catatan"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteTask(note.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ProductivityPage;
