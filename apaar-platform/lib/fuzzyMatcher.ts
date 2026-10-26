/**
 * Pre-Flight Fuzzy Matcher
 *
 * Solves the AICTE bottleneck of demographic divergence between College ERP records and
 * DigiLocker / Aadhaar e-KYC records. It answers two different questions:
 *
 * 1. sameIdentityConfidence (0-100): how likely are these two records the same person?
 *    Jaro-Winkler, Indian initial expansion, honorific stripping, token matching, DOB, gender, guardian.
 *    Used for review queues and duplicate detection.
 * 2. apiWillAccept: would the government check accept the ERP record as it is? That check compares
 *    against the Aadhaar record literally, so only case, spacing and punctuation may differ.
 *    A record can be clearly the same person and still be rejected by the API.
 *
 * Classification:
 *   EXACT_MATCH          the API will accept it as is
 *   AUTO_FIXABLE         same person, only the name spelling differs; a one-click correction is suggested
 *   SOFT_MISMATCH_REVIEW plausible match that a person must confirm (65-94, or relies on initials / a DOB difference)
 *   HARD_REJECT          below 65
 */

export type MatchClassification = "EXACT_MATCH" | "AUTO_FIXABLE" | "SOFT_MISMATCH_REVIEW" | "HARD_REJECT";

export interface StudentDemographicRecord {
  name: string;
  dob: string; // YYYY-MM-DD or DD/MM/YYYY
  gender?: string; // M, F, O, MALE, FEMALE
  guardianName?: string;
  source: "ERP" | "DIGILOCKER" | "E_KYC";
}

export interface ApiAcceptance {
  name: boolean;
  dob: boolean;
  /** Null when either side has no gender, so it could not be compared. */
  gender: boolean | null;
  all: boolean;
}

export interface SuggestedFix {
  field: "name";
  from: string;
  to: string;
  text: string;
}

export interface MatchScoreBreakdown {
  rawNameJaroWinkler: number; // 0 - 1
  initialExpansionScore: number; // 0 - 1, the name score after initial and token logic
  tokenSetScore: number; // 0 - 1, share of distinct name tokens that agree
  nameFinalScore: number; // 0 - 100
  dobScore: number | null; // 0 - 100, null when a side has no DOB
  genderScore: number | null;
  guardianScore: number | null;
  sameIdentityConfidence: number; // 0 - 100
  overallConfidence: number; // alias of sameIdentityConfidence
  apiWillAccept: ApiAcceptance;
  classification: MatchClassification;
  suggestedFixes: SuggestedFix[];
  discrepancies: string[];
  reconciliationNotes: string[];
}

// True honorifics carry no identity information, so they are dropped.
const HONORIFICS = new Set([
  "mr", "mrs", "ms", "miss", "dr", "prof", "shri", "shree", "sri", "smt", "shrimati", "kumari", "km",
]);

// Abbreviations and transliterations of the same name part. These are mapped to one spelling
// instead of being dropped, so "Mohd Faraz" still differs from "Faraz" but equals "Mohammad Faraz".
const CANONICAL_TOKENS: Record<string, string> = {
  mohd: "mohammad",
  md: "mohammad",
  mohammed: "mohammad",
  muhammad: "mohammad",
  mohamed: "mohammad",
  laxmi: "lakshmi",
  lakshmi: "lakshmi",
};

const PUNCTUATION = /[.,\-/#!$%^&*;:{}=_`~()]/g;

/**
 * Normalizes an Indian name: strips honorifics and punctuation, canonicalizes known
 * spelling variants, collapses whitespace and lowercases.
 */
export function normalizeName(name: string): string[] {
  if (!name) return [];
  const clean = name.toLowerCase().replace(PUNCTUATION, " ").replace(/\s+/g, " ").trim();
  const all = clean.split(" ").filter((t) => t.length > 0);
  const tokens = all.filter((t) => !HONORIFICS.has(t));
  return (tokens.length > 0 ? tokens : all).map((t) => CANONICAL_TOKENS[t] ?? t);
}

/** What the government check sees: only case, spacing and punctuation are ignored. Nothing else. */
export function literalName(name: string): string {
  return (name ?? "").toLowerCase().replace(PUNCTUATION, " ").replace(/\s+/g, " ").trim();
}

/**
 * Standard Jaro Distance algorithm
 */
export function jaroDistance(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1.length || !s2.length) return 0.0;

  // The window is never negative, so one- and two-character strings still match.
  const matchWindow = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) {
      k++;
    }
    if (s1[i] !== s2[k]) {
      transpositions++;
    }
    k++;
  }

  return (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3.0;
}

