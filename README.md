# Beta Reader

An AI beta reader and developmental editor for authors. Upload a manuscript and it reads the book **in order, chapter by chapter**, the way a real first reader would: where it was hooked, where it drifted, what confused it, what it's dying to know. Every reaction and issue is anchored to the exact passage, with a concrete suggestion for the fix. When it finishes, it writes a whole-book editorial letter and revision plan. Revise a chapter in the app and it's re-read with the memory of everything before it.

## How it works

```
upload (.docx/.txt/.md or paste)
   └─ split into chapters (src/lib/manuscript/split.ts)
        └─ read chapter 1 ─▶ notes + reaction + reader memory
             └─ read chapter 2 (with memory of 1) ─▶ …
                  └─ … last chapter
                       └─ whole-book report (letter, problems + fixes, characters, threads, pacing, revision plan)
```

- **Reader memory.** After each chapter the model writes a ~400-word memory of the story so far, which is all it "remembers" going into the next chapter. That's what lets it notice dropped threads, unpaid setups and real confusion, instead of reading with hindsight.
- **Structured output.** Each read is forced through a tool call (`submit_chapter_read`, `submit_book_report`) and validated with zod (`src/lib/reader/schemas.ts`).
- **Anchored notes.** The model quotes passages; `src/lib/manuscript/anchor.ts` finds them in the text, tolerating curly/straight quotes, dashes, whitespace and ellipses, so they can be highlighted inline.
- **Personas.** Genre reader, developmental editor, or line editor (`src/lib/reader/personas.ts`). Same honesty rules, different lens.
- **Reader journey.** Every question and prediction the reader carries is tracked from the chapter it came up in to the chapter that settled it (`ReaderThread`). The journey page shows what was never answered, which twists were seen coming, and which surprised them.
- **Intent check.** Authors note what a chapter should do; the reader sees it only after forming its own reaction and reports whether it landed.
- **Revision check.** Re-reading a chapter checks each earlier issue (fixed / partly / still there) and compares engagement.
- **Grammar & style.** On demand, on a smaller model (`ANTHROPIC_LINE_MODEL`); suggestions are underlined in the editor with accept/dismiss (`src/lib/reader/lineEdit.ts`).
- **Character chat.** Characters are found in the manuscript (or added by hand) and talk in voice, grounded in the passages they appear in (`src/lib/reader/characterContext.ts`); invented details are marked ⟦like this⟧; knowledge can be limited to a chapter; replies can be saved to the character's notes.
- **Editor chat (off in v1).** Switched off in `src/lib/features.ts` to keep v1 focused on the read; flip `editorChat` to bring it back. Streams replies with the book report, chapter summaries and (for chapter conversations) the full chapter text and notes in context (`src/lib/reader/editor.ts`).
- **Update from a new draft.** Revise in Dabble, Word or Google Docs, export, and upload the new version (`/manuscripts/[id]/update`). Chapters are matched to the existing ones in order, by shared text and title (`src/lib/manuscript/match.ts`), so inserted, removed and renamed chapters line up; you see a preview before anything changes. Unchanged chapters keep their notes and reads; **Read the changes** reads only new and edited chapters, then refreshes the report.
- **Continuity & story bible.** Each read records the concrete facts a chapter establishes (`StoryFact`: traits, injuries, timeline, places, rules of the world) and checks the chapter against facts from earlier chapters only. Contradictions become `continuity` notes anchored to the passage, citing the earlier fact. `/manuscripts/[id]/bible` lists the problems and the facts by subject.
- **Pitch kit.** After a full read: logline, back-cover blurb, synopsis, query letter, selling points, comp suggestions, and honest notes on what made the book hard to pitch (`src/lib/reader/pitch.ts`, `/manuscripts/[id]/pitch`). Built from the read's summaries and report, not the full text, so it's cheap.
- **Write in the app.** A left menu lists every chapter like a book outline. Each chapter opens in an editor (paragraphs, bold, italic, scene breaks) that autosaves. The reader's notes stay beside the text and their highlights follow your edits; chapters you've changed since their last read are marked, and **Re-read this chapter** gets fresh feedback when you're ready. Chapters are stored as formatted documents (`Chapter.doc`) with a plain-text copy (`Chapter.content`) that the AI reads and notes anchor to — see `src/lib/manuscript/doc.ts`.

## Stack

