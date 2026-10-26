import { describe, expect, it } from "vitest";
import {
  POLICY,
  calculateInstitutionCompliance,
  calculateLateralEntryOverlap,
  calculateProgrammeCompliance,
  computeComplianceScore,
  computeCumulative,
  detectSchemaMapping,
  diffCourses,
  normalizeCourseRow,
  processStudentSemesterRecord,
  SAMPLE_DIPLOMAS,
  SAMPLE_TARGET_SYLLABUS,
  simulateNepExit,
  stripGovernmentIds,
  validateSwayamCap,
  type CourseAttempt,
  type InstitutionMeta,
} from "@/lib/nadSyncEngine";

const row = (over: Record<string, unknown> = {}) => ({
  roll_no: "2023-CS-001",
  student_name: "Test Student",
  sub_cd: "CS101",
  subj_desc: "Programming",
  cr_reg: "4",
  marks_obt: "88",
  max_marks: "100",
  ...over,
});

const codes = (r: ReturnType<typeof normalizeCourseRow>) => r.issues.map((i) => i.code);

describe("B1-B3: a row is never given a grade, credit, code or title it did not have", () => {
  it("excludes an absent student instead of giving an A", () => {
    for (const marker of ["AB", "ABS", "absent", "Absent"]) {
      const r = normalizeCourseRow(row({ marks_obt: marker }));
      expect(r.course).toBeNull();
      expect(codes(r)).toContain("ABSENT");
    }
  });

  it("catches AB in the grade column too", () => {
    const r = normalizeCourseRow(row({ marks_obt: "", grade: "ABS" }));
    expect(r.course).toBeNull();
    expect(codes(r)).toContain("ABSENT");
  });

  it("flags incomplete and withdrawn results", () => {
    expect(codes(normalizeCourseRow(row({ marks_obt: "I" })))).toContain("INCOMPLETE");
    expect(codes(normalizeCourseRow(row({ marks_obt: "W" })))).toContain("WITHDRAWN");
  });

  it("flags a row with neither marks nor grade, never defaulting to A", () => {
    const r = normalizeCourseRow(row({ marks_obt: "" }));
    expect(r.course).toBeNull();
    expect(codes(r)).toContain("MISSING_GRADE");
  });

  it("flags unreadable and out-of-range marks", () => {
    expect(codes(normalizeCourseRow(row({ marks_obt: "eighty" })))).toContain("UNPARSEABLE_MARKS");
    expect(codes(normalizeCourseRow(row({ marks_obt: "120" })))).toContain("MARKS_OUT_OF_RANGE");
    expect(codes(normalizeCourseRow(row({ marks_obt: "-5" })))).toContain("MARKS_OUT_OF_RANGE");
  });

  it("reports an unknown grade instead of turning it into F", () => {
    const r = normalizeCourseRow(row({ marks_obt: "", grade: "D" }));
    expect(r.course).toBeNull();
    expect(codes(r)).toContain("UNKNOWN_GRADE");
  });

  it("accepts a grade the institution has mapped", () => {
    const r = normalizeCourseRow(row({ marks_obt: "", grade: "D" }), { D: "P" });
    expect(r.course?.letterGrade).toBe("P");
  });

  it("treats 0 credits as valid, not as 4", () => {
    const r = normalizeCourseRow(row({ cr_reg: "0", marks_obt: "", grade: "P" }));
    expect(r.course?.creditsRegistered).toBe(0);
    expect(r.course?.creditsEarned).toBe(0);
  });

  it("flags blank or unreadable credits", () => {
    expect(codes(normalizeCourseRow(row({ cr_reg: "" })))).toContain("MISSING_CREDITS");
    expect(codes(normalizeCourseRow(row({ cr_reg: "four" })))).toContain("UNPARSEABLE_CREDITS");
  });

  it("flags a missing course code and never invents CS-GEN", () => {
    const r = normalizeCourseRow(row({ sub_cd: "" }));
    expect(r.course).toBeNull();
    expect(codes(r)).toContain("MISSING_COURSE_CODE");
    expect(r.courseCode).toBeNull();
  });

  it("warns, but keeps the row, when only the title is missing", () => {
    const r = normalizeCourseRow(row({ subj_desc: "" }));
    expect(r.course).not.toBeNull();
    expect(codes(r)).toContain("MISSING_TITLE");
    expect(r.course?.courseTitle).toBe("CS101");
  });

  it("warns when marks and the grade column disagree, and trusts the marks", () => {
    const r = normalizeCourseRow(row({ marks_obt: "92", grade: "B" }));
    expect(r.course?.letterGrade).toBe("O");
    expect(codes(r)).toContain("GRADE_MISMATCH");
  });
});