/**
 * Jaro-Winkler Distance: extends Jaro with prefix bonus (p = 0.1, max 4 chars)
 */
export function jaroWinkler(s1: string, s2: string, p = 0.1): number {
  const jaro = jaroDistance(s1, s2);
  if (jaro < 0.7) return jaro;

  let prefixLength = 0;
  const maxPrefix = Math.min(4, Math.min(s1.length, s2.length));
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) {
      prefixLength++;
    } else {
      break;
    }
  }

  return jaro + prefixLength * p * (1 - jaro);
}

/**
 * Checks if a single character initial matches a full token (e.g. "k" matches "koppula")
 */
function initialMatches(initial: string, word: string): boolean {
  if (initial.length === 1 && word.length >= 1) {
    return initial[0] === word[0];
  }
  return false;
}

/** A name that matched only because an initial stood in for a word is never scored above this. */
export const INITIAL_ONLY_CAP = 0.9;

export interface NameComparison {
  score: number; // 0 - 1
  notes: string[];
  /** True when at least one token matched only because an initial was expanded. */
  usedInitials: boolean;
  /** Share of distinct normalized tokens the two names have in common (0 - 1). */
  tokenSetScore: number;
}

/**
 * Indian initial expansion and token set similarity.
 * Resolves South and North Indian naming nuances:
 * - "K. V. Rahul" vs "Rahul K V" vs "Koppula Venkat Rahul"
 * - "S. Lakshmi" vs "Lakshmi Someshwar"
 * - Transposed family names vs given names
 *
 * A match that depends on an initial is capped at INITIAL_ONLY_CAP, because "A Kumar" fits both
 * "Anil Kumar" and "Amit Kumar". A person has to confirm it against a document.
 */
