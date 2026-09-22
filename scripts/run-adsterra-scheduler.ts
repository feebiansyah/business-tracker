import "server-only";

import { prisma } from "../lib/prisma";
import { runAdsterraSchedulerCli } from "../lib/adsterra-scheduler/cli";
import { runAdsterraScheduledCampaigns } from "../lib/adsterra-scheduler/runner";
import type { AdsterraScheduledAction } from "../lib/adsterra-scheduler/run";

async function main() {
  const action = parseAction(process.argv[2]);

  if (!action) {
    console.error("Action scheduler Adsterra harus ON atau OFF.");
    try {
      await prisma.$disconnect();
    } catch {
      console.error("Koneksi database scheduler Adsterra gagal ditutup.");
    }
    process.exitCode = 1;
    return;
  }

  process.exitCode = await runAdsterraSchedulerCli(action, {
    run: runAdsterraScheduledCampaigns,
    disconnect: () => prisma.$disconnect(),
    log: (message) => console.log(message),
  });
}

void main();

function parseAction(value: string | undefined): AdsterraScheduledAction | null {
  return value === "ON" || value === "OFF" ? value : null;
}
