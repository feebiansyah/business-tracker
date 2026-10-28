"use client";

import { useEffect, useRef, useState } from "react";

type Owner = "off" | "budget";
type LockState = { key: string; owner: Owner | null; busy: boolean };

/** A synchronous modal-local lock, not an exactly-once/cross-tab/provider lock. */
export function useMetaActionLock(key: string, onBusyChange: (busy: boolean) => void) {
  const current = useRef<LockState>({ key, owner: null, busy: false });
  const [stored, setStored] = useState<LockState | null>(null);
  useEffect(() => {
    current.current = { key, owner: null, busy: false };
    return () => { current.current = { key: "", owner: null, busy: false }; };
  }, [key]);
  const state = stored?.key === key ? stored : null;
  useEffect(() => {
    if (!state?.busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state?.busy]);
  return {
    busy: !!state?.busy, owner: state?.owner ?? null,
    begin(owner: Owner) {
      const value = current.current;
      if (value.key !== key || value.busy || (value.owner !== null && value.owner !== owner)) return false;
      current.current = { key, owner, busy: true }; setStored(current.current); onBusyChange(true); return true;
    },
    finish(owner: Owner, keepConfirmation = false) {
      if (current.current.key !== key || current.current.owner !== owner) return;
      current.current = { key, owner: keepConfirmation ? owner : null, busy: false };
      setStored(current.current); onBusyChange(false);
    },
    clear(owner: Owner) {
      if (current.current.key !== key || current.current.busy || current.current.owner !== owner) return;
      current.current = { key, owner: null, busy: false }; setStored(current.current);
    },
    isLocked: () => current.current.key === key && current.current.busy,
  };
}

export type MetaActionLock = ReturnType<typeof useMetaActionLock>;
