/**
 * api/engine/historyOptimizer.js
 * Chat history compression and token-efficiency utilities for AINA long sessions.
 *
 * Problem: Conversation history grows linearly. Sending 20+ raw messages to the
 * model wastes thousands of tokens on context the model rarely needs.
 *
 * Solution: Keep only the last MAX_FULL_MESSAGES verbatim. Older messages are
 * compressed into a compact summary block injected as a system context note.
 * No AI call required — pure heuristic compression.
 */

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_FULL_MESSAGES   = 6;    // Recent messages kept verbatim (3 exchanges)
const MAX_SUMMARY_CHARS   = 600;  // Hard cap on the whole summary block
const SNIPPET_USER_CHARS  = 90;   // Per user-message snippet length in summary
const SNIPPET_AI_CHARS    = 130;  // Per AI-message snippet length (first sentence)

// Force-compress when prompt is very large regardless of message count
const TOKEN_FORCE_COMPRESS = 28_000; // ~98k chars → hard compress

// ── Token estimator ──────────────────────────────────────────────────────────

/**
 * Rough token count estimator.
 * Indonesian/Malay text runs ~3.5 chars per token on average (tiktoken approx).
 * Arabic is denser (~2.5 chars/token) but appears in minority — 3.2 avg is safe.
 *
 * @param {string} text
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  if (!text || typeof text !== "string") return 0;
  return Math.ceil(text.length / 3.2);
}

// ── Conversation summarizer ──────────────────────────────────────────────────

/**
 * Build a compact text summary of the supplied (older) messages.
 * Heuristic — no AI call. Each exchange is reduced to:
 *   - User turn  → first SNIPPET_USER_CHARS characters
 *   - AI turn    → first sentence, capped at SNIPPET_AI_CHARS characters
 *
 * The result is a plain-text bullet list injected as system context,
 * capped at MAX_SUMMARY_CHARS total.
 *
 * @param {Array<{role: string, content: string}>} olderMessages
 * @returns {string}
 */
export function summarizeConversation(olderMessages) {
  if (!Array.isArray(olderMessages) || olderMessages.length === 0) return "";

  const lines = [];

  for (const msg of olderMessages) {
    const content = (msg?.content ?? "").trim();
    if (!content) continue;

    if (msg.role === "user") {
      lines.push(`- User: ${content.slice(0, SNIPPET_USER_CHARS)}`);
    } else if (msg.role === "assistant") {
      // Extract just the first meaningful sentence to avoid injecting long answers
      const firstSentence = content.split(/(?<=[.!?\n])\s+/)[0]?.trim() ?? content;
      lines.push(`- AINA: ${firstSentence.slice(0, SNIPPET_AI_CHARS)}`);
    }
  }

  if (lines.length === 0) return "";

  const raw = lines.join("\n");
  if (raw.length <= MAX_SUMMARY_CHARS) return raw;

  // Hard-cap: truncate at last complete bullet point boundary
  const truncated = raw.slice(0, MAX_SUMMARY_CHARS);
  const lastNewline = truncated.lastIndexOf("\n-");
  return (lastNewline > 0 ? truncated.slice(0, lastNewline) : truncated).trim() + "\n[...]";
}

// ── History optimizer ────────────────────────────────────────────────────────

/**
 * Optimize the chat history array before sending to the model.
 *
 * Strategy:
 *   1. If messages.length <= maxFull → return as-is (no compression needed).
 *   2. Otherwise → compress older messages into a summary block; return last
 *      maxFull messages verbatim.
 *   3. Emergency path: if estimated total prompt tokens > TOKEN_FORCE_COMPRESS,
 *      further tighten by reducing maxFull to 4 regardless of param.
 *
 * @param {Array<{role: string, content: string}>} messages - Full conversation history
 * @param {number} maxFull - How many recent messages to keep verbatim (default: 6)
 * @returns {{
 *   trimmedMessages: Array,
 *   summarySystemBlock: string|null,
 *   stats: {
 *     original: number,
 *     kept: number,
 *     summarized: number,
 *     triggered: boolean,
 *     estimatedSavedTokens: number
 *   }
 * }}
 */
export function optimizeHistory(messages, maxFull = MAX_FULL_MESSAGES) {
  const empty = () => ({
    trimmedMessages:   messages ?? [],
    summarySystemBlock: null,
    stats: { original: messages?.length ?? 0, kept: messages?.length ?? 0, summarized: 0, triggered: false, estimatedSavedTokens: 0 },
  });

  if (!Array.isArray(messages) || messages.length === 0) return empty();
  if (messages.length <= maxFull) return empty();

  // Emergency tighten: if history alone is already enormous, squeeze harder
  const historyTokens = estimateTokens(messages.map(m => m.content ?? "").join("\n"));
  const effectiveMax = historyTokens > TOKEN_FORCE_COMPRESS ? Math.min(maxFull, 4) : maxFull;

  const olderMessages  = messages.slice(0, messages.length - effectiveMax);
  const recentMessages = messages.slice(messages.length - effectiveMax);

  const summary = summarizeConversation(olderMessages);
  const summarySystemBlock = summary
    ? `## Ringkasan Percakapan Sebelumnya (${olderMessages.length} pesan diringkas)\n${summary}`
    : null;

  const rawOlderText = olderMessages.map(m => m.content ?? "").join("\n");
  const estimatedSavedTokens = Math.max(0, estimateTokens(rawOlderText) - estimateTokens(summary));

  return {
    trimmedMessages: recentMessages,
    summarySystemBlock,
    stats: {
      original:             messages.length,
      kept:                 recentMessages.length,
      summarized:           olderMessages.length,
      triggered:            true,
      estimatedSavedTokens,
    },
  };
}

// ── Debug logger ─────────────────────────────────────────────────────────────

/**
 * Log a structured prompt-size debug report.
 * Only fires when AINA_DEBUG=true is set in the environment.
 *
 * @param {{
 *   systemPrompt: string,
 *   messages: Array,
 *   kbContext: string,
 *   webContext: string,
 *   model: string,
 *   historySummarized: boolean,
 *   kbArticleCount: number,
 * }} parts
 */
export function debugTokenReport(parts) {
  if (process.env.AINA_DEBUG !== "true") return;

  const sysTokens     = estimateTokens(parts.systemPrompt ?? "");
  const histTokens    = estimateTokens((parts.messages ?? []).map(m => m.content ?? "").join("\n"));
  const kbTokens      = estimateTokens(parts.kbContext ?? "");
  const webTokens     = estimateTokens(parts.webContext ?? "");
  const totalEstimate = sysTokens + histTokens;

  console.log(
    `[TOKEN-DEBUG] ` +
    `sys=${sysTokens}t | hist=${histTokens}t(${parts.messages?.length ?? 0}msgs) | ` +
    `kb=${kbTokens}t(${parts.kbArticleCount ?? 0}arts) | web=${webTokens}t | ` +
    `total≈${totalEstimate}t | model=${parts.model ?? "?"} | ` +
    `histSummarized=${parts.historySummarized ? "YES" : "no"}`
  );
}
