# Speak Up for Wangwang - public comment page

A one-page advocacy site for the public comment period on China’s draft
Anti-Cyberviolence Law. A visitor writes a few sentences about how the issue has
affected them; the site composes a complete letter in Simplified Chinese and
opens it in the visitor’s own mail app. Nothing is ever sent automatically - the
visitor reviews the letter and sends it themselves.

- Live: https://forwangwang.org (also www.forwangwang.org)
- Origin: https://wangwang-email.siestheapp.workers.dev
- Recipient: fanwangbaofa@cac.gov.cn
- Deadline: August 28, 2026 (the page shows a live countdown)

## What the letter contains

The letter follows the campaign guide’s five-part structure:

1. Thanks to the working group for opening a public channel, and the purpose
2. The writer’s own account of how violent online content has affected them
3. Three recommendations, always all three:
   - urgently ban animal torture videos made for profit, and act against organised
     torture groups on social media, the dark web and encrypted messaging apps,
     because the content harms minors and undermines social stability
   - platform accountability, so abuse accounts stop outlasting their reporters
   - protection for people who report cruelty, plus investigation into how their
     personal details are leaked
4. The writer’s identity - Chinese citizen, or an ordinary person from country X
5. A closing that restates the hope and thanks the staff again

Two rules the guide is strict about, and how they are met:

- The email is Simplified Chinese only. No English is sent.
- No template. The letter is composed from each writer’s own notes rather than
  filled into a fixed form, and is generated at a temperature that varies the
  wording. Two letters generated from identical input measured about 8 percent
  5-gram overlap, so they do not read as a mass mailing.

It is signed as an ordinary citizen or an ordinary person from the named country.
No real name is required, which matters when doxxing of advocates is the subject.

## Layout

```
public/index.html   static site (served by the Workers assets binding)
src/worker.js       Worker entry point; /api/letter, /api/translate, /api/health
wrangler.jsonc      Workers config (main, assets, ai bindings)
```

## How it is deployed

Cloudflare Workers, free plan, connected to this repo through the GitHub
integration - pushing to main triggers a build. wrangler.jsonc supplies
everything Cloudflare needs: main points at src/worker.js, assets.directory at
./public (bound as ASSETS), and ai.binding exposes Workers AI as AI.

Static files are matched first; anything else falls through to the Worker.
forwangwang.org and www.forwangwang.org are attached as Worker custom domains,
with TLS issued and renewed automatically.

## API

- POST /api/letter with {mode:"compose", impact, emphasis, scope, country}
  returns {subject, letter} - both Simplified Chinese.
- POST /api/letter with {mode:"explain", text} returns {english}, used by the
  "show me what this says in English" button so a writer can check what they are
  about to send. It only runs when clicked.
- POST /api/translate with {text} returns {translation}. Legacy, kept so that any
  still-open copy of the previous page keeps working.
- GET /api/health returns {ok, model, aiBinding}.

## Model and quota

Everything runs on Cloudflare Workers AI using @cf/qwen/qwen3-30b-a3b-fp8. There
is no third-party API key and no secret to manage.

Workers AI includes 10,000 neurons per day free. Composing a letter costs roughly
seven times a short translation, so budget on the order of 500 letters per day
on the free tier, and fewer if people use the English back-translation. When the
allowance runs out the endpoint returns HTTP 429 and the page says so plainly.
For a campaign push, upgrade to Workers Paid.

The project originally used the DeepL API, but DeepL closed its free API tier to
new signups in 2026.

## The email step

The primary button is a mailto: link. That silently does nothing for a large
share of real users - in-app browsers (TikTok, Instagram) commonly swallow
mailto:, some people have no default mail app, and these letters are long enough
(~6,000 characters once URL-encoded) that a few mail apps truncate them. So the
page always also offers:

- Copy the whole email (recipient, subject and body to the clipboard)
- Open in Gmail (https web compose, which works inside webviews)
- Show the email text (individual To / Subject / Message fields, each copyable)

A banner appears when an in-app browser is detected, telling the visitor to open
the page in a real browser first.

## Notes

- The page is mobile-first; most traffic arrives from TikTok/Linktree.
- Writer notes are capped at 1,500 characters.
- The site never sends mail itself; it only opens a prefilled draft.
- The letter stays editable, and the email updates as it is edited.
