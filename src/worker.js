/**
 * Cloudflare Worker entry point for the "Speak Up for Wang Wang" page.
 *
 * Static files in ./public are served by the ASSETS binding declared in
 * wrangler.jsonc. Any request that does not match a static file falls through
 * to this Worker.
 *
 * Endpoints:
 *   POST /api/letter   compose a full Simplified Chinese public-comment letter,
 *                      or back-translate one into English (mode: "explain")
 *   POST /api/translate  plain English -> Simplified Chinese (kept so that any
 *                      still-open copy of the previous page keeps working)
 *   GET  /api/health   liveness + binding check
 *
 * Everything runs on Cloudflare Workers AI through the AI binding, so there is
 * no third-party API key and nothing sensitive reaches the browser.
 */

const MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
const MAX_INPUT = 1500;

const COMPOSE_SYSTEM = [
  "You draft formal public-comment letters in Simplified Chinese, addressed to the",
  "Chinese government working group that is collecting public input on the draft",
  "Anti-Cyberviolence Law.",
  "",
  "Write the letter in Simplified Chinese only. Use polite, warm, constructive",
  "language throughout. Never use angry, accusatory, sarcastic or threatening",
  "wording, and never make demands - make respectful suggestions.",
  "",
  "The letter must be SHORT: a salutation line, then AT MOST FIVE SENTENCES in",
  "one or two short paragraphs, then a sign-off. Busy officials should get the",
  "point in one read. Within those five sentences, cover:",
  "",
  "1. Thank the working group for taking public comments, and name what moved the",
  "writer to send this letter: the widely reported case from June 2026 in Jieyang,",
  "Guangdong, in which a stray dog named 旺旺 and her newborn puppies were tortured",
  "and killed, and video of it was posted and spread online. State only these",
  "facts about the case - do not add perpetrators, motives or other details.",
  "",
  "2. In the writer's own voice, how encountering this kind of content affected",
  "them - based ONLY on the writer's notes given below. Do not invent specific",
  "events, dates, places or people.",
  "",
  "3. One sentence carrying the writer's requests: ban animal-torture content made",
  "for profit and act against the organised groups behind it, require platforms to",
  "find and remove such content, and protect the people who report cruelty from",
  "doxxing, harassment and retaliation.",
  "",
  "4. Close with the writer's identity (using the identity note given below) and",
  "their hope, respectfully asking that these suggestions be considered. Sign off",
  "as an ordinary citizen, or as an ordinary person matching the identity note,",
  "who cares deeply about China's brighter future. Never invent a personal name.",
  "",
  "Wang Wang (also written Wangwang) is the name of a dog whose abuse case was widely reported; if the writer",
  "mentions it, write it as 旺旺 and never treat it as a person's name.",
  "",
  "Vary your sentence structure, paragraph openings and word choice so that no two",
  "letters you write read alike. This letter must read as one individual's own",
  "words, never as a form letter.",
  "",
  "Return exactly this and nothing else:",
  "SUBJECT: <a short Simplified Chinese subject line for the email>",
  "BODY:",
  "<the Simplified Chinese letter>"
].join("\n");

const EXPLAIN_SYSTEM = [
  "You translate Simplified Chinese into clear, natural English.",
  "Translate the user's message faithfully, preserving paragraph breaks.",
  "Output only the English translation, with no notes or commentary."
].join(" ");

const TRANSLATE_SYSTEM = [
  "You are a professional English to Simplified Chinese translator.",
  "Translate the user's message into Simplified Chinese.",
  "Use polite, natural, formal written Chinese suitable for an official public comment.",
  "Wang Wang (also written Wangwang) is the name of a dog whose abuse case was widely reported. Always write",
  "it as 旺旺 on its own; never add a Chinese surname and never treat it as a",
  "person's name.",
  "Output ONLY the Simplified Chinese translation, with no explanation or commentary."
].join(" ");

const DEFAULT_SUBJECT = "关于《反网络暴力法》草案的公众意见";

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
// whatever follows the final closing tag. If the generation was cut off
// mid-reasoning (an opening tag with no close), nothing usable survived -
// return empty so callers produce their "try again" error instead of
// sending chain-of-thought to a visitor as their letter.
function stripThinking(value) {
  var text = String(value || "");
  var close = "</think>";
  var index = text.lastIndexOf(close);
  if (index !== -1) {
    text = text.slice(index + close.length);
  } else if (text.indexOf("<think>") !== -1) {
    return "";
  }
  return text.trim();
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
  return "";
}

