import Link from "next/link";
import { ORGANISATION_DETAILS, detailsFor } from "../../organisation";
import type { PolicyContent } from "../types";
import { H3, LINK, NOTE, P, SUBSECTION, UL } from "../styles";

/** Entity name, address, supervisory authority etc., resolved for English. */
const d = detailsFor("en");

/**
 * English source text. Every other locale is a translation of this file, so
 * when a clause changes here, it changes there too.
 *
 * Two kinds of bracketed placeholder appear below, and they are not the same
 * thing. A blank inside a sentence is a value counsel supplies; those come
 * from `details.ts` as `d.*`, so they are filled in once for every language.
 * A whole paragraph styled with `NOTE` is an instruction to counsel that must
 * be resolved and then deleted; those stay written out here, because each one
 * is specific to the clause it sits under.
 *
 * Neither is emphasised with bold: in a legal document bold reads as "this
 * clause matters more", which is not what a drafting note means.
 */
const en: PolicyContent = {
  title: "Privacy Policy",
  description:
    "How Law for AI Safety collects, uses, shares, and retains personal data submitted through lawforaisafety.org.",
  dateLabels: {
    lastUpdated: "Last updated",
    effectiveFrom: "Effective from",
  },
  tocHeading: "On this page",
  tocLabel: "Sections",
  languageSwitcherLabel: "Choose a language",

  reviewNotice: (
    <p className="text-base text-brand-black/70">
      Draft for legal review. Bracketed items (e.g.{" "}
      <code>{ORGANISATION_DETAILS.registeredAddress.placeholder}</code>) are
      placeholders still needing input from counsel, as do the annotated notes
      set off by a rule. Entity, jurisdiction, and supervisory authority are
      filled in provisionally, on the basis that this is a Belgian non-profit,
      and need confirming. The Dutch version is a translation of this English
      text and has not been reviewed by a native legal translator. Resolve all
      of the above before this is published or linked from the site.
    </p>
  ),

  intro: (
    <>
      <p className={P}>
        The {d.entityName}{" "}
        (&ldquo;Law for AI Safety&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;,
        &ldquo;our&rdquo;) takes the protection of your privacy seriously and
        handles your personal data (&ldquo;your data&rdquo;) with care.
      </p>
      <p className={P}>
        This policy explains what data we collect through{" "}
        <Link href="/" className={LINK}>
          lawforaisafety.org
        </Link>
        , why we collect it, who we share it with, how long we keep it, and what
        rights you have. It covers the two things you can do on this site:
        applying to work with us, and subscribing to our newsletter.
      </p>
      <p className={P}>
        If you have any questions after reading this policy, please get in
        touch.
      </p>
    </>
  ),

  sections: {
    "who-we-are": {
      label: "Who we are",
      body: (
        <>
          <p className={P}>
            The {d.entityName}, {d.legalForm}, registered in {d.jurisdiction}{" "}
            at {d.registeredAddress}, is the controller of the personal data
            described in this policy. This means we determine the purposes and
            the means of the processing. If you have questions about this policy
            or how we handle your data, contact us at{" "}
            <a href={`mailto:${d.contactEmail}`} className={LINK}>
              {d.contactEmail}
            </a>
            .
          </p>
          <ul className={UL}>
            <li>Enterprise number: {d.enterpriseNumber}</li>
            <li>Register of legal entities (RPR): {d.registerCourt}</li>
          </ul>
          <p className={NOTE}>
            [Counsel: supply the legal form, enterprise number, and court of
            the register. Article 2:20 of the Companies and Associations Code
            requires a legal person&apos;s name, legal form, registered office,
            enterprise number, and register with its competent court on the
            website, whichever non-profit form is chosen; Article III.74 of the
            Code of Economic Law requires the enterprise number on
            publications. Both are site-wide obligations, so a legal notice or
            the site footer would satisfy them equally, and this block could
            move there. &ldquo;NGO&rdquo; is a description, not a legal form:
            the candidates are a national non-profit (VZW/ASBL) or an
            international one (IVZW/AISBL).]
          </p>
          {/*
            No Data Protection Officer is named, and none needs to be. Article
            37(1) doesn't require one here: not a public authority, and neither
            large-scale regular monitoring nor large-scale special-category
            processing is a core activity. Where none is required there is
            nothing to disclose, so this section stays silent on it.

            If one is ever appointed, including voluntarily, Article 37(7)
            requires their contact details to be published in this section and
            notified to the supervisory authority. Add them here, and to nl.tsx
            and every other locale.
          */}
        </>
      ),
    },

    "data-we-collect": {
      label: "What data we collect",
      body: (
        <>
          <p className={P}>
            What we hold depends on how you interact with us. Below is the full
            set.
          </p>

          <div className={SUBSECTION}>
            <h3 className={H3}>If you apply to work with us</h3>
            <p className={P}>
              You verify your identity through one of three routes, and we
              collect different data depending on which one you use:
            </p>
            <ul className={UL}>
              <li>
                LinkedIn sign-in: we receive your name, email address, and
                profile photo directly from LinkedIn once you confirm on their
                site. We never see your password. This data is
                provider-verified.
              </li>
              <li>
                Google sign-in: as above, with your name, email address, and
                profile photo coming directly from Google.
              </li>
              <li>
                Name and email only, with no identity verification: if you
                don&apos;t use LinkedIn or Google, you can type your name and
                email directly. This data is entirely self-reported and
                unverified. We have no proof it&apos;s accurate, and our
                reviewers are told to treat it that way.
              </li>
            </ul>
            <p className={P}>
              If you use LinkedIn or Google, you sign in on their site rather
              than ours, and they confirm those details back to us. They act as
              controllers of your data in their own right, under their own
              privacy policies, rather than on our instructions. We never send
              them your application, but signing in does tell them you have
              used your account here.
            </p>
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
              You must provide at least one of a LinkedIn URL, a CV, or a
              position statement, so we have something to assess your
              professional background against.
            </p>
          </div>

          <div className={SUBSECTION}>
            <h3 className={H3}>If you subscribe to our newsletter only</h3>
            <p className={P}>
              Just your email address, plus the confirmation status and
              timestamp of your double opt-in click.
            </p>
          </div>

          <div className={SUBSECTION}>
            <h3 className={H3}>Technical and anti-abuse data</h3>
            <ul className={UL}>
              <li>
                Your IP address, used transiently for rate-limiting and passed
                to Cloudflare Turnstile (see below) to verify you&apos;re not a
                bot. It is not stored in our database.
              </li>
              <li>
                Signals collected by Cloudflare Turnstile as part of its bot
                challenge, governed by Cloudflare&apos;s own privacy policy.
              </li>
            </ul>
          </div>
        </>
      ),
    },

    "cv-handling": {
      label: "CVs and application materials",
      body: (
        <p className={P}>
          If you upload a CV, it is validated server-side before storage and
          kept in private object storage. It is never publicly accessible.
          Reviewers view it through a sandboxed, in-browser viewer rather than
          downloading it. Your CV is deleted automatically as soon as a decision
          is made on your application, or after 24 hours if you never complete
          the identity verification step.
        </p>
      ),
    },

    "how-we-use-it": {
      label: "Why we collect your data",
      body: (
        <>
          <p className={P}>
            We process your data only for the purposes set out below:
          </p>
          <ul className={UL}>
            <li>To assess and decide on applications to work with us</li>
            <li>To notify you of the outcome of your application by email</li>
            <li>
              To add you to our mailing list and send you our newsletter, if
              you&apos;ve opted in
            </li>
            <li>
              To detect duplicate or repeat submissions, and to give reviewers
              context if you&apos;ve applied before
            </li>
            <li>To protect the site against spam and automated abuse</li>
            <li>
              If your application is approved, to invite you to our Slack
              workspace
            </li>
          </ul>
          <p className={P}>
            We do not use your data for automated decision-making or profiling.
            Every application is read and decided by a person.
          </p>
        </>
      ),
    },

    "legal-basis": {
      label: "Our legal basis for processing",
      body: (
        <>
          {/*
            Assessing an application rests on legitimate interests, and only
            that. An earlier draft also claimed Article 6(1)(b), steps prior to
            a contract, for the same processing. That is not available:
            membership is a networking arrangement, no contract follows from
            being approved, and any future paid role would be a separate
            process with its own basis and its own notice.

            Two consequences, both already reflected in the rights section, so
            keep them in step if this ever changes. Applicants have a right to
            object under Article 21, because that right attaches to legitimate
            interests. They have no portability right over their application
            data under Article 20, because portability reaches only consent and
            contract; it still covers the newsletter, which runs on consent.

            The balancing test Article 6(1)(f) assumes is drafted at
            legitimate-interests-assessment.md in the repository root, covering
            application review, the retained email hash, and anti-abuse. It is
            a draft awaiting counsel, and it is the document a regulator asks
            for first. Keep it in step with this section: if the basis or the
            retention design changes, the assessment has to change with it.
          */}
          <ul className={UL}>
            <li>
              Consent: newsletter signups, whether standalone or via the
              application form&apos;s opt-in checkbox, confirmed by double
              opt-in for standalone signups. You can withdraw consent at any
              time by unsubscribing.
            </li>
            <li>
              Legitimate interests: assessing applications from legal
              professionals wanting to work with us, and preventing fraudulent
              or automated submissions, weighed against your interests and
              rights.
            </li>
            <li>
              Legal obligations: where we are required to retain or disclose
              data by law.
            </li>
          </ul>
        </>
      ),
    },

    retention: {
      label: "How long we keep your data",
      body: (
        <>
          <p className={P}>
            We do not keep your data longer than is necessary for the purpose it
            was collected for. In practice:
          </p>
          <ul className={UL}>
            <li>
              Started but never completed an application, meaning identity
              verification was not finished: deleted automatically after 24
              hours, including any uploaded CV.
            </li>
            <li>
              Application awaiting review: kept until a reviewer makes a
              decision.
            </li>
            <li>
              Decided, whether approved or rejected: your full application
              record (name, email, CV, profile photo, everything you submitted)
              is deleted immediately once the decision is made and you&apos;ve
              been notified. We retain only a one-way cryptographic hash of your
              email address, together with the outcome, so we can recognise a
              repeat application. The hash cannot be reversed back to your email
              address, though it still counts as data about you, and if you ask
              us to erase your data we delete the hash as well. For rejections
              only, the reviewer&apos;s internal notes are kept alongside the
              hash and are deleted with it; reviewers are instructed not to
              include your name or other identifying details in those notes.
            </li>
            <li>
              Newsletter subscribers: your email is kept for as long as you
              remain subscribed. You can unsubscribe at any time via the link in
              any newsletter email.
            </li>
          </ul>
          {/*
            The retained email hash is treated as personal data, and an erasure
            request reaches it. An earlier draft of this note suggested such a
            request might already be satisfied once the identifying data is
            purged. That was too optimistic, and it is not the position taken.

            Hashing an email address is pseudonymisation, not anonymisation:
            the space of candidate addresses is small enough to test, so anyone
            holding a candidate can confirm whether it is in the set (WP29
            Opinion 05/2014; Recital 26's "means reasonably likely to be
            used"). Nor does Article 11 help. It relieves a controller that
            cannot identify the data subject, but a requester who gives us
            their address lets us hash it and find the record, which is exactly
            how verification works here (see the section on exercising rights).

            So the choice was between refusing erasure on compelling legitimate
            grounds under Articles 17(1)(c) and 21(1), and simply honouring it.
            Wanting to recognise a repeat applicant is unlikely to override the
            person's own objection, and deleting the row is trivial, so the
            policy promises deletion. The cost is accepted: a rejected
            applicant who asks for erasure can reapply and be reviewed with no
            prior context, and the reviewer notes go with the hash.

            If that trade ever looks wrong, changing it means arguing
            compelling legitimate grounds, not quietly keeping the hash.
          */}
        </>
      ),
    },

    "who-we-share-with": {
      label: "Who we share your data with",
      body: (
        <>
          <p className={P}>
            We don&apos;t sell your personal data. We share it only:
          </p>
          <ul className={UL}>
            <li>
              Within our own team, with the reviewers and staff who need access
              to do their work.
            </li>
            <li>
              With processors: service providers acting on our instructions and
              contractually obliged to protect your data. These are listed
              below.
            </li>
            <li>
              With third parties, where legally required or necessary to provide
              the service you asked for.
            </li>
          </ul>
          <p className={P}>
            The kinds of processor we use, each for the specific purpose
            described:
          </p>
          <ul className={UL}>
            <li>
              A bot-protection provider, to check that submissions to our forms
              are not automated.
            </li>
            <li>
              An email provider, to send transactional emails (your application
              outcome, newsletter confirmation) and to manage our newsletter
              mailing list. You can unsubscribe from the newsletter at any time
              using the unsubscribe link in any newsletter email.
            </li>
            <li>
              A team messaging provider, which hosts the workspace you are
              invited to if your application is approved. Before inviting you,
              a reviewer checks whether you are already a member.
            </li>
            <li>
              A hosting provider, which runs this site, holds application data
              in a managed database, and keeps uploaded CVs in private object
              storage.
            </li>
          </ul>
          {/*
            Processor agreements, as published on 27 August 2026. The list of
            processors above is confirmed complete.

              Cloudflare  Data Processing Addendum,
                          cloudflare.com/cloudflare-customer-dpa, v6.4 of
                          3 April 2026, incorporated by reference into the
                          Self-Serve Subscription Agreement. All eight Article
                          28(3) limbs present: 3.1(a) instructions, 3.1(d)
                          confidentiality, 3.1(c) and Annex 2 security, 4
                          sub-processors (30 days' notice, objection at 4.4),
                          3.1(g)-(h) data subject requests, 3.1(j) Articles 32
                          to 36, 3.1(i) deletion or return, 5 audit.

              Netlify     Data Processing Agreement,
                          netlify.com/pdf/netlify-dpa.pdf, last updated
                          9 June 2026, incorporated by reference into
                          Netlify's terms. Article 28(3) at 4.1 instructions,
                          4.1(d) confidentiality, 7 security, 6 sub-processors
                          (30 days' notice and a right to object), 5 data
                          subject requests, 9 DPIA assistance, 12 return and
                          deletion, 8 audit.

              Brevo       Annex 2 to the General Terms and Conditions, version
                          of 15 May 2024. Article 28(3) at 3.1(iii)
                          instructions, 3.1(iv)-(v) confidentiality and
                          training, 5.1-5.2 and Schedule 2 security, 6
                          sub-processors (10 business days' notice, objection),
                          4.2-4.4 data subject requests, 9 Articles 32 to 36
                          and 5.3 breach notice within 72 hours, 8.1
                          destruction or anonymisation within 100 days, 10
                          audit. Note clause 3.2(vi) forbids us putting
                          special-category data into Customer Data, and
                          Schedule 1 puts Brevo's servers in the EU with
                          non-EEA exposure via its own suppliers.

              Slack       slack.com/terms-of-service/data-processing. NOT
                          automatic and NOT YET IN PLACE. Slack asks an
                          authorised person to execute it through a form, so
                          accepting the Customer Terms of Service alone leaves
                          no Article 28 agreement covering the workspace. This
                          needs signing.

            An invited member does accept Slack's own user terms, but that
            governs their relationship with Slack and does not displace ours:
            members join as authorised users of our workspace rather than as
            Slack customers, so we remain controller of the workspace content.
            The disclosure also happens before they agree to anything, when a
            reviewer puts their email into Slack to send the invitation.

            File the version of each agreement accepted; all four revise them.
          */}
          {/*
            The sign-in providers are deliberately absent from this section.
            They are separate controllers rather than processors, and nothing
            is disclosed to them, so they are not recipients of your data. What
            they do supply is described under what data we collect.
          */}
        </>
      ),
    },

    "international-transfers": {
      label: "International data transfers",
      body: (
        <>
          <p className={P}>
            Some of our processors are outside the {d.dataProtectionArea}, and
            our email provider uses sub-processors that are. Every such
            transfer is covered by a legal safeguard:
          </p>
          <ul className={UL}>
            <li>
              Our bot-protection, hosting, and team messaging providers are
              certified under the EU-US Data Privacy Framework, and each falls
              back on the European Commission&apos;s Standard Contractual
              Clauses if that certification ceases to apply.
            </li>
            <li>
              Our email provider builds the Standard Contractual Clauses into
              its data processing agreement for transfers to its sub-processors
              outside the {d.dataProtectionArea}. Its own servers are within
              it; the transfers arise from a handful of its suppliers.
            </li>
          </ul>
          {/*
            Mechanisms read off each provider's own published terms on
            26 August 2026:

              Cloudflare  EU-US DPF + Swiss and UK extensions, SCCs as
                          fallback (cloudflare.com/trust-hub/gdpr)
              Netlify     EU-US DPF + UK extension, DPA s14.2, SCCs defined
                          at s1.17 (netlify.com/pdf/netlify-dpa.pdf,
                          last updated 9 June 2026)
              Slack       DPF via Salesforce, plus SCCs in the DPA and
                          processor BCRs (slack.com/trust/compliance/gdpr)
              Brevo       SCCs in DPA Annex 2

            Do not "correct" the Brevo wording back to "hosts data on EU
            infrastructure", which is what an earlier draft said. Brevo is
            French, but its own terms disclose transfers to sub-processors in
            the United States and India under SCCs. DPF certifications can
            lapse or be struck down, so re-check all four before publishing if
            much time has passed.

            LinkedIn and Google are treated as separate controllers, not
            processors, so no Article 28 agreement is needed with either and
            no transfer by us arises. The reasoning:

              - We send them nothing. The authorize URL carries only
                client_id, redirect_uri, scope, and an opaque randomUUID state
                (see lib/oauth.ts and lib/applicant-flow.ts). Data flows
                inbound to us.
              - They authenticate their own account holders under their own
                privacy policies, and we cannot instruct them on how. On the
                EDPB Guidelines 07/2020 test, whoever determines purposes and
                means is a controller.
              - Consumer sign-in sits outside both providers' processor terms:
                it isn't covered by their DPAs at all.

            This is a characterisation rather than a certified fact, and it is
            the ordinary market position rather than one blessed by a
            regulator. If counsel disagrees, they move back into the processor
            list in the section above and into this one, and each needs a
            transfer mechanism established.
          */}
        </>
      ),
    },

    cookies: {
      label: "Cookies",
      body: (
        <>
          <p className={P}>
            The public site sets no analytics, advertising, or tracking cookies.
          </p>
          <ul className={UL}>
            <li>
              Cloudflare Turnstile may set its own cookies as part of its bot
              challenge, governed by Cloudflare&apos;s privacy policy.
            </li>
          </ul>
        </>
      ),
    },

    security: {
      label: "How we protect your data",
      body: (
        <>
          <p className={P}>
            We take appropriate technical and organisational measures to secure
            your data against loss, theft, and unauthorised access:
          </p>
          <ul className={UL}>
            <li>Data in transit is encrypted (HTTPS/TLS).</li>
            <li>
              Uploaded CVs are validated server-side (file signature, size cap)
              before storage, and viewed by reviewers only through a sandboxed
              in-browser viewer, not downloaded to a reviewer&apos;s device.
            </li>
            <li>
              Access to the internal system where applications are reviewed is
              restricted to a specific list of authorised people, each signed in
              to an authenticated session.
            </li>
            <li>
              Automated submissions are filtered by bot-detection and rate
              limiting before they reach our systems.
            </li>
          </ul>
        </>
      ),
    },

    "your-rights": {
      label: "Your rights",
      body: (
        <>
          <p className={P}>
            Subject to applicable law, you have the following rights in relation
            to your data:
          </p>
          <ul className={UL}>
            <li>
              Right of access: you can ask what data we hold about you.
            </li>
            <li>
              Right to rectification: you can have inaccurate or incomplete data
              corrected.
            </li>
            <li>Right to erasure: you can ask us to delete your data.</li>
            <li>
              Right to restriction: you can ask us to limit how we process your
              data.
            </li>
            <li>
              Right to object: you can object to our processing of your data
              where we rely on legitimate interests, which is the basis on
              which we assess applications.
            </li>
            <li>
              Right to data portability: where we rely on your consent, which
              currently means the newsletter, you can ask for a copy of that
              data in a structured, commonly used, machine-readable format.
            </li>
            <li>
              Right to withdraw consent: where we rely on consent, you can
              withdraw it at any time, without affecting processing that already
              took place.
            </li>
          </ul>
        </>
      ),
    },

    "exercising-rights": {
      label: "How to exercise your rights",
      body: (
        <>
          <p className={P}>
            To exercise any of these rights, contact us at{" "}
            <a href={`mailto:${d.contactEmail}`} className={LINK}>
              {d.contactEmail}
            </a>
            .
          </p>
          <p className={P}>
            Before we act on a request to see or delete your data, we need to
            know it really comes from you, so that we don&apos;t hand over or
            destroy someone else&apos;s data on a stranger&apos;s say-so. Your
            email address is the only identifier we hold for you, so showing
            that you control it is enough: normally that just means writing to
            us from that address, or confirming a one-time code we send to it.
            We will not ask you for a copy of a passport or identity card to
            deal with a request about data you gave us by email.
          </p>
          <p className={P}>
            We will respond within one month. If a request is unusually complex
            we may take up to two further months, and we will tell you inside
            the first month if that happens.
          </p>
          {/*
            No identity document is requested, deliberately. Article 12(6)
            allows extra identity information only where there are reasonable
            doubts, so demanding ID by default is the wrong starting point, and
            data minimisation (Article 5(1)(c)) makes a passport copy
            disproportionate when it is more sensitive than anything we hold.
            The email address is the only identifier we have, so control of it
            proves everything we know about the person.

            It is also the only check that works against our own retention
            design: after a decision we keep just a one-way hash of the email
            (see the retention section), which can only be matched by hashing
            an address the requester has proved they control.

            The one-month response period, extendable by two months for
            complex requests with notice inside the first month, is Article
            12(3). It is EU-wide, not a Belgian variation.

            If this position ever changes, the prose above must change in
            nl.tsx and every other locale too.
          */}
        </>
      ),
    },

    complaints: {
      label: "Complaints",
      body: (
        <>
          <p className={P}>
            If you are unhappy with how we handle your data, please tell us
            first. We would rather fix it directly. You also have the right to
            complain to {d.supervisoryAuthority}, and to take legal action if
            you believe your rights have been infringed.
          </p>
          <ul className={UL}>
            <li>Address: {d.supervisoryAuthorityAddress}</li>
            <li>
              Email:{" "}
              <a
                href={`mailto:${d.supervisoryAuthorityEmail}`}
                className={LINK}
              >
                {d.supervisoryAuthorityEmail}
              </a>
            </li>
            <li>
              Website:{" "}
              <a
                href={`https://${d.supervisoryAuthorityWebsite}`}
                className={LINK}
              >
                {d.supervisoryAuthorityWebsite}
              </a>
            </li>
          </ul>
          {/*
            The competent authority follows from where the controller is
            established, not from its legal form or from calling itself an
            NGO. A controller established only in Belgium answers to the
            Gegevensbeschermingsautoriteit under Article 55. The Article 56
            one-stop-shop, which picks a *lead* authority, only engages for
            cross-border processing as defined in Article 4(23); if it ever
            did apply here it would still point at Belgium, as the main
            establishment.

            Contact details verified against the authority's own contact page
            on 26 August 2026: Drukpersstraat 35, 1000 Brussel;
            contact@apd-gba.be; +32 (0)2 274 48 00. The phone number is not
            published here, only the address, email, and website.

            This rests on the entity being established in Belgium. If it is
            incorporated elsewhere, the authority changes and so do the
            supervisory-authority values in organisation.ts.
          */}
        </>
      ),
    },

    children: {
      label: "Children's data",
      body: (
        <p className={P}>
          This site is intended for legal professionals and is not directed at
          children. We do not knowingly collect data from children.
        </p>
      ),
    },

    changes: {
      label: "Changes to this policy",
      body: (
        <p className={P}>
          We may update this policy from time to time. Changes are published on
          this page and take effect from the date of publication, which is
          shown as the &ldquo;Last updated&rdquo; date at the top.
        </p>
      ),
    },

    contact: {
      label: "Contact us",
      body: (
        <>
          <p className={P}>
            Questions about this policy or how we handle your data:{" "}
            <a href={`mailto:${d.contactEmail}`} className={LINK}>
              {d.contactEmail}
            </a>
            .
          </p>
          <p className={NOTE}>
            [Registered postal address, if required for statutory notices.]
          </p>
        </>
      ),
    },
  },
};

export default en;
