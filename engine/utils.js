/**
 * api/engine/utils.js
 * Shared low-level utilities used across the AINA response engine.
 * No external dependencies — safe to import anywhere.
 */

import { createHash } from "crypto";

/**
 * Trim text to maxLen characters, cutting at the last sentence boundary
 * within the trailing 300 chars to avoid mid-sentence cuts.
 * Falls back to a hard cut + ellipsis if no boundary is found.
 */
export function trimToSentence(text, maxLen) {
  if (!text || text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const searchFrom = Math.max(0, cut.length - 300);
  const tail = cut.slice(searchFrom);
  const lastBoundary = Math.max(
    tail.lastIndexOf(". "), tail.lastIndexOf("! "), tail.lastIndexOf("? "),
    tail.lastIndexOf(".\n"), tail.lastIndexOf("!\n"), tail.lastIndexOf("?\n")
  );
  if (lastBoundary > 0) return cut.slice(0, searchFrom + lastBoundary + 1).trim();
  return cut.trim() + "…";
}

/**
 * One-liner queries that need no external enrichment.
 * Tested against the full query string before any external fetch is triggered.
 */
export const WIKI_SKIP_PATTERNS = /^(ok|oke|okay|iya|ya|yap|yep|haha|hehe|wkwk|lol|makasih|thanks|thank you|terima kasih|sip|siap|mantap|beres|done|good|great|nice|oke bro|sip bro|iyaa|ooh|ohh|wah|wow|hmm|hm|eh|ah|uh|gitu|gitu ya|gitu deh|paham|ngerti|mengerti|udah|sudah|lanjut|next|teruskan|lanjutkan)\b/i;

/**
 * Normalize a query string for deduplication:
 * lowercase, strip punctuation, collapse whitespace.
 * PRIVACY: result is hashed before storage — never stored as plain text.
 */
export function normalizeQuery(q) {
  return q.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * One-way SHA-256 hash — used as an anonymized dedup key for query patterns.
 * Never reversible. Never linked to user identity.
 */
export function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}
