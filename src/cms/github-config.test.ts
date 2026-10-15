import { describe, expect, it } from "vitest";
import { gitHubSetup, previewUrl, REQUIRED_GITHUB_ENV } from "./github-config";

const env = {
  GITHUB_APP_ID: " 1 ",
  GITHUB_APP_INSTALLATION_ID: "2",
  GITHUB_APP_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\\nabc\\n-----END RSA PRIVATE KEY-----",
  GITHUB_REPO_OWNER: "Law-for-AI-Safety",
  GITHUB_REPO_NAME: "lawforaisafety.org",
};

describe("gitHubSetup", () => {
  it("reads the app's settings, turning \\n escapes in the key into line breaks", () => {
    expect(gitHubSetup(env)).toEqual({
      ok: true,
      config: {
        appId: "1",
        installationId: "2",
        privateKey: "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----",
        owner: "Law-for-AI-Safety",
        repo: "lawforaisafety.org",
        apiUrl: "https://api.github.com",
      },
    });
  });

  it("is not set up while any required setting is missing or blank", () => {
    expect(gitHubSetup({})).toEqual({ ok: false, problem: `Missing ${REQUIRED_GITHUB_ENV.join(", ")}` });
    expect(gitHubSetup({ ...env, GITHUB_APP_PRIVATE_KEY: "  " })).toEqual({ ok: false, problem: "Missing GITHUB_APP_PRIVATE_KEY" });
  });

  it.each([
    ["https://ghe.example.org/api/v3/", "https://ghe.example.org/api/v3"],
    ["http://localhost:4010", "http://localhost:4010"],
    ["http://127.0.0.1:4010", "http://127.0.0.1:4010"],
  ])("accepts the API URL %s", (url, expected) => {
    const setup = gitHubSetup({ ...env, GITHUB_API_URL: url });
    expect(setup.ok && setup.config.apiUrl).toBe(expected);
  });

  it.each(["http://api.github.com", "not a url", "https://user:pw@api.github.com", "https://api.github.com/?x=1", "ftp://localhost"])(
    "refuses the API URL %s",
    (url) => {
      expect(gitHubSetup({ ...env, GITHUB_API_URL: url })).toEqual({ ok: false, problem: "GITHUB_API_URL must be an https URL" });
    },
  );
});

describe("previewUrl", () => {
  it("links to the pull request's Netlify deploy preview at the page", () => {
    expect(previewUrl(12, "/field-building", {})).toBe("https://deploy-preview-12--law-for-ai-safety-org.netlify.app/field-building");
  });

  it("uses a configured site name, if it is one", () => {
    expect(previewUrl(3, "/a", { CMS_PREVIEW_SITE_NAME: "other-site" })).toBe("https://deploy-preview-3--other-site.netlify.app/a");
    expect(previewUrl(3, "/a", { CMS_PREVIEW_SITE_NAME: "evil.example/x?" })).toBe("https://deploy-preview-3--law-for-ai-safety-org.netlify.app/a");
  });
});
