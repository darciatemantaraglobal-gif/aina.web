import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CheckSquare, Target, StickyNote, Plus, Trash2 } from "lucide-react";

interface Task {
  id: string;
  title: string;
  completed: boolean;
  task_type: string;
  content: string | null;
}

const ProductivityPage = ({ userId: userIdProp }: { userId?: string }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newHabit, setNewHabit] = useState("");
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      let uid = userIdProp;
      if (!uid) {
        const { data: { session } } = await supabase.auth.getSession();
        uid = session?.user?.id;
      }
      if (!uid) { setLoading(false); return; }

      const { data } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });

      if (data) setTasks(data);
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
      let uid = userIdProp;
      if (!uid) {
        const { data: { session } } = await supabase.auth.getSession();
        uid = session?.user?.id;
      }
      if (!uid) return;

      const { data, error } = await supabase.from("tasks").insert({
        user_id: uid,
        title: title.trim(),
        task_type: type,
        content: content || null,
      }).select().single();

      if (error) {
        toast.error("Gagal menambah item. Coba lagi.");
        return;
      }
      if (data) setTasks((prev) => [data, ...prev]);
      if (type === "daily") setNewTask("");
      if (type === "habit") setNewHabit("");
      if (type === "note") setNewNote("");
      toast.success("Berhasil ditambahkan!");
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
                {adding ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
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
                    className="text-muted-foreground hover:text-destructive"
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
                {adding ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
            {habits.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Belum ada kebiasaan. Mulai track kebiasaanmu!
              </p>
            )}
            {habits.map((habit) => (
              <Card key={habit.id} className="border-border bg-card">
                <CardContent className="flex items-center gap-3 p-3">
                  <Checkbox
                    checked={habit.completed}
                    onCheckedChange={() => toggleTask(habit.id, habit.completed)}
                  />
                  <span
                    className={`flex-1 text-sm ${
                      habit.completed ? "text-muted-foreground line-through" : "text-foreground"
                    }`}
                  >
                    {habit.title}
                  </span>
                  <button
                    onClick={() => deleteTask(habit.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </CardContent>
              </Card>
            ))}
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
                {adding ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
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
                  <p className="flex-1 text-sm text-foreground whitespace-pre-wrap">
                    {note.content || note.title}
                  </p>
                  <button
                    onClick={() => deleteTask(note.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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
