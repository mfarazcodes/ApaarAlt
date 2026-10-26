import type { DiscrepancyProfile, EnrolmentRecord, StudentDemographicRecord } from "./fuzzyMatcher";

/** Sample data for the admin console. All people and institutions are fictional. */

export interface PresetCase {
  id: string;
  studentRoll: string;
  institution: string;
  erp: StudentDemographicRecord;
  digilocker: StudentDemographicRecord;
  notes: string;
}

export const PRESET_AICTE_CASES: PresetCase[] = [
  {
    id: "CASE-01",
    studentRoll: "2023-CS-051",
    institution: "Vindhya Institute of Technology",
    erp: { name: "Rahul Kumar", dob: "2004-05-14", gender: "M", guardianName: "Satish Kumar", source: "ERP" },
    digilocker: { name: "Rahul K.", dob: "2004-05-14", gender: "M", guardianName: "Satish Kumar", source: "DIGILOCKER" },
    notes: "Surname abbreviated to an initial in the government record.",
  },
  {
    id: "CASE-02",
    studentRoll: "2023-EC-062",
    institution: "Sahyadri College of Engineering",
    erp: { name: "Mohd Faraz", dob: "2004-02-11", gender: "M", guardianName: "Abdul Rahim", source: "ERP" },
    digilocker: { name: "Mohammad Faraz", dob: "2004-02-11", gender: "M", guardianName: "Abdul Rahim", source: "DIGILOCKER" },
    notes: "Mohd and Mohammad are the same name part. Treated as a spelling variant, not dropped.",
  },
  {
    id: "CASE-03",
    studentRoll: "2023-CS-041",
    institution: "Vindhya Institute of Technology",
    erp: { name: "K. V. Rahul", dob: "2004-05-14", gender: "M", guardianName: "K. Satyanarayana", source: "ERP" },
    digilocker: { name: "Koppula Venkat Rahul", dob: "2004-05-14", gender: "M", guardianName: "Koppula Satyanarayana", source: "DIGILOCKER" },
    notes: "South Indian initial expansion ('K. V.' to 'Koppula Venkat').",
  },
  {
    id: "CASE-04",
    studentRoll: "2023-ME-112",
    institution: "Kaveri Polytechnic & Engineering",
    erp: { name: "Lakshmi Priya S.", dob: "2005-11-20", gender: "F", guardianName: "Sundaramurthy", source: "ERP" },
    digilocker: { name: "Laxmi Priya Sundaramurthy", dob: "2005-11-20", gender: "F", guardianName: "Sundaramurthy M", source: "DIGILOCKER" },
    notes: "Transliteration (Lakshmi / Laxmi) plus a patronymic expanded from an initial.",
  },
  {
    id: "CASE-05",
    studentRoll: "2023-CE-015",
    institution: "Konkan Technical Campus",
    erp: { name: "Divya Nambiar", dob: "2005-04-06", gender: "F", guardianName: "Radhakrishnan Nambiar", source: "ERP" },
    digilocker: { name: "Divya Radhakrishnan", dob: "2005-06-04", gender: "F", guardianName: "Radhakrishnan", source: "DIGILOCKER" },
    notes: "Father's name used as surname, and day and month swapped in the date of birth.",
  },
  {
    id: "CASE-06",
    studentRoll: "2023-EE-024",
    institution: "Thar Engineering University",
    erp: { name: "Ananya Banerjee", dob: "2004-12-09", gender: "F", guardianName: "Subhash Banerjee", source: "ERP" },
    digilocker: { name: "Ananya Banerjee", dob: "2004-12-09", gender: "F", guardianName: "Subhash Banerjee", source: "DIGILOCKER" },
    notes: "Exact match on every field. Nothing to review.",
  },
  {
    id: "CASE-07",
    studentRoll: "2023-IT-077",
    institution: "Brahmaputra Institute of Technology",
    erp: { name: "Aman Verma", dob: "2004-03-12", gender: "M", guardianName: "Rakesh Verma", source: "ERP" },
    digilocker: { name: "Vikramaditya Rathore", dob: "2002-09-28", gender: "M", guardianName: "Bhopal Singh", source: "DIGILOCKER" },
    notes: "Different person or a mislinked record. Hard reject.",
  },
];

