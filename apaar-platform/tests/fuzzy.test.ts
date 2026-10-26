import { describe, expect, it } from "vitest";
import {
  INITIAL_ONLY_CAP,
  compareDOB,
  compareIndianNamesWithInitialExpansion,
  isRealDate,
  jaroDistance,
  jaroWinkler,
  literalName,
  runPreFlightFuzzyMatch,
  type StudentDemographicRecord,
} from "@/lib/fuzzyMatcher";
import { PRESET_AICTE_CASES } from "@/lib/fuzzySamples";

const rec = (over: Partial<StudentDemographicRecord> = {}, source: StudentDemographicRecord["source"] = "ERP"): StudentDemographicRecord => ({
  name: "Ananya Banerjee",
  dob: "2004-12-09",
  gender: "F",
  guardianName: "Subhash Banerjee",
  source,
  ...over,
});

describe("M1: the API needs a literal match, so 'same person' is not 'will pass'", () => {
  it("does not call Mohd Faraz / Mohammad Faraz exact. It is auto-fixable with the exact correction", () => {
    const r = runPreFlightFuzzyMatch(rec({ name: "Mohd Faraz" }), rec({ name: "Mohammad Faraz" }, "DIGILOCKER"));
    expect(r.sameIdentityConfidence).toBeGreaterThanOrEqual(95);
    expect(r.apiWillAccept.name).toBe(false);
    expect(r.classification).toBe("AUTO_FIXABLE");
    expect(r.suggestedFixes[0].to).toBe("Mohammad Faraz");
    expect(r.suggestedFixes[0].text).toContain("Change ERP name to 'Mohammad Faraz'");
  });

  it("treats a transposed name as auto-fixable, not exact", () => {
    const r = runPreFlightFuzzyMatch(rec({ name: "Rahul Sharma" }), rec({ name: "Sharma Rahul" }, "DIGILOCKER"));
    expect(r.classification).toBe("AUTO_FIXABLE");
  });

  it("is EXACT only when the API would accept it: case, spacing and punctuation may differ, nothing else", () => {
    const r = runPreFlightFuzzyMatch(rec({ name: "k. v.  RAHUL" }), rec({ name: "K V Rahul" }, "DIGILOCKER"));
    expect(r.apiWillAccept.all).toBe(true);
    expect(r.classification).toBe("EXACT_MATCH");
    expect(literalName("K. V. Rahul")).toBe(literalName("k v rahul"));
  });

  it("is not EXACT when the date of birth differs, even if the name is literal", () => {
    const r = runPreFlightFuzzyMatch(rec(), rec({ dob: "2004-09-12" }, "DIGILOCKER"));
    expect(r.classification).not.toBe("EXACT_MATCH");
    expect(r.apiWillAccept.dob).toBe(false);
  });

  it("classifies the preset cases", () => {
    const expected: Record<string, string> = {
      "CASE-01": "SOFT_MISMATCH_REVIEW", // Rahul Kumar vs Rahul K.: initial only
      "CASE-02": "AUTO_FIXABLE", // Mohd vs Mohammad
      "CASE-03": "SOFT_MISMATCH_REVIEW", // K. V. vs Koppula Venkat
      "CASE-04": "SOFT_MISMATCH_REVIEW", // Lakshmi Priya S. vs Laxmi Priya Sundaramurthy
      "CASE-05": "SOFT_MISMATCH_REVIEW", // surname swap and swapped day/month
      "CASE-06": "EXACT_MATCH",
      "CASE-07": "HARD_REJECT",
    };
    for (const c of PRESET_AICTE_CASES) {
      expect(c.id + " " + runPreFlightFuzzyMatch(c.erp, c.digilocker).classification).toBe(c.id + " " + expected[c.id]);
    }
  });
});

