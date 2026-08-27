# Privacy policy: handover for legal review

What we need from you, what we have assumed, and what we have already decided.
The policy itself is a working draft, not published: it lives on a branch and
is visible only on the pull request's deploy preview. The full text is
appended at the end of this document.

**None of this is legal advice.** It was drafted from how the signup and
vetting flow actually behaves in code, so that you are reviewing the real
processing rather than a template. Where we have taken a position, the
reasoning is recorded so you can disagree with it cheaply.

Both languages are the same document, the Dutch being a translation of the
English: `/privacy-policy` and `/privacy-policy/nl` on the deploy preview.
Swiss French is planned but not drafted. Anything still needing input appears
on the page itself, either in `[square brackets]` inside a sentence or as a
note set off by a red rule. Those notes are for you and get deleted before
publishing.

Supporting document: `legitimate-interests-assessment.md`, the Article 6(1)(f)
balancing test, also a draft for review.

---

## 1. Values

Every value below is stored once and appears in both languages, and in the site
footer where relevant, so there is no risk of two versions disagreeing. Blank
rows are the ones we cannot supply ourselves.

| Value | Current | Status |
| --- | --- | --- |
| Entity name | Law for AI Safety Institute | Told to us, not checked against a filing |
| Country of establishment | Belgium | Assumed, and load-bearing: see section 2 |
| Legal form | | Needed. VZW/ASBL if national, IVZW/AISBL if international |
| Enterprise number | | Needed. The KBO/BCE number, `0xxx.xxx.xxx` |
| Court of the register | | Needed. The enterprise court with jurisdiction over the registered office, for the "RPR" line required by Article 2:20. Follows from the address and appears on the KBO extract |
| Registered office | | Needed |
| Supervisory authority | Belgian Data Protection Authority (Gegevensbeschermingsautoriteit) | Follows from establishment in Belgium |
| Authority address | Drukpersstraat 35, 1000 Brussel | Checked against the authority's own site, 26 August 2026 |
| Authority email | contact@apd-gba.be | Checked, same date |
| Authority website | dataprotectionauthority.be (EN), gegevensbeschermingsautoriteit.be (NL) | Checked, same date. A French version would use autoriteprotectiondonnees.be |
| Territory for transfer wording | EEA | Follows from the GDPR applying directly |
| Contact address for privacy queries | info@lawforaisafety.org | In use |
| "Last updated" date | | Needed |
| "Effective from" date | | Needed |

For the developers: the first group lives in `src/app/organisation.ts`, the two
dates in `src/app/privacy-policy/dates.ts`.

---

## 2. Positions we have taken

Each of these is load-bearing somewhere in the policy. Several were reasoned
from the code rather than from a document, which is exactly why they need
confirming.

- **The organisation is established in Belgium.** Everything else rests on
  this. It decides that Belgian law applies and that the Belgian authority
  supervises us. If the entity is incorporated elsewhere, the jurisdiction and
  the supervisory authority both change.

- **LinkedIn and Google are separate controllers, not our processors.** The
  OAuth flow sends them only a client id, a redirect URI, a scope and an opaque
  random token; nothing about the applicant crosses to them, and they
  authenticate their own account holders under their own policies. So no
  Article 28 agreement is needed with either and no transfer by us arises. If
  you disagree, they return to the processor description and each needs a
  transfer mechanism established.

- **No Data Protection Officer is required.** Article 37(1): not a public
  authority, no large-scale regular monitoring, no large-scale special-category
  processing as a core activity. The policy is therefore silent on it, which is
  a position rather than an omission. If one is appointed, even voluntarily,
  Article 37(7) requires publishing the contact details and notifying the
  authority.

- **Legitimate interests, not Article 6(1)(b), is the basis for assessing
  applications.** Membership is a networking arrangement and no contract
  follows from approval. This decides what rights people have: objection
  applies, portability does not. The rights section is written to match.

- **The retained email hash is personal data.** Hashing an email is
  pseudonymisation, not anonymisation, so erasure requests reach it, and the
  policy promises to delete it on request. The alternative was to refuse on
  compelling legitimate grounds under Articles 17(1)(c) and 21(1), which would
  need arguing.

- **Identity for rights requests is proved by control of the email address**,
  not by an identity document. The address is the only identifier we hold, so
  asking for a passport would collect something more sensitive than anything we
  have. Articles 12(6) and 5(1)(c).

