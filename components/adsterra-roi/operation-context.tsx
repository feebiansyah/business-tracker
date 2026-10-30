"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

const fallback = { busy: false, changing: false, protectionNeeded: false, setProtectionNeeded: (key: string, needed: boolean) => { void key; void needed; }, revision: 0, refresh: () => {}, readRevision: () => 0, begin: (key: string) => { void key; return true; }, end: (key: string, refresh = false) => { void key; void refresh; }, isBusy: () => false };
const Context = createContext(fallback);
export function useAdsterraOperation() { return useContext(Context); }
export function AdsterraOperationProvider({ children }: { children: ReactNode }) {
  const lock = useRef<string | null>(null);
  const latestRevision = useRef(0);
  const [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const [changing, setChanging] = useState(false);
  // Presentation only; acquiring/releasing the existing lock is unchanged.
  const [protectionKeys, setProtectionKeys] = useState<ReadonlySet<string>>(new Set());
  function setProtectionNeeded(key: string, needed: boolean) {
    setProtectionKeys((previous) => { const next = new Set(previous); if (needed) next.add(key); else next.delete(key); return next; });
  }
  const readRevision = useCallback(() => latestRevision.current, []);
  const refresh = useCallback(() => { latestRevision.current++; setRevision(latestRevision.current); }, []);
  function begin(key: string) { if (lock.current) return false; lock.current = key; setBusy(true); setChanging(key !== "analysis"); return true; }
  function end(key: string, shouldRefresh = false) { if (lock.current !== key) return; lock.current = null; setBusy(false); setChanging(false); if (shouldRefresh) refresh(); }
  return <Context.Provider value={{ busy, changing, protectionNeeded: protectionKeys.size > 0, setProtectionNeeded, revision, refresh, readRevision, begin, end, isBusy: () => lock.current !== null }}>{children}</Context.Provider>;
}
