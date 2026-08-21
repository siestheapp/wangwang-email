# Speak Up for Wangwang - public comment page

A one-page advocacy site. A visitor writes 1-3 sentences in English, the page
translates them to Simplified Chinese with DeepL (server-side), and then opens
a pre-filled email in the visitor’s own mail app. Nothing is ever sent
automatically - the visitor reviews the message and sends it themselves.

- Recipient: fanwangbaofa@cac.gov.cn
- Subject: Public Comment on the Proposed Anti-Cyberviolence Law
- Deadline shown on the page: August 28, 2026

## Layout

```
public/index.html            static site (served by the Workers assets binding)
src/worker.js                Worker entry point; handles POST /api/translate
wrangler.jsonc               Workers config (main + assets)
functions/api/translate.js   legacy Cloudflare Pages Function, kept for reference
```

## Deploy (Cloudflare Workers, free plan)

The repo is connected to Cloudflare through the GitHub integration, so pushing
to main triggers a build. wrangler.jsonc supplies everything Cloudflare needs:

- main points at src/worker.js
- assets.directory points at ./public
- assets.binding exposes the static files to the Worker as ASSETS

Static files are matched first. Anything that is not a static file (that is,
/api/translate) falls through to the Worker.

### Required secret

In the Cloudflare dashboard:

Workers & Pages -> wangwang-email -> Settings -> Variables and Secrets -> Add

- Name: DEEPL_API_KEY
- Type: Secret
- Value: your DeepL API key

Get a key at https://www.deepl.com/pro-api (the free tier is enough).
Free-tier keys end in :fx, and the Worker automatically points at
api-free.deepl.com for those and api.deepl.com otherwise.

Deploy again after adding the secret so the running Worker picks it up.

### Checking it works

- GET /api/health returns {"ok":true,"deeplConfigured":true} once the secret is set.
- POST /api/translate with {"text":"..."} returns {"translation":"..."}.

## Notes

- The DeepL key stays server-side. It is never included in client code.
- The page is mobile-first; most traffic arrives from TikTok/Linktree.
- Comments are capped at 1,800 characters.
- The site never sends mail itself; it only opens a prefilled draft.
