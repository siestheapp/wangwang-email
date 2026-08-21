export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const text = typeof body?.text === "string" ? body.text.trim() : "";

    if (!text) {
      return Response.json({ error: "Please enter text to translate." }, { status: 400 });
    }

    if (text.length > 1800) {
      return Response.json(
        { error: "Please keep your comment under 1,800 characters." },
        { status: 400 }
      );
    }

    const apiKey = env.DEEPL_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "Translation is not configured yet." },
        { status: 500 }
      );
    }

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
        target_lang: "ZH-HANS"
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.log("DeepL error", JSON.stringify(data));
      return Response.json(
        { error: "Translation service returned an error." },
        { status: 502 }
      );
    }

    const translation = data?.translations?.[0]?.text;
    if (!translation) {
      return Response.json({ error: "No translation was returned." }, { status: 502 });
    }

    return Response.json({ translation });
  } catch (error) {
    console.log("Translation error", error?.message || error);
    return Response.json(
      { error: "Unable to translate right now. Please try again." },
      { status: 500 }
    );
  }
}

export async function onRequest(context) {
  return Response.json({ error: "Method not allowed." }, { status: 405 });
}
