import { useState, useEffect, useRef } from "react";
import { Bell, Check, CheckCheck, Info, AlertCircle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning";
  read: boolean;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  const days = Math.floor(hrs / 24);
  return `${days} hari lalu`;
}

const typeStyle: Record<string, { icon: typeof Info; color: string; bg: string }> = {
  success: { icon: Check, color: "text-green-400", bg: "bg-green-500/10" },
  info: { icon: Info, color: "text-blue-400", bg: "bg-blue-500/10" },
  warning: { icon: AlertCircle, color: "text-yellow-400", bg: "bg-yellow-500/10" },
};

interface NotificationBellProps {
  collapsed?: boolean;
}

const NotificationBell = ({ collapsed = false }: NotificationBellProps) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setUserId(session.user.id);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;

    fetchNotifications();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications(prev => {
            if (prev.some(n => n.id === newNotif.id)) return prev;
            return [newNotif, ...prev];
          });
          toast[newNotif.type === "success" ? "success" : newNotif.type === "warning" ? "warning" : "info"](
            newNotif.title,
            { description: newNotif.message, duration: 6000 }
          );
        }
      )
      .subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (!data) return;
      setNotifications(prev => {
        const newOnes = data.filter((n: Notification) => !prev.some(p => p.id === n.id));
        newOnes.forEach((n: Notification) => {
          if (!n.read) {
            toast[n.type === "success" ? "success" : n.type === "warning" ? "warning" : "info"](
              n.title,
              { description: n.message, duration: 6000 }
            );
          }
        });
        return data as Notification[];
      });
    }, 30_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [userId]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setNotifications(data as Notification[]);
    } catch (e) {
      console.error("Failed to fetch notifications:", e);
    } finally {
      setLoading(false);
    }
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
  };

  const markOneRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  };

  const clearAll = async () => {
    if (clearing || notifications.length === 0) return;
    setClearing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/notifications", {
        method: "DELETE",
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) throw new Error("Gagal menghapus notifikasi");
      setNotifications([]);
    } catch {
      toast.error("Gagal menghapus notifikasi");
    } finally {
      setClearing(false);
    }
  };

  const handleOpen = () => {
    setOpen(prev => !prev);
    if (!open && unreadCount > 0) {
      setTimeout(markAllRead, 1500);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleOpen}
        title="Notifikasi"
        className={`relative flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent ${
          open ? "bg-sidebar-accent" : ""
        } ${collapsed ? "justify-center" : ""}`}
      >
        <div className="relative shrink-0">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>
        {!collapsed && <span>Notifikasi</span>}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-80 overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Notifikasi</p>
              {unreadCount > 0 && (
                <p className="text-xs text-muted-foreground">{unreadCount} belum dibaca</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Baca
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  disabled={clearing}
                  title="Hapus semua notifikasi"
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                >
                  {clearing
                    ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    : <Trash2 className="h-3.5 w-3.5" />
                  }
                  Hapus
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Belum ada notifikasi</p>
              </div>
            ) : (
              notifications.map(notif => {
                const style = typeStyle[notif.type] ?? typeStyle.info;
                const Icon = style.icon;
                return (
                  <button
                    key={notif.id}
                    onClick={() => markOneRead(notif.id)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary ${
                      !notif.read ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${style.bg}`}>
                      <Icon className={`h-3.5 w-3.5 ${style.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-xs font-medium leading-tight ${notif.read ? "text-foreground" : "text-foreground font-semibold"}`}>
                          {notif.title}
                        </p>
                        {!notif.read && (
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{notif.message}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground/60">{timeAgo(notif.created_at)}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
