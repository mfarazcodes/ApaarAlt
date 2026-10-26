# Changelog

Work on branch `feat/hardening-and-features`, from the audit of commit `1938b55`. IDs are the audit's (B = data integrity, M = matching, S = security, C = claims, Q = quality, F = features). Status is **Done**, **Partly done** or **Not done**, with the reason for anything short of done.

How it was checked: `npm run typecheck`, `npm run lint`, `npm test` (213 tests) and `npm run build` all pass. Browser scenarios were driven through Microsoft Edge against a production build with production-style secrets: roles and gating, cross-role consent, minor and guardian, registrar, AICTE (with drill-down), themes, disputes and API, a full offline run (the server is stopped and the network cut), marksheet OCR (a canvas-drawn sheet read in the browser, with every network request checked to be same-origin), Hindi and English switching, keyboard behaviour, and an axe-core audit. None of this has run against a hosted database, on a real phone, or with a real screen reader.

The Hindi text, the national figures and every person, college and ID number are **sample or draft content**. Nothing here has been reviewed by a lawyer, a native Hindi speaker or AICTE.

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
| S7 in-memory state and signing key | Partly done | Store interface with memory and Postgres implementations (tested against real Postgres via PGlite, including concurrent updates). Production refuses to issue credentials without a configured key. Key ids (`kid`) and retired keys supported. `npm run db:seed` loads the sample data (safe to repeat, refuses without `DATABASE_URL`) and is tested against PGlite. **Not done:** no test against a hosted Postgres. Consent and audit are separate updates, so a crash between them could drop an audit entry. |
| S8 rate limiting | Done | Store-backed, per IP and per session, on every route. The simulator is kept and labelled. Old counters are pruned whenever the queue is drained, so they are pruned automatically only if you schedule the drain (see F8). |
| S9 tokenization route | Done | Registrar only, server-side salt, returns only the token. |
| S10 minor toggle | Done | Derived from date of birth. A minor persona and a guardian persona replace the switch. |
| S11 GET writes | Done | Expiry is computed on read and logged on the next write. |
| S12 audit chain integrity | Done | Head signed with the issuer key. Tests cover an edited entry, an edited actor, a log cut short, and every hash recomputed. |
| S13 headers | Done | CSP, frame, referrer, permissions (camera on `/employer` only), HSTS, nosniff. The CSP allows inline scripts, as the Next.js guide documents without a nonce setup. |
| S14 validation and 500s | Done | zod on every action. 400, 401, 403, 413, 429 instead of 500. |
| M7 decisions lost on refresh | Done | Saved by the API and written to the audit log. Illogical decisions are refused. |
| F2 persistence | Done | Postgres store, `npm run db:seed`, and "Reset demo data" (demo mode, registrar or AICTE). Not exercised against a hosted database (see S7). |
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
| F7 real OCR | Done, with a caveat | tesseract.js reads a marksheet image in the registrar's browser. The engine and English data are served from this site (`public/ocr`, copied by a script, git-ignored), so nothing is fetched elsewhere and the CSP only needed `'wasm-unsafe-eval'`. A strict parser turns lines into CSV and lists every line it could not read, with confidence. Nothing is trusted: the registrar must tick that they checked each value, and normal sync validation still runs. An image with no marksheet loads nothing. **Caveat:** verified on a clean, computer-drawn sheet (exactly four rows read). Real photographs, skew, stamps and handwriting were not tried. |
| F8 real retry queue | Done, with a caveat | Jobs live in the store (survive refresh, shared across instances), retry with backoff (2 s doubling to 60 s, 5 attempts), then dead-letter. A drain is atomic, so concurrent drains never take the same job (tested). `POST /api/queue/drain` takes `Authorization: Bearer $CRON_SECRET`, fails closed when it is unset, and also prunes rate-limit counters. Every state change is audited. **Caveats:** the call to NAD is still a simulated switch, since there is no real endpoint; and nothing in the repo *schedules* the drain, so you must add a Vercel Cron job or similar (documented in the README). |
| F9 AICTE upgrades | Done | Admission-spike detector with reasons, per-programme over-intake flags (Phase 1), drill-down from college to programme to individual students (pseudonymous tokens, never names; each level reconciles to the one above, tested), and a CSV export on every list that cannot run as a formula. The national figures are synthetic. |
| F10 bulk verification | Done | `POST /api/verify/bulk` with API key or verifier session, 100 items per call, per-verifier rate limit, consent per student. OpenAPI at `/api/docs`. Keys are derived from a server secret and cannot be revoked individually. |
| F11 Hindi and English UI | Partly done | A switcher on every page, stored in a cookie so server and client text agree, `<html lang>` follows it, and the choice survives a reload. Translated: shell, sign-in, persona descriptions, page titles, the whole student portal (digital twin, NEP forecaster, skill-gap map, consent wallet, Smart QR creator) and the employer verifier with its result headlines. A compile-time check fails the build if a Hindi string is missing, and tests check key parity, `{placeholder}` preservation, and that every key used in `app/` exists. **Not done:** the college and AICTE console, the employer's other tools (offline settings, phone simulator, API access, camera), the landing page, the deployment banner, and text the engines produce (course and skill names, explanations) are English only. The Hindi is a draft and needs a native speaker's review. The 22-language notice selector remains. |
| F12 more sample students | Done | Five students (adult, adult with a strong record, one who opted out, one with a credit shortfall, one minor) and ten personas, each with its own consent ledger. They cover NOGEN, an open backlog, a cleared backlog, a credit shortfall and dual enrolment. **Note:** the "ghost candidate" case stays in the collision detector's sample data and is not a student. The minor has no academic record yet. |