describe("semester records", () => {
  it("leaves excluded rows out of SGPA and holds the record for review", () => {
    const rec = processStudentSemesterRecord({
      studentRoll: "2023-CS-001",
      studentName: "T",
      abcAccountId: "ABC-1",
      apaarToken: "TOK",
      program: "B.Tech",
      semester: 3,
      academicYear: "2024-25",
      prior: null,
      rows: [row({ sub_cd: "A1", marks_obt: "88" }), row({ sub_cd: "A2", marks_obt: "AB" })],
    });
    expect(rec.courses).toHaveLength(1);
    expect(rec.sgpa).toBe(9); // only the 88-mark course counts
    expect(rec.semesterCreditsRegistered).toBe(4);
    expect(rec.rowIssues.filter((r) => r.excluded)).toHaveLength(1);
    expect(rec.syncStatus).toBe("HELD_FOR_REVIEW");
  });

  it("B4: a new student has no prior record and no invented 75 credits / 8.2 CGPA", () => {
    const rec = processStudentSemesterRecord({
      studentRoll: "N-1",
      studentName: "New",
      abcAccountId: "ABC-N",
      apaarToken: "TOK",
      program: "B.Tech",
      semester: 1,
      academicYear: "2024-25",
      prior: null,
      rows: [row({ marks_obt: "88" })],
    });
    expect(rec.hasPriorRecord).toBe(false);
    expect(rec.priorAccumulatedCredits).toBe(0);
    expect(rec.updatedCumulativeCredits).toBe(4);
    expect(rec.cgpa).toBe(rec.sgpa);
  });

  it("B11: CGPA uses prior grade points over prior registered credits", () => {
    const rec = processStudentSemesterRecord({
      studentRoll: "P-1",
      studentName: "Prior",
      abcAccountId: "ABC-P",
      apaarToken: "TOK",
      program: "B.Tech",
      semester: 5,
      academicYear: "2024-25",
      prior: { creditsEarned: 80, creditsRegistered: 80, gradePoints: 640 }, // 8.0 over 80 credits
      rows: [row({ marks_obt: "88" })], // 9 points x 4 credits = 36
    });
    expect(rec.cgpa).toBe(8.05); // (640 + 36) / 84
    expect(rec.updatedCumulativeCredits).toBe(84);
  });

  it("re-submitting a semester replaces it instead of stacking credits", () => {
    const input = {
      studentRoll: "R-1",
      studentName: "Repeat",
      abcAccountId: "ABC-R",
      apaarToken: "TOK",
      program: "B.Tech",
      semester: 5,
      academicYear: "2024-25",
      prior: { creditsEarned: 80, creditsRegistered: 80, gradePoints: 640 },
      rows: [row({ marks_obt: "88" })],
    };
    const first = processStudentSemesterRecord(input);
    const second = processStudentSemesterRecord({ ...input, existingHistory: first.history });
    expect(second.updatedCumulativeCredits).toBe(first.updatedCumulativeCredits);
    expect(second.cgpa).toBe(first.cgpa);
    expect(second.history).toHaveLength(1);
  });
});

describe("B11: backlog rule", () => {
  const attempts: CourseAttempt[] = [
    { semester: 4, courseCode: "CS305", letterGrade: "F", gradePoints: 0, creditsRegistered: 3, creditsEarned: 0 },
    { semester: 5, courseCode: "CS305", letterGrade: "C", gradePoints: 5, creditsRegistered: 3, creditsEarned: 3 },
    { semester: 5, courseCode: "CS401", letterGrade: "A", gradePoints: 8, creditsRegistered: 4, creditsEarned: 4 },
  ];

  it("REPLACE_FAILED_ATTEMPT drops the failed first attempt from CGPA", () => {
    const c = computeCumulative(null, attempts, "REPLACE_FAILED_ATTEMPT");
    expect(c.creditsRegistered).toBe(7);
    expect(c.cgpa).toBe(6.71); // (15 + 32) / 7
  });

  it("KEEP_ALL_ATTEMPTS counts both attempts", () => {
    const c = computeCumulative(null, attempts, "KEEP_ALL_ATTEMPTS");
    expect(c.creditsRegistered).toBe(10);
    expect(c.cgpa).toBe(4.7); // 47 / 10
  });

  it("counts earned credits for a retaken course once under either rule", () => {
    expect(computeCumulative(null, attempts, "REPLACE_FAILED_ATTEMPT").creditsEarned).toBe(7);
    expect(computeCumulative(null, attempts, "KEEP_ALL_ATTEMPTS").creditsEarned).toBe(7);
  });

  it("returns a null CGPA, not NaN, when there is nothing to average", () => {
    expect(computeCumulative(null, []).cgpa).toBeNull();
  });
});

describe("schema mapper and government IDs", () => {
  it("S5: a government-ID column is reported and dropped, never mapped to a field", () => {
    const m = detectSchemaMapping(["roll_no", "apaar_id", "sub_cd", "cr_reg", "marks_obt"]);
    expect(m.mappings.find((x) => x.source === "apaar_id")?.method).toBe("government-id");
    expect(m.warnings.some((w) => w.includes("never stored"))).toBe(true);
    expect(stripGovernmentIds({ roll_no: "1", apaar_id: "948120416672", Aadhaar: "x" })).toEqual({ roll_no: "1" });
  });

  it("requires a credits column, because credits are no longer defaulted", () => {
    const m = detectSchemaMapping(["roll_no", "sub_cd", "marks_obt"]);
    expect(m.missingRequired).toContain("credits");
  });
});

