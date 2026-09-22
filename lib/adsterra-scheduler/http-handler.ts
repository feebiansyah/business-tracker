import { createHash, timingSafeEqual } from "node:crypto";
import type { AdsterraScheduledAction } from "./run.ts";

type SchedulerSummary = {
  businessDate: string;
  total: number;
  success: number;
  noChange: number;
  skipped: number;
  failed: number;
  alreadyClaimed: number;
};

type HandlerDependencies = {
  cronSecret: string | undefined;
  run(action: AdsterraScheduledAction): Promise<SchedulerSummary>;
};

export async function handleAdsterraSchedulerRequest(
  request: Request,
  dependencies: HandlerDependencies,
) {
  if (!dependencies.cronSecret) {
    return Response.json(
      { error: "Scheduler Adsterra belum dikonfigurasi." },
      { status: 503 },
    );
  }

  const providedSecret = readBearerSecret(request.headers.get("authorization"));
  if (!providedSecret || !secretsMatch(providedSecret, dependencies.cronSecret)) {
    return Response.json({ error: "Tidak diizinkan." }, { status: 401 });
  }

  const action = await readAction(request);
  if (!action) {
    return Response.json({ error: "Action harus ON atau OFF." }, { status: 400 });
  }

  try {
    const result = await dependencies.run(action);
    const response = {
      action,
      businessDate: result.businessDate,
      total: result.total,
      success: result.success,
      noChange: result.noChange,
      skipped: result.skipped,
      failed: result.failed,
      alreadyClaimed: result.alreadyClaimed,
    };
    return Response.json(response, { status: result.failed > 0 ? 207 : 200 });
  } catch {
    return Response.json(
      { error: "Scheduler Adsterra gagal dijalankan." },
      { status: 500 },
    );
  }
}

async function readAction(request: Request): Promise<AdsterraScheduledAction | null> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("action" in body)) return null;
    const action = body.action;
    return action === "ON" || action === "OFF" ? action : null;
  } catch {
    return null;
  }
}

function readBearerSecret(authorization: string | null) {
  if (!authorization?.startsWith("Bearer ")) return null;
  const value = authorization.slice("Bearer ".length);
  return value.length > 0 ? value : null;
}

function secretsMatch(provided: string, expected: string) {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}
