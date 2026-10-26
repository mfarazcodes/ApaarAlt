import { tenantSalt, tokenizeDemographicId } from "./tokenization";

/**
 * The student directory. Server-side only: it holds dates of birth.
 * All people are fictional. The APAAR numbers are made-up demo values, and are only ever tokenized.
 */

export interface StudentRecord {
  id: string;
  name: string;
  roll: string;
  /** Minor status is derived from this, never from a switch the student controls. */
  dob: string;
  guardianName: string;
  demoApaarId: string;
}

export const STUDENTS: StudentRecord[] = [
  { id: "STU-RKV", name: "Rahul K.V.", roll: "2023-CS-041", dob: "2004-05-14", guardianName: "K. Satyanarayana", demoApaarId: "948120416672" },
  { id: "STU-MS", name: "Meera S.", roll: "2025-CS-118", dob: "2010-03-02", guardianName: "Sunita S.", demoApaarId: "731855209044" },
];

export const findStudent = (id: string) => STUDENTS.find((s) => s.id === id);

/** Whole years between dob and now. */
export function ageOn(dob: string, now: Date = new Date()): number {
  const d = new Date(dob);
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export const isMinor = (dob: string, now?: Date) => ageOn(dob, now) < 18;

export const apaarTokenFor = (s: StudentRecord) => tokenizeDemographicId(s.demoApaarId, "APAAR", tenantSalt()).vaultToken;

/** The student a vault token belongs to, or undefined. */
export function studentForToken(token: string): StudentRecord | undefined {
  return STUDENTS.find((s) => apaarTokenFor(s) === token);
}

/** The student whose APAAR ID this is. The raw ID is hashed here and never kept. */
export function studentForApaarId(rawId: string): StudentRecord | undefined {
  const token = tokenizeDemographicId(rawId, "APAAR", tenantSalt()).vaultToken;
  return studentForToken(token);
}