describe("diff", () => {
  it("separates added, changed, removed and unchanged courses", () => {
    const a = normalizeCourseRow(row({ sub_cd: "X1", marks_obt: "88" })).course!;
    const b = normalizeCourseRow(row({ sub_cd: "X2", marks_obt: "70" })).course!;
    const a2 = normalizeCourseRow(row({ sub_cd: "X1", marks_obt: "95" })).course!;
    const c = normalizeCourseRow(row({ sub_cd: "X3", marks_obt: "60" })).course!;
    const d = diffCourses([a, b], [a2, c]);
    expect(Object.fromEntries(d.map((x) => [x.courseCode, x.change]))).toEqual({ X1: "CHANGED", X3: "ADDED", X2: "REMOVED" });
  });
});

describe("B5-B7: AICTE intake compliance", () => {
  const meta: InstitutionMeta = {
    institutionCode: "T",
    institutionName: "Test",
    aicteApprovalReference: "R",
    academicYear: "2024-25",
  };

  it("B6: flags a programme over its approved intake even when the institution total is fine", () => {
    const c = calculateInstitutionCompliance(
      [
        { programme: "CS", approvedIntake: 100, erpEnrolled: 102, verified: 100, abcSeeded: 100 },
        { programme: "EC", approvedIntake: 100, erpEnrolled: 70, verified: 70, abcSeeded: 70 },
      ],
      meta
    );
    expect(c.totalErpEnrolled).toBeLessThan(c.approvedIntake);
    expect(c.complianceStatus).toBe("OVER_INTAKE_PENALTY_RISK");
    expect(c.overIntakeProgrammes).toEqual(["CS"]);
    expect(c.aicteNotice).toContain("CS (+2)");
  });

  it("B5: over-intake is reported as it is, with no cap on the counts", () => {
    const p = calculateProgrammeCompliance({ programme: "CS", approvedIntake: 100, erpEnrolled: 140, verified: 140, abcSeeded: 140 });
    expect(p.overBy).toBe(40);
    expect(p.status).toBe("OVER_INTAKE_PENALTY_RISK");
  });

  it("B7: a zero approved intake is a clear state, never Infinity or NaN", () => {
    const p = calculateProgrammeCompliance({ programme: "X", approvedIntake: 0, erpEnrolled: 5, verified: 5, abcSeeded: 5 });
    expect(p.status).toBe("NO_APPROVED_INTAKE");
    expect(p.enrolmentPercentage).toBeNull();
    const c = calculateInstitutionCompliance([{ programme: "X", approvedIntake: 0, erpEnrolled: 5, verified: 5, abcSeeded: 5 }], meta);
    expect(c.complianceStatus).toBe("NO_APPROVED_INTAKE");
    expect(c.enrolmentPercentage).toBeNull();
    expect(JSON.stringify(c)).not.toMatch(/Infinity|NaN/);
  });

  it("B7: the leaderboard score is UNRATED when there is no approved intake", () => {
    const s = computeComplianceScore({ code: "C", name: "C", state: "S", approvedIntake: 0, erpEnrolled: 10, verified: 5, abcSeeded: 5, flagsOpen: 0, flagsResolved: 0 });
    expect(s.band).toBe("UNRATED");
    expect(Number.isFinite(s.score)).toBe(true);
  });
});

describe("policy calculators", () => {
  it("applies the 40% SWAYAM cap", () => {
    const ok = validateSwayamCap(160, 64);
    expect(ok.valid).toBe(true);
    expect(ok.capCredits).toBe(64);
    const over = validateSwayamCap(160, 70);
    expect(over.valid).toBe(false);
    expect(over.message).toContain("6 credits cannot be counted");
  });

  it("measures lateral-entry overlap by credits, and labels the threshold an assumption", () => {
    const cse = calculateLateralEntryOverlap(SAMPLE_DIPLOMAS.CSE.syllabus, SAMPLE_TARGET_SYLLABUS);
    const mech = calculateLateralEntryOverlap(SAMPLE_DIPLOMAS.MECH.syllabus, SAMPLE_TARGET_SYLLABUS);
    expect(cse.eligible).toBe(true);
    expect(mech.eligible).toBe(false);
    expect(cse.thresholdIsAssumption).toBe(true);
    expect(POLICY.lateralEntryMinOverlap.status).toBe("assumption");
  });

  it("NEP exits need the credits and the 4 skill credits", () => {
    expect(simulateNepExit(128, 4).highestEligible?.level).toBe("UG_DIPLOMA");
    expect(simulateNepExit(128, 0).highestEligible).toBeNull();
    expect(simulateNepExit(160, 4).highestEligible?.level).toBe("DEGREE");
    expect(simulateNepExit(128, 4).nextMilestone?.creditShortfall).toBe(32);
  });
});
