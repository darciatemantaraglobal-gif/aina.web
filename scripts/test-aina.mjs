/**
 * AINA Performance Test Script
 * Usage: node scripts/test-aina.mjs <BEARER_TOKEN>
 *
 * Get your token:
 * 1. Login ke AINA di browser
 * 2. Buka DevTools → Application → Local Storage → supabase.auth.token
 *    atau: ketik di Console → (await window.supabase?.auth.getSession())?.data?.session?.access_token
 */

import { performance } from "perf_hooks";

const TOKEN = process.argv[2];
const BASE_URL = process.argv[3] || "http://localhost:3001";

if (!TOKEN) {
  console.error("Usage: node scripts/test-aina.mjs <BEARER_TOKEN> [BASE_URL]");
  console.error("\nCara dapat token:");
  console.error("  Buka DevTools browser → Console → paste:");
  console.error("  (await (window.supabase||window._supabase)?.auth?.getSession())?.data?.session?.access_token");
  process.exit(1);
}

// ── Test cases ──────────────────────────────────────────────────────────────
const TEST_CASES = [
  // --- Masisir / local ---
  {
    id: "T01",
    category: "🏢 Lokal Masisir",
    label: "Cara buat iqomah baru",
    query: "cara buat iqomah baru di mesir, dokumen apa aja yang dibutuhkan?",
    expects: { hasTrustFooter: true, minWords: 80, noEmpty: true },
  },
  {
    id: "T02",
    category: "🏢 Lokal Masisir",
    label: "Tasjil kuliah Al-Azhar",
    query: "bagaimana proses tasjil ulang di Al-Azhar? kapan waktunya?",
    expects: { hasTrustFooter: true, minWords: 60, noEmpty: true },
  },
  {
    id: "T03",
    category: "🏢 Lokal Masisir",
    label: "Transfer uang ke Indonesia",
    query: "cara kirim uang dari mesir ke indonesia yang paling murah?",
    expects: { hasTrustFooter: false, minWords: 50, noEmpty: true },
  },
  // --- Egypt general ---
  {
    id: "T04",
    category: "🇪🇬 Mesir Umum",
    label: "Wisata Kairo murah",
    query: "wisata di kairo yang murah dan cocok untuk mahasiswa?",
    expects: { hasTrustFooter: false, minWords: 80, noEmpty: true },
  },
  {
    id: "T05",
    category: "🇪🇬 Mesir Umum",
    label: "Naik kereta di Mesir",
    query: "cara beli tiket kereta api di mesir, bisa online?",
    expects: { hasTrustFooter: false, minWords: 50, noEmpty: true },
  },
  // --- Visa / travel ---
  {
    id: "T06",
    category: "✈️  Visa & Travel",
    label: "Visa Dubai dari Mesir",
    query: "visa dubai gimana urusnya dari kairo? berapa biaya dan syaratnya?",
    expects: { hasTrustFooter: false, minWords: 80, noEmpty: true },
  },
  {
    id: "T07",
    category: "✈️  Visa & Travel",
    label: "Visa Turki on arrival",
    query: "apakah WNI bisa on arrival ke turki? kalau dari mesir naik apa?",
    expects: { hasTrustFooter: false, minWords: 50, noEmpty: true },
  },
  // --- Islamic / general ---
  {
    id: "T08",
    category: "☪️  Islamik",
    label: "Doa sebelum belajar",
    query: "doa sebelum belajar yang lengkap beserta artinya",
    expects: { hasArabicBlock: true, minWords: 30, noEmpty: true },
  },
  {
    id: "T09",
    category: "☪️  Islamik",
    label: "Sholat jamak qashar",
    query: "bolehkah jamak qashar saat bepergian? berapa jaraknya?",
    expects: { hasArabicBlock: false, minWords: 80, noEmpty: true },
  },
  // --- Edge cases ---
  {
    id: "T10",
    category: "⚠️  Edge Case",
    label: "Query super singkat",
    query: "iqomah",
    expects: { minWords: 20, noEmpty: true },
  },
  {
    id: "T11",
    category: "⚠️  Edge Case",
    label: "Bahasa campuran",
    query: "gimana sih cara ngurus visa buat mahasiswa azhar mau ke saudi?",
    expects: { minWords: 50, noEmpty: true },
  },
  {
    id: "T12",
    category: "⚠️  Edge Case",
    label: "Query bahasa Inggris",
    query: "what is the process to renew iqama in Egypt for Indonesian students?",
    expects: { minWords: 50, noEmpty: true },
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};
const c = (color, text) => `${COLORS[color]}${text}${COLORS.reset}`;

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function checkExpects(text, expects) {
  const issues = [];
  if (expects.noEmpty && !text?.trim()) issues.push("respons kosong");
  if (expects.minWords && countWords(text) < expects.minWords)
    issues.push(`terlalu singkat (${countWords(text)} < ${expects.minWords} kata)`);
  if (expects.hasTrustFooter && !text.includes("Kepercayaan:"))
    issues.push("trust footer hilang");
  if (expects.hasArabicBlock && !text.includes("[ARABIC_BLOCK]") && !text.includes("**Bacaan"))
    issues.push("tidak ada blok Arabic");
  return issues;
}

async function runTest(tc, idx, total) {
  const prefix = `[${tc.id}/${total}]`;
  process.stdout.write(`${c("gray", prefix)} ${tc.category} — ${c("bold", tc.label)} ... `);

  const start = performance.now();
  let responseText = "";
  let statusCode = 0;
  let error = null;

  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: tc.query }],
        userProfile: { name: "TestUser", role: "mahasiswa" },
      }),
    });

    statusCode = res.status;

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      error = `HTTP ${statusCode}: ${errBody.slice(0, 120)}`;
    } else {
      // Handle SSE streaming
      const text = await res.text();

      // Parse SSE chunks: "data: {...}\n\n"
      const chunks = text
        .split("\n")
        .filter((l) => l.startsWith("data: "))
        .map((l) => {
          try { return JSON.parse(l.slice(6)); } catch { return null; }
        })
        .filter(Boolean);

      // Collect token chunks
      for (const chunk of chunks) {
        if (chunk.token) responseText += chunk.token;
        if (chunk.done && chunk.fullText) responseText = chunk.fullText; // prefer fullText if available
      }

      // Fallback: if no SSE, try plain JSON
      if (!responseText && text.trim().startsWith("{")) {
        try {
          const json = JSON.parse(text);
          responseText = json.message || json.content || json.text || JSON.stringify(json);
        } catch { responseText = text; }
      }
    }
  } catch (e) {
    error = e.message;
  }

  const elapsed = Math.round(performance.now() - start);
  const issues = error ? [] : checkExpects(responseText, tc.expects);
  const passed = !error && issues.length === 0;

  // ── Print result ────────────────────────────────────────────────
  if (error) {
    console.log(c("red", `✗ ERROR`) + c("gray", ` ${elapsed}ms`) + `\n  ${c("red", error)}`);
  } else if (issues.length > 0) {
    console.log(c("yellow", `⚠ WARN`) + c("gray", ` ${elapsed}ms`) + `\n  ${c("yellow", issues.join(", "))}`);
  } else {
    console.log(c("green", `✓ OK`) + c("gray", ` ${elapsed}ms`));
  }

  // ── Print response preview ───────────────────────────────────────
  if (responseText) {
    const preview = responseText.replace(/\n+/g, " ").slice(0, 200);
    console.log(`  ${c("gray", `"${preview}${responseText.length > 200 ? "…" : ""}"`)}`);
    console.log(c("gray", `  [${countWords(responseText)} kata | trust: ${responseText.includes("Kepercayaan:") ? "✓" : "✗"} | arabic: ${responseText.includes("[ARABIC_BLOCK]") || responseText.includes("ARABIC_BLOCK") ? "✓" : "✗"}]`));
  }
  console.log();

  return { id: tc.id, passed, error: !!error, issues, elapsed };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log();
  console.log(c("bold", "╔══════════════════════════════════════════════╗"));
  console.log(c("bold", "║       AINA Performance Test Suite            ║"));
  console.log(c("bold", "╚══════════════════════════════════════════════╝"));
  console.log(`  Target: ${c("cyan", BASE_URL)}`);
  console.log(`  Tests:  ${c("cyan", TEST_CASES.length.toString())} queries`);
  console.log();

  const results = [];
  for (let i = 0; i < TEST_CASES.length; i++) {
    const result = await runTest(TEST_CASES[i], i + 1, TEST_CASES.length);
    results.push({ ...result, ...TEST_CASES[i] });
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 800));
  }

  // ── Summary ──────────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  const warned = results.filter(r => !r.error && !r.passed).length;
  const failed = results.filter(r => r.error).length;
  const avgMs = Math.round(results.reduce((s, r) => s + r.elapsed, 0) / results.length);
  const maxMs = Math.max(...results.map(r => r.elapsed));
  const minMs = Math.min(...results.map(r => r.elapsed));

  console.log(c("bold", "═══════════════════ RINGKASAN ═══════════════════"));
  console.log(`  ✓ Passed  : ${c("green", passed.toString())} / ${results.length}`);
  console.log(`  ⚠ Warning : ${c("yellow", warned.toString())}`);
  console.log(`  ✗ Error   : ${c("red", failed.toString())}`);
  console.log();
  console.log(`  ⏱  Avg response : ${c("cyan", avgMs + "ms")}`);
  console.log(`  ⏱  Min / Max    : ${minMs}ms / ${c(maxMs > 15000 ? "yellow" : "cyan", maxMs + "ms")}`);
  console.log();

  if (warned > 0 || failed > 0) {
    console.log(c("bold", "Perlu diperhatikan:"));
    for (const r of results) {
      if (r.error) console.log(`  ${c("red", r.id)} ${r.label} — ${c("red", "ERROR: " + (r.issues[0] || "unknown"))}`);
      else if (!r.passed) console.log(`  ${c("yellow", r.id)} ${r.label} — ${c("yellow", r.issues.join(", "))}`);
    }
  }

  console.log();
  const score = Math.round((passed / results.length) * 100);
  const scoreColor = score >= 90 ? "green" : score >= 70 ? "yellow" : "red";
  console.log(`  Score keseluruhan: ${c(scoreColor, c("bold", score + "%"))}`);
  console.log();
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
