import React, { useState, useRef, useEffect, useCallback, createContext, useContext, Children, cloneElement, isValidElement } from "react";
import { Send, AlertCircle, Menu, Plus, Zap, Crown, BookOpen, X, Flag, Check, Paperclip, FileText, ImageIcon, Copy, ThumbsUp, ThumbsDown, BookMarked, Mic, MicOff, Globe, TrendingUp, ShieldCheck, Bookmark, BookmarkCheck, MapPin, Download, RefreshCw, Square, Share2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getPersonalization } from "@/components/DashboardSidebar";
import ArtifactPanel, { isArtifactWorthy, deriveArtifactTitle } from "@/components/ArtifactPanel";

interface SourceMetadata {
  confidence: "verified" | "community_based" | "web_result" | "fallback";
  primary_source: string;
  may_be_outdated: boolean;
  source_summary: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  imageDataUrl?: string;
  fileName?: string;
  intent?: string;
  confidence?: string;
  sources?: string[];
  citation_urls?: string[];
  sourceMetadata?: SourceMetadata;
  suggestions?: string[];
  kbImages?: string[];
}

interface AttachedFile {
  type: "image" | "pdf";
  dataUrl?: string;
  text?: string;
  name: string;
  sizeKb: number;
}

interface ChatAreaProps {
  onMenuClick?: () => void;
  chatId: string | null;
  onChatCreated: (chatId: string, title: string) => void;
  onNewChat?: () => void;
  initialMessage?: string;
  onGoContributor?: () => void;
  isAdmin?: boolean;
}

const API_URL = "/api/chat";

const WELCOME_SUBTITLES = [
  "Ada yang bisa aku bantu hari ini?",
  "Mau tanya soal apa hari ini?",
  "Apa yang ingin kamu ketahui?",
  "Siap membantu perjalananmu di Mesir.",
  "Tanya aja, aku siap jawab.",
  "Butuh info tentang kehidupan di Kairo?",
  "Kuliah, dokumen, atau kehidupan sehari-hari — tanya saja.",
  "Semua pertanyaan tentang Mesir, aku siap bantu.",
  "Ada info apa yang kamu cari hari ini?",
  "Yuk, mulai ngobrol.",
];

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11)  return "Selamat pagi";
  if (hour >= 11 && hour < 15) return "Selamat siang";
  if (hour >= 15 && hour < 19) return "Selamat sore";
  return "Selamat malam";
}

function getRandomSubtitle(): string {
  return WELCOME_SUBTITLES[Math.floor(Math.random() * WELCOME_SUBTITLES.length)];
}

// ── Personalized suggestion chips ────────────────────────────────────────────
// Returns 4 contextually relevant prompts based on time-of-day, day-of-week,
// and month (academic calendar + seasonal events in Egypt).

const SUGGESTION_POOL = {
  // Morning-specific (05:00–10:59)
  morning: [
    "Ada jadwal kuliah yang perlu aku catat hari ini?",
    "Tempat sarapan murah dekat kampus Al-Azhar?",
    "Doa dan adab memulai hari bagi mahasiswa",
    "Tips produktif belajar pagi hari di Mesir",
    "Jadwal bis atau angkutan pagi dari Hay Asyir",
  ],
  // Night-specific (21:00–04:59)
  night: [
    "Rekomendasi tempat makan malam halal di Kairo",
    "Warung atau restoran Indonesia yang buka malam?",
    "Tips belajar malam agar tidak mengantuk",
    "Doa sebelum tidur yang dianjurkan",
    "Tempat yang aman untuk jalan malam di Kairo?",
  ],
  // Friday
  friday: [
    "Masjid terbaik untuk sholat Jumat di Kairo?",
    "Waktu sholat Jumat di Kairo hari ini",
    "Rekomendasi aktivitas setelah Jumat di Kairo",
    "Apa saja sunnah hari Jumat yang perlu diketahui?",
  ],
  // Exam period: Dec–Jan & May–Jun (imtihan nihayah Al-Azhar)
  exam: [
    "Tips menghadapi imtihan nihayah di Al-Azhar",
    "Strategi belajar efektif menjelang ujian",
    "Bagaimana cara minta dispensasi jika sakit saat ujian?",
    "Materi yang sering keluar di ujian Fiqh Syafi'i",
    "Cara cek jadwal ujian di sistem Al-Azhar",
    "Doa sebelum ujian yang dianjurkan ulama",
  ],
  // Registration period: Sep & Feb (awal semester)
  registration: [
    "Cara daftar ulang kuliah semester baru di Al-Azhar",
    "Dokumen yang dibutuhkan untuk registrasi semester ini",
    "Prosedur untuk mahasiswa baru yang baru tiba di Mesir",
    "Cara update data mahasiswa di sistem Al-Azhar",
    "Tips maba: apa yang harus dilakukan minggu pertama?",
  ],
  // Summer break: Jun–Aug
  summer: [
    "Cara beli tiket pesawat murah Kairo–Jakarta",
    "Prosedur perpanjang iqama sebelum pulang ke Indonesia",
    "Apa yang perlu diurus sebelum liburan panjang?",
    "Apakah iqama bisa diperpanjang saat di Indonesia?",
    "Rekomendasi oleh-oleh khas Mesir untuk dibawa pulang",
  ],
  // Ramadan (approx Feb 17 – Mar 18 for 2026; late Jan – late Feb for 2027)
  ramadan: [
    "Jadwal imsak dan buka puasa hari ini di Kairo",
    "Rekomendasi tempat iftar Ramadan di Kairo",
    "Masjid yang punya program tarawih bagus di Kairo?",
    "Tips puasa Ramadan di Mesir untuk mahasiswa",
    "Hukum dan adab i'tikaf di masjid menurut mazhab Syafi'i",
  ],
  // Academic mid-semester (Oct–Nov & Mar–Apr)
  midsemester: [
    "Cara lapor absensi jika tidak bisa masuk kuliah",
    "Hak dan kewajiban mahasiswa Al-Azhar menurut peraturan",
    "Rekomendasi buku referensi untuk kuliah Ushuluddin",
    "Cara mengakses perpustakaan Al-Azhar secara online",
  ],
  // General (always available, used as filler)
  general: [
    "Bagaimana cara daftar kuliah di Al-Azhar?",
    "Cara mengurus visa pelajar Mesir",
    "Biaya hidup bulanan di Kairo untuk mahasiswa",
    "Cara perpanjang iqama mahasiswa",
    "Tips adaptasi kehidupan pertama kali di Mesir",
    "Cara transfer uang dari Indonesia ke Mesir",
    "Alamat KBRI Kairo dan layanan yang tersedia",
    "Rekomendasi dokter yang bisa bahasa Indonesia di Kairo",
    "Hukum fiqh tentang shalat jama' qasar saat bepergian",
    "Cara mengurus surat keterangan mahasiswa aktif",
    "Perbedaan sistem kuliah Al-Azhar vs kampus Indonesia",
    "Tempat belanja kebutuhan sehari-hari yang terjangkau di Kairo",
    "Cara daftar SIM card Mesir untuk mahasiswa baru",
    "Komunitas dan organisasi Masisir yang aktif",
    "Apa itu PPMI dan bagaimana cara bergabung?",
  ],
};

function _shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getPersonalizedSuggestions(): string[] {
  const now  = new Date();
  const hour  = now.getHours();
  const month = now.getMonth() + 1; // 1–12
  const day   = now.getDay();       // 0=Sun … 5=Fri … 6=Sat

  // ── Detect context ──────────────────────────────────────────────────────
  // Ramadan 2026: ~17 Feb – 17 Mar; 2027: ~7 Feb – 8 Mar
  const year = now.getFullYear();
  const isRamadan = (() => {
    if (year === 2026) return (month === 2 && now.getDate() >= 17) || (month === 3 && now.getDate() <= 17);
    if (year === 2027) return (month === 2 && now.getDate() >= 7)  || (month === 3 && now.getDate() <= 8);
    return false;
  })();

  const isExamPeriod    = (month === 12) || (month === 1) || (month === 5) || (month === 6);
  const isRegistration  = (month === 9) || (month === 2 && !isRamadan);
  const isSummer        = month >= 6 && month <= 8;
  const isMidSemester   = (month >= 10 && month <= 11) || (month >= 3 && month <= 4);
  const isFriday        = day === 5;
  const isMorning       = hour >= 5 && hour < 11;
  const isNight         = hour >= 21 || hour < 5;

  // ── Pick contextual pool (1 primary context → 2 chips from it) ─────────
  let contextPool: string[] = [];
  if (isRamadan)       contextPool = SUGGESTION_POOL.ramadan;
  else if (isExamPeriod)    contextPool = SUGGESTION_POOL.exam;
  else if (isSummer)        contextPool = SUGGESTION_POOL.summer;
  else if (isRegistration)  contextPool = SUGGESTION_POOL.registration;
  else if (isMidSemester)   contextPool = SUGGESTION_POOL.midsemester;

  // Time-of-day sub-pool (for remaining slots)
  let timePool: string[] = [];
  if (isFriday)  timePool = SUGGESTION_POOL.friday;
  else if (isMorning) timePool = SUGGESTION_POOL.morning;
  else if (isNight)   timePool = SUGGESTION_POOL.night;

  // ── Assemble 4 chips: 2 contextual + 1 time + 1 general ───────────────
  const ctx     = _shuffled(contextPool).slice(0, 2);
  const timeOne = _shuffled(timePool).slice(0, 1);
  const general = _shuffled(SUGGESTION_POOL.general)
    .filter(s => !ctx.includes(s) && !timeOne.includes(s))
    .slice(0, 4);

  const combined = [...ctx, ...timeOne, ...general].slice(0, 4);

  // If contextual pools were empty, just return 4 from general
  return combined.length >= 4 ? combined : _shuffled(SUGGESTION_POOL.general).slice(0, 4);
}

const AinaLogo = ({ className }: { className?: string }) => (
  <img src="/aina-icon.png" alt="AINA" className={className} />
);

function cleanMarkdown(text: string): string {
  let result = text;

  // Strip "Sumber: ..." lines — rendered as source badges below the message
  result = result.replace(/^\*{0,2}sumber\*{0,2}[\s:*]+.+$/gim, "");

  // Convert HTML ordered lists to numbered markdown BEFORE stripping tags,
  // so <ol><li>Item A</li><li>Item B</li></ol> → "1. Item A\n2. Item B"
  result = result.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_, body) => {
    let n = 0;
    return body
      .replace(/<li\b[^>]*>/gi, () => { n++; return `\n${n}. `; })
      .replace(/<\/li>/gi, "");
  });

  // Convert HTML unordered lists to bullet markdown
  result = result.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_, body) => {
    return body.replace(/<li\b[^>]*>/gi, "\n- ").replace(/<\/li>/gi, "");
  });

  // ── HTML entity / tag cleanup ────────────────────────────────────────────
  result = result
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?p>/gi, "\n")
    .replace(/<\/?b>/gi, "**")
    .replace(/<\/?strong>/gi, "**")
    .replace(/<\/?i>/gi, "_")
    .replace(/<\/?em>/gi, "_")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"');

  // ── List normalization ───────────────────────────────────────────────────

  // 1. Convert "**Langkah N:**" / "**Langkah N**:" / "**Langkah N**."
  //    patterns to proper numbered markdown "N. "
  //    Handles: **Langkah 1:** | **Langkah 1**. | **Langkah 1** | Langkah 1.
  result = result.replace(
    /^\*{0,2}[Ll]angkah\s+(\d+)\*{0,2}[.:،]?\*{0,2}:?\s*/gm,
    "$1. "
  );

  // 2. Convert "**N.**" or "**N)**" bold-number-as-prefix patterns to "N. "
  //    e.g. "**1.**" or "**1)**" at line start
  result = result.replace(
    /^\*\*(\d+)[.)]\*\*\s*/gm,
    "$1. "
  );

  // 3. Ensure a blank line exists before a list item that follows non-list prose.
  //    "prose text\n1. item" → "prose text\n\n1. item"
  //    The negative lookahead (?![ \t]*\d+\.) prevents adding blank lines
  //    between consecutive list items (e.g. "1. a\n2. b" stays as-is).
  result = result.replace(
    /^(?![ \t]*\d+\.)([^\n]+)\n(\d+\.\s)/gm,
    "$1\n\n$2"
  );
  result = result.replace(
    /^(?![ \t]*[-*]\s)([^\n]+)\n([-*]\s)/gm,
    "$1\n\n$2"
  );

  // 4. Split numbered items that were collapsed onto the same line.
  //    e.g. "1. Step one 2. Step two" → "1. Step one\n2. Step two"
  //    Also handles zero-space: "1. Step one2. Step two" → correct split.
  //    Only acts on consecutive numbers (N+1 = M) to avoid false positives.
  result = result.replace(
    /(\d+\.\s[^\n]+?)\s{0,4}(?=(\d+)\.\s)/g,
    (match, item, nextNum) => {
      const thisNum = parseInt(item.match(/^(\d+)/)?.[1] ?? "0");
      return parseInt(nextNum) === thisNum + 1 ? `${item}\n` : match;
    }
  );

  // 5. Join lone "N." line with the content on the next line.
  //    e.g. "3.\n**Siapkan...**" → "3. **Siapkan...**"
  result = result.replace(/^(\d+\.)\s*\n([^\n])/gm, "$1 $2");

  // 6. Remove blank lines between consecutive numbered list items.
  //    e.g. "1. text\n\n2. text" → "1. text\n2. text"
  result = result.replace(/^(\d+\.\s[^\n]+)\n\n(?=\d+\.\s)/gm, "$1\n");

  // 7. Collapse excess blank lines
  result = result.replace(/\n{3,}/g, "\n\n");

  return result.trim();
}

