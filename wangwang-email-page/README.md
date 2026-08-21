# Wangwang public-comment page

This is a tiny Vercel-ready site.

## What it does

1. Visitor writes 1–3 personal sentences in English.
2. The site translates them to Simplified Chinese using DeepL.
3. The visitor reviews the translation.
4. "Open Ready-to-Send Email" launches their mail app with:
   - the official recipient pre-filled
   - the subject pre-filled
   - their Chinese translation
   - their English original
   - the standard request text
5. They add their name and send.

The site does NOT automatically send anything.

## Deploy to Vercel

1. Create a free DeepL API account and obtain an API key.
2. Put these files in a GitHub repository.
3. Import the repository into Vercel.
4. In Vercel:
   Settings → Environment Variables
5. Add:
   DEEPL_API_KEY = your DeepL API key
6. Redeploy.
7. Test on your phone.
8. Put the Vercel URL behind the top button in your Linktree.

Suggested Linktree button:

EMAIL CHINA: Speak Up for Wangwang →

## Files

- index.html — entire public-facing page
- api/translate.js — secure server-side translation endpoint
- vercel.json — small Vercel config

## Important

The DeepL key stays on the server. Do not put the API key into index.html or other browser code.

The email recipient currently hard-coded in index.html is:

fanwangbaofa@cac.gov.cn

Deadline shown on the page:

August 28, 2026

Review those details before publishing in case the official announcement changes.
