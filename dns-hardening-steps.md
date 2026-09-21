# DNS hardening: step by step

Three changes to the `lawforaisafety.org` DNS zone. The zone is on Netlify DNS
(the nameservers are `dns1–4.p09.nsone.net`), so every record below is added
in Netlify: **Domain management → lawforaisafety.org → DNS records**.

Total hands-on time: about 20 minutes, spread over a few weeks because step 1
has a waiting period.

State on 21 September 2026, for reference:

| Record | Value |
| --- | --- |
| SPF | `v=spf1 include:_spf.google.com ~all` |
| DMARC | `v=DMARC1; p=quarantine; rua=mailto:web@lawforaisafety.org,mailto:rua@dmarc.brevo.com` |
| DKIM | Brevo CNAME present. Google Workspace DKIM: not checked |
| CAA | none |

## 1. Move DMARC from `quarantine` to `reject`

**Why.** `quarantine` asks receivers to put forged mail in spam. `reject` asks
them to refuse it. Applicants and admins are told to trust mail from this
domain, so forged mail should not arrive at all.

**The risk.** `reject` also refuses *your own* mail if it fails SPF and DKIM.
So first confirm everything legitimate passes.

1. **Check Google Workspace DKIM is on.** Google Admin console → Apps →
   Google Workspace → Gmail → Authenticate email. If it says "Not
   authenticating", generate the record, add the TXT record it gives you
   (host `google._domainkey`) in Netlify DNS, wait an hour, then press Start
   authentication. Without this, mail sent from Gmail passes on SPF alone,
   which breaks when a message is forwarded.
2. **Read two weeks of DMARC reports.** They arrive as XML attachments at
   `web@lawforaisafety.org`. They are unreadable raw; paste them into a free
   viewer such as <https://dmarcian.com/dmarc-xml/> or
   <https://mxtoolbox.com/DmarcReportAnalyzer.aspx>. Brevo also shows a
   summary under Senders, domains & dedicated IPs → Domains.
3. **Look for one thing:** any source that is genuinely yours (Google, Brevo,
   anything else you send through) showing DMARC **fail**. If there is one,
   fix its SPF or DKIM before going further. Sources you don't recognise
   failing is the policy working.
4. **Send yourself a test** from Gmail and one from the site (a newsletter
   signup confirmation) to a Gmail address. Open each → three dots → Show
   original. All of SPF, DKIM and DMARC should say PASS.
5. **Change the record.** Edit the TXT record at host `_dmarc`:

   ```
   v=DMARC1; p=reject; rua=mailto:web@lawforaisafety.org,mailto:rua@dmarc.brevo.com
   ```

6. **Verify** after a few minutes: `dig +short TXT _dmarc.lawforaisafety.org`
7. Keep glancing at the reports for a month. To back out, set `p=quarantine`
   again; it takes effect within the record's TTL.

Optional, same session: once Google DKIM is confirmed, SPF can be tightened
from `~all` to `-all`. With DMARC at `reject` this adds little; skip it if in
doubt.

## 2. Add CAA records

**Why.** CAA says which certificate authorities may issue certificates for
the domain. Without it, any CA in the world can be tricked or pressured into
issuing one. Netlify uses Let's Encrypt.

1. In Netlify DNS, add two records, both with host `@`, type `CAA`:

   | Flag | Tag | Value |
   | --- | --- | --- |
   | `0` | `issue` | `letsencrypt.org` |
   | `0` | `iodef` | `mailto:web@lawforaisafety.org` |

   The second one is where a CA reports a refused request. It is optional.
2. **Verify:** `dig +short CAA lawforaisafety.org` should print both.
3. **Check renewal still works:** Netlify → Domain management → HTTPS →
   Renew certificate. It should succeed. If it fails, delete the CAA records,
   renew, and ask Netlify support which CA value they need.

If a subdomain is ever pointed at another host (a docs site, a status page),
that host's CA has to be added here first or its certificate will not issue.

## 3. HSTS preload: decide later

The site now sends `Strict-Transport-Security: max-age=63072000;
includeSubDomains` (set in `next.config.ts`). Browsers that have visited once
will refuse plain HTTP for two years, for the domain and every subdomain.

Preloading goes one step further: the domain is compiled into browsers, so
even a first visit is HTTPS-only. It is effectively permanent; removal takes
months to reach users.

Do it only when all of these are true:

1. Every subdomain that exists or is planned serves HTTPS. That includes
   anything pointed at a third party.
2. The header above has been live for a few weeks with no problems.

Then:

1. In `next.config.ts`, change the header value to end with
   `; includeSubDomains; preload`. Deploy.
2. Submit the domain at <https://hstspreload.org>.
3. Expect a few months before it ships in browser releases.

There is no harm in never doing this.
