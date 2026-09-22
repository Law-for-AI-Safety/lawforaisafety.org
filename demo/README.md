# Demo videos

Playwright-driven screen recordings with a moving cursor, click and typing sounds, spoken narration and matching captions. Ported from the Catalyse demo harness.

## Record

```bash
npm run demo -- task-tracker              # one flow, in a visible browser (you hear it live on macOS)
npm run demo -- task-tracker --headless   # same, no window
npm run demo                              # every flow, headless
npm run demo -- task-tracker --skip-build # reuse the last `next build` while tweaking a flow
```

Output lands in `demo/output/<flow>.mp4` (plus a `.webm`). Share the `.mp4`.

Needs: Docker running (same local Postgres as `npm run dev`), `ffmpeg` with libopus and libx264 (`brew install ffmpeg`), and Playwright's Chromium (`npx playwright install chromium`). The first run downloads the Kokoro text-to-speech model (~90 MB) from Hugging Face.

## What a run does

1. `next build` of the current checkout.
2. Recreates a separate `lawforaisafety_demo` database in the local Docker Postgres, migrates it, and seeds it from `demo/seed.ts`. Dates are relative to today, so the video looks the same whenever it's re-recorded. Your dev database is never touched.
3. Starts `next start` on port 3099 with its own `SESSION_SECRET` and `ADMIN_EMAILS` set to a fictional admin (`demo/data.ts`), and Slack/Brevo keys blanked.
4. Skips LinkedIn login by signing that admin's session cookie directly (`demo/auth.ts`).
5. Runs the flow, then stitches the segments together with narration and sound effects mixed in.

Narration audio is cached in `demo/.tts-cache/` by text — edit a line and only that line is regenerated.

## Writing a flow

A flow is `demo/flows/<name>.ts` exporting `meta` and `run`; add it to `ALL_FLOWS` in `demo/index.ts`. Main tools on the engine:

- `narrate(text, action?)` — speaks and captions `text`, running `action` while it plays and waiting out whatever time is left.
- `click`, `type`, `select` — move the cursor there, then act. Pass `navigatesTo` to `click` when it changes page.
- `readText(locator)` — sweeps the cursor under a line of text, as if reading it.
- `beginSegment` / `endSegment` — one browser context each; segments are joined with a fade.

Every flow runs twice: a dry run with a stubbed page to collect narration lines (so speech can be generated while the server starts), then the real recording. Don't branch on values read from the page.

Voice and caption style are constants at the top of `demo/engine.ts`.
