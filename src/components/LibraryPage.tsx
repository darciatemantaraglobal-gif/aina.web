import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen, Search, ExternalLink, FileText, Filter,
  GraduationCap, BookMarked, Globe, X, ChevronDown,
} from "lucide-react";

interface LibraryItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  faculty: string | null;
  year_level: string | null;
  drive_url: string;
  file_type: string;
  tags: string | null;
  created_at: string;
}

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  muqorror:  { label: "Muqorror",  icon: BookMarked, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  panduan:   { label: "Panduan",   icon: FileText,   color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20"   },
  referensi: { label: "Referensi", icon: Globe,      color: "text-green-400",  bg: "bg-green-500/10 border-green-500/20" },
  umum:      { label: "Umum",      icon: BookOpen,   color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20" },
};

const FACULTIES = ["Semua", "Ushuluddin", "Syariah wal Qanun", "Dirasah Islamiyah wal Arabiyah", "Bahasa Arab", "Lainnya"];
const YEAR_LEVELS = ["Semua", "Tahun 1", "Tahun 2", "Tahun 3", "Tahun 4", "Semua Tahun"];

async function apiFetch(path: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function convertDriveUrl(url: string): string {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return url;
  return `https://drive.google.com/file/d/${match[1]}/view`;
}

function Badge({ text, className }: { text: string; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none ${className}`}>
      {text}
    </span>
  );
}

function FilterSelect({
  label, value, options, onChange,
}: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-white/[0.07]"
      >
        <span className="text-foreground/40 text-xs">{label}:</span>
        <span className="font-medium">{value}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-foreground/30 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-white/10 bg-[#2d2d38] shadow-2xl">
            {options.map(opt => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-white/5 ${opt === value ? "text-primary font-medium" : "text-foreground/70"}`}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LibraryCard({ item }: { item: LibraryItem }) {
  const meta = CATEGORY_META[item.category] ?? CATEGORY_META.umum;
  const Icon = meta.icon;
  const url = convertDriveUrl(item.drive_url);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 transition-all hover:border-white/[0.15] hover:bg-white/[0.06]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${meta.bg}`}>
          <Icon className={`h-4 w-4 ${meta.color}`} />
        </div>
        <ExternalLink className="h-4 w-4 shrink-0 text-foreground/20 transition-colors group-hover:text-foreground/60 mt-0.5" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {item.title}
        </p>
        {item.description && (
          <p className="mt-1 text-xs leading-relaxed text-foreground/50 line-clamp-2">{item.description}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge text={meta.label} className={`${meta.bg} ${meta.color}`} />
        {item.faculty && (
          <Badge text={item.faculty} className="border-white/10 bg-white/[0.04] text-foreground/50" />
        )}
        {item.year_level && (
          <Badge text={item.year_level} className="border-white/10 bg-white/[0.04] text-foreground/50" />
        )}
        {item.file_type && item.file_type !== "pdf" && (
          <Badge text={item.file_type.toUpperCase()} className="border-white/10 bg-white/[0.04] text-foreground/50" />
        )}
      </div>
    </a>
  );
}

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Semua");
  const [faculty, setFaculty] = useState("Semua");
  const [yearLevel, setYearLevel] = useState("Semua");
  const [activeCategory, setActiveCategory] = useState<string>("semua");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeCategory !== "semua") params.set("category", activeCategory);
      if (faculty !== "Semua") params.set("faculty", faculty);
      if (yearLevel !== "Semua") params.set("year_level", yearLevel);
      if (search.trim()) params.set("q", search.trim());
      const data = await apiFetch(`/api/library?${params}`);
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeCategory, faculty, yearLevel, search]);

  useEffect(() => { load(); }, [load]);

  const hasFilters = activeCategory !== "semua" || faculty !== "Semua" || yearLevel !== "Semua" || search.trim();

  const clearFilters = () => {
    setActiveCategory("semua");
    setFaculty("Semua");
    setYearLevel("Semua");
    setSearch("");
  };

  const catTabs = [
    { id: "semua", label: "Semua" },
    { id: "muqorror", label: "Muqorror" },
    { id: "panduan", label: "Panduan" },
    { id: "referensi", label: "Referensi" },
    { id: "umum", label: "Umum" },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-4 md:px-8 md:py-5">
        <div className="md:max-w-5xl md:mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-purple-500">
            <BookOpen className="h-4 w-4 md:h-5 md:w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base md:text-xl font-bold text-foreground leading-tight">Library Masisir</h1>
            <p className="text-xs md:text-sm text-foreground/40">Muqorror, panduan, dan referensi untuk Masisir</p>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/30" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari judul, deskripsi, atau tag..."
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-foreground/25 focus:border-white/20 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-3.5 w-3.5 text-foreground/30 hover:text-foreground/60" />
            </button>
          )}
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 overflow-x-auto scrollbar-none mb-3">
          {catTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveCategory(tab.id)}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                activeCategory === tab.id
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-white/[0.04] text-foreground/50 border border-white/10 hover:bg-white/[0.07] hover:text-foreground/80"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Extra filters row */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-foreground/30 shrink-0" />
          <FilterSelect
            label="Fakultas"
            value={faculty}
            options={FACULTIES}
            onChange={setFaculty}
          />
          <FilterSelect
            label="Tahun"
            value={yearLevel}
            options={YEAR_LEVELS}
            onChange={setYearLevel}
          />
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-foreground/40 transition-colors hover:text-foreground/70"
            >
              <X className="h-3 w-3" />
              Reset
            </button>
          )}
        </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">
        <div className="md:max-w-5xl md:mx-auto">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/10">
              <GraduationCap className="h-7 w-7 text-foreground/20" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground/60">
                {hasFilters ? "Tidak ada hasil untuk filter ini" : "Library masih kosong"}
              </p>
              <p className="mt-1 text-xs text-foreground/30">
                {hasFilters ? "Coba ubah atau reset filter" : "Admin akan segera menambahkan dokumen"}
              </p>
            </div>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="rounded-xl bg-white/[0.06] border border-white/10 px-4 py-2 text-xs font-medium text-foreground/60 hover:text-foreground/90 transition-colors"
              >
                Reset Filter
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-foreground/30">{items.length} dokumen ditemukan</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(item => (
                <LibraryCard key={item.id} item={item} />
              ))}
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
