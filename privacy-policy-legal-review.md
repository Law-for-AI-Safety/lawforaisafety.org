# Privacy policy: handover for legal review

What we need from you, what we have assumed, and what we have already decided.
The policy itself is a working draft, not published: it lives on a branch and
is visible only on the pull request's deploy preview.

**None of this is legal advice.** It was drafted from how the signup and
vetting flow actually behaves in code, so that you are reviewing the real
processing rather than a template. Where we have taken a position, the
reasoning is recorded so you can disagree with it cheaply.

## Where to read it

| | |
| --- | --- |
| English | `/privacy-policy` on the deploy preview |
| Dutch | `/privacy-policy/nl` |
| Swiss French | planned, not yet drafted |

Both languages are the same document; the Dutch is a translation of the
English. Anything still needing input appears on the page itself, either in
`[square brackets]` inside a sentence or as a note set off by a red rule.
Those notes are for you and get deleted before publishing.

Supporting document: `legitimate-interests-assessment.md`, the Article 6(1)(f)
balancing test, also a draft for review.

---

## A. Values we need from you

Six values. Each is stored once and appears in both languages, and in the site
footer where relevant, so there is no risk of two versions disagreeing.

| Value | Notes |
| --- | --- |
| Legal form | VZW/ASBL if a national non-profit, IVZW/AISBL if international. See assumption 3 below. |
| Enterprise number | The KBO/BCE number, `0xxx.xxx.xxx`. |
| Court of the register | The enterprise court with jurisdiction over the registered office, for the "RPR" line required by Article 2:20. Follows automatically from the registered address and appears on the KBO extract. |
| Registered office address | |
| "Last updated" date | |
| "Effective from" date | |

For the developers: the first four are in `src/app/organisation.ts`, the dates
in `src/app/privacy-policy/dates.ts`.

---

## B. Things we have assumed

These are our working assumptions. Each one is load-bearing somewhere in the
policy, and each needs confirming or correcting.

| # | Assumption | Why it matters | If it is wrong |
| --- | --- | --- | --- |
| 1 | The entity is called **Law for AI Safety Institute** | Named as controller throughout, and in the footer | One value changes everywhere |
| 2 | It is **established in Belgium** | Determines that Belgian law applies and which authority supervises us | Both the jurisdiction and the supervisory authority change |
| 3 | It is a **Belgian non-profit**, form not yet settled | Article 2:20 requires the legal form on the website | Only the wording of one line |
| 4 | The **Gegevensbeschermingsautoriteit** is the competent authority | Named as the complaints route | Complaints section changes |
| 5 | Its contact details are current | Address, email and the per-language websites were checked against the authority's own site on 26 August 2026 | Correct the values |
| 6 | **LinkedIn and Google are separate controllers, not processors** | If so, no Article 28 agreement is needed with either, and no international transfer by us arises. Based on the code: the OAuth flow sends them only a client id, a redirect URI, a scope and an opaque random token. Nothing about the applicant crosses to them | They return to the processor list and each needs a transfer mechanism established |
| 7 | **No Data Protection Officer is required** | Article 37(1): not a public authority, no large-scale monitoring, no large-scale special-category processing as a core activity. The policy is therefore silent on it | A DPO must be named on the page and notified to the authority under Article 37(7) |
| 8 | **Legitimate interests, not Article 6(1)(b)**, is the basis for assessing applications | Membership is a networking arrangement and no contract follows from approval. This decides the rights people have: objection applies, portability does not | The rights section has to change with it |
| 9 | The **retained email hash is personal data** | Hashing is pseudonymisation, not anonymisation, so erasure requests reach it. We promise to delete it on request | We could argue compelling legitimate grounds instead, but that argument would need making |
| 10 | **Identity for rights requests is proved by control of the email address**, not by an identity document | The address is the only identifier we hold, so asking for a passport would collect more than we hold. Article 12(6) and 5(1)(c) | The exercising-rights section changes |
| 11 | **Transfer mechanisms** are as published on 26–27 August 2026 | Three processors rely on the EU–US Data Privacy Framework with SCCs as fallback; the email provider uses SCCs | Certifications can lapse. Re-check before publishing |
| 12 | The **Dutch text is accurate** | Machine-drafted from the English and not checked by a native legal translator | Needs a translator |

---

## C. Actions outstanding

1. **Sign the messaging provider's data processing agreement.** Three of our
   four processors incorporate theirs automatically into the terms we have
   already accepted. The fourth does not: it has to be executed through a form
   by an authorised person, so accepting the ordinary customer terms leaves no
   Article 28 agreement covering the workspace approved applicants are invited
   to. This is the one genuine gap.
2. **File the accepted version of each of the four processing agreements.**
   All four providers revise them, and accountability means being able to show
   which text applied when.
3. **Review the legitimate interests assessment** and close its four residual
   points: special-category data volunteered in free-text CVs and position
   statements; the Article 30 record of processing; whether a DPIA is
   triggered; and how Article 21 objections are handled in practice.
4. **Have the Dutch checked** by a native legal translator.
5. **Decide where the statutory identification block belongs.** Article 2:20
   and Article III.74 are site-wide duties, so a legal notice page or the site
   footer satisfies them equally. The footer is already wired and will populate
   itself once the values in section A are set; the same block currently also
   appears in the policy and could be removed from there.

---

## D. Decisions already taken

Recorded so they are not re-opened by accident. Each was a deliberate choice,
and each can be revisited.

| Decision | Reasoning |
| --- | --- |
| Processors are described **by category, not by name** | Article 13(1)(e) permits "recipients or categories of recipients". Categories are given by activity rather than as a bare "IT service providers", which is the formulation the transparency guidance criticises. Note the tension: that guidance treats naming as the default |
| Provider **locations are not given** in the processor list | Where data goes is disclosed in the international transfers section instead, together with the safeguard relied on for each |
| **Sign-in providers are not mentioned** in the sharing or transfers sections | Nothing is disclosed to them, so they are not recipients. What they supply is described where the applicant chooses a sign-in route |
| **Change notice is the date stamp alone** | No separate notification mechanism. Worth noting that a material change affecting newsletter subscribers is a different matter, since we have an email channel to them |
| **No description of what the organisation does** | Not required by Article 13, and a mission statement in a legal document goes stale independently of the processing |
| **Staff reviewer processing is not covered** | The public policy covers applicants and subscribers |
| **Each language is a separate URL** | So a specific version can be linked, cited and indexed |

---

## E. Before this goes live

- [ ] Values in section A supplied
- [ ] Assumptions in section B confirmed or corrected
- [ ] Actions in section C completed
- [ ] Both remaining counsel notes deleted from the page
- [ ] The "Draft for legal review" banner deleted
- [ ] Transfer certifications re-checked if time has passed
- [ ] Dutch reviewed

The page is already linked from the site footer, so it becomes public the
moment the branch is merged.
