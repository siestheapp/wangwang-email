/**
 * Cloudflare Worker entry point for the "Speak Up for Wangwang" page.
 *
 * Static files in ./public are served by the ASSETS binding declared in
 * wrangler.jsonc. Any request that does not match a static file falls through
 * to this Worker, which serves the /api/translate endpoint.
 *
 * The DeepL key is read from env.DEEPL_API_KEY (a Cloudflare secret) and is
 * never exposed to the browser.
 */

const MAX_CHARS = 1800;

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function handleTranslate(request, env) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid request." }, 400);
  }

  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (!text) {
    return json({ error: "Please enter text to translate." }, 400);
  }

  if (text.length > MAX_CHARS) {
    return json({ error: "Please keep your comment under 1,800 characters." }, 400);
  }

  const apiKey = (env.DEEPL_API_KEY || "").trim();
  if (!apiKey) {
    return json({ error: "Translation is not configured yet (missing DEEPL_API_KEY)." }, 500);
  }

  // DeepL free-tier keys end in ":fx" and use a different host.
  const endpoint = apiKey.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": "DeepL-Auth-Key " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: [text],
        source_lang: "EN",
        target_lang: "ZH-HANS"
      })
    });

    const data = await response.json().catch(function () { return null; });

    if (!response.ok) {
      console.log("DeepL error", response.status, JSON.stringify(data));
      let detail = "The translation service returned an error.";
      if (response.status === 403) {
        detail = "The translation key was rejected.";
      } else if (response.status === 456) {
        detail = "The translation quota for this month has been used up.";
      } else if (response.status === 429) {
        detail = "Too many requests right now. Please try again in a moment.";
      }
      return json({ error: detail }, 502);
    }

    const translation = data?.translations?.[0]?.text;
    if (!translation) {
      return json({ error: "No translation was returned." }, 502);
    }

    return json({ translation: translation });
  } catch (error) {
    console.log("Translation error", (error && error.message) || error);
    return json({ error: "Unable to translate right now. Please try again." }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/translate") {
      return handleTranslate(request, env);
    }

    // Health check: confirms the Worker is live and whether the secret is set.
    if (url.pathname === "/api/health") {
      return json({ ok: true, deeplConfigured: Boolean(env.DEEPL_API_KEY) });
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  }
};
