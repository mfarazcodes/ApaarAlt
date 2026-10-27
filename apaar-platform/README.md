# APAAR Bridge

A privacy-first verification layer between college ERPs, AICTE, NAD/ABC, students and employers. A prototype for SIH 2026 (PS SIH26263).

- **Colleges (registrars)** turn messy ERP marksheets (typed, pasted, or read from a photo) into clean NAD records, resolve name mismatches before the government check rejects them, and answer student disputes.
- **AICTE** sees compliance per programme, can drill from a college to a programme to individual (pseudonymous) students, sees flagged cases with the reasons behind them, and one tamper-evident audit log.
- **Students** get their academic record (timeline, credit forecast, skill gaps) and a sharing page where they choose who sees what, and for how long. The whole site works in English and Hindi.
- **Employers** verify a credential and get yes-or-no claims the student allowed, with every ID number redacted. Checks work with no network.

Everything here is **sample data**: the people, colleges and ID numbers are fictional.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

Open `/login` and pick a persona. No configuration is needed in development: it uses an in-memory store, a development pepper and an ephemeral signing key. A banner says so in a deployment that is missing real settings.

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint (flat config, `eslint-config-next`) |
| `npm test` | Vitest: unit tests plus route-level security tests (213) |
| `npm run db:seed` | Writes the sample data into the database `DATABASE_URL` points at. Safe to run again. Refuses to run without `DATABASE_URL` |

`npm run dev` and `npm run build` first copy the OCR engine's files into `public/ocr/` (git-ignored), so marksheet reading never fetches anything from a third-party host.

## Who can do what

Sign in as one of ten demo personas. The server enforces the role on every route, from a signed cookie. The page gate (`proxy.ts`) is a convenience: a request that skips it still gets a 401 or 403.