- **Transfer mechanisms are as published on 26 to 27 August 2026.** Three
  processors rely on the EU-US Data Privacy Framework with standard contractual
  clauses as a fallback; the email provider relies on the clauses. Certifications
  can lapse, so this wants re-checking before publication.

- **The Dutch text is machine-drafted** and has not been checked by a native
  legal translator.

---

## 3. Actions outstanding

1. **Sign the messaging provider's data processing agreement.** Three of our
   four processors incorporate theirs automatically into terms we have already
   accepted. The fourth does not: it must be executed through a form by an
   authorised person, so accepting the ordinary customer terms leaves no
   Article 28 agreement covering the workspace approved applicants are invited
   to. This is the one genuine gap.
2. **File the accepted version of each of the four agreements.** All four
   providers revise them, and accountability means showing which text applied
   when.
3. **Review the legitimate interests assessment** and close its four residual
   points: special-category data volunteered in free-text CVs and position
   statements; the Article 30 record of processing; whether a DPIA is
   triggered; and how Article 21 objections are handled in practice.
4. **Have the Dutch checked** by a native legal translator.
5. **Decide where the statutory identification block belongs.** Article 2:20
   and Article III.74 are site-wide duties, so a legal notice page or the site
   footer satisfies them equally. The footer is already wired and populates
   itself once the values above are set; the same block currently also appears
   in the policy and could be removed from there.

---

## 4. Decisions already taken

Recorded so they are not reopened by accident. Each was deliberate, and each
can be revisited.

- **Processors are described by category, not by name.** Article 13(1)(e)
  permits "recipients or categories of recipients". The categories are given by
  activity rather than as a bare "IT service providers", which is the
  formulation the transparency guidance criticises. Note the tension: that
  guidance treats naming as the default.
- **Provider locations are not given** in that description. Where data goes is
  disclosed in the international transfers section instead, with the safeguard
  relied on for each.
- **Sign-in providers are not mentioned** in the sharing or transfers sections,
  because nothing is disclosed to them. What they supply is described where the
  applicant chooses a sign-in route.
- **Change notice is the date stamp alone.** No separate notification
  mechanism. A material change affecting newsletter subscribers is a different
  matter, since we have an email channel to them.
- **No description of what the organisation does.** Not required by Article 13,
  and a mission statement in a legal document goes stale independently of the
  processing.
- **Staff reviewer processing is not covered.** The public policy covers
  applicants and subscribers.
- **Each language is a separate URL**, so a specific version can be linked,
  cited and indexed.

---

## 5. Before this goes live

- [ ] Values in section 1 supplied
- [ ] Positions in section 2 confirmed or corrected
- [ ] Actions in section 3 completed
- [ ] Both remaining counsel notes deleted from the page
- [ ] The "Draft for legal review" banner deleted
- [ ] Transfer certifications re-checked if time has passed
- [ ] Dutch reviewed

The page is already linked from the site footer, so it becomes public the
moment the branch is merged.

---

# Appendix: the policy in full

Generated from the rendered English page. The Dutch version at
`/privacy-policy/nl` carries the same clauses in the same order under the same
numbering. Blockquoted passages are the notes for counsel, which are deleted
before publishing.

---

> **Draft for legal review.** Bracketed items (e.g. `[registered address]`) are placeholders still needing input from counsel, as do the annotated notes set off by a rule. Entity, jurisdiction, and supervisory authority are filled in provisionally, on the basis that this is a Belgian non-profit, and need confirming. The Dutch version is a translation of this English text and has not been reviewed by a native legal translator. Resolve all of the above before this is published or linked from the site.

# Privacy Policy

Last updated: [date]. Effective from: [date]

The Law for AI Safety Institute (“Law for AI Safety”, “we”, “us”, “our”) takes the protection of your privacy seriously and handles your personal data (“your data”) with care.

This policy explains what data we collect through lawforaisafety.org, why we collect it, who we share it with, how long we keep it, and what rights you have. It covers the two things you can do on this site: applying to work with us, and subscribing to our newsletter.

If you have any questions after reading this policy, please get in touch.

## 1. Who we are

The Law for AI Safety Institute, [legal form], registered in Belgium at [registered address], is the controller of the personal data described in this policy. This means we determine the purposes and the means of the processing. If you have questions about this policy or how we handle your data, contact us at info@lawforaisafety.org.

