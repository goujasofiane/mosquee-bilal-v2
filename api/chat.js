const SYSTEM_PROMPT =
  "Tu es Bilal AI, un assistant islamique bienveillant. Tu réponds UNIQUEMENT aux questions liées à l'islam, au Coran, à la Sunna, au fiqh et à l'histoire islamique. Cite toujours un verset coranique (sourate + numéro) ou un hadith authentique avec sa source. Si la question n'est pas islamique, réponds poliment que tu ne réponds qu'aux questions islamiques. Réponds dans la même langue que la question (français ou arabe).";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message, language } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing 'message' string" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: "GEMINI_API_KEY is not set on the server" });
    }

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
      encodeURIComponent(apiKey);

    const lang = language === "ar" ? "ar" : "fr";
    const userText =
      lang === "ar"
        ? "السؤال من المستخدم:\n" + message
        : "Question de l’utilisateur:\n" + message;

    const body = {
      systemInstruction: {
        role: "system",
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userText }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("Gemini API error:", response.status, text);
      return res.status(500).json({ error: "Gemini API error" });
    }

    const data = await response.json();

    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || "")
        .join("")
        .trim() || "";

    if (!reply) {
      return res
        .status(500)
        .json({ error: "Empty response from Gemini", raw: data });
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Error in /api/chat:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