| Role | Personas | Can |
|---|---|---|
| Student | Rahul K.V., Ananya Banerjee, Imran Q. (stopped using APAAR), Priya L., Meera S. (age 16) | Own sharing page, QR creation, reports of wrong details, stop using APAAR. The four adults also have the record and plan tabs. |
| Guardian | Sunita S. (Meera's mother) | Co-sign or withdraw consent for Meera. Nothing else. |
| Registrar | Registrar, Vindhya Institute | Marksheet sync (CSV or photo), match decisions, retry queue, dispute inbox, audit log, tokenization. |
| AICTE officer | AICTE officer | National compliance and drill-down, flagged cases, audit log, incident clocks. No college console. |
| Verifier | Acme Cloud HR, FinServe Bank HR | Verify credentials, ask students for consent, bulk API. Consent is per verifier. |

A person under 18 is determined from the date of birth on the student record. There is no switch a student can flip. The five students are built to show different cases: a solid record with one cleared backlog (Rahul), a strong record with no backlogs who appears in two colleges' lists (Ananya), an open failed course and a credit shortfall (Imran, who has also opted out), a large shortfall (Priya), and a minor with no academic record yet (Meera).

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[Portals<br/>student · admin · employer]
    SW[Service worker<br/>saves /employer]
    DEV[Device store<br/>issuer keys · offline queue]
    VER[On-device Ed25519 check<br/>WebCrypto or noble]
    OCR[On-device OCR<br/>tesseract.js, self-hosted]
  end
  subgraph Server["Next.js 16 (app router)"]
    PX[proxy.ts<br/>page gate by role]
    API[Route handlers<br/>guard: session · role · origin · rate limit · zod]
    ENG[Engines in lib/<br/>sync · fuzzy match · consent · credentials · jobs]
    AUD[Audit chain<br/>SHA-256 links · signed head]
  end
  STORE[(Store<br/>memory or Postgres)]
  CRON[Scheduler<br/>you set this up]

  UI --> PX --> API --> ENG
  ENG --> STORE
  ENG --> AUD --> STORE
  UI --- SW
  UI --- DEV --- VER
  UI --- OCR
  VER -. "reports checks when online" .-> API
  CRON -. "POST /api/queue/drain" .-> API
```

- **Store** (`lib/store`): one small document interface with two implementations. The Postgres one is a single `kv` table; its SQL is tested against real Postgres (PGlite) in `tests/store.test.ts`.
- **Audit chain** (`lib/audit.ts`): consent, match decisions, NAD syncs, grade changes, disputes and offline verifications share one log. Each entry hashes the one before it. The head is signed with the issuer's Ed25519 key, so cutting the log short or recomputing every hash is caught.
- **Matching** (`lib/fuzzyMatcher.ts`): two questions kept apart. *Same person?* (a confidence) and *Will the government check accept it as written?* (literal match). A name can be clearly the same person and still be rejected, so it becomes `AUTO_FIXABLE` with the exact correction. Matching only flags: a person confirms every decision, and it is audited.
- **Sync** (`lib/nadSyncEngine.ts`): never invents a grade, credit, course code or prior record. Rows it cannot grade are excluded and reported, and a sync that would leave rows out needs the registrar to confirm.
- **Credentials** (`lib/credentials.ts`, `lib/qrVerify.ts`): Ed25519-signed QR payloads with a key id. Offline verification runs in the browser against cached keys and cannot see revocation, and says so.
- **Marksheet OCR** (`components/admin/OcrScan.tsx`, `lib/ocrParse.ts`): tesseract.js runs in the registrar's browser, so the image never leaves the device. The parser is strict and reports every line it could not read, with a confidence. Nothing it reads is trusted: it fills the CSV box, the registrar must tick that they checked every value against the sheet, and the normal sync validation still runs.
- **Retry queue** (`lib/jobs.ts`): batches wait as jobs in the store, so they survive a refresh and are shared. Each attempt either succeeds or fails and retries after a longer wait (2 s doubling to 60 s), up to 5 attempts, then the job is dead-lettered for a person. A drain is one atomic store update, so a cron call and a click cannot both take the same job. **The call to NAD itself is still simulated** (a "NAD reachable" switch lets you cause an outage); there is no real NAD endpoint to call.

## Settings

Copy `.env.example`. In production the first three are required: the app answers `503` naming what is missing (see `/api/health`) instead of falling back to a weak default.

| Variable | Needed | Purpose |
|---|---|---|
| `VAULT_PEPPER` | production | Keys the hash that turns ID numbers into vault tokens |
| `SESSION_SECRET` | production | Signs the session cookie |
| `ISSUER_PRIVATE_KEY_PEM` | production | Ed25519 key for Smart QRs and the audit head (PEM, one line, literal `\n`) |
| `DATABASE_URL` | recommended | Postgres. Without it, state is lost on restart and not shared across serverless instances |
| `CRON_SECRET` | optional | Bearer token for `POST /api/queue/drain`. Unset, only a signed-in registrar can drain (it fails closed) |
| `DEMO_MODE` | optional | On by default. `false` removes demo personas, the phone simulator and the reset |
| `TOKEN_SALT` | optional | Per-institution salt for vault tokens |
| `ISSUER_KID`, `ISSUER_RETIRED_PUBLIC_KEYS` | optional | Stable key id, and old public keys still trusted after a rotation |

Generate secrets with `openssl rand -hex 32`, and the signing key with `openssl genpkey -algorithm ed25519`.

## Using Postgres

Set `DATABASE_URL`. The table is created on first use (`db/001_init.sql` holds the same statement for manual migration). Run `npm run db:seed` to load the sample data up front, or let it seed itself the first time it is read. The "Reset demo data" button (demo mode, registrar or AICTE) wipes it.

## Scheduling the retry queue

Nothing in this repository schedules anything. To retry failed batches without someone clicking, call the drain endpoint from your host's scheduler every minute or so:

```bash
curl -X POST https://your-host/api/queue/drain -H "Authorization: Bearer $CRON_SECRET"
```

On Vercel, add a Cron Job for `/api/queue/drain` and set `CRON_SECRET` (Vercel sends it as the bearer token). The same call also prunes old rate-limit counters.

## Languages

English and Hindi, switched from the bar at the top of every page (landing page included). The choice is stored in a cookie so server and client text agree, and `<html lang>` is rendered on the server from it. Translated: the landing page, sign-in, the student portal, the college console, the AICTE view, the employer verifier, the camera and phone-simulator text, and the developer page. **Not translated:** text the engines produce (course and skill names, match explanations, verification details and limits, messages from the server), the "Compliance tools" clocks card, the deployment banner, and the body of the privacy notice (which has its own 22-language selector: fourteen drafts, eight fall back to English). Hindi strings are drafts and need a native speaker's review. A test fails the build if a Hindi string is missing or a `{placeholder}` is dropped.

## Accessibility

Checked with axe-core (WCAG 2 A/AA and best-practice rules) in a real browser on 19 page states: every role and tab, the landing and sign-in pages, with every collapsible section opened, the share dialog, and the Hindi pages. No violations. Also checked by keyboard: a skip link is the first Tab stop, dialogs keep focus inside and return it on Escape, and every control shows a focus ring. Switches are 24 px tall with a 44 px hit area and nothing is under 12 px. **Not done:** a pass with a real screen reader (NVDA, VoiceOver) and a test on a real phone. The axe run is a browser script, not part of `npm test`.

## Screenshots

[`docs/screenshots/`](docs/screenshots/) has the main pages at 1440 px and 390 px wide, taken from a production build with sample data: landing, sign-in, the three student tabs, the college console, the AICTE view, and the employer page before and after a check.

## A five-minute demo

Open `/login`. The sign-in page marks the path: **Step 1** Registrar, **Step 2** Rahul, **Step 3** Acme Cloud HR.

1. **College (Registrar).** On *Upload marks*, pick *Use a sample → Sheet with problems*. The columns we found appear. Press *Show what will change*: rows with an absent mark are *Left out* and explained, nothing is graded as an A, and *Send to NAD* stays disabled until you tick that the rest may go without them. The student shows *No earlier NAD record*. You can also add a photo of a marksheet: it is read in your browser (nothing leaves the device), and you must tick *I checked every value*.
2. **Name mismatches.** *Mohd Faraz → Mohammad Faraz* is the same person but would still be rejected, so it says *Spelling can be fixed*. Open it: the suggested correction comes first and the scores are under *Details*. Use the Aadhaar spelling with a reason. Reload: the decision is still there. Matches that were exact are collapsed into one line.
3. **Sending to NAD.** *Add a batch*. Open *Demo tools*, switch NAD to unreachable, add another batch, and watch the retries with growing waits. Switch NAD back and it completes. The *Today* strip at the top counts what is waiting.
4. **Student (Rahul).** The page has three tabs: *My record*, *Plan & careers*, *Sharing & privacy*. Under *Plan & careers*, drag the exit slider: it answers instantly, with no server call. Under *Sharing & privacy*, press *Create a QR…*, keep only *Degree status* for 7 days, and create it. Download the image. Switch the page to **हिन्दी**; it stays Hindi after a reload.
5. **Employer (Acme).** Under *Upload a QR image*, choose that file: **Genuine**, four plain checks, the one claim, and "No ID numbers are shown". *Technical details* holds the engine's view. In *Demo tools*, try the revoked, replaced and expired samples.
6. **Employer, offline.** Turn off Wi-Fi (or, in *Demo tools*, switch on *Check without internet*). The page says "No internet. Checking on this device", still checks the QR, says it cannot see cancellations, and queues a note to report later. *Simulate a tampered QR* (also in *Demo tools*) is rejected.
7. **Consent.** In the phone simulator, *Request consent* as Acme, then approve it as Rahul under *Sharing & privacy*. Acme now sees the claims. Switch Rahul's *Let employers check my degree* off: the share shows *Paused*. Use *Share…* and *Stop sharing* per employer. Sign in as Imran: he has stopped using APAAR, so nothing of his is shared.
8. **A minor.** Sign in as Meera: sharing is refused until her guardian agrees. Sign in as Sunita, agree, and it works. Withdraw it and the share ends.
9. **AICTE.** Sign in as the AICTE officer. *At a glance* shows four numbers. Open a college, then a programme, then its students (pseudonymous tokens, never names); every level adds up to the one above, and each list exports as CSV. The *Activity log* shows every step above under real actors. Under *Tamper test (demo)*, *Try deleting the last entry* and *Try editing an entry* both fail the check.

## Known limits

- **Sample and simulated parts.** The call to NAD is simulated: the retry queue, scheduling and dead-lettering are real, but a "NAD reachable" switch stands in for the government endpoint. The phone simulator stands in for the student's own phone and is demo-mode only. All people, colleges and numbers are fictional.
- **OCR is a helper, not a source of truth.** It was verified on a clearly typed, computer-drawn marksheet. Real photos (skew, shadows, stamps, handwriting) were not tried and will read worse. That is why every value needs a human check.
- **Not production-ready.** Demo sign-in has no passwords. API keys are derived from a server secret and cannot be revoked one by one. Consent and audit writes are separate store updates, so a crash between them could leave a change without its audit entry. Nothing has run against a hosted Postgres.
- **Offline checks cannot see cancellations.** A credential cancelled after it was issued still looks genuine to a device with no network. A QR a student created expires on its own date, and online it follows the credential it was cut from.
- **Policy numbers are assumptions where labelled.** The 70% lateral-entry overlap has no source. Check the credit thresholds and the credit validity period against current regulation before real use.
- **Translations are drafts.** Hindi (see above) and the consent notices (fourteen of the 22 scheduled languages; the other eight fall back to English and say so) all need review by a native speaker, and the notices need certified legal translation.
- **The camera scanner is untested.** Scanning from an image is tested end to end. The live-camera path could not be exercised headlessly.
- **Browser coverage.** The browser checks ran in Microsoft Edge (Chromium) only. Screenshots were taken at 1440 px and 390 px wide; no real phone was used.
