import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import type { ShopeeImportPageData } from "./types.ts";

type HistoryDb = Pick<PrismaClient,"shopeeAccount">|Pick<Prisma.TransactionClient,"shopeeAccount">;
const day=(value:Date)=>value.toISOString().slice(0,10);

export async function getShopeeImportPageData(db:HistoryDb,id:number):Promise<ShopeeImportPageData|null>{
 const account=await db.shopeeAccount.findUnique({where:{id},select:{id:true,name:true,commissionImports:{take:50,orderBy:{createdAt:"desc"},select:{id:true,originalFilename:true,dateFrom:true,dateTo:true,csvRowCount:true,tagCount:true,matchedCount:true,unmatchedCount:true,matchedCommission:true,unmatchedCommission:true,createdAt:true}}}});
 if(!account)return null;
 return {shopeeAccount:{id:account.id,name:account.name},history:account.commissionImports.map(row=>({...row,dateFrom:day(row.dateFrom),dateTo:day(row.dateTo),matchedCommission:row.matchedCommission.toFixed(5),unmatchedCommission:row.unmatchedCommission.toFixed(5),createdAt:row.createdAt.toISOString()}))};
}
