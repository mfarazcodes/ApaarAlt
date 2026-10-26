/** Saves text as a CSV file from the browser. Build the text with toCsv, so formula-like cells are already escaped. */
export function downloadCsv(filename: string, text: string): void {
  // A leading byte-order mark makes Excel read UTF-8 (names, rupee signs) correctly.
  const url = URL.createObjectURL(new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
