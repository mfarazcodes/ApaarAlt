/**
 * The parts of credential verification with no server dependencies, so the browser can run the same rules
 * on the device (offline mode) that the server runs online.
 */

export type ShareScopeName = "DEGREE_STATUS" | "INTERNSHIP_STATUS" | "CGPA_BAND" | "EOA_STATUS";

export type CredentialStatus = "AUTHENTIC" | "REVOKED" | "SUPERSEDED" | "EXPIRED" | "INVALID_SIGNATURE" | "NOT_FOUND";

export interface MinimalClaims {
  degreeVerified: boolean;
  degreeLabel: string;
  cgpaAtLeast75: boolean;
  eoaActive: boolean;
  internshipCompleted: boolean;
}

/** A full credential carries every claim. A presentation carries only what the student chose. */
export type Claims = Partial<MinimalClaims>;

export interface CredentialPayload {
  v: 1;
  cid: string;
  kid?: string;
  /** CREDENTIAL (issued by the college) or PRESENTATION (a QR the student created for chosen claims). */
  kind?: "CREDENTIAL" | "PRESENTATION";
  /** For a presentation: the credential it was cut from. Revocation of the parent revokes the presentation. */
  parent?: string;
  holder: string; // vault token
  ver: string;
  iat: string;
  exp: string;
  iss: string;
  claims: Claims;
}

export interface DisclosedClaim {
  key: string;
  label: string;
  value: boolean;
}

export interface VerificationCheck {
  name: string;
  passed: boolean | null; // null = not performed in this mode
  note: string;
}

export interface VerificationResult {
  mode: "ONLINE" | "OFFLINE";
  status: CredentialStatus;
  headline: string;
  detail: string;
  credentialId?: string;
  version?: string;
  issuedAt?: string;
  expiresAt?: string;
  supersededBy?: string;
  identity: string;
  /** A vault token. The verifier uses it to ask this student for consent. It is not an ID number. */
  holderToken?: string;
  claims: DisclosedClaim[] | null;
  consent: {
    state: "GRANTED" | "PRESENTED" | "NOT_GRANTED" | "OPTED_OUT" | "NOT_CHECKED_OFFLINE";
    shareId?: string;
    expiresAt?: string;
    pendingRequestId?: string;
  };
  checks: VerificationCheck[];
  limitations: string[];
  /** Which engine did the signature check: this server, WebCrypto on the device, or the pure-JS fallback. */
  signatureEngine?: "server" | "webcrypto" | "noble";
}

export const REDACTED = "[Aadhaar Redacted]";

export const CLAIM_LABELS: Record<keyof Omit<MinimalClaims, "degreeLabel">, string> = {
  degreeVerified: "Degree",
  cgpaAtLeast75: "CGPA >= 7.5",
  eoaActive: "AICTE EoA Active",
  internshipCompleted: "Internship Completed",
};

export const CLAIM_SCOPE: Record<keyof Omit<MinimalClaims, "degreeLabel">, ShareScopeName> = {
  degreeVerified: "DEGREE_STATUS",
  cgpaAtLeast75: "CGPA_BAND",
  eoaActive: "EOA_STATUS",
  internshipCompleted: "INTERNSHIP_STATUS",
};

/** The claims a set of scopes covers. */
export function claimsForScopes(full: MinimalClaims, scopes: ShareScopeName[]): Claims {
  const out: Claims = {};
  for (const key of Object.keys(CLAIM_SCOPE) as (keyof typeof CLAIM_SCOPE)[]) {
    if (scopes.includes(CLAIM_SCOPE[key])) {
      (out as Record<string, unknown>)[key] = full[key];
      if (key === "degreeVerified") out.degreeLabel = full.degreeLabel;
    }
  }
  return out;
}

/** Only claims that are present in the payload, and (online) only those the student's share covers. */
export function discloseClaims(claims: Claims, allowed?: ShareScopeName[]): DisclosedClaim[] {
  return (Object.keys(CLAIM_LABELS) as (keyof typeof CLAIM_LABELS)[])
    .filter((k) => claims[k] !== undefined && (!allowed || allowed.includes(CLAIM_SCOPE[k])))
    .map((k) => ({ key: k, label: k === "degreeVerified" ? (claims.degreeLabel ?? CLAIM_LABELS[k]) : CLAIM_LABELS[k], value: Boolean(claims[k]) }));
}

export const HEADLINES: Record<CredentialStatus, string> = {
  AUTHENTIC: "AUTHENTIC",
  REVOKED: "REVOKED",
  SUPERSEDED: "SUPERSEDED",
  EXPIRED: "EXPIRED",
  INVALID_SIGNATURE: "INVALID SIGNATURE",
  NOT_FOUND: "NOT FOUND",
};

export function baseResult(mode: VerificationResult["mode"], status: CredentialStatus, detail: string): VerificationResult {
  return {
    mode,
    status,
    headline: HEADLINES[status],
    detail,
    identity: REDACTED,
    claims: null,
    consent: { state: mode === "OFFLINE" ? "NOT_CHECKED_OFFLINE" : "NOT_GRANTED" },
    checks: [],
    limitations: [],
  };
}

/**
 * The offline verdict for a payload whose signature has already been checked.
 * Offline can prove a QR is genuine and unexpired. It can never see revocation, and says so.
 */
export function evaluateOffline(
  parsed: { signatureValid: boolean; payload: CredentialPayload | null; kid?: string; error?: string },
  engine: VerificationResult["signatureEngine"],
  now = Date.now()
): VerificationResult {
  const checks: VerificationCheck[] = [
    { name: "Ed25519 signature", passed: parsed.signatureValid, note: parsed.signatureValid ? `Signed by APAAR issuer key ${parsed.kid ?? ""}.`.trim() : (parsed.error ?? "Failed.") },
  ];
  if (!parsed.signatureValid || !parsed.payload) {
    return { ...baseResult("OFFLINE", "INVALID_SIGNATURE", parsed.error ?? "The QR could not be verified."), checks, signatureEngine: engine };
  }

  const p = parsed.payload;
  const expired = new Date(p.exp).getTime() < now;
  checks.push({ name: "Validity window", passed: !expired, note: expired ? `Expired on ${p.exp.slice(0, 10)}.` : `Valid until ${p.exp.slice(0, 10)}.` });
  checks.push({ name: "Revocation registry", passed: null, note: "Not available offline." });

  const result: VerificationResult = {
    ...baseResult("OFFLINE", "AUTHENTIC", "Signature and validity checks passed on this device."),
    credentialId: p.cid,
    version: p.ver,
    issuedAt: p.iat,
    expiresAt: p.exp,
    holderToken: p.holder,
    checks,
    signatureEngine: engine,
    limitations: ["Offline check proves the QR is genuine and unexpired. It cannot tell whether the credential was revoked, replaced, or withdrawn by the student since it was issued."],
  };
  if (expired) return { ...result, status: "EXPIRED", headline: HEADLINES.EXPIRED, detail: `This credential lapsed on ${p.exp.slice(0, 10)}.` };

  // Showing the QR is the student's consent, and the QR carries only what they chose to include.
  result.claims = discloseClaims(p.claims);
  return result;
}
