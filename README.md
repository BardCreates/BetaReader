# Readthrough

An AI beta reader for authors: **AI that reads, never writes.** Upload a manuscript and it reads the book **in order, chapter by chapter**, the way a real first reader would: where it was hooked, where it drifted, what confused it, what it's dying to know. Every reaction and issue is anchored to the exact passage, with an explanation of how to approach the fix; the author writes the fix. When it finishes, it writes a whole-book editorial letter and revision plan. Bring back the next draft and it reads only what changed and shows what the revision fixed.

v1 is the loop **read → continuity ledger → re-import → draft changes**. Product positioning and the reasons behind v1's scope are in the competitive brief (claude.ai Project doc `claude/competitive-brief.md`).

## Brand

The product is called **Readthrough** (the repository keeps its original name). The name and tagline live in `src/lib/brand.ts`; the logo mark (a manuscript page with a red margin bar beside one line) is `src/components/Logo.tsx`, with the favicon in `src/app/icon.svg`. Colours and type are tokens in `src/app/globals.css`: ink blue on a cool paper white, with the editor's red pen (`--color-pen`) used only where something is marked. Headings and prose are set in Literata; the interface in Source Sans 3.

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
- **Reads, never writes.** `CORE_PRINCIPLES` (src/lib/reader/prompts.ts) forbid replacement prose: notes, report fixes and continuity suggestions describe an approach, never a rewrite. There are no generate or rewrite buttons.
- **Reader map.** Each read records the passage where attention dipped most (`ChapterReview.dropOff`, only kept if the quote is found on the page). `/manuscripts/[id]/map` shows engagement per chapter with that passage and marks likely drop points (`src/lib/reader/dropOff.ts`).
- **Revision check.** Re-reading a chapter checks each earlier issue (fixed / partly / still there) and compares engagement. Every re-read records a revision check, even with no earlier issues.
- **Draft changes.** Each re-import that changes anything bumps `Manuscript.draft` and records a `Draft` row (titles changed / added / removed); each read stamps `ChapterReview.draft`. `/manuscripts/[id]/drafts` compares the current draft's reads with the last (`compareDraft` in src/lib/manuscript/drafts.ts): issues fixed, engagement moves, continuity problems, and changed chapters not read yet.
- **Ask about a note.** `FEATURES.noteChat`. Each note has one conversation (`Conversation.noteId`) where the author can question or argue with it; the reader sees the note, that chapter and its memory going in, and still can't see later chapters (`noteDiscussionPrompt`, src/app/api/notes/[nid]/ask). Uses the chat allowance; usage kind `discuss`. Conversations go when the note does (a re-read replaces a chapter's notes).
- **Proofread.** On demand, on a smaller model (`ANTHROPIC_LINE_MODEL`). Only spelling, grammar and punctuation come with a one-click fix; word choice, repetition, clarity and style are flags with no replacement, for the author to rewrite (`src/lib/reader/lineSuggestions.ts`).
- **Interview your cast.** Characters are found in the manuscript (or added by hand) and answer in voice, grounded in the passages they appear in (`src/lib/reader/characterContext.ts`) and the story-bible facts about them (`factsAbout`); anything the page doesn't establish is marked ⟦like this⟧ and shown as a gap. Guided modes (interrogate a motivation, stress-test a backstory, what they'd never do) live in `src/lib/reader/interview.ts` and are stored per conversation (`Conversation.mode`). Knowledge can be limited to a chapter; replies can be saved to the character's notes.
- **Editor chat (off in v1).** Switched off in `src/lib/features.ts` to keep v1 focused on the read; flip `editorChat` to bring it back. Streams replies with the book report, chapter summaries and (for chapter conversations) the full chapter text and notes in context (`src/lib/reader/editor.ts`).
- **Update from a new draft.** Revise in Dabble, Word or Google Docs, export, and upload the new version (`/manuscripts/[id]/update`). Chapters are matched to the existing ones in order, by shared text and title (`src/lib/manuscript/match.ts`), so inserted, removed and renamed chapters line up; you see a preview before anything changes. Unchanged chapters keep their notes and reads; **Read the changes** reads only new and edited chapters, then refreshes the report.
- **Continuity ledger.** Each read records the concrete facts a chapter establishes (`StoryFact`: traits, injuries, timeline, places, rules of the world) and checks the chapter against facts from earlier chapters only. Contradictions become `continuity` notes anchored to the passage, with the earlier fact and its chapter stored on the note (`conflictFact`, `conflictChapter`). `/manuscripts/[id]/bible` shows each problem as established → contradicted, settled ones, and the facts by subject.
- **Pitch kit (deferred).** Off in v1 via `FEATURES.pitchKit`: it writes prose for the author. Logline, blurb, synopsis, query letter, comps and pitch notes (`src/lib/reader/pitch.ts`, `/manuscripts/[id]/pitch`); flip the switch to bring it back.
- **Revise in the app.** A left menu lists every chapter like a book outline. Each chapter opens in an editor (paragraphs, bold, italic, scene breaks) that autosaves. The reader's notes stay beside the text and their highlights follow your edits; chapters you've changed since their last read are marked, and **Re-read this chapter** gets fresh feedback when you're ready. Chapters are stored as formatted documents (`Chapter.doc`) with a plain-text copy (`Chapter.content`) that the AI reads and notes anchor to — see `src/lib/manuscript/doc.ts`.

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

