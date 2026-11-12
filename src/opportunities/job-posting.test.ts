import { describe, expect, it } from "vitest";
import { jobPostingJsonLd, jsonLdScript } from "./job-posting";
import type { PublishedOpportunity } from "./types";

const NOW = new Date("2026-11-12T12:00:00Z");

const JOB: PublishedOpportunity = {
  id: "00000000-0000-0000-0000-000000000001",
  slug: "acme-policy-counsel",
  type: "job",
  title: "Policy Counsel",
  org: "Acme",
  orgUrl: "https://acme.example",
  summary: "A short summary.",
  description: "First paragraph.\n\nSecond <b>paragraph</b> & more.",
  locationCountry: "BE",
  locationCity: "Brussels",
  remote: false,
  commitment: "full_time",
  deadline: "2026-12-01",
  applyUrl: "https://acme.example/apply",
  status: "published",
  publishedAt: "2026-11-01",
};

describe("jobPostingJsonLd", () => {
  it("describes an on-site job with every property Google requires and the ones it recommends", () => {
    expect(jobPostingJsonLd(JOB, NOW)).toEqual({
      "@context": "https://schema.org/",
      "@type": "JobPosting",
      title: "Policy Counsel",
      description: "<p>First paragraph.</p><p>Second &lt;b&gt;paragraph&lt;/b&gt; &amp; more.</p>",
      url: "https://lawforaisafety.org/opportunities/acme-policy-counsel",
      datePosted: "2026-11-01",
      validThrough: "2026-12-01T23:59:59-12:00",
      employmentType: "FULL_TIME",
      hiringOrganization: { "@type": "Organization", name: "Acme", sameAs: "https://acme.example" },
      jobLocation: {
        "@type": "Place",
        address: { "@type": "PostalAddress", addressLocality: "Brussels", addressCountry: "BE" },
      },
    });
  });

  it("marks a remote job as telecommute, open to applicants in its country", () => {
    const posting = jobPostingJsonLd({ ...JOB, remote: true, locationCity: undefined }, NOW);
    expect(posting).toMatchObject({
      jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressCountry: "BE" } },
      jobLocationType: "TELECOMMUTE",
      applicantLocationRequirements: { "@type": "Country", name: "BE" },
    });
    expect(posting?.jobLocation).not.toHaveProperty("address.addressLocality");
  });

  it("marks a remote job with no base country as telecommute alone", () => {
    const posting = jobPostingJsonLd({ ...JOB, remote: true, locationCountry: "GLOBAL", locationCity: undefined }, NOW);
    expect(posting).toMatchObject({ jobLocationType: "TELECOMMUTE" });
    expect(posting).not.toHaveProperty("jobLocation");
    expect(posting).not.toHaveProperty("applicantLocationRequirements");
  });

  it("leaves out what the listing doesn't have", () => {
    const posting = jobPostingJsonLd({ ...JOB, orgUrl: undefined, commitment: undefined, deadline: undefined }, NOW);
    expect(posting).not.toHaveProperty("validThrough");
    expect(posting).not.toHaveProperty("employmentType");
    expect(posting?.hiringOrganization).toEqual({ "@type": "Organization", name: "Acme" });
  });

  it("maps each commitment to Google's employment types", () => {
    const types = (["full_time", "part_time", "contract", "internship", "fellowship"] as const).map(
      (commitment) => jobPostingJsonLd({ ...JOB, commitment }, NOW)?.employmentType,
    );
    expect(types).toEqual(["FULL_TIME", "PART_TIME", "CONTRACTOR", "INTERN", "OTHER"]);
  });

  it("is valid through the open round's closing day, for a listing with rounds", () => {
    const posting = jobPostingJsonLd(
      { ...JOB, type: "fellowship", deadline: undefined, rounds: [{ deadline: "2026-11-01" }, { deadline: "2027-02-01" }] },
      NOW,
    );
    expect(posting?.validThrough).toBe("2027-02-01T23:59:59-12:00");
  });

  it("is given only to jobs and fellowships", () => {
    expect(jobPostingJsonLd({ ...JOB, type: "fellowship" }, NOW)).not.toBeNull();
    for (const type of ["project", "course", "event"] as const) {
      expect(jobPostingJsonLd({ ...JOB, type }, NOW)).toBeNull();
    }
  });

  it("is dropped once the listing has closed", () => {
    expect(jobPostingJsonLd({ ...JOB, deadline: "2026-11-10" }, NOW)).toBeNull();
  });

  it("is not given to an on-site listing with no base country, which has no location to state", () => {
    expect(jobPostingJsonLd({ ...JOB, locationCountry: "GLOBAL", locationCity: undefined }, NOW)).toBeNull();
  });
});

describe("jsonLdScript", () => {
  it("escapes < so a value can't close the script element", () => {
    const script = jsonLdScript({ description: "</script><script>alert(1)</script>" });
    expect(script).not.toContain("<");
    expect(JSON.parse(script)).toEqual({ description: "</script><script>alert(1)</script>" });
  });
});
