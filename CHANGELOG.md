# Changelog

Work on branch `feat/hardening-and-features`, from the audit of commit `1938b55`. IDs are the audit's (B = data integrity, M = matching, S = security, C = claims, Q = quality, F = features). Status is **Done**, **Partly done** or **Not done**, with the reason for anything short of done.

How it was checked: `npm run typecheck`, `npm run lint`, `npm test` (160 tests) and `npm run build` all pass. Eight browser scenarios (roles and gating, cross-role consent, minor and guardian, registrar, AICTE, themes, disputes and API, and a full offline run) were driven through a real browser against a production build with production-style secrets. The offline run stops the server and cuts the network. None of this has run against a hosted database or on a real phone.

## Phase 0: tooling

| ID | Status | Notes |
|---|---|---|
| Q2 scripts and tests | Done | `typecheck`, `lint`, `test`. Vitest, zod added. TypeScript pinned to 5.x because `typescript-eslint` does not support 7. |
| Q3 build artefact | Done | `tsconfig.tsbuildinfo` removed and ignored. |
| Q4 empty file | Done | `MicroStages.tsx` deleted. |
| Q5 `.env.example` | Done | Rewritten, with every variable and which are required. |

## Phase 1: data integrity and matching

| ID | Status | Notes |
|---|---|---|
| B1 invented grade for absent or blank | Done | Rows carry `issues[]`. AB/ABS/I/W handled. Excluded rows are reported. Sync refuses until the registrar confirms. |
| B2 credits `\|\| 4`, default code and title | Done | `0` stays `0`. Missing credits and code are blocking. |
| B3 unknown grade becomes F | Done | Unknown grade is a reported issue. A grade scale can be passed to the engine. |
| B4 invented prior 75 / 8.2 | Done | New students have no prior record, and the UI says so. |
| B5 intake cap hides over-admission | Done | Cap removed. |
| B6 institution-level compliance only | Done | Per programme, rolled up. Any over-intake programme puts the institution at risk. |
| B7 divide by zero | Done | `NO_APPROVED_INTAKE` / `UNRATED`, never `Infinity`. |
| B8 hard-coded year, semester, institution | Done | Year, semester and programme come from the validated request. Institution details come from the store. |
| B9 SGPA disagrees with grades | Done | Computed from grades. A test pins the values. |
| B10 planned credits counted as earned | Done | Only completed semesters count. A projection is shown separately and labelled. |
| B11 CGPA mixes earned and registered | Done | Attempt history with a configurable backlog rule (default replaces a failed attempt). Shared by the NAD engine and the twin. |
| B12 CSV parser | Done | papaparse. Escaped quotes, quoted newlines, `;` and tab, BOM. 2 MB and 5,000-row limits. |
| M1 "Mohd = Mohammad" shown as exact | Done | `apiWillAccept` separates literal acceptance from same-person confidence. New `AUTO_FIXABLE` class with the exact correction and a one-click apply. |
| M2 guardian unused | Done | Weighted in when both sides have it. |
| M3 missing field scores 100 | Done | Missing fields leave the average. |
| M4 initial matches anything | Done | Initial-only matches are capped at 90 and never auto-fixed. |
| M5 duplicate scores | Done | Computed separately. |
| M6 Jaro window, impossible dates | Done | Window clamped. Impossible dates rejected. |

## Phase 2: security and persistence

| ID | Status | Notes |
|---|---|---|
| F1 demo auth and roles | Done | Signed cookie (jose), five roles, seven personas, login page, session bar. `proxy.ts` gates pages. |
| S1 no auth on any route | Done | Every route calls `guard()`. 43 route-level tests cover 401, 403, forged cookies, and cross-site writes. |
| S2 actor from the request body | Done | Actor comes from the session. A test shows a supplied actor is ignored. |
| S3 unvalidated purpose | Done | Enum validation. |
| S5 raw government IDs | Done | `apaar_id` and Aadhaar-style columns are dropped on upload and never returned. Sample ABC IDs no longer embed the demo APAAR digits. GET is role-scoped. |
| S6 production 500 without `VAULT_PEPPER` | Done | `/api/health`, a `503` that names what is missing, and a banner in the portals. |
| S7 in-memory state and signing key | Partly done | Store interface with memory and Postgres implementations (tested against real Postgres via PGlite, including concurrent updates). Production refuses to issue credentials without a configured key. Key ids (`kid`) and retired keys supported. **Not done:** `npm run db:seed` (seeding is lazy), and no test against a hosted Postgres. Consent and audit are separate updates, so a crash between them could drop an audit entry. |
| S8 rate limiting | Done | Store-backed, per IP and per session, on every route. The simulator is kept and labelled. Counters are not pruned automatically (helper exists, no cron). |
| S9 tokenization route | Done | Registrar only, server-side salt, returns only the token. |
| S10 minor toggle | Done | Derived from date of birth. A minor persona and a guardian persona replace the switch. |
| S11 GET writes | Done | Expiry is computed on read and logged on the next write. |
| S12 audit chain integrity | Done | Head signed with the issuer key. Tests cover an edited entry, an edited actor, a log cut short, and every hash recomputed. |
| S13 headers | Done | CSP, frame, referrer, permissions (camera on `/employer` only), HSTS, nosniff. The CSP allows inline scripts, as the Next.js guide documents without a nonce setup. |
| S14 validation and 500s | Done | zod on every action. 400, 401, 403, 413, 429 instead of 500. |
| M7 decisions lost on refresh | Done | Saved by the API and written to the audit log. Illogical decisions are refused. |
| F2 persistence | Partly done | See S7. "Reset demo data" is built (demo mode, registrar or AICTE). |
| F6 unified audit | Done | Consent, match decisions, syncs, grade changes, disputes and offline verifications in one chain, filterable by type. |

