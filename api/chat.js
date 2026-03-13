export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { message, language } = req.body;

  const systemPrompt = `Tu es Bilal AI, un assistant islamique bienveillant. Tu réponds UNIQUEMENT aux questions liées à l'islam, au Coran, à la Sunna, au fiqh et à l'histoire islamique. Cite toujours un verset coranique (sourate + numéro) ou un hadith authentique avec sa source. Si la question n'est pas islamique, réponds poliment que tu ne réponds qu'aux questions islamiques. Réponds dans la même langue que la question (français ou arabe).`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: systemPrompt + "\n\nQuestion: " + message }],
            },
          ],
        }),
      }
    );

    const data = await response.json();
    const reply = data.candidates[0].content.parts[0].text;
    res.status(200).json({ reply });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

