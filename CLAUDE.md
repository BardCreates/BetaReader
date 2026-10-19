# Beta Reader — notes for Claude

AI beta reader for authors. Next.js 15 App Router + Prisma/Postgres + Auth.js + Anthropic SDK. See README.md for the architecture.

- Run `npm test` and `npm run typecheck` before committing.
- The reader pipeline lives in `src/lib/reader/pipeline.ts`. Chapters are read strictly in order; each read returns a `memory` that is the only context passed to the next chapter. Don't give the reader access to later chapters.
- Model output is structured via forced tool calls. If you change a schema in `src/lib/reader/schemas.ts`, update both the zod schema and the JSON `input_schema` beside it.
- Feedback tone rules live in `CORE_PRINCIPLES` in `src/lib/reader/prompts.ts`: honest, specific, quote exact passages, fixes not just flags.
- Every query of user data must be scoped to the signed-in user (`requireUser()` / `currentUserId()`).
- Model is configured with `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`).
