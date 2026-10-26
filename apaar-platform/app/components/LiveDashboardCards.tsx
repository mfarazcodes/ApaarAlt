"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  ScanSearch,
  Sparkles,
  XCircle,
} from "lucide-react";

import { ICON, Toggle } from "./portal/ui";

/* ── shared bits ─────────────────────────────────────────────────────── */

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={`rounded-2xl border border-white/10 bg-deep-2 p-5 text-left text-white shadow-[0_30px_60px_-20px_rgba(0,0,0,0.55)] ${className}`}
    >
      {children}
    </article>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
      {children}
    </p>
  );
}

/* ── Card A: fuzzy matcher & schema mapper ───────────────────────────── */

// Illustrative sample pairs; scores are demo values, not computed live.
const PAIRS = [
  { erp: "Rahul Kumar", nad: "Rahul K.", score: 96.4 },
  { erp: "Priya Sharma", nad: "Priya Sarma", score: 97.8 },
  { erp: "Mohd. Faraz", nad: "Mohammad Faraz", score: 93.1 },
  { erp: "Anita Devi", nad: "Anita D.", score: 94.6 },
];

function MatcherCard() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);

  function goTo(next: number) {
    setIndex(next);
    // Every record processed while offline lands in the local queue.
    if (offline) setPending((p) => Math.min(p + 1, 9));
  }

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % PAIRS.length);
      if (offline) setPending((p) => Math.min(p + 1, 9));
    }, 3800);
    return () => clearInterval(id);
  }, [paused, offline]);

  function toggleOffline(next: boolean) {
    setOffline(next);
    setPending(next ? 3 : 0); // reconnecting sends the queued batches
  }

  const pair = PAIRS[index];

  return (
    <Card>
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <Eyebrow>Pre-flight matcher</Eyebrow>
            <h3 className="mt-1 text-base font-semibold">ERP → NAD schema map</h3>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-semibold text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]" />
            Live
          </span>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium">&ldquo;{pair.erp}&rdquo;</span>
            <ArrowLeftRight
              width={16}
              height={16}
              className={`${ICON} text-accent`}
            />
            <span className="truncate font-medium text-white/70">
              &ldquo;{pair.nad}&rdquo;
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-accent/15 px-2 py-1 text-xs font-semibold text-accent shadow-[0_0_18px_-4px_var(--accent)]">
              <Sparkles width={16} height={16} className="h-3.5 w-3.5 shrink-0" />
              {pair.score}% Jaro-Winkler Match
            </span>
            <div className="flex gap-1.5">
              {PAIRS.map((p, i) => (
                <button
                  key={p.erp}
                  type="button"
                  aria-label={`Show match ${i + 1} of ${PAIRS.length}`}
                  aria-current={i === index}
                  onClick={() => goTo(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? "w-5 bg-accent" : "w-1.5 bg-white/25 hover:bg-white/50"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <p className="text-white/70">
            Offline Queue:{" "}
            <span className={`font-semibold ${pending ? "text-amber-300" : "text-white"}`}>
              {pending} Pending
            </span>{" "}
            <span className="text-white/45">(retries on reconnect)</span>
          </p>
          <Toggle checked={offline} onChange={toggleOffline} label="Simulate offline mode" />
        </div>
      </div>

      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-white/60">AICTE Approved Intake</span>
          <span className="font-semibold text-white">
            420 / 420 <span className="text-accent">Verified</span>
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-full rounded-full bg-gradient-to-r from-accent-strong to-accent" />
        </div>
      </div>
    </Card>
  );
}

/* ── Card B: digital twin & consent wallet ───────────────────────────── */

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
const CURRENT_SEM = 6;

function ReadinessRing({ score }: { score: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width={56}
      height={56}
      viewBox="0 0 56 56"
      role="img"
      aria-label={`Placement readiness ${score} out of 100`}
      className="h-14 w-14 shrink-0 -rotate-90"
    >
      <circle cx={28} cy={28} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={5} />
      <circle
        cx={28}
        cy={28}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - score / 100)}
      />
    </svg>
  );
}

function TwinCard() {
  const [planAdded, setPlanAdded] = useState(false);
  const [shareStatus, setShareStatus] = useState(true);

  const earned = 128;
  const total = 160;
  const recommended = 12;
  const earnedPct = (earned / total) * 100;
  const plannedPct = (recommended / total) * 100;

  return (
    <Card className="ring-1 ring-accent/40 shadow-[0_40px_80px_-24px_var(--accent-ink)] lg:-translate-y-8 lg:p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/15 text-sm font-bold text-accent">
          RK
        </span>
        <div className="min-w-0">
          <Eyebrow>Academic Digital Twin</Eyebrow>
          <h3 className="mt-0.5 truncate text-base font-semibold">
            B.Tech CSE • Sem 6 • {earned}/{total} ABC Credits
          </h3>
        </div>
      </div>

      {/* semester timeline */}
      <ol className="mt-5 flex items-center" aria-label="Semester timeline">
        {SEMESTERS.map((s, i) => {
          const done = s < CURRENT_SEM;
          const current = s === CURRENT_SEM;
          return (
            <li key={s} className="flex flex-1 items-center last:flex-none">
              <span
                title={`Semester ${s}`}
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                  done
                    ? "bg-accent text-deep"
                    : current
                      ? "bg-white text-deep ring-4 ring-accent/40"
                      : "bg-white/10 text-white/40"
                }`}
              >
                {s}
              </span>
              {i < SEMESTERS.length - 1 && (
                <span
                  className={`mx-1 h-0.5 flex-1 rounded ${done ? "bg-accent" : "bg-white/10"}`}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* credit forecaster */}
      <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/60">Credit Completion Forecaster</span>
          <span className="font-semibold">
            {planAdded ? earned + recommended : earned}/{total}
          </span>
        </div>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-accent" style={{ width: `${earnedPct}%` }} />
          <div
            className="h-full bg-accent/50 transition-all duration-500"
            style={{ width: planAdded ? `${plannedPct}%` : "0%" }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-accent">
            +{recommended} SWAYAM Credits Recommended
          </p>
          <button
            type="button"
            onClick={() => setPlanAdded((v) => !v)}
            aria-pressed={planAdded}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold transition hover:bg-white/20"
          >
            {planAdded ? (
              <CheckCircle2 width={16} height={16} className="h-3.5 w-3.5 shrink-0 text-accent" />
            ) : (
              <Plus width={16} height={16} className="h-3.5 w-3.5 shrink-0" />
            )}
            {planAdded ? "In plan" : "Add to plan"}
          </button>
        </div>
      </div>

      {/* placement readiness */}
      <div className="mt-3 flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
        <div className="relative">
          <ReadinessRing score={88} />
          <span className="absolute inset-0 grid place-items-center text-sm font-bold">88</span>
        </div>
        <div>
          <p className="text-xs text-white/60">Placement Readiness Score</p>
          <p className="text-lg font-semibold">
            88<span className="text-sm font-normal text-white/50">/100</span>
          </p>
        </div>
      </div>

      {/* consent wallet */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <Eyebrow>DPDP Consent Wallet</Eyebrow>
          <span className="inline-flex items-center gap-1 text-[11px] text-white/45">
            <Lock width={16} height={16} className="h-3 w-3 shrink-0" />
            NOGEN protected
          </span>
        </div>
        <ul className="mt-2 divide-y divide-white/10 rounded-xl border border-white/10">
          <li className="flex items-center justify-between gap-3 px-3.5 py-3 text-sm">
            <span className="min-w-0 text-white/85">
              Share Degree &amp; Internship Status for 30 Days:{" "}
              <strong className={shareStatus ? "text-accent" : "text-white/50"}>
                {shareStatus ? "ON" : "OFF"}
              </strong>
            </span>
            <Toggle checked={shareStatus} onChange={setShareStatus} label="Share degree and internship status for 30 days" />
          </li>
          <li className="flex items-center justify-between gap-3 px-3.5 py-3 text-sm">
            <span className="min-w-0 text-white/85">
              Identity Number:{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">[Aadhaar Redacted]</code>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-white/55">
              <Lock width={16} height={16} className="h-3 w-3 shrink-0" />
              Never shared
            </span>
          </li>
        </ul>
      </div>
    </Card>
  );
}

/* ── Card C: smart credential QR & anomaly radar ─────────────────────── */

const STATUSES = {
  authentic: {
    label: "AUTHENTIC",
    note: "Verified — no marksheet exposed",
    Icon: CheckCircle2,
    text: "text-accent",
    bg: "bg-accent/15",
    ring: "ring-accent/60",
  },
  revoked: {
    label: "REVOKED",
    note: "Revoked by issuing institution",
    Icon: XCircle,
    text: "text-red-400",
    bg: "bg-red-500/15",
    ring: "ring-red-400/60",
  },
  superseded: {
    label: "SUPERSEDED",
    note: "A newer credential was issued",
    Icon: RefreshCw,
    text: "text-amber-300",
    bg: "bg-amber-400/15",
    ring: "ring-amber-300/60",
  },
} as const;

type StatusKey = keyof typeof STATUSES;

const QR_N = 21;

function inFinder(x: number, y: number) {
  return (x < 8 && y < 8) || (x > QR_N - 9 && y < 8) || (x < 8 && y > QR_N - 9);
}

function finderCell(x: number, y: number) {
  const fx = x < 8 ? x : x - (QR_N - 8);
  const fy = y < 8 ? y : y - (QR_N - 8);
  if (fx > 6 || fy > 6) return false;
  const ring = fx === 0 || fx === 6 || fy === 0 || fy === 6;
  const core = fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4;
  return ring || core;
}

function QrCode({ status }: { status: StatusKey }) {
  const cells = useMemo(() => {
    let seed = 20240517;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const out: { x: number; y: number }[] = [];
    for (let y = 0; y < QR_N; y++) {
      for (let x = 0; x < QR_N; x++) {
        const on = inFinder(x, y) ? finderCell(x, y) : next() > 0.52;
        if (on) out.push({ x, y });
      }
    }
    return out;
  }, []);

  const s = STATUSES[status];
  return (
    <div className={`relative rounded-xl bg-white p-2.5 ring-2 transition ${s.ring}`}>
      <svg
        width={104}
        height={104}
        viewBox={`0 0 ${QR_N} ${QR_N}`}
        shapeRendering="crispEdges"
        role="img"
        aria-label={`Credential QR code, status ${s.label.toLowerCase()}`}
        className={`h-[104px] w-[104px] shrink-0 text-deep transition ${
          status === "authentic" ? "" : "opacity-30"
        }`}
      >
        {cells.map((c) => (
          <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width={1} height={1} fill="currentColor" />
        ))}
      </svg>
      {status !== "authentic" && (
        <span className={`absolute inset-0 grid place-items-center ${s.text}`}>
          <s.Icon width={40} height={40} className="h-10 w-10 shrink-0" strokeWidth={2.25} />
        </span>
      )}
    </div>
  );
}

function RadarIcon() {
  return (
    <svg
      width={56}
      height={56}
      viewBox="0 0 56 56"
      aria-hidden="true"
      className="h-14 w-14 shrink-0 text-accent"
    >
      <circle cx={28} cy={28} r={26} fill="none" stroke="currentColor" strokeOpacity={0.25} />
      <circle cx={28} cy={28} r={17} fill="none" stroke="currentColor" strokeOpacity={0.25} />
      <circle cx={28} cy={28} r={8} fill="none" stroke="currentColor" strokeOpacity={0.25} />
      <g className="radar-sweep">
        <path d="M28 28 L28 2 A26 26 0 0 1 46 9 Z" fill="currentColor" fillOpacity={0.3} />
        <line x1={28} y1={28} x2={28} y2={2} stroke="currentColor" strokeWidth={1.5} />
      </g>
      <circle cx={28} cy={28} r={2} fill="currentColor" />
    </svg>
  );
}

function QrRadarCard() {
  const [status, setStatus] = useState<StatusKey>("authentic");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!scanning) return;
    const id = setTimeout(() => setScanning(false), 1800);
    return () => clearTimeout(id);
  }, [scanning]);

  const s = STATUSES[status];

  return (
    <Card className="flex flex-col">
      <div>
        <Eyebrow>Smart Credential QR</Eyebrow>
        <div className="mt-3 flex items-center gap-4">
          <QrCode status={status} />
          <div className="min-w-0">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold tracking-wide ${s.bg} ${s.text}`}
            >
              <s.Icon width={16} height={16} className="h-3.5 w-3.5 shrink-0" />
              {s.label}
            </span>
            <p className="mt-2 text-sm text-white/75">{s.note}</p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-white/50">
              <KeyRound width={16} height={16} className="h-3.5 w-3.5 shrink-0 text-accent" />
              Works offline: Ed25519 check on the device
            </p>
          </div>
        </div>

        <div
          role="group"
          aria-label="Preview credential status"
          className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-white/[0.06] p-1"
        >
          {(Object.keys(STATUSES) as StatusKey[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={status === k}
              onClick={() => setStatus(k)}
              className={`rounded-md px-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition ${
                status === k ? "bg-white text-deep" : "text-white/60 hover:text-white"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex-1 border-t border-white/10 pt-4">
        <Eyebrow>AICTE Anomaly Radar</Eyebrow>
        <div className="mt-3 flex items-center gap-4">
          <RadarIcon />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug" aria-live="polite">
              {scanning ? (
                "Scanning cross-college registry…"
              ) : (
                <>
                  <span className="text-accent">0</span> Duplicate Cross-College Enrolments
                  Detected
                </>
              )}
            </p>
            <button
              type="button"
              disabled={scanning}
              onClick={() => setScanning(true)}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-white/60 transition hover:text-white disabled:opacity-50"
            >
              <ScanSearch width={16} height={16} className="h-3.5 w-3.5 shrink-0" />
              {scanning ? "Scanning…" : "Run scan"}
            </button>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-white/45">
          <Fingerprint width={16} height={16} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Explainable flags only — each alert cites the matching fields.
        </p>
      </div>
    </Card>
  );
}

/* ── layout ──────────────────────────────────────────────────────────── */

export default function LiveDashboardCards() {
  return (
    <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[1fr_1.2fr_1fr]">
      <div className="order-2 lg:order-1 [&>article]:h-full">
        <MatcherCard />
      </div>
      <div className="order-1 lg:order-2 [&>article]:h-full">
        <TwinCard />
      </div>
      <div className="order-3 [&>article]:h-full">
        <QrRadarCard />
      </div>
    </div>
  );
}
