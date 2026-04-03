/**
 * api/engine/sourceOrchestrator.js
 * Source orchestration service for AINA's multi-layer retrieval pipeline.
 *
 * Lifecycle:
 *   Phase 1 (pre-fetch) : planSourceFetches()  — decide what to query before any network calls
 *   Phase 2 (post-fetch): buildSourceResult()  — assemble a rich SourceResult from fetched data
 *
 * ─── SourceResult schema ──────────────────────────────────────────────────────
 * {
 *   confidence:     "verified" | "community_based" | "web_result" | "fallback"
 *   primary_source: "pinned_update" | "kb_article" | "exchange_rate" | "dorar" |
 *                   "perplexity" | "wikipedia" | "duckduckgo" | "model_knowledge"
 *   sources_used:   SourceEntry[]
 *   may_be_outdated: boolean
 *   source_summary: string      // human-readable badge label (Indonesian)
 *   retrieved_at:   string      // ISO timestamp of response generation
 *   db_log_fields:  object      // ready to INSERT into source_logs table
 * }
 *
 * ─── SourceEntry schema ───────────────────────────────────────────────────────
 * {
 *   source_name:  string
 *   source_type:  "internal" | "api" | "web_search" | "encyclopedia" | "model"
 *   trust_score:  number (0-100)
 *   retrieved_at: string (ISO)
 *   updated_at:   string | null   // known freshness date, if available
 *   is_primary:   boolean
 * }
 *
 * ─── Recommended DB table: source_logs ────────────────────────────────────────
 * CREATE TABLE IF NOT EXISTS source_logs (
 *   id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id        UUID REFERENCES auth.users(id),
 *   query_hash     TEXT,            -- hash of the user message
 *   confidence     TEXT,            -- verified | community_based | web_result | fallback
 *   primary_source TEXT,
 *   sources_used   JSONB,           -- SourceEntry[]
 *   may_be_outdated BOOLEAN,
 *   intent_primary TEXT,
 *   kb_strength    TEXT,
 *   retrieved_at   TIMESTAMPTZ DEFAULT NOW()
 * );
 */

import { SOURCE_TRUST_SCORES } from "./sourcePriority.js";

/* ── SourceEntry factory ───────────────────────────────────────────────────── */

/**
 * @typedef {{ source_name: string, source_type: string, trust_score: number,
 *             retrieved_at: string, updated_at: string|null, is_primary: boolean }} SourceEntry
 */

/**
 * Build a single SourceEntry object.
 * @param {object} opts
 * @param {string}      opts.name
 * @param {"internal"|"api"|"web_search"|"encyclopedia"|"model"} opts.type
 * @param {string}      opts.key       - Key into SOURCE_TRUST_SCORES
 * @param {boolean}     [opts.primary]
 * @param {string|null} [opts.updatedAt]
 * @returns {SourceEntry}
 */
function makeEntry({ name, type, key, primary = false, updatedAt = null }) {
  return {
    source_name:  name,
    source_type:  type,
    trust_score:  SOURCE_TRUST_SCORES[key] ?? 0,
    retrieved_at: new Date().toISOString(),
    updated_at:   updatedAt,
    is_primary:   primary,
  };
}

/* ── Phase 1: Pre-fetch planning ──────────────────────────────────────────── */

/**
 * Decide which external sources to query before any network calls are made.
 * This is a pure-function decision layer — no I/O.
 *
 * Call AFTER: KB fetch + kbStrength assessment + intent detection.
 *
 * @param {object} opts
 * @param {{ primary: string }} opts.intent
 * @param {"strong"|"weak"|"absent"} opts.kbStrength
 * @param {string} opts.query
 * @param {boolean} [opts.isCurrency]
 * @param {boolean} [opts.perplexityConfigured]
 * @returns {{
 *   fetchCurrency: boolean,
 *   fetchDorar:    boolean,
 *   fetchPerplexity: boolean,
 *   fetchWikiDDG:  boolean,
 *   reason:        string
 * }}
 */
export function planSourceFetches({ intent, kbStrength, query, isCurrency = false, perplexityConfigured = false }) {
  const q = (query ?? "").trim();
  const short = q.length < 8;

  const skipExternal =
    short ||
    ["casual", "arabic_writing", "fiqh"].includes(intent.primary) ||
    kbStrength === "strong";

  if (isCurrency) {
    return {
      fetchCurrency:    true,
      fetchDorar:       false,
      fetchPerplexity:  false,
      fetchWikiDDG:     false,
      reason:           "currency_api_only",
    };
  }

  if (intent.primary === "fiqh") {
    return {
      fetchCurrency:    false,
      fetchDorar:       true,
      fetchPerplexity:  false,
      fetchWikiDDG:     false,
      reason:           "fiqh_dorar_only",
    };
  }

  if (skipExternal) {
    return {
      fetchCurrency:    false,
      fetchDorar:       false,
      fetchPerplexity:  false,
      fetchWikiDDG:     false,
      reason:           kbStrength === "strong" ? "kb_sufficient" : "query_not_eligible",
    };
  }

  return {
    fetchCurrency:    false,
    fetchDorar:       false,
    fetchPerplexity:  perplexityConfigured,
    fetchWikiDDG:     !perplexityConfigured,
    reason:           perplexityConfigured ? "perplexity_primary" : "wiki_ddg_fallback",
  };
}

