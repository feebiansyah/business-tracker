import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

export function encryptTrafficSecret(secret: string, encodedKey = process.env.TRAFFIC_CREDENTIAL_ENCRYPTION_KEY) {
  const key = decodeKey(encodedKey);
  if (!secret) throw new Error("Traffic credential tidak valid.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptTrafficSecret(payload: string, encodedKey = process.env.TRAFFIC_CREDENTIAL_ENCRYPTION_KEY) {
  const key = decodeKey(encodedKey);
  const [version, ivValue, tagValue, ciphertextValue, extra] = payload.split(":");
  if (version !== VERSION || !ivValue || !tagValue || !ciphertextValue || extra !== undefined) throw new Error("Traffic credential tidak valid.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64")), decipher.final()]).toString("utf8");
  } catch { throw new Error("Traffic credential tidak valid."); }
}

function decodeKey(value: string | undefined) {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error("Traffic credential encryption key tidak valid.");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) throw new Error("Traffic credential encryption key tidak valid.");
  return key;
}
