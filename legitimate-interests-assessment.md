# Legitimate Interests Assessment

**Status: draft for legal review. Not legal advice.** Written from how the
signup and vetting flow actually behaves in code, so that counsel is reviewing
the real processing rather than a template. Everything in `[square brackets]`
needs input.

|             |                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------ |
| Controller  | Law for AI Safety Institute, `[legal form]`, `[registered address]`, `[enterprise number]` |
| Prepared    | 27 August 2026                                                                             |
| Prepared by | `[name and role]`                                                                          |
| Reviewed by | `[counsel, date]`                                                                          |
| Next review | `[date — suggest annually, or on any change to the flow]`                                  |

This assessment covers the three processing operations that rely on Article
6(1)(f). It does **not** cover the newsletter, which runs on consent under
Article 6(1)(a), or anything we do because the law requires it.

Related: the privacy policy at `/privacy-policy` (source in
`src/app/privacy-policy/content/`), and `signup-feature-spec.md` for the flow
itself.

---

## Processing in scope

| #   | Operation                                        | Data                                                                                                                                                                                                   |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Assessing applications to join the network       | Name and email (provider-verified via LinkedIn or Google, or self-reported); organisation; LinkedIn URL; CV (PDF, max 5 MB); position statement; comments; profile photo where a provider supplies one |
| 2   | Recognising repeat applications after a decision | One-way HMAC of the email address, the outcome, and reviewer notes on rejections only                                                                                                                  |
| 3   | Preventing automated and abusive submissions     | IP address, used transiently and never stored; signals collected by Cloudflare Turnstile                                                                                                               |

---

## 1. Assessing applications

### Purpose test — is there a legitimate interest?

We convene legal professionals working on large-scale AI risk. Membership is
open by application, and the point of reviewing an application is to confirm
that the applicant is a real person with a genuine professional connection to
the field. Without that, the network cannot do what members join it for: talk
candidly with peers whose background is known.

The interest is our own, and it is shared by existing members, who rely on the
network being what it claims to be. It is a lawful, specific and real interest
rather than a speculative one — we act on it every time an application arrives.

No ethical concern arises from reviewing material a person has deliberately
sent us for that exact purpose.

### Necessity test — is the processing necessary?

Yes, and it is hard to see a lighter alternative that achieves the same thing.
Assessing professional relevance requires seeing something about the person's
professional background; the form requires at least one of a LinkedIn URL, a
CV, or a written position statement, and treats all three as optional
individually. That is the minimum needed to make the judgement at all.

Alternatives considered:

- **Open membership with no review.** Does not meet the purpose; the network's
  value to members rests on the review happening.
- **Consent as the basis instead.** Consent would be unsound here: refusing
  would mean we could not assess the application the person has just asked us
  to assess, so it would not be freely given in any meaningful sense.
- **Collecting less.** Already done. Every field except identity is optional,
  the CV is capped at 5 MB and PDF only, and nothing is asked that does not
  bear on the assessment.

### Balancing test — do our interests override theirs?

**Reasonable expectations.** Strong. A person completing an application form
expects it to be read and a decision made. Nothing here would surprise them.

**Nature of the data.** Ordinary professional information. Not special
category _by design_ — but the position statement and CV are free text, and an
applicant can volunteer political opinions, trade union membership, religion or
health unprompted. See Residual risks below.

**Likely impact.** The adverse outcome is rejection. That is a real
disappointment but low severity: no financial consequence, no effect on their
employment, and no decision made about them anywhere else. Every application is
read and decided by a person; there is no automated decision-making or
profiling within Article 22.

**Safeguards already in place.**

- An application abandoned before identity verification, and any CV uploaded
  with it, is deleted automatically after 24 hours.
- On a decision, the entire record is deleted immediately once the applicant
  has been notified. Only operation 2 below survives.
- CVs are validated server-side, kept in private object storage, never publicly
  accessible, and viewed through a sandboxed in-browser viewer rather than
  downloaded to a reviewer's device.
- Review access is restricted to a named list of authorised people behind an
  authenticated session.
- Reviewers are instructed not to record names or identifying details in
  rejection notes.
- Applicants are told at the point of collection what happens, and can object
  or ask for erasure at any time; an admin tool exists to carry that out.