// Collapse runs of blank lines and trim each line, so the letter arrives tidy.
function tidyParagraphs(value) {
  var lines = String(value || "").split("\n");
  var out = [];
  var i;
  for (i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line === "" && out.length > 0 && out[out.length - 1] === "") {
      continue;
    }
    out.push(line);
  }
  return out.join("\n").trim();
}

function parseLetter(raw) {
  var text = stripThinking(raw);
  var subject = "";
  var body = text;

  var subjectAt = text.indexOf("SUBJECT:");
  var bodyAt = text.indexOf("BODY:");

  if (subjectAt !== -1 && bodyAt !== -1 && bodyAt > subjectAt) {
    subject = text.slice(subjectAt + 8, bodyAt).trim();
    body = text.slice(bodyAt + 5).trim();
  } else if (bodyAt !== -1) {
    body = text.slice(bodyAt + 5).trim();
  }

  // Strip a stray pair of wrapping quotes around the subject.
  subject = subject.replace("《《", "《").trim();
  if (subject.length > 120) {
    subject = "";
  }

  return { subject: subject || DEFAULT_SUBJECT, body: tidyParagraphs(body) };
}

function identityNote(scope, country) {
  if (scope === "chinese") {
    return [
      "The writer is a Chinese citizen. Express this as: an ordinary citizen who",
      "loves their country, values social stability, and cares deeply about life and",
      "animal welfare."
    ].join(" ");
  }
  var place = country ? "from " + country : "from outside China";
  return [
    "The writer is an ordinary person " + place + " who cares about China and",
    "hopes to see it become even better. Include that China has made extraordinary",
    "progress over the past thirty years, and that a country's strength is shown not",
    "only through its economy but also through how it protects the vulnerable."
  ].join(" ");
}

async function runModel(env, system, user, temperature, maxTokens) {
  const result = await env.AI.run(MODEL, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    max_tokens: maxTokens,
    temperature: temperature
  });
  return extractText(result);
}
/* ------------------------------------------------------------------ *
 * Spend guard.
 *
 * Every Workers AI call costs money once the daily free neuron
 * allowance is gone, and Cloudflare has no hard spend cap. This counts
 * AI calls in a Durable Object - which serialises reads and writes, so
 * the count stays correct under concurrency - and refuses new calls
 * once the ceiling is reached. The ceiling is set in wrangler.jsonc.
 * ------------------------------------------------------------------ */

const DEFAULT_MAX_AI_CALLS = 55000;

export class BudgetCounter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit")) || DEFAULT_MAX_AI_CALLS;
    const ceiling = Number(url.searchParams.get("ceiling")) || limit;

    let used = (await this.state.storage.get("used")) || 0;

    if (url.pathname === "/read") {
      return Response.json({ used: used, limit: limit });
    }

    if (used >= ceiling) {
      return Response.json({ allowed: false, used: used, limit: limit });
    }

    used = used + 1;
    await this.state.storage.put("used", used);
    return Response.json({ allowed: true, used: used, limit: limit });
  }
}

function budgetLimit(env) {
  const parsed = parseInt(env.MAX_AI_CALLS, 10);
  return parsed > 0 ? parsed : DEFAULT_MAX_AI_CALLS;
}

function budgetStub(env) {
  if (!env.BUDGET) return null;
  return env.BUDGET.get(env.BUDGET.idFromName("global"));
}

// Reserve the last slice of the budget for writing letters, so that
// back-translations can never starve the thing people actually came for.
async function spend(env, ceilingFraction) {
  const stub = budgetStub(env);
  if (!stub) return { allowed: true, used: 0, limit: 0, untracked: true };

  const limit = budgetLimit(env);
  const ceiling = Math.floor(limit * (ceilingFraction || 1));
  const res = await stub.fetch(
    "https://budget/spend?limit=" + limit + "&ceiling=" + ceiling
  );
  return res.json();
}

async function readBudget(env) {
  const stub = budgetStub(env);
  if (!stub) return { used: 0, limit: 0, untracked: true };
  const res = await stub.fetch("https://budget/read?limit=" + budgetLimit(env));
  return res.json();
}

function cappedResponse() {
  return json(
    {
      capped: true,
      error:
        "This site has reached the spending limit its organiser set, so it " +
        "cannot write new letters right now. You can still send your own - " +
        "the address, the subject and what to ask for are shown below."
    },
    429
  );
}

