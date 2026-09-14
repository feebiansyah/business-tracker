import "server-only";

import { ClickaduClient } from "./client.ts";

export function getClickaduClient(token: string) {
  return new ClickaduClient({ token });
}
