/**
 * Privacy-safe early warning for faculty mentors.
 *
 * Mentors see a pseudonymous token, a support band and the reasons by category. Never marks,
 * names or ID numbers. Individual rows exist only for students who opted in to mentor alerts;
 * everyone else appears in an anonymous count.
 */

export interface SupportSignals {
  attendancePct: number;
  sgpaChange: number; // change since the previous semester
  creditShortfall: number; // credits behind the programme pace
  missedAssessments: number;
}

export type SupportBand = "LOW" | "MODERATE" | "HIGH";

export interface SupportAssessment {
  band: SupportBand;
  reasons: string[];
  suggestion: string;
}

export function assessSupportNeed(s: SupportSignals): SupportAssessment {
  const reasons: string[] = [];
  let points = 0;

  if (s.attendancePct < 65) {
    points += 3;
    reasons.push("Attendance is well below the usual 75% requirement");
  } else if (s.attendancePct < 75) {
    points += 1;
    reasons.push("Attendance is below the usual 75% requirement");
  }
  if (s.sgpaChange <= -1.5) {
    points += 2;
    reasons.push("Marked drop in results since last semester");
  } else if (s.sgpaChange <= -0.7) {
    points += 1;
    reasons.push("Results dipped since last semester");
  }
  if (s.creditShortfall >= 8) {
    points += 2;
    reasons.push("Behind on credits for the programme pace");
  } else if (s.creditShortfall >= 4) {
    points += 1;
    reasons.push("Slightly behind on credits");
  }
  if (s.missedAssessments >= 3) {
    points += 2;
    reasons.push("Several assessments missed");
  } else if (s.missedAssessments >= 1) {
    points += 1;
    reasons.push("An assessment was missed");
  }

  const band: SupportBand = points >= 5 ? "HIGH" : points >= 2 ? "MODERATE" : "LOW";
  return {
    band,
    reasons,
    suggestion:
      band === "HIGH"
        ? "Offer a one-to-one check-in this week and ask what is getting in the way."
        : band === "MODERATE"
          ? "Send a friendly nudge and point to remedial sessions."
          : "No action needed.",
  };
}

export interface CohortStudent {
  token: string; // pseudonym, not a vault token of a real ID
  program: string;
  mentoringOptIn: boolean;
  signals: SupportSignals;
}

export const SAMPLE_COHORT: CohortStudent[] = [
  { token: "STU-7F3A", program: "B.Tech CSE, Sem 4", mentoringOptIn: true, signals: { attendancePct: 61, sgpaChange: -2.9, creditShortfall: 8, missedAssessments: 3 } },
  { token: "STU-21BC", program: "B.Tech CSE, Sem 4", mentoringOptIn: true, signals: { attendancePct: 72, sgpaChange: -0.9, creditShortfall: 4, missedAssessments: 1 } },
  { token: "STU-90DE", program: "B.Tech ECE, Sem 4", mentoringOptIn: true, signals: { attendancePct: 88, sgpaChange: 0.2, creditShortfall: 0, missedAssessments: 0 } },
  { token: "STU-C41D", program: "B.Tech CSE, Sem 4", mentoringOptIn: false, signals: { attendancePct: 58, sgpaChange: -1.8, creditShortfall: 9, missedAssessments: 4 } },
  { token: "STU-A5E0", program: "B.Tech ECE, Sem 4", mentoringOptIn: false, signals: { attendancePct: 69, sgpaChange: -1.0, creditShortfall: 4, missedAssessments: 2 } },
  { token: "STU-3B77", program: "B.Tech CSE, Sem 4", mentoringOptIn: false, signals: { attendancePct: 91, sgpaChange: 0.5, creditShortfall: 0, missedAssessments: 0 } },
];
