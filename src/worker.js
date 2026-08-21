/**
 * Cloudflare Worker entry point for the "Speak Up for Wangwang" page.
 *
 * Static files in ./public are served by the ASSETS binding declared in
 * wrangler.jsonc. Any request that does not match a static file falls through
 * to this Worker, which serves the /api/translate endpoint.
 *
 * Translation runs on Cloudflare Workers AI (Qwen) through the AI binding, so
 * there is no third-party API key and nothing sensitive reaches the browser.
 */

const MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
const MAX_CHARS = 1800;

const SYSTEM_PROMPT = [
  "You are a professional English to Simplified Chinese translator.",
  "Translate the user's message into Simplified Chinese.",
  "The text is a short, respectful public comment that a member of the public is",
  "submitting to a Chinese government working group about animal cruelty and about",
  "protecting people who speak out against it. Use polite, natural, formal written",
  "Chinese suitable for an official public comment.",
  "Wangwang is the name of a dog whose abuse case was widely reported. Always write",
  "it as 旺旺 on its own; never add a Chinese surname and never treat it as a",
  "person's name.",
  "Preserve the meaning, tone and paragraph breaks of the original.",
  "Output ONLY the Simplified Chinese translation.",
  "Do not add explanations, notes, pinyin, romanisation, quotation marks around the",
  "whole text, or any English commentary."
].join(" ");

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

// Reasoning models can prefix their answer with a thinking block. Keep only
// whatever follows the final closing tag.
function stripThinking(value) {
  var text = String(value || "");
  var close = "</think>";
  var index = text.lastIndexOf(close);
  if (index !== -1) {
    text = text.slice(index + close.length);
  }
  return text.trim();
}

function tidy(value) {
  var text = stripThinking(value);
  // Drop a stray pair of wrapping quotes if the model added them.
  var first = text.charAt(0);
  var last = text.charAt(text.length - 1);
  var quotes = ['"', "'", "“", "「", "『"];
  var closers = ['"', "'", "”", "」", "』"];
  for (var i = 0; i < quotes.length; i++) {
    if (first === quotes[i] && last === closers[i]) {
      text = text.slice(1, -1).trim();
      break;
    }
  }
  return text;
}

function extractText(result) {
  if (!result) return "";
  if (typeof result === "string") return result;
  if (typeof result.response === "string") return result.response;
  var choice = result.choices && result.choices[0];
  if (choice) {
    if (choice.message && typeof choice.message.content === "string") {
      return choice.message.content;
    }
    if (typeof choice.text === "string") return choice.text;
  }
  if (typeof result.translated_text === "string") return result.translated_text;
  return "";
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

  if (!env.AI) {
    return json({ error: "Translation is not configured yet." }, 500);
  }

  try {
    const result = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text }
      ],
      max_tokens: 1600,
      temperature: 0.2
    });

    const translation = tidy(extractText(result));

    if (!translation) {
      console.log("Empty translation", JSON.stringify(result).slice(0, 500));
      return json({ error: "No translation was returned. Please try again." }, 502);
    }

    return json({ translation: translation });
  } catch (error) {
    const message = (error && error.message) || String(error);
    console.log("Translation error", message);

    // Workers AI has a free daily allowance; say so plainly if it runs out.
    if (message.toLowerCase().indexOf("capacity") !== -1 ||
        message.toLowerCase().indexOf("limit") !== -1 ||
        message.indexOf("3040") !== -1) {
      return json(
        { error: "Translation is temporarily over its daily limit. Please try again later." },
        429
      );
    }

    return json({ error: "Unable to translate right now. Please try again." }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/translate") {
      return handleTranslate(request, env);
    }

    // Health check: confirms the Worker is live and the AI binding is present.
    if (url.pathname === "/api/health") {
      return json({ ok: true, model: MODEL, aiBinding: Boolean(env.AI) });
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  }
};