- Enterprise number: [enterprise number]
- Register of legal entities (RPR): [competent court]

> [Counsel: supply the legal form, enterprise number, and court of the register. Article 2:20 of the Companies and Associations Code requires a legal person's name, legal form, registered office, enterprise number, and register with its competent court on the website, whichever non-profit form is chosen; Article III.74 of the Code of Economic Law requires the enterprise number on publications. Both are site-wide obligations, so a legal notice or the site footer would satisfy them equally, and this block could move there. “NGO” is a description, not a legal form: the candidates are a national non-profit (VZW/ASBL) or an international one (IVZW/AISBL).]

---

## 2. What data we collect

What we hold depends on how you interact with us. Below is the full set.

### If you apply to work with us

You verify your identity through one of three routes, and we collect different data depending on which one you use:

- LinkedIn sign-in: we receive your name, email address, and profile photo directly from LinkedIn once you confirm on their site. We never see your password. This data is provider-verified.
- Google sign-in: as above, with your name, email address, and profile photo coming directly from Google.
- Name and email only, with no identity verification: if you don't use LinkedIn or Google, you can type your name and email directly. This data is entirely self-reported and unverified. We have no proof it's accurate, and our reviewers are told to treat it that way.

If you use LinkedIn or Google, you sign in on their site rather than ours, and they confirm those details back to us. They act as controllers of your data in their own right, under their own privacy policies, rather than on our instructions. We never send them your application, but signing in does tell them you have used your account here.

Alongside identity verification, the application form collects:

- Organisation or firm (optional, self-reported)
- LinkedIn profile URL (optional, self-reported)
- A CV/résumé file, PDF only, up to 5 MB (optional)
- A written position statement describing your role and relevance (optional)
- General comments (optional)
- Whether you'd like to also join our newsletter

You must provide at least one of a LinkedIn URL, a CV, or a position statement, so we have something to assess your professional background against.

### If you subscribe to our newsletter only

Just your email address, plus the confirmation status and timestamp of your double opt-in click.

### Technical and anti-abuse data

- Your IP address, used transiently for rate-limiting and passed to Cloudflare Turnstile (see below) to verify you're not a bot. It is not stored in our database.
- Signals collected by Cloudflare Turnstile as part of its bot challenge, governed by Cloudflare's own privacy policy.

---

## 3. CVs and application materials

If you upload a CV, it is validated server-side before storage and kept in private object storage. It is never publicly accessible. Reviewers view it through a sandboxed, in-browser viewer rather than downloading it. Your CV is deleted automatically as soon as a decision is made on your application, or after 24 hours if you never complete the identity verification step.

---

## 4. Why we collect your data

We process your data only for the purposes set out below:

- To assess and decide on applications to work with us
- To notify you of the outcome of your application by email
- To add you to our mailing list and send you our newsletter, if you've opted in
- To detect duplicate or repeat submissions, and to give reviewers context if you've applied before
- To protect the site against spam and automated abuse
- If your application is approved, to invite you to our Slack workspace

We do not use your data for automated decision-making or profiling. Every application is read and decided by a person.

---

## 5. Our legal basis for processing

- Consent: newsletter signups, whether standalone or via the application form's opt-in checkbox, confirmed by double opt-in for standalone signups. You can withdraw consent at any time by unsubscribing.
- Legitimate interests: assessing applications from legal professionals wanting to work with us, and preventing fraudulent or automated submissions, weighed against your interests and rights.
- Legal obligations: where we are required to retain or disclose data by law.

---

## 6. How long we keep your data

We do not keep your data longer than is necessary for the purpose it was collected for. In practice:

- Started but never completed an application, meaning identity verification was not finished: deleted automatically after 24 hours, including any uploaded CV.
- Application awaiting review: kept until a reviewer makes a decision.
- Decided, whether approved or rejected: your full application record (name, email, CV, profile photo, everything you submitted) is deleted immediately once the decision is made and you've been notified. We retain only a one-way cryptographic hash of your email address, together with the outcome, so we can recognise a repeat application. The hash cannot be reversed back to your email address, though it still counts as data about you, and if you ask us to erase your data we delete the hash as well. For rejections only, the reviewer's internal notes are kept alongside the hash and are deleted with it; reviewers are instructed not to include your name or other identifying details in those notes.
- Newsletter subscribers: your email is kept for as long as you remain subscribed. You can unsubscribe at any time via the link in any newsletter email.

---

## 7. Who we share your data with

We don't sell your personal data. We share it only:

- Within our own team, with the reviewers and staff who need access to do their work.
- With processors: service providers acting on our instructions and contractually obliged to protect your data. These are listed below.
- With third parties, where legally required or necessary to provide the service you asked for.

The kinds of processor we use, each for the specific purpose described:

- A bot-protection provider, to check that submissions to our forms are not automated.
- An email provider, to send transactional emails (your application outcome, newsletter confirmation) and to manage our newsletter mailing list. You can unsubscribe from the newsletter at any time using the unsubscribe link in any newsletter email.
- A team messaging provider, which hosts the workspace you are invited to if your application is approved. Before inviting you, a reviewer checks whether you are already a member.
- A hosting provider, which runs this site, holds application data in a managed database, and keeps uploaded CVs in private object storage.

---

## 8. International data transfers

Some of our processors are outside the EEA, and our email provider uses sub-processors that are. Every such transfer is covered by a legal safeguard:

- Our bot-protection, hosting, and team messaging providers are certified under the EU-US Data Privacy Framework, and each falls back on the European Commission's Standard Contractual Clauses if that certification ceases to apply.
- Our email provider builds the Standard Contractual Clauses into its data processing agreement for transfers to its sub-processors outside the EEA. Its own servers are within it; the transfers arise from a handful of its suppliers.

---

## 9. Cookies

The public site sets no analytics, advertising, or tracking cookies.

- Cloudflare Turnstile may set its own cookies as part of its bot challenge, governed by Cloudflare's privacy policy.

---

## 10. How we protect your data

We take appropriate technical and organisational measures to secure your data against loss, theft, and unauthorised access:

- Data in transit is encrypted (HTTPS/TLS).
- Uploaded CVs are validated server-side (file signature, size cap) before storage, and viewed by reviewers only through a sandboxed in-browser viewer, not downloaded to a reviewer's device.
- Access to the internal system where applications are reviewed is restricted to a specific list of authorised people, each signed in to an authenticated session.
- Automated submissions are filtered by bot-detection and rate limiting before they reach our systems.

---

## 11. Your rights

Subject to applicable law, you have the following rights in relation to your data:

- Right of access: you can ask what data we hold about you.
- Right to rectification: you can have inaccurate or incomplete data corrected.
- Right to erasure: you can ask us to delete your data.
- Right to restriction: you can ask us to limit how we process your data.
- Right to object: you can object to our processing of your data where we rely on legitimate interests, which is the basis on which we assess applications.
- Right to data portability: where we rely on your consent, which currently means the newsletter, you can ask for a copy of that data in a structured, commonly used, machine-readable format.
- Right to withdraw consent: where we rely on consent, you can withdraw it at any time, without affecting processing that already took place.

---

## 12. How to exercise your rights

To exercise any of these rights, contact us at info@lawforaisafety.org.

Before we act on a request to see or delete your data, we need to know it really comes from you, so that we don't hand over or destroy someone else's data on a stranger's say-so. Your email address is the only identifier we hold for you, so showing that you control it is enough: normally that just means writing to us from that address, or confirming a one-time code we send to it. We will not ask you for a copy of a passport or identity card to deal with a request about data you gave us by email.

We will respond within one month. If a request is unusually complex we may take up to two further months, and we will tell you inside the first month if that happens.

---

## 13. Complaints

If you are unhappy with how we handle your data, please tell us first. We would rather fix it directly. You also have the right to complain to the Belgian Data Protection Authority (Gegevensbeschermingsautoriteit), and to take legal action if you believe your rights have been infringed.

- Address: Drukpersstraat 35, 1000 Brussels, Belgium
- Email: contact@apd-gba.be
- Website: www.dataprotectionauthority.be

---

## 14. Children's data

This site is intended for legal professionals and is not directed at children. We do not knowingly collect data from children.

---

## 15. Changes to this policy

We may update this policy from time to time. Changes are published on this page and take effect from the date of publication, which is shown as the “Last updated” date at the top.

---

## 16. Contact us

Questions about this policy or how we handle your data: info@lawforaisafety.org.

> [Registered postal address, if required for statutory notices.]
