import Link from "next/link";
import { MODEL_VENDOR, TRUST_POINTS } from "@/lib/trust";

/** The manuscript policy, for the pricing and landing pages. */
export function TrustBlock({ heading = "Your manuscript stays yours" }: { heading?: string }) {
  return (
    <section className="border-t border-line py-12" aria-labelledby="trust-heading">
      <h2 id="trust-heading" className="font-serif text-2xl font-semibold">
        {heading}
      </h2>
      <div className="mt-6 grid gap-8 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {TRUST_POINTS.map((p) => (
          <div key={p.title} className="border-l-2 border-line pl-4">
            <h3 className="font-serif text-base font-semibold">{p.title}</h3>
            <p className="mt-1.5 text-muted">{p.detail}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted">
        Read our{" "}
        <Link href="/privacy" className="text-accent underline">
          privacy policy
        </Link>
        , {MODEL_VENDOR.company}’s{" "}
        <a href={MODEL_VENDOR.termsUrl} className="text-accent underline" target="_blank" rel="noreferrer">
          commercial terms
        </a>{" "}
        and how they{" "}
        <a href={MODEL_VENDOR.retentionUrl} className="text-accent underline" target="_blank" rel="noreferrer">
          retain and delete API data
        </a>
        .
      </p>
    </section>
  );
}
