import "server-only";

const VERSION_PATTERN = /^v\d+\.\d+$/;

export type MetaConfig = { accessToken: string; apiVersion: string; appSecret?: string };

export function getMetaConfig(): MetaConfig {
  const accessToken = process.env.META_ACCESS_TOKEN?.trim();
  const apiVersion = process.env.META_API_VERSION?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();

  if (!accessToken) throw new Error("META_ACCESS_TOKEN belum dikonfigurasi.");
  if (!apiVersion || !VERSION_PATTERN.test(apiVersion)) {
    throw new Error("META_API_VERSION harus menggunakan format seperti v23.0.");
  }
  return { accessToken, apiVersion, appSecret: appSecret || undefined };
}
