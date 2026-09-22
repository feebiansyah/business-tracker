import { handleAdsterraSchedulerRequest } from "@/lib/adsterra-scheduler/http-handler";
import { runAdsterraScheduledCampaigns } from "@/lib/adsterra-scheduler/runner";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleAdsterraSchedulerRequest(request, {
    cronSecret: process.env.ADSTERRA_SCHEDULER_CRON_SECRET,
    run: runAdsterraScheduledCampaigns,
  });
}
