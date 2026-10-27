"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { ShareScope, StudentConsentLedger, Verifier } from "@/lib/consentEngine";
import { api, errorText } from "../portal/api";

export interface WalletResponse {
  ledger: StudentConsentLedger;
  verifiers: Verifier[];
  scopeLabels: Record<ShareScope, string>;
  chain: { valid: boolean; checked: number };
  viewer: { role: "STUDENT" | "GUARDIAN"; name: string };
}

interface Wallet {
  data: WalletResponse | null;
  error: string;
  setError: (message: string) => void;
  busy: boolean;
  /** Returns true when the server accepted the change. */
  act: (body: Record<string, unknown>, onError?: (message: string) => void) => Promise<boolean>;
}

const Ctx = createContext<Wallet | null>(null);

export function useWallet(): Wallet {
  const wallet = useContext(Ctx);
  if (!wallet) throw new Error("useWallet needs a WalletProvider above it.");
  return wallet;
}

/** One copy of the student's consent ledger, shared by the summary, the tabs and the wallet. */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<WalletResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<WalletResponse>("/api/consent"));
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  // Requests arrive from another tab, so refresh on a timer and when the tab regains focus.
  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 5000);
    window.addEventListener("focus", load);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  const act = useCallback(
    async (body: Record<string, unknown>, onError: (message: string) => void = setError): Promise<boolean> => {
      setBusy(true);
      setError("");
      try {
        await api("/api/consent", body);
        await load();
        return true;
      } catch (e) {
        onError(errorText(e));
        await load();
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  return <Ctx.Provider value={{ data, error, setError, busy, act }}>{children}</Ctx.Provider>;
}
