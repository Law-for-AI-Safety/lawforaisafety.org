# GitHub App for the website editor

The website editor in `/admin/cms` publishes a page by opening a pull request that changes that page's file in `content/`. It does this as a GitHub App, so editors never need a GitHub account. A maintainer reviews and merges the pull request, and the normal Netlify production deploy makes it live.

Until the settings below are in Netlify, the editor works as before (drafts, preview) and the Publish button says "Publishing is not set up on this site yet".

## What the App does

| Step | API calls |
| --- | --- |
| Publish | Reads `content/<page>.json` on `main`, makes one commit that changes only that file, creates the branch `cms/<page>-<YYYY-MM-DD>` (with `-2`, `-3`, … if taken), opens a pull request into `main`, then adds the deploy preview link to its description. |
| Status | When an editor opens a page that is waiting, reads that pull request (and, once it is closed, its last comment). No polling. |
| Withdraw | Closes the pull request and deletes its branch. |

It never merges, never approves, and never pushes to a branch after opening its pull request. Code: `src/cms/github.ts` (client), `src/cms/publish.ts` (the steps), `src/app/admin/cms/actions.ts` (permission checks and locking).

## 1. Create the App

On the organisation (Settings → Developer settings → GitHub Apps → New GitHub App):

- **Name:** anything, for example `LAIS website editor`. The bot account will be `<app-slug>[bot]`.
- **Homepage URL:** `https://lawforaisafety.org`.
- **Webhook:** untick **Active**. The site does not receive webhooks.
- **Repository permissions:**
  - **Contents: Read and write**: needed to make the commit and create and delete `cms/*` branches.
  - **Pull requests: Read and write**: needed to open, read and close the pull request and read its comments.
  - **Metadata: Read-only** (GitHub requires it).
  - Everything else: **No access**. In particular, no **Workflows** permission, so the App cannot change anything in `.github/workflows/`, and no **Administration**.
- **Organization and account permissions:** none.
- **Where can this GitHub App be installed?** Only on this account.

GitHub has no "contents write but no merge" permission: the merge API also counts as contents write. What stops the App from merging is the branch protection on `main` (below), not its permissions.

Then:

