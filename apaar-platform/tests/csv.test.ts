import { describe, expect, it } from "vitest";
import { CsvLimitError, MAX_CSV_BYTES, MAX_CSV_ROWS, parseCsv } from "@/lib/csv";

describe("B12: CSV parsing", () => {
  it("handles escaped quotes", () => {
    const { rows } = parseCsv('roll_no,subj_desc\n1,"He said ""hi"", twice"');
    expect(rows[0].subj_desc).toBe('He said "hi", twice');
  });

  it("handles a newline inside quotes", () => {
    const { rows } = parseCsv('roll_no,subj_desc,cr_reg\n1,"Line one\nline two",4\n2,Plain,3');
    expect(rows).toHaveLength(2);
    expect(rows[0].subj_desc).toBe("Line one\nline two");
    expect(rows[0].cr_reg).toBe("4");
  });

  it("detects semicolon and tab delimiters", () => {
    expect(parseCsv("roll_no;sub_cd;cr_reg\n1;CS1;4").rows[0]).toEqual({ roll_no: "1", sub_cd: "CS1", cr_reg: "4" });
    expect(parseCsv("roll_no\tsub_cd\tcr_reg\n1\tCS1\t4").rows[0]).toEqual({ roll_no: "1", sub_cd: "CS1", cr_reg: "4" });
  });

  it("strips a UTF-8 BOM so the first header still maps", () => {
    const { headers } = parseCsv("﻿roll_no,sub_cd\n1,CS1");
    expect(headers[0]).toBe("roll_no");
  });

  it("trims and lower-cases headers, and skips blank lines", () => {
    const { headers, rows } = parseCsv(" Roll_No , SUB_CD \n1,CS1\n\n\n2,CS2\n");
    expect(headers).toEqual(["roll_no", "sub_cd"]);
    expect(rows).toHaveLength(2);
  });

  it("rejects a file over the row limit", () => {
    const big = "a,b\n" + Array.from({ length: MAX_CSV_ROWS + 1 }, (_, i) => `${i},x`).join("\n");
    expect(() => parseCsv(big)).toThrow(CsvLimitError);
  });

  it("rejects a file over the size limit", () => {
    expect(() => parseCsv("a,b\n" + "x".repeat(MAX_CSV_BYTES))).toThrow(CsvLimitError);
  });

  it("reports an unterminated quote instead of swallowing the rest of the file", () => {
    expect(() => parseCsv('a,b\n1,"never closed\n2,3')).toThrow(/quote/i);
  });
});