/* ── Phase 2: Post-fetch SourceResult assembler ───────────────────────────── */

/**
 * Assemble a full SourceResult object from everything that was actually fetched.
 * Call AFTER all Wave 1 + Wave 2 fetches are complete.
 *
 * Confidence labels:
 *   "verified"        → answer backed by pinned update or KB article (internal, reviewed)
 *   "community_based" → answer backed by community-contributed KB article (no peer review)
 *   "web_result"      → answer backed by Perplexity, Wikipedia, or DuckDuckGo
 *   "fallback"        → no external source; model knowledge only
 *
 * @param {object} opts
 * @param {Array}   opts.articles         - KB articles fetched
 * @param {Array}   opts.pinnedUpdates    - Admin-pinned updates fetched
 * @param {object|null} opts.perplexityResult
 * @param {object|null} opts.wikiResult
 * @param {object|null} opts.ddgResult
 * @param {object|null} opts.exchangeRates
 * @param {object|null} opts.dorarResult
 * @param {"strong"|"weak"|"absent"} opts.kbStrength
 * @param {string}  opts.queryType        - "currency" | "dynamic" | "general"
 * @param {{ primary: string }} opts.intent
 * @param {string}  opts.query
 * @returns {{
 *   confidence: string,
 *   primary_source: string,
 *   sources_used: SourceEntry[],
 *   may_be_outdated: boolean,
 *   source_summary: string,
 *   retrieved_at: string,
 *   db_log_fields: object
 * }}
 */
export function buildSourceResult({
  articles = [],
  pinnedUpdates = [],
  perplexityResult = null,
  wikiResult = null,
  ddgResult = null,
  exchangeRates = null,
  dorarResult = null,
  kbStrength = "absent",
  queryType = "general",
  intent,
  query = "",
}) {
  const retrievedAt = new Date().toISOString();
  const sources = [];

  // ── Pinned updates (trust: 100) ──────────────────────────────────────────
  if (pinnedUpdates.length > 0) {
    sources.push(makeEntry({
      name:    "AINA Pinned Update",
      type:    "internal",
      key:     "pinned_update",
      primary: true,
    }));
  }

  // ── Knowledge Base articles (trust: 90) ──────────────────────────────────
  if (articles.length > 0) {
    const isPrimary = pinnedUpdates.length === 0;
    const freshestArticle = articles.reduce((a, b) =>
      new Date(a.updated_at ?? a.created_at ?? 0) > new Date(b.updated_at ?? b.created_at ?? 0) ? a : b,
      articles[0]
    );
    sources.push(makeEntry({
      name:      `Knowledge Base AINA (${articles.length} artikel)`,
      type:      "internal",
      key:       "kb_article",
      primary:   isPrimary,
      updatedAt: freshestArticle?.updated_at ?? freshestArticle?.created_at ?? null,
    }));
  }

  // ── Exchange rate API (trust: 85) ─────────────────────────────────────────
  if (queryType === "currency" && exchangeRates) {
    const isPrimary = pinnedUpdates.length === 0 && articles.length === 0;
    sources.push(makeEntry({
      name:    "Frankfurter Exchange Rate API",
      type:    "api",
      key:     "exchange_rate",
      primary: isPrimary,
    }));
  }

  // ── Dorar.net (trust: 82) ─────────────────────────────────────────────────
  if (dorarResult?.hadiths?.length > 0) {
    const isPrimary = pinnedUpdates.length === 0 && articles.length === 0;
    sources.push(makeEntry({
      name:    `Dorar.net (${dorarResult.hadiths.length} hadits)`,
      type:    "encyclopedia",
      key:     "dorar",
      primary: isPrimary,
    }));
  }

  // ── Perplexity web search (trust: 78) ─────────────────────────────────────
  if (perplexityResult) {
    const isPrimary = pinnedUpdates.length === 0 && articles.length === 0;
    sources.push(makeEntry({
      name:    "Perplexity Web Search",
      type:    "web_search",
      key:     "perplexity",
      primary: isPrimary,
    }));
  }

  // ── Wikipedia (trust: 60) ─────────────────────────────────────────────────
  if (wikiResult) {
    const isPrimary = pinnedUpdates.length === 0 && articles.length === 0 && !perplexityResult;
    sources.push(makeEntry({
      name:    "Wikipedia",
      type:    "encyclopedia",
      key:     "wikipedia",
      primary: isPrimary,
    }));
  }

  // ── DuckDuckGo instant answers (trust: 35) ────────────────────────────────
  if (ddgResult && !wikiResult) {
    const isPrimary = pinnedUpdates.length === 0 && articles.length === 0 && !perplexityResult;
    sources.push(makeEntry({
      name:    "DuckDuckGo",
      type:    "web_search",
      key:     "duckduckgo",
      primary: isPrimary,
    }));
  }

  // ── Model knowledge fallback ───────────────────────────────────────────────
  if (sources.length === 0) {
    sources.push(makeEntry({
      name:    "Pengetahuan Model AI",
      type:    "model",
      key:     "model_knowledge",
      primary: true,
    }));
  }

  // ── Derive primary source key ─────────────────────────────────────────────
  const primaryEntry = sources.find(s => s.is_primary) ?? sources[0];
  const primarySource = deriveSourceKey(primaryEntry);

  // ── Classify confidence ───────────────────────────────────────────────────
  const confidence = classifyConfidenceLabel({
    hasPinned:      pinnedUpdates.length > 0,
    hasKB:          articles.length > 0,
    kbStrength,
    hasPerplexity:  !!perplexityResult,
    hasWiki:        !!wikiResult,
    hasDDG:         !!ddgResult,
    hasExchange:    queryType === "currency" && !!exchangeRates,
    hasDorar:       dorarResult?.hadiths?.length > 0,
    primarySource,
  });

  // ── may_be_outdated flag ──────────────────────────────────────────────────
  const mayBeOutdated = deriveMayBeOutdated({
    confidence,
    primarySource,
    queryType,
    query,
    articles,
    intentPrimary: intent?.primary ?? "unknown",
  });

  // ── Human-readable source summary ─────────────────────────────────────────
  const sourceSummary = buildSourceSummary(confidence, primarySource, sources.length);

  // ── DB-ready log fields ───────────────────────────────────────────────────
  const dbLogFields = {
    confidence,
    primary_source: primarySource,
    sources_used:   sources,
    may_be_outdated: mayBeOutdated,
    intent_primary: intent?.primary ?? "unknown",
    kb_strength:    kbStrength,
    retrieved_at:   retrievedAt,
  };

  return {
    confidence,
    primary_source:  primarySource,
    sources_used:    sources,
    may_be_outdated: mayBeOutdated,
    source_summary:  sourceSummary,
    retrieved_at:    retrievedAt,
    db_log_fields:   dbLogFields,
  };
}

