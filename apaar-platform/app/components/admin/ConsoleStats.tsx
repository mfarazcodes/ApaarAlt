"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

interface Stats {
  stats: Record<string, number>;
  report: (key: string, value: number) => void;
}

const Ctx = createContext<Stats>({ stats: {}, report: () => undefined });

/** Lets each console card tell the "Today" strip how much work it is holding, without the strip fetching it all again. */
export function ConsoleStatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<Record<string, number>>({});
  const report = useCallback((key: string, value: number) => setStats((cur) => (cur[key] === value ? cur : { ...cur, [key]: value })), []);
  return <Ctx.Provider value={{ stats, report }}>{children}</Ctx.Provider>;
}

export function useReportStat(key: string, value: number | null) {
  const { report } = useContext(Ctx);
  useEffect(() => {
    if (value !== null) report(key, value);
  }, [key, value, report]);
}

export const useConsoleStats = () => useContext(Ctx).stats;
