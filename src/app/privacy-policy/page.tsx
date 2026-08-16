import Link from "next/link";
import ContentPage from "../ContentPage";

/**
 * Working draft for legal review. Content is derived from how the signup/
 * vetting flow actually behaves in code (see signup-feature-spec.md), not
 * from a template. Entity/jurisdiction details below are placeholders
 * ([...]) that counsel needs to fill in before this goes live. Route is
 * unlinked from primary nav until reviewed; reachable directly at
 * /privacy-policy for review purposes.
 */

const SECTIONS = [
  { id: "who-we-are", label: "Who we are" },
  { id: "data-we-collect", label: "Data we collect" },
  { id: "how-we-use-it", label: "How we use your data" },
  { id: "legal-basis", label: "Our legal basis for processing" },
  { id: "who-we-share-with", label: "Who we share your data with" },
  { id: "cv-handling", label: "CVs and application materials" },
  { id: "retention", label: "How long we keep your data" },
  { id: "cookies", label: "Cookies" },
  { id: "international-transfers", label: "International data transfers" },
  { id: "security", label: "Security" },
  { id: "your-rights", label: "Your rights" },
  { id: "children", label: "Children's data" },
  { id: "changes", label: "Changes to this policy" },
  { id: "contact", label: "Contact us" },
];

const H2 =
  "font-sans text-2xl md:text-3xl font-light text-brand-black scroll-mt-32";
const H3 = "text-xl font-light text-brand-black";
const P = "text-lg text-brand-black/80";
const UL = "list-disc pl-6 flex flex-col gap-2 text-lg text-brand-black/80";

