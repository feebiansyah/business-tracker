import "server-only";

import { MetaReadError } from "./parse";
import { hierarchyObjects, minimumRemainingRequests } from "./off-plan";
import { readCampaignPreview } from "./preview";
import type { MetaPausedClient } from "./off-client";
import type { OffExecution, OffObject, OffObjectResult, OffPlan } from "./off-types";
import type { MetaObjectView } from "./types";

const pauseVerified = (row: OffObjectResult) => row.state === "VERIFIED_PAUSED" || row.state === "ALREADY_PAUSED";
const identity = (object: OffObject) => JSON.stringify([object.kind, object.id, object.parentId, object.name]);
const failureMessage = (error: unknown) => error instanceof MetaReadError && error.kind === "LIMIT" ? "Batas waktu/request tercapai; request berikutnya dihentikan."
  : error instanceof MetaReadError && error.kind === "INTEGRITY" ? "Scope/relasi berubah atau tidak valid; konfirmasi ulang diperlukan."
    : "Pembacaan/verifikasi Meta gagal. Error bukan bukti objek sudah OFF.";

export async function executeOffPlan(plan: OffPlan, client: MetaPausedClient): Promise<OffExecution> {
  // An execution result exists before the first possible write, so later failures retain all outcomes.
  const objects: OffObjectResult[] = plan.objects.map((object) => ({ object, state: "NOT_ATTEMPTED", message: "Belum dijalankan.", readAt: null, postSent: false }));
  const verifiedObjects: MetaObjectView[] = [];
  let finalRead: OffExecution["finalRead"] = "FAILED";
  let hierarchy: OffExecution["hierarchy"];
  const newObjects: OffObject[] = [];
  let stopReason = "";
  if (client.budget.requests + minimumRemainingRequests(plan) > 100) {
    return { status: "PARTIAL", message: "Rencana ditolak sebelum POST: biaya request/pagination teramati melampaui 100. Gunakan target tunggal yang lebih kecil.", objects, finalRead, newObjects, verifiedObjects, requests: client.budget.requests, finishedAt: new Date().toISOString() };
  }
  try {
    for (let index = 0; index < objects.length; index++) {
      const row = objects[index];
      if (index > 0 && plan.selection.kind === "ALL" && !pauseVerified(objects[0])) { stopReason = "Campaign belum terverifikasi PAUSED; penulisan turunan dihentikan."; break; }
      client.budget.remaining();
      if (row.object.configuredStatus === "PAUSED") {
        row.state = "ALREADY_PAUSED"; row.readAt = plan.hierarchy?.readAt ?? new Date().toISOString(); row.message = "configured_status PAUSED terverifikasi pada preflight; tidak di-POST ulang.";
        continue;
      }
      try {
        const before = await client.proof(plan.target, row.object);
        if (identity(before) !== identity(row.object)) { stopReason = "Identitas/nama/relasi target berubah. Konfirmasi ulang diperlukan."; row.message = stopReason; break; }
        if (before.configuredStatus === "PAUSED") {
          row.state = "ALREADY_PAUSED"; row.readAt = new Date().toISOString(); row.message = "Sudah PAUSED pada GET sebelum write; tidak di-POST ulang."; verifiedObjects.push(before); continue;
        }
        if (before.configuredStatus !== row.object.configuredStatus) {
          stopReason = "Status konfigurasi berubah/tidak tersedia pada GET sebelum write. Konfirmasi ulang diperlukan.";
          row.message = stopReason; break;
        }
        for (const object of plan.objects) plan.proofReadCosts[object.id] = Math.max(plan.proofReadCosts[object.id], client.proofReadCost(plan.target, object));
        if (client.budget.requests + minimumRemainingRequests(plan, index, true) > 100) {
          stopReason = "Biaya pagination terbaru melampaui sisa budget verifikasi; POST berikutnya tidak dijalankan.";
          row.message = stopReason; break;
        }
        client.budget.remaining();
        const requestsBeforePost = client.budget.requests;
        let acknowledgement;
        try { acknowledgement = await client.pause(row.object.id); }
        finally { row.postSent = client.budget.requests > requestsBeforePost; }
        row.state = row.postSent ? "UNVERIFIED" : "NOT_ATTEMPTED";
        row.message = "POST belum dapat dipastikan; tidak ada retry POST otomatis.";
        try {
          const after = await client.proof(plan.target, row.object);
          row.readAt = new Date().toISOString(); verifiedObjects.push(after);
          if (after.configuredStatus === "PAUSED") {
            row.state = "VERIFIED_PAUSED"; row.message = acknowledgement === "ACKNOWLEDGED" ? "GET memverifikasi configured_status PAUSED." : "Respons POST tidak pasti/ditolak, tetapi GET memverifikasi PAUSED; penyebab perubahan tidak diasumsikan.";
          } else {
            row.state = acknowledgement === "REJECTED" ? "FAILED" : "UNVERIFIED";
            row.message = acknowledgement === "REJECTED" ? "POST ditolak dan GET belum menunjukkan PAUSED." : "GET belum menunjukkan PAUSED; POST mungkin masih diterapkan. Jangan retry otomatis.";
          }
        } catch (error) {
          row.state = row.postSent ? "UNVERIFIED" : "NOT_ATTEMPTED"; row.message = failureMessage(error);
          if (error instanceof MetaReadError && error.kind === "INTEGRITY") { stopReason = row.message; break; }
        }
      } catch (error) {
        row.state = row.postSent ? "UNVERIFIED" : "NOT_ATTEMPTED"; row.message = failureMessage(error); stopReason = row.message; break;
      }
      if (index === 0 && plan.selection.kind === "ALL" && !pauseVerified(row)) { stopReason = "Campaign gagal/belum terverifikasi PAUSED; penulisan turunan dihentikan."; break; }
    }
    client.budget.remaining();
    let finalObjects: OffObject[];
    if (plan.selection.kind === "ALL") {
      await client.object(plan.target, plan.target.campaign.id, "campaign");
      const final = await readCampaignPreview(plan.target, client.freshHierarchyReader());
      if (!final.success) throw new MetaReadError(final.kind ?? "PROVIDER", "Pembacaan akhir gagal.");
      hierarchy = final.data; finalRead = hierarchy.readState === "COMPLETE" ? "COMPLETE" : "PARTIAL";
      finalObjects = hierarchyObjects(hierarchy);
      const confirmed = new Map(plan.objects.map((object) => [object.id, object]));
      for (const object of finalObjects) {
        const previous = confirmed.get(object.id);
        if (!previous) newObjects.push(object);
        else if (previous.parentId !== object.parentId || previous.kind !== object.kind) finalRead = "PARTIAL";
      }
      if (finalObjects.length !== plan.objects.length) finalRead = "PARTIAL";
    } else {
      finalObjects = [await client.proof(plan.target, plan.objects[0])]; finalRead = "COMPLETE";
    }
    verifiedObjects.push(...finalObjects);
    const finalMap = new Map(finalObjects.map((object) => [object.id, object]));
    for (const row of objects) {
      const current = finalMap.get(row.object.id);
      if (!current || current.kind !== row.object.kind || current.parentId !== row.object.parentId || current.configuredStatus !== "PAUSED") {
        if (pauseVerified(row)) { row.state = "UNVERIFIED"; row.message = "Pembacaan akhir tidak membuktikan target tetap PAUSED dalam scope yang dikonfirmasi."; }
      } else if (row.postSent && (row.state === "UNVERIFIED" || row.state === "FAILED")) {
        const previous = row.message;
        row.state = "VERIFIED_PAUSED";
        row.message = `${previous} GET akhir kini memverifikasi jenis/relasi target dan configured_status PAUSED; penyebab perubahan status tidak diasumsikan.`;
        row.readAt = new Date().toISOString();
      }
    }
  } catch (error) { stopReason = failureMessage(error); }
  const complete = finalRead === "COMPLETE" && newObjects.length === 0 && objects.every(pauseVerified);
  return {
    status: complete ? "COMPLETE" : "PARTIAL",
    message: complete ? "Seluruh objek dalam rencana terkonfirmasi PAUSED pada pembacaan akhir. Tidak ada Sync database otomatis."
      : `${stopReason || "Tidak semua objek dapat diverifikasi PAUSED."}${newObjects.length ? ` ${newObjects.length} objek baru di luar rencana tidak disentuh.` : ""} Tidak ada rollback atau retry POST otomatis.`,
    objects, finalRead, newObjects, verifiedObjects, ...(hierarchy ? { hierarchy } : {}), requests: client.budget.requests, finishedAt: new Date().toISOString(),
  };
}