export const SAMPLE_DISCREPANCY_PROFILE: DiscrepancyProfile = {
  studentLabel: "STU-7F3A",
  semesters: [
    { semester: 1, sgpa: 8.1 },
    { semester: 2, sgpa: 8.3 },
    { semester: 3, sgpa: 5.4 },
    { semester: 4, sgpa: 8.9 },
  ],
  internships: [
    { org: "TechNova Labs", start: "2024-05-20", end: "2024-07-15", mode: "ONSITE" },
    { org: "DataBridge Systems", start: "2024-06-10", end: "2024-08-10", mode: "REMOTE" },
  ],
  examWindows: [{ label: "Semester 4 end-term exams", start: "2024-05-27", end: "2024-06-12" }],
};

export const SAMPLE_ENROLMENTS: EnrolmentRecord[] = [
  {
    college: "Vindhya Institute of Technology",
    collegeCode: "DEMO-0001",
    program: "B.Tech Electrical",
    name: "Ananya Banerjee",
    dob: "2004-12-09",
    guardianName: "Subhash Banerjee",
    apaarToken: "VAULT-APA-3F2A-91BC-77D0-12EE",
    start: "2023-08-01",
    end: "2027-06-30",
  },
  {
    college: "Brahmaputra Institute of Technology",
    collegeCode: "DEMO-0004",
    program: "B.Sc Physics",
    name: "Ananya Banerjee",
    dob: "2004-12-09",
    guardianName: "Subhash Banerjee",
    apaarToken: "VAULT-APA-3F2A-91BC-77D0-12EE",
    start: "2023-08-10",
    end: "2026-06-30",
  },
  {
    college: "Sahyadri College of Engineering",
    collegeCode: "DEMO-0002",
    program: "B.Tech Electronics",
    name: "Mohd Faraz",
    dob: "2004-02-11",
    guardianName: "Abdul Rahim",
    start: "2023-08-01",
    end: "2027-06-30",
  },
  {
    college: "Kaveri Polytechnic & Engineering",
    collegeCode: "DEMO-0003",
    program: "B.Tech Computer Science",
    name: "Mohammad Faraz",
    dob: "2004-02-11",
    guardianName: "Abdul Rahim",
    start: "2023-08-14",
    end: "2027-06-30",
  },
  {
    college: "Thar Engineering University",
    collegeCode: "DEMO-0005",
    program: "B.Tech Civil",
    name: "Divya Nambiar",
    dob: "2000-04-06",
    start: "2019-08-01",
    end: "2023-06-30",
  },
  {
    college: "Konkan Technical Campus",
    collegeCode: "DEMO-0006",
    program: "M.Tech Structures",
    name: "Divya Nambiar",
    dob: "2000-04-06",
    start: "2023-08-01",
    end: "2025-06-30",
  },
  {
    college: "Vindhya Institute of Technology",
    collegeCode: "DEMO-0001",
    program: "B.Tech Mechanical",
    name: "Aman Verma",
    dob: "2004-03-12",
    start: "2023-08-01",
    end: "2027-06-30",
  },
  {
    college: "Thar Engineering University",
    collegeCode: "DEMO-0005",
    program: "B.Tech Mechanical",
    name: "Vikramaditya Rathore",
    dob: "2002-09-28",
    start: "2023-08-01",
    end: "2027-06-30",
  },
];

export interface GhostCandidate {
  token: string;
  college: string;
  program: string;
  reasons: string[];
}

/** ERP-enrolled students with no matching verified identity. Reasons are listed so a reviewer can judge them. */
export const SAMPLE_GHOST_CANDIDATES: GhostCandidate[] = [
  {
    token: "STU-C41D",
    college: "Brahmaputra Institute of Technology",
    program: "B.Tech Civil",
    reasons: ["No APAAR token linked", "No attendance recorded in 94 days", "Fee paid by a third-party account"],
  },
  {
    token: "STU-9A02",
    college: "Brahmaputra Institute of Technology",
    program: "B.Tech Mechanical",
    reasons: ["No APAAR token linked", "Same bank account paid fees for 4 other students"],
  },
  {
    token: "STU-E17B",
    college: "Kaveri Polytechnic & Engineering",
    program: "Diploma Electrical",
    reasons: ["APAAR token linked to a different college's active enrolment"],
  },
];
