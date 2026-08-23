# forwangwang.org — project context

I'm continuing work on a small advocacy website that's already built and live. Here's
everything you need to know.

## WHAT IT IS

A one-page site supporting a campaign to submit public comments on China's draft
Anti-Cyberviolence Law. The comment period closes 28 August 2026.

A visitor writes a few sentences about how animal-cruelty content online has affected
them. The site composes a complete letter in Simplified Chinese and opens it in their
own mail app. Nothing is ever sent automatically — the visitor reviews and sends it.

- Live: https://forwangwang.org (and www.forwangwang.org)
- Origin: https://wangwang-email.siestheapp.workers.dev
- Repo: https://github.com/siestheapp/wangwang-email (public, branch: main)
- Recipient: fanwangbaofa@cac.gov.cn
- Traffic will come from TikTok and Linktree, so it's mobile-first.

## IMPORTANT CONSTRAINTS — READ FIRST

1. Access depends on where you're running. In a browser/web sandbox you have no
   GitHub write access, no Cloudflare dashboard, no browser — give me complete
   files to paste. In Claude Code on my Mac (`~/projects/wangwang-email`) you
   CAN commit and push directly — which means you can DEPLOY, so treat a push
   like a deploy: test first (see the verification bar below).
2. Deployment is automatic: a commit to `main` triggers a Cloudflare build that
   takes about 90–120 seconds. There's no separate deploy step.
3. Never touch the Cloudflare dashboard settings without asking; the rate-limit
   rule and custom domains live there, not in the repo.
4. If you give me a full file, give me the WHOLE file, not fragments, because I'll
   be replacing the file contents wholesale.

## ARCHITECTURE

Cloudflare Workers (Paid plan, $5/month), deployed from GitHub.

    public/index.html    static page, served by the Workers assets binding
    public/wangwang.jpeg hero photo (Wangwang — she was female — with her puppies)
    src/worker.js        Worker entry point, all API routes + BudgetCounter DO
    wrangler.jsonc       config: main, assets, ai, vars, durable_objects, migrations
    README.md            project documentation (kept current; update it when
                         behavior changes)

INPUT FLOW (Aug-2026 redesign): no free-writing required. Seven tappable
first-person "chips" prefill an editable notes box; tap → compose → send is
the zero-typing floor. The notes box content is the model's raw material
exactly as free-writing was. After ANY change to the input flow, re-verify
the no-template property: generate letters from identical input and measure
5-gram overlap (baseline ~4-8%; the campaign guide's no-template rule fails
if letters converge).

Static files match first; anything that isn't a static file falls through to the
Worker. Bindings: ASSETS (static files), AI (Workers AI), BUDGET (Durable Object).

## API

    POST /api/letter  {mode:"compose", impact, scope}
                      -> {subject, letter}   both Simplified Chinese
                      scope is "chinese" or "international". Country is NO
                      LONGER collected (privacy call, Aug-2026); legacy
                      country/emphasis fields from old cached pages are
                      still accepted and honored

    POST /api/letter  {mode:"explain", text} -> {english}
                      on-demand back-translation so people can read what
                      they're about to send; only runs when clicked

    POST /api/translate {text} -> {translation}
                      legacy, kept so any still-open old page keeps working

    GET  /api/health  -> {ok, model, aiBinding, aiCallsUsed, aiCallLimit,
                          budgetTracked}

When the spend cap is hit, endpoints return HTTP 429 with {capped:true, error}.

## THE MODEL

Cloudflare Workers AI, model @cf/qwen/qwen3-30b-a3b-fp8. No third-party API key
exists — nothing to leak, nothing to rotate.

    compose:   temperature 0.8, max_tokens 1600  (0.8 is deliberate, see below)
    explain:   temperature 0.2, max_tokens 1500
    translate: temperature 0.2, max_tokens 1200

We originally used DeepL, but DeepL closed its free API tier to new signups in 2026.

## WHAT THE LETTER MUST CONTAIN (campaign guide requirements)

The campaign organisers published a guide the letters must follow. Two rules are
strict, and both are load-bearing — please don't regress them:

1. THE EMAIL MUST BE SIMPLIFIED CHINESE ONLY. No English is sent.
2. NO TEMPLATE. Mass-identical emails get filtered as spam. The letter is composed
   from each writer's own notes rather than filled into a fixed form, which is why
   temperature is 0.8. Two letters generated from IDENTICAL input measured ~8%
   5-gram overlap, with different subject lines.

Five-part structure (flowing paragraphs, not numbered or labelled):

1. Thank the working group for opening a public channel; state the purpose.
2. The writer's own account of how violent online content affected their daily
   life and wellbeing — built only from their notes, never invented.
