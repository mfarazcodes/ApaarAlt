import { parseCsv, type RawRow } from "./csv";
import {
  SAMPLE_MESSY_ERP_CSV,
  calculateInstitutionCompliance,
  pickField,
  processStudentSemesterRecord,
  type InstitutionMeta,
  type NADStudentRecord,
  type PriorSummary,
  type ProgrammeIntake,
} from "./nadSyncEngine";
import { NS, type Store } from "./store/types";
import { tenantSalt, tokenizeDemographicId } from "./tokenization";

/** The college's NAD sync state: institution details, programme intake, and the students synced so far. */

export interface SyncState {
  meta: InstitutionMeta;
  programmes: ProgrammeIntake[];
  students: NADStudentRecord[];
}

const PROGRAMME_BY_CODE: Record<string, { programme: string; program: string }> = {
  CS: { programme: "Computer Science", program: "B.Tech Computer Science & Engineering" },
  EC: { programme: "Electronics & Comm.", program: "B.Tech Electronics & Communication" },
  ME: { programme: "Mechanical", program: "B.Tech Mechanical & Mechatronics" },
  CE: { programme: "Civil", program: "B.Tech Civil Engineering" },
  EE: { programme: "Electrical", program: "B.Tech Electrical Engineering" },
};

export const programmeFor = (roll: string) => PROGRAMME_BY_CODE[roll.split("-")[1] ?? ""] ?? { programme: "Other", program: "B.Tech" };
export const tokenFor = (roll: string) => tokenizeDemographicId(roll, "STUDENT_ROLL", tenantSalt()).vaultToken;

export function groupByRoll(rows: RawRow[]): Record<string, RawRow[]> {
  const grouped: Record<string, RawRow[]> = {};
  for (const r of rows) (grouped[pickField(r, "rollNumber") ?? "UNKNOWN-ROLL"] ??= []).push(r);
  return grouped;
}

const SEED_PRIORS: Record<string, PriorSummary> = {
  "2023-CS-041": { creditsEarned: 82, creditsRegistered: 82, gradePoints: 82 * 8.8 },
  "2023-ME-112": { creditsEarned: 78, creditsRegistered: 78, gradePoints: 78 * 8.4 },
};

export function seedState(): SyncState {
  const students: NADStudentRecord[] = Object.entries(groupByRoll(parseCsv(SAMPLE_MESSY_ERP_CSV).rows)).map(([roll, rows]) =>
    processStudentSemesterRecord({
      studentRoll: roll,
      studentName: (pickField(rows[0], "studentName") ?? "Student").replace(/["']/g, ""),
      abcAccountId: pickField(rows[0], "abcId") ?? "ABC-PENDING",
      apaarToken: tokenFor(roll),
      program: programmeFor(roll).program,
      semester: 5,
      academicYear: "2024-25",
      rows,
      prior: SEED_PRIORS[roll] ?? null,
    })
  );
  return {
    meta: {
      institutionCode: "AICTE-DEMO-0001",
      institutionName: "Vindhya Institute of Technology",
      aicteApprovalReference: "AICTE/EOA/2024-25/DEMO-0001",
      academicYear: "2024-25",
    },
    // Start-of-year figures. They add up to 1,200 approved, 1,180 enrolled, 1,148 verified, 1,120 ABC seeded.
    programmes: [
      { programme: "Computer Science", approvedIntake: 360, erpEnrolled: 362, verified: 354, abcSeeded: 350 },
      { programme: "Electronics & Comm.", approvedIntake: 240, erpEnrolled: 236, verified: 228, abcSeeded: 220 },
      { programme: "Mechanical", approvedIntake: 240, erpEnrolled: 231, verified: 221, abcSeeded: 214 },
      { programme: "Civil", approvedIntake: 180, erpEnrolled: 176, verified: 173, abcSeeded: 169 },
      { programme: "Electrical", approvedIntake: 180, erpEnrolled: 175, verified: 172, abcSeeded: 167 },
    ],
    students,
  };
}

export async function readState(store: Store): Promise<SyncState> {
  const existing = await store.get<SyncState>(NS.sync, "state");
  if (existing) return existing;
  return store.update<SyncState, SyncState>(NS.sync, "state", (cur) => {
    const state = cur ?? seedState();
    return { value: state, result: state };
  });
}

export const complianceOf = (s: SyncState) => calculateInstitutionCompliance(s.programmes, s.meta);

