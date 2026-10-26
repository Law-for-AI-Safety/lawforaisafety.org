import { describe, expect, it } from "vitest";
import { opportunityFieldsFromBody } from "./form-fields";

describe("opportunityFieldsFromBody", () => {
  it("refuses a body missing title, org or applyUrl", () => {
    expect(opportunityFieldsFromBody({})).toEqual({ ok: false, error: "Title, organisation and apply URL are required" });
    expect(opportunityFieldsFromBody({ title: "A", org: "B" })).toEqual({ ok: false, error: "Title, organisation and apply URL are required" });
  });

  it("trims strings and drops blank optional fields", () => {
    const result = opportunityFieldsFromBody({ type: "job", title: " A Job ", org: " Acme ", applyUrl: " https://example.com/apply ", orgUrl: "   " });
    expect(result).toMatchObject({ ok: true, fields: { title: "A Job", org: "Acme", applyUrl: "https://example.com/apply", orgUrl: undefined } });
  });

  it("keeps any known type", () => {
    const base = { title: "A", org: "B", applyUrl: "https://example.com" };
    for (const type of ["job", "fellowship", "project", "course", "event"]) {
      expect(opportunityFieldsFromBody({ ...base, type })).toMatchObject({ ok: true, fields: { type } });
    }
  });

  it("rejects a missing or unknown type rather than guessing one", () => {
    const base = { title: "A", org: "B", applyUrl: "https://example.com" };
    const error = "Type must be one of: job, fellowship, project, course, event";
    expect(opportunityFieldsFromBody(base)).toEqual({ ok: false, error });
    expect(opportunityFieldsFromBody({ ...base, type: "Event" })).toEqual({ ok: false, error });
    expect(opportunityFieldsFromBody({ ...base, type: "workshop" })).toEqual({ ok: false, error });
  });

  it("keeps only non-blank string tags", () => {
    const result = opportunityFieldsFromBody({ type: "job", title: "A", org: "B", applyUrl: "https://example.com", tags: ["Remote", "  ", 42, "Policy"] });
    expect(result).toMatchObject({ fields: { tags: ["Remote", "Policy"] } });
  });

  it("leaves tags undefined when not an array", () => {
    const result = opportunityFieldsFromBody({ type: "job", title: "A", org: "B", applyUrl: "https://example.com" });
    expect(result).toMatchObject({ fields: { tags: undefined } });
  });
});