Next.js 16 (App Router, server actions) · TypeScript · Tailwind CSS 4 · Prisma 7 + Postgres (via `@prisma/adapter-pg`) · Auth.js v5 (GitHub, Google, dev email login) · Anthropic API (`@anthropic-ai/sdk`).

## Getting started

Requirements: Node 22+, a Postgres database (local, or a free one from Neon/Supabase), and an Anthropic API key.

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL, AUTH_SECRET and ANTHROPIC_API_KEY
npx auth secret               # writes AUTH_SECRET for you
npm run db:migrate             # creates the tables from prisma/migrations
npm run dev
```

Open http://localhost:3000, sign in with the dev email login (enabled by `AUTH_DEV_LOGIN=true`, development only), and upload a manuscript.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm test` | Unit tests (chapter splitting, quote anchoring) |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build |
| `npm run db:migrate` | Create/apply a Prisma migration in development |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:studio` | Browse the database |

## Project layout

```
prisma/schema.prisma            data model (client is generated into src/generated/prisma)
prisma.config.ts                Prisma CLI config (reads DATABASE_URL from .env)
, manuscripts, chapters, reviews, notes, report, conversations
src/auth.ts                     Auth.js config + requireUser()
src/app/actions.ts              server actions: upload, start reading, revise chapter, note status, delete
src/app/api/manuscripts/[id]/chat/route.ts   streaming editor chat
src/app/dashboard               manuscript list
src/app/manuscripts/new         upload form
src/app/manuscripts/[id]        overview + book report
src/app/manuscripts/[id]/chapters/[n]   chapter text with inline notes
src/app/manuscripts/[id]/editor          editor conversations
src/app/manuscripts/[id]/update          update from a new draft (preview + apply)
src/app/manuscripts/[id]/bible           story bible + continuity problems
src/app/manuscripts/[id]/pitch           pitch kit
src/lib/manuscript              import, chapter splitting, quote anchoring (+ tests)
src/lib/reader                  prompts, personas, schemas, pipeline, editor context
src/lib/plans.ts                plan limits (free / author / pro)
```

## Billing & cost control

Plans live in `src/lib/plans.ts`: Free (10,000 words once), Author ($19/mo, $180/yr), Pro ($39/mo, $372/yr), plus a one-off $29 **book pass**. Customers only ever pay the plan price: there are no overage charges. Limits stop work instead.

Three layers keep costs bounded (`src/lib/billing`):

1. **Allowances, reserved before work starts.** Words read, grammar-check words, character chat messages and pitch kits are taken from the monthly allowance (then book-pass credit) inside a row-locked transaction *before* the AI is called, and given back if the work fails. A full read reserves chapter by chapter, so it pauses cleanly at the limit and resumes after an upgrade. Paid allowances reset monthly (yearly plans too); Free never resets. One read at a time per user.
2. **Spend ceiling per user.** Every AI call is logged in `AiUsage` with its real cost from token counts (`cost.ts`). Once a user's spend for the period reaches their plan's `costCapUsd`, new AI work is refused, whatever the allowances say.
3. **Daily budget for the whole app.** `AI_DAILY_BUDGET_USD` pauses new AI work for everyone once the day's spend reaches it. Also set a monthly spend limit on your API key's workspace in the Claude Console.

### Setting up Stripe

1. In the Stripe dashboard (start in **test mode**), create products and prices:
   - Author: recurring $19/month and $180/year
   - Pro: recurring $39/month and $372/year
   - Book pass: one-time $29
2. Copy each price id (`price_...`) and your secret key into `.env` (see `.env.example`).
3. Add a webhook endpoint at `https://<your app>/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`. Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
4. In Stripe's customer portal settings, allow switching between the four subscription prices and cancelling.

Plans are matched to subscriptions by price id, so changing a price in Stripe only needs the env var updated.

## Roadmap to SaaS

- **Durable background jobs.** Reading currently runs in-process via `after()`. That's fine locally and on a long-running Node server, but serverless platforms cap function duration. Move `readManuscript` to a job runner (Inngest, Trigger.dev, or a queue + worker) — it's already resumable chapter by chapter.
- **More formats.** PDF and EPUB import; Scrivener via .docx export works today.
- **Export.** Download the report and notes as .docx/PDF.
- **Comparisons.** Show how engagement changed between reads after a revision.
- **Privacy.** Manuscripts are private per account. Before launch: a privacy policy stating manuscripts aren't used for training, data deletion, and encryption at rest from your database host.
