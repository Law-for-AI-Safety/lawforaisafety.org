import { describe, expect, it } from "vitest";
import { opportunityFieldsFromBody } from "./form-fields";

describe("opportunityFieldsFromBody", () => {
  it("refuses a body missing title, org or applyUrl", () => {
    expect(opportunityFieldsFromBody({})).toEqual({ ok: false, error: "Title, organisation and apply URL are required" });
    expect(opportunityFieldsFromBody({ title: "A", org: "B" })).toEqual({ ok: false, error: "Title, organisation and apply URL are required" });
  });

  it("trims strings and drops blank optional fields", () => {
    const result = opportunityFieldsFromBody({ title: " A Job ", org: " Acme ", applyUrl: " https://example.com/apply ", orgUrl: "   " });
    expect(result).toMatchObject({ ok: true, fields: { title: "A Job", org: "Acme", applyUrl: "https://example.com/apply", orgUrl: undefined } });
  });

  it("keeps any known type, and defaults to job otherwise", () => {
    const base = { title: "A", org: "B", applyUrl: "https://example.com" };
    expect(opportunityFieldsFromBody(base)).toMatchObject({ fields: { type: "job" } });
    for (const type of ["fellowship", "project", "course", "event"]) {
      expect(opportunityFieldsFromBody({ ...base, type })).toMatchObject({ fields: { type } });
    }
    expect(opportunityFieldsFromBody({ ...base, type: "nonsense" })).toMatchObject({ fields: { type: "job" } });
  });

  it("keeps only non-blank string tags", () => {
    const result = opportunityFieldsFromBody({ title: "A", org: "B", applyUrl: "https://example.com", tags: ["Remote", "  ", 42, "Policy"] });
    expect(result).toMatchObject({ fields: { tags: ["Remote", "Policy"] } });
  });

  it("leaves tags undefined when not an array", () => {
    const result = opportunityFieldsFromBody({ title: "A", org: "B", applyUrl: "https://example.com" });
    expect(result).toMatchObject({ fields: { tags: undefined } });
  });
});
