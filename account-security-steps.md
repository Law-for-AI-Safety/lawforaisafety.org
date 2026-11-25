# Account security: step by step

The code can be correct and the site still be taken over through the accounts
around it. This is the checklist for those accounts. About 45 minutes in
total, mostly logging in to things. Do part 1 first; it matters most.

## 1. Admin Google Workspace accounts (10 minutes, then 5 per admin)

Admin login is "Log in with Google" with the organisation's own Google
Workspace account, plus the `ADMIN_EMAILS` allowlist. The login takes only an
account the Workspace manages, on the domain set in `ADMIN_GOOGLE_DOMAIN`:
personal Google accounts and other organisations' accounts are refused even
when their address is on the list. So the Workspace decides who holds each
admin account, and its controls apply to the admin panel:

1. Google Workspace Admin console → Security → Authentication → **2-step
   verification** → allow it, then **enforce** it for everyone, with
   security keys or the Google Authenticator app rather than SMS.
2. Every admin has their own Workspace account (not a shared one such as
   `info@`), and that Workspace address is what is in `ADMIN_EMAILS` and the
   lists below.
3. Admin console → Reporting → Audit and investigation → **Login log
   events** shows every sign-in, including failed ones and from where.

### Moving admins off LinkedIn

Admin login used to be "Log in with LinkedIn", and still offers it while
admins move. LinkedIn accounts are personal, so none of the controls above
reach them. Each admin moves once:

1. Their Workspace address is added to `ADMIN_EMAILS` and to every list below
   that their old address is on, next to their old LinkedIn address. Until it
   is, the switch is refused with a message saying what's missing, and they
   stay signed in with LinkedIn.
2. They log in with LinkedIn as usual. The admin area shows a **Switch to
   Google** banner; they click it, and choose their Workspace account in
   Google's account chooser.
3. From then on LinkedIn login is refused for both their addresses, and their
   LinkedIn sessions end. Their CMS role, the tasks assigned to them and the
   projects they own move to their Workspace address. `/admin/settings` →
   LinkedIn logins shows who has moved.

Only the banner links the two addresses. It is clicked by whoever holds the
LinkedIn session, and the switch completes only if Google returns to that same
session, so another admin signing in with Google on a shared browser can't
close their LinkedIn login. A Google sign-in started anywhere else
closes LinkedIn only for the Workspace address, so ask admins to switch from
the banner.

A LinkedIn account that reports a Workspace address is refused from the
start, with a message to use Google: its owner holds that Workspace account.

`ADMIN_LINKEDIN_KEEP_EMAILS` lists the LinkedIn addresses that stay open even
after their owner has moved (comma-separated, each also in `ADMIN_EMAILS`).
Their CMS role is copied to the Workspace address rather than moved, so it
works from both. Their tasks and projects move to the Workspace address like
everyone else's.
Keep it as short as possible: every address on it can reach the admin panel
without the Workspace's 2-step verification. For anyone on it, also do the
LinkedIn steps below.

Once everyone not on that list has moved, remove their old addresses from
`ADMIN_EMAILS` and the other lists.

Unsetting `ADMIN_GOOGLE_DOMAIN` switches Google login off again: the login
page offers only LinkedIn, and LinkedIn login works again for everyone who had
switched. Use it if Google login has to be undone in a hurry.

### Admins still on LinkedIn

For each admin who still logs in with LinkedIn:

1. LinkedIn → Me → Settings & Privacy → Sign in & security → **Two-step
   verification** → turn on → choose **Authenticator app**, not SMS.
2. Save the recovery codes in a password manager.
3. Same page → **Where you're signed in** → end any session you don't
   recognise.
4. Same page → **Email addresses** → remove old addresses you no longer
   control. Any confirmed address can be used to reset the password.
5. Use a password that is unique to LinkedIn.
6. **Pin their LinkedIn account id**: once they have logged in, a technical
   admin copies the id shown at `/admin/settings` → LinkedIn logins into the
   `ADMIN_LINKEDIN_SUBS` environment variable in Netlify (comma-separated,
   one per admin) and redeploys. From then on LinkedIn login needs an
   allowlisted email **and** an allowlisted account id, so someone
   registering a new LinkedIn account against an admin's address is refused.

Then **set who the technical admins are**. Everyone in `ADMIN_EMAILS` can
read applications and approve or reject them, and use the task tracker and
the opportunities board. Only technical admins can erase data, switch signup
on and off, and see the audit log.

What else an admin can reach is set the same way, and every list below only
narrows `ADMIN_EMAILS`, never adds to it:

