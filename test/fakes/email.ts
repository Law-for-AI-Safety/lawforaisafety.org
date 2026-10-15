import { route } from "./network";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

export type SentEmail = { to: string; from: string; subject: string; html: string };

/**
 * Captures every email the app sends through Brevo, so a test asserts on the real recipient,
 * subject and rendered body. `src/lib/email.ts` only sends outside production to addresses in
 * `ADMIN_EMAILS`; a test of a production path sets `DEPLOY_CONTEXT` with `vi.stubEnv`.
 * `test/setup-env.ts` empties it before each test.
 */
class FakeBrevo {
  readonly sent: SentEmail[] = [];
  private pendingFailures = 0;

  /** Makes the next `count` sends fail with a server error. */
  failNext(count = 1): void {
    this.pendingFailures = count;
  }

  reset(): void {
    this.sent.length = 0;
    this.pendingFailures = 0;
  }

  get last(): SentEmail {
    const email = this.sent.at(-1);
    if (!email) throw new Error("no email has been sent");
    return email;
  }

  /** Every email sent to `address`, most recent last. */
  to(address: string): SentEmail[] {
    return this.sent.filter((email) => email.to === address);
  }

  async handle(request: Request): Promise<Response> {
    if (!request.headers.get("api-key")) return new Response("Unauthorized", { status: 401 });
    if (this.pendingFailures > 0) {
      this.pendingFailures--;
      return new Response("Internal error", { status: 500 });
    }
    const body = (await request.json()) as {
      sender: { email: string };
      to: { email: string }[];
      subject: string;
      htmlContent: string;
    };
    for (const { email } of body.to) {
      this.sent.push({
        to: email,
        from: body.sender.email,
        subject: body.subject,
        html: body.htmlContent,
      });
    }
    return Response.json({ messageId: `<test-${this.sent.length}@brevo>` }, { status: 201 });
  }
}

/** The value of a `?param=` query parameter in the first link of `email` that carries one. */
export function linkParam(email: SentEmail, param: string): string {
  const match = email.html.match(new RegExp(`[?&]${param}=([^"&<\\s]+)`));
  if (!match) throw new Error(`no ${param}= link in email "${email.subject}"`);
  return decodeURIComponent(match[1]);
}

export const emails = new FakeBrevo();
route(BREVO_SEND_URL, (request) => emails.handle(request));
