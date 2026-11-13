import { describe, expect, it } from "vitest";
import { applyEmail, applyLinkForForm, isApplyLink, isWebAddress, normaliseApplyLink } from "./apply-link";

describe("apply links", () => {
  it("makes a bare email address a mailto: link, and leaves anything else as typed, trimmed", () => {
    expect(normaliseApplyLink(" join@pauseai.info ")).toBe("mailto:join@pauseai.info");
    expect(normaliseApplyLink(" https://example.org/apply ")).toBe("https://example.org/apply");
    expect(normaliseApplyLink("mailto:join@pauseai.info")).toBe("mailto:join@pauseai.info");
    expect(normaliseApplyLink("not a link")).toBe("not a link");
  });

  it("reads the address out of a mailto: link with one plain address", () => {
    expect(applyEmail("mailto:join@pauseai.info")).toBe("join@pauseai.info");
    expect(applyEmail("MAILTO:join@pauseai.info")).toBe("join@pauseai.info");
    expect(applyEmail("https://example.org")).toBeUndefined();
    expect(applyEmail("mailto:")).toBeUndefined();
    expect(applyEmail("mailto:join@pauseai.info?subject=Hi")).toBeUndefined();
    expect(applyEmail("mailto:a@b.org,c@d.org")).toBeUndefined();
    expect(applyEmail("mailto:join@localhost")).toBeUndefined();
  });

  it("takes a web address or an email link, nothing else", () => {
    expect(isApplyLink("https://example.org/apply")).toBe(true);
    expect(isApplyLink("http://example.org")).toBe(true);
    expect(isApplyLink("mailto:join@pauseai.info")).toBe(true);
    expect(isApplyLink("join@pauseai.info")).toBe(false);
    expect(isApplyLink("javascript:alert(1)")).toBe(false);
    expect(isApplyLink("ftp://example.org")).toBe(false);
    expect(isApplyLink("https://")).toBe(false);
    expect(isWebAddress("mailto:join@pauseai.info")).toBe(false);
  });

  it("shows an email link in a form as just the address", () => {
    expect(applyLinkForForm("mailto:join@pauseai.info")).toBe("join@pauseai.info");
    expect(applyLinkForForm("https://example.org/apply")).toBe("https://example.org/apply");
  });
});
