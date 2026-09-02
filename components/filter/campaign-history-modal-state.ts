export type ModalCloseSource = "overlay" | "content" | "close-button" | "keydown";

export function modalShouldClose(source: ModalCloseSource, key?: string) {
  return source === "overlay" || source === "close-button" || (source === "keydown" && key === "Escape");
}
