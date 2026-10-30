"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getClickaduListAction } from "@/app/shopee/[id]/clickadu-roi/list-actions";
import type { ClickaduListMethod, ClickaduListState } from "@/lib/clickadu-roi/list-method";

type Read = { actual?: ClickaduListState; error?: string; loading: boolean };
type State = { reads: Record<number, Read>; plans: Record<number, ClickaduListMethod>; busy: boolean;
  plan(id: number, method: ClickaduListMethod): void; refresh(id: number): Promise<void>;
  verified(id: number, actual: ClickaduListState): void; begin(): boolean; end(): void };
const Context = createContext<State | null>(null);
export function useClickaduListMethod() {
  const state = useContext(Context);
  if (!state) throw new Error("Clickadu list context unavailable");
  return state;
}
export function ClickaduListMethodProvider({ accountId, configIds, connected, children }: {
  accountId: number; configIds: number[]; connected: boolean; children: ReactNode;
}) {
  const [reads, setReads] = useState<Record<number, Read>>({}), [plans, setPlans] = useState<Record<number, ClickaduListMethod>>({});
  const [busy, setBusy] = useState(false), lock = useRef(false), sequence = useRef(new Map<number, number>());
  const refresh = useCallback(async (id: number) => {
    const request = (sequence.current.get(id) ?? 0) + 1; sequence.current.set(id, request);
    setReads((old) => ({ ...old, [id]: { ...old[id], loading: true } }));
    try {
      const result = await getClickaduListAction(accountId, id);
      if (sequence.current.get(id) !== request) return;
      setReads((old) => ({ ...old, [id]: result.success ? { actual: result.actual, loading: false } : { error: result.message, loading: false } }));
    } catch {
      if (sequence.current.get(id) === request) setReads((old) => ({ ...old, [id]: { error: "Metode Clickadu gagal dibaca. Refresh untuk mencoba lagi.", loading: false } }));
    }
  }, [accountId]);
  const ids = configIds.join(",");
  useEffect(() => {
    if (!connected) return;
    let disposed = false, next = 0;
    const queue = ids ? ids.split(",").map(Number) : [], requests = sequence.current;
    async function worker() { while (!disposed && next < queue.length) await refresh(queue[next++]); }
    void worker(); void worker();
    return () => { disposed = true; for (const id of queue) requests.set(id, (requests.get(id) ?? 0) + 1); };
  }, [ids, connected, refresh]);
  return <Context.Provider value={{ reads, plans, busy,
    plan(id, method) { if (!lock.current) setPlans((old) => ({ ...old, [id]: method })); }, refresh,
    verified(id, actual) { sequence.current.set(id, (sequence.current.get(id) ?? 0) + 1); setReads((old) => ({ ...old, [id]: { actual, loading: false } })); },
    begin() { if (lock.current) return false; lock.current = true; setBusy(true); return true; },
    end() { lock.current = false; setBusy(false); },
  }}>{children}</Context.Provider>;
}
