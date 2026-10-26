import { ensureLedger } from "./consentEngine";
import { listSampleCredentials } from "./credentials";
import { readChain } from "./audit";
import { STUDENTS } from "./students";
import { readState } from "./syncState";
import type { Store } from "./store/types";

export interface SeedSummary {
  students: number;
  credentials: number;
  syncedStudents: number;
  auditEntries: number;
}

/**
 * Creates the sample data in a store: a consent ledger per student, the sample credentials, and the college's
 * sync state. Safe to run again: anything already there is left alone, and nothing is logged twice.
 * Used by `npm run db:seed`. The app also does this lazily the first time each piece is read.
 */
export async function seedDemoData(store: Store): Promise<SeedSummary> {
  for (const s of STUDENTS) await ensureLedger(store, s.id);
  const credentials = await listSampleCredentials(store);
  const sync = await readState(store);
  const chain = await readChain(store);
  return { students: STUDENTS.length, credentials: credentials.length, syncedStudents: sync.students.length, auditEntries: chain.entries.length };
}
