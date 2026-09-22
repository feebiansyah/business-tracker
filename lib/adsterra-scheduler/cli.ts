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

type CliDependencies = {
  run(action: AdsterraScheduledAction): Promise<SchedulerSummary>;
  disconnect(): Promise<void>;
  log(message: string): void;
};

export async function runAdsterraSchedulerCli(
  action: AdsterraScheduledAction,
  dependencies: CliDependencies,
) {
  let exitCode = 0;

  try {
    const summary = await dependencies.run(action);
    dependencies.log(formatSummary(action, summary));
    if (summary.failed > 0) exitCode = 1;
  } catch {
    dependencies.log("Scheduler Adsterra gagal dijalankan.");
    exitCode = 1;
  } finally {
    try {
      await dependencies.disconnect();
    } catch {
      dependencies.log("Koneksi database scheduler Adsterra gagal ditutup.");
      exitCode = 1;
    }
  }

  return exitCode;
}

function formatSummary(action: AdsterraScheduledAction, summary: SchedulerSummary) {
  return [
    `Action: ${action}`,
    `Business date: ${summary.businessDate}`,
    `Total enabled: ${summary.total}`,
    `Success: ${summary.success}`,
    `No change: ${summary.noChange}`,
    `Skipped: ${summary.skipped}`,
    `Failed: ${summary.failed}`,
    `Already claimed: ${summary.alreadyClaimed}`,
  ].join("\n");
}
