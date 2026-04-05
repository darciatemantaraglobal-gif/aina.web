import { Zap, ListOrdered, BookOpen, List, MessageCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface ResponseStyleConfig {
  label: string;
  shortLabel: string;
  desc: string;
  icon: LucideIcon;
  promptKey: string;
}

export const RESPONSE_STYLES: Record<string, ResponseStyleConfig> = {
  short_direct: {
    label: "Ringkas",
    shortLabel: "Ringkas",
    desc: "Jawaban singkat, padat, langsung ke inti",
    icon: Zap,
    promptKey: "short_direct",
  },
  detailed_complete: {
    label: "Mendalam",
    shortLabel: "Mendalam",
    desc: "Penjelasan lengkap dan komprehensif",
    icon: BookOpen,
    promptKey: "detailed_complete",
  },
  practical_ready_to_use: {
    label: "Poin-poin",
    shortLabel: "Poin",
    desc: "Disusun dalam bullet points yang terstruktur",
    icon: List,
    promptKey: "practical_ready_to_use",
  },
  step_by_step: {
    label: "Panduan Langkah",
    shortLabel: "Langkah",
    desc: "Urutan bernomor yang jelas, mudah diikuti",
    icon: ListOrdered,
    promptKey: "step_by_step",
  },
  casual_easy_to_understand: {
    label: "Percakapan",
    shortLabel: "Santai",
    desc: "Gaya ngobrol santai, natural, mudah dicerna",
    icon: MessageCircle,
    promptKey: "casual_easy_to_understand",
  },
} as const;

export type ResponseStyleKey = keyof typeof RESPONSE_STYLES;

export const DEFAULT_RESPONSE_STYLE: ResponseStyleKey = "balanced";

export const RESPONSE_STYLE_ORDER: ResponseStyleKey[] = [
  "short_direct",
  "detailed_complete",
  "practical_ready_to_use",
  "step_by_step",
  "casual_easy_to_understand",
];

export function isValidResponseStyle(key: string): key is ResponseStyleKey {
  return key in RESPONSE_STYLES;
}
