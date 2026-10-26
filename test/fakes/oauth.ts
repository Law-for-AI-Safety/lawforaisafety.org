import { route } from "./network";

export type ProviderUser = { sub: string; name: string; email: string; emailVerified?: boolean };

const ENDPOINTS = {
  linkedin: { token: "https://www.linkedin.com/oauth/v2/accessToken", userinfo: "https://api.linkedin.com/v2/userinfo" },
  google: { token: "https://oauth2.googleapis.com/token", userinfo: "https://openidconnect.googleapis.com/v1/userinfo" },
} as const;

type Provider = keyof typeof ENDPOINTS;

/**
 * Stands in for LinkedIn's and Google's token and userinfo endpoints. A test signs a person in
 * with `signIn`, which gives the authorization code the provider would send back to the
 * callback; exchanging it returns that person. Any other code is refused, as the real
 * providers do. `test/setup-env.ts` resets it before each test.
 */
class FakeOAuthProviders {
  private codes = new Map<string, { provider: Provider; user: ProviderUser }>();
  private tokens = new Map<string, ProviderUser>();
  /** Every token exchange, so a test can check the redirect URI sent. */
  readonly exchanges: { provider: Provider; code: string; redirectUri: string }[] = [];

  signIn(provider: Provider, user: ProviderUser): string {
    const code = `code-${provider}-${this.codes.size + 1}`;
    this.codes.set(code, { provider, user });
    return code;
  }

  reset(): void {
    this.codes.clear();
    this.tokens.clear();
    this.exchanges.length = 0;
  }

  async token(provider: Provider, request: Request): Promise<Response> {
    const form = new URLSearchParams(await request.text());
    const code = form.get("code") ?? "";
    this.exchanges.push({ provider, code, redirectUri: form.get("redirect_uri") ?? "" });
    const signedIn = this.codes.get(code);
    if (!signedIn || signedIn.provider !== provider) return Response.json({ error: "invalid_grant" }, { status: 400 });
    this.codes.delete(code);
    const accessToken = `token-${code}`;
    this.tokens.set(accessToken, signedIn.user);
    return Response.json({ access_token: accessToken });
  }

  userinfo(request: Request): Response {
    const user = this.tokens.get(request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "");
    if (!user) return new Response("Unauthorized", { status: 401 });
    return Response.json({ sub: user.sub, name: user.name, email: user.email, email_verified: user.emailVerified ?? true });
  }
}

export const oauthProviders = new FakeOAuthProviders();
for (const provider of Object.keys(ENDPOINTS) as Provider[]) {
  route(ENDPOINTS[provider].token, (request) => oauthProviders.token(provider, request));
  route(ENDPOINTS[provider].userinfo, (request) => oauthProviders.userinfo(request));
}