/* ── Confidence label classifier ──────────────────────────────────────────── */

/**
 * Map source usage to one of the 4 transparency confidence labels.
 *
 * "verified"        → pinned admin update OR KB article with STRONG match
 * "community_based" → KB article fetched but only WEAK match (vaguely relevant)
 * "web_result"      → Perplexity / Wikipedia / DDG / Exchange API / Dorar
 * "fallback"        → no context; model knowledge only
 *
 * kbStrength matters: a "weak" KB match means the model mostly answered from
 * its own knowledge — labelling that as "verified" is misleading.
 */
function classifyConfidenceLabel({
  hasPinned, hasKB, kbStrength, hasPerplexity, hasWiki, hasDDG, hasExchange, hasDorar, primarySource,
}) {
  if (hasPinned)                          return "verified";
  if (hasKB && kbStrength === "strong")   return "verified";
  if (hasKB && kbStrength === "weak")     return "community_based";
  if (hasPerplexity || hasExchange)       return "web_result";
  if (hasDorar)                           return "web_result";
  if (hasWiki || hasDDG)                  return "web_result";
  return "fallback";
}

/* ── Primary source key deriver ───────────────────────────────────────────── */

function deriveSourceKey(entry) {
  if (!entry) return "model_knowledge";
  const n = entry.source_name.toLowerCase();
  if (n.includes("pinned"))      return "pinned_update";
  if (n.includes("knowledge"))   return entry.source_type === "model" ? "model_knowledge" : "kb_article";
  if (n.includes("frankfurter")) return "exchange_rate";
  if (n.includes("dorar"))       return "dorar";
  if (n.includes("perplexity"))  return "perplexity";
  if (n.includes("wikipedia"))   return "wikipedia";
  if (n.includes("duckduckgo"))  return "duckduckgo";
  return "model_knowledge";
}

/* ── may_be_outdated deriver ──────────────────────────────────────────────── */

// Intents yang tidak perlu peringatan outdated — percakapan, kreatif, agama
const TIMELESS_INTENTS = new Set([
  "casual", "greeting", "brainstorming", "arabic_writing", "fiqh",
]);

