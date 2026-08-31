"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

function getRequiredText(formData: FormData, field: string) {
  const value = formData.get(field);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} wajib diisi.`);
  return value.trim();
}

function getStatus(formData: FormData) { return formData.get("status") === "INACTIVE" ? "INACTIVE" : "ACTIVE"; }

export async function createShopeeAccount(formData: FormData) {
  const shopIdValue = formData.get("shopId");
  const shopId = typeof shopIdValue === "string" && shopIdValue.trim() ? shopIdValue.trim() : null;
  await prisma.shopeeAccount.create({ data: { name: getRequiredText(formData, "name"), shopId, status: getStatus(formData) } });
  revalidatePath("/shopee");
  redirect("/shopee");
}

export async function createMetaAccount(formData: FormData) {
  const businessManagerId = Number(formData.get("businessManagerId"));
  const shopeeAccountIdValue = formData.get("shopeeAccountId");
  const shopeeAccountId = typeof shopeeAccountIdValue === "string" && shopeeAccountIdValue ? Number(shopeeAccountIdValue) : null;
  if (!Number.isInteger(businessManagerId) || (shopeeAccountId !== null && !Number.isInteger(shopeeAccountId))) throw new Error("Business Manager wajib dipilih.");
  const [businessManager, shopeeAccount] = await Promise.all([prisma.businessManager.findUnique({ where: { id: businessManagerId }, select: { id: true } }), shopeeAccountId ? prisma.shopeeAccount.findUnique({ where: { id: shopeeAccountId }, select: { id: true } }) : null]);
  if (!businessManager || (shopeeAccountId !== null && !shopeeAccount)) throw new Error("Business Manager atau Akun Shopee yang dipilih tidak ditemukan.");
  await prisma.metaAccount.create({ data: { name: getRequiredText(formData, "name"), accountId: getRequiredText(formData, "accountId"), status: getStatus(formData), businessManagerId, shopeeAccountId } });
  revalidatePath("/wl");
  revalidatePath("/shopee");
  redirect(shopeeAccountId ? `/shopee/${shopeeAccountId}` : "/wl");
}

export async function updateMetaAccountShopeeConnection(formData: FormData) {
  const metaAccountId = Number(formData.get("metaAccountId"));
  const value = formData.get("shopeeAccountId");
  const shopeeAccountId = typeof value === "string" && value ? Number(value) : null;
  if (!Number.isInteger(metaAccountId) || (shopeeAccountId !== null && !Number.isInteger(shopeeAccountId))) throw new Error("Data WL atau Akun Shopee tidak valid.");
  if (shopeeAccountId !== null) {
    const shopeeAccount = await prisma.shopeeAccount.findUnique({ where: { id: shopeeAccountId }, select: { id: true } });
    if (!shopeeAccount) throw new Error("Akun Shopee yang dipilih tidak ditemukan.");
  }
  await prisma.metaAccount.update({ where: { id: metaAccountId }, data: { shopeeAccountId } });
  revalidatePath("/wl");
  revalidatePath("/shopee");
  redirect("/wl");
}
