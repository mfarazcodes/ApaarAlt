import type { TwinSemester } from "./studentData";

/** Skill-to-curriculum gap map in the style of roadmap.sh: a role is a weighted list of skills. */

export const SKILLS: Record<string, string> = {
  linux: "Linux & shell",
  networking: "Networking",
  cloud: "Cloud platforms",
  containers: "Containers (Docker)",
  iac: "Infrastructure as code",
  scripting: "Scripting & automation",
  security: "Security basics",
  distsys: "Distributed systems",
  databases: "Databases",
  cicd: "CI/CD",
  sql: "SQL",
  statistics: "Statistics",
  python: "Python",
  datamining: "Data mining",
  dataviz: "Data visualisation",
  ml: "Machine learning",
  bi: "BI dashboards",
  comms: "Communication",
  c: "C programming",
  digital: "Digital logic",
  coa: "Computer architecture",
  rtos: "RTOS / embedded software",
  iot: "IoT systems",
  micro: "Microcontrollers",
  electronics: "Electronics basics",
  sensors: "Sensors & interfacing",
};

export interface RoleSkill {
  skill: keyof typeof SKILLS;
  weight: number;
}

export interface Role {
  id: string;
  label: string;
  skills: RoleSkill[];
}

export const ROLES: Role[] = [
  {
    id: "cloud",
    label: "Cloud Engineer",
    skills: [
      { skill: "linux", weight: 12 },
      { skill: "networking", weight: 10 },
      { skill: "cloud", weight: 18 },
      { skill: "containers", weight: 14 },
      { skill: "iac", weight: 10 },
      { skill: "scripting", weight: 8 },
      { skill: "security", weight: 8 },
      { skill: "distsys", weight: 8 },
      { skill: "databases", weight: 6 },
      { skill: "cicd", weight: 6 },
    ],
  },
  {
    id: "data",
    label: "Data Analyst",
    skills: [
      { skill: "sql", weight: 18 },
      { skill: "statistics", weight: 16 },
      { skill: "python", weight: 16 },
      { skill: "datamining", weight: 12 },
      { skill: "dataviz", weight: 14 },
      { skill: "ml", weight: 8 },
      { skill: "bi", weight: 10 },
      { skill: "comms", weight: 6 },
    ],
  },
  {
    id: "iot",
    label: "Embedded / IoT Engineer",
    skills: [
      { skill: "c", weight: 18 },
      { skill: "digital", weight: 10 },
      { skill: "coa", weight: 10 },
      { skill: "rtos", weight: 16 },
      { skill: "iot", weight: 14 },
      { skill: "micro", weight: 14 },
      { skill: "electronics", weight: 8 },
      { skill: "sensors", weight: 10 },
    ],
  },
];

/** Suggested ways to close a gap. These are course topics to look for, not endorsements of a specific listing. */
export const GAP_SUGGESTIONS: Record<string, { title: string; via: string; credits: number }> = {
  containers: { title: "Containers and orchestration basics", via: "SWAYAM / NPTEL", credits: 3 },
  iac: { title: "Infrastructure as code", via: "SWAYAM / NPTEL", credits: 3 },
  cicd: { title: "CI/CD pipelines", via: "Open elective", credits: 3 },
  scripting: { title: "Python for automation", via: "SWAYAM / NPTEL", credits: 3 },
  python: { title: "Programming in Python", via: "SWAYAM / NPTEL", credits: 3 },
  dataviz: { title: "Data visualisation", via: "SWAYAM / NPTEL", credits: 3 },
  bi: { title: "Business intelligence tools", via: "Open elective", credits: 3 },
  rtos: { title: "Real-time operating systems", via: "Professional elective", credits: 3 },
  micro: { title: "Microcontrollers and embedded C", via: "SWAYAM / NPTEL", credits: 3 },
  sql: { title: "Advanced SQL", via: "Open elective", credits: 3 },
};

export type SkillStatus = "COVERED" | "IN_PLAN" | "GAP";

export interface SkillResult {
  skill: string;
  label: string;
  weight: number;
  status: SkillStatus;
  evidence: string[];
}

export interface ReadinessResult {
  role: Role;
  skills: SkillResult[];
  coverage: number; // 0 - 100, weighted
  score: number; // 0 - 100 placement readiness
  gaps: SkillResult[];
  breakdown: { label: string; weight: number; value: number }[];
}

/** Which skills a student already has, and where the evidence comes from. */
function collectEvidence(twin: TwinSemester[]): { done: Map<string, string[]>; planned: Map<string, string[]> } {
  const done = new Map<string, string[]>();
  const planned = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, skills: string[], from: string) =>
    skills.forEach((s) => m.set(s, [...(m.get(s) ?? []), from]));

  for (const sem of twin) {
    const target = sem.status === "COMPLETED" ? done : planned;
    sem.courses.forEach((c) => add(target, c.skills, c.title));
    sem.internships.forEach((i) => add(done, i.skills, `Internship: ${i.org}`));
    sem.certificates.forEach((c) => add(done, c.skills, `${c.issuer}: ${c.title}`));
  }
  return { done, planned };
}

export function assessReadiness(role: Role, twin: TwinSemester[], cgpa: number, internshipCount: number): ReadinessResult {
  const { done, planned } = collectEvidence(twin);

  const skills: SkillResult[] = role.skills.map(({ skill, weight }) => {
    const have = done.get(skill);
    const soon = planned.get(skill);
    return {
      skill,
      label: SKILLS[skill],
      weight,
      status: have ? "COVERED" : soon ? "IN_PLAN" : "GAP",
      evidence: have ?? soon ?? [],
    };
  });

  const total = skills.reduce((n, s) => n + s.weight, 0);
  const covered = skills.reduce((n, s) => n + (s.status === "COVERED" ? s.weight : s.status === "IN_PLAN" ? s.weight * 0.5 : 0), 0);
  const coverage = Math.round((covered / total) * 100);
  const internshipScore = Math.min(100, internshipCount * 50);

  const breakdown = [
    { label: "Skill coverage", weight: 60, value: coverage },
    { label: "CGPA", weight: 20, value: Math.round(cgpa * 10) },
    { label: "Internship experience", weight: 20, value: internshipScore },
  ];
  const score = Math.round(breakdown.reduce((n, b) => n + (b.value * b.weight) / 100, 0));

  return { role, skills, coverage, score, gaps: skills.filter((s) => s.status === "GAP"), breakdown };
}