function deriveMayBeOutdated({ confidence, primarySource, queryType, query, articles, intentPrimary }) {
  // Percakapan/kreatif/keagamaan → tidak relevan warning outdated
  if (TIMELESS_INTENTS.has(intentPrimary)) return false;

  // Fallback + query faktual/prosedural = mungkin outdated (training cutoff model)
  if (confidence === "fallback") return true;

  // Dynamic/time-sensitive queries are always potentially outdated unless from real-time sources
  const timeSensitive = /\b(sekarang|terbaru|terkini|saat ini|hari ini|bulan ini|tahun ini|2024|2025|2026|berubah|update)\b/i.test(query);
  if (timeSensitive && primarySource !== "perplexity" && primarySource !== "exchange_rate") return true;

  // KB articles that haven't been updated in >90 days
  if (primarySource === "kb_article" && articles.length > 0) {
    const freshest = articles.reduce((a, b) =>
      new Date(a.updated_at ?? a.created_at ?? 0) > new Date(b.updated_at ?? b.created_at ?? 0) ? a : b,
      articles[0]
    );
    const freshestDate = new Date(freshest?.updated_at ?? freshest?.created_at ?? 0);
    const ageMs = Date.now() - freshestDate.getTime();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    if (ageMs > ninetyDaysMs) return true;
  }

  // Wikipedia is always potentially outdated for dynamic topics
  if (primarySource === "wikipedia" && timeSensitive) return true;

  return false;
}

/* ── Source summary string builder ───────────────────────────────────────────*/

/**
 * Build a short human-readable label shown in the UI below the answer.
 * Kept in Indonesian to match the AINA UX language.
 */
function buildSourceSummary(confidence, primarySource, totalSources) {
  const extra = totalSources > 1 ? ` + ${totalSources - 1} sumber lain` : "";

  switch (confidence) {
    case "verified":
      if (primarySource === "pinned_update") return `Update Resmi AINA${extra}`;
      return `Knowledge Base AINA (terverifikasi)${extra}`;

    case "community_based":
      return `Kontributor AINA${extra}`;

    case "web_result":
      if (primarySource === "perplexity")  return `Pencarian Web Real-time${extra}`;
      if (primarySource === "exchange_rate") return `Kurs Real-time${extra}`;
      if (primarySource === "dorar")       return `Dorar.net (Hadits)${extra}`;
      if (primarySource === "wikipedia")   return `Wikipedia${extra}`;
      if (primarySource === "duckduckgo")  return `DuckDuckGo${extra}`;
      return `Pencarian Web${extra}`;

    case "fallback":
    default:
      return "Pengetahuan Umum (perlu verifikasi)";
  }
}

/* ── Graceful no-source handler ───────────────────────────────────────────── */

/**
 * Generate a graceful "no strong source" response object.
 * Returns structured metadata that signals the prompt builder to
 * add explicit uncertainty language and suggest official channels.
 *
 * Use this when all source fetches failed or returned empty results.
 *
 * @param {{ primary: string }} intent
 * @param {string} query
 * @returns {object}
 */
export function buildNoSourceResult(intent, query) {
  const retrievedAt = new Date().toISOString();
  return {
    confidence:      "fallback",
    primary_source:  "model_knowledge",
    sources_used:    [makeEntry({ name: "Pengetahuan Model AI", type: "model", key: "model_knowledge", primary: true })],
    may_be_outdated: true,
    source_summary:  "Pengetahuan Umum (perlu verifikasi)",
    retrieved_at:    retrievedAt,
    graceful_mode:   true,
    graceful_hints: [
      "Saya tidak memiliki sumber yang dapat diverifikasi untuk pertanyaan ini.",
      "Disarankan untuk mengkonfirmasi informasi ke sumber resmi.",
    ],
    db_log_fields: {
      confidence:      "fallback",
      primary_source:  "model_knowledge",
      sources_used:    [],
      may_be_outdated: true,
      intent_primary:  intent?.primary ?? "unknown",
      kb_strength:     "absent",
      retrieved_at:    retrievedAt,
    },
  };
}

/* ── Source debug summary (for console logging) ────────────────────────────── */

/**
 * Emit a compact, human-readable source decision summary to the console.
 * Designed to be easy to read in Replit / Vercel log tails.
 *
 * @param {object} sourceResult - Return value of buildSourceResult()
 * @param {string} query        - Last user message
 */
export function logSourceDecision(sourceResult, query) {
  const { confidence, primary_source, sources_used, may_be_outdated } = sourceResult;
  const names = sources_used.map(s => s.source_name.replace(" Knowledge Base AINA", " KB")).join(" + ");
  const outdatedFlag = may_be_outdated ? " ⚠️outdated?" : "";
  console.log(
    `[Orchestrator] conf=${confidence} primary=${primary_source}${outdatedFlag} | "${query.slice(0, 60)}" | sources: ${names}`
  );
}