3. Three recommendations, ALL THREE in every letter:
   a. Urgently ban animal torture videos made for profit; act against organised
      torture groups on Chinese social media, the dark web and encrypted
      messaging apps. Frame it as harming minors, encouraging other criminal
      behaviour, and undermining social stability.
   b. Platform accountability — why do abuse accounts outlast the people who
      report them; platforms should detect coordinated torture material.
   c. Protection for people who report cruelty: no doxxing, harassment, rumours,
      data leaks or retaliation, plus investigation into how their names, phone
      numbers, addresses and family details are obtained and spread.
4. The writer's identity — Chinese citizen, or an ordinary person from outside
   China (no country is collected; see API note).
5. Close restating the hope, ask that it be considered, thank the staff again.

Tone must be polite and constructive throughout, never angry or accusatory.
Letters are signed as an ordinary citizen / ordinary person from the named country.
No real name is collected — deliberate, since doxxing of advocates is the subject.
"Wangwang" is a dog and must render as 旺旺, never with a surname (the model got
this wrong until the system prompt was corrected).

## SPEND PROTECTION — DO NOT WEAKEN THIS

My hard budget is $20 of usage on top of the $5/month subscription. Cloudflare has
NO spend cap, so two guards exist:

1. DURABLE OBJECT COUNTER. The Worker counts every AI call in a Durable Object
   (class BudgetCounter) and refuses new calls past MAX_AI_CALLS = 55000, set in
   wrangler.jsonc. Measured cost is ~24 neurons per composed letter and ~17 per
   back-translation, so the cap is ~$14.36 worst case — deliberate margin under $20.
   - A Durable Object is used, NOT KV, because KV caches reads ~60s and would
     undercount badly under load. Tested: 60 concurrent requests against a limit
     of 20 let exactly 20 through, no overshoot. Please don't "simplify" this to KV.
   - Input validation runs BEFORE spending, so junk requests cost nothing.
   - The back-translation stops at 95% of the cap so it can't starve letter writing.
2. RATE LIMITING RULE in Cloudflare: /api/* capped at 5 requests per 10 seconds per
   IP, action Block. Verified live — requests 1-5 return 200, 6+ return 429, and it
   recovers after the window.

When capped, the page shows the address, the deadline, the three asks and a copy
button, so people can still write and send the letter themselves.

Check usage any time: https://forwangwang.org/api/health

## THE EMAIL STEP (why it's more complex than it looks)

The primary button is a mailto: link, but mailto silently fails for a large share of
real users: in-app browsers (TikTok, Instagram) commonly swallow it, some people have
no default mail app, and these letters are long enough (~6,000 characters URL-encoded)
that some mail apps truncate. So the page ALWAYS also offers:

- Copy the whole email (recipient, subject, body to clipboard)
- Open in Gmail (https web compose, works inside webviews)
- Show the email text (To / Subject / Message fields, each copyable)

A banner appears when an in-app browser is detected (TikTok, Instagram, Facebook,
Snapchat user-agent sniffing) telling the visitor to open the page in a real browser.

There's also a live countdown to 28 August, and the letter stays editable — the
mailto and Gmail links re-sync as it's edited.

## HOW THIS WORK HAS BEEN VERIFIED SO FAR

Please hold this bar. Prior changes were tested before deploying, not after:

- the page was driven in headless Chromium, including a simulated TikTok webview
  user-agent, before each deploy
- the Worker was run locally with `wrangler dev --local` to test the budget guard
  and the concurrency behaviour
- committed files were confirmed byte-identical to tested files via git blob hash
- the live site was re-tested end-to-end after every deploy

## OPEN ITEMS

1. A native Chinese speaker should read one sample letter before this goes wide. I
   can verify the letters are structurally correct and hit every required point, but
   not how they land on a native ear in an official register.
2. Test the live site from inside the TikTok in-app browser on a real phone.
3. Consider cancelling Workers Paid back to Free after 28 August. (Checked
   Aug-23: the migrations block uses new_sqlite_classes, so the BudgetCounter
   DO survives a Free-plan downgrade — cancelling won't break the site.)
4. There's an unused empty KV namespace called `wangwang_budget` in the Cloudflare
   dashboard, left over from an abandoned approach. Safe to delete.

## RESOLVED (Aug-23-2026, Claude Code session on the Mac)

- Chips redesign + country dropped + hero photo shipped and live-verified
  (identical-input overlap ~4%, legacy cached-page payloads still work).
- Rate-limit 429 (non-JSON) vs budget-cap 429 (JSON) now branch correctly in
  the client; rate-limited visitors get a wait-ten-seconds message.
- Truncated Qwen3 reasoning can no longer leak into a letter (unclosed
  <think> → "try again" error).
- Countdown pinned to end of Aug-28 Beijing time; page shows a closed state
  after the deadline.
- Recipient address + deadline independently confirmed against the CAC
  announcement (original ChatGPT research, Aug-21).
- Decided against a privacy note about the sender's own email address.

## WHAT I MAY WANT NEXT

I'll tell you. Please don't start changing things unprompted — ask me what I want
first, and flag anything above that you think is wrong.
