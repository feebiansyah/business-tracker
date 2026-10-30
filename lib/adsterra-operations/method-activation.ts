import type { MethodState } from "./types";

/** Durable untouched defaults only; null alone also occurs during first setup. */
export function isLegacyUnconfiguredMethod(method: MethodState) {
  return method.placementMethod === null && method.methodVersion === 0 && !method.methodReady
    && method.approvedBlacklistHash === null && method.approvedWhitelistHash === null;
}
