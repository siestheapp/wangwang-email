# Wangwang email page — Cloudflare Pages

## Deploy from GitHub (recommended because this site uses a Pages Function)

Repository layout:
- public/index.html
- functions/api/translate.js

Cloudflare Pages settings:
- Framework preset: None
- Build command: leave blank
- Build output directory: public

Then add the translation secret:
Settings → Variables and Secrets → Add
Name: DEEPL_API_KEY
Value: your DeepL API key
Type: Secret

Redeploy after adding the secret.

The public page POSTs to /api/translate. Cloudflare Pages routes that to
functions/api/translate.js.

The email recipient is:
fanwangbaofa@cac.gov.cn

Deadline displayed:
August 28, 2026

Important: Direct Upload deployments on Cloudflare Pages do not support
Pages Functions in the same way as Git-integrated Pages projects. Use the
GitHub-connected deployment path for this version.
