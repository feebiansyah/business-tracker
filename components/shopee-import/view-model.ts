import Decimal from "decimal.js";
import type { ImportReceipt, ShopeeCommissionPreview, UnmatchedReason } from "@/lib/shopee-import/types";

export function formatImportRupiah(value:string){const rounded=new Decimal(value).toDecimalPlaces(0,Decimal.ROUND_HALF_UP).toFixed(0);return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(BigInt(rounded))}
const months=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
function dateLabel(value:string){const [year,month,day]=value.split("-").map(Number);return `${day} ${months[month-1]} ${year}`}
export function formatImportDateRange(from:string,to:string){return `${dateLabel(from)} – ${dateLabel(to)}`}
export function importReasonLabel(reason:UnmatchedReason){return reason==="CAMPAIGN_NOT_FOUND"?"Campaign tidak ditemukan":"Nama campaign ditemukan lebih dari satu"}
export function paginateUnmatched<T>(all:T[],requestedPage:number,pageSize:number){const pageCount=Math.max(1,Math.ceil(all.length/pageSize));const page=Math.min(Math.max(1,requestedPage),pageCount);return {rows:all.slice((page-1)*pageSize,page*pageSize),page,pageCount}}
export type ImportUiState={phase:"idle"|"previewing"|"previewed"|"importing"|"success"|"error";file:File|null;preview:ShopeeCommissionPreview|null;receipt:ImportReceipt|null;error:string|null};
export type ImportUiAction={type:"FILE_CHANGED";file:File|null}|{type:"PREVIEWING"}|{type:"PREVIEWED";preview:ShopeeCommissionPreview}|{type:"IMPORTING"}|{type:"IMPORT_SUCCEEDED";receipt:ImportReceipt}|{type:"FAILED";message:string};
export function reduceImportState(state:ImportUiState,action:ImportUiAction):ImportUiState{switch(action.type){case"FILE_CHANGED":return {phase:"idle",file:action.file,preview:null,receipt:null,error:null};case"PREVIEWING":return {...state,phase:"previewing",error:null};case"PREVIEWED":return {...state,phase:"previewed",preview:action.preview,receipt:null,error:null};case"IMPORTING":return {...state,phase:"importing",error:null};case"IMPORT_SUCCEEDED":return {...state,phase:"success",receipt:action.receipt,error:null};case"FAILED":{const stale=/berubah|tidak berlaku/i.test(action.message);return {...state,phase:"error",error:stale?`${action.message} Silakan lakukan Preview ulang.`:action.message}}}}
