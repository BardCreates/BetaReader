import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { BRAND } from "@/lib/brand";
import { MODEL_VENDOR, supportEmail } from "@/lib/trust";
import { TRIAL_RETENTION_DAYS } from "@/lib/trial";

export const metadata = { title: "Privacy" };

// Plain-language policy. Have it reviewed before launch, and keep it in step with src/lib/trust.ts.
export default function PrivacyPage() {
  const email = supportEmail();
  return (
    <LegalPage title="Privacy" updated="October 20, 2026">
      <p>
        {BRAND.name} reads unpublished books. We know what that means to the people who write them, so this policy is short and the promises
        in it are firm.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>Your manuscript is yours. We never use it to train AI models, and neither does the AI company we use.</li>
        <li>We never sell, share or publish your writing, and nobody at {BRAND.name} reads it unless you ask us to help with a problem.</li>
        <li>You can delete any manuscript, or your whole account, at any time. You can download everything first.</li>
      </ul>

      <h2>What we keep</h2>
      <ul>
        <li>
          <b>Your account:</b> your name, email address and profile picture from the sign-in provider you choose (GitHub, Google or email).
        </li>
        <li>
          <b>Your books:</b> the manuscripts you upload or write here, and everything made from them: the reader’s notes, reports, story bible,
          reader journey, draft comparisons, characters and conversations.
        </li>
        <li>
          <b>Usage:</b> how many words have been read and how much AI time each request used, so we can apply your plan’s allowance.
        </li>
        <li>
          <b>Billing:</b> payments are handled by Stripe. We keep your Stripe customer and subscription ids and your plan; we never see or store
          card numbers.
        </li>
        <li>
          <b>Free sample reads without an account:</b> the chapter you paste and its notes, kept for {TRIAL_RETENTION_DAYS} days so you can come
          back to them, then deleted. To stop abuse we keep a one-way scrambled form of your network address, not the address itself.
        </li>
      </ul>

      <h2>How your writing is read</h2>
      <p>
        The reader is {MODEL_VENDOR.model}, an AI model made by {MODEL_VENDOR.company}. When you ask for a read, a chat or a grammar check, the
        text it needs is sent to {MODEL_VENDOR.company}’s API to produce the result, and the result comes back to us. Under{" "}
        <a href={MODEL_VENDOR.termsUrl} target="_blank" rel="noreferrer">
          {MODEL_VENDOR.company}’s commercial terms
        </a>{" "}
        they may not train models on it, and by default they{" "}
        <a href={MODEL_VENDOR.retentionUrl} target="_blank" rel="noreferrer">
          delete API inputs and outputs within 30 days
        </a>
        . We don’t fine-tune or train any model on your writing either.
      </p>

      <h2>Who else handles your data</h2>
      <p>Only the services we need to run {BRAND.name}, each for that purpose only:</p>
      <ul>
        <li>{MODEL_VENDOR.company}, to read your writing (as above).</li>
        <li>Our cloud host and database provider, where the app and your data are stored, encrypted in transit and at rest.</li>
        <li>Stripe, for payments.</li>
        <li>GitHub or Google, if you sign in with them.</li>
      </ul>
      <p>We don’t use advertising or tracking cookies. The only cookie is the one that keeps you signed in.</p>

      <h2>Deleting your data</h2>
      <p>
        Deleting a manuscript removes it and everything made from it from our database straight away. Deleting your account (from your{" "}
        <Link href="/account">account page</Link>) removes your account and every manuscript, and cancels any subscription. Records of AI
        usage are kept only as anonymous cost totals, with nothing that links them to you or your writing. Encrypted backups kept by our database provider are overwritten on their normal schedule, after which nothing remains.
      </p>
      <p>
        You can also download a copy of everything you’ve given us and everything the reader made, as a single file, from the account page.
      </p>

      <h2>Contact</h2>
      <p>
        {email ? (
          <>
            Questions, or a request about your data? Write to <a href={`mailto:${email}`}>{email}</a>.
          </>
        ) : (
          <>Questions, or a request about your data? Contact us from your account page.</>
        )}{" "}
        If this policy changes in a way that matters, we’ll tell you before it takes effect.
      </p>
    </LegalPage>
  );
}
