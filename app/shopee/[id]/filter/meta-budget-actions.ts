"use server";

import { requireUser } from "@/lib/auth/session";
import { getMetaConfig } from "@/lib/meta/config";
import { MetaActionBudget } from "@/lib/meta-campaign-controls/action-budget";
import { MetaBudgetClient } from "@/lib/meta-campaign-controls/budget-client";
import { confirmBudget, executeBudget, parseBudgetSelection, readBudgetConfirmation } from "@/lib/meta-campaign-controls/budget-plan";
import { loadPreviewTarget, parsePreviewInput } from "@/lib/meta-campaign-controls/scope";
import { MetaReadError } from "@/lib/meta-campaign-controls/parse";
import type { BudgetExecution, BudgetPrepareResult, BudgetReadResult } from "@/lib/meta-campaign-controls/budget-types";

const safeMessage = (error: unknown) => error instanceof MetaReadError ? error.message : "Input/konfirmasi anggaran tidak valid atau gagal dibaca. Baca dan konfirmasi ulang; tidak ada POST dijadwalkan.";

export async function getMetaBudgetSnapshotAction(input: unknown): Promise<BudgetReadResult> {
  const budget = new MetaActionBudget();
  try {
    await budget.waitReadOnly(() => requireUser({ readOnly: true }));
    try {
      const scope = parsePreviewInput(input);
      const target = await budget.waitReadOnly(() => loadPreviewTarget(scope));
      if (!target) return { success: false, message: "Target tidak ditemukan dalam scope Shopee/Filter/Fix." };
      const snapshot = await new MetaBudgetClient(budget).snapshot(target);
      return { success: true, snapshot };
    } catch (error) { return { success: false, message: safeMessage(error) }; }
  } catch (error) {
    if (!(error instanceof MetaReadError) || error.kind !== "LIMIT") throw error;
    return { success: false, message: error.message };
  } finally { budget.close(); }
}

export async function prepareMetaBudgetAction(input: unknown): Promise<BudgetPrepareResult> {
  const budget = new MetaActionBudget();
  try {
    const user = await budget.waitReadOnly(() => requireUser({ readOnly: true }));
    try {
      const selection = parseBudgetSelection(input);
      const target = await budget.waitReadOnly(() => loadPreviewTarget(selection.scope));
      if (!target) return { success: false, message: "Target tidak ditemukan dalam scope Shopee/Filter/Fix." };
      const config = getMetaConfig(), client = new MetaBudgetClient(budget, config);
      const snapshot = await client.snapshot(target);
      budget.remaining();
      return { success: true, confirmation: confirmBudget(snapshot, selection, user.id, config) };
    } catch (error) { return { success: false, message: safeMessage(error) }; }
  } catch (error) {
    if (!(error instanceof MetaReadError) || error.kind !== "LIMIT") throw error;
    return { success: false, message: error.message };
  } finally { budget.close(); }
}

export async function executeMetaBudgetAction(input: unknown): Promise<BudgetExecution> {
  const budget = new MetaActionBudget();
  try {
    const user = await budget.waitReadOnly(() => requireUser({ readOnly: true }));
    try {
      const config = getMetaConfig(), confirmed = readBudgetConfirmation(input, user.id, config);
      const target = await budget.waitReadOnly(() => loadPreviewTarget(confirmed.selection.scope));
      if (!target) return { status: "RECONFIRM_REQUIRED", message: "Scope berubah; konfirmasi ulang diperlukan.", postSent: false, requests: budget.requests };
      const client = new MetaBudgetClient(budget, config);
      const snapshot = await client.snapshot(target);
      return await executeBudget(confirmed, snapshot, client);
    } catch (error) { return { status: "REJECTED", message: safeMessage(error), postSent: false, requests: budget.requests }; }
  } catch (error) {
    if (!(error instanceof MetaReadError) || error.kind !== "LIMIT") throw error;
    return { status: "REJECTED", message: error.message, postSent: false, requests: budget.requests };
  } finally { budget.close(); }
}
