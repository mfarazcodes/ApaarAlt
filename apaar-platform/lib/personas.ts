/** Demo identities for the one-click login. Safe to ship to the browser: no secrets, no ID numbers. */

export type Role = "STUDENT" | "GUARDIAN" | "REGISTRAR" | "AICTE" | "VERIFIER";

export interface Persona {
  id: string;
  role: Role;
  name: string;
  blurb: string;
  home: "/student" | "/admin" | "/employer";
  studentId?: string;
  verifierId?: string;
}

export const PERSONAS: Persona[] = [
  { id: "student-rahul", role: "STUDENT", name: "Rahul K.V.", blurb: "Adult student. Digital twin, consent wallet, dispute portal.", home: "/student", studentId: "STU-RKV" },
  { id: "student-meera", role: "STUDENT", name: "Meera S. (age 16)", blurb: "A minor. Every grant needs her guardian's co-sign first.", home: "/student", studentId: "STU-MS" },
  { id: "guardian-meera", role: "GUARDIAN", name: "Sunita S. (Meera's mother)", blurb: "Co-signs, or withdraws, consent for Meera.", home: "/student", studentId: "STU-MS" },
  { id: "registrar", role: "REGISTRAR", name: "Registrar, Vindhya Institute", blurb: "Syncs marksheets, resolves name mismatches, handles disputes.", home: "/admin" },
  { id: "aicte", role: "AICTE", name: "AICTE officer", blurb: "National compliance view, flagged cases and the audit trail.", home: "/admin" },
  { id: "verifier-acme", role: "VERIFIER", name: "Acme Cloud HR", blurb: "Employer. Verifies credentials, asks students for consent.", home: "/employer", verifierId: "VRF-ACME" },
  { id: "verifier-finserve", role: "VERIFIER", name: "FinServe Bank HR", blurb: "A second employer, to show consent is per verifier.", home: "/employer", verifierId: "VRF-FINSERVE" },
];

export const ROLE_LABEL: Record<Role, string> = {
  STUDENT: "Student",
  GUARDIAN: "Guardian",
  REGISTRAR: "Registrar",
  AICTE: "AICTE officer",
  VERIFIER: "Verifier",
};

/** Which pages each role may open. */
export const PAGE_ACCESS: Record<"/student" | "/admin" | "/employer", Role[]> = {
  "/student": ["STUDENT", "GUARDIAN"],
  "/admin": ["REGISTRAR", "AICTE"],
  "/employer": ["VERIFIER"],
};
