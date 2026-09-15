import "server-only";
import { AdsterraClient } from "./client.ts";
export function getAdsterraClient(apiKey: string) { return new AdsterraClient({ apiKey }); }
