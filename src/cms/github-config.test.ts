import { describe, expect, it, vi } from "vitest";
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

  it("accepts only GitHub's own API", () => {
    for (const url of ["https://api.github.com", "https://api.github.com/", " "]) {
      const setup = gitHubSetup({ ...env, GITHUB_API_URL: url });
      expect(setup.ok && setup.config.apiUrl).toBe("https://api.github.com");
    }
  });

  it.each(["https://ghe.example.org/api/v3", "http://api.github.com", "https://evil.example", "http://localhost:4010", "not a url"])(
    "refuses the API URL %s without the test-only flag",
    (url) => {
      expect(gitHubSetup({ ...env, GITHUB_API_URL: url })).toEqual({ ok: false, problem: "GITHUB_API_URL must be https://api.github.com" });
    },
  );

  describe("with the test-only flag, for the end-to-end tests' fake", () => {
    const flagged = { ...env, CMS_TEST_LOCAL_GITHUB: "1" };

    it.each([
      ["http://localhost:4010", "http://localhost:4010"],
      ["http://127.0.0.1:4010/", "http://127.0.0.1:4010"],
    ])("accepts %s", (url, expected) => {
      const setup = gitHubSetup({ ...flagged, GITHUB_API_URL: url });
      expect(setup.ok && setup.config.apiUrl).toBe(expected);
    });

    it.each(["https://evil.example", "http://evil.example", "http://localhost:4010/api", "http://user:pw@localhost:1", "http://localhost:1/?x", "not a url"])(
      "still refuses %s",
      (url) => {
        expect(gitHubSetup({ ...flagged, GITHUB_API_URL: url }).ok).toBe(false);
      },
    );

    it("is ignored on a Netlify deploy", () => {
      vi.stubEnv("DEPLOY_CONTEXT", "production");
      expect(gitHubSetup({ ...flagged, GITHUB_API_URL: "http://localhost:4010" }).ok).toBe(false);
      vi.stubEnv("DEPLOY_CONTEXT", "deploy-preview");
      expect(gitHubSetup({ ...flagged, GITHUB_API_URL: "http://localhost:4010" }).ok).toBe(false);
    });

    it("must be exactly 1", () => {
      expect(gitHubSetup({ ...env, CMS_TEST_LOCAL_GITHUB: "true", GITHUB_API_URL: "http://localhost:4010" }).ok).toBe(false);
    });
  });
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