export function compareIndianNamesWithInitialExpansion(nameA: string, nameB: string): NameComparison {
  const tokensA = normalizeName(nameA);
  const tokensB = normalizeName(nameB);

  if (!tokensA.length || !tokensB.length) {
    return { score: 0, notes: ["One or both names are empty after normalization."], usedInitials: false, tokenSetScore: 0 };
  }

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const union = new Set([...setA, ...setB]);
  const tokenSetScore = [...setA].filter((t) => setB.has(t)).length / union.size;

  const strA = tokensA.join(" ");
  const strB = tokensB.join(" ");

  if (strA === strB) {
    return {
      score: 1.0,
      notes: ["Exact string match after honorific, spelling-variant (Mohd/Md → Mohammad) and whitespace normalization."],
      usedInitials: false,
      tokenSetScore,
    };
  }

  // Token sort match (e.g., "Rahul Sharma" vs "Sharma Rahul")
  if ([...tokensA].sort().join(" ") === [...tokensB].sort().join(" ")) {
    return { score: 0.98, notes: ["Exact match under token transposition (first/last name reversed)."], usedInitials: false, tokenSetScore };
  }

  const notes: string[] = [];
  const matchedA = new Set<number>();
  const matchedB = new Set<number>();
  let usedInitials = false;

  // 1. Exact token matches first
  for (let i = 0; i < tokensA.length; i++) {
    for (let j = 0; j < tokensB.length; j++) {
      if (matchedB.has(j)) continue;
      if (tokensA[i] === tokensB[j]) {
        matchedA.add(i);
        matchedB.add(j);
        break;
      }
    }
  }

  // 2. Initial-to-word expansions
  for (let i = 0; i < tokensA.length; i++) {
    if (matchedA.has(i)) continue;
    for (let j = 0; j < tokensB.length; j++) {
      if (matchedB.has(j)) continue;

      if (initialMatches(tokensA[i], tokensB[j])) {
        matchedA.add(i);
        matchedB.add(j);
        usedInitials = true;
        notes.push(`Initial expansion: '${tokensA[i].toUpperCase()}.' matches '${tokensB[j]}'.`);
        break;
      } else if (initialMatches(tokensB[j], tokensA[i])) {
        matchedA.add(i);
        matchedB.add(j);
        usedInitials = true;
        notes.push(`Initial expansion: '${tokensB[j].toUpperCase()}.' matches '${tokensA[i]}'.`);
        break;
      }
    }
  }

  // 3. High-confidence fuzzy match for remaining unmatched tokens
  for (let i = 0; i < tokensA.length; i++) {
    if (matchedA.has(i)) continue;
    let bestJ = -1;
    let bestScore = 0;
    for (let j = 0; j < tokensB.length; j++) {
      if (matchedB.has(j)) continue;
      const jw = jaroWinkler(tokensA[i], tokensB[j]);
      if (jw > bestScore && jw >= 0.85) {
        bestScore = jw;
        bestJ = j;
      }
    }
    if (bestJ !== -1) {
      matchedA.add(i);
      matchedB.add(bestJ);
      notes.push(`Phonetic/typo match: '${tokensA[i]}' ~ '${tokensB[bestJ]}' (${Math.round(bestScore * 100)}% JW).`);
    }
  }

  const totalTokens = Math.max(tokensA.length, tokensB.length);
  const tokenMatchRatio = Math.min(matchedA.size, matchedB.size) / totalTokens;
  const rawJw = jaroWinkler(strA, strB);
  let score = Math.max(rawJw, tokenMatchRatio * 0.95);

  if (usedInitials && score > INITIAL_ONLY_CAP) {
    score = INITIAL_ONLY_CAP;
    notes.push("Initial-only match: an initial stood in for a full word, so the score is capped. Confirm against a document.");
  }
  return { score, notes, usedInitials, tokenSetScore };
}

/** True when y-m-d is a real calendar date (rejects 31 Feb, month 13 and so on). */
export function isRealDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/**
 * Normalizes date of birth strings (handles YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY).
 * The result is not guaranteed to be a real date. Use isRealDate.
 */
export function normalizeDOB(dobStr: string): string {
  if (!dobStr) return "";
  const clean = dobStr.trim().replace(/[/.]/g, "-");
  const parts = clean.split("-");

  // Format: YYYY-MM-DD
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
  }

  // Format: DD-MM-YYYY
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }

  return clean;
}

export interface DobComparison {
  /** Null when either side is blank, so the field is left out of the confidence. */
  score: number | null;
  note?: string;
  literal: boolean; // both real dates and equal
}

export function compareDOB(dobA: string, dobB: string): DobComparison {
  const normA = normalizeDOB(dobA);
  const normB = normalizeDOB(dobB);

  if (!normA || !normB) {
    return { score: null, note: "Date of birth is missing on one side, so it was not compared.", literal: false };
  }
  if (!isRealDate(normA) || !isRealDate(normB)) {
    const bad = !isRealDate(normA) ? dobA : dobB;
    return { score: 0, note: `Date of birth '${bad}' is not a real calendar date.`, literal: false };
  }
  if (normA === normB) return { score: 100, note: "Date of Birth matches exactly.", literal: true };

  // Day and month swapped (e.g. 2004-05-04 vs 2004-04-05)
  const [yA, mA, dA] = normA.split("-");
  const [yB, mB, dB] = normB.split("-");
  if (yA === yB && mA === dB && dA === mB) {
    return { score: 80, note: "Likely DD/MM vs MM/DD transposition error between ERP and DigiLocker.", literal: false };
  }
  if (yA === yB) return { score: 55, note: "Birth year matches, but day or month differs.", literal: false };
  return { score: 0, note: `DOB discrepancy: ERP (${dobA}) vs DigiLocker (${dobB}).`, literal: false };
}

