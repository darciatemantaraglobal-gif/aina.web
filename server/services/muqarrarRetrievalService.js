/**
 * muqarrarRetrievalService.js — Isolated Muqarrar AI retrieval path.
 *
 * ARCHITECTURE:
 *   This is an ADDITIVE, ISOLATED service. It must NEVER be auto-routed for
 *   normal AINA chat queries. It is activated ONLY when:
 *     a) The request explicitly sets mode: "muqarrar", OR
 *     b) The message contains a [KitabID:"..."] or [Kitab:"..."] prefix
 *        (triggered from the Library "Tanya AINA" button).
 *
 * DOES NOT TOUCH:
 *   - knowledge_base retrieval
 *   - hybrid/legacy article retrieval
 *   - normal AINA chat intent routing
 *
 * DATA SOURCE:
 *   - muqarrar_chunks table (via match_muqarrar_chunks RPC for pgvector search)
 *     Fields: id, kitab_id, kitab_name, author, description, page_number,
 *             chapter, content, embedding_vec, word_count, is_ocr
 *
 * DEPENDENCY INJECTION:
 *   Factory accepts { getAdminClient, generateEmbedding } so there is no
 *   circular import back to server.js.
 *
 * @param {{ getAdminClient: Function, generateEmbedding: Function }} deps
 */
// Indonesian/Arabic stopwords to exclude from keyword extraction
const STOPWORDS = new Set([
  "yang","dan","di","ke","dari","ini","itu","ada","tidak","dengan","untuk","dalam",
  "pada","adalah","jika","atau","juga","saja","bisa","apa","bagaimana","cara","tolong",
  "mana","kapan","siapa","berapa","apakah","gimana","jelaskan","tentang","mengenai",
  "sebutkan","sebuah","suatu","oleh","saat","ketika","akan","telah","sudah","belum",
  "harus","boleh","karena","seperti","lebih","antara","setelah","sebelum","bahwa",
]);