describe("M2/M3: weighting", () => {
  it("uses the guardian name when both sides have it", () => {
    const withGuardian = runPreFlightFuzzyMatch(rec(), rec({ guardianName: "Totally Different" }, "DIGILOCKER"));
    const without = runPreFlightFuzzyMatch(rec({ guardianName: undefined }), rec({ guardianName: undefined }, "DIGILOCKER"));
    expect(withGuardian.guardianScore).not.toBeNull();
    expect(withGuardian.sameIdentityConfidence).toBeLessThan(without.sameIdentityConfidence);
  });

  it("drops a missing gender out of the average instead of scoring it 100", () => {
    const r = runPreFlightFuzzyMatch(rec({ name: "Ananya Banerjee", gender: undefined }), rec({ name: "Zzzz Qqqq", gender: undefined }, "DIGILOCKER"));
    expect(r.genderScore).toBeNull();
    expect(r.apiWillAccept.gender).toBeNull();
    // Name is the only thing that is different, so a free 100 for gender must not rescue the score.
    const withGender = runPreFlightFuzzyMatch(rec({ name: "Ananya Banerjee" }), rec({ name: "Zzzz Qqqq" }, "DIGILOCKER"));
    expect(r.sameIdentityConfidence).toBeLessThanOrEqual(withGender.sameIdentityConfidence);
  });

  it("drops a missing DOB out of the average and is never EXACT", () => {
    const r = runPreFlightFuzzyMatch(rec({ dob: "" }), rec({}, "DIGILOCKER"));
    expect(r.dobScore).toBeNull();
    expect(r.classification).not.toBe("EXACT_MATCH");
  });
});

describe("M4: initial-only matches are capped", () => {
  it("scores 'A Kumar' no higher than the cap against both Anil and Amit", () => {
    const anil = compareIndianNamesWithInitialExpansion("A Kumar", "Anil Kumar");
    const amit = compareIndianNamesWithInitialExpansion("A Kumar", "Amit Kumar");
    expect(anil.usedInitials).toBe(true);
    expect(anil.score).toBeLessThanOrEqual(INITIAL_ONLY_CAP);
    expect(anil.score).toBe(amit.score);
    expect(anil.notes.join(" ")).toMatch(/initial-only/i);
  });

  it("never auto-fixes a name that matched only through an initial", () => {
    const r = runPreFlightFuzzyMatch(rec({ name: "Rahul Kumar" }), rec({ name: "Rahul K." }, "DIGILOCKER"));
    expect(r.classification).toBe("SOFT_MISMATCH_REVIEW");
  });
});

describe("M5/M6", () => {
  it("computes token-set and initial-expansion scores separately", () => {
    const r = runPreFlightFuzzyMatch(rec({ name: "Rahul Kumar" }), rec({ name: "Rahul K." }, "DIGILOCKER"));
    expect(r.tokenSetScore).not.toBe(r.initialExpansionScore);
  });

  it("keeps the Jaro match window non-negative for one- and two-character strings", () => {
    for (const [a, b] of [["a", "b"], ["ab", "ba"], ["a", "a"], ["ab", "ab"]]) {
      const d = jaroDistance(a, b);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
    // With a zero-width window only same-position characters match: "ab"/"ba" share none, "ab"/"ac" share one.
    expect(jaroWinkler("ab", "ba")).toBe(0);
    expect(jaroDistance("ab", "ac")).toBeCloseTo(2 / 3, 5);
  });

  it("rejects impossible dates", () => {
    expect(isRealDate("2004-02-31")).toBe(false);
    expect(isRealDate("2004-13-01")).toBe(false);
    expect(isRealDate("2004-02-29")).toBe(true);
    expect(isRealDate("2003-02-29")).toBe(false);
    const c = compareDOB("31-02-2004", "31-02-2004");
    expect(c.score).toBe(0);
    expect(c.literal).toBe(false);
    expect(c.note).toMatch(/not a real calendar date/);
  });

  it("accepts DD/MM/YYYY and YYYY-MM-DD as the same date", () => {
    expect(compareDOB("09/12/2004", "2004-12-09").literal).toBe(true);
  });
});
