import { timingSafeEqual } from "node:crypto";
import { aggregateCommissionRows } from "./aggregate.ts";
import { decodeAndParseCsv } from "./csv.ts";
import { aggregateClickaduCommissions } from "./clickadu-commission.ts";
import { aggregateAdsterraCommissions } from "./adsterra-commission.ts";
import { ShopeeImportError } from "./errors.ts";
import { buildMatchDigest,sha256 } from "./fingerprint.ts";
import { matchCommissionAggregates } from "./matching.ts";
import { sanitizeFilename,validateShopeeAccountId } from "./upload.ts";
import type { AdsterraConfigCandidate,CampaignCandidate,ClickaduConfigCandidate,ImportReceipt,PersistImportInput,PreviewConfirmation } from "./types.ts";
import type { ImportTransaction } from "./persistence.ts";
export type ImporterDeps={withTransaction<T>(work:(tx:ImportTransaction)=>Promise<T>):Promise<T>;lockAccount(tx:ImportTransaction,id:number):Promise<void>;loadCampaigns(tx:ImportTransaction,id:number):Promise<CampaignCandidate[]>;loadClickaduConfigs(tx:ImportTransaction,id:number):Promise<ClickaduConfigCandidate[]>;loadAdsterraConfigs?(tx:ImportTransaction,id:number):Promise<AdsterraConfigCandidate[]>;persist(tx:ImportTransaction,input:PersistImportInput):Promise<ImportReceipt>};
export type FinalImportInput={shopeeAccountId:number;originalFilename:string;bytes:Uint8Array;confirmation:PreviewConfirmation};
export function validatePreviewConfirmation(value:unknown):asserts value is PreviewConfirmation{if(!value||typeof value!=="object"||Object.keys(value).sort().join(",")!=="fileSha256,matchDigest"){throw new ShopeeImportError("INVALID_CONFIRMATION","Konfirmasi preview tidak valid.")}const x=value as PreviewConfirmation;if(!/^[a-f0-9]{64}$/.test(x.fileSha256)||!/^[a-f0-9]{64}$/.test(x.matchDigest))throw new ShopeeImportError("INVALID_CONFIRMATION","Konfirmasi preview tidak valid.")}
const equal=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function isTransientImportError(e:unknown){const x=e as {code?:unknown;message?:unknown};return x?.code==="P2034"||x?.code===1213||/ECONNRESET|connection reset/i.test(String(x?.message??""))}
export async function importShopeeCommissions(input:FinalImportInput,deps:ImporterDeps){validateShopeeAccountId(input.shopeeAccountId);validatePreviewConfirmation(input.confirmation);const originalFilename=sanitizeFilename(input.originalFilename);const fileSha256=sha256(input.bytes);if(!equal(fileSha256,input.confirmation.fileSha256))throw new ShopeeImportError("FILE_CHANGED","File berubah sejak preview.");const records=decodeAndParseCsv(input.bytes);const aggregation=aggregateCommissionRows(records);
 for(let attempt=0;;attempt++){try{return await deps.withTransaction(async tx=>{await deps.lockAccount(tx,input.shopeeAccountId);const campaigns=await deps.loadCampaigns(tx,input.shopeeAccountId);const match=matchCommissionAggregates(aggregation.aggregates,campaigns);const digest=buildMatchDigest(input.shopeeAccountId,{...aggregation,...match});if(!equal(digest,input.confirmation.matchDigest))throw new ShopeeImportError("PREVIEW_STALE","Preview sudah tidak berlaku.");const clickaduConfigs=await deps.loadClickaduConfigs(tx,input.shopeeAccountId);const adsterraConfigs=deps.loadAdsterraConfigs?await deps.loadAdsterraConfigs(tx,input.shopeeAccountId):[];const clickaduCommissions=aggregateClickaduCommissions(records,clickaduConfigs);const adsterraCommissions=aggregateAdsterraCommissions(records,adsterraConfigs);return deps.persist(tx,{...aggregation,...match,clickaduCommissions,adsterraCommissions,shopeeAccountId:input.shopeeAccountId,originalFilename,fileSha256})})}catch(e){if(attempt>=2||!isTransientImportError(e))throw e}}
}
