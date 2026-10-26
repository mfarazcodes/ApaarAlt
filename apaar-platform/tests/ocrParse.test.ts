import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import { LOW_CONFIDENCE, parseOcrLines, type OcrLine } from "@/lib/ocrParse";
import { detectSchemaMapping, processStudentSemesterRecord } from "@/lib/nadSyncEngine";

const lines = (texts: string[], confidence = 92): OcrLine[] => texts.map((text) => ({ text, confidence }));

const SHEET = [
  "VINDHYA INSTITUTE OF TECHNOLOGY",
  "Semester V Marksheet",
  "Roll No: 2023-CS-041",
  "Name: Rahul K.V.",
  "Code Subject Credits Marks",
  "CS501 Operating Systems & Kernels 4 88",
  "CS502 Compiler Design & Automata 4 76",
  "AI302 Machine Learning 3 92",
  "HS201 Professional Ethics 2 AB",
  "Total Credits 13",
];

describe("F7: reading a marksheet's OCR text", () => {
  it("finds the header and every course row, and reports what it could not read", () => {
    const r = parseOcrLines(lines(SHEET));
    expect(r.roll).toBe("2023-CS-041");
    expect(r.name).toBe("Rahul K.V.");
    expect(r.courses.map((c) => [c.code, c.title, c.credits, c.marks])).toEqual([
      ["CS501", "Operating Systems & Kernels", "4", "88"],
      ["CS502", "Compiler Design & Automata", "4", "76"],
      ["AI302", "Machine Learning", "3", "92"],
      ["HS201", "Professional Ethics", "2", "AB"],
    ]);
    // Title lines, the column header and the totals row are shown, not dropped silently.
    expect(r.unread.map((u) => u.text)).toEqual(["VINDHYA INSTITUTE OF TECHNOLOGY", "Semester V Marksheet", "Code Subject Credits Marks", "Total Credits 13"]);
  });

  it("produces a CSV the sync already understands, with an absent mark carried through to be flagged", () => {
    const { csv } = parseOcrLines(lines(SHEET));
    const parsed = parseCsv(csv);
    expect(detectSchemaMapping(parsed.headers).missingRequired).toEqual([]);
    expect(parsed.rows).toHaveLength(4);

    const record = processStudentSemesterRecord({
      studentRoll: "2023-CS-041", studentName: "Rahul K.V.", abcAccountId: "ABC-1", apaarToken: "T", program: "B.Tech", semester: 5, academicYear: "2024-25",
      prior: null, rows: parsed.rows,
    });
    expect(record.courses).toHaveLength(3); // the absent row is excluded, never graded
    expect(record.rowIssues.filter((r) => r.excluded)[0].issues[0].code).toBe("ABSENT");
  });

  it("repairs the usual OCR digit mistakes in number fields, and only there", () => {
    const r = parseOcrLines(lines(["Roll No: 2023-CS-041", "CS5O1 Operating Systems 4 B8".replace("B8", "88"), "CS5O2 Compilers l 7O"]));
    expect(r.courses.map((c) => [c.code, c.credits, c.marks])).toEqual([
      ["CS501", "4", "88"],
      ["CS502", "1", "70"],
    ]);
    // Letters in a title are left exactly as read.
    expect(r.courses[0].title).toBe("Operating Systems");
  });

  it("refuses a row whose columns are in the wrong order or whose numbers cannot be numbers", () => {
    const r = parseOcrLines(lines(["Roll No: 2023-CS-041", "CS501 Operating Systems 88 4", "CS502 Compilers four 70", "CS503 Networks 3 seventy"]));
    expect(r.courses).toHaveLength(0);
    expect(r.unread).toHaveLength(3);
    expect(r.roll).toBe("2023-CS-041");
    expect(r.csv).toBe("");
    expect(r.warnings.join(" ")).toMatch(/No course rows could be read/);
  });

  it("flags low-confidence rows and a missing roll number, and notes the assumed maximum", () => {
    const r = parseOcrLines([{ text: "CS501 Operating Systems 4 88", confidence: LOW_CONFIDENCE - 10 }]);
    expect(r.warnings.join(" ")).toMatch(/low confidence/);
    expect(r.warnings.join(" ")).toMatch(/No roll number/);
    expect(r.warnings.join(" ")).toMatch(/assumed to be 100/);
    expect(r.courses[0].confidence).toBeLessThan(LOW_CONFIDENCE);
  });

  it("quotes titles with commas and quotes, so one row stays one row", () => {
    const r = parseOcrLines(lines(["Roll No: 2023-CS-041", 'CS501 Signals, Systems "Lab" 2 81']));
    const parsed = parseCsv(r.csv);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].subj_desc).toBe('Signals, Systems "Lab"');
  });

  it("does not mistake the totals line or a stray number for a course", () => {
    const r = parseOcrLines(lines(["Roll No: 2023-CS-041", "Total 13 88", "Result: PASS 4 88", "SGPA 8.7"]));
    expect(r.courses).toHaveLength(0);
  });

  it("copes with empty input and blank lines", () => {
    expect(parseOcrLines([]).csv).toBe("");
    expect(parseOcrLines(lines(["", "   "])).courses).toHaveLength(0);
  });
});