export function createMuqarrarRetrievalService({ getAdminClient, generateEmbedding }) {

  /**
   * Retrieve relevant muqarrar chunks for a given user question.
   * Primary: semantic search via pgvector (requires OPENAI_API_KEY).
   * Fallback: keyword-based full-text search in Supabase.
   *
   * @param {string} userQuestion     The user's raw question (after prefix is stripped).
   * @param {object} opts
   * @param {string|null} opts.kitabId      Exact kitab_id for scraper items (aina:// URL).
   * @param {string|null} opts.kitabFilter  Human-readable kitab title for fuzzy name match.
   * @returns {Promise<MuqarrarChunk[]>}   Array of matching chunks, empty on error/no results.
   */
  async function retrieve(userQuestion, { kitabId = null, kitabFilter = null } = {}) {
    const supabase = getAdminClient();
    if (!supabase) {
      console.warn("[Muqarrar] Admin client tidak tersedia — skip.");
      return [];
    }

    if (!process.env.VOYAGE_API_KEY) {
      console.warn("[Muqarrar] VOYAGE_API_KEY tidak dikonfigurasi — menggunakan keyword search.");
      return _keywordFallback(supabase, userQuestion, { kitabId, kitabFilter });
    }

    try {
      const hasFilter = !!(kitabId || kitabFilter);

      // Lower threshold + higher count when scoped to a specific kitab for max recall.
      const threshold = hasFilter ? 0.20 : 0.35;
      const matchCount = hasFilter ? 12 : 6;

      const queryEmbedding = await generateEmbedding(userQuestion);
      if (!queryEmbedding) {
        console.warn("[Muqarrar] Embedding null — fallback ke keyword search.");
        return _keywordFallback(supabase, userQuestion, { kitabId, kitabFilter });
      }

      const { data, error } = await supabase.rpc("match_muqarrar_chunks", {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count:     matchCount,
      });

      if (error) {
        console.warn(`[Muqarrar] RPC error: ${error.message} — fallback ke keyword search.`);
        return _keywordFallback(supabase, userQuestion, { kitabId, kitabFilter });
      }

      let results = (data || []).filter(c => c.similarity > threshold);

      // ── Priority 1: Exact kitab_id match (scraper items with aina:// drive_url) ──
      if (kitabId) {
        const byId = results.filter(c => c.kitab_id === kitabId);
        if (byId.length > 0) {
          console.log(`[Muqarrar] ✓ KitabID exact match "${kitabId}" → ${byId.length} chunks`);
          return _sortAndLimit(byId);
        }
        // kitab_id not in top-K pool — expand search with lower threshold
        console.log(`[Muqarrar] KitabID "${kitabId}" not in pool — widening search`);
        const { data: wideData } = await supabase.rpc("match_muqarrar_chunks", {
          query_embedding: queryEmbedding,
          match_threshold: 0.10,
          match_count:     20,
        });
        const wideById = (wideData || []).filter(c => c.kitab_id === kitabId);
        if (wideById.length > 0) {
          console.log(`[Muqarrar] ✓ Wide search → ${wideById.length} chunks for kitabId "${kitabId}"`);
          return _sortAndLimit(wideById);
        }
      }

      // ── Priority 2: Fuzzy kitab name match (manual Library items or chatbox format) ──
      if (kitabFilter) {
        const kf = kitabFilter.toLowerCase();
        const byName = results.filter(c => {
          const cn = (c.kitab_name || "").toLowerCase();
          return cn.includes(kf) || kf.includes(cn);
        });
        if (byName.length > 0) {
          console.log(`[Muqarrar] ✓ Name filter "${kitabFilter}" → ${byName.length} chunks`);
          return _sortAndLimit(byName);
        }
        // No kitab-specific results — fall back to similarity-based pool
        console.log(`[Muqarrar] Name filter "${kitabFilter}" — no match, using similarity pool (${results.length})`);
      }

      if (results.length > 0) {
        console.log(`[Muqarrar] ✓ ${results.length} chunks (top sim=${results[0]?.similarity?.toFixed(3)}) — "${userQuestion.slice(0, 60)}"`);
      }
      return _sortAndLimit(results);

    } catch (err) {
      console.warn(`[Muqarrar] retrieve() failed: ${err.message} — fallback ke keyword search.`);
      try {
        return await _keywordFallback(supabase, userQuestion, { kitabId, kitabFilter });
      } catch {
        return [];
      }
    }
  }

  /**
   * Sort by similarity desc, limit to 5 chunks for prompt injection.
   * @param {object[]} chunks
   */
  function _sortAndLimit(chunks) {
    return chunks
      .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
      .slice(0, 5);
  }

  /**
   * Keyword-based fallback retrieval when OpenAI key is not configured.
   * Extracts meaningful tokens from the question and searches muqarrar_chunks
   * using Supabase OR-filter on content. Results are scored by keyword coverage.
   */
  async function _keywordFallback(supabase, userQuestion, { kitabId = null, kitabFilter = null } = {}) {
    try {
      // ── Extract meaningful keywords ────────────────────────────────────────
      const tokens = userQuestion
        .toLowerCase()
        .replace(/[^\w\s\u0600-\u06FF]/g, " ")   // keep Latin + Arabic chars
        .split(/\s+/)
        .filter(w => w.length >= 3 && !STOPWORDS.has(w));

      // Deduplicate + take top 6
      const keywords = [...new Set(tokens)].slice(0, 6);

      if (keywords.length === 0) {
        console.warn("[Muqarrar:keyword] No usable keywords extracted — returning []");
        return [];
      }

      const hasFilter = !!(kitabId || kitabFilter);
      const fetchLimit = hasFilter ? 20 : 10;

      // ── Build Supabase query ───────────────────────────────────────────────
      let query = supabase
        .from("muqarrar_chunks")
        .select("id, kitab_id, kitab_name, author, page_number, chapter, content, word_count, is_ocr")
        .limit(fetchLimit);

      if (kitabId) {
        query = query.eq("kitab_id", kitabId);
      } else if (kitabFilter) {
        query = query.ilike("kitab_name", `%${kitabFilter}%`);
      }

      // OR-filter: any keyword present in content
      const orFilter = keywords.map(k => `content.ilike.%${k}%`).join(",");
      query = query.or(orFilter);

      const { data, error } = await query;
      if (error) {
        console.warn(`[Muqarrar:keyword] Query error: ${error.message}`);
        return [];
      }
      if (!data || data.length === 0) {
        console.warn(`[Muqarrar:keyword] No results for keywords: [${keywords.join(", ")}]`);
        return [];
      }

      // ── Score by keyword coverage ──────────────────────────────────────────
      const scored = data.map(chunk => {
        const body = (chunk.content || "").toLowerCase();
        const matchCount = keywords.filter(k => body.includes(k)).length;
        return { ...chunk, similarity: matchCount / keywords.length };
      });

      const top = scored
        .filter(c => c.similarity > 0)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5);

      console.log(`[Muqarrar:keyword] ✓ ${top.length} chunks via keyword search (keywords: [${keywords.join(", ")}])`);
      return top;

    } catch (err) {
      console.warn(`[Muqarrar:keyword] Failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Parse the kitab context prefix from a raw message.
   * Handles two formats produced by the Library "Tanya AINA" button:
   *
   *   Scraper item : [KitabID:"uuid" Kitab:"Title"] question
   *   Manual item  : [Kitab: "Title"] question
   *   Chatbox      : [Kitab: "Title"] question
   *
   * @param {string} rawMessage  Full message content from the user.
   * @returns {{ kitabId: string|null, kitabFilter: string|null, cleanQuestion: string }}
   */
  function parseKitabPrefix(rawMessage) {
    // Format A: scraper items (aina:// drive_url)
    const idFmt = rawMessage.match(/^\[KitabID:"([^"]+)"\s+Kitab:"([^"]+)"\]\s*/);
    if (idFmt) {
      return {
        kitabId:     idFmt[1],
        kitabFilter: idFmt[2],
        cleanQuestion: rawMessage.slice(idFmt[0].length).trim(),
      };
    }
    // Format B: manual / chatbox
    const nameFmt = rawMessage.match(/^\[Kitab:\s*"([^"]+)"\]\s*/);
    if (nameFmt) {
      return {
        kitabId:     null,
        kitabFilter: nameFmt[1],
        cleanQuestion: rawMessage.slice(nameFmt[0].length).trim(),
      };
    }
    return { kitabId: null, kitabFilter: null, cleanQuestion: rawMessage };
  }

  return { retrieve, parseKitabPrefix };
}
