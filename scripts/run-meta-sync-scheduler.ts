import { prisma } from "../lib/prisma";
import { runMetaSyncBatch } from "../lib/filter/meta-sync-batch";
import { runScheduledMetaSyncs } from "../lib/filter/meta-sync-scheduler";

async function main() {
  const result = await runScheduledMetaSyncs({ db: prisma, runBatch: runMetaSyncBatch });
  console.log(JSON.stringify(result));
}

main()
  .catch(() => {
    console.error("Scheduler Sync Meta gagal.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