**Conclusion.** The interest is not overridden. The processing is what the
applicant asked for, the retention is short, and the impact of the worst
outcome is limited.

---

## 2. Recognising repeat applications

### Purpose test

After a decision, we keep a one-way HMAC of the email address with the outcome
so that a second application from the same person is recognised. This spares
reviewers from re-reviewing a case already decided, and gives them the context
that a previous application exists — which matters most where someone was
previously rejected and reapplies unchanged.

### Necessity test

Necessary in the sense that the alternatives are worse for the applicant.
Keeping the full application record would achieve the same and be far more
intrusive. Keeping nothing would mean every reapplication is reviewed cold, and
rejected applicants could be re-reviewed repeatedly with no memory of the
earlier decision.

The HMAC is the minimum that works: a single pseudonymised field, with the
outcome and, for rejections only, reviewer notes.

### Balancing test

**Reasonable expectations.** Moderate. Most applicants do not think about what
happens after a decision. This is why the privacy policy spells it out
explicitly rather than burying it.

**Nature of the data.** Pseudonymised, not anonymised. Hashing an email is
pseudonymisation: the space of candidate addresses is small enough to test, so
anyone holding a candidate address can confirm whether it is in the set. It is
therefore still personal data, and we treat it as such. It cannot be turned
back into an email address by someone who does not already have one to try.

**Likely impact.** Low. The record cannot be used to contact the person, to
identify them from scratch, or to build any profile. Its only effect is on a
future application they choose to make.

**Safeguards.**

- HMAC rather than a plain digest, so the stored value cannot be checked
  against a wordlist without the secret.
- Reviewer notes retained only for rejections, and only with instructions not
  to include identifying details.
- Erasure honoured on request: the hash and any notes are deleted, using the
  admin erasure tool. We accept that this means a later application from that
  person is reviewed with no prior context.

**Conclusion.** Not overridden. The retained data is minimal and its only
consequence is one the applicant can remove on request.

---

## 3. Preventing automated and abusive submissions

### Purpose test

Public forms attract automated submissions. Without protection, the review
queue fills with junk, real applications are delayed, and the transactional
email path can be abused to send mail to third parties.

### Necessity test

Necessary. Rate limiting requires seeing the requesting IP, and bot detection
requires the signals Cloudflare Turnstile collects. Neither purpose can be met
without them, and no less intrusive method achieves the same result on a public
form.

### Balancing test

**Reasonable expectations.** High. Bot protection on a public form is
universal, and Turnstile is visible on the page.

**Nature and impact.** The IP address is used transiently for rate limiting and
passed to Turnstile; it is never written to our database. Turnstile's own
signals are governed by Cloudflare's privacy policy. Impact on a legitimate
applicant is effectively nil — at worst, a challenge to complete.

**Safeguards.** No storage of the IP; Turnstile chosen over alternatives that
profile users more heavily; disclosed in the privacy policy.

**Conclusion.** Not overridden, comfortably.

---

## Residual risks and open points

1. **Special category data volunteered in free text.** The CV and position
   statement are unstructured, and an applicant may include Article 9 data
   unprompted. There is currently no Article 9 condition covering that.
   Options: a line on the form asking applicants not to include it; reviewer
   instructions to disregard and not transcribe it; or an explicit-consent
   tick. `[Counsel to choose.]` Note that Brevo's DPA, clause 3.2(vi),
   separately forbids putting special-category data into data sent to them —
   not currently an issue, as Brevo receives only email addresses.
2. **Records of processing (Article 30).** Separate obligation from this
   assessment. The under-250-employee exemption does not apply where processing
   is not occasional, and a continuously open applications pipeline is not
   occasional. `[Confirm a ROPA exists.]`
3. **DPIA (Article 35).** Provisional view: not required. The processing is not
   large scale, involves no systematic monitoring of a publicly accessible
   area, and no special category data as a core activity. `[Counsel to
confirm, and record the conclusion either way.]`
4. **Right to object.** Because this processing rests on Article 6(1)(f),
   Article 21 gives a right to object. There is no automated route for this; it
   arrives by email and is handled manually. `[Confirm the handling process is
written down.]`

---

## Outcome

Legitimate interests is an appropriate basis for all three operations, subject
to the residual points above. This assessment should be revisited if the
application flow changes, if new categories of data are collected, or if the
retention design changes — in particular the treatment of the email hash.
