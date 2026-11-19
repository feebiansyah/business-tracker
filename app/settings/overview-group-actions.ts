"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { saveOverviewGroup,deleteOverviewGroup,OverviewGroupError } from "@/lib/overview-groups/repository";

export async function saveOverviewGroupAction(form: FormData) {
  await requireUser();
  try {
    const id = form.get("id");
    await saveOverviewGroup(prisma, { id: id === null ? undefined : Number(id),name: form.get("name"),memberIds: form.getAll("memberIds").map(Number) });
  } catch (error) {
    return { success: false,message: error instanceof OverviewGroupError ? error.message : "Grup belum dapat disimpan. Muat ulang untuk memeriksa hasil sebelum mencoba lagi." };
  }
  revalidatePath("/", "layout");
  return { success: true,message: "Grup berhasil disimpan." };
}

export async function deleteOverviewGroupAction(id: number) {
  await requireUser();
  try { await deleteOverviewGroup(prisma,id); }
  catch { return { success: false,message: "Grup belum dapat dihapus. Muat ulang untuk memeriksa hasil." }; }
  revalidatePath("/", "layout");
  return { success: true,message: "Grup dihapus. Data akun tetap tersimpan." };
}
