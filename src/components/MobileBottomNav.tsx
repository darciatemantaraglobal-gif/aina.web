import { MessageSquare, Zap, Users, User, PenLine } from "lucide-react";

interface MobileBottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const NAV_ITEMS = [
  { id: "chat",         icon: MessageSquare, label: "Chat" },
  { id: "productivity", icon: Zap,           label: "Produktif" },
  { id: "contributor",  icon: PenLine,       label: "Kontribusi", special: true },
  { id: "threads",      icon: Users,         label: "Forum" },
  { id: "profile",      icon: User,          label: "Profil" },
];

export default function MobileBottomNav({ activeTab, onTabChange }: MobileBottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-white/[0.07] bg-background/95 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-stretch h-14">
        {NAV_ITEMS.map(({ id, icon: Icon, label, special }) => {
          const active = activeTab === id;

          if (special) {
            return (
              <button
                key={id}
                onClick={() => onTabChange(id)}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 touch-manipulation"
                aria-label={label}
                aria-current={active ? "page" : undefined}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-700 shadow-[0_0_14px_hsl(270_80%_60%/0.55)] transition-transform duration-150 active:scale-95">
                  <Icon className="h-[18px] w-[18px] text-white" strokeWidth={2.2} />
                </div>
              </button>
            );
          }

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