export function compareGender(gA?: string, gB?: string): { score: number | null; note?: string } {
  if (!gA?.trim() || !gB?.trim()) return { score: null, note: "Gender is missing on one side, so it was not compared." };

  const cleanA = gA.trim().toUpperCase()[0];
  const cleanB = gB.trim().toUpperCase()[0];
  if (cleanA === cleanB) return { score: 100, note: "Gender matches." };
  return { score: 0, note: `Gender divergence: ERP (${gA}) vs DigiLocker (${gB}).` };
}

const WEIGHTS = { name: 55, dob: 35, gender: 10, guardian: 15 } as const;

/**
 * Core pre-flight matcher pipeline. `erp` is what the college holds; `digilocker` is the
 * government record the API will compare against.
 */
export function runPreFlightFuzzyMatch(erp: StudentDemographicRecord, digilocker: StudentDemographicRecord): MatchScoreBreakdown {
  const discrepancies: string[] = [];
  const reconciliationNotes: string[] = [];

  // 1. Name
  const rawJw = jaroWinkler(erp.name.toLowerCase(), digilocker.name.toLowerCase());
  const nameResult = compareIndianNamesWithInitialExpansion(erp.name, digilocker.name);
  reconciliationNotes.push(...nameResult.notes);
  const nameScore = Math.round(nameResult.score * 100);
  const nameLiteral = literalName(erp.name) === literalName(digilocker.name) && literalName(erp.name) !== "";
  if (!nameLiteral) {
    discrepancies.push(`Name differs: ERP '${erp.name}' vs DigiLocker '${digilocker.name}' (${nameScore}% similar)`);
  }

  // 2. DOB
  const dob = compareDOB(erp.dob, digilocker.dob);
  if (dob.note) (dob.literal ? reconciliationNotes : discrepancies).push(dob.note);

  // 3. Gender
  const gender = compareGender(erp.gender, digilocker.gender);
  if (gender.note) (gender.score === 100 || gender.score === null ? reconciliationNotes : discrepancies).push(gender.note);

  // 4. Guardian (only when both sides have it)
  let guardianScore: number | null = null;
  if (erp.guardianName?.trim() && digilocker.guardianName?.trim()) {
    guardianScore = Math.round(compareIndianNamesWithInitialExpansion(erp.guardianName, digilocker.guardianName).score * 100);
    if (guardianScore < 100) {
      discrepancies.push(`Guardian name differs: ERP '${erp.guardianName}' vs DigiLocker '${digilocker.guardianName}'`);
    } else {
      reconciliationNotes.push("Guardian name validated.");
    }
  }

  // 5. Confidence. A missing field leaves the average. It never counts as a perfect match.
  const parts: { w: number; score: number }[] = [{ w: WEIGHTS.name, score: nameScore }];
  if (dob.score !== null) parts.push({ w: WEIGHTS.dob, score: dob.score });
  if (gender.score !== null) parts.push({ w: WEIGHTS.gender, score: gender.score });
  if (guardianScore !== null) parts.push({ w: WEIGHTS.guardian, score: guardianScore });
  const totalWeight = parts.reduce((n, p) => n + p.w, 0);
  const sameIdentityConfidence = Math.round(parts.reduce((n, p) => n + p.w * p.score, 0) / totalWeight);

  // 6. Would the API accept the ERP record as it is?
  const apiWillAccept: ApiAcceptance = {
    name: nameLiteral,
    dob: dob.literal,
    gender: gender.score === null ? null : gender.score === 100,
    all: false,
  };
  apiWillAccept.all = apiWillAccept.name && apiWillAccept.dob && apiWillAccept.gender !== false;

  // 7. Classification
  const suggestedFixes: SuggestedFix[] = [];
  let classification: MatchClassification;
  if (apiWillAccept.all) {
    classification = "EXACT_MATCH";
  } else if (sameIdentityConfidence >= 95 && dob.literal && apiWillAccept.gender !== false && !nameResult.usedInitials) {
    // Same person, and the only difference is how the name is spelled. Aadhaar is the source of truth.
    classification = "AUTO_FIXABLE";
    suggestedFixes.push({
      field: "name",
      from: erp.name,
      to: digilocker.name,
      text: `Change ERP name to '${digilocker.name}' to match the Aadhaar record.`,
    });
  } else if (sameIdentityConfidence >= 65) {
    classification = "SOFT_MISMATCH_REVIEW";
  } else {
    classification = "HARD_REJECT";
  }

  return {
    rawNameJaroWinkler: Math.round(rawJw * 100) / 100,
    initialExpansionScore: Math.round(nameResult.score * 100) / 100,
    tokenSetScore: Math.round(nameResult.tokenSetScore * 100) / 100,
    nameFinalScore: nameScore,
    dobScore: dob.score,
    genderScore: gender.score,
    guardianScore,
    sameIdentityConfidence,
    overallConfidence: sameIdentityConfidence,
    apiWillAccept,
    classification,
    suggestedFixes,
    discrepancies,
    reconciliationNotes,
  };
}

