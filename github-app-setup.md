# GitHub App for the website editor

The website editor in `/admin/cms` publishes a page by opening a pull request that changes that page's file in `content/`. It does this as a GitHub App, so editors never need a GitHub account. When the pull request is nothing but that page's content, a workflow approves it and GitHub merges it once the required checks pass (step 4); anything else waits for a maintainer. The normal Netlify production deploy makes it live.

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
| [Actions settings](https://github.com/Law-for-AI-Safety/lawforaisafety.org/settings/actions) | Step 4: let Actions approve pull requests |
| [General settings](https://github.com/Law-for-AI-Safety/lawforaisafety.org/settings) | Step 4: allow auto-merge |
| [CMS auto-merge workflow](https://github.com/Law-for-AI-Safety/lawforaisafety.org/actions/workflows/cms-auto-merge.yml) | Step 4: turn automatic merging off (**…** → **Disable workflow**) |
| [Branch protection](https://github.com/Law-for-AI-Safety/lawforaisafety.org/settings/branches) | Step 5: required checks, code owners |
| [Netlify deploys](https://app.netlify.com/projects/law-for-ai-safety-org/deploys) | Step 6: find a deploy preview |

## What the App does

| Step | API calls |
| --- | --- |
| Publish | Reads `content/<page>.json` on `main`, makes one commit that changes only that file, creates the branch `cms/<page>-<YYYY-MM-DD>` (with `-2`, `-3`, … if taken), opens a pull request into `main`, then adds the deploy preview link to its description. |
| Status | When an editor opens a page that is waiting, reads that pull request (and, once it is closed, its last comment from the repo's owner, a member or collaborator, or whoever closed it: the repo is public, so nobody else's comment is shown). No polling. |
| Withdraw | Closes the pull request and deletes its branch. |

The App never merges, never approves, and never pushes to a branch after opening its pull request; the approving and merging in step 4 is done by a workflow with its own token. Every request to GitHub has a time limit. Before it touches GitHub, a publish writes a record of itself, and the branch goes into that record before the pull request is opened, so there is never a pull request the site has no record of. Code: `src/cms/github.ts` (client), `src/cms/publish.ts` (the steps), `src/app/admin/cms/actions.ts` (permission checks and locking).

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

GitHub has no "contents write but no merge" permission: the merge API also counts as contents write. What stops the App from merging is the branch protection on `main` (step 5), not its permissions.

Then:

1. **Generate a private key** ([App settings](https://github.com/organizations/Law-for-AI-Safety/settings/apps/lawforaisafety-cms) → **Credentials** → **Key pairs** tab; not Client secrets, which are for OAuth). A `.pem` file downloads. Keep it only long enough to paste it into Netlify, then delete it.
2. [**Install App**](https://github.com/apps/lawforaisafety-cms/installations/new) → this organisation → **Only select repositories** → `lawforaisafety.org`. Install it on this repo only.
3. Note the **App ID** ([App settings](https://github.com/organizations/Law-for-AI-Safety/settings/apps/lawforaisafety-cms), "About") and the **installation ID** (open it from the [org installations](https://github.com/organizations/Law-for-AI-Safety/settings/installations); it is the number at the end of the URL, `…/settings/installations/<id>`).

## 2. Netlify environment variables

[Site configuration → Environment variables](https://app.netlify.com/projects/law-for-ai-safety-org/configuration/env). Mark only the private key as a **secret** value (the others are identifiers, not credentials). Set them for the **production** and **deploy preview** contexts, with at least the **Functions** scope: only the server code reads them, never the build. Use **the same value in both contexts** (Netlify's "Same value for all deploy contexts" is fine if only those two are ticked): there is one App, and previews publish to the same repo. Leave them unset for branch deploys and local development (`.env.local`); there the editor just says publishing is not set up.

Why deploy previews too: so publishing can be checked on a preview before it reaches production (step 6), and so a preview of a CMS change shows the editor working. The cost is that any build of a deploy preview can read the key, and anyone who can push a branch to this repo gets a deploy preview built from their code. Today only the owner has write access, so that is no wider than production. Since CMS pull requests merge themselves (step 4), whoever reads the key can put a change to one content file live without a maintainer seeing it first, so the key is worth more than when every pull request waited for review. **Revisit this as soon as anyone else gets write access, or a preview build runs code you do not trust**: then set the key for production only (and use a separate test App for previews, if publishing from previews is still wanted). Netlify's sensitive-variable policy ([deploy settings](https://app.netlify.com/projects/law-for-ai-safety-org/configuration/deploys)) keeps the key out of builds of pull requests from forks; keep that setting on.

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

## 4. Automatic merging

`.github/workflows/cms-auto-merge.yml` runs when a pull request is opened or changes. For a pull request the bot opened, it reads the pull request through the GitHub API (it never checks out or runs anything from it) and, when all of these hold, approves it and turns on GitHub auto-merge with a merge commit:

- opened by `CMS_BOT_LOGIN`, open and not a draft, from a branch in this repository (not a fork) into `main`;
- the branch is `cms/<page>-<YYYY-MM-DD>`, optionally with `-2`, `-3`, …;
- every commit is authored and committed by the bot, signed by GitHub, and none is a merge;
- exactly one file changes, `content/<page>.json` for the page in the branch name, and it is modified, not added, removed or renamed;
- no maintainer has stepped in: it was never closed, and nobody but the workflow has turned its auto-merge on or off, dismissed a review on it, made it a draft or changed its base.

GitHub then merges it once `main`'s required checks pass (step 5), so nothing polls. The approval is for the head commit that was checked, and auto-merge is turned on only if that is still the head. Auto-merge itself stays on after a later push by anyone with write access: what stops such a push from merging on the old approval is **Dismiss stale pull request approvals** (step 5), until the workflow's next run turns the auto-merge off.

If any condition stops holding (a maintainer pushes a commit, turns auto-merge off, the pull request is retargeted or made a draft), the next run dismisses the workflow's approvals and turns off the auto-merge it turned on, and the pull request waits for a maintainer from then on. A declined pull request that is reopened is never merged by the workflow. It never touches an approval or an auto-merge a maintainer made. Each run's log lists why a pull request was left. If a run fails (GitHub still down after three tries of a read; writes are not tried again; **Allow auto-merge** off), it takes back the same way, to be safe; the pull request's next event (an edit, say) decides again, or a maintainer merges it. If the required checks have already passed when it approves, it merges at once, but only when every other check is green too; with one pending or failing it leaves the pull request for a maintainer. The rules are in `scripts/cms-auto-merge.mjs` (main's copy always runs) and tested in `scripts/cms-auto-merge.test.ts`; `test/ci-workflow.test.ts` checks the workflow only ever checks out `main`.

**Two settings to switch on**, or the workflow fails and nothing merges itself:

1. [Settings → Actions → General](https://github.com/Law-for-AI-Safety/lawforaisafety.org/settings/actions) → Workflow permissions → tick **Allow GitHub Actions to create and approve pull requests**. Without it the approval is refused.
2. [Settings → General](https://github.com/Law-for-AI-Safety/lawforaisafety.org/settings) → Pull Requests → tick **Allow auto-merge**. Without it turning on auto-merge is refused.

**How you hear about it.** When it turns on auto-merge it comments on the pull request, mentioning `@hturnbull93` (the `NOTIFY` setting in the workflow), so GitHub notifies you then and again when it merges. A failing check notifies you as on any pull request.

**What a merge by the workflow does not do.** GitHub starts no workflows for events caused by a workflow's own token, so the merge commit on `main` gets no `push` runs: no **CI** run on `main` and no **IndexNow** submission for that page. Netlify is not affected (it deploys from its own GitHub App). The pull request's own checks have already run against it.

**To stop one pull request**: press **Disable auto-merge** on it, make it a draft, or push a commit to it. Each leaves it for you for good.

**To turn it off**: open the [workflow](https://github.com/Law-for-AI-Safety/lawforaisafety.org/actions/workflows/cms-auto-merge.yml), **…** → **Disable workflow**. New CMS pull requests then wait for a maintainer. A pull request already set to merge itself still will, unless you stop it as above. Switching off **Allow auto-merge** in the settings turns off every pending auto-merge at once.

## 5. Protection on `main`

Already applied ([branch settings](https://github.com/Law-for-AI-Safety/lawforaisafety.org/settings/branches); see `local-docs/cms-decisions.md`): 1 approving review with stale approvals dismissed, approval of the most recent reviewable push, the `check-all` and `zizmor` checks required, no force pushes, no deletions, `enforce_admins` off. There is no ruleset.

Why the App cannot get round it:

- The App is not a repo admin, and is not in any bypass list, so the rules apply to it in full. `enforce_admins` off only exempts admins.
- It cannot approve its own pull request, and a pull request needs one approval before it can merge. The auto-merge workflow's approval (step 4) is given only to a pull request that is the App's own change to one content file.
- With **Dismiss stale approvals** on, a commit pushed after an approval needs a new approval.
- **Approval of the most recent reviewable push:** the App has pull requests write, so it can review someone else's pull request, but if it pushed last its approval does not count.
- It has no Workflows permission, so it cannot edit the CI that checks it.

Contents write lets the App push to any unprotected branch; the CMS guard fails any pull request with its commits outside `content/`. Without a ruleset nothing stops the push itself; that was accepted.

**Required checks.** Auto-merge waits only for the checks `main` requires, so every check a CMS pull request must pass has to be required: **CI / check-all**, **CI / zizmor**, **CMS guard / cms-guard** and **CI / e2e**. Add any of those not yet in the [`main` branch rule](https://github.com/Law-for-AI-Safety/lawforaisafety.org/settings/branches) before switching on the settings in step 4 (a required check must already exist on `main`, or it blocks every pull request). Keep **Dismiss stale pull request approvals when new commits are pushed** on: it is what stops a commit pushed after the workflow's approval from merging on it, before the workflow's next run takes it back. Do not add the workflow's own jobs (**CMS auto-merge / …**) as required checks: they are skipped on everyone else's pull requests.

**Code owners.** `.github/CODEOWNERS` assigns `.github/` (the workflows, including the guard) and the guard's script to `@hturnbull93`. Turning on **Require review from Code Owners** for `main` would make any change to them need that review, even when someone else approves the rest.

Content validation already runs in `check-all` (its first step is `npm run content:check`), so a CMS pull request with an invalid or non-canonical content file fails CI.

## Drafts the live page has moved past

If the page's file on `main` changed after a draft was started (a developer edited it, or another publish was merged), publishing that draft is refused and the editor is shown which fields changed. The editor redoes their changes by hand: copy them, discard the draft, and make them again on the current page. There is no automatic merge.

## 6. Verify end to end, once, on a deploy preview

Deploy previews are free; this uses no credits beyond the production build the final merge triggers.

1. Run a deploy preview ([Netlify deploys](https://app.netlify.com/projects/law-for-ai-safety-org/deploys)) of any branch (for example the next CMS pull request), with the variables above set for deploy previews.
2. In that preview, sign in to `/admin`, open **Website pages** → field-building, change one word, check **Preview**, and press **Publish**. The page shows *Publishing*.
3. On GitHub: a pull request from `cms/field-building-<date>` changes only `content/field-building.json`. Its description lists the change before and after, says who sent it, and links to its own deploy preview. **CMS guard** and **CI** pass.
4. Open the pull request's deploy preview link and check the page.
5. Close the pull request with a comment. Reload the editor: the page shows *Not published* with your comment. Publish again, then press **Withdraw**: the pull request closes and its branch is deleted.
6. Merging changes the live site and costs one production build, so try it with the first real edit rather than a test: publish it, and check that **CMS auto-merge** approves the pull request, comments, and that it merges itself once the checks pass. If the run's log says it was left for a maintainer, the log says why. After the production deploy the page shows *Live* in the production editor. (In a deploy preview's editor a merged page stays *Publishing*, because the preview's own content file never becomes the merged one.)

Also check, the first time, that `/admin/cms` lists the pages on Netlify: the admin functions read `content/`, `src/app` page files and `public/` at run time (`outputFileTracingIncludes` in `next.config.ts`).

## Rotating the key

Generate a new private key in the App settings, replace `GITHUB_APP_PRIVATE_KEY` in Netlify, redeploy, then delete the old key in the App settings.
