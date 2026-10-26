import { describe, expect, it } from "vitest";
import { TWIN, creditsThroughSemester, projectedCreditsThrough, semesterSgpa, twinTotals } from "@/lib/studentData";

const POINTS = { O: 10, "A+": 9, A: 8, "B+": 7, B: 6, C: 5, P: 4, F: 0 } as const;

describe("B9: displayed SGPA always agrees with the grades under it", () => {
  it("matches an independent calculation for every completed semester", () => {
    for (const sem of TWIN.filter((s) => s.status === "COMPLETED")) {
      const credits = sem.courses.reduce((n, c) => n + c.credits, 0);
      const points = sem.courses.reduce((n, c) => n + POINTS[c.grade] * c.credits, 0);
      expect(semesterSgpa(sem)).toBe(Math.round((points / credits) * 100) / 100);
    }
  });

  it("gives the values a reader would get by hand", () => {
    const sgpa = TWIN.filter((s) => s.status === "COMPLETED").map((s) => semesterSgpa(s));
    expect(sgpa).toEqual([8.71, 8.43, 9, 7.32, 8.42, 9.1]);
  });

  it("has no SGPA for a planned semester", () => {
    expect(semesterSgpa(TWIN.find((s) => s.status === "PLANNED")!)).toBeNull();
  });
});

describe("B10: planned credits are never counted as earned", () => {
  it("counts only completed semesters, wherever the slider is", () => {
    expect(creditsThroughSemester(6)).toBe(128);
    expect(creditsThroughSemester(7)).toBe(128);
    expect(creditsThroughSemester(8)).toBe(128);
    expect(twinTotals().creditsEarned).toBe(128);
  });

  it("offers the projection only as a separate figure", () => {
    expect(projectedCreditsThrough(6)).toBe(128);
    expect(projectedCreditsThrough(7)).toBe(140);
    expect(projectedCreditsThrough(8)).toBe(148);
  });
});

describe("B11: a failed attempt that was retaken", () => {
  it("is replaced in CGPA under the default rule, but still counts under KEEP_ALL_ATTEMPTS", () => {
    const replace = twinTotals(TWIN, "REPLACE_FAILED_ATTEMPT").cgpa;
    const keepAll = twinTotals(TWIN, "KEEP_ALL_ATTEMPTS").cgpa;
    expect(replace).toBeGreaterThan(keepAll);
  });

  it("counts the retaken course's credits once", () => {
    expect(twinTotals(TWIN, "KEEP_ALL_ATTEMPTS").creditsEarned).toBe(twinTotals(TWIN, "REPLACE_FAILED_ATTEMPT").creditsEarned);
  });
});