/* ══════════════════════════════════════════════════════════════════════
 * AI Data-Discrepancy Flags
 * Rule-based and fully explainable: every flag carries the evidence that
 * triggered it, so a registrar can accept or dismiss it with context.
 * ══════════════════════════════════════════════════════════════════════ */

export type DiscrepancyType = "GRADE_JUMP" | "DUPLICATE_ENROLMENT" | "INTERNSHIP_CLASH";
export type DiscrepancySeverity = "LOW" | "MEDIUM" | "HIGH";

export interface DiscrepancyFlag {
  id: string;
  type: DiscrepancyType;
  severity: DiscrepancySeverity;
  title: string;
  reason: string; // plain-language explanation
  evidence: string[]; // the exact signals that fired
  suggestedAction: string;
}

export interface SemesterGrade {
  semester: number;
  sgpa: number;
}

export interface EnrolmentRecord {
  college: string;
  collegeCode: string;
  program: string;
  name: string;
  dob: string;
  gender?: string;
  guardianName?: string;
  apaarToken?: string; // vault token, never a raw ID
  start: string; // ISO date
  end: string; // ISO date
}

export interface InternshipRecord {
  org: string;
  start: string;
  end: string;
  mode?: "ONSITE" | "REMOTE";
}

export interface AcademicWindow {
  label: string;
  start: string;
  end: string;
}

const DAY_MS = 86_400_000;

function toDay(iso: string): number {
  return Math.floor(new Date(iso).getTime() / DAY_MS);
}

/** Inclusive number of days two [start, end] ranges share (0 when disjoint). */
export function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const start = Math.max(toDay(aStart), toDay(bStart));
  const end = Math.min(toDay(aEnd), toDay(bEnd));
  return end >= start ? end - start + 1 : 0;
}

const GRADE_JUMP_THRESHOLD = 2.0;

