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
- **Editor chat (off in v1).** Switched off in `src/lib/features.ts` to keep v1 focused on the read; flip `editorChat` to bring it back. Streams replies with the book report, chapter summaries and (for chapter conversations) the full chapter text and notes in context (`src/lib/reader/editor.ts`).
- **Revise & re-read.** Edit a chapter in the app and it's re-read with the memory from the chapter before it.

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
src/lib/manuscript              import, chapter splitting, quote anchoring (+ tests)
src/lib/reader                  prompts, personas, schemas, pipeline, editor context
src/lib/plans.ts                plan limits (free / author / pro)
```

## Roadmap to SaaS

- **Durable background jobs.** Reading currently runs in-process via `after()`. That's fine locally and on a long-running Node server, but serverless platforms cap function duration. Move `readManuscript` to a job runner (Inngest, Trigger.dev, or a queue + worker) — it's already resumable chapter by chapter.
- **Billing.** `User.plan`, `User.stripeCustomerId` and `User.wordsReadTotal` are in place, and limits are enforced on upload (`src/lib/plans.ts`). Next: Stripe Checkout + customer portal + webhook that sets `plan`.
- **Cost controls.** Token usage is stored per chapter and report. Add per-plan monthly word quotas and show usage in the UI.
- **More formats.** PDF and EPUB import; Scrivener via .docx export works today.
- **Export.** Download the report and notes as .docx/PDF.
- **Comparisons.** Show how engagement changed between reads after a revision.
- **Privacy.** Manuscripts are private per account. Before launch: a privacy policy stating manuscripts aren't used for training, data deletion, and encryption at rest from your database host.
