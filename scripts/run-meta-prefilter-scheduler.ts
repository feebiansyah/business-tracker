import { prisma } from "../lib/prisma";
import { runPrefilterBatch } from "../lib/meta-prefilter/service";
import { runScheduledPrefilter } from "../lib/meta-prefilter/scheduler";
import { slotValue } from "../lib/meta-prefilter/model";

async function main() {
  const slot = slotValue(process.argv[2]);
  const result = await runScheduledPrefilter({ db: prisma, runBatch: runPrefilterBatch, slot, log: value => console.log(JSON.stringify(value)) });
  console.log(JSON.stringify(result));
  if (!result.success) process.exitCode = 1;
}

main().catch(() => {
  console.error("Scheduler PraFilter gagal; periksa slot AWAL/AKHIR dan hasil per akun.");
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