/** Flags SGPA swings between consecutive semesters that exceed the threshold. */
export function detectGradeJumps(
  studentLabel: string,
  semesters: SemesterGrade[],
  threshold = GRADE_JUMP_THRESHOLD
): DiscrepancyFlag[] {
  const ordered = [...semesters].sort((a, b) => a.semester - b.semester);
  const flags: DiscrepancyFlag[] = [];

  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    const delta = Math.round((cur.sgpa - prev.sgpa) * 100) / 100;
    if (Math.abs(delta) < threshold) continue;

    const direction = delta > 0 ? "rose" : "fell";
    flags.push({
      id: `GJ-${studentLabel}-S${cur.semester}`,
      type: "GRADE_JUMP",
      severity: Math.abs(delta) >= threshold * 1.5 ? "HIGH" : "MEDIUM",
      title: `SGPA ${direction} ${Math.abs(delta).toFixed(1)} points in Semester ${cur.semester}`,
      reason: `SGPA ${direction} from ${prev.sgpa.toFixed(2)} to ${cur.sgpa.toFixed(2)} between semesters ${prev.semester} and ${cur.semester}. A swing of at least ${threshold.toFixed(1)} points between consecutive semesters is uncommon and often points to a mis-keyed marksheet, a revaluation not yet synced, or a wrong grade scale.`,
      evidence: [
        `Semester ${prev.semester} SGPA: ${prev.sgpa.toFixed(2)}`,
        `Semester ${cur.semester} SGPA: ${cur.sgpa.toFixed(2)}`,
        `Change: ${delta > 0 ? "+" : ""}${delta.toFixed(2)} (threshold ${threshold.toFixed(1)})`,
      ],
      suggestedAction: "Re-check the source marksheet for this semester before syncing to NAD.",
    });
  }
  return flags;
}

/**
 * Two enrolments at different colleges whose dates overlap and whose identity signals agree.
 * Returns null when the records are the same college, do not overlap, or are not the same person.
 */
export function detectDuplicateEnrolment(a: EnrolmentRecord, b: EnrolmentRecord): DiscrepancyFlag | null {
  if (a.collegeCode === b.collegeCode) return null;

  const shared = overlapDays(a.start, a.end, b.start, b.end);
  if (shared === 0) return null;

  const evidence: string[] = [];
  const sameToken = Boolean(a.apaarToken) && a.apaarToken === b.apaarToken;
  const nameScore = compareIndianNamesWithInitialExpansion(a.name, b.name).score;
  const dobMatch = normalizeDOB(a.dob) === normalizeDOB(b.dob);
  const guardianScore =
    a.guardianName && b.guardianName
      ? compareIndianNamesWithInitialExpansion(a.guardianName, b.guardianName).score
      : null;

  if (sameToken) evidence.push(`Same APAAR vault token (${a.apaarToken}) on both enrolments`);
  if (nameScore >= 0.85) evidence.push(`Name similarity ${Math.round(nameScore * 100)}% ('${a.name}' vs '${b.name}')`);
  if (dobMatch) evidence.push(`Identical date of birth (${normalizeDOB(a.dob)})`);
  if (guardianScore !== null && guardianScore >= 0.85) {
    evidence.push(`Guardian name similarity ${Math.round(guardianScore * 100)}%`);
  }

  const samePerson = sameToken || (nameScore >= 0.85 && dobMatch);
  if (!samePerson) return null;

  evidence.push(`${shared} overlapping days across '${a.college}' and '${b.college}'`);

  const confidence = sameToken ? 100 : Math.round(nameScore * 60 + 30 + (guardianScore ?? 0) * 10);
  return {
    id: `DE-${a.collegeCode}-${b.collegeCode}`,
    type: "DUPLICATE_ENROLMENT",
    severity: confidence >= 90 ? "HIGH" : "MEDIUM",
    title: `Possible dual enrolment: ${a.college} and ${b.college}`,
    reason: `The same identity appears on two full-time programmes at different institutions for ${shared} overlapping days. This is the signature of a dual enrolment or a ghost seat. Confidence ${confidence}%.`,
    evidence,
    suggestedAction: "Ask both colleges to confirm attendance; hold the later seat for review.",
  };
}

/** Pairwise scan across a set of enrolments. */
export function scanDuplicateEnrolments(records: EnrolmentRecord[]): DiscrepancyFlag[] {
  const flags: DiscrepancyFlag[] = [];
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const flag = detectDuplicateEnrolment(records[i], records[j]);
      if (flag) flags.push(flag);
    }
  }
  return flags;
}