## Phase 5: copy, docs, accessibility

| ID | Status | Notes |
|---|---|---|
| C1 absolute claim | Done | Hero and page description reworded. A test guards the wording. |
| C2 Aadhaar digits | Done | No digits shown anywhere. The demo APAAR ID is behind a button. |
| C4 simulations | Done | Wording matches what is built. OCR and the queue's retry mechanics are real (F7, F8). The call to NAD and the student's phone are simulations and are labelled as such. |
| Q1 README | Done | Root and `apaar-platform/`, with a diagram, settings, personas and a demo script. |
| Q6 request message and translations | Done | Duration is real. Fourteen draft notices keep both sentences. Eight languages still fall back to English. All need certified translation. |
| Q7 paused shares | Done | Shown as *Paused*. |
| Q8 opt-out modal | Done | Stays open on error. |
| Q9 policy constants | Done | `POLICY` records a source and a status per constant. The 70% lateral-entry bar is labelled an assumption. |
| Q10 single-tenant | Partly done | Five students and ten personas, each with a separate ledger, and guardian, minor and opted-out states all work per student. **Not done:** there is still one working college (the Vindhya registrar). The other colleges in the AICTE view are synthetic, and `TOKEN_SALT` is one value per deployment, not one per college at runtime. |
| F13 accessibility | Partly done | An axe-core audit (WCAG 2 A/AA and best-practice) found real problems and they are fixed: no `main` landmark (every page), low-contrast small text, the cobalt theme's accent too dark on dark cards, and a heading-order jump. It now reports zero violations across 21 page states (every role and tab, both languages, all three themes). Also added: a skip link, a dialog that keeps Tab inside and returns focus on Escape, a global focus ring, a translated Close label. Checked by keyboard in a browser. **Not done:** a pass with a real screen reader, a test on a real phone, and browsers other than Edge. The axe run is a browser script, not part of `npm test`. |

## Other changes worth knowing

- `proxy.ts` replaces the deprecated middleware convention, as this Next.js version requires.
- A route file may not export anything but handlers, so shared constants moved to `lib/`.
- The audit hash now covers the actor and the notice text. Before, rewriting either went unnoticed.
- The ledger no longer builds at import time, which broke the production build when the pepper was unset.
- The phone simulator is its own demo-mode endpoint. The audit log records it as the simulator, never as the student.
- `.env.example` now lists `CRON_SECRET` and the one-line format for `ISSUER_RETIRED_PUBLIC_KEYS`. Both were wrong or missing before.
- A new `--accent-soft` colour token is used for accent-coloured text on dark surfaces. `--accent` is unchanged and still used for fills and glows.
- `axe-core` is a dev dependency, used only by the browser audit.
- Nothing has been pushed. All of this work is on the local branch `feat/hardening-and-features`; `main` on GitHub is untouched by it.