// ── ARABIC_BLOCK renderer ────────────────────────────────────────────────────
// Parses [ARABIC_BLOCK]...[/ARABIC_BLOCK] tags emitted by AINA's Learning Mode
// and renders them as a styled card instead of raw text.

interface ArabicBlockData {
  arabic: string;
  reading: string;
  meaning: string;
}

function parseArabicBlock(raw: string): ArabicBlockData {
  // Normalize: strip wrapping bold/italic markers + force each known label
  // onto its own line so inline-format ("Arabic Text: … Reading: … Meaning: …")
  // still parses cleanly (AI sometimes collapses them to one line).
  const normalized = raw
    .replace(/\*+/g, "")
    .replace(/\s*(Arabic Text|Reading|Meaning)\s*:\s*/gi, "\n$1: ")
    .trim();

  const get = (label: string) => {
    const re = new RegExp(
      `^${label}:\\s*([\\s\\S]*?)(?=\\n(?:Arabic Text|Reading|Meaning):|$)`,
      "im"
    );
    const m = normalized.match(re);
    if (!m) return "";
    return m[1].replace(/\s+/g, " ").trim();
  };
  return {
    arabic:  get("Arabic Text"),
    reading: get("Reading"),
    meaning: get("Meaning"),
  };
}

function ArabicBlockCard({ arabic, reading, meaning }: ArabicBlockData) {
  const hasBottom = reading || meaning;
  return (
    <div className="my-3 rounded-xl border border-primary/25 bg-primary/5 overflow-hidden">
      {/* Arabic text — RTL */}
      <div className={`px-4 pt-3 ${hasBottom ? "pb-2.5 border-b border-primary/10" : "pb-3"}`}>
        <p
          dir="rtl"
          className="text-right leading-loose text-foreground tracking-wide"
          style={{ fontFamily: "'Amiri', serif", fontSize: "20px", lineHeight: "2.0" }}
        >
          {arabic}
        </p>
      </div>
      {/* Reading (cara baca) — blue italic */}
      {reading && (
        <div className="px-4 pt-2.5 pb-1" dir="ltr">
          <p className="text-sm italic text-blue-400/90 text-left leading-snug">
            {reading}
          </p>
        </div>
      )}
      {/* Meaning — LTR */}
      {meaning && (
        <div className={`px-4 ${reading ? "pt-1 pb-2.5" : "py-2.5"}`} dir="ltr">
          <p className="text-sm flex items-start gap-1.5 text-left">
            <span className="mt-px shrink-0 text-primary/70">✦</span>
            <span className="break-words text-white/85 italic">{meaning}</span>
          </p>
        </div>
      )}
    </div>
  );
}

// Tolerant to both [ARABIC_BLOCK]…[/ARABIC_BLOCK] and <ARABIC_BLOCK>…</ARABIC_BLOCK>
const ARABIC_BLOCK_RE = /[\[<]ARABIC_BLOCK[\]>]([\s\S]*?)[\[<]\/ARABIC_BLOCK[\]>]/g;

function renderWithArabicBlocks(content: string | null | undefined, applyClean = true): React.ReactNode {
  if (!content) return null;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  ARABIC_BLOCK_RE.lastIndex = 0;
  while ((match = ARABIC_BLOCK_RE.exec(content)) !== null) {
    // Prose before this block
    if (match.index > lastIndex) {
      const raw = content.slice(lastIndex, match.index);
      const md = applyClean ? cleanMarkdown(raw) : raw;
      if (md.trim()) {
        parts.push(
          <ReactMarkdown key={key++} remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
            {md}
          </ReactMarkdown>
        );
      }
    }
    // Arabic block card
    const data = parseArabicBlock(match[1]);
    if (data.arabic || data.meaning) {
      parts.push(<ArabicBlockCard key={key++} {...data} />);
    }
    lastIndex = match.index + match[0].length;
  }

  // Remaining prose after last block
  if (lastIndex < content.length) {
    const raw = content.slice(lastIndex);
    const md = applyClean ? cleanMarkdown(raw) : raw;
    if (md.trim()) {
      parts.push(
        <ReactMarkdown key={key++} remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
          {md}
        </ReactMarkdown>
      );
    }
  }

  // No blocks found — render as normal markdown
  if (parts.length === 0) {
    const md = applyClean ? cleanMarkdown(content) : content;
    return (
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
        {md}
      </ReactMarkdown>
    );
  }

  return <>{parts}</>;
}
// ────────────────────────────────────────────────────────────────────────────

function extractSources(content: string): string[] {
  const results: string[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const m = line.match(/\*{0,2}sumber\*{0,2}[\s:*]+(.+)/i);
    if (m) {
      const src = m[1].replace(/\*+/g, "").replace(/^\[|\]$/g, "").trim();
      if (src && src.length < 120) results.push(src);
    }
  }
  return results;
}

/* ── Source badge config map ─────────────────────────────────────────────── */

type SourceConfig = {
  icon: React.ElementType;
  label: string;
  className: string;
};

function getSourceConfig(src: string): SourceConfig {
  const s = src.toLowerCase();
  if (s.includes("breaking") || s.includes("update resmi"))
    return { icon: Zap,          label: src, className: "border-amber-500/30 bg-amber-500/10 text-amber-500 dark:text-amber-400" };
  if (s.includes("knowledge base"))
    return { icon: BookOpen,     label: src, className: "border-primary/30 bg-primary/10 text-primary" };
  if (s.includes("kurs") || s.includes("real-time") || s.includes("exchange"))
    return { icon: TrendingUp,   label: src, className: "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400" };
  if (s.includes("dorar"))
    return { icon: BookMarked,   label: src, className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
  if (s.includes("pencarian web") || s.includes("perplexity"))
    return { icon: Globe,        label: src, className: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400" };
  if (s.includes("wikipedia"))
    return { icon: Globe,        label: src, className: "border-slate-400/30 bg-slate-400/10 text-slate-500 dark:text-slate-400" };
  if (s.includes("duckduckgo"))
    return { icon: Globe,        label: src, className: "border-orange-500/30 bg-orange-500/10 text-orange-500 dark:text-orange-400" };
  if (s.includes("pengetahuan umum") || s.includes("model"))
    return { icon: AlertCircle,  label: src, className: "border-zinc-400/30 bg-zinc-400/10 text-zinc-500 dark:text-zinc-400" };
  return { icon: BookMarked,     label: src, className: "border-primary/20 bg-primary/5 text-primary/70" };
}

/* ── Confidence badge config ─────────────────────────────────────────────── */

function getConfidenceBadgeConfig(confidence: string | undefined) {
  switch (confidence) {
    case "verified":
      return { label: "Terverifikasi", icon: ShieldCheck, className: "text-green-600 dark:text-green-500" };
    case "web_result":
      return { label: "Dari Web", icon: Globe, className: "text-blue-500 dark:text-blue-400" };
    case "community_based":
      return { label: "Komunitas", icon: BookOpen, className: "text-primary" };
    case "fallback":
      return { label: "Perlu Verifikasi", icon: AlertCircle, className: "text-amber-500" };
    default:
      return null;
  }
}

const FEEDBACK_STORE_KEY = "aina_msg_feedback";
function loadStoredFeedback(): Record<string, "up" | "down"> {
  try { return JSON.parse(localStorage.getItem(FEEDBACK_STORE_KEY) ?? "{}"); } catch { return {}; }
}

const DAILY_LIMIT = 5;
const DAILY_NUDGE_AT = 4; // Show contributor nudge at this count (80% of limit)
const REMARK_PLUGINS = [remarkGfm, remarkBreaks];

// Context used by MD_COMPONENTS to tell <li> whether it's inside <ol> or <ul>.
// react-markdown v10 no longer passes node.parent, so we propagate it via context.
const ListTypeContext = createContext<"ol" | "ul">("ul");

function extractMdText(node: any): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractMdText).join("");
  if (node?.props?.children) return extractMdText(node.props.children);
  return "";
}
function containsArabic(node: any): boolean {
  return /[\u0600-\u06FF]/.test(extractMdText(node));
}
function isArabicText(text: string): boolean {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  return arabicChars / Math.max(text.replace(/\s/g, "").length, 1) > 0.35;
}
// Returns true when Arabic chars make up the majority (>35%) of the node's text.
// Used to decide bullet-point alignment: right for Arabic-heavy items, left otherwise.
function isMajorityArabic(node: any): boolean {
  return isArabicText(extractMdText(node));
}

// ── Inline Arabic wrapper ─────────────────────────────────────────────────────
// Matches contiguous Arabic character sequences (incl. harakat + spaces between words)
const AR_RUN_RE = /([\u0600-\u06FF\u064B-\u065F\uFB50-\uFDFF\uFE70-\uFEFF][\u0600-\u06FF\u064B-\u065F\uFB50-\uFDFF\uFE70-\uFEFF\s]*[\u0600-\u06FF\u064B-\u065F\uFB50-\uFDFF\uFE70-\uFEFF]|[\u0600-\u06FF\u064B-\u065F\uFB50-\uFDFF\uFE70-\uFEFF]+)/g;

/**
 * Split a plain string into alternating Latin and Arabic segments.
 * Arabic segments are wrapped in a styled <span dir="rtl">.
 */
function wrapArabicRuns(text: string, baseKey = 0): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = baseKey;
  AR_RUN_RE.lastIndex = 0;
  while ((m = AR_RUN_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const ar = m[0].trim();
    if (ar) {
      nodes.push(
        <span
          key={k++}
          dir="rtl"
          style={{ fontFamily: "'Amiri', serif", fontSize: "1.1em", lineHeight: "1.9", display: "inline-block", verticalAlign: "middle" }}
        >
          {ar}
        </span>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/**
 * Recursively walk React children and wrap Arabic text runs in styled spans.
 * Only processes string children — React element children are cloned with
 * processed children. Handles arrays, single elements, and plain strings.
 */
function wrapChildrenArabic(children: React.ReactNode, depth = 0): React.ReactNode {
  if (depth > 5) return children; // guard against deep recursion
  if (typeof children === "string") {
    if (!/[\u0600-\u06FF]/.test(children)) return children;
    const nodes = wrapArabicRuns(children);
    return nodes.length === 1 ? nodes[0] : <>{nodes}</>;
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === "string" && /[\u0600-\u06FF]/.test(child)) {
        const nodes = wrapArabicRuns(child, i * 100);
        return nodes.length === 1 ? nodes[0] : <React.Fragment key={i}>{nodes}</React.Fragment>;
      }
      if (React.isValidElement(child)) {
        const el = child as React.ReactElement<any>;
        if (/[\u0600-\u06FF]/.test(extractMdText(el.props?.children))) {
          return React.cloneElement(el, { key: i, children: wrapChildrenArabic(el.props.children, depth + 1) } as any);
        }
      }
      return child;
    });
  }
  if (React.isValidElement(children)) {
    const el = children as React.ReactElement<any>;
    if (/[\u0600-\u06FF]/.test(extractMdText(el.props?.children))) {
      return React.cloneElement(el, { children: wrapChildrenArabic(el.props.children, depth + 1) } as any);
    }
  }
  return children;
}

// Extract plain text from an mdast AST node (for rowspan computation)
function extractMdastText(node: any): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  if (node.children) return (node.children as any[]).map(extractMdastText).join("");
  return "";
}

