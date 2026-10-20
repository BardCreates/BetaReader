import { BRAND } from "@/lib/brand";

/** Anthropic's commercial terms: it may not train models on customer content sent through the API. */
export const MODEL_TERMS_URL = "https://www.anthropic.com/legal/commercial-terms";

/**
 * The manuscript promise, stated where people decide to pay. Keep every line true:
 * check it against the hosting and model providers' terms before changing either.
 */
export const PROMISE: [string, React.ReactNode][] = [
  ["Never used to train AI.", <>Your book is read by Claude, made by Anthropic, whose <a href={MODEL_TERMS_URL} className="underline hover:text-ink" target="_blank" rel="noreferrer">commercial terms</a> forbid training its models on what we send. {BRAND.name} doesn’t train anything on it either.</>],
  ["Private to you.", "Manuscripts, notes and reports belong to your account. Nobody else can open them."],
  ["Deleted in one click.", "Delete a manuscript and its text, notes and reports are removed from your account straight away."],
  ["Encrypted.", "Stored encrypted at rest (AES-256) and sent only over encrypted connections."],
  ["It reads. It never writes.", "Nothing generates or rewrites your prose; the only one-click fixes are typos. The reader quotes your passage and explains what isn’t working, and the fix is yours to write."],
];

export function ManuscriptPromise({ className = "" }: { className?: string }) {
  return (
    <section className={className} aria-labelledby="promise-title" data-testid="manuscript-promise">
      <h2 id="promise-title" className="font-serif text-2xl font-semibold">
        Your manuscript stays yours
      </h2>
      <dl className="mt-6 grid gap-x-10 gap-y-6 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {PROMISE.map(([title, text]) => (
          <div key={title} className="border-l-2 border-line pl-4">
            <dt className="font-semibold">{title}</dt>
            <dd className="mt-1 text-muted">{text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
