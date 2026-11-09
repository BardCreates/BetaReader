/**
 * Deterministic graders for chapter-reader output. Pure functions: no API calls, no DB.
 */
import { findQuote } from "@/lib/manuscript/anchor";
import type { ChapterFeedback } from "@/lib/reader/schemas";
import type { EvalCase, Expectation } from "./cases";

export type CheckResult = { label: string; pass: boolean; detail: string };

/** Does `quote` land (at least partly) inside `span` within `text`? An empty span means "anywhere". */
export function quoteInSpan(text: string, quote: string, span: string): boolean {
  const q = findQuote(text, quote);
  if (!q) return false;
  if (!span) return true;
  const s = text.indexOf(span);
  if (s < 0) throw new Error(`Eval case bug: span not found in chapter text: "${span.slice(0, 40)}..."`);
  const e = s + span.length;
  return q.start < e && q.end > s;
}

export function checkExpectation(exp: Expectation, out: ChapterFeedback, text: string): CheckResult {
  switch (exp.type) {
    case "flagsIssue": {
      const hits = out.notes.filter(
        (n) => n.kind === "issue" && (exp.categories as string[]).includes(n.category) && quoteInSpan(text, n.quote, exp.span),
      );
      return { label: exp.label, pass: hits.length > 0, detail: hits.length ? `${hits.length} matching issue(s): ${hits.map((h) => h.category).join(", ")}` : "no matching issue note" };
    }
    case "flagsContinuity": {
      const hits = out.continuity.filter((c) => quoteInSpan(text, c.quote, exp.span));
      const cited = hits.some((c) => (c.conflictsWith ?? "").includes(exp.factId));
      return {
        label: exp.label,
        pass: hits.length > 0,
        detail: hits.length ? `caught${cited ? `, cites ${exp.factId}` : `, but didn't cite ${exp.factId}`}` : `missed (${out.continuity.length} other continuity entries)`,
      };
    }
    case "resolvesThread": {
      const r = out.resolvedThreads.find((t) => t.id === exp.threadId);
      return { label: exp.label, pass: !!r, detail: r ? `${r.outcome}: ${r.resolution.slice(0, 80)}` : "not resolved" };
    }
    case "engagementAtMost":
      return { label: exp.label, pass: out.engagement <= exp.max, detail: `engagement ${out.engagement}` };
    case "doesNotSay": {
      const hay = [out.reaction, out.summary, ...out.strengths].join(" ").toLowerCase();
      const found = exp.phrases.filter((p) => hay.includes(p.toLowerCase()));
      return { label: exp.label, pass: found.length === 0, detail: found.length ? `said: ${found.join(", ")}` : "ok" };
    }
    case "praisesAtLeast": {
      const n = out.notes.filter((x) => x.kind === "praise").length;
      return { label: exp.label, pass: n >= exp.min, detail: `${n} praise note(s)` };
    }
    case "majorIssuesAtMost": {
      const n = out.notes.filter((x) => x.kind === "issue" && x.severity === 3).length;
      return { label: exp.label, pass: n <= exp.max, detail: `${n} severity-3 issue(s)` };
    }
    case "memoryOmits": {
      const found = exp.phrases.filter((p) => out.memory.toLowerCase().includes(p.toLowerCase()));
      return { label: exp.label, pass: found.length === 0, detail: found.length ? `memory mentions: ${found.join(", ")}` : "ok" };
    }
  }
}

/** Quality metrics computed on every output, whatever the case. */
export function generalMetrics(out: ChapterFeedback, text: string) {
  const quotes = [...out.notes.map((n) => n.quote), ...out.continuity.map((c) => c.quote)];
  const anchored = quotes.filter((q) => findQuote(text, q) !== null).length;
  const issues = out.notes.filter((n) => n.kind === "issue");
  const withFix = issues.filter((n) => (n.suggestion ?? "").trim().length > 0).length;
  return {
    /** Share of quotes the app can highlight. Unanchored notes are invisible to the author. */
    quoteFidelity: quotes.length ? anchored / quotes.length : 1,
    /** "Fixes, not just flags": share of issues with a concrete suggestion. */
    fixRate: issues.length ? withFix / issues.length : 1,
    notes: out.notes.length,
    issues: issues.length,
    praise: out.notes.filter((n) => n.kind === "praise").length,
    engagement: out.engagement,
  };
}

export function gradeCase(c: EvalCase, out: ChapterFeedback) {
  const checks = c.expect.map((e) => checkExpectation(e, out, c.chapter.content));
  return { checks, metrics: generalMetrics(out, c.chapter.content) };
}
