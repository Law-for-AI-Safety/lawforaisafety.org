import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { redLinesApplications } from "@/drizzle/schema";
import { sweepRejectedRedLinesApplications } from "@/lib/red-lines-flow";

describe("sweepRejectedRedLinesApplications", () => {
  it("deletes applications rejected over a year ago, and keeps approved, newer and undecided ones", async () => {
    const day = 24 * 60 * 60 * 1000;
    const longAgo = new Date(Date.now() - 366 * day);
    await db.insert(redLinesApplications).values([
      { status: "rejected", name: "old rejected", reviewedAt: longAgo },
      { status: "approved", name: "old approved", reviewedAt: longAgo },
      { status: "rejected", name: "recent", reviewedAt: new Date(Date.now() - 364 * day) },
      { status: "pending", name: "waiting", createdAt: longAgo },
    ]);

    expect(await sweepRejectedRedLinesApplications()).toBe(1);
    const left = await db.select({ name: redLinesApplications.name }).from(redLinesApplications);
    expect(left.map((row) => row.name).sort()).toEqual(["old approved", "recent", "waiting"]);
  });
});
