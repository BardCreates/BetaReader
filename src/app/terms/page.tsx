import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { BRAND } from "@/lib/brand";
import { supportEmail } from "@/lib/trust";

export const metadata = { title: "Terms" };

// Plain-language terms. Have them reviewed before launch.
export default function TermsPage() {
  const email = supportEmail();
  return (
    <LegalPage title="Terms" updated="October 20, 2026">
      <p>These terms cover your use of {BRAND.name}. By creating an account or using a sample read, you agree to them.</p>

      <h2>Your work stays yours</h2>
      <p>
        You keep every right to everything you upload or write here. You give us permission only to store your work and process it (including
        sending it to our AI provider) to give you the service you ask for. That permission ends when you delete the work. See{" "}
        <Link href="/privacy">Privacy</Link> for exactly how your writing is handled.
      </p>

      <h2>What the reader is</h2>
      <p>
        {BRAND.name}’s feedback comes from an AI model. It reads closely and tries to be honest and useful, but it’s an opinion, not a verdict,
        and it can be wrong: about craft, about what a market wants, or about what’s on the page. It doesn’t write your book, and it isn’t a
        substitute for your own judgment, a human editor or legal advice. Use what helps.
      </p>

      <h2>Using it fairly</h2>
      <ul>
        <li>Only upload writing you have the right to share with us.</li>
        <li>Don’t try to get around plan limits, share an account, or use {BRAND.name} to build a competing service.</li>
        <li>Don’t use it for anything unlawful, or to harass or harm anyone.</li>
      </ul>
      <p>We may suspend accounts that break these rules. If we do, we’ll tell you why and let you download your work.</p>

      <h2>Plans and payment</h2>
      <ul>
        <li>Subscriptions renew each month or year until you cancel. Cancelling keeps your plan until the end of the period you’ve paid for.</li>
        <li>
          You only ever pay your plan’s price or a book pass. There are no overage charges: when you reach a limit, the reader pauses and tells
          you.
        </li>
        <li>Book pass credit never expires. Prices can change, but never for a period you’ve already paid for, and we’ll tell you first.</li>
      </ul>

      <h2>Availability</h2>
      <p>
        We work to keep {BRAND.name} running and your work safe, but we can’t promise it will always be available or error-free. Keep your own
        copy of your manuscript; your writing app remains the home of your book.
      </p>

      <h2>Limits on liability</h2>
      <p>
        To the extent the law allows, {BRAND.name} is provided as it is, and our total liability to you for any claim is limited to what you
        paid us in the twelve months before it.
      </p>

      <h2>Ending</h2>
      <p>
        You can stop using {BRAND.name} and delete your account at any time from the <Link href="/account">account page</Link>.{" "}
        {email ? (
          <>
            Questions about these terms? Write to <a href={`mailto:${email}`}>{email}</a>.
          </>
        ) : null}
      </p>
    </LegalPage>
  );
}
