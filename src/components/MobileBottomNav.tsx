import { MessageSquare, Newspaper, BookOpen, Users, User } from "lucide-react";

interface MobileBottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const NAV_ITEMS = [
  { id: "chat",     icon: MessageSquare, label: "Chat" },
  { id: "berita",   icon: Newspaper,     label: "Berita" },
  { id: "library",  icon: BookOpen,      label: "Library" },
  { id: "threads",  icon: Users,         label: "Forum" },
  { id: "profile",  icon: User,          label: "Profil" },
];

export default function MobileBottomNav({ activeTab, onTabChange }: MobileBottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-white/[0.07] bg-background/95 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-stretch h-14">
        {NAV_ITEMS.map(({ id, icon: Icon, label }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 touch-manipulation"
              aria-label={label}
              aria-current={active ? "page" : undefined}
            >
              <div className={`relative flex items-center justify-center rounded-xl transition-all duration-200 ${
                active ? "w-12 h-6 bg-primary/15" : "w-8 h-6"
              }`}>
                <Icon className={`h-[18px] w-[18px] transition-colors duration-200 ${
                  active ? "text-primary" : "text-muted-foreground/60"
                }`} />
              </div>
              <span className={`text-[9px] font-medium tracking-wide transition-colors duration-200 ${
                active ? "text-primary" : "text-muted-foreground/50"
              }`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
