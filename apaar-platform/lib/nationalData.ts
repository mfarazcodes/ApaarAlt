import { createHash } from "crypto";
import { SAMPLE_COLLEGES, calculateProgrammeCompliance, computeComplianceScore, type CollegeSnapshot, type ComplianceScore, type ProgrammeCompliance, type ProgrammeIntake } from "./nadSyncEngine";

/**
 * The national view behind the AICTE drill-down: college, then programme, then pseudonymous students.
 * It is sample data, generated the same way every time. Students are only ever shown as tokens.
 */

const PROGRAMMES = ["Computer Science", "Electronics & Comm.", "Mechanical", "Civil", "Electrical"];
const WEIGHTS = [0.3, 0.2, 0.2, 0.15, 0.15];

/** Splits a total by weights so the parts add up to exactly the total (largest remainder). */
export function splitTotal(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (total * w) / sum);
  const parts = raw.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i] += 1;
    left -= 1;
  }
  return parts;
}

export function programmesFor(college: CollegeSnapshot): ProgrammeIntake[] {
  const approved = splitTotal(college.approvedIntake, WEIGHTS);
  const enrolled = splitTotal(college.erpEnrolled, WEIGHTS);
  const verified = splitTotal(college.verified, WEIGHTS);
  const seeded = splitTotal(college.abcSeeded, WEIGHTS);
  return PROGRAMMES.map((programme, i) => ({ programme, approvedIntake: approved[i], erpEnrolled: enrolled[i], verified: Math.min(verified[i], enrolled[i]), abcSeeded: Math.min(seeded[i], verified[i]) }));
}

export interface CollegeRow extends CollegeSnapshot, ComplianceScore {
  programmes: ProgrammeCompliance[];
  overIntakeProgrammes: string[];
}

export function nationalColleges(): CollegeRow[] {
  return SAMPLE_COLLEGES.map((c) => {
    const programmes = programmesFor(c).map(calculateProgrammeCompliance);
    return { ...c, ...computeComplianceScore(c), programmes, overIntakeProgrammes: programmes.filter((p) => p.status === "OVER_INTAKE_PENALTY_RISK").map((p) => p.programme) };
  }).sort((a, b) => b.score - a.score);
}

export type StudentStatus = "ABC_SEEDED" | "VERIFIED" | "UNVERIFIED";

export interface PseudonymousStudent {
  token: string;
  status: StudentStatus;
  flags: string[];
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export const PAGE_SIZE = 25;

export interface StudentPage {
  college: string;
  programme: string;
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  rows: PseudonymousStudent[];
}

/** One page of a programme's students, as tokens. Throws on an unknown college or programme. */
export function studentsFor(collegeCode: string, programmeName: string, page = 1, pageSize = PAGE_SIZE): StudentPage {
  const college = SAMPLE_COLLEGES.find((c) => c.code === collegeCode);
  if (!college) throw new Error(`Unknown college ${collegeCode}`);
  const programme = programmesFor(college).find((p) => p.programme === programmeName);
  if (!programme) throw new Error(`Unknown programme ${programmeName}`);

  const total = programme.erpEnrolled;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.floor(page)), pages);
  const rows: PseudonymousStudent[] = [];

  for (let i = (current - 1) * pageSize; i < Math.min(total, current * pageSize); i++) {
    const h = hash(`${collegeCode}|${programmeName}|${i}`);
    const status: StudentStatus = i < programme.abcSeeded ? "ABC_SEEDED" : i < programme.verified ? "VERIFIED" : "UNVERIFIED";
    const flags: string[] = [];
    if (status === "UNVERIFIED") {
      flags.push("No verified APAAR identity");
      // A deterministic third of the unverified rows also carry a second reason, so the drill-down has texture.
      if (parseInt(h.slice(0, 2), 16) % 3 === 0) flags.push("Fees paid from a third-party account");
    }
    rows.push({ token: `STU-${h.slice(0, 6).toUpperCase()}`, status, flags });
  }
  return { college: collegeCode, programme: programmeName, total, page: current, pageSize, pages, rows };
}
