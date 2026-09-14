import "server-only";

import { ClickaduClient } from "./client.ts";

export function getClickaduClient() {
  const token = process.env.CLICKADU_API_TOKEN?.trim();
  if (!token) throw new Error("CLICKADU_API_TOKEN belum dikonfigurasi.");
  return new ClickaduClient({ token });
}
