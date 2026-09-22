import "server-only";

import { prisma } from "../lib/prisma";
import { runAdsterraSchedulerCli } from "../lib/adsterra-scheduler/cli";
import { runAdsterraScheduledCampaigns } from "../lib/adsterra-scheduler/runner";
import type { AdsterraScheduledAction } from "../lib/adsterra-scheduler/run";

const action = parseAction(process.argv[2]);

if (!action) {
  console.error("Action scheduler Adsterra harus ON atau OFF.");
  await prisma.$disconnect();
  process.exitCode = 1;
} else {
  process.exitCode = await runAdsterraSchedulerCli(action, {
    run: runAdsterraScheduledCampaigns,
    disconnect: () => prisma.$disconnect(),
    log: (message) => console.log(message),
  });
}

function parseAction(value: string | undefined): AdsterraScheduledAction | null {
  return value === "ON" || value === "OFF" ? value : null;
}
