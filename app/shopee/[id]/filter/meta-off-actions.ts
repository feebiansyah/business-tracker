"use server";

import { requireUser } from "@/lib/auth/session";
import { getMetaConfig } from "@/lib/meta/config";
import { MetaActionBudget } from "@/lib/meta-campaign-controls/action-budget";
import { MetaPausedClient } from "@/lib/meta-campaign-controls/off-client";
import { confirmOffPlan, readOffConfirmation } from "@/lib/meta-campaign-controls/off-confirmation";
import { executeOffPlan } from "@/lib/meta-campaign-controls/off-execution";
import { buildOffPlan, minimumRemainingRequests, parseOffSelection, planDigest } from "@/lib/meta-campaign-controls/off-plan";
import { loadPreviewTarget } from "@/lib/meta-campaign-controls/scope";
import { MetaReadError } from "@/lib/meta-campaign-controls/parse";
import type { ExecuteOffResult, PrepareOffResult } from "@/lib/meta-campaign-controls/off-types";

const message = (error: unknown) => error instanceof MetaReadError ? error.message : "Rencana/konfirmasi OFF tidak valid atau gagal dibaca. Tidak ada POST dijalankan; buat konfirmasi baru.";

export async function prepareMetaOffAction(input: unknown): Promise<PrepareOffResult> {
  const budget = new MetaActionBudget();
  try {
    const user = await budget.waitReadOnly(() => requireUser({ readOnly: true }));
    try {
      const selection = parseOffSelection(input);
      const target = await budget.waitReadOnly(() => loadPreviewTarget(selection.scope));
      if (!target) return { success: false, message: "Target tidak ditemukan dalam scope Shopee/Filter/Fix." };
      const config = getMetaConfig(), client = new MetaPausedClient(budget, config);
      const plan = await budget.waitReadOnly(() => buildOffPlan(selection, target, client));
      if (budget.requests + minimumRemainingRequests(plan) > 100) return { success: false, message: "Kebutuhan request rencana melampaui batas 100; gunakan OFF satu objek." };
      return { success: true, confirmation: confirmOffPlan(plan, user.id, config) };
    } catch (error) { return { success: false, message: message(error) }; }
  } catch (error) {
    if (!(error instanceof MetaReadError) || error.kind !== "LIMIT") throw error;
    return { success: false, message: error.message };
  } finally { budget.close(); }
}

export async function executeMetaOffAction(confirmationToken: unknown): Promise<ExecuteOffResult> {
  const budget = new MetaActionBudget();
  try {
    const user = await budget.waitReadOnly(() => requireUser({ readOnly: true }));
    try {
      const config = getMetaConfig(), confirmed = readOffConfirmation(confirmationToken, user.id, config);
      const target = await budget.waitReadOnly(() => loadPreviewTarget(confirmed.selection.scope));
      if (!target) return { success: false, status: "RECONFIRM_REQUIRED", message: "Scope target berubah/tidak tersedia. Konfirmasi ulang diperlukan." };
      const client = new MetaPausedClient(budget, config);
      const plan = await budget.waitReadOnly(() => buildOffPlan(confirmed.selection, target, client));
      if (planDigest(plan) !== confirmed.digest) return { success: false, status: "RECONFIRM_REQUIRED", message: "Target, nama/status, relasi, atau daftar objek berubah sejak konfirmasi. Tidak ada POST dijalankan. Baca dan konfirmasi ulang." };
      // NEVER race the mutation pipeline against a timeout. Every subsequent request checks the shared abort/deadline.
      return { success: true, result: await executeOffPlan(plan, client) };
    } catch (error) { return { success: false, status: "REJECTED", message: message(error) }; }
  } catch (error) {
    if (!(error instanceof MetaReadError) || error.kind !== "LIMIT") throw error;
    return { success: false, status: "REJECTED", message: error.message };
  } finally { budget.close(); }
}