function friendlyError(error) {
  const message = (error && error.message) || String(error);
  console.log("Workers AI error", message);
  const lowered = message.toLowerCase();
  if (lowered.indexOf("capacity") !== -1 ||
      lowered.indexOf("limit") !== -1 ||
      lowered.indexOf("quota") !== -1 ||
      message.indexOf("3040") !== -1) {
    return json(
      {
        error: "The daily free limit for letter writing has been reached. " +
          "Please try again in a few hours, or copy the text and write to the " +
          "address yourself."
      },
      429
    );
  }
  return json({ error: "Something went wrong. Please try again in a moment." }, 500);
}

async function handleLetter(request, env) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }
  if (!env.AI) {
    return json({ error: "Letter writing is not configured yet." }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return json({ error: "Invalid request." }, 400);
  }

  const mode = payload && payload.mode === "explain" ? "explain" : "compose";

  if (mode === "explain") {
    const chinese = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!chinese) {
      return json({ error: "Nothing to translate yet." }, 400);
    }
    if (chinese.length > 4000) {
      return json({ error: "That letter is too long to translate back." }, 400);
    }
    const allowance = await spend(env, 0.95);
    if (!allowance.allowed) {
      return cappedResponse();
    }

    try {
      const english = stripThinking(
        await runModel(env, EXPLAIN_SYSTEM, chinese, 0.2, 1500)
      );
      if (!english) {
        return json({ error: "Could not produce an English version." }, 502);
      }
      return json({ english: tidyParagraphs(english) });
    } catch (error) {
      return friendlyError(error);
    }
  }

  const impact = typeof payload.impact === "string" ? payload.impact.trim() : "";
  const emphasis = typeof payload.emphasis === "string" ? payload.emphasis.trim() : "";
  const scope = payload.scope === "chinese" ? "chinese" : "international";
  const country = typeof payload.country === "string" ? payload.country.trim() : "";

  if (!impact) {
    return json({ error: "Please write a few words in your own voice first." }, 400);
  }
  if (impact.length + emphasis.length > MAX_INPUT) {
    return json({ error: "Please keep your notes under 1,500 characters." }, 400);
  }

  const userMessage = [
    "Identity note: " + identityNote(scope, country),
    "",
    "The writer's own notes on how violent images and videos online have affected " +
      "them (this is the raw material for part 2 - rewrite it in Chinese in their " +
      "voice, do not add events they did not describe):",
    impact,
    "",
    "Points the writer especially wants to emphasise:",
    emphasis || "(none given - keep the three recommendations evenly weighted)"
  ].join("\n");

  const allowance = await spend(env, 1);
  if (!allowance.allowed) {
    return cappedResponse();
  }

  try {
    const raw = await runModel(env, COMPOSE_SYSTEM, userMessage, 0.8, 1600);
    const letter = parseLetter(raw);

    if (!letter.body || letter.body.length < 40) {
      console.log("Short letter", JSON.stringify(raw).slice(0, 400));
      return json({ error: "The letter came back incomplete. Please try again." }, 502);
    }

    return json({ subject: letter.subject, letter: letter.body });
  } catch (error) {
    return friendlyError(error);
  }
}

// Kept for compatibility with any still-open copy of the previous page.
async function handleTranslate(request, env) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }
  if (!env.AI) {
    return json({ error: "Translation is not configured yet." }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return json({ error: "Invalid request." }, 400);
  }

  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) {
    return json({ error: "Please enter text to translate." }, 400);
  }
  if (text.length > 1800) {
    return json({ error: "Please keep your comment under 1,800 characters." }, 400);
  }

  const allowance = await spend(env, 0.95);
  if (!allowance.allowed) {
    return cappedResponse();
  }

  try {
    const translation = tidyParagraphs(
      stripThinking(await runModel(env, TRANSLATE_SYSTEM, text, 0.2, 1200))
    );
    if (!translation) {
      return json({ error: "No translation was returned." }, 502);
    }
    return json({ translation: translation });
  } catch (error) {
    return friendlyError(error);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/letter") {
      return handleLetter(request, env);
    }

    if (url.pathname === "/api/translate") {
      return handleTranslate(request, env);
    }

    if (url.pathname === "/api/health") {
      const budget = await readBudget(env);
      return json({
        ok: true,
        model: MODEL,
        aiBinding: Boolean(env.AI),
        aiCallsUsed: budget.used,
        aiCallLimit: budget.limit,
        budgetTracked: !budget.untracked
      });
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  }
};
