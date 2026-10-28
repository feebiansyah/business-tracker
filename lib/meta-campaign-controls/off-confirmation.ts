import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { MetaConfig } from "@/lib/meta/config";
import { record } from "./parse";
import { parseOffSelection, planDigest } from "./off-plan";
import type { OffConfirmation, OffPlan } from "./off-types";

const lifetime = 5 * 60_000;
const signature = (payload: string, config: MetaConfig) => createHmac("sha256", config.appSecret || config.accessToken).update(`meta-paused-confirmation:v1:${payload}`).digest();

export function confirmOffPlan(plan: OffPlan, actorId: number, config: MetaConfig): OffConfirmation {
  const issuedAt = Date.now(), expiresAt = issuedAt + lifetime;
  const payload = Buffer.from(JSON.stringify({ version: 1, actorId, selection: plan.selection, digest: planDigest(plan), issuedAt, expiresAt, nonce: randomBytes(16).toString("hex") })).toString("base64url");
  const counts = { campaign: 0, adset: 0, ad: 0, needPause: 0 };
  for (const object of plan.objects) { counts[object.kind]++; if (object.configuredStatus !== "PAUSED") counts.needPause++; }
  return { token: `${payload}.${signature(payload, config).toString("base64url")}`, kind: plan.selection.kind, target: plan.target, objects: plan.objects, expiresAt: new Date(expiresAt).toISOString(), counts };
}

export function readOffConfirmation(value: unknown, actorId: number, config: MetaConfig) {
  if (typeof value !== "string" || value.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) throw new Error("Konfirmasi tidak valid. Buat konfirmasi baru.");
  const [payload, tag] = value.split(".");
  const received = Buffer.from(tag, "base64url"), expected = signature(payload, config);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error("Konfirmasi tidak valid. Buat konfirmasi baru.");
  const claims = record(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  const now = Date.now();
  if (claims.version !== 1 || claims.actorId !== actorId || typeof claims.digest !== "string" || !/^[a-f0-9]{64}$/.test(claims.digest)
    || !Number.isSafeInteger(claims.issuedAt) || !Number.isSafeInteger(claims.expiresAt) || (claims.issuedAt as number) > now
    || (claims.expiresAt as number) <= now || (claims.expiresAt as number) - (claims.issuedAt as number) !== lifetime) throw new Error("Konfirmasi kedaluwarsa/tidak sesuai pengguna. Buat konfirmasi baru.");
  return { selection: parseOffSelection(claims.selection), digest: claims.digest };
}
