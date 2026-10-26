/**
 * Admission-spike detector for the AICTE command center.
 *
 * It compares each programme's latest day of admissions with its own recent average, and flags a sharp
 * jump together with the reasons. It is a rule, not a prediction: a person decides what a flag means.
 */

export interface AdmissionDay {
  college: string;
  programme: string;
  date: string; // YYYY-MM-DD
  admitted: number;
  /** Of those admitted, how many had no verified APAAR identity. */
  withoutVerifiedId: number;
}

export interface SpikeFlag {
  id: string;
  college: string;
  programme: string;
  date: string;
  admitted: number;
  baselineMean: number;
  baselineDays: number;
  liftPercent: number; // 100 = double the average
  unverifiedShare: number; // 0 - 1
  severity: "MEDIUM" | "HIGH";
  reasons: string[];
}

export interface SpikeOptions {
  /** Days before the latest one that make up the average. */
  baselineDays?: number;
  /** A programme needs at least this much history, or it is skipped. */
  minHistory?: number;
  /** Fewer admissions than this on the day is never a spike, however large the ratio. */
  minAdmitted?: number;
  /** The day must be at least this many times the average. */
  minRatio?: number;
}

export const SPIKE_DEFAULTS: Required<SpikeOptions> = { baselineDays: 14, minHistory: 7, minAdmitted: 15, minRatio: 3 };

export function detectAdmissionSpikes(series: AdmissionDay[], options: SpikeOptions = {}): SpikeFlag[] {
  const { baselineDays, minHistory, minAdmitted, minRatio } = { ...SPIKE_DEFAULTS, ...options };
  const groups = new Map<string, AdmissionDay[]>();
  for (const d of series) groups.set(`${d.college}|${d.programme}`, [...(groups.get(`${d.college}|${d.programme}`) ?? []), d]);

  const flags: SpikeFlag[] = [];
  for (const days of groups.values()) {
    const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const latest = ordered[ordered.length - 1];
    const history = ordered.slice(-1 - baselineDays, -1);
    if (history.length < minHistory) continue;

    const mean = history.reduce((n, d) => n + d.admitted, 0) / history.length;
    // A quiet programme has a mean near zero. Dividing by at least 1 keeps the ratio finite and honest.
    const ratio = latest.admitted / Math.max(1, mean);
    if (latest.admitted < minAdmitted || ratio < minRatio) continue;

    const unverifiedShare = latest.admitted > 0 ? latest.withoutVerifiedId / latest.admitted : 0;
    const liftPercent = Math.round((ratio - 1) * 100);
    flags.push({
      id: `SP-${latest.college}-${latest.programme}-${latest.date}`.replace(/\s+/g, "-"),
      college: latest.college,
      programme: latest.programme,
      date: latest.date,
      admitted: latest.admitted,
      baselineMean: Math.round(mean * 10) / 10,
      baselineDays: history.length,
      liftPercent,
      unverifiedShare: Math.round(unverifiedShare * 100) / 100,
      severity: ratio >= minRatio * 2 || unverifiedShare >= 0.6 ? "HIGH" : "MEDIUM",
      reasons: [
        `${latest.admitted} admissions on ${latest.date}, against an average of ${(Math.round(mean * 10) / 10).toFixed(1)} a day over the previous ${history.length} days (${liftPercent}% above).`,
        `${Math.round(unverifiedShare * 100)}% of that day's admissions have no verified APAAR identity.`,
        `Flag rule: at least ${minAdmitted} admissions in a day and at least ${minRatio} times the recent average.`,
      ],
    });
  }
  return flags.sort((a, b) => b.liftPercent - a.liftPercent);
}

const day = (n: number) => {
  const d = new Date(Date.UTC(2024, 8, 1 + n));
  return d.toISOString().slice(0, 10);
};

function run(college: string, programme: string, counts: number[], unverified: number[]): AdmissionDay[] {
  return counts.map((admitted, i) => ({ college, programme, date: day(i), admitted, withoutVerifiedId: unverified[i] ?? 0 }));
}

/** Fictional daily admissions. One programme jumps on the last day; the others stay in their usual range. */
export const SAMPLE_ADMISSION_SERIES: AdmissionDay[] = [
  ...run("Brahmaputra Institute of Technology", "B.Tech Civil", [3, 4, 2, 5, 3, 4, 3, 2, 4, 3, 5, 3, 4, 3, 31], [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 24]),
  ...run("Thar Engineering University", "B.Tech CSE", [8, 9, 7, 10, 8, 9, 11, 8, 9, 10, 8, 9, 7, 10, 12], [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1]),
  ...run("Kaveri Polytechnic & Engineering", "Diploma Electrical", [4, 5, 3, 4, 6, 5, 4, 3, 5, 4, 5, 4, 3, 5, 6], [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1]),
  ...run("Konkan Technical Campus", "B.Tech Mechanical", [2, 3, 2, 3], [0, 0, 0, 0]), // too little history to judge
];