### After pulling changes

Run `npm run update`. It installs any new packages, applies new database migrations, and regenerates the database client. (`npm run dev` also regenerates the client on start.)

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm test` | Unit tests (splitting, anchoring, matching, drafts, prompts, billing) |
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
src/app/manuscripts/[id]/map             reader map (engagement + drop-off passages)
src/app/manuscripts/[id]/drafts          draft changes (this draft vs the last)
src/app/manuscripts/[id]/bible           continuity ledger + story bible
src/app/manuscripts/[id]/pitch           pitch kit (off in v1)
src/app/api/notes/[nid]/ask              ask the reader about one note (streaming)
src/lib/manuscript              import, chapter splitting, quote anchoring (+ tests)
src/lib/reader                  prompts, personas, schemas, pipeline, editor context
src/lib/plans.ts                plan limits (free / author / pro)
```

## Billing & cost control

Plans live in `src/lib/plans.ts`: Free (10,000 words once), Author ($19/mo, $149/yr), Pro ($39/mo, $299/yr), plus a one-off $29 **book pass**. Customers only ever pay the plan price: there are no overage charges. Limits stop work instead.

Three layers keep costs bounded (`src/lib/billing`):

1. **Allowances, reserved before work starts.** Words read, grammar-check words, character chat messages and pitch kits are taken from the monthly allowance (then book-pass credit) inside a row-locked transaction *before* the AI is called, and given back if the work fails. A full read reserves chapter by chapter, so it pauses cleanly at the limit and resumes after an upgrade. Paid allowances reset monthly (yearly plans too); Free never resets. One read at a time per user.
2. **Spend ceiling per user.** Before every AI call, its worst-case cost is held against the user's ceiling in the same row-locked step, then settled to the real cost from token counts (`cost.ts`) and logged in `AiUsage`. Calls fired in parallel each hold their share, so together they can't pass the plan's `costCapUsd`.
3. **Daily budget for the whole app.** `AI_DAILY_BUDGET_USD` pauses new AI work for everyone once the day's spend reaches it. Also set a monthly spend limit on your API key's workspace in the Claude Console.

### Setting up Stripe

1. In the Stripe dashboard (start in **test mode**), create products and prices:
   - Author: recurring $19/month and $149/year
   - Pro: recurring $39/month and $299/year
   - Book pass: one-time $29
2. Copy each price id (`price_...`) and your secret key into `.env` (see `.env.example`).
3. Add a webhook endpoint at `https://<your app>/api/stripe/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` and `charge.refunded`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`. Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
4. In Stripe's customer portal settings, allow switching between the four subscription prices and cancelling.

Plans are matched to subscriptions by price id, so changing a price in Stripe only needs the env var updated. The webhook always re-reads the subscription from Stripe (events can arrive out of order), checkout refuses to start a second subscription, and book passes are credited once per checkout session (including 100% promotion codes and delayed payment methods) and removed on a full refund.

## Roadmap to SaaS

- **Durable background jobs.** Reading currently runs in-process via `after()`. That's fine locally and on a long-running Node server, but serverless platforms cap function duration. Move `readManuscript` to a job runner (Inngest, Trigger.dev, or a queue + worker) — it's already resumable chapter by chapter.
- **More formats.** PDF and EPUB import; Scrivener via .docx export works today.
- **Export.** Download the report and notes as .docx/PDF.
- **Comparisons.** Show how engagement changed between reads after a revision.
- **Privacy.** Manuscripts are private per account, and the pricing page states the manuscript promise (`src/components/ManuscriptPromise.tsx`): not used for training (Anthropic's commercial terms), one-click delete, encrypted at rest by Neon (AES-256). Before launch: a privacy policy that matches it, including how long backups keep deleted data.
