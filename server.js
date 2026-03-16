import express from "express";
import cors from "cors";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array required" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY not configured" });
  }

  try {
    const MODELS = [
      "nvidia/nemotron-3-super-120b-a12b:free",
      "minimax/minimax-m2.5:free",
      "stepfun/step-3.5-flash:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "openai/gpt-oss-120b:free",
      "openai/gpt-oss-20b:free",
      "nvidia/nemotron-3-nano-30b-a3b:free",
      "google/gemma-3-27b-it:free",
      "mistralai/mistral-small-3.1-24b-instruct:free",
      "meta-llama/llama-3.2-3b-instruct:free",
    ];

    const systemPrompt = `Kamu adalah AINA, asisten AI cerdas untuk mahasiswa Indonesia yang sedang belajar di Mesir (Masisir).

Keahlianmu meliputi:
- Informasi administrasi: Iqomah, Paspor, Visa Mesir, VOA, pendaftaran kuliah
- Kehidupan di Mesir: transportasi, kuliner halal, tempat tinggal, biaya hidup
- Informasi Al-Azhar dan universitas lainnya di Mesir
- Tips dan panduan sehari-hari untuk mahasiswa di Kairo dan sekitarnya
- Kurs mata uang EGP, IDR, USD

Jawab dalam Bahasa Indonesia yang ramah, informatif, dan mudah dipahami. Jika kamu tidak yakin tentang sesuatu, katakan dengan jujur.`;

    let lastError = null;
    for (const model of MODELS) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.REPLIT_DEV_DOMAIN || "https://aina.replit.app",
          "X-Title": "AINA - Asisten Masisir",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
          max_tokens: 1024,
          temperature: 0.7,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content || "Maaf, tidak ada respons.";
        console.log(`Responded using model: ${model}`);
        return res.json({ reply, model });
      }

      const errBody = await response.text();
      console.warn(`Model ${model} failed (${response.status}):`, errBody.slice(0, 200));
      lastError = errBody;

      // Only retry on rate limit or server errors, not auth errors
      if (response.status === 401 || response.status === 403) break;
    }

    console.error("All models failed. Last error:", lastError);
    return res.status(503).json({ error: "Semua model AI sedang sibuk. Coba lagi dalam beberapa detik.", detail: lastError });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AINA API server running on port ${PORT}`);
});
