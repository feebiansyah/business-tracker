import { createHmac, timingSafeEqual } from "node:crypto";
import { OperationError, type Confirmation } from "./types";

const domain = "BUSINESS_TRACKER_ADSTERRA_PLACEMENT_CONFIRMATION_V2";
function key() {
  const value = process.env.TRAFFIC_CREDENTIAL_ENCRYPTION_KEY;
  if (!value || Buffer.from(value, "base64").length !== 32) throw new OperationError("Kunci konfirmasi server belum tersedia.");
  return Buffer.from(value, "base64");
}
export function signConfirmation(data: Confirmation) {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${body}.${createHmac("sha256", key()).update(`${domain}:${body}`).digest("base64url")}`;
}
export function verifyConfirmation(token: unknown, owner: string, purpose: Confirmation["purpose"], now = Date.now()): Confirmation {
  try {
    if (typeof token !== "string" || token.length > 2500) throw new Error();
    const [body, signature, extra] = token.split(".");
    const expected = createHmac("sha256", key()).update(`${domain}:${body}`).digest();
    const supplied = Buffer.from(signature ?? "", "base64url");
    if (extra || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error();
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as Confirmation;
    if (data.owner !== owner || data.purpose !== purpose || data.rules !== "ROI20_OR_10_CTR8_SPEND1000_V1"
      || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= now || data.expiresAt > now + 300_000
      || !["BLACKLIST", "WHITELIST"].includes(data.kind) || !Number.isSafeInteger(data.generation)
      || !Number.isSafeInteger(data.methodVersion) || data.methodVersion < 0) throw new Error();
    return data;
  } catch { throw new OperationError("Konfirmasi salah, kedaluwarsa, atau bukan untuk tindakan/pengguna ini. Siapkan ulang."); }
}
