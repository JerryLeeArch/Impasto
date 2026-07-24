import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — impasto",
  description: "How impasto collects, uses, and protects your information.",
};

const effectiveDate = "June 20, 2026";
const contactEmail = "jaewon1430@gmail.com";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f5f5f7] px-6 py-16 text-[#1d1d1f]">
      <article className="mx-auto w-full max-w-2xl">
        <Link
          href="/"
          className="text-[13px] font-semibold text-[#6e6e73] transition hover:text-[#1d1d1f]"
        >
          ← Back to impasto
        </Link>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-[#6e6e73]">
          Effective date: {effectiveDate}
        </p>

        <p className="mt-6 text-[15px] leading-7 text-[#424245]">
          impasto (&ldquo;impasto&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is
          a private taste log for music and changing opinions, available
          at impasto.live. This Privacy Policy explains what information we
          collect, how we use it, and the choices you have. By using impasto, you
          agree to this policy.
        </p>

        <Section title="1. Information we collect">
          <p>We collect only what is needed to run the service:</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              <strong>Account information.</strong> When you sign in with Google,
              we receive your email address, your name, and your Google account
              identifier. We do not receive your Google password.
            </li>
            <li>
              <strong>Profile.</strong> A username (handle) that is assigned
              automatically and that you can change, and your default post
              visibility preference.
            </li>
            <li>
              <strong>Content you create.</strong> The logs you write — titles,
              notes, ratings, categories, and music details such as artists,
              albums, genres, and credits — along with favorite rankings and the
              edit history of your logs.
            </li>
            <li>
              <strong>Social data.</strong> Friend requests, friendships, and the
              visibility setting (private or friends) you choose for each log.
            </li>
            <li>
              <strong>Technical data.</strong> Strictly necessary cookies that
              keep you signed in, a cookie that stores your light/dark theme
              preference, and standard server logs (such as IP address and
              browser type) kept by our hosting provider for security and
              reliability.
            </li>
          </ul>
        </Section>

        <Section title="2. How we use your information">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>To provide and operate impasto and your account.</li>
            <li>
              To store, display, and let you manage your logs, rankings, and
              profile.
            </li>
            <li>
              To enable friend connections and to show friends only the logs you
              choose to make visible to them.
            </li>
            <li>To keep the service secure and to prevent abuse.</li>
          </ul>
          <p className="mt-2">
            We do not sell your personal information, and we do not use it for
            advertising. We do not use analytics or advertising tracking cookies.
          </p>
        </Section>

        <Section title="3. Cookies">
          <p>
            We use cookies only for purposes that are essential to the service:
            an authentication session cookie that keeps you signed in, and a
            preference cookie that remembers your theme. We do not use cookies for
            advertising, profiling, or third-party tracking. Because these
            cookies are strictly necessary or functional, the service relies on
            them to work as intended.
          </p>
        </Section>

        <Section title="4. How your information is shared">
          <p>
            We share your information only with service providers that help us
            run impasto, and only as needed:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              <strong>Supabase</strong> — database and authentication; stores your
              account, content, and friendships.
            </li>
            <li>
              <strong>Google</strong> — sign-in provider used to authenticate you.
            </li>
            <li>
              <strong>Vercel</strong> — hosting and content delivery for the
              website.
            </li>
          </ul>
          <p className="mt-2">
            Logs you mark as visible to friends are shown to your accepted
            friends. Logs marked private are visible only to you. We may also
            disclose information if required by law.
          </p>
        </Section>

        <Section title="5. Data retention">
          <p>
            We keep your information for as long as your account is active. When
            you delete a log it is removed from your feeds; residual copies may
            remain in revision history or backups for a limited period before
            being purged. You can ask us to delete your account and associated
            data at any time (see &ldquo;Your rights&rdquo;).
          </p>
        </Section>

        <Section title="6. Your rights">
          <p>
            Depending on where you live, you may have the right to access,
            correct, export, or delete your personal information, and to withdraw
            consent. You can edit or delete most of your content directly in the
            app. To request access to or deletion of your account, contact us at
            the address below.
          </p>
        </Section>

        <Section title="7. Security">
          <p>
            Your data is protected with row-level security so that, by default,
            only you can read and write your own records, and friends can see
            only the logs you have chosen to share. No method of transmission or
            storage is completely secure, but we take reasonable measures to
            protect your information.
          </p>
        </Section>

        <Section title="8. International transfers">
          <p>
            impasto relies on the providers listed above, which may process and
            store data in countries other than your own. Where required, such
            transfers are carried out with appropriate safeguards.
          </p>
        </Section>

        <Section title="9. Children">
          <p>
            impasto is not directed to children under the age of 14, and we do not
            knowingly collect personal information from them. If you believe a
            child has provided us information, contact us and we will delete it.
          </p>
        </Section>

        <Section title="10. Changes to this policy">
          <p>
            We may update this Privacy Policy from time to time. When we do, we
            will revise the effective date above. Significant changes will be
            communicated within the app where appropriate.
          </p>
        </Section>

        <Section title="11. Contact">
          <p>
            If you have any questions about this Privacy Policy or your data,
            contact us at{" "}
            <a
              href={`mailto:${contactEmail}`}
              className="font-semibold text-[#1d1d1f] underline"
            >
              {contactEmail}
            </a>
            .
          </p>
        </Section>
      </article>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight text-[#1d1d1f]">
        {title}
      </h2>
      <div className="mt-2 text-[15px] leading-7 text-[#424245]">{children}</div>
    </section>
  );
}
