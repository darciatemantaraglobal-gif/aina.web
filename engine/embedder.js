/**
 * engine/embedder.js
 * Generates text embeddings via Voyage AI voyage-3-lite.
 * Used for RAG (semantic search) in AINA's Knowledge Base.
 */

const VOYAGE_EMBED_URL = "https://api.voyageai.com/v1/embeddings";
export const CURRENT_EMBED_MODEL = "voyage-3-lite";
const MAX_INPUT_CHARS = 8000;

export async function generateEmbedding(text) {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    console.warn("[Embedder] VOYAGE_API_KEY not configured — skipping embedding");
    return null;
  }

  const input = String(text).trim().slice(0, MAX_INPUT_CHARS);
  if (!input) throw new Error("Empty text — cannot generate embedding");

  const res = await fetch(VOYAGE_EMBED_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: CURRENT_EMBED_MODEL, input: [input] }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Voyage AI embedding error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

export function buildArticleEmbedText(article) {
  return [
    article.title,
    article.keywords   ? `Keywords: ${article.keywords}`        : null,
    article.summary    ? `Ringkasan: ${article.summary}`         : null,
    article.content,
    article.content_ar ? `النص بالعربية: ${article.content_ar}` : null,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_INPUT_CHARS);
}
