"use client";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";

const fallback = { busy: false, revision: 0, begin: (key: string) => { void key; return true; }, end: (key: string, refresh = false) => { void key; void refresh; }, isBusy: () => false };
const Context = createContext(fallback);
export function useAdsterraOperation() { return useContext(Context); }
export function AdsterraOperationProvider({ children }: { children: ReactNode }) {
  const lock = useRef<string | null>(null);
  const [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  function begin(key: string) { if (lock.current) return false; lock.current = key; setBusy(true); return true; }
  function end(key: string, refresh = false) { if (lock.current !== key) return; lock.current = null; setBusy(false); if (refresh) setRevision((value) => value + 1); }
  return <Context.Provider value={{ busy, revision, begin, end, isBusy: () => lock.current !== null }}>{children}</Context.Provider>;
}