// Render mdast inline nodes as React (handles bold, italic, text)
function renderMdastInline(node: any, key: number): React.ReactNode {
  if (!node) return null;
  if (node.type === "text") return node.value;
  const kids = () =>
    (node.children ?? []).map((c: any, i: number) => (
      <span key={i}>{renderMdastInline(c, i)}</span>
    ));
  if (node.type === "strong")
    return <strong key={key} className="font-bold text-foreground">{kids()}</strong>;
  if (node.type === "emphasis")
    return <em key={key} className="italic">{kids()}</em>;
  if (node.type === "inlineCode")
    return <code key={key} className="font-mono bg-muted/60 px-1 rounded">{node.value}</code>;
  return <span key={key}>{kids()}</span>;
}

const MD_COMPONENTS = {
  br: () => <br />,
  p: ({ children }: any) => {
    const text = extractMdText(children);
    if (/^reading\s*\(latin\)\s*:/i.test(text.trim())) {
      const value = text.replace(/^reading\s*\(latin\)\s*:\s*/i, "").trim();
      return (
        <p dir="ltr" className="text-sm text-sky-400 italic my-1 text-left" style={{ fontFamily: "'SF Pro Display', sans-serif" }}>
          🔊 {value}
        </p>
      );
    }
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    if (!hasArabic) {
      return <p className="mb-5 last:mb-0 break-words leading-[1.75] text-foreground/90">{children}</p>;
    }
    // Majority Arabic (standalone ayat/dalil) → full RTL paragraph
    if (isArabicText(text)) {
      return (
        <p dir="rtl" className="mb-5 last:mb-0 break-words text-foreground/90 text-right"
          style={{ lineHeight: "2.2", fontFamily: "'Amiri', serif", fontSize: "1.05em" }}>
          {children}
        </p>
      );
    }
    // Mixed paragraph — keep LTR, wrap Arabic runs inline
    return (
      <p className="mb-5 last:mb-0 break-words leading-[1.75] text-foreground/90">
        {wrapChildrenArabic(children)}
      </p>
    );
  },
  strong: ({ children }: any) => {
    const hasArabic = /[\u0600-\u06FF]/.test(extractMdText(children));
    return (
      <strong className="font-bold text-foreground">
        {hasArabic ? wrapChildrenArabic(children) : children}
      </strong>
    );
  },
  em: ({ children }: any) => {
    const text = [children].flat().map((c: any) => (typeof c === "string" ? c : "")).join("");
    if (/^\(cara baca:/i.test(text)) {
      const pronunciation = text.replace(/^\(cara baca:\s*/i, "").replace(/\)$/, "").trim();
      return (
        <em dir="ltr" className="not-italic text-sky-400 block mt-1 text-left" style={{ fontFamily: "'SF Pro Display', sans-serif" }}>
          🔊 {pronunciation}
        </em>
      );
    }
    // Always LTR so Arabic-adjacent italic text (Artinya, transliteration) stays left-aligned
    return <em dir="ltr" className="italic text-white text-left" style={{ fontFamily: "'SF Pro Display', sans-serif" }}>{children}</em>;
  },
  ul: ({ children }: any) => (
    <ListTypeContext.Provider value="ul">
      <ul className="mb-5 last:mb-0 pl-1 space-y-2 text-foreground/90 list-none">{children}</ul>
    </ListTypeContext.Provider>
  ),
  ol: ({ children, start }: any) => (
    <ListTypeContext.Provider value="ol">
      <ol start={start ?? 1} className="mb-5 last:mb-0 ml-5 list-decimal space-y-2 text-foreground/90">{children}</ol>
    </ListTypeContext.Provider>
  ),
  li: ({ children }: any) => {
    const listType = useContext(ListTypeContext);
    const isOrdered = listType === "ol";
    const liText = extractMdText(children);
    const majorityArabic = isArabicText(liText);
    const hasInlineArabic = !majorityArabic && /[\u0600-\u06FF]/.test(liText);

    if (isOrdered) {
      return (
        <li className="leading-[1.75] break-words pl-1">
          {majorityArabic
            ? <span dir="rtl" className="block text-right" style={{ lineHeight: "2.0" }}>{children}</span>
            : hasInlineArabic
              ? wrapChildrenArabic(children)
              : children}
        </li>
      );
    }

    // Unordered: bullet on RIGHT for Arabic-majority items, LEFT for Latin/Indonesian items
    if (majorityArabic) {
      return (
        <li className="flex flex-row-reverse gap-3 items-start" style={{ lineHeight: "2.0" }}>
          <span className="shrink-0 mt-[0.5em] h-[5px] w-[5px] rounded-full bg-primary/60" aria-hidden />
          <span className="flex-1 min-w-0 break-words text-right" dir="rtl">{children}</span>
        </li>
      );
    }

    return (
      <li className="flex gap-3 items-start leading-[1.75]">
        <span className="shrink-0 mt-[0.5em] h-[5px] w-[5px] rounded-full bg-primary/60" aria-hidden />
        <span className="flex-1 min-w-0 break-words">
          {hasInlineArabic ? wrapChildrenArabic(children) : children}
        </span>
      </li>
    );
  },
  h1: ({ children }: any) => {
    const ar = containsArabic(children);
    return (
      <h1
        dir="auto"
        className="mb-3 mt-6 first:mt-0 text-2xl font-bold text-foreground tracking-tight border-b border-border pb-1.5"
        style={{ fontFamily: ar ? undefined : "'SF Pro Display', sans-serif", lineHeight: ar ? "1.8" : "1.3" }}
      >
        {children}
      </h1>
    );
  },
  h2: ({ children }: any) => {
    const ar = containsArabic(children);
    return (
      <h2
        dir="auto"
        className="mb-2 mt-5 first:mt-0 text-xl font-bold text-foreground tracking-tight"
        style={{ fontFamily: ar ? undefined : "'SF Pro Display', sans-serif", lineHeight: ar ? "1.8" : "1.35" }}
      >
        {children}
      </h2>
    );
  },
  h3: ({ children }: any) => {
    const ar = containsArabic(children);
    return (
      <h3
        dir="auto"
        className="mb-2 mt-4 first:mt-0 text-base font-semibold text-foreground/90"
        style={{ fontFamily: ar ? undefined : "'SF Pro Display', sans-serif", lineHeight: ar ? "1.8" : "1.4" }}
      >
        {children}
      </h3>
    );
  },
  h4: ({ children }: any) => {
    return (
      <h4
        dir="auto"
        className="mb-1 mt-5 first:mt-0 flex items-center gap-2 text-sm font-bold tracking-widest uppercase text-primary/60"
      >
        <span className="h-px flex-1 bg-primary/15 max-w-[18px] rounded-full shrink-0" />
        {children}
        <span className="h-px flex-1 bg-primary/15 rounded-full shrink-0" />
      </h4>
    );
  },
  code: ({ children, className }: any) => {
    if (className?.includes("language-")) return <code className={className}>{children}</code>;
    return (
      <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px] text-primary/90 break-all">{children}</code>
    );
  },
  pre: ({ children }: any) => (
    <div dir="ltr" className="mb-4 overflow-x-auto rounded-xl bg-muted border border-border">
      <pre className="p-4 font-mono text-sm text-foreground leading-relaxed">{children}</pre>
    </div>
  ),
  blockquote: ({ children }: any) => {
    if (containsArabic(children)) {
      // Split children into two groups:
      // - arabicRows: paragraphs where Arabic chars are majority → top section, RTL right-aligned
      // - latinRows:  paragraphs where Latin/Indonesian is majority → bottom section, LTR left-aligned
      // Using isMajorityArabic prevents stray Arabic words in translations from flipping direction.
      const arabicRows: React.ReactNode[] = [];
      const latinRows: React.ReactNode[] = [];
      Children.forEach(children, (child: any) => {
        if (!isValidElement(child)) return;
        if (isMajorityArabic(child)) {
          arabicRows.push(
            cloneElement(child as Parameters<typeof cloneElement>[0], {
              dir: "rtl",
              style: {
                textAlign: "left",
                fontFamily: "'Amiri', serif",
                lineHeight: "2.0",
                marginBottom: 0,
              },
            } as any)
          );
        } else {
          latinRows.push(
            cloneElement(child as Parameters<typeof cloneElement>[0], {
              dir: "ltr",
              style: { textAlign: "left", fontSize: "0.9em", marginBottom: 0 },
            } as any)
          );
        }
      });

      return (
        <blockquote className="mt-3 mb-4 rounded-xl border border-emerald-500/50 bg-emerald-950/40 overflow-hidden text-foreground shadow-sm shadow-emerald-900/20">
          {/* ── Arabic section ── */}
          {arabicRows.length > 0 && (
            <div className={`px-5 pt-4 pb-3 space-y-2${latinRows.length > 0 ? " border-b border-emerald-500/20" : " pb-4"}`}>
              {arabicRows}
            </div>
          )}
          {/* ── Cara baca + Artinya section ── */}
          {latinRows.length > 0 && (
            <div dir="ltr" className="px-5 pt-3 pb-4 space-y-2 text-left">
              {latinRows}
            </div>
          )}
        </blockquote>
      );
    }
    return (
      <blockquote className="mb-4 border-l-[3px] border-primary/40 pl-4 text-foreground/70 italic">{children}</blockquote>
    );
  },
  hr: () => (
    <div className="my-4 flex items-center gap-3">
      <span className="flex-1 h-px bg-border/40" />
      <span className="w-1 h-1 rounded-full bg-border/60" />
      <span className="flex-1 h-px bg-border/40" />
    </div>
  ),
  a: ({ href, children }: any) => {
    const isGoogleMaps = href && (
      href.includes("google.com/maps") ||
      href.includes("maps.google.com") ||
      href.includes("goo.gl/maps") ||
      href.includes("maps.app.goo.gl")
    );
    if (isGoogleMaps) {
      const label = typeof children === "string"
        ? children.replace(/^📍\s*/, "").trim()
        : "Lihat di Maps";
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 my-1 px-3 py-2 rounded-lg border border-green-500/30 bg-green-500/8 hover:bg-green-500/15 transition-colors text-green-600 dark:text-green-400 text-sm font-medium no-underline"
        >
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>{label}</span>
          <span className="text-xs text-green-500/70 ml-1">↗ Google Maps</span>
        </a>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors break-all"
      >
        {children}
      </a>
    );
  },
  table: ({ node }: any) => {
    // node is a hast element: <table> → children: [thead?, tbody?]
    const kids: any[] = node?.children ?? [];
    const theadNode = kids.find((c: any) => c.tagName === "thead");
    const tbodyNode = kids.find((c: any) => c.tagName === "tbody");

    const getTrChildren = (parent: any) =>
      (parent?.children ?? []).filter((c: any) => c.tagName === "tr");
    const getCells = (row: any) =>
      (row?.children ?? []).filter((c: any) => c.tagName === "th" || c.tagName === "td");

    const headerRows = getTrChildren(theadNode);
    const bodyRows = getTrChildren(tbodyNode);

    // Extract plain text from a hast node tree
    function hastText(n: any): string {
      if (!n) return "";
      if (n.type === "text") return n.value ?? "";
      if (n.children) return (n.children as any[]).map(hastText).join("");
      return "";
    }

    // Render a hast node tree to React (bold, italic, text, etc.)
    function renderHast(n: any, key: number): React.ReactNode {
      if (!n) return null;
      if (n.type === "text") return n.value;
      if (n.type === "element") {
        const ch = (n.children ?? []).map((c: any, i: number) => renderHast(c, i));
        if (n.tagName === "strong" || n.tagName === "b")
          return <strong key={key} className="font-bold text-foreground">{ch}</strong>;
        if (n.tagName === "em" || n.tagName === "i")
          return <em key={key} className="italic">{ch}</em>;
        if (n.tagName === "code")
          return <code key={key} className="font-mono bg-muted/60 px-1 rounded text-xs">{ch}</code>;
        if (n.tagName === "a")
          return <a key={key} href={n.properties?.href} className="text-primary underline underline-offset-2">{ch}</a>;
        return <span key={key}>{ch}</span>;
      }
      return null;
    }

    const renderCellContent = (cell: any) =>
      (cell?.children ?? []).map((c: any, i: number) => renderHast(c, i));

    // Compute rowSpans from body cell texts
    const cellTexts: string[][] = bodyRows.map((row: any) =>
      getCells(row).map((cell: any) => hastText(cell).trim())
    );
    const numCols = Math.max(...bodyRows.map((r: any) => getCells(r).length), 0);
    const rowSpans: number[][] = cellTexts.map(() => new Array(numCols).fill(1));
    const skip: boolean[][] = cellTexts.map(() => new Array(numCols).fill(false));

    for (let col = 0; col < numCols; col++) {
      let i = 0;
      while (i < cellTexts.length) {
        const val = cellTexts[i]?.[col] ?? "";
        if (!val) { i++; continue; }
        let j = i + 1;
        while (j < cellTexts.length && (cellTexts[j]?.[col] ?? "") === val) j++;
        rowSpans[i][col] = j - i;
        for (let k = i + 1; k < j; k++) skip[k][col] = true;
        i = j;
      }
    }

    // Detect column roles by header text for special styling
    const headerTexts = headerRows.flatMap((row: any) =>
      getCells(row).map((cell: any) => hastText(cell).toLowerCase().trim())
    );
    const isDateCol = (ci: number) => /tanggal|date|hari/.test(headerTexts[ci] ?? "");
    const isTimeCol = (ci: number) => /waktu|time|jam/.test(headerTexts[ci] ?? "");

    return (
      <div className="mb-5 -mx-1 sm:mx-0">
        {/* Scroll container — edge-to-edge on mobile, rounded on sm+ */}
        <div className="overflow-x-auto overscroll-x-contain rounded-xl sm:rounded-2xl border border-white/[0.08] shadow-lg shadow-black/30 bg-gradient-to-b from-zinc-900/80 to-zinc-950/90">
          <table className="min-w-max w-full text-[12px] sm:text-sm border-collapse">
            <thead>
              {headerRows.map((row: any, ri: number) => (
                <tr key={ri}>
                  {getCells(row).map((cell: any, ci: number) => {
                    const text = hastText(cell);
                    const ar = /[\u0600-\u06FF]/.test(text);
                    return (
                      <th key={ci} dir={ar ? "rtl" : undefined}
                        className="px-3 py-2.5 sm:px-4 sm:py-3 text-left text-[9px] sm:text-[10px] font-bold text-white/40 uppercase tracking-[0.10em] sm:tracking-[0.12em] whitespace-nowrap border-b border-white/[0.08] border-r border-r-white/[0.07] last:border-r-0 bg-white/[0.03]">
                        {renderCellContent(cell)}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {bodyRows.map((row: any, ri: number) => (
                <tr key={ri} className={`group transition-colors ${ri % 2 === 0 ? "bg-transparent" : "bg-white/[0.02]"} hover:bg-primary/5`}>
                  {getCells(row).map((cell: any, ci: number) => {
                    const isTime = isTimeCol(ci);
                    if (skip[ri]?.[ci] && !isTime) return null;
                    const text = hastText(cell);
                    const ar = /[\u0600-\u06FF]/.test(text);
                    const span = rowSpans[ri]?.[ci] ?? 1;
                    const isDate = isDateCol(ci);
                    const isSpanning = span > 1 && !isTime;

                    return (
                      <td key={ci}
                        rowSpan={isSpanning ? span : undefined}
                        dir={ar ? "rtl" : undefined}
                        className={[
                          "px-3 py-2 sm:px-4 sm:py-3 border-b border-white/5 align-middle",
                          "border-r border-white/[0.07] last:border-r-0",
                          ar ? "text-right" : "",
                        ].filter(Boolean).join(" ")}
                        style={ar ? { fontFamily: "'Amiri', serif", lineHeight: "2.0" } : undefined}
                      >
                        {isDate ? (
                          <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md sm:rounded-lg bg-primary/15 border border-primary/20 text-primary text-[10px] sm:text-xs font-semibold whitespace-nowrap">
                            <span className="w-1 h-1 rounded-full bg-primary/70 shrink-0 hidden sm:block" />
                            {renderCellContent(cell)}
                          </span>
                        ) : isTime ? (
                          <span className="inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md sm:rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-300 text-[10px] sm:text-xs font-mono font-medium whitespace-nowrap">
                            {renderCellContent(cell)}
                          </span>
                        ) : (
                          <span className={ar ? "text-emerald-300/90" : "text-foreground/85 font-medium"}>
                            {renderCellContent(cell)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  },
};

interface StreamingMsg {
  id: string;
  full: string;
  displayed: string;
  intent?: string;
  confidence?: string;
  sources?: string[];
  sourceMetadata?: SourceMetadata;
  suggestions?: string[];
  isStreaming?: boolean;
  kbImages?: string[];
}

const STREAM_CHARS_PER_TICK = 6;
const STREAM_INTERVAL_MS = 16;

const ChatArea = ({ onMenuClick, chatId, onChatCreated, onNewChat, initialMessage, onGoContributor, isAdmin }: ChatAreaProps) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const oldestTimestampRef = useRef<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [expandedImages, setExpandedImages] = useState<Set<string>>(new Set());
  const [streamingImagesExpanded, setStreamingImagesExpanded] = useState(false);
  const [dailyCount, setDailyCount] = useState<number | null>(null);
  const [subscriptionVisible, setSubscriptionVisible] = useState(false);
  const [isPaidUser, setIsPaidUser] = useState(false);
  const [userProfile, setUserProfile] = useState<Record<string, any> | null>(null);
  const [reportingMsgId, setReportingMsgId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<string>("");
  const [reportNote, setReportNote] = useState<string>("");
  const [reportedMsgIds, setReportedMsgIds] = useState<Set<string>>(new Set());
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<{ title: string; content: string } | null>(null);
  const mobileActionsRef = useRef<HTMLDivElement>(null);

  // Close mobile actions popover on Escape or outside click
  useEffect(() => {
    if (!mobileActionsOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileActionsOpen(false); };
    const onClick = (e: MouseEvent | TouchEvent) => {
      const node = mobileActionsRef.current;
      if (node && !node.contains(e.target as Node)) setMobileActionsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("touchstart", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("touchstart", onClick);
    };
  }, [mobileActionsOpen]);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [revisedAnswer, setRevisedAnswer] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [streamingMsg, setStreamingMsg] = useState<StreamingMsg | null>(null);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, "up" | "down">>(loadStoredFeedback);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [chatTitle, setChatTitle] = useState<string | null>(null);
  const [googleAvatar, setGoogleAvatar] = useState<string>("");
  const [welcomeSubtitle] = useState(() => getRandomSubtitle());
  const [timeGreeting]   = useState(() => getTimeGreeting());
  const [suggestionChips] = useState(() => getPersonalizedSuggestions());
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const lastUserMsgRef = useRef<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [copyAnim, setCopyAnim] = useState<{ x: number; y: number } | null>(null);
  const copyAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeChatIdRef   = useRef<string | null>(chatId);
  // Stop-generation refs — exposed so the Stop button can abort the current SSE stream
  const streamAbortRef  = useRef<AbortController | null>(null);
  const userStoppedRef  = useRef(false);
  const accumulatedRef  = useRef("");

  const scrollToBottom = useCallback((force = false) => {
    if (!force && !isAtBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleScrollContainer = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distFromBottom < 80;
    isAtBottomRef.current = atBottom;
    setShowScrollBtn(!atBottom);
  }, []);

  const forceScrollToBottom = useCallback(() => {
    isAtBottomRef.current = true;
    setShowScrollBtn(false);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);


  useEffect(() => {
    if (!isLoading) {
      setLoadingSeconds(0);
      return;
    }
    setLoadingSeconds(0);
    const interval = setInterval(() => {
      setLoadingSeconds(s => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isLoading]);

  // Smart auto-scroll during streaming — only if user is already at bottom
  useEffect(() => {
    scrollToBottom(false);
  }, [streamingMsg?.displayed, scrollToBottom]);

  // When chat resets or history loads, always scroll to bottom
  useEffect(() => {
    forceScrollToBottom();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // Load saved answer IDs so bookmark buttons can show the right state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) return;
      fetch("/api/saved-answers", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then(r => r.ok ? r.json() : [])
        .then((data: any[]) => {
          if (Array.isArray(data)) setSavedIds(new Set(data.map(s => s.message_id)));
        })
        .catch(() => {});
    });
  }, []);

  const toggleSave = async (msgId: string, content: string, sources?: string[], meta?: SourceMetadata) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const isSaved = savedIds.has(msgId);
    setSavedIds(prev => { const n = new Set(prev); isSaved ? n.delete(msgId) : n.add(msgId); return n; });

    if (isSaved) {
      fetch(`/api/saved-answers/${msgId}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {});
    } else {
      fetch("/api/saved-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ message_id: msgId, content, sources, source_summary: meta?.source_summary ?? null }),
      }).catch(() => {});
      // Also log as "saved" in answer_feedback for admin analytics
      fetch(`/api/messages/${msgId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ feedback_type: "saved", sources }),
      }).catch(() => {});
    }
  };

  /* ── Typewriter / stream finalizer ── */
  useEffect(() => {
    if (!streamingMsg) return;
    // While real SSE streaming is active, skip — the stream reader updates displayed directly
    if (streamingMsg.isStreaming) return;
    if (streamingMsg.displayed.length >= streamingMsg.full.length) {
      const committedId = streamingMsg.id;
      setMessages(prev => [...prev, {
        id: committedId,
        role: "assistant",
        content: streamingMsg.full,
        timestamp: new Date(),
        intent:         streamingMsg.intent,
        confidence:     streamingMsg.confidence,
        sources:        streamingMsg.sources,
        sourceMetadata: streamingMsg.sourceMetadata,
        suggestions:    streamingMsg.suggestions,
        kbImages:       streamingMsg.kbImages,
      }]);
      // Preserve expanded state across streaming → committed message transition
      if (streamingImagesExpanded && streamingMsg.kbImages?.length) {
        setExpandedImages(prev => new Set([...prev, committedId]));
      }
      setStreamingMsg(null);
      return;
    }
    const timer = setTimeout(() => {
      setStreamingMsg(prev => {
        if (!prev) return null;
        // Adaptive rate: smaller chunks for short remaining text (smoother),
        // larger chunks for long remaining (snappier finalization).
        const remaining = prev.full.length - prev.displayed.length;
        const adaptiveStep =
          remaining < 60   ? 2  :
          remaining < 200  ? 4  :
          remaining < 600  ? 6  :
          remaining < 1500 ? 8  : 12;
        const nextLen = Math.min(prev.displayed.length + adaptiveStep, prev.full.length);
        return { ...prev, displayed: prev.full.slice(0, nextLen) };
      });
    }, STREAM_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [streamingMsg]);

  useEffect(() => {
    activeChatIdRef.current = chatId;
    // Don't reset while a send is in-flight (e.g. new chat just created mid-send)
    if (isLoading) return;
    setMessages([]);
    setStreamingMsg(null);
    setError(null);
    setInput("");
    if (chatId) {
      loadMessages(chatId);
    } else {
      setChatTitle(null);
    }
  }, [chatId]); // eslint-disable-line react-hooks/exhaustive-deps

  const initialMessageFired = useRef(false);
  useEffect(() => {
    if (initialMessage && !initialMessageFired.current) {
      initialMessageFired.current = true;
      const timer = setTimeout(() => handleSend(initialMessage), 300);
      return () => clearTimeout(timer);
    }
  }, [initialMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Copy animation: show "Disalin ✓" badge near the selection when user copies text
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleCopy = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.toString().trim().length === 0) return;
      const range = sel.getRangeAt(0);
      const rect  = range.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      const x = rect.left + rect.width / 2 - cRect.left;
      const y = rect.top - cRect.top - 10;
      if (copyAnimTimerRef.current) clearTimeout(copyAnimTimerRef.current);
      setCopyAnim({ x, y });
      copyAnimTimerRef.current = setTimeout(() => setCopyAnim(null), 1800);
    };
    container.addEventListener("copy", handleCopy);
    return () => {
      container.removeEventListener("copy", handleCopy);
      if (copyAnimTimerRef.current) clearTimeout(copyAnimTimerRef.current);
    };
  }, []);

  // Fetch daily chat count, paid status, and user profile on mount
  useEffect(() => {
    const fetchDailyUsage = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const userId = session.user.id;

      // Parallel: fetch roles and profile
      const [rolesRes, profileRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("profiles").select("*").eq("user_id", userId).single(),
      ]);

      const paid = rolesRes.data?.some(r =>
        ["contributor", "senior_contributor", "admin"].includes(r.role)
      ) ?? false;
      setIsPaidUser(paid);

      if (profileRes.data) {
        setUserProfile(profileRes.data);
      }
      const gAvatar = session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || "";
      setGoogleAvatar(gAvatar);

      if (!paid) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("role", "user")
          .gte("created_at", todayStart.toISOString());
        setDailyCount(count ?? 0);
        if ((count ?? 0) >= DAILY_LIMIT) setLimitReached(true);

        // Fetch subscription visibility (controls Upgrade Pro button in limit modal)
        try {
          const cfg = await fetch("/api/payment/config").then(r => r.json());
          setSubscriptionVisible(cfg.subscription_visible === true);
        } catch {
          // silently ignore — subscription button stays hidden
        }
      }
    };
    fetchDailyUsage();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const PAGE_SIZE = 50;

  const loadMessages = async (id: string) => {
    setLoadingHistory(true);
    setHasOlderMessages(false);
    oldestTimestampRef.current = null;
    try {
      const [msgsRes, chatRes] = await Promise.all([
        supabase.from("messages").select("*").eq("chat_id", id)
          .order("created_at", { ascending: false }).limit(PAGE_SIZE),
        supabase.from("chats").select("title").eq("id", id).single(),
      ]);
      if (msgsRes.error) throw msgsRes.error;
      if (msgsRes.data) {
        const sorted = [...msgsRes.data].reverse();
        setHasOlderMessages(msgsRes.data.length === PAGE_SIZE);
        if (sorted.length > 0) oldestTimestampRef.current = sorted[0].created_at;
        setMessages(
          sorted.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: new Date(m.created_at),
            sources: (m.metadata as any)?.sources ?? [],
            intent: (m.metadata as any)?.intent ?? null,
            confidence: (m.metadata as any)?.confidence ?? null,
          }))
        );
      }
      if (chatRes.data?.title) setChatTitle(chatRes.data.title);
    } catch (err: any) {
      setError("Gagal memuat riwayat chat. Coba refresh halaman.");
    } finally {
      setLoadingHistory(false);
      requestAnimationFrame(() => forceScrollToBottom());
    }
  };

  const loadOlderMessages = async (id: string) => {
    if (!oldestTimestampRef.current || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const { data, error } = await supabase.from("messages").select("*")
        .eq("chat_id", id)
        .lt("created_at", oldestTimestampRef.current)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (error) throw error;
      if (data && data.length > 0) {
        const sorted = [...data].reverse();
        oldestTimestampRef.current = sorted[0].created_at;
        setHasOlderMessages(data.length === PAGE_SIZE);
        setMessages(prev => [
          ...sorted.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: new Date(m.created_at),
            sources: (m.metadata as any)?.sources ?? [],
            intent: (m.metadata as any)?.intent ?? null,
            confidence: (m.metadata as any)?.confidence ?? null,
          })),
          ...prev,
        ]);
      } else {
        setHasOlderMessages(false);
      }
    } catch {
      // silent
    } finally {
      setLoadingOlder(false);
    }
  };

  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  };

  const toggleVoice = async () => {
    // Stop recording if already active
    if (isListening) {
      (recognitionRef.current as MediaRecorder | null)?.stop();
      return;
    }

    // Request microphone access
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Izin mikrofon ditolak. Aktifkan akses mikrofon di browser.");
      return;
    }

    const chunks: BlobPart[] = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";
    const recorder = new MediaRecorder(stream, { mimeType });

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstart = () => setIsListening(true);
    recorder.onstop = async () => {
      setIsListening(false);
      stream.getTracks().forEach(t => t.stop());

      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size < 1000) {
        toast.error("Rekaman terlalu pendek. Tahan tombol mic dan bicara.");
        return;
      }

      // Convert to base64 and send to Whisper
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const resp = await fetch("/api/whisper", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.access_token ?? ""}`,
            },
            body: JSON.stringify({ audio: base64, mimeType: mimeType.split(";")[0] }),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || "Transkripsi gagal");
          }
          const { transcript } = await resp.json();
          if (transcript) {
            setInput(prev => (prev ? prev + " " + transcript : transcript));
            setTimeout(autoResize, 50);
          } else {
            toast.error("Tidak ada suara yang terdeteksi. Coba lagi.");
          }
        } catch (e: any) {
          toast.error(e.message || "Gagal memproses suara. Coba lagi.");
        }
      };
      reader.readAsDataURL(blob);
    };
    recorder.onerror = () => {
      setIsListening(false);
      stream.getTracks().forEach(t => t.stop());
      toast.error("Gagal merekam suara. Coba lagi.");
    };

    recognitionRef.current = recorder as any;
    recorder.start();
  };

  const submitReport = async (msgId: string, msgContent: string) => {
    if (!reportReason.trim() || submittingReport) return;
    setSubmittingReport(true);
    // Find the user message that immediately preceded the reported AI message
    const msgIndex = messages.findIndex(m => m.id === msgId);
    const precedingUserMsg = msgIndex > 0
      ? [...messages].slice(0, msgIndex).reverse().find(m => m.role === "user")
      : null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/report-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          message_id: msgId,
          message_content: msgContent,
          user_question: precedingUserMsg?.content ?? null,
          reason: reportReason,
          additional_note: reportNote.trim() || null,
          revised_answer: revisedAnswer.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Gagal mengirim laporan" }));
        throw new Error(err.error || "Gagal mengirim laporan");
      }
      const result = await res.json().catch(() => ({}));
      setReportedMsgIds(prev => new Set(prev).add(msgId));
      setReportingMsgId(null);
      setReportReason("");
      setReportNote("");
      setRevisedAnswer("");
      toast.success(result.has_revision
        ? "Laporan terkirim! Revisi kamu akan ditinjau admin sebelum masuk KB."
        : "Laporan berhasil dikirim");
    } catch (e: any) {
      toast.error(e.message || "Gagal mengirim laporan, coba lagi");
    } finally {
      setSubmittingReport(false);
    }
  };

  const submitFeedback = (msgId: string, vote: "up" | "down") => {
    setFeedbackMap(prev => {
      const next = { ...prev };
      const isToggleOff = prev[msgId] === vote;
      if (isToggleOff) {
        delete next[msgId];
      } else {
        next[msgId] = vote;
      }
      localStorage.setItem(FEEDBACK_STORE_KEY, JSON.stringify(next));

      // Fire-and-forget: send rating signals to backend
      if (!isToggleOff) {
        const msg = messages.find(m => m.id === msgId);
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session?.access_token) return;
          const token = session.access_token;
          // 1. Anonymized intel aggregate (for AI improvement analytics)
          fetch("/api/chat/rate", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              rating:      vote === "up" ? 1 : -1,
              intent:      msg?.intent     ?? null,
              confidence:  msg?.confidence ?? null,
              messageTs:   msg?.timestamp?.getTime() ?? Date.now(),
              // Self-improvement: send query text + source on thumbs-down so server can log bad responses
              ...(vote === "down" ? {
                query_text:  msg?.content   ?? null,
                source_used: msg?.sourceMetadata?.source_used ?? null,
              } : {}),
            }),
          }).catch(() => {});
          // 2. Identified signal — thumbs up only (admin can see who found it helpful)
          if (vote === "up") {
            fetch(`/api/messages/${msgId}/feedback`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                feedback_type: "helpful",
                intent:        msg?.intent     ?? null,
                confidence:    msg?.confidence ?? null,
                sources:       msg?.sources    ?? null,
              }),
            }).catch(() => {});
          }
        });
      }

      return next;
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!e.target) return;
    (e.target as HTMLInputElement).value = "";
    if (!file) return;

    const sizeKb = Math.round(file.size / 1024);
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf" || file.type === "text/plain";

    if (!isImage && !isPdf) {
      toast.error("Format tidak didukung. Gunakan gambar (JPG/PNG/WebP) atau PDF/TXT.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File terlalu besar. Maksimal 10 MB.");
      return;
    }

    if (isImage) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setAttachedFile({ type: "image", dataUrl, name: file.name, sizeKb });
      };
      reader.readAsDataURL(file);
    } else {
      setIsUploadingFile(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const authHeaders = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} as Record<string, string>;

        // Step 1: Get a presigned upload URL (small JSON request, no size limit issue)
        const urlRes = await fetch("/api/chat/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ filename: file.name }),
        });
        const urlJson = await urlRes.json().catch(() => ({ error: "Gagal mendapatkan URL upload" }));
        if (!urlRes.ok) throw new Error(urlJson.error || "Gagal mendapatkan URL upload");

        // Step 2: Upload file DIRECTLY to Supabase Storage (bypasses all proxy size limits)
        const uploadRes = await fetch(urlJson.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!uploadRes.ok) throw new Error(`Gagal mengupload file (${uploadRes.status}). Coba lagi.`);

        // Step 3: Server extracts text from Storage and returns it
        const extractRes = await fetch("/api/extract-from-storage", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ path: urlJson.path, filename: file.name }),
        });
        const data = await extractRes.json().catch(() => ({ error: `Gagal mengekstrak file (${extractRes.status})` }));
        if (!extractRes.ok) throw new Error(data.error || "Gagal membaca file");

        setAttachedFile({ type: "pdf", text: data.text, name: data.filename, sizeKb });
        toast.success(`File berhasil dibaca (${data.chars.toLocaleString()} karakter)`);
      } catch (e: any) {
        toast.error(e.message || "Gagal mengupload file");
      } finally {
        setIsUploadingFile(false);
      }
    }
  };

  const handleSend = async (text?: string) => {
    const userText = (text ?? input).trim();
    if ((!userText && !attachedFile) || isLoading) return;

    // Subtle haptic feedback on send — feels native on mobile
    if (navigator.vibrate) navigator.vibrate(8);

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      toast.error("Sesi login habis. Silakan refresh halaman dan login kembali.");
      setIsLoading(false);
      return;
    }

    // Block immediately if we already know the limit is reached
    if (!isPaidUser && limitReached) return;

    // Track last user message for regenerate
    if (userText) lastUserMsgRef.current = userText;

    const fileToSend = attachedFile;
    setInput("");
    setAttachedFile(null);
    setError(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userText || (fileToSend?.type === "pdf" ? `[PDF: ${fileToSend.name}]` : ""),
      timestamp: new Date(),
      ...(fileToSend?.type === "image" ? { imageDataUrl: fileToSend.dataUrl, fileName: fileToSend.name } : {}),
      ...(fileToSend?.type === "pdf" ? { fileName: fileToSend.name } : {}),
    };

    setMessages((prev) => [...prev, userMsg]);
    forceScrollToBottom();
    setIsLoading(true);

    let currentChatId = activeChatIdRef.current;

    try {
      if (!currentChatId) {
        const title = userText.length > 50 ? userText.slice(0, 50).trim() + "…" : userText;
        const { data: newChat, error: chatError } = await supabase
          .from("chats")
          .insert({ user_id: userId, title })
          .select()
          .single();
        if (chatError || !newChat) throw new Error("Gagal membuat chat baru");
        currentChatId = newChat.id;
        activeChatIdRef.current = currentChatId;
        setChatTitle(newChat.title);
        onChatCreated(newChat.id, newChat.title);
      }

      const allMessages = [...messages, userMsg];
      const history = allMessages.map((m) => ({ role: m.role, content: m.content }));

      // Build attached file payload for the API (image as dataUrl or PDF as extracted text)
      const attachedFilePayload = fileToSend
        ? fileToSend.type === "image"
          ? { type: "image", dataUrl: fileToSend.dataUrl, name: fileToSend.name }
          : { type: "pdf", text: fileToSend.text, name: fileToSend.name }
        : undefined;

      const controller = new AbortController();
      streamAbortRef.current = controller;
      userStoppedRef.current = false;
      accumulatedRef.current = "";
      const fetchTimeout = setTimeout(() => controller.abort(), 55000);
      let res: Response;
      try {
        res = await fetch(API_URL, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({
            messages: history,
            userProfile: { ...userProfile, ...getPersonalization() },
            ...(attachedFilePayload ? { attachedFile: attachedFilePayload } : {}),
          }),
        });
      } catch (fetchErr: any) {
        if (fetchErr.name === "AbortError") {
          throw new Error("Koneksi timeout. AI sedang sibuk, coba lagi dalam beberapa detik.");
        }
        throw new Error("Gagal terhubung ke server. Periksa koneksi internetmu.");
      } finally {
        clearTimeout(fetchTimeout);
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 429 && errData.limitReached) {
          setLimitReached(true);
          setDailyCount(DAILY_LIMIT);
          return;
        }
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      // ── Real SSE streaming ────────────────────────────────────────────────
      const msgId = (Date.now() + 1).toString();
      setIsLoading(false);
      setStreamingImagesExpanded(false);
      setStreamingMsg({ id: msgId, full: "", displayed: "", sources: [], isStreaming: true });

      const sseReader = res.body!.getReader();
      const sseDecoder = new TextDecoder();
      let sseBuffer = "";
      let accumulated = "";
      let doneEvent: Record<string, any> | null = null;

      try {
        outer: while (true) {
          const { done, value } = await sseReader.read();
          if (done) break;
          sseBuffer += sseDecoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            let evt: Record<string, any>;
            try { evt = JSON.parse(raw); } catch { continue; }

            if (evt.type === "chunk" && evt.content) {
              accumulated += evt.content;
              accumulatedRef.current = accumulated;
              setStreamingMsg(prev => prev
                ? { ...prev, full: accumulated, displayed: accumulated }
                : null
              );
            } else if (evt.type === "done") {
              doneEvent = evt;
              break outer;
            } else if (evt.type === "error") {
              // Rate-limit error sent via SSE (headers already committed)
              if (evt.limitReached) {
                setLimitReached(true);
                setDailyCount(DAILY_LIMIT);
                setStreamingMsg(null);
                return;
              }
              // If we already have partial content, use it instead of erroring
              if (accumulated.trim().length > 40) {
                doneEvent = { reply: accumulated, sources: [], partial: true };
                break outer;
              }
              // Otherwise surface a friendly fallback — still break cleanly
              doneEvent = {
                reply: evt.error ?? "Sepertinya ada gangguan jaringan sesaat. Coba kirim ulang pesanmu ya — biasanya langsung berhasil.",
                sources: [], model: "error-fallback", intent: "casual",
                confidence: "low", source_used: "Model",
                sourceMetadata: { confidence: "low", primary_source: "Model",
                  sources_used: [], may_be_outdated: false, source_summary: null },
              };
              break outer;
            }
          }
        }
      } catch (streamErr: any) {
        if (streamErr.name !== "AbortError") setStreamingMsg(null);
        throw streamErr;
      }

      if (!doneEvent) {
        if (accumulated.trim()) {
          doneEvent = { reply: accumulated, sources: [], partial: true };
        } else {
          setStreamingMsg(null);
          throw new Error("Koneksi ke AI terputus sebelum menerima jawaban. Coba kirim ulang.");
        }
      }

      const finalContent = cleanMarkdown(doneEvent.reply || accumulated);

      // Save user message to DB
      await supabase.from("messages").insert({
        chat_id: currentChatId,
        user_id: userId,
        role: "user",
        content: userText,
      });

      // Increment daily count
      setDailyCount(prev => {
        const next = (prev ?? 0) + 1;
        if (!isPaidUser && next >= DAILY_LIMIT) setLimitReached(true);
        return next;
      });

      // Signal first chat sent — used by announcement popup trigger
      window.dispatchEvent(new CustomEvent("aina:first_chat"));

      // Save assistant reply to DB (with metadata for source badge persistence)
      await supabase.from("messages").insert({
        chat_id: currentChatId,
        user_id: userId,
        role: "assistant",
        content: doneEvent.reply || accumulated,
        metadata: {
          intent: doneEvent.intent ?? null,
          confidence: doneEvent.confidence ?? null,
          sources: doneEvent.sources ?? [],
        },
      });

      // Self-learning: notify user when their clarification was queued for admin review
      if (doneEvent.clarification_pending) {
        toast.info("Koreksimu sudah dikirim ke admin untuk ditinjau. Terima kasih sudah membantu AINA belajar!", {
          duration: 6000,
          icon: "💬",
        });
      }

      // Finalize streaming message with metadata — typewriter will commit it to messages
      setStreamingMsg(prev => prev ? {
        ...prev,
        full:           finalContent,
        displayed:      finalContent,
        intent:         doneEvent!.intent,
        confidence:     doneEvent!.confidence,
        sources:        doneEvent!.sources ?? [],
        citation_urls:  doneEvent!.citation_urls ?? [],
        sourceMetadata: doneEvent!.sourceMetadata ?? undefined,
        suggestions:    doneEvent!.suggestions ?? [],
        isStreaming:    false,
        kbImages:       (doneEvent as any).kb_images ?? [],
      } : null);

      await supabase
        .from("chats")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", currentChatId);
    } catch (err: any) {
      if (err.name === "AbortError") {
        // User manually stopped — commit partial text as final message if any
        const partial = accumulatedRef.current.trim();
        if (partial) {
          setMessages(prev => [...prev, {
            id: (Date.now() + 2).toString(),
            role: "assistant",
            content: cleanMarkdown(partial),
            timestamp: new Date(),
            sources: [],
          }]);
        }
        setStreamingMsg(null);
      } else {
        // Show a friendly message inside the chat instead of a cold error banner
        const FRIENDLY_ERRORS = [
          "Kayaknya ada gangguan jaringan sebentar. Coba kirim ulang pesanmu ya.",
          "Ada sedikit masalah teknis. Tenang, coba kirim ulang dan biasanya langsung berhasil.",
          "Koneksi ke AI lagi tidak stabil. Coba kirim ulang pertanyaanmu.",
        ];
        const friendly = FRIENDLY_ERRORS[Math.floor(Math.random() * FRIENDLY_ERRORS.length)];
        setMessages(prev => [...prev, {
          id: (Date.now() + 2).toString(),
          role: "assistant" as const,
          content: friendly,
          timestamp: new Date(),
          sources: [],
        }]);
      }
    } finally {
      streamAbortRef.current = null;
      setIsLoading(false);
    }
  };

  const handleStopGeneration = useCallback(() => {
    userStoppedRef.current = true;
    streamAbortRef.current?.abort();
  }, []);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend();
  };

  const isEmpty = messages.length === 0;

  const exportChat = () => {
    if (!messages.length) return;
    const date = new Date().toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" });
    const firstUser = messages.find(m => m.role === "user");
    const firstContent = firstUser?.content ?? "";
    const title = firstContent ? firstContent.slice(0, 60).replace(/\n/g, " ") : "Chat";
    const lines: string[] = [
      "AINA — Ekspor Percakapan",
      `Tanggal : ${date}`,
      `Topik   : ${title}${firstContent.length > 60 ? "…" : ""}`,
      "=".repeat(55),
      "",
    ];
    for (const m of messages) {
      const speaker = m.role === "user" ? "Kamu" : "AINA";
      const ts = m.timestamp ? new Date(m.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";
      lines.push(`[${speaker}${ts ? "  " + ts : ""}]`);
      if (m.fileName) lines.push(`📎 ${m.fileName}`);
      lines.push(m.content || "");
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `aina-chat-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Percakapan berhasil diekspor");
  };

  return (
    <div className="relative flex h-full flex-col bg-background">
      {/* Mobile top header */}
      <header
        className="md:hidden shrink-0 border-b border-border bg-background"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <button
            onClick={onMenuClick}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex flex-1 min-w-0 items-center justify-center gap-2 px-2">
            {chatTitle ? (
              <span className="truncate text-sm font-medium text-foreground max-w-[180px]">{chatTitle}</span>
            ) : (
              <>
                <AinaLogo className="h-7 w-7 object-contain" />
                <span className="font-sunspire text-lg tracking-wider text-foreground">AINA</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            {!isEmpty && (
              <button
                onClick={exportChat}
                title="Ekspor percakapan"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Download className="h-4.5 w-4.5" />
              </button>
            )}
            <button
              onClick={onNewChat}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Desktop header */}
      <header className="hidden md:flex shrink-0 items-center justify-between border-b border-border bg-background px-8 h-14">
        {/* Left: AINA branding */}
        <div className="flex items-center gap-2.5 w-40 shrink-0">
          <AinaLogo className="h-7 w-7 object-contain" />
          <span className="font-sunspire text-lg tracking-wider text-foreground">AINA</span>
        </div>

        {/* Center: chat title */}
        <div className="flex-1 flex items-center justify-center px-4 min-w-0">
          {chatTitle && (
            <span className="truncate text-sm font-semibold text-foreground max-w-md">
              {chatTitle}
            </span>
          )}
        </div>

        {/* Right: actions + avatar */}
        <div className="flex items-center gap-2 w-40 shrink-0 justify-end">
          {!isEmpty && (
            <>
              <button
                onClick={exportChat}
                title="Unduh percakapan"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Download className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  toast.success("Link disalin ke clipboard");
                }}
                title="Salin link percakapan"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Share2 className="h-4 w-4" />
              </button>
            </>
          )}
          {/* User avatar */}
          {(userProfile?.avatar_url || googleAvatar) ? (
            <img
              src={userProfile?.avatar_url || googleAvatar}
              alt="Profil"
              className="h-8 w-8 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center ring-1 ring-border">
              <span className="text-xs font-semibold text-primary">
                {(userProfile?.full_name || "U").charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Messages area or empty state */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScrollContainer}
        className="relative flex-1 overflow-y-auto overflow-x-hidden"
        onClick={(e) => {
          const tag = (e.target as HTMLElement).closest("a,button,input,textarea,select,label,[contenteditable]");
          if (!tag) textareaRef.current?.focus();
        }}
      >
        {/* Copy animation badge */}
        {copyAnim && (
          <div
            className="pointer-events-none absolute z-50 flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in zoom-in-75 duration-150"
            style={{ left: copyAnim.x, top: copyAnim.y, transform: "translate(-50%, -100%)" }}
          >
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2,6 5,9 10,3" />
            </svg>
            Disalin
          </div>
        )}

        {loadingHistory ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          </div>
        ) : isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center px-4 pb-16 select-none">
            <AinaLogo className="mb-4 h-10 w-10 object-contain drop-shadow-[0_0_18px_rgba(139,92,246,0.8)]" />
            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground text-center">
              {timeGreeting}{userProfile?.full_name ? `, ${userProfile.full_name.split(" ")[0]}` : ""}!
            </h1>
            <p className="mt-3 max-w-xs text-center text-base text-muted-foreground leading-relaxed">
              {welcomeSubtitle}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-md">
              {suggestionChips.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  className="rounded-full border border-border bg-secondary/60 px-4 py-2 text-sm text-muted-foreground transition-all hover:border-primary/40 hover:bg-secondary hover:text-foreground active:scale-95"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
          <div className="mx-auto w-full max-w-3xl xl:max-w-4xl space-y-8 px-4 py-8 md:px-8">
            {hasOlderMessages && chatId && (
              <div className="flex justify-center">
                <button
                  onClick={() => loadOlderMessages(chatId)}
                  disabled={loadingOlder}
                  className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-primary/30 disabled:opacity-50"
                >
                  {loadingOlder ? "Memuat..." : "Muat pesan sebelumnya"}
                </button>
              </div>
            )}
            {messages.map((msg, msgIdx) => {
              const isLastAI = msg.role === "assistant" && msgIdx === messages.length - 1 && !isLoading && !streamingMsg;
              const isArabicMsg = isArabicText(msg.content ?? "");
              return (
              <div
                key={msg.id}
                className={`flex gap-3 min-w-0 ${msg.role === "user" ? "animate-msg-in-user justify-end" : "animate-msg-in-ai justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <AinaLogo className="mt-1 h-7 w-7 shrink-0 object-contain" />
                )}

                {msg.role === "user" ? (
                  <div className="max-w-[85%] space-y-2">
                    {msg.imageDataUrl && (
                      <img
                        src={msg.imageDataUrl}
                        alt={msg.fileName ?? "Gambar"}
                        className="rounded-2xl max-h-72 object-contain border border-border"
                      />
                    )}
                    {msg.fileName && !msg.imageDataUrl && (
                      <div className="flex items-center gap-2 rounded-2xl border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground">
                        <FileText className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate max-w-[220px]">{msg.fileName}</span>
                      </div>
                    )}
                    {msg.content && (() => {
                      // Handle two formats:
                      //   Scraper: [KitabID:"uuid" Kitab:"Title"] question
                      //   Manual:  [Kitab: "Title"] question
                      const kitabIdFmt = msg.content.match(/^\[KitabID:"[^"]+"\s+Kitab:"([^"]+)"\]\s*/);
                      const kitabFmt   = !kitabIdFmt && msg.content.match(/^\[Kitab:\s*"([^"]+)"\]\s*/);
                      const kitabName  = kitabIdFmt ? kitabIdFmt[1] : (kitabFmt ? kitabFmt[1] : null);
                      const prefixMatch = kitabIdFmt || kitabFmt;
                      const displayContent = kitabName ? msg.content.slice(prefixMatch![0].length) : msg.content;
                      return (
                        <div className="space-y-1">
                          {kitabName && (
                            <div className="flex justify-end">
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 border border-primary/25 px-2.5 py-0.5 text-[10px] font-medium text-primary/80">
                                <BookOpen className="h-2.5 w-2.5 shrink-0" />
                                {kitabName}
                              </span>
                            </div>
                          )}
                          <div
                            className="rounded-3xl bg-secondary px-5 py-3.5 text-[15px] text-foreground whitespace-pre-wrap break-words"
                            dir="auto"
                          >
                            {displayContent}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="min-w-0 flex-1 min-h-0">
                    <div className="py-1.5 text-[15px] leading-[1.7]" dir="ltr">
                      {renderWithArabicBlocks(msg.content)}
                    </div>

                    {/* KB poster images — offer before showing */}
                    {msg.kbImages && msg.kbImages.length > 0 && (
                      <div className="mt-3">
                        {!expandedImages.has(msg.id) ? (
                          <button
                            onClick={() => setExpandedImages(prev => new Set([...prev, msg.id]))}
                            className="flex items-center gap-2 rounded-xl border border-border/50 bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-secondary/70 hover:text-foreground"
                          >
                            <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                            Lihat foto artikel ({msg.kbImages.length})
                          </button>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {msg.kbImages.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block rounded-xl overflow-hidden border border-border/50 hover:border-primary/40 transition-colors">
                                <img
                                  src={url}
                                  alt={`Foto artikel ${i + 1}`}
                                  className="max-h-56 max-w-full object-contain bg-black/10"
                                  onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
                                />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Source badges + confidence badge + freshness warning */}
                    {(() => {
                      if (msg.intent === "casual") return null;
                      const sources = msg.sources?.length ? msg.sources : extractSources(msg.content ?? "");
                      const confCfg = getConfidenceBadgeConfig(msg.sourceMetadata?.confidence);
                      const ConfIcon = confCfg?.icon;
                      return (sources.length > 0 || confCfg) ? (
                        <div className="mt-2 space-y-1 animate-action-in delay-150">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {sources.map((src, i) => {
                              const cfg = getSourceConfig(src);
                              const Icon = cfg.icon;
                              return (
                                <span
                                  key={i}
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.className}`}
                                >
                                  <Icon className="h-2.5 w-2.5 shrink-0" />
                                  <span>{cfg.label}</span>
                                </span>
                              );
                            })}
                            {isAdmin && confCfg && ConfIcon && (
                              <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${confCfg.className}`}>
                                <span className="text-muted-foreground/30">·</span>
                                <ConfIcon className="h-2.5 w-2.5 shrink-0" />
                                {confCfg.label}
                              </span>
                            )}
                          </div>
                          {msg.sourceMetadata?.may_be_outdated && (
                            <p className="text-[10px] text-amber-500/70 italic">
                              ⚠️ Info ini mungkin sudah berubah — cek ke sumber terbaru.
                            </p>
                          )}
                          {/* A2: Perplexity citation links */}
                          {msg.citation_urls && msg.citation_urls.length > 0 && (
                            <div className="flex flex-col gap-0.5 mt-0.5">
                              {msg.citation_urls.slice(0, 4).map((url, ci) => {
                                let hostname = url;
                                try { hostname = new URL(url).hostname.replace(/^www\./, ""); } catch {}
                                return (
                                  <a
                                    key={ci}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] text-primary/70 underline-offset-2 hover:text-primary hover:underline transition-colors truncate max-w-full"
                                  >
                                    <Globe className="h-2.5 w-2.5 shrink-0" />
                                    <span className="truncate">{hostname}</span>
                                  </a>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : null;
                    })()}

                    {/* Action row: copy + feedback (left) + report (right) */}
                    <div className="mt-2 flex items-center justify-between animate-action-in delay-200">
                      <div className="flex items-center gap-0.5">
                      {/* Copy button */}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(msg.content);
                          setCopiedMsgId(msg.id);
                          setTimeout(() => setCopiedMsgId(null), 2000);
                        }}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-muted-foreground/50 transition-colors hover:bg-secondary hover:text-muted-foreground"
                        title="Salin sebagai markdown"
                      >
                        {copiedMsgId === msg.id
                          ? <><Check className="h-3 w-3 text-green-500" /><span className="text-green-500">Tersalin</span></>
                          : <><Copy className="h-3 w-3" />Salin</>
                        }
                      </button>
                      {/* Thumbs up */}
                      <button
                        onClick={() => submitFeedback(msg.id, "up")}
                        className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] transition-colors hover:bg-secondary ${
                          feedbackMap[msg.id] === "up"
                            ? "text-green-500"
                            : "text-muted-foreground/50 hover:text-muted-foreground"
                        }`}
                        title="Jawaban membantu"
                      >
                        <ThumbsUp className="h-3 w-3" />
                      </button>
                      {/* Thumbs down */}
                      <button
                        onClick={() => submitFeedback(msg.id, "down")}
                        className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] transition-colors hover:bg-secondary ${
                          feedbackMap[msg.id] === "down"
                            ? "text-red-400"
                            : "text-muted-foreground/50 hover:text-muted-foreground"
                        }`}
                        title="Jawaban kurang membantu"
                      >
                        <ThumbsDown className="h-3 w-3" />
                      </button>
                      {/* Bookmark / Save */}
                      <button
                        onClick={() => toggleSave(msg.id, msg.content, msg.sources, msg.sourceMetadata)}
                        className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] transition-colors hover:bg-secondary ${
                          savedIds.has(msg.id)
                            ? "text-amber-500"
                            : "text-muted-foreground/50 hover:text-muted-foreground"
                        }`}
                        title={savedIds.has(msg.id) ? "Hapus dari tersimpan" : "Simpan jawaban ini"}
                      >
                        {savedIds.has(msg.id)
                          ? <BookmarkCheck className="h-3 w-3" />
                          : <Bookmark className="h-3 w-3" />
                        }
                      </button>
                      {/* Open in artifact panel — for long answers, tables, code, or large arabic blocks */}
                      {isArtifactWorthy(msg.content) && (
                        <button
                          onClick={() => setActiveArtifact({
                            title:   deriveArtifactTitle(msg.content),
                            content: msg.content,
                          })}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-muted-foreground/50 transition-colors hover:bg-secondary hover:text-primary"
                          title="Buka jawaban ini di panel besar (lebih nyaman dibaca)"
                        >
                          <FileText className="h-3 w-3" />
                          <span className="hidden sm:inline">Panel</span>
                        </button>
                      )}
                      </div>

                      {/* Report */}
                      <div>
                      {reportedMsgIds.has(msg.id) ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-500/70">
                          <Check className="h-3 w-3" /> Laporan terkirim
                        </span>
                      ) : reportingMsgId === msg.id ? (
                        <div className="w-full rounded-xl border border-border bg-card p-3 space-y-2.5">
                          <p className="text-xs font-medium text-foreground">Pilih alasan laporan:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {["Informasi tidak akurat", "Info sudah berubah", "Sumber tidak sesuai", "Jawaban tidak relevan", "Lainnya"].map(r => (
                              <button
                                key={r}
                                onClick={() => setReportReason(r)}
                                className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${reportReason === r ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                          {reportReason && (
                            <div className="space-y-2">
                              <div className="space-y-1">
                                <p className="text-[10px] text-muted-foreground">Catatan tambahan <span className="opacity-60">(opsional)</span></p>
                                <textarea
                                  value={reportNote}
                                  onChange={e => setReportNote(e.target.value)}
                                  placeholder="Tulis detail masalahnya di sini, contoh: angka yang salah, prosedur yang berubah, dll."
                                  rows={2}
                                  maxLength={400}
                                  className="w-full resize-none rounded-lg border border-input bg-secondary px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                />
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] text-muted-foreground">
                                  Kirim revisi ke KB <span className="opacity-60">(opsional — admin akan meninjau sebelum dipublish)</span>
                                </p>
                                <textarea
                                  value={revisedAnswer}
                                  onChange={e => setRevisedAnswer(e.target.value)}
                                  placeholder="Tuliskan jawaban yang lebih tepat di sini. Jika disetujui admin, akan masuk ke Knowledge Base AINA."
                                  rows={3}
                                  maxLength={5000}
                                  className="w-full resize-none rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                                />
                              </div>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button
                              disabled={!reportReason || submittingReport}
                              onClick={() => submitReport(msg.id, msg.content)}
                              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
                            >
                              {submittingReport ? <span className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" /> : <Flag className="h-3 w-3" />}
                              {revisedAnswer.trim() ? "Kirim + Usulkan Revisi" : "Kirim Laporan"}
                            </button>
                            <button
                              onClick={() => { setReportingMsgId(null); setReportReason(""); setReportNote(""); setRevisedAnswer(""); }}
                              className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Batal
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setReportingMsgId(msg.id); setReportReason(""); }}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-muted-foreground/50 transition-colors hover:bg-secondary hover:text-muted-foreground"
                        >
                          <Flag className="h-2.5 w-2.5" /> Laporkan
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Report hint — always visible below action row */}
                  {!reportedMsgIds.has(msg.id) && reportingMsgId !== msg.id && (
                    <p className="mt-1 pl-0.5 text-[10px] text-muted-foreground/35">
                      Jawaban tidak akurat? Gunakan 🚩 Laporkan di atas untuk membantu AINA berkembang.
                    </p>
                  )}

                  {/* Smart follow-up suggestion chips */}
                  {msg.suggestions && msg.suggestions.length > 0 && !isLoading && (
                    <div className="mt-3 flex flex-col gap-1.5 animate-action-in delay-300">
                      {msg.suggestions.map((sug, si) => (
                        <button
                          key={si}
                          onClick={() => !isLoading && handleSend(sug)}
                          disabled={isLoading}
                          className="group flex w-fit items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-3.5 py-2 text-[13px] text-foreground/80 transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]"
                        >
                          <Zap className="h-3 w-3 shrink-0 text-primary/60 group-hover:text-primary transition-colors" />
                          <span>{sug}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Regenerate — only on last AI message */}
                  {isLastAI && lastUserMsgRef.current && !isLoading && (
                    <div className="mt-2">
                      <button
                        onClick={() => handleSend(lastUserMsgRef.current)}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] text-muted-foreground/50 transition-colors hover:bg-secondary hover:text-muted-foreground"
                        title="Buat ulang jawaban"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Coba lagi
                      </button>
                    </div>
                  )}

                  </div>
                )}

              </div>
              );
            })}

            {/* Streaming typewriter bubble */}
            {streamingMsg && (
              <div className="flex gap-3 min-w-0 justify-start animate-msg-in-ai">
                <AinaLogo className={`mt-1 h-7 w-7 shrink-0 object-contain transition-all ${streamingMsg.isStreaming ? "animate-thinking-pulse" : ""}`} />
                <div className="min-w-0 flex-1" dir="ltr">
                  <div className={`py-1.5 text-[15px] leading-[1.7] transition-all ${streamingMsg.isStreaming ? "border-l-2 border-primary/25 pl-3" : ""}`}>
                    {renderWithArabicBlocks(cleanMarkdown(streamingMsg.displayed), false)}
                    {streamingMsg.isStreaming && (
                      <span className="inline-block h-[1em] w-[2px] rounded-full bg-primary animate-streaming-cursor align-middle ml-0.5" />
                    )}
                  </div>
                  {/* KB poster images — offer before showing, after streaming completes */}
                  {!streamingMsg.isStreaming && streamingMsg.kbImages && streamingMsg.kbImages.length > 0 && (
                    <div className="mt-3">
                      {!streamingImagesExpanded ? (
                        <button
                          onClick={() => setStreamingImagesExpanded(true)}
                          className="flex items-center gap-2 rounded-xl border border-border/50 bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-secondary/70 hover:text-foreground"
                        >
                          <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                          Lihat foto artikel ({streamingMsg.kbImages.length})
                        </button>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {streamingMsg.kbImages.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block rounded-xl overflow-hidden border border-border/50 hover:border-primary/40 transition-colors">
                              <img
                                src={url}
                                alt={`Foto artikel ${i + 1}`}
                                className="max-h-56 max-w-full object-contain bg-black/10"
                                onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
                              />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Stop button — visible while stream is active */}
                  {streamingMsg.isStreaming && (
                    <div className="mt-2">
                      <button
                        onClick={handleStopGeneration}
                        className="group flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-red-500/40 hover:bg-red-500/8 hover:text-red-400 transition-all"
                      >
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-red-400/60 animate-ping opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500/70" />
                        </span>
                        Hentikan
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {isLoading && (
              <div className="flex gap-3 animate-msg-in-ai">
                <AinaLogo className="mt-1 h-7 w-7 shrink-0 object-contain animate-thinking-pulse" />
                <div className="py-1.5">
                  <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card/70 px-4 py-2.5 w-fit shadow-sm">
                    <div className="flex items-center gap-[5px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/80 animate-thinking-dot" style={{ animationDelay: "0ms" }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/80 animate-thinking-dot" style={{ animationDelay: "200ms" }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/80 animate-thinking-dot" style={{ animationDelay: "400ms" }} />
                    </div>
                    <span className="text-[13px] text-muted-foreground/80 transition-all">
                      {loadingSeconds < 5
                        ? "AINA sedang berpikir..."
                        : loadingSeconds < 12
                        ? "Mencari informasi terkini..."
                        : `Sedang memproses... (${loadingSeconds}s)`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="break-words">{error}</span>
              </div>
            )}

            {/* Soft nudge — shown at 75% usage, dismissible */}
            {!isPaidUser && !limitReached && !nudgeDismissed && dailyCount !== null && dailyCount >= DAILY_NUDGE_AT && (
              <div className="flex items-start gap-3 rounded-2xl border border-violet-500/25 bg-violet-500/5 px-4 py-3">
                <Crown className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground/80">
                    Kamu hampir mencapai batas harian ({dailyCount}/{DAILY_LIMIT}).{" "}
                    <button
                      onClick={() => { setNudgeDismissed(false); onGoContributor ? onGoContributor() : navigate("/dashboard?tab=contributor"); }}
                      className="font-semibold text-violet-400 hover:text-violet-300 underline-offset-2 hover:underline"
                    >
                      Jadi Kontributor
                    </button>{" "}
                    untuk chat tanpa batas — cukup kirim 1 artikel.
                  </p>
                </div>
                <button onClick={() => setNudgeDismissed(true)} className="shrink-0 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {limitReached && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <p className="text-sm text-amber-300/90">
                  Batas {DAILY_LIMIT} chat gratis hari ini sudah habis.{" "}
                  <button
                    onClick={() => onGoContributor ? onGoContributor() : navigate("/dashboard?tab=contributor")}
                    className="font-semibold underline underline-offset-2 hover:text-amber-200"
                  >
                    Jadi Kontributor
                  </button>{" "}
                  untuk chat tanpa batas.
                </p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
          </>
        )}
      </div>

      {/* Scroll-to-bottom button — icon only, pinned bottom-right */}
      {showScrollBtn && (
        <div className="pointer-events-none absolute bottom-[88px] right-4 md:right-6 z-10">
          <button
            onClick={forceScrollToBottom}
            title="Lompat ke bawah"
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/95 shadow-md backdrop-blur-sm transition-colors hover:border-primary/40 hover:bg-secondary animate-scroll-btn-in"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
          </button>
        </div>
      )}

      {/* Limit Reached Modal */}
      {limitReached && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-3xl border border-border bg-card shadow-2xl overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-violet-600 via-purple-500 to-fuchsia-500" />
            <div className="p-6">
              {/* Header */}
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 shadow-lg shadow-purple-900/40">
                    <BookOpen className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Batas Harian Tercapai</p>
                    <p className="text-xs text-muted-foreground">{DAILY_LIMIT}/{DAILY_LIMIT} chat gratis hari ini</p>
                  </div>
                </div>
                <button
                  onClick={() => setLimitReached(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Progress bar — full */}
              <div className="mb-4 flex gap-1">
                {Array.from({ length: DAILY_LIMIT > 10 ? 10 : DAILY_LIMIT }).map((_, i) => (
                  <div key={i} className="h-1 flex-1 rounded-full bg-amber-500" />
                ))}
              </div>

              <p className="mb-5 text-sm text-muted-foreground leading-relaxed">
                Kamu sudah pakai <span className="font-semibold text-foreground">{DAILY_LIMIT} chat gratis</span> hari ini.
                Cara terbaik untuk lanjut? <span className="font-semibold text-foreground">Jadi Kontributor AINA</span> — gratis selamanya.
              </p>

              {/* Contributor CTA — primary */}
              <button
                onClick={() => { setLimitReached(false); onGoContributor ? onGoContributor() : navigate("/dashboard?tab=contributor"); }}
                className="group w-full rounded-2xl border border-purple-500/40 bg-gradient-to-br from-violet-600/15 to-purple-700/15 p-4 text-left transition-all hover:border-purple-500/70 hover:from-violet-600/25 hover:to-purple-700/25"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-purple-700">
                    <Crown className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">Jadi Kontributor AINA</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Kirim 1 artikel bermanfaat → chat tanpa batas selamanya</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-purple-400 group-hover:text-purple-300">
                    Daftar →
                  </span>
                </div>
              </button>

              {/* What contribution means */}
              <div className="mt-3 rounded-xl bg-secondary/60 px-3 py-2.5 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground/80">Apa itu kontribusi nyata?</p>
                <p>✦ Artikel tentang kehidupan Masisir yang belum ada di KB</p>
                <p>✦ Info administrasi, tips kuliah, atau pengalaman praktis</p>
                <p>✦ Direview admin sebelum disetujui — kualitas dijaga</p>
              </div>

              {/* Upgrade Pro — only shown when subscription is live */}
              {subscriptionVisible && (
                <button
                  onClick={() => { setLimitReached(false); navigate("/pricing"); }}
                  className="group mt-3 w-full rounded-2xl border border-border bg-secondary/40 p-3 text-left transition-all hover:border-border/80 hover:bg-secondary/70"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                      <Zap className="h-4 w-4 text-amber-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">Upgrade ke AINA Pro</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Chat tanpa batas dengan berlangganan</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground group-hover:text-foreground">Lihat harga →</span>
                  </div>
                </button>
              )}

              <p className="mt-3 text-center text-xs text-muted-foreground/60">
                Batas direset setiap 00.00 waktu Kairo (UTC+2)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Input bar — always at bottom */}
      <div className="pb-input-safe shrink-0 px-4 pt-2 md:px-8 md:pb-8">
        {limitReached ? (
          <div
            onClick={() => onGoContributor ? onGoContributor() : navigate("/dashboard?tab=contributor")}
            className="mx-auto flex max-w-3xl xl:max-w-4xl cursor-pointer items-center justify-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400 transition-colors hover:border-amber-500/40"
          >
            <Crown className="h-4 w-4 shrink-0 text-violet-400" />
            <span>Batas harian tercapai — <span className="font-semibold text-violet-400 underline-offset-2 hover:underline">Jadi Kontributor untuk chat tanpa batas</span></span>
          </div>
        ) : (
          <form onSubmit={handleFormSubmit} className="mx-auto max-w-3xl xl:max-w-4xl">
            {/* File preview above textarea */}
            {(attachedFile || isUploadingFile) && (
              <div className="mb-2 flex items-center gap-2 rounded-2xl border border-border bg-secondary/60 px-3 py-2">
                {isUploadingFile ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent shrink-0" />
                    <span className="text-xs text-muted-foreground">Membaca PDF...</span>
                  </>
                ) : attachedFile?.type === "image" ? (
                  <>
                    <img src={attachedFile.dataUrl} alt="preview" className="h-10 w-10 rounded-lg object-cover border border-border shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{attachedFile.name}</p>
                      <p className="text-[10px] text-muted-foreground">{attachedFile.sizeKb} KB · Gambar</p>
                    </div>
                    <button type="button" onClick={() => setAttachedFile(null)} className="ml-auto shrink-0 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : attachedFile?.type === "pdf" ? (
                  <>
                    <FileText className="h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{attachedFile.name}</p>
                      <p className="text-[10px] text-muted-foreground">{attachedFile.sizeKb} KB · PDF siap dianalisis</p>
                    </div>
                    <button type="button" onClick={() => setAttachedFile(null)} className="ml-auto shrink-0 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : null}
              </div>
            )}
            <div className="relative rounded-2xl border border-border bg-card shadow-sm transition-all focus-within:border-primary/50 focus-within:glow-purple-sm">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,.pdf,text/plain"
                className="hidden"
                onChange={handleFileChange}
              />

              {/* ── Mobile compact: "+" toggle + popover wrapper (hidden on sm+) ── */}
              <div ref={mobileActionsRef} className="sm:hidden">
                <button
                  type="button"
                  disabled={isLoading || isUploadingFile}
                  onClick={() => setMobileActionsOpen(v => !v)}
                  aria-expanded={mobileActionsOpen}
                  aria-label={mobileActionsOpen ? "Tutup menu aksi" : "Buka menu aksi (lampiran & suara)"}
                  className={`absolute left-3.5 bottom-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-secondary hover:text-foreground disabled:opacity-30 ${mobileActionsOpen ? "rotate-45 bg-secondary text-foreground" : ""}`}
                  title="Aksi tambahan"
                >
                  {isUploadingFile
                    ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    : <Plus className="h-4 w-4" />
                  }
                </button>

                {mobileActionsOpen && (
                  <div
                    role="menu"
                    className="absolute bottom-full left-2 mb-2 z-10 flex flex-col gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-xl animate-in slide-in-from-bottom-2 fade-in duration-150"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      disabled={isLoading || isUploadingFile}
                      onClick={() => { setMobileActionsOpen(false); fileInputRef.current?.click(); }}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-foreground transition-colors hover:bg-secondary disabled:opacity-30"
                    >
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      <span>Lampirkan file</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={isLoading}
                      onClick={() => { setMobileActionsOpen(false); toggleVoice(); }}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors disabled:opacity-30 ${isListening ? "bg-red-500/10 text-red-400" : "text-foreground hover:bg-secondary"}`}
                    >
                      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-muted-foreground" />}
                      <span>{isListening ? "Hentikan rekam" : "Input suara"}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* ── Desktop / sm+: Paperclip ── */}
              <button
                type="button"
                disabled={isLoading || isUploadingFile}
                onClick={() => fileInputRef.current?.click()}
                className="hidden sm:flex absolute left-3.5 bottom-3 h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
                title="Lampirkan gambar atau PDF"
              >
                {isUploadingFile
                  ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  : <Paperclip className="h-4 w-4" />
                }
              </button>

              <textarea
                ref={textareaRef}
                data-tour="chat-input"
                dir="auto"
                value={input}
                onChange={(e) => { setInput(e.target.value); autoResize(); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Tanya AINA!"
                rows={1}
                className={`w-full resize-none rounded-2xl bg-transparent px-5 py-4 pl-12 text-base text-foreground placeholder:text-muted-foreground focus:outline-none ${isListening ? "pr-24" : "pr-14 sm:pr-24"}`}
              />

              {/* ── Mic: hidden on mobile when not listening; always visible while listening as stop indicator ── */}
              <button
                type="button"
                onClick={toggleVoice}
                disabled={isLoading}
                className={`absolute right-[3.25rem] bottom-3 h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${
                  isListening
                    ? "flex text-red-400 animate-pulse hover:bg-red-500/10"
                    : "hidden sm:flex text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
                title={isListening ? "Berhenti merekam (kirim ke Whisper AI)" : "Input suara via Whisper AI (Indonesia / Arabic / lainnya)"}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>

              <button
                type="submit"
                disabled={isLoading || (!input.trim() && !attachedFile)}
                className="absolute right-3.5 bottom-3 flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-purple text-primary-foreground transition-all hover:opacity-80 active:scale-90 disabled:opacity-30"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground/50">
                AINA dapat membuat kesalahan. Periksa informasi penting.
              </p>
              {!isPaidUser && dailyCount !== null && (
                <button
                  type="button"
                  onClick={() => setLimitReached(true)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    dailyCount >= DAILY_LIMIT
                      ? "bg-red-500/10 text-red-400"
                      : dailyCount >= DAILY_NUDGE_AT
                      ? "bg-amber-500/10 text-amber-400"
                      : "bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                  title="Klik untuk info lebih lanjut"
                >
                  <Zap className="h-3 w-3" />
                  {dailyCount}/{DAILY_LIMIT} chat
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      {/* ── Artifact side panel ── */}
      <ArtifactPanel
        open={!!activeArtifact}
        title={activeArtifact?.title ?? ""}
        rawContent={activeArtifact?.content ?? ""}
        onClose={() => setActiveArtifact(null)}
      >
        {activeArtifact && renderWithArabicBlocks(cleanMarkdown(activeArtifact.content), false)}
      </ArtifactPanel>
    </div>
  );
};

export default ChatArea;
