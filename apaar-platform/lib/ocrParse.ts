/**
 * Turns the text an OCR engine read from a marksheet into the CSV the sync already understands.
 *
 * OCR is good at letters and shaky at digits, so this parser is strict about what it accepts and loud about
 * what it cannot read. Nothing it produces is trusted: the registrar checks every value against the sheet,
 * and the normal sync validation (absent marks, missing credits and so on) still runs afterwards.
 */

export interface OcrLine {
  text: string;
  /** 0 - 100, from the OCR engine. */
  confidence: number;
}

export interface ParsedCourseLine {
  lineIndex: number;
  code: string;
  title: string;
  credits: string;
  marks: string;
  confidence: number;
}

export interface OcrParseResult {
  roll: string | null;
  name: string | null;
  courses: ParsedCourseLine[];
  /** Lines that were neither a header nor a course row. Shown so nothing is silently dropped. */
  unread: { lineIndex: number; text: string; confidence: number }[];
  warnings: string[];
  csv: string;
}

export const LOW_CONFIDENCE = 75;

const CODE = /^([A-Z]{2,4})([0-9OIl|S]{2,4})([A-Z]?)$/;
const ABSENT = new Set(["AB", "ABS", "ABSENT"]);

/** In a field that must be a number, OCR often reads 0 as O and 1 as l or I. Only digits-lookalikes are fixed. */
function numeric(token: string): string | null {
  const fixed = token.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1");
  return /^\d{1,3}(\.\d)?$/.test(fixed) ? fixed : null;
}

function courseCode(token: string): string | null {
  const m = CODE.exec(token.toUpperCase());
  if (!m) return null;
  const digits = m[2].replace(/O/g, "0").replace(/[I|L]/g, "1").replace(/S/g, "5");
  return /^\d+$/.test(digits) ? `${m[1]}${digits}${m[3]}` : null;
}

const quote = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function parseCourse(text: string): Omit<ParsedCourseLine, "lineIndex" | "confidence"> | null {
  const tokens = text.trim().split(/\s+/);
  if (tokens.length < 4) return null;

  const code = courseCode(tokens[0]);
  if (!code) return null;

  const rawMarks = tokens[tokens.length - 1];
  const marks = ABSENT.has(rawMarks.toUpperCase()) ? rawMarks.toUpperCase() : numeric(rawMarks);
  const credits = numeric(tokens[tokens.length - 2]);
  if (marks === null || credits === null) return null;
  if (Number(credits) > 12) return null; // a "credit" of 88 is a mark that landed in the wrong column

  const title = tokens.slice(1, -2).join(" ").trim();
  if (!title) return null;
  return { code, title, credits, marks };
}

export function parseOcrLines(lines: OcrLine[]): OcrParseResult {
  let roll: string | null = null;
  let name: string | null = null;
  const courses: ParsedCourseLine[] = [];
  const unread: OcrParseResult["unread"] = [];

  lines.forEach((line, lineIndex) => {
    const text = line.text.trim();
    if (!text) return;

    const rollMatch = /roll\s*(?:no|number)?\.?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-/]{3,})/i.exec(text);
    if (rollMatch && !roll) {
      roll = rollMatch[1].toUpperCase();
      return;
    }
    const nameMatch = /^(?:student\s*)?name\s*[:\-]?\s*(.+)$/i.exec(text);
    if (nameMatch && !name) {
      name = nameMatch[1].trim();
      return;
    }

    const course = parseCourse(text);
    if (course) courses.push({ lineIndex, ...course, confidence: line.confidence });
    else unread.push({ lineIndex, text, confidence: line.confidence });
  });

  const warnings: string[] = [];
  if (!roll) warnings.push("No roll number was found on the sheet. Add it to the CSV before syncing.");
  if (!name) warnings.push("No student name was found. The sheet will be matched by roll number only.");
  if (courses.length === 0) warnings.push("No course rows could be read from this image.");
  if (courses.some((c) => c.confidence < LOW_CONFIDENCE)) warnings.push("Some rows were read with low confidence. Check them against the sheet.");
  if (courses.length > 0) warnings.push("Maximum marks were assumed to be 100, because marksheets rarely print them per course.");

  const header = "roll_no,student_name,sub_cd,subj_desc,cr_reg,marks_obt,max_marks";
  const rows = courses.map((c) => [roll ?? "", name ?? "", c.code, c.title, c.credits, c.marks, "100"].map(quote).join(","));
  return { roll, name, courses, unread, warnings, csv: courses.length ? [header, ...rows].join("\n") : "" };
}