1. **Generate a private key** (App settings → Private keys). A `.pem` file downloads. Keep it only long enough to paste it into Netlify, then delete it.
2. **Install App** → this organisation → **Only select repositories** → `lawforaisafety.org`. Install it on this repo only.
3. Note the **App ID** (App settings, "About") and the **installation ID** (the number at the end of the installation's settings URL, `…/settings/installations/<id>`).

## 2. Netlify environment variables

Site configuration → Environment variables. Mark the private key as a **secret** value. Set them for the production context, and for deploy previews only if you want to try publishing from a preview (see "Verify end to end").

| Variable | Value |
| --- | --- |
| `GITHUB_APP_ID` | The App ID. |
| `GITHUB_APP_INSTALLATION_ID` | The installation ID. |
| `GITHUB_APP_PRIVATE_KEY` | The whole `.pem` file, including the `BEGIN` and `END` lines. Line breaks may be kept or written as `\n`. |
| `GITHUB_REPO_OWNER` | `Law-for-AI-Safety` |
| `GITHUB_REPO_NAME` | `lawforaisafety.org` |
| `GITHUB_API_URL` | Leave unset (defaults to `https://api.github.com`). The end-to-end tests point it at a local fake. |
| `CMS_PREVIEW_SITE_NAME` | Optional. The Netlify site name used in the deploy preview link, `https://deploy-preview-<N>--<site>.netlify.app/<page>`. Defaults to `law-for-ai-safety-org`. |

Env var changes apply from the next deploy. The server never logs the key or the tokens it gets with it. Each installation token it requests is limited to this repo and to contents and pull requests, and is reused until shortly before it expires (one hour).

## 3. The bot login for the CMS guard

`.github/workflows/cms-guard.yml` runs on every pull request. It fails when a commit authored or committed by the App's bot changes a file outside `content/`, or when the bot opens a pull request from a branch outside `cms/`. Maintainers' commits are not restricted, so you can push layout fixes to a CMS branch before merging.

The guard needs the bot's login: repo Settings → Secrets and variables → Actions → **Variables** → New repository variable:

- **Name:** `CMS_BOT_LOGIN`
- **Value:** `<app-slug>[bot]`, for example `lais-website-editor[bot]`. The slug is the last part of the App's public page URL, `https://github.com/apps/<app-slug>`.

**Until this variable is set, the guard fails on every pull request.** It fails closed on purpose: a guard that passed while it could not recognise the bot would let a leaked key change code with a green check. Once it is set, add **CMS guard / cms-guard** to the required checks on `main`.

The guard runs the copy of `scripts/cms-guard.mjs` on `main` with plain `node`, so a pull request cannot change the check that judges it. Its rules are tested in `scripts/cms-guard.test.ts`.

If repository variables turn out not to be passed to pull requests from forks, the guard fails on those too. Say so and it can skip pull requests whose head is in another repository, since the App is installed only on this one.

## 4. Protection on `main`

Already applied (see `local-docs/cms-decisions.md`): 1 approving review with stale approvals dismissed, the `check-all` and `zizmor` checks required, no force pushes, no deletions, `enforce_admins` off.

Why the App cannot get round it:

- The App is not a repo admin, and is not in any bypass list, so the rules apply to it in full. `enforce_admins` off only exempts admins.
- It cannot approve its own pull request, and a pull request needs one approval before it can merge.
- With **Dismiss stale approvals** on, a commit pushed after an approval needs a new approval.
- It has no Workflows permission, so it cannot edit the CI that checks it.

Two optional extras, not applied:

- **Require approval of the most recent reviewable push.** The App has pull requests write, so it can submit a review on someone else's pull request. With this rule, the person who pushed last cannot be the one whose approval counts.
- **A ruleset restricting branch creation, updates and deletion to `cms/**` for the App.** Contents write lets the App push to any unprotected branch. The CMS guard catches its commits outside `content/` in any pull request, but a ruleset would stop the push itself.

Content validation already runs in `check-all` (its first step is `npm run content:check`), so a CMS pull request with an invalid or non-canonical content file fails CI.

## 5. Verify end to end, once, on a deploy preview

Deploy previews are free; this uses no credits beyond the production build the final merge triggers.

1. Set the variables above for the **deploy preview** context too, and run a deploy preview of any branch (for example the next CMS pull request).
2. In that preview, sign in to `/admin`, open **Website pages** → field-building, change one word, check **Preview**, and press **Publish**. The page shows *Publishing*.
3. On GitHub: a pull request from `cms/field-building-<date>` changes only `content/field-building.json`. Its description lists the change before and after, says who sent it, and links to its own deploy preview. **CMS guard** and **CI** pass.
4. Open the pull request's deploy preview link and check the page.
5. Close the pull request with a comment. Reload the editor: the page shows *Not published* with your comment. Publish again, then press **Withdraw**: the pull request closes and its branch is deleted.
6. Merging changes the live site and costs one production build, so try it with the first real edit rather than a test: approve and merge, and after the production deploy the page shows *Live* in the production editor. (In a deploy preview's editor a merged page stays *Publishing*, because the preview's own content file never becomes the merged one.)
7. Remove the deploy preview context from the variables if you do not want previews to publish.

Also check, the first time, that `/admin/cms` lists the pages on Netlify: the admin functions read `content/`, `src/app` page files and `public/` at run time (`outputFileTracingIncludes` in `next.config.ts`).

## Rotating the key

Generate a new private key in the App settings, replace `GITHUB_APP_PRIVATE_KEY` in Netlify, redeploy, then delete the old key in the App settings.
