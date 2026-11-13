import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {loadTs} from "../../lib/filter/sync-baseline.test.mjs";
const require=createRequire(import.meta.url),React=require("react"),{renderToStaticMarkup}=require("react-dom/server");
function harness(saveAction,manualType=null,automatic="VIDEO"){
  let manualProp=manualType;
  const hooks=[],effects=[];let cursor=0;
  const hook=make=>{const i=cursor++;if(!(i in hooks))hooks[i]=make();return[hooks[i],i];};
  const react={...React,useRef:v=>hook(()=>({current:v}))[0],useState:v=>{const[x,i]=hook(()=>v);return[x,next=>{hooks[i]=typeof next==="function"?next(hooks[i]):next;}];},useEffect:fn=>{hook(()=>{effects.push(fn());return true;});}};
  const api=loadTs("components/filter/post-type-select.tsx",{react,"@/app/shopee/[id]/filter/post-type-actions":{saveCampaignPostTypeAction:saveAction}});
  const render=()=>{cursor=0;return api.PostTypeSelect({shopeeAccountId:7,metaCampaignId:"123",campaignName:"Campaign",manualType:manualProp,automatic});};
  const select=()=>{const tree=render();return React.Children.toArray(tree.props.children).find(c=>c.type==="select");};
  return{render,select,updateManual:value=>{manualProp=value;},unmount:()=>effects.forEach(f=>f?.())};
}
test("manual select has exact labels and restores automatic only after successful reset",async()=>{
  const inputs=[];const h=harness(async input=>{inputs.push(input);return{success:true,manualType:input.manualType};},"GAMBAR_PRODUK");
  assert.match(renderToStaticMarkup(h.render()),/GAMBAR PRODUK/);
  assert.match(renderToStaticMarkup(h.render()),/GAMBAR FEWFEED/);
  await h.select().props.onChange({target:{value:""}});
  assert.equal(inputs[0].manualType,null);assert.equal(inputs[0].shopeeAccountId,7);
  assert.equal(h.select().props.value,"");assert.match(renderToStaticMarkup(h.render()),/VIDEO/);assert.match(renderToStaticMarkup(h.render()),/Tersimpan/);h.unmount();
});
test("duplicate submit blocked; failure preserves saved type; unmounted response ignored",async()=>{
  let calls=0,resolve;const h=harness(async()=>{calls++;return new Promise(r=>{resolve=r;});});
  const select=h.select();const pending=select.props.onChange({target:{value:"GAMBAR_FEWFEED"}});await select.props.onChange({target:{value:"VIDEO"}});
  assert.equal(calls,1);assert.equal(h.select().props.disabled,true);
  resolve({success:false,message:"Gagal menyimpan"});await pending;
  assert.equal(h.select().props.value,"");assert.match(renderToStaticMarkup(h.render()),/Gagal menyimpan/);
  const late=h.select().props.onChange({target:{value:"VIDEO"}});h.unmount();resolve({success:true,manualType:"VIDEO"});await late;
  assert.equal(h.select().props.value,"");
});

test("subsequent server reads update a mounted selector without changing automatic data",()=>{
  const h=harness(async()=>{});
  h.render();h.updateManual("GAMBAR_PRODUK");h.render();assert.equal(h.select().props.value,"GAMBAR_PRODUK");
  h.updateManual(null);h.render();assert.equal(h.select().props.value,"");assert.match(renderToStaticMarkup(h.render()),/>VIDEO<\/p>/);h.unmount();
});
test("action authenticates before save and rejects persistence errors without claiming success",async()=>{
  const events=[];
  const action=loadTs("app/shopee/[id]/filter/post-type-actions.ts",{
    "@/lib/auth/session":{requireUser:async()=>{events.push("auth");}},
    "@/lib/campaign-post-type/repository":{saveCampaignPostType:async()=>{events.push("save");throw Error("private DB error");}},
    "next/cache":{revalidatePath:()=>events.push("revalidate")},
  });
  const result=await action.saveCampaignPostTypeAction({shopeeAccountId:7,metaCampaignId:"123",manualType:"VIDEO"});
  assert.deepEqual(events,["auth","save"]);assert.equal(result.success,false);assert.doesNotMatch(result.message,/private/);
});

test("settings with existing automatic detection display manual first and auto again after reset",()=>{
  const settings={id:"1",name:"Set",createdAt:null,contentType:"Video otomatis",placements:"Feed",age:"18+",locations:"ID",gender:"Semua"};
  for(const [manual,want,hidden] of [["GAMBAR_PRODUK","GAMBAR PRODUK","Video otomatis"],[null,"Video otomatis","GAMBAR PRODUK"]]){
    let index=0;const result={success:true,manualPostType:manual,target:{shopeeName:"Shop",wlName:"WL"},data:{reference:settings,adSetCount:1,differences:[],sameAcrossAll:true,matchingAdSetCount:1,partial:false,warnings:[]}};
    const api=loadTs("components/filter/meta-campaign-settings.tsx",{react:{...React,useState:()=>[index++===0?result:false,()=>{}],useRef:v=>({current:v}),useCallback:f=>f,useEffect:()=>{}},"@/app/shopee/[id]/filter/meta-settings-actions":{}});
    const html=renderToStaticMarkup(api.MetaCampaignSettings({mode:"fix",shopeeAccountId:7,campaignId:1}));
    assert.match(html,new RegExp(want));assert.doesNotMatch(html,new RegExp(hidden));
  }
});

test("settings action reads manual override without additional automatic/provider reads",async()=>{
  let providerReads=0,overrideReads=0;
  const automatic={reference:{contentType:"Video"},differences:[],warnings:[]};
  const db={campaign:{findFirst:async q=>{assert.equal(q.where.metaAccount.shopeeAccountId,7);return{id:1,metaCampaignId:"123",name:"Campaign",metaAccount:{name:"WL",shopeeAccount:{name:"Shop"}}};}},campaignPostTypeOverride:{findMany:async q=>{overrideReads++;assert.deepEqual(q.where,{shopeeAccountId:7,metaCampaignId:{in:["123"]}});return[{metaCampaignId:"123",manualType:"GAMBAR_FEWFEED"}];}}};
  const api=loadTs("app/shopee/[id]/filter/meta-settings-actions.ts",{"@/lib/prisma":{prisma:db},"@/lib/auth/session":{requireUser:async()=>{}},"@/lib/meta-campaign-controls/read-client":{MetaCampaignReadClient:class{}},"@/lib/meta-campaign-settings/reader":{readMetaCampaignSettings:async()=>{providerReads++;return automatic;}}});
  for(const mode of ["filter","fix","off-filter","off-fix"]){const result=await api.getMetaCampaignSettingsAction({shopeeAccountId:7,campaignId:1,mode});assert.equal(result.success,true);assert.equal(result.manualPostType,"GAMBAR_FEWFEED");assert.equal(result.data.reference.contentType,"Video");}
  assert.equal(providerReads,4);assert.equal(overrideReads,4);
});
