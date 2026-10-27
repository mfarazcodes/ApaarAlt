"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";

const Ctx = createContext<(message: string) => void>(() => undefined);

/** Shows a short confirmation ("Saved", "Shared until 26 Nov") that fades on its own. */
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  const next = useRef(0);

  const push = useCallback((text: string) => {
    const id = ++next.current;
    setItems((cur) => [...cur, { id, text }]);
    setTimeout(() => setItems((cur) => cur.filter((i) => i.id !== id)), 4500);
  }, []);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4">
        {items.map((i) => (
          <p key={i.id} className="pointer-events-auto flex max-w-md items-center gap-2 rounded-xl border border-accent/40 bg-deep-2 px-4 py-2.5 text-sm text-white shadow-2xl">
            <CheckCircle2 width={16} height={16} className="h-4 w-4 shrink-0 text-accent-soft" />
            {i.text}
          </p>
        ))}
      </div>
    </Ctx.Provider>
  );
}
