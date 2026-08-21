export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";

  if (!text) {
    return res.status(400).json({ error: "Please enter text to translate." });
  }

  if (text.length > 1800) {
    return res.status(400).json({ error: "Please keep your comment under 1,800 characters." });
  }

  const apiKey = process.env.DEEPL_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Translation is not configured yet." });
  }

  try {
    const endpoint = apiKey.endsWith(":fx")
      ? "https://api-free.deepl.com/v2/translate"
      : "https://api.deepl.com/v2/translate";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: [text],
        source_lang: "EN",
        target_lang: "ZH"
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("DeepL error:", data);
      return res.status(502).json({ error: "Translation service returned an error." });
    }

    const translation = data?.translations?.[0]?.text;

    if (!translation) {
      return res.status(502).json({ error: "No translation was returned." });
    }

    return res.status(200).json({ translation });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Unable to translate right now. Please try again." });
  }
}