## Phase 3: offline verification and Smart QR

| ID | Status | Notes |
|---|---|---|
| F3 real offline verifier | Done | Ed25519 in the browser (WebCrypto, with a pure-JS fallback), cached issuer keys, service worker, IndexedDB queue that reports once when back online. Verified with the server stopped and the network off. |
| F4 real Smart QR | Done | Students choose claims and duration and get a QR image. Employers scan from an image or camera. **Caveat:** image scanning is tested end to end. The live-camera path could not be exercised headlessly. |
| S4 offline claim | Done | The claim is now true, and the limits are stated on screen. |
| C3 share scopes | Done | The wallet shows the real scopes and duration, with a picker. |

## Phase 4: features

| ID | Status | Notes |
|---|---|---|
| F5 dispute inbox | Done | Registrar inbox with acknowledgement dates, resolve or reject with a reason, outcomes in the student's wallet, all audited. |
| F7 real OCR | **Not done** | Not started. The button still says it is simulated. |
| F8 real retry queue | **Not done** | No jobs table or cron route. The queue stays a browser simulation, now named honestly. |
| F9 AICTE upgrades | Partly done | Admission-spike detector with reasons, per-programme over-intake flags (Phase 1), and a CSV export that cannot run as a formula. **Not done:** drill-down from college to programme to student. The export covers spike flags only. |
| F10 bulk verification | Done | `POST /api/verify/bulk` with API key or verifier session, 100 items per call, per-verifier rate limit, consent per student. OpenAPI at `/api/docs`. Keys are derived from a server secret and cannot be revoked individually. |
| F11 Hindi and English UI | **Not done** | Not started. The 22-language notice selector remains. |
| F12 more sample students | Partly done | Two students: an adult and a minor with a guardian. The other cases (NOGEN, backlog, credit shortfall, dual enrolment, ghost candidate) exist as sample data in other places, not as separate students. The minor has no academic twin. |

## Phase 5: copy, docs, accessibility

| ID | Status | Notes |
|---|---|---|
| C1 absolute claim | Done | Hero and page description reworded. A test guards the wording. |
| C2 Aadhaar digits | Done | No digits shown anywhere. The demo APAAR ID is behind a button. |
| C4 simulations | Done | Reworded as simulations. OCR and the queue are not built (F7, F8). |
| Q1 README | Done | Root and `apaar-platform/`, with a diagram, settings, personas and a demo script. |
| Q6 request message and translations | Done | Duration is real. Fourteen draft notices keep both sentences. Eight languages still fall back to English. All need certified translation. |
| Q7 paused shares | Done | Shown as *Paused*. |
| Q8 opt-out modal | Done | Stays open on error. |
| Q9 policy constants | Done | `POLICY` records a source and a status per constant. The 70% lateral-entry bar is labelled an assumption. |
| Q10 single-tenant | Partly done | See F12. |
| F13 accessibility | Partly done | Roles, labels, keyboard support and focus handling on the new switches, tabs, modals and result areas. **Not done:** a screen-reader pass and a contrast audit. |

## Other changes worth knowing

- `proxy.ts` replaces the deprecated middleware convention, as this Next.js version requires.
- A route file may not export anything but handlers, so shared constants moved to `lib/`.
- The audit hash now covers the actor and the notice text. Before, rewriting either went unnoticed.
- The ledger no longer builds at import time, which broke the production build when the pepper was unset.
- The phone simulator is its own demo-mode endpoint. The audit log records it as the simulator, never as the student.
