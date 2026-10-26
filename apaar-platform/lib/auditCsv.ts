import type { AuditEntry } from "./audit";
import { toCsv } from "./csvExport";

/** The audit list as CSV. Details can contain text a student typed, so every cell goes through the formula-safe writer. */
export function auditToCsv(entries: AuditEntry[]): string {
  return toCsv(entries as unknown as Record<string, unknown>[], [
    { key: "logId", header: "Entry" },
    { key: "timestamp", header: "When (UTC)" },
    { key: "type", header: "Type" },
    { key: "action", header: "Action" },
    { key: "actorRole", header: "Actor role" },
    { key: "actor", header: "Actor" },
    { key: "subject", header: "Subject" },
    { key: "detail", header: "Detail" },
    { key: "sha256Hash", header: "Hash" },
  ]);
}
