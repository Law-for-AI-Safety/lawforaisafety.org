import { describe, expect, it } from "vitest";
import { seeOther } from "@/lib/redirect";

describe("seeOther", () => {
  it("redirects with a 303 to a relative path on this site", () => {
    const response = seeOther("/red-lines-dialogue?error=closed#apply");

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/red-lines-dialogue?error=closed#apply");
  });

  it.each(["https://evil.example/", "//evil.example/", "evil.example", ""])(
    "sends %j to the homepage instead of off the site",
    (path) => {
      expect(seeOther(path).headers.get("Location")).toBe("/");
    },
  );
});
