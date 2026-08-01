export type OAuthProviderName = "linkedin" | "google";

export type OAuthUserInfo = {
  sub: string;
  name: string;
  email: string;
  picture: string | null;
};

type ProviderConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
};

const PROVIDERS: Record<OAuthProviderName, ProviderConfig> = {
  linkedin: {
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    userInfoUrl: "https://api.linkedin.com/v2/userinfo",
    scope: "openid profile email",
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
  },
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid profile email",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function buildAuthorizeUrl(
  provider: OAuthProviderName,
  { redirectUri, state }: { redirectUri: string; state: string },
): string {
  const config = PROVIDERS[provider];
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", requireEnv(config.clientIdEnv));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCodeForUserInfo(
  provider: OAuthProviderName,
  { code, redirectUri }: { code: string; redirectUri: string },
): Promise<OAuthUserInfo> {
  const config = PROVIDERS[provider];

  const tokenResponse = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: requireEnv(config.clientIdEnv),
      client_secret: requireEnv(config.clientSecretEnv),
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(
      `${provider} token exchange failed: ${tokenResponse.status} ${await tokenResponse.text()}`,
    );
  }

  const { access_token: accessToken } = (await tokenResponse.json()) as {
    access_token: string;
  };

  const userInfoResponse = await fetch(config.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userInfoResponse.ok) {
    throw new Error(
      `${provider} userinfo fetch failed: ${userInfoResponse.status} ${await userInfoResponse.text()}`,
    );
  }

  const raw = (await userInfoResponse.json()) as {
    sub: string;
    name: string;
    email: string;
    picture?: string | null;
  };

  return {
    sub: raw.sub,
    name: raw.name,
    email: raw.email,
    picture: raw.picture ?? null,
  };
}
