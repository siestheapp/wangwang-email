# Speak Up for Wangwang - public comment page

A one-page advocacy site. A visitor writes 1-3 sentences in English, the page
translates them to Simplified Chinese server-side, and then opens a pre-filled
email in the visitor’s own mail app. Nothing is ever sent automatically - the
visitor reviews the message and sends it themselves.

- Live: https://wangwang-email.siestheapp.workers.dev
- Recipient: fanwangbaofa@cac.gov.cn
- Subject: Public Comment on the Proposed Anti-Cyberviolence Law
- Deadline shown on the page: August 28, 2026

## Layout

```
public/index.html   static site (served by the Workers assets binding)
src/worker.js       Worker entry point; handles POST /api/translate
wrangler.jsonc      Workers config (main, assets, ai bindings)
```

## How it is deployed

Cloudflare Workers, free plan, connected to this repo through the GitHub
integration - pushing to main triggers a build. wrangler.jsonc supplies
everything Cloudflare needs:

- main points at src/worker.js
- assets.directory points at ./public, exposed to the Worker as ASSETS
- ai.binding exposes Workers AI to the Worker as AI

Static files are matched first. Anything that is not a static file (that is,
/api/translate) falls through to the Worker.

## Translation

Translation runs on Cloudflare Workers AI using @cf/qwen/qwen3-30b-a3b-fp8.

There is no third-party API key and no secret to manage. Workers AI includes a
free allowance of 10,000 neurons per day, which is on the order of a few
thousand short translations. If that allowance is exhausted the endpoint
returns HTTP 429 and the page shows a plain "try again later" message.

The project originally used the DeepL API, but DeepL closed its free API tier
to new signups in 2026. To move back to DeepL (or any other provider), replace
the env.AI.run call in src/worker.js - the request and response shape of
/api/translate does not need to change.

## Checking it works

- GET /api/health returns {"ok":true,"model":"...","aiBinding":true}
- POST /api/translate with {"text":"..."} returns {"translation":"..."}

## Notes

- The page is mobile-first; most traffic arrives from TikTok/Linktree.
- Comments are capped at 1,800 characters.
- The site never sends mail itself; it only opens a prefilled draft.
- The English original is always included alongside the translation so the
  intended meaning survives any machine-translation error.
