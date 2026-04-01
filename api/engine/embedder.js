/**
 * api/engine/embedder.js
 * Generates text embeddings via OpenAI text-embedding-3-small.
 * Used for RAG (semantic search) in AINA's Knowledge Base.
 */

const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings";
const EMBED_MODEL      = "text-embedding-3-small";
const MAX_INPUT_CHARS  = 8000; // safe limit (~6k tokens for this model)

/**
 * Generate a 1536-dimension embedding vector for the given text.
 * @param {string} text
 * @returns {Promise<number[]>} embedding vector
 */
export async function generateEmbedding(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const input = String(text).trim().slice(0, MAX_INPUT_CHARS);
  if (!input) throw new Error("Empty text — cannot generate embedding");

  const res = await fetch(OPENAI_EMBED_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embedding API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.data[0].embedding; // float32[] of length 1536
}

/**
 * Build the text to embed for a KB article.
 * Combines title + keywords + summary + content for richer semantic coverage.
 * @param {{ title?: string, keywords?: string, summary?: string, content?: string }} article
 * @returns {string}
 */
export function buildArticleEmbedText(article) {
  return [
    article.title,
    article.keywords ? `Keywords: ${article.keywords}` : null,
    article.summary  ? `Ringkasan: ${article.summary}`  : null,
    article.content,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_INPUT_CHARS);
}
