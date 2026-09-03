export type MobileDrawerEvent = "overlay" | "panel" | "close-button" | "navigation" | "keydown";

export function mobileDrawerShouldClose(event: MobileDrawerEvent, key?: string) {
  if (event === "keydown") return key === "Escape";
  return event === "overlay" || event === "close-button" || event === "navigation";
}
