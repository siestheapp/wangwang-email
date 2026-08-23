# Speak Up for Wangwang - public comment page

A one-page advocacy site for the public comment period on China's draft
Anti-Cyberviolence Law. A visitor taps the statements that are true for them
(and can edit or add their own words); the site composes a complete letter in
Simplified Chinese and opens it in their own mail app. Nothing is ever sent
automatically - the visitor reviews the letter and sends it themselves.

- Live: https://forwangwang.org (also www.forwangwang.org)
- Origin: https://wangwang-email.siestheapp.workers.dev
- Recipient: fanwangbaofa@cac.gov.cn
- Deadline: August 28, 2026, end of day Beijing time (the page counts down to
  that instant and shows a closed state after it passes)

## The flow

Three taps minimum, no typing required: tap a chip, tap compose, tap send.

- Seven tappable first-person statements ("chips") prefill an editable notes
  box. Whatever ends up in the box - tapped, edited or freely written, any
  language - is sent to the model as the writer's own notes.
- The only other input is one choice: writing as a Chinese citizen, or as an
  ordinary person from outside China. No country is collected, deliberately -
  it was an unnecessary piece of personal information. (The API still honors a
  `country` value if an old cached page sends one.)
- No real name is collected either, which matters when doxxing of advocates is
  part of the subject.

## What the letter contains

The letter follows the campaign guide's five-part structure: thanks and
purpose; the writer's own account, built only from their notes; three
recommendations always present (ban for-profit animal torture content and act
against organised torture groups; platform accountability; protection for
people who report cruelty); the writer's identity; a closing that restates the
hope and thanks the staff.

Two rules the guide is strict about, and how they are met:

- The email is Simplified Chinese only. No English is sent.
- No template. The letter is composed from the notes box at temperature 0.8.
  Verified after the chips redesign: two letters generated live from the
  IDENTICAL chip combination measured ~4% 5-gram overlap (Jaccard), with
  different subject lines - the same bar the free-writing version passed.

## Layout

```
public/index.html   static page: chips UI, letter review, email step
public/wangwang.jpeg  hero photo (Wangwang and her puppies)
src/worker.js       Worker entry point; /api/letter, /api/translate,
                    /api/health, and the BudgetCounter Durable Object
wrangler.jsonc      config: main, assets, ai, vars (MAX_AI_CALLS),
                    durable_objects + migrations, observability
```

Static files are matched first; anything else falls through to the Worker.
Deployed on Cloudflare Workers (Paid plan) from this repo - pushing to main
triggers a build, live roughly 90-120 seconds later. Both domains are Worker
custom domains with automatic TLS.

## API

- POST /api/letter {mode:"compose", impact, scope} -> {subject, letter},
  both Simplified Chinese. scope is "chinese" or "international"; optional
  country and emphasis fields from older cached pages are still accepted.
- POST /api/letter {mode:"explain", text} -> {english} - on-demand
  back-translation so people can read what they are about to send.
- POST /api/translate {text} -> {translation} - legacy, kept so any
  still-open old page keeps working.
- GET /api/health -> {ok, model, aiBinding, aiCallsUsed, aiCallLimit,
  budgetTracked}

## Model

Cloudflare Workers AI, @cf/qwen/qwen3-30b-a3b-fp8. No third-party API key.
Compose runs at temperature 0.8 (deliberate - wording variation is the
anti-template defense); explain and translate at 0.2. Qwen3 can emit a
reasoning block before its answer; the Worker strips it, and a generation cut
off mid-reasoning (opening think-tag, no close) is rejected with a "try again"
error rather than ever reaching a visitor.

## Spend protection - do not weaken or "simplify" this

Hard budget: $20 of usage on top of the $5/month plan. Cloudflare has no spend
cap of its own, so two guards exist:

1. DURABLE OBJECT COUNTER. Every AI call is counted in the BudgetCounter
   Durable Object; new calls are refused past MAX_AI_CALLS = 55,000 (set in
   wrangler.jsonc). The dollar math this rests on: measured cost is ~24
   neurons per composed letter and ~17 per back-translation, so 55,000 calls
   is ~$14.36 worst case - deliberate margin under $20. **If max_tokens or the
   model ever changes, re-measure neurons per call and re-derive the cap -
   the number bounds dollars only through that measurement.**
   - A Durable Object, NOT KV: KV caches reads for ~60s and would undercount
     badly under load. Tested: 60 concurrent requests against a limit of 20
     let exactly 20 through. The migrations block uses new_sqlite_classes, so
     the DO also survives a future downgrade to the Free plan.
   - Input validation runs before spending; junk requests cost nothing.
   - Back-translation stops at 95% of the cap so it can never starve letter
     writing.
2. RATE LIMITING RULE in Cloudflare: /api/* capped at 5 requests per 10
   seconds per IP, action Block. That block returns a non-JSON 429 - distinct
   from the budget cap's JSON {capped:true} 429 - and the page branches on
   the two: rate-limited visitors get a wait-ten-seconds message, capped
   visitors get the full fallback panel (address, deadline, the three asks,
   copy button) so they can still write the letter themselves.

Check usage any time: https://forwangwang.org/api/health

## The email step

The primary button is a mailto: link, which silently fails for a large share
of real users (in-app browsers swallow it; some phones have no mail app; the
letters are ~6,000 characters URL-encoded, which some apps truncate). So the
page always also offers: copy the whole email, open in Gmail (https compose,
works inside webviews), and show the email text field-by-field. A banner
warns visitors browsing inside TikTok/Instagram/etc. to open a real browser.

## Verification practice

Changes are tested before deploying, not after: the Worker's handlers run
under Node with a stubbed AI binding (validation paths, legacy payloads,
thinking-guard edge cases), both files are syntax-checked, and after every
deploy the live site is re-tested end-to-end - including, after any change to
the input flow, regenerating letters from identical input and re-measuring
5-gram overlap against the ~8% baseline.
