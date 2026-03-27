import { Zap, ListOrdered, BookOpen, ClipboardList, MessageCircle } from "lucide-react";
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
    label: "Singkat & Langsung",
    shortLabel: "Singkat",
    desc: "Jawaban to the point, tanpa basa-basi",
    icon: Zap,
    promptKey: "short_direct",
  },
  step_by_step: {
    label: "Langkah demi Langkah",
    shortLabel: "Langkah",
    desc: "Panduan urut bernomor, mudah diikuti",
    icon: ListOrdered,
    promptKey: "step_by_step",
  },
  detailed_complete: {
    label: "Detail & Lengkap",
    shortLabel: "Detail",
    desc: "Penjelasan mendalam dengan konteks penuh",
    icon: BookOpen,
    promptKey: "detailed_complete",
  },
  practical_ready_to_use: {
    label: "Praktis & Siap Pakai",
    shortLabel: "Praktis",
    desc: "Checklist, template, atau aksi langsung",
    icon: ClipboardList,
    promptKey: "practical_ready_to_use",
  },
  casual_easy_to_understand: {
    label: "Santai & Mudah Dipahami",
    shortLabel: "Santai",
    desc: "Gaya ngobrol, ringan, mudah dicerna",
    icon: MessageCircle,
    promptKey: "casual_easy_to_understand",
  },
} as const;

export type ResponseStyleKey = keyof typeof RESPONSE_STYLES;

export const DEFAULT_RESPONSE_STYLE: ResponseStyleKey = "step_by_step";

export const RESPONSE_STYLE_ORDER: ResponseStyleKey[] = [
  "short_direct",
  "step_by_step",
  "detailed_complete",
  "practical_ready_to_use",
  "casual_easy_to_understand",
];

export function isValidResponseStyle(key: string): key is ResponseStyleKey {
  return key in RESPONSE_STYLES;
}