| Access | Set by | When unset |
|---|---|---|
| Technical admin pages, every CMS permission | `TECH_ADMIN_EMAILS` | nobody |
| Task tracker (`/admin/task-tracker`) | `TASK_TRACKER_TEAM_EMAILS` | every admin |
| Opportunities board (`/admin/opportunities`) | `OPPORTUNITIES_TEAM_EMAILS` | every admin |
| Editing (`draft`) or publishing (`publish`) CMS pages | a role a technical admin gives at `/admin/settings` | nobody |

1. In Netlify, set `TECH_ADMIN_EMAILS` to a comma-separated subset of
   `ADMIN_EMAILS`. Name two people, so an erasure request (one-month
   deadline) never depends on one person being available.
2. Redeploy. Until this is set, those pages are closed to everyone.

When an admin leaves: suspend their Workspace account, which stops their next
Google login at once. Then remove both their addresses from `ADMIN_EMAILS`,
`TECH_ADMIN_EMAILS`, `TASK_TRACKER_TEAM_EMAILS`, `OPPORTUNITIES_TEAM_EMAILS`
and `ADMIN_LINKEDIN_KEEP_EMAILS`, and their id from `ADMIN_LINKEDIN_SUBS`,
redeploy, and remove their CMS role at `/admin/settings`. Their session ends on their next
request after the redeploy; to end it sooner, a technical admin ends their
sessions at `/admin/settings` → Signed in.

Once a month, skim `/admin/audit`: logins you don't recognise, approvals
nobody remembers making, or an erasure with no matching email thread are all
worth a question.

Treat any "please sign in to Google" or "please log in to LinkedIn" page
reached from a link in Slack, an email or an application as hostile. Go to
`/admin/login` yourself instead.

## 2. Two-factor on everything else (15 minutes)

For each: confirm 2FA is on for every member, remove anyone who shouldn't be
there, and make sure no login is shared between people.

1. **GitHub** (`Law-for-AI-Safety` organisation) → Settings → Authentication
   security → tick **Require two-factor authentication**. Then Settings →
   People, and review outside collaborators.
2. **Netlify** → User settings → Security → 2FA. Then Team → Members. Netlify
   holds every secret the site has, so this is the second most important
   account after part 1.
3. **Google Workspace**: done in part 1. It also protects `web@` and
   `info@`, which receive DMARC reports and erasure requests.
4. **Brevo** → profile → Security → 2FA. Then Users.
5. **Slack** → workspace settings → Authentication → require two-factor for
   the workspace.

Also worth a look while there: **Cloudflare** (Turnstile) and **Google Cloud**
(the OAuth client) each have a 2FA setting and a member list.

## 3. Slack workspace (5 minutes)

1. Settings & administration → Workspace settings → Permissions →
   **Invitations**: set to admins only, and turn on **Require admin
   approval**. One person sends invites today; this makes the workspace
   enforce that rather than rely on it.
2. The bot token (`SLACK_BOT_TOKEN`): api.slack.com/apps → the app → OAuth &
   Permissions. Scopes should be `users:read` and `users:read.email` and
   nothing else. Remove any others and reinstall.
3. The incoming webhook (`SLACK_WEBHOOK_URL`) is a password for posting in
   the reviewers' channel. If it has ever been pasted into a chat, a
   screenshot or a document, revoke it (same app → Incoming Webhooks →
   Remove), create a new one, and update Netlify.
4. Tell reviewers: the application link in that channel always starts with
   `https://lawforaisafety.org/admin/`. Anything else is not from the site.

## 4. Brevo API key (5 minutes)

1. Brevo → SMTP & API → API keys. There should be one key for the site, with
   a name that says so. Delete any others.
2. If it has ever been shared outside Netlify's environment variables, make a
   new key, update `BREVO_API_KEY` in Netlify, redeploy, then delete the old
   one.
3. Brevo → Security → Authorised IPs: leave off. Netlify functions don't have
   fixed addresses, so an allowlist would break sending.

## 5. Site secrets (5 minutes)

`SESSION_SECRET` signs admin sessions. `EMAIL_HASH_SECRET` keys the
record of past decisions.

1. Netlify → Site configuration → Environment variables. Check each is long
   and random (44 characters if made with the command below), and that the
   two are different from each other.
2. To replace a weak `SESSION_SECRET`: run `openssl rand -base64 32`, paste
   the output as the new value, redeploy. Every admin is logged out; nothing
   else happens.
3. **Do not rotate `EMAIL_HASH_SECRET` casually.** Changing it orphans every
   record in `processed_applications`: previously rejected applicants stop
   being flagged, and erasure lookups stop finding past decisions. Only
   change it if it has leaked, and accept that loss.
4. Check both have different values in the production and deploy-preview
   contexts, so a preview deploy can't mint a production session.

## 6. Put a date in the calendar

Every six months: redo parts 1 to 3 (people change), and run `npm audit` on
the repository, or turn on Dependabot alerts in GitHub → Settings → Code
security so it happens without anyone remembering.