export default function PrivacyPolicyPage() {
  return (
    <ContentPage gap={6}>
      <div className="flex flex-col gap-3 rounded-sm border border-brand-red/30 bg-brand-red/5 px-5 py-4">
        <p className="text-base text-brand-black/70">
          <strong className="text-brand-black">Draft for legal review.</strong>{" "}
          Bracketed items (e.g. <code>[legal entity name]</code>) are
          placeholders that need input from counsel: registered entity,
          jurisdiction, governing law, supervisory authority, and any DPO
          requirement. Fill these in before this is published or linked from
          the site.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="font-sans text-4xl text-brand-black">Privacy Policy</h1>
        <p className={P}>Last updated: [date]. Effective from: [date]</p>
      </div>

      <p className={P}>
        This policy explains what personal data{" "}
        <strong>[Legal entity name]</strong> (&ldquo;Law for AI Safety&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) collects through{" "}
        <Link href="/" className="underline">
          lawforaisafety.org
        </Link>
        , why we collect it, who we share it with, and how long we keep it. It
        covers three things you can do on this site: applying to work with us,
        subscribing to our newsletter, and (for internal reviewers only) signing
        in to the admin review dashboard.
      </p>

      <nav aria-label="Sections" className="flex flex-col gap-2 pt-2">
        <h2 className="text-base font-light text-brand-black/60">
          On this page
        </h2>
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-lg">
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-brand-navy underline">
                {i + 1}. {s.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <section
        id="who-we-are"
        className="flex flex-col gap-4 pt-8 border-t border-brand-black/10"
      >
        <h2 className={H2}>1. Who we are</h2>
        <p className={P}>
          <strong>[Legal entity name]</strong>, registered in{" "}
          <strong>[jurisdiction of incorporation]</strong> at{" "}
          <strong>[registered address]</strong>, is the controller of the
          personal data described in this policy. If you have questions about
          this policy or how we handle your data, contact us at{" "}
          <a href="mailto:info@lawforaisafety.org" className="underline">
            info@lawforaisafety.org
          </a>
          .{" "}
          <strong>
            [If a Data Protection Officer is required: name/contact here.]
          </strong>
        </p>
      </section>

      <section
        id="data-we-collect"
        className="flex flex-col gap-5 pt-8 border-t border-brand-black/10"
      >
        <h2 className={H2}>2. Data we collect</h2>

        <div className="flex flex-col gap-3">
          <h3 className={H3}>If you apply to work with us</h3>
          <p className={P}>
            You verify your identity through one of three routes, and we collect
            different data depending on which one you use:
          </p>
          <ul className={UL}>
            <li>
              <strong>LinkedIn or Google sign-in:</strong> we receive your
              name, email address, and profile photo directly from LinkedIn or
              Google once you confirm on their site. We never see your password.
              This data is provider-verified.
            </li>
            <li>
              <strong>Name and email only (no identity verification):</strong>{" "}
              if you don&apos;t use LinkedIn or Google, you can type your name
              and email directly. This data is entirely self-reported and
              unverified. We have no proof it&apos;s accurate, and our
              reviewers are told to treat it that way.
            </li>
          </ul>
          <p className={P}>
            Alongside identity verification, the application form collects:
          </p>
          <ul className={UL}>
            <li>Organisation or firm (optional, self-reported)</li>
            <li>LinkedIn profile URL (optional, self-reported)</li>
            <li>A CV/résumé file, PDF only, up to 5 MB (optional)</li>
            <li>
              A written position statement describing your role and relevance
              (optional)
            </li>
            <li>General comments (optional)</li>
            <li>Whether you&apos;d like to also join our newsletter</li>
          </ul>
          <p className={P}>
            You must provide at least one of a LinkedIn URL, a CV, or a position
            statement, so we have something to assess your professional
            background against.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className={H3}>If you subscribe to our newsletter only</h3>
          <p className={P}>
            Just your email address, plus the confirmation status and timestamp
            of your double opt-in click.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className={H3}>Technical and anti-abuse data</h3>
          <ul className={UL}>
            <li>
              Your IP address, used transiently for rate-limiting and passed to
              Cloudflare Turnstile (see below) to verify you&apos;re not a bot.
              It is not stored in our database.
            </li>
            <li>
              Signals collected by Cloudflare Turnstile as part of its bot
              challenge, governed by Cloudflare&apos;s own privacy policy.
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className={H3}>If you are a staff reviewer</h3>
          <p className={P}>
            Internal reviewers sign in with LinkedIn. Their verified name and
            email are stored in a signed session cookie, used only to
            authenticate access to the internal review dashboard.
          </p>
        </div>
      </section>

      <section
        id="how-we-use-it"
        className="flex flex-col gap-4 pt-8 border-t border-brand-black/10"
      >
        <h2 className={H2}>3. How we use your data</h2>
        <ul className={UL}>
          <li>To assess and decide on applications to work with us</li>
          <li>To notify you of the outcome of your application by email</li>
          <li>
            To send you our newsletter, if you&apos;ve opted in and confirmed
          </li>
          <li>
            To detect duplicate or repeat submissions, and to give reviewers
            context if you&apos;ve applied before
          </li>
          <li>To protect the site against spam and automated abuse</li>
          <li>
            If approved, to invite you to our Slack workspace and, if you
            opted in, add you to our mailing list
          </li>
        </ul>
      </section>

      <section
        id="legal-basis"
        className="flex flex-col gap-4 pt-8 border-t border-brand-black/10"
      >
        <h2 className={H2}>4. Our legal basis for processing</h2>
        <p className={P}>
          <strong>
            [Counsel to confirm framing. Outline below reflects how the flow
            actually works.]
          </strong>
        </p>
        <ul className={UL}>
          <li>
            <strong>Consent:</strong> newsletter signups (standalone or via the
            application form&apos;s opt-in checkbox), confirmed via double
            opt-in for standalone signups
          </li>
          <li>
            <strong>Legitimate interests:</strong> assessing applications from
            legal professionals wanting to work with us, and preventing
            fraudulent or automated submissions, weighed against your interests
            and rights
          </li>
          <li>
            <strong>Steps at your request prior to a contract:</strong> for the
            application/vetting process itself, where the outcome may lead to
            you joining our work
          </li>
        </ul>
      </section>

      <section
        id="who-we-share-with"
        className="flex flex-col gap-4 pt-8 border-t border-brand-black/10"
      >
        <h2 className={H2}>5. Who we share your data with</h2>
        <p className={P}>
          We don&apos;t sell your personal data. We share it with the following
          service providers, each acting for the specific purpose described:
        </p>
        <ul className={UL}>
          <li>
            <strong>Google / LinkedIn:</strong> to verify your identity when
            you choose one of those sign-in options. Governed by their own
            privacy policies.
          </li>
          <li>
            <strong>Cloudflare:</strong> Turnstile, our bot-verification
            widget, used on both forms.
          </li>
          <li>
            <strong>Brevo:</strong> sends transactional emails (application
            outcome, newsletter confirmation) and manages our newsletter mailing
            list. Brevo hosts data on EU infrastructure. You can unsubscribe
            from the newsletter at any time using the unsubscribe link in any
            newsletter email.
          </li>
          <li>
            <strong>Slack:</strong> if your application is approved, a reviewer
            invites you to our Slack workspace, first checking whether
            you&apos;re already a member.
          </li>
          <li>
            <strong>Netlify:</strong> our hosting provider. Application data is
            stored in a Netlify-managed Postgres database; uploaded CVs are
            stored in Netlify Blobs object storage.
          </li>
        </ul>
        <p className={P}>
          <strong>
            [Counsel: confirm processor list is complete and that data
            processing agreements are in place with each.]
          </strong>
        </p>
      </section>

      <section
        id="cv-handling"
        className="flex flex-col gap-4 pt-8 border-t border-brand-black/10"
      >
        <h2 className={H2}>6. CVs and application materials</h2>
        <p className={P}>
          If you upload a CV, it is validated server-side before storage and
          kept in private object storage. It is never publicly accessible.
          Reviewers view it through a sandboxed, in-browser viewer rather than
          downloading it. Your CV is deleted automatically as soon as a decision
          is made on your application, or after 24 hours if you never complete
          the identity verification step.
        </p>
      </section>

      <section
        id="retention"
        className="flex flex-col gap-4 pt-8 border-t border-brand-black/10"
      >
        <h2 className={H2}>7. How long we keep your data</h2>
        <ul className={UL}>
          <li>
            <strong>Started but never completed an application</strong>{" "}
            (identity verification not finished): deleted automatically after 24
            hours, including any uploaded CV.
          </li>
          <li>
            <strong>Application awaiting review:</strong> kept until a reviewer
            makes a decision.
          </li>
          <li>
            <strong>Decided (approved or rejected):</strong> your full
            application record (name, email, CV, profile photo, everything you
            submitted) is deleted immediately once the decision is made and
            you&apos;ve been notified. We retain only a one-way cryptographic
            hash of your email address, together with the outcome, so we can
            recognise a repeat application. The hash cannot be reversed back to
            your email address. For rejections only, the reviewer&apos;s
            internal notes are kept alongside the hash; reviewers are instructed
            not to include your name or other identifying details in those
            notes.
          </li>
          <li>
            <strong>Newsletter subscribers:</strong> your email is kept for as
            long as you remain subscribed. You can unsubscribe at any time via
            the link in any newsletter email.
          </li>
        </ul>
        <p className={P}>
          <strong>
            [Counsel: address right-to-erasure process for the retained email
            hash. See Open Question in the feature spec. Because the hash
            isn&apos;t linkable back to an email address without already knowing
            the address, an erasure request against it may in practice already
            be satisfied by the point identifying data is purged; this needs a
            documented position.]
          </strong>
        </p>
      </section>

      <section
        id="cookies"
        className="flex flex-col gap-4 pt-8 border-t border-brand-black/10"
      >
        <h2 className={H2}>8. Cookies</h2>
        <p className={P}>
          The public site sets no analytics, advertising, or tracking cookies.
        </p>
        <ul className={UL}>
          <li>
            Our internal admin dashboard sets a single strictly-necessary
            session cookie, used only to keep a staff member signed in for up to
            7 days. It is not set for regular visitors or applicants.
          </li>
          <li>
            Cloudflare Turnstile may set its own cookies as part of its bot
            challenge, governed by Cloudflare&apos;s privacy policy.
          </li>
        </ul>
      </section>

      <section
        id="international-transfers"
        className="flex flex-col gap-4 pt-8 border-t border-brand-black/10"
      >
        <h2 className={H2}>9. International data transfers</h2>
        <p className={P}>
          Some of our service providers (Google, LinkedIn, Cloudflare, Netlify)
          may process data outside the [UK/EEA]. Brevo hosts data on EU
          infrastructure.{" "}
          <strong>
            [Counsel: confirm transfer mechanism (SCCs, adequacy decision, or
            other safeguard) for each processor named in section 5.]
          </strong>
        </p>
      </section>

      <section
        id="security"
        className="flex flex-col gap-4 pt-8 border-t border-brand-black/10"
      >
        <h2 className={H2}>10. Security</h2>
        <ul className={UL}>
          <li>Data in transit is encrypted (HTTPS/TLS).</li>
          <li>
            Uploaded CVs are validated server-side (file signature, size cap)
            before storage, and viewed by reviewers only through a sandboxed
            in-browser viewer, not downloaded to a reviewer&apos;s device.
          </li>
          <li>
            The admin session cookie is signed, HTTP-only, and marked secure;
            access to the review dashboard is restricted to a specific list of
            authorised staff email addresses.
          </li>
          <li>
            Automated submissions are filtered by bot-detection and rate
            limiting before they reach our systems.
          </li>
        </ul>
      </section>

      <section
        id="your-rights"
        className="flex flex-col gap-4 pt-8 border-t border-brand-black/10"
      >
        <h2 className={H2}>11. Your rights</h2>
        <p className={P}>
          Subject to applicable law, you may have the right to access, correct,
          delete, restrict, or object to our processing of your personal data,
          and to receive a copy of it in a portable format. To exercise any of
          these rights, contact us at{" "}
          <a href="mailto:info@lawforaisafety.org" className="underline">
            info@lawforaisafety.org
          </a>
          . You also have the right to complain to{" "}
          <strong>[relevant supervisory authority]</strong>.
        </p>
      </section>

      <section
        id="children"
        className="flex flex-col gap-4 pt-8 border-t border-brand-black/10"
      >
        <h2 className={H2}>12. Children&apos;s data</h2>
        <p className={P}>
          This site is intended for legal professionals and is not directed at
          children. We do not knowingly collect data from children.
        </p>
      </section>

      <section
        id="changes"
        className="flex flex-col gap-4 pt-8 border-t border-brand-black/10"
      >
        <h2 className={H2}>13. Changes to this policy</h2>
        <p className={P}>
          We may update this policy from time to time. Material changes will be
          reflected by an updated &ldquo;Last updated&rdquo; date at the top of
          this page.{" "}
          <strong>
            [Counsel: confirm whether a change-notice mechanism beyond the date
            stamp is required.]
          </strong>
        </p>
      </section>

      <section
        id="contact"
        className="flex flex-col gap-4 pt-8 border-t border-brand-black/10 pb-4"
      >
        <h2 className={H2}>14. Contact us</h2>
        <p className={P}>
          Questions about this policy or how we handle your data:{" "}
          <a href="mailto:info@lawforaisafety.org" className="underline">
            info@lawforaisafety.org
          </a>
          .{" "}
          <strong>
            [Registered postal address, if required for statutory notices.]
          </strong>
        </p>
      </section>
    </ContentPage>
  );
}
