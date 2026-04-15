/**
 * jobQueue.js — Background job queue menggunakan p-queue
 *
 * Menggantikan fire-and-forget bare calls dengan queue terstruktur yang:
 * - Membatasi concurrency (max 2 job berjalan bersamaan) untuk tidak overwhelm OpenAI/OpenRouter
 * - Retry otomatis dengan exponential backoff untuk transient errors (rate limit, timeout)
 * - Logging progress yang terstruktur
 * - Tidak memerlukan Redis — pure in-memory
 */

import PQueue from "p-queue";

// ── Queue configuration ────────────────────────────────────────────────────────
// concurrency=2: maks 2 job AI berjalan bersamaan (embed, keyword, summary)
// intervalCap+interval: rate-limit ke maks 5 job per detik untuk proteksi API
const _queue = new PQueue({
  concurrency: 2,
  intervalCap: 5,
  interval: 1000,
});

let _totalEnqueued = 0;
let _totalCompleted = 0;
let _totalFailed = 0;

_queue.on("add",   () => _totalEnqueued++);
_queue.on("completed", () => _totalCompleted++);
_queue.on("error", () => _totalFailed++);

// Log queue size saat ada banyak jobs pending
_queue.on("add", () => {
  if (_queue.size > 5) {
    console.log(`[JobQueue] Queue size: ${_queue.size} pending, ${_queue.pending} running`);
  }
});

/**
 * Status snapshot untuk monitoring
 */
export function getQueueStatus() {
  return {
    size:      _queue.size,
    pending:   _queue.pending,
    enqueued:  _totalEnqueued,
    completed: _totalCompleted,
    failed:    _totalFailed,
    isPaused:  _queue.isPaused,
  };
}

/**
 * Tambahkan job ke queue dengan retry otomatis.
 *
 * @param {string}   name      - Nama job untuk logging
 * @param {Function} fn        - Async function yang menjalankan job
 * @param {object}   [opts]
 * @param {number}   [opts.maxRetries=3]    - Maks retry sebelum menyerah
 * @param {number}   [opts.baseDelayMs=2000] - Delay awal sebelum retry (exponential)
 * @param {number}   [opts.priority=0]      - Prioritas (lebih tinggi = lebih cepat)
 */
export function enqueueJob(name, fn, { maxRetries = 3, baseDelayMs = 2000, priority = 0 } = {}) {
  _queue.add(async () => {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        await fn();
        if (attempt > 0) {
          console.log(`[JobQueue] ✓ ${name} succeeded after ${attempt} retry(ies)`);
        }
        return;
      } catch (err) {
        attempt++;
        const isRateLimit = err.message?.includes("429") || err.message?.includes("rate limit") || err.message?.includes("quota");
        const isTransient  = isRateLimit || err.message?.includes("timeout") || err.message?.includes("ECONNRESET");

        if (attempt > maxRetries || !isTransient) {
          // Non-transient errors atau max retries tercapai — log dan berhenti
          console.warn(`[JobQueue] ✗ ${name} failed permanently after ${attempt - 1} retry(ies): ${err.message}`);
          return;
        }

        // Exponential backoff: 2s → 4s → 8s, plus extra delay untuk rate limit
        const delay = isRateLimit
          ? baseDelayMs * Math.pow(2, attempt) + 10000  // extra 10s cooldown untuk rate limit
          : baseDelayMs * Math.pow(2, attempt - 1);

        console.warn(`[JobQueue] ↩ ${name} attempt ${attempt}/${maxRetries} failed (${err.message}) — retrying in ${Math.round(delay / 1000)}s`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }, { priority });
}

/**
 * Shortcut helpers untuk task-task umum AINA.
 * Terima fungsi embed/keyword/summary/notes sebagai parameter untuk
 * menghindari circular import ke server.js.
 */
export function createJobHelpers({ embedKBArticle, triggerKeywordGen, triggerSummaryGen, triggerImportantNotesGen }) {
  return {
    queueEmbed(articleId) {
      enqueueJob(
        `embed:${articleId.slice(0, 8)}`,
        () => embedKBArticle(articleId, { rethrow: true }),
        { maxRetries: 4, baseDelayMs: 3000 }
      );
    },
    queueKeywordGen(articleId) {
      enqueueJob(
        `keywords:${articleId.slice(0, 8)}`,
        () => triggerKeywordGen(articleId),
        { maxRetries: 2, baseDelayMs: 2000 }
      );
    },
    queueSummaryGen(articleId) {
      enqueueJob(
        `summary:${articleId.slice(0, 8)}`,
        () => triggerSummaryGen(articleId),
        { maxRetries: 2, baseDelayMs: 2000 }
      );
    },
    queueImportantNotesGen(articleId) {
      enqueueJob(
        `notes:${articleId.slice(0, 8)}`,
        () => triggerImportantNotesGen(articleId),
        { maxRetries: 2, baseDelayMs: 2000 }
      );
    },
    queueAllForArticle(articleId) {
      this.queueKeywordGen(articleId);
      this.queueSummaryGen(articleId);
      this.queueImportantNotesGen(articleId);
      this.queueEmbed(articleId);
    },
  };
}
