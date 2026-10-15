# GitHub App for the website editor

The website editor in `/admin/cms` publishes a page by opening a pull request that changes that page's file in `content/`. It does this as a GitHub App, so editors never need a GitHub account. A maintainer reviews and merges the pull request, and the normal Netlify production deploy makes it live.

Until the settings below are in Netlify, the editor works as before (drafts, preview) and the Publish button says "Publishing is not set up on this site yet".

## Quick links

| Where | What you do there |
| --- | --- |
| [Create the App (pre-filled)](https://github.com/organizations/Law-for-AI-Safety/settings/apps/new?name=lawforaisafety-cms&url=https%3A%2F%2Flawforaisafety.org&webhook_active=false&public=false&contents=write&pull_requests=write&metadata=read) | Step 1: check the fields, then **Create GitHub App** |
| [App settings](https://github.com/organizations/Law-for-AI-Safety/settings/apps/lawforaisafety-cms) | Step 1: App ID (General → About); private key (Credentials → **Key pairs**, not Client secrets) |
| [Install the App](https://github.com/apps/lawforaisafety-cms/installations/new) | Step 1: install on `lawforaisafety.org` only |
| [Org installations](https://github.com/organizations/Law-for-AI-Safety/settings/installations) | Step 1: open the installation; its ID is the number at the end of the URL |
| [Netlify environment variables](https://app.netlify.com/projects/law-for-ai-safety-org/configuration/env) | Step 2: add the variables |
| [Netlify deploy settings](https://app.netlify.com/projects/law-for-ai-safety-org/configuration/deploys) | Step 2: sensitive variable policy; deploy previews for pull requests into any branch |
| [Repository variables](https://github.com/Law-for-AI-Safety/lawforaisafety.org/settings/variables/actions) | Step 3: `CMS_BOT_LOGIN` (already set) |
| [Branch protection](https://github.com/Law-for-AI-Safety/lawforaisafety.org/settings/branches) | Step 4: required checks, code owners |
| [Netlify deploys](https://app.netlify.com/projects/law-for-ai-safety-org/deploys) | Step 5: find a deploy preview |

## What the App does

| Step | API calls |
| --- | --- |
| Publish | Reads `content/<page>.json` on `main`, makes one commit that changes only that file, creates the branch `cms/<page>-<YYYY-MM-DD>` (with `-2`, `-3`, … if taken), opens a pull request into `main`, then adds the deploy preview link to its description. |
| Status | When an editor opens a page that is waiting, reads that pull request (and, once it is closed, its last comment from the repo's owner, a member or collaborator, or whoever closed it: the repo is public, so nobody else's comment is shown). No polling. |
| Withdraw | Closes the pull request and deletes its branch. |

It never merges, never approves, and never pushes to a branch after opening its pull request. Every request to GitHub has a time limit. Before it touches GitHub, a publish writes a record of itself, and the branch goes into that record before the pull request is opened, so there is never a pull request the site has no record of. Code: `src/cms/github.ts` (client), `src/cms/publish.ts` (the steps), `src/app/admin/cms/actions.ts` (permission checks and locking).

## 1. Create the App

On the organisation: [create the App](https://github.com/organizations/Law-for-AI-Safety/settings/apps/new?name=lawforaisafety-cms&url=https%3A%2F%2Flawforaisafety.org&webhook_active=false&public=false&contents=write&pull_requests=write&metadata=read). The link fills in the name, homepage, webhook, visibility and permissions below; check each before pressing **Create GitHub App**. (By hand: Settings → Developer settings → GitHub Apps → New GitHub App.)

- **Name:** `lawforaisafety-cms`. Its bot account is `lawforaisafety-cms[bot]`.
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

1. **Generate a private key** ([App settings](https://github.com/organizations/Law-for-AI-Safety/settings/apps/lawforaisafety-cms) → **Credentials** → **Key pairs** tab; not Client secrets, which are for OAuth). A `.pem` file downloads. Keep it only long enough to paste it into Netlify, then delete it.
2. [**Install App**](https://github.com/apps/lawforaisafety-cms/installations/new) → this organisation → **Only select repositories** → `lawforaisafety.org`. Install it on this repo only.
3. Note the **App ID** ([App settings](https://github.com/organizations/Law-for-AI-Safety/settings/apps/lawforaisafety-cms), "About") and the **installation ID** (open it from the [org installations](https://github.com/organizations/Law-for-AI-Safety/settings/installations); it is the number at the end of the URL, `…/settings/installations/<id>`).

## 2. Netlify environment variables

[Site configuration → Environment variables](https://app.netlify.com/projects/law-for-ai-safety-org/configuration/env). Mark only the private key as a **secret** value (the others are identifiers, not credentials). Set them for the **production** and **deploy preview** contexts, with at least the **Functions** scope: only the server code reads them, never the build. Use **the same value in both contexts** (Netlify's "Same value for all deploy contexts" is fine if only those two are ticked): there is one App, and previews publish to the same repo. Leave them unset for branch deploys and local development (`.env.local`); there the editor just says publishing is not set up.

Why deploy previews too: so publishing can be checked on a preview before it reaches production (step 5), and so a preview of a CMS change shows the editor working. The cost is that any build of a deploy preview can read the key, and anyone who can push a branch to this repo gets a deploy preview built from their code. Today only the owner has write access, so that is no wider than production. **Revisit this as soon as anyone else gets write access**: then set the key for production only (and use a separate test App for previews, if publishing from previews is still wanted). Netlify's sensitive-variable policy ([deploy settings](https://app.netlify.com/projects/law-for-ai-safety-org/configuration/deploys)) keeps the key out of builds of pull requests from forks; keep that setting on.

| Variable | Value | Secret? |
| --- | --- | --- |
| `GITHUB_APP_ID` | The App ID. | No |
| `GITHUB_APP_INSTALLATION_ID` | The installation ID. | No |
| `GITHUB_APP_PRIVATE_KEY` | The whole `.pem` file, including the `BEGIN` and `END` lines. Line breaks may be kept or written as `\n`. | **Yes**: tick "Contains secret values". |
| `GITHUB_REPO_OWNER` | `Law-for-AI-Safety` | No |
| `GITHUB_REPO_NAME` | `lawforaisafety.org` | No |
| `GITHUB_API_URL` | Leave unset. Only `https://api.github.com` is accepted. The end-to-end tests point it at a fake on their own machine, which needs the test-only `CMS_TEST_LOCAL_GITHUB=1`; that flag is ignored on any Netlify deploy, so never set it there. | Do not set. |
| `CMS_PREVIEW_SITE_NAME` | Optional. The Netlify site name used in the deploy preview link, `https://deploy-preview-<N>--<site>.netlify.app/<page>`. Defaults to `law-for-ai-safety-org`. | No |

Env var changes apply from the next deploy. The server never logs the key or the tokens it gets with it. Each installation token it requests is limited to this repo and to contents and pull requests, and is reused until shortly before it expires (one hour).

## 3. The bot login for the CMS guard

`.github/workflows/cms-guard.yml` runs on every pull request. It fails when a commit authored or committed by the App's bot changes a file outside `content/`, or when the bot opens a pull request from a branch outside `cms/`. Maintainers' commits are not restricted, so you can push layout fixes to a CMS branch before merging.

The guard needs the bot's login in the repository variable `CMS_BOT_LOGIN` ([Settings → Secrets and variables → Actions → **Variables**](https://github.com/Law-for-AI-Safety/lawforaisafety.org/settings/variables/actions)). It is set to `lawforaisafety-cms[bot]`.

The guard fails closed: it fails every pull request while the variable is unset, or set to anything that does not end in `[bot]` (a person's login there would let the bot's commits pass as a maintainer's). A guard that passed while it could not recognise the bot would let a leaked key change code with a green check.

Normally the guard runs the copy of `scripts/cms-guard.mjs` on `main`, with plain `node`, so a pull request cannot change the check that judges it. Until the pull request that adds the guard is merged, `main` has no copy, so each pull request runs its own. Once the workflow is on `main`, a `main` without the script fails the guard instead of falling back. It runs when a pull request is opened, updated, reopened or edited (an edit can change its base). Its rules are tested in `scripts/cms-guard.test.ts`.

If repository variables turn out not to be passed to pull requests from forks, the guard fails on those too. Say so and it can skip pull requests whose head is in another repository, since the App is installed only on this one.

## 4. Protection on `main`

Already applied ([branch settings](https://github.com/Law-for-AI-Safety/lawforaisafety.org/settings/branches); see `local-docs/cms-decisions.md`): 1 approving review with stale approvals dismissed, approval of the most recent reviewable push, the `check-all` and `zizmor` checks required, no force pushes, no deletions, `enforce_admins` off. There is no ruleset.

Why the App cannot get round it:

- The App is not a repo admin, and is not in any bypass list, so the rules apply to it in full. `enforce_admins` off only exempts admins.
- It cannot approve its own pull request, and a pull request needs one approval before it can merge.
- With **Dismiss stale approvals** on, a commit pushed after an approval needs a new approval.
- **Approval of the most recent reviewable push:** the App has pull requests write, so it can review someone else's pull request, but if it pushed last its approval does not count.
- It has no Workflows permission, so it cannot edit the CI that checks it.

Contents write lets the App push to any unprotected branch; the CMS guard fails any pull request with its commits outside `content/`. Without a ruleset nothing stops the push itself; that was accepted.

**Required checks to add once this is merged.** In the [`main` branch rule](https://github.com/Law-for-AI-Safety/lawforaisafety.org/settings/branches), add **CMS guard / cms-guard** and **CI / e2e** to the required checks on `main`. Not before: a required check that does not exist on `main` yet would block every pull request.

**Code owners.** `.github/CODEOWNERS` assigns `.github/` (the workflows, including the guard) and the guard's script to `@hturnbull93`. Turning on **Require review from Code Owners** for `main` would make any change to them need that review, even when someone else approves the rest.

Content validation already runs in `check-all` (its first step is `npm run content:check`), so a CMS pull request with an invalid or non-canonical content file fails CI.

## Drafts the live page has moved past

If the page's file on `main` changed after a draft was started (a developer edited it, or another publish was merged), publishing that draft is refused and the editor is shown which fields changed. The editor redoes their changes by hand: copy them, discard the draft, and make them again on the current page. There is no automatic merge.

## 5. Verify end to end, once, on a deploy preview

Deploy previews are free; this uses no credits beyond the production build the final merge triggers.

1. Run a deploy preview ([Netlify deploys](https://app.netlify.com/projects/law-for-ai-safety-org/deploys)) of any branch (for example the next CMS pull request), with the variables above set for deploy previews.
2. In that preview, sign in to `/admin`, open **Website pages** → field-building, change one word, check **Preview**, and press **Publish**. The page shows *Publishing*.
3. On GitHub: a pull request from `cms/field-building-<date>` changes only `content/field-building.json`. Its description lists the change before and after, says who sent it, and links to its own deploy preview. **CMS guard** and **CI** pass.
4. Open the pull request's deploy preview link and check the page.
5. Close the pull request with a comment. Reload the editor: the page shows *Not published* with your comment. Publish again, then press **Withdraw**: the pull request closes and its branch is deleted.
6. Merging changes the live site and costs one production build, so try it with the first real edit rather than a test: approve and merge, and after the production deploy the page shows *Live* in the production editor. (In a deploy preview's editor a merged page stays *Publishing*, because the preview's own content file never becomes the merged one.)

Also check, the first time, that `/admin/cms` lists the pages on Netlify: the admin functions read `content/`, `src/app` page files and `public/` at run time (`outputFileTracingIncludes` in `next.config.ts`).

## Rotating the key

Generate a new private key in the App settings, replace `GITHUB_APP_PRIVATE_KEY` in Netlify, redeploy, then delete the old key in the App settings.
