# Cron job for opportunity imports

When an admin submits a URL at `/admin/opportunities/new`, `importOpportunity` (`src/opportunities/github-publish.ts`) opens a pull request adding a stub file - just `{ "url": "..." }` - at `content/opportunities/pending-<host>-<random>.json`, on a branch named `opportunities/pending-<host>-<random>-<date>`. Nothing in GitHub Actions ever processes it: `test/ci-workflow.test.ts` bans every workflow in this repo from referencing a secret or getting write access (fork PRs get a read-only token and no secrets, and the policy is that no workflow needs either). Instead, `scripts/run-opportunity-imports.ts` is meant to run on a machine you control, on a schedule, polling for these PRs and filling them in.

This is a one-time setup on that machine. It does not touch this repo's GitHub Actions config, Netlify env vars, or any repo secret - everything below is local to the machine you run the cron on.

## What the script does, each run

1. Resets its working clone to a clean `main`.
2. Lists open pull requests, keeping only branches matching `^opportunities/pending-` (`isImportBranch`).
3. For each: checks out the branch, finds the one `content/opportunities/pending-*.json` stub file, confirms it's still just `{ "url": ... }` (skips it otherwise - either already done, or not actually a stub).
4. Runs `claude -p`, sandboxed to the `WebFetch` tool only, to fetch the URL and extract the opportunity's fields as structured JSON. It cannot read credentials, write files, or do anything but fetch that one page and return JSON matching the schema it's given.
5. Validates the result, computes a slug, writes the real `content/opportunities/<slug>.json` in place of the stub, commits, pushes to the same branch, and posts a PR comment rendering the populated listing.
6. On failure (the page couldn't be fetched, or the extraction didn't validate), posts a comment explaining what went wrong and leaves the stub in place for an admin to finish by hand.
7. Merging is always a manual, human decision on GitHub - this script never merges anything.

## Prerequisites on the machine that will run this

| What | Why |
| --- | --- |
| `git` | clone, checkout, commit, push |
| [`gh`](https://cli.github.com/), authenticated | list PRs, post PR comments |
| Node.js 22+ and `npm` | runs the script via `tsx` |
| The Claude Code CLI (`claude`), pinned to at least version `2.1.302` | runs the sandboxed extraction step |
| An Anthropic API key | authenticates `claude -p` (see step 3 - this must be a plain API key, not a subscription login) |

## 1. Clone a dedicated copy of the repo

Not your own working checkout - this script switches branches, commits and pushes, and a crash mid-run should never cost you uncommitted work.

```bash
git clone https://github.com/Law-for-AI-Safety/lawforaisafety.org.git opportunities-import-clone
cd opportunities-import-clone
npm ci
```

## 2. Authenticate `gh`

Needs push access to this repo and the ability to comment on pull requests. Either:

- **Your own GitHub account**, if you already have write access: `gh auth login` and follow the prompts (pick HTTPS, and let it configure `git` to use `gh` as its credential helper - say yes when asked).
- **A dedicated fine-grained personal access token**, scoped to just this repo, least-privilege (same two permissions the website's own GitHub App has, see `github-app-setup.md`): [create one](https://github.com/settings/personal-access-tokens/new) with **Contents: Read and write**, **Pull requests: Read and write**, **Metadata: Read-only**, repository access limited to `Law-for-AI-Safety/lawforaisafety.org`. Then `gh auth login --with-token < token.txt` (or `export GH_TOKEN=<token>` for every invocation - simplest for a cron job, see step 6).

Verify: `gh pr list --repo Law-for-AI-Safety/lawforaisafety.org` should work without prompting.

## 3. Install the Claude Code CLI

This is the CLI's own version - unrelated to the API key in step 4, and not something the API key "unlocks" or changes. Pin it explicitly rather than tracking latest, so a CLI upgrade elsewhere on the machine can't silently change this script's behaviour:

```bash
curl -fsSL https://claude.ai/install.sh | bash -s 2.1.302
claude --version   # confirm >= 2.1.302
```

`2.1.302` is the floor: it's the first version whose `-p` defaults to the deny-by-default permission mode this script relies on, and it's also new enough to support `--model claude-opus-5-5` (needs >= 2.1.280). A newer pinned version is fine; older isn't.

## 4. Set the Anthropic API key

This is a credential, not a version - keep it separate in your head from step 3's CLI version number, and treat it the same way you'd treat any other secret this machine holds (never written into the repo clone, never logged).

Get a key from the [Anthropic Console](https://console.anthropic.com/settings/keys): a normal API key, billed per use by Anthropic - **not** the same thing as logging into Claude Code with a Pro/Max/Team subscription (that's a separate OAuth login, via `claude setup-token`, and it will not work here). The script runs `claude` with `--bare`, which skips reading any subscription login or OS keychain entirely - it only reads the `ANTHROPIC_API_KEY` environment variable. Set that variable wherever this machine keeps secrets for cron jobs (a `.env` file sourced by the cron wrapper, a secrets manager, etc.).

## 5. Test it by hand once

From inside the clone, with `ANTHROPIC_API_KEY` set in your shell:

```bash
cd opportunities-import-clone
ANTHROPIC_API_KEY=sk-ant-... npm run opportunities:import
```

With no pending imports it prints `0 pending import PR(s) to process.` and exits. To test the real path: submit a URL at `/admin/opportunities/new` on a deploy you can sign into first, then rerun the command and confirm the PR gets a second commit and comment.

## 6. Add the crontab entry

Cron runs with a minimal environment - no inherited shell profile, no inherited `PATH` beyond a bare default. Set everything the command needs explicitly:

```cron
*/15 * * * * cd /path/to/opportunities-import-clone && ANTHROPIC_API_KEY=sk-ant-... PATH="/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin" /usr/bin/npm run opportunities:import >> /path/to/opportunities-import-clone/cron.log 2>&1
```

Replace `/path/to/opportunities-import-clone` with the real path, and the `PATH` entries with wherever `node`, `npm`, `git`, `gh` and `claude` actually live on this machine (check with `which node npm git gh claude`). Every 15 minutes is a reasonable starting interval; imports aren't time-critical, so less frequent (hourly) is just as reasonable if you'd rather not poll that often.

If `gh` was authenticated with a personal access token in step 2 rather than `gh auth login`, add `GH_TOKEN=<token>` to the crontab line too (cron won't see `gh`'s own stored auth unless it's the same user account that ran `gh auth login` interactively).

## Verifying it's working

- `cron.log` (or wherever you redirected output) should show a line like `PR #<n>: populated as <slug>` after each successful run, or `PR #<n>: <error>` on a failure - both are expected outcomes, not crashes.
- On GitHub: a pending-import PR gets a second commit replacing its stub file, and a comment either rendering the listing or explaining the failure.
- A PR with no comment or second commit after several cron intervals means the cron job itself isn't running - check `crontab -l`, the log file, and that the machine's cron service is actually enabled.

## Rotating the Anthropic API key

Generate a new key in the [Anthropic Console](https://console.anthropic.com/settings/keys), update wherever `ANTHROPIC_API_KEY` is set for this cron job, confirm the next scheduled run succeeds, then revoke the old key.
