import { route } from "./network";

/** What a test sets `SLACK_WEBHOOK_URL` to, so the app's notifications reach `slack`. */
export const SLACK_WEBHOOK_URL = "https://hooks.slack.test/services/T000/B000/test";

/**
 * Captures the messages the app posts to the reviewers' Slack channel. The webhook is unset
 * unless a test sets it (`vi.stubEnv("SLACK_WEBHOOK_URL", SLACK_WEBHOOK_URL)`).
 * `test/setup-env.ts` empties it before each test.
 */
class FakeSlack {
  readonly messages: string[] = [];

  reset(): void {
    this.messages.length = 0;
  }

  async handle(request: Request): Promise<Response> {
    const { text } = (await request.json()) as { text: string };
    this.messages.push(text);
    return new Response("ok");
  }
}

export const slack = new FakeSlack();
route(SLACK_WEBHOOK_URL, (request) => slack.handle(request));