/** Internships that overlap each other, or an on-site internship that lands on an exam window. */
export function detectInternshipClashes(
  studentLabel: string,
  internships: InternshipRecord[],
  examWindows: AcademicWindow[] = []
): DiscrepancyFlag[] {
  const flags: DiscrepancyFlag[] = [];

  for (let i = 0; i < internships.length; i++) {
    for (let j = i + 1; j < internships.length; j++) {
      const a = internships[i];
      const b = internships[j];
      const days = overlapDays(a.start, a.end, b.start, b.end);
      if (days === 0) continue;
      flags.push({
        id: `IC-${studentLabel}-${i}-${j}`,
        type: "INTERNSHIP_CLASH",
        severity: days > 14 ? "HIGH" : "MEDIUM",
        title: `Two internships overlap by ${days} days`,
        reason: `'${a.org}' (${a.start} to ${a.end}) and '${b.org}' (${b.start} to ${b.end}) run at the same time. Both cannot be full-time, and credit or stipend claims should not be double counted.`,
        evidence: [`${a.org}: ${a.start} → ${a.end}`, `${b.org}: ${b.start} → ${b.end}`, `${days} shared days`],
        suggestedAction: "Request a joining/relieving letter for each and confirm which one carries ABC credit.",
      });
    }
  }

  for (const intern of internships) {
    if (intern.mode === "REMOTE") continue;
    for (const win of examWindows) {
      const days = overlapDays(intern.start, intern.end, win.start, win.end);
      if (days === 0) continue;
      flags.push({
        id: `IX-${studentLabel}-${intern.org}-${win.label}`,
        type: "INTERNSHIP_CLASH",
        severity: "MEDIUM",
        title: `On-site internship overlaps ${win.label}`,
        reason: `'${intern.org}' is on-site for ${days} days of the ${win.label} window, so attendance at both is unlikely.`,
        evidence: [`${intern.org}: ${intern.start} → ${intern.end}`, `${win.label}: ${win.start} → ${win.end}`],
        suggestedAction: "Verify exam attendance and the internship attendance log.",
      });
    }
  }
  return flags;
}

export interface DiscrepancyProfile {
  studentLabel: string;
  semesters?: SemesterGrade[];
  internships?: InternshipRecord[];
  examWindows?: AcademicWindow[];
  enrolments?: EnrolmentRecord[];
}

/** Runs every detector and returns the flags worst-first. */
export function runDiscrepancyScan(profile: DiscrepancyProfile): DiscrepancyFlag[] {
  const flags = [
    ...detectGradeJumps(profile.studentLabel, profile.semesters ?? []),
    ...scanDuplicateEnrolments(profile.enrolments ?? []),
    ...detectInternshipClashes(profile.studentLabel, profile.internships ?? [], profile.examWindows ?? []),
  ];
  const rank: Record<DiscrepancySeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return flags.sort((x, y) => rank[x.severity] - rank[y.severity]);
}

export interface ProvisionalAffidavitInput {
  studentName: string;
  studentRoll: string;
  institution: string;
  erpName: string;
  digilockerName: string;
  dob: string;
  discrepancies: string[];
  date?: string;
}

/** Draft text for a registrar to review. It becomes a legal document only once executed and notarised. */
export function generateProvisionalAffidavit(input: ProvisionalAffidavitInput): string {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const lines = input.discrepancies.map((d, i) => `  ${i + 1}. ${d}`).join("\n");
  return [
    "PROVISIONAL AFFIDAVIT OF NAME / IDENTITY DISCREPANCY (DRAFT)",
    "",
    `I, ${input.studentName}, Roll No. ${input.studentRoll}, a student of ${input.institution}, solemnly state that:`,
    "",
    `1. My name is recorded as '${input.erpName}' in the institution's ERP and as '${input.digilockerName}' in DigiLocker / e-KYC.`,
    `2. Both records refer to me. My date of birth is ${input.dob}.`,
    "3. The differences arise from the following, and I request that they be reconciled:",
    lines || "  (none recorded)",
    "4. I undertake to submit supporting documents on request.",
    "",
    `Date: ${date}`,
    "Signature of deponent: ______________________",
    "",
    "Status: PROVISIONAL. Valid only after execution before a notary / oath commissioner and acceptance by the registrar.",
  ].join("\n");
}
