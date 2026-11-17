import { routeOrigin } from "./network";

/**
 * Brevo's email campaign and contact list API, as the newsletter uses it: the list's size, and
 * campaigns created, scheduled, sent now, suspended and read back. Transactional email has its
 * own fake (`emails` in ./email.ts), registered for its exact URL, which wins over this one.
 *
 * Campaigns move as Brevo's do: created as `draft`, `queued` once given a `scheduledAt`, and
 * `sent` on send-now. `startSending(id)` plays Brevo picking a scheduled campaign up.
 * `test/setup-env.ts` resets it before each test.
 */

export const BREVO_ORIGIN = "https://api.brevo.com";
/** What `test/setup-env.ts` sets `BREVO_LIST_ID` to. */
export const NEWSLETTER_LIST_ID = 7;

export type FakeCampaign = {
  id: number;
  name: string;
  subject: string;
  previewText: string;
  htmlContent: string;
  sender: { email: string; name?: string };
  replyTo: string;
  listIds: number[];
  status: string;
  scheduledAt: string | null;
  sentDate: string | null;
};

class FakeBrevoCampaigns {
  readonly campaigns: FakeCampaign[] = [];
  /** Every request, as "METHOD /path", in order. */
  readonly calls: string[] = [];
  list = { id: NEWSLETTER_LIST_ID, name: "Newsletter", subscribers: 120 };
  private failures: { match: string; status: number | "network" }[] = [];
  private nextId = 1;

  reset(): void {
    this.campaigns.length = 0;
    this.calls.length = 0;
    this.list = { id: NEWSLETTER_LIST_ID, name: "Newsletter", subscribers: 120 };
    this.failures = [];
    this.nextId = 1;
  }

  /**
   * Makes the next request whose "METHOD /path" contains `match` fail with `status`, or, for
   * "network", with the error `fetch` throws when the connection is lost.
   */
  failNext(match: string, status: number | "network" = 500): void {
    this.failures.push({ match, status });
  }

  campaign(id: number): FakeCampaign {
    const found = this.campaigns.find((c) => c.id === id);
    if (!found) throw new Error(`no campaign ${id}`);
    return found;
  }

  /** Brevo starting to send a scheduled campaign. */
  startSending(id: number): void {
    this.campaign(id).status = "in_process";
  }

  async handle(request: Request): Promise<Response> {
    if (!request.headers.get("api-key")) return new Response("Unauthorized", { status: 401 });
    const url = new URL(request.url);
    const call = `${request.method} ${url.pathname}`;
    this.calls.push(call);
    const failure = this.failures.findIndex((f) => call.includes(f.match));
    if (failure >= 0) {
      const [{ status }] = this.failures.splice(failure, 1);
      if (status === "network") throw new TypeError("fetch failed");
      return Response.json({ code: "fake_failure", message: "Failed as the test asked" }, { status });
    }

    const listMatch = url.pathname.match(/^\/v3\/contacts\/lists\/(\d+)$/);
    if (request.method === "GET" && listMatch) {
      if (Number(listMatch[1]) !== this.list.id) return Response.json({ code: "document_not_found" }, { status: 404 });
      return Response.json({ id: this.list.id, name: this.list.name, totalSubscribers: this.list.subscribers, totalBlacklisted: 3, uniqueSubscribers: this.list.subscribers });
    }

    if (request.method === "POST" && url.pathname === "/v3/emailCampaigns") {
      const body = await request.json();
      const campaign: FakeCampaign = {
        id: this.nextId++,
        name: body.name,
        subject: body.subject,
        previewText: body.previewText,
        htmlContent: body.htmlContent,
        sender: body.sender,
        replyTo: body.replyTo,
        listIds: body.recipients?.listIds ?? [],
        status: "draft",
        scheduledAt: null,
        sentDate: null,
      };
      this.campaigns.push(campaign);
      return Response.json({ id: campaign.id }, { status: 201 });
    }

    const match = url.pathname.match(/^\/v3\/emailCampaigns\/(\d+)(\/sendNow|\/status)?$/);
    const campaign = match && this.campaigns.find((c) => c.id === Number(match[1]));
    if (match && !campaign) return Response.json({ code: "document_not_found" }, { status: 404 });
    if (campaign) {
      const action = `${request.method} ${match![2] ?? ""}`;
      switch (action) {
        case "GET ":
          return Response.json({
            ...campaign,
            htmlContent: url.searchParams.get("excludeHtmlContent") === "true" ? "" : campaign.htmlContent,
            scheduledAt: campaign.scheduledAt ?? "",
            ...(campaign.sentDate ? { sentDate: campaign.sentDate } : {}),
            statistics: { globalStats: { delivered: campaign.status === "sent" ? this.list.subscribers : null } },
          });
        case "PUT ": {
          if (campaign.status !== "draft" && campaign.status !== "queued") {
            return Response.json({ code: "method_not_allowed", message: "Only draft or scheduled campaigns can be modified" }, { status: 400 });
          }
          const body = await request.json();
          for (const key of ["name", "subject", "previewText", "htmlContent", "replyTo", "sender"] as const) {
            if (key in body) (campaign as Record<string, unknown>)[key] = body[key];
          }
          if (body.recipients?.listIds) campaign.listIds = body.recipients.listIds;
          if (body.scheduledAt) {
            if (campaign.listIds.length === 0) return Response.json({ code: "invalid_parameter" }, { status: 400 });
            campaign.scheduledAt = new Date(body.scheduledAt).toISOString();
            campaign.status = "queued";
          }
          return new Response(null, { status: 204 });
        }
        case "POST /sendNow":
          if (campaign.status !== "draft" || campaign.listIds.length === 0) {
            return Response.json({ code: "invalid_parameter" }, { status: 400 });
          }
          campaign.status = "sent";
          campaign.sentDate = new Date().toISOString();
          return new Response(null, { status: 204 });
        case "PUT /status": {
          const { status } = await request.json();
          campaign.status = status;
          return new Response(null, { status: 204 });
        }
        case "DELETE ":
          if (campaign.status !== "draft") {
            return Response.json({ code: "permission_denied", message: "A campaign that has already been scheduled cannot be deleted." }, { status: 403 });
          }
          this.campaigns.splice(this.campaigns.indexOf(campaign), 1);
          return new Response(null, { status: 204 });
      }
    }
    throw new Error(`The Brevo fake has no ${call}. Add it in test/fakes/brevo.ts.`);
  }
}

export const brevo = new FakeBrevoCampaigns();
routeOrigin(BREVO_ORIGIN, (request) => brevo.handle(request));
