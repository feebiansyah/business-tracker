import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {loadTs} from "../../lib/filter/sync-baseline.test.mjs";
const require=createRequire(import.meta.url),React=require("react"),{renderToStaticMarkup}=require("react-dom/server");
const initial={account:{id:7,name:"Shop"},businessDate:"2026-11-07",snapshots:{AWAL:null,AKHIR:null},progress:null,notes:[]};
function harness(action, data=initial, save=async()=>({success:false,message:"Gagal menyimpan"})){
  const hooks=[],effects=[];let cursor=0,readCalls=0;
  const hook=make=>{const i=cursor++;if(!(i in hooks))hooks[i]=make();return[hooks[i],i];};
  const fakeReact={...React,useRef:v=>hook(()=>({current:v}))[0],useState:v=>{const[value,i]=hook(()=>v);return[value,v=>{hooks[i]=typeof v==="function"?v(hooks[i]):v;}];},useEffect:fn=>{hook(()=>{effects.push(fn());return true;});}};
  const api=loadTs("components/meta-prefilter/workspace.tsx",{__date:Date,react:fakeReact,"@/app/shopee/[id]/prefilter/actions":{savePrefilterNoteAction:save,snapshotPrefilterAction:action,readPrefilterAction:async()=>{readCalls++;return{success:true,data};}}});
  const render=()=>{cursor=0;return api.PrefilterWorkspace({initial:data});};
  const inputs=tree=>{const found=[];function visit(n){if(!n||typeof n!=="object")return;if(n.type==="input")found.push(n);for(const c of React.Children.toArray(n.props?.children))visit(c);}visit(tree);return found;};
  const buttons=tree=>{const result=[];function visit(n){if(!n||typeof n!=="object")return;if(n.type==="button")result.push(n);for(const child of React.Children.toArray(n.props?.children))visit(child);}visit(tree);return result;};
  return{render,buttons,inputs,unmount:()=>effects.forEach(fn=>fn?.()),readCalls:()=>readCalls};
}
test("manual snapshot locks duplicate clicks, stops on unmount, and never polls",async()=>{
  let calls=0,resolve;const gate=new Promise(r=>{resolve=r;});
  const h=harness(async()=>{calls++;await gate;return{success:true,batch:{progress:{runId:"run1",slot:"AWAL",businessDate:"2026-11-07",status:"COMPLETE",current:1,total:1,pages:2,skipped:[],message:null},shouldContinue:false,blocked:false}};});
  const buttons=h.buttons(h.render());const pending=buttons[0].props.onClick();buttons[0].props.onClick();assert.equal(calls,1);
  h.unmount();resolve();await pending;assert.equal(h.readCalls(),0);assert.equal(calls,1);
});
test("two slots and zero-click CPC are visible with internal table scrolling",()=>{
  const api=loadTs("components/meta-prefilter/workspace.tsx",{"@/app/shopee/[id]/prefilter/actions":{}});
  const data={...initial,snapshots:{AWAL:{runId:"r",requestedAt:"2026-11-07T03:17:42Z",finishedAt:"2026-11-07T03:18:00Z",skipped:[],rows:[{metaCampaignId:"123",campaignName:"Campaign",metaAccountId:1,wlName:"WL",configuredStatus:"ACTIVE",effectiveStatus:"ACTIVE",spend:"100",withFee:"105",clicks:"0",cpc:null}]},AKHIR:null}};
  const html=renderToStaticMarkup(React.createElement(api.PrefilterWorkspace,{initial:data}));
  assert.match(html,/Snapshot Awal/);assert.match(html,/Snapshot Akhir/);assert.match(html,/10\.17\.42/);assert.match(html,/>CPC<\/th>/);assert.match(html,/overflow-x-auto/);assert.doesNotMatch(html,/<details/);
  assert.equal((html.match(/<td /g)||[]).length,14);assert.match(html,/Note Campaign/);assert.match(html,/Selesai Campaign/);
});

test("note badge and checkbox change only after confirmed save; failure and double click preserve state",async()=>{
  const row={metaCampaignId:"123",campaignName:"Campaign",metaAccountId:1,wlName:"WL",spend:"100",withFee:"105",clicks:"1",cpc:"100"};
  const data={...initial,snapshots:{AWAL:{runId:"r",requestedAt:"2026-11-07T03:00:00Z",finishedAt:"2026-11-07T03:01:00Z",skipped:[],rows:[row]},AKHIR:null},notes:[{metaCampaignId:"123",note:"Periksa",completed:false}]};
  let calls=0,resolve;const gate=new Promise(r=>{resolve=r;});
  const h=harness(async()=>{throw new Error("No snapshot allowed");},data,async input=>{calls++;await gate;return{success:true,note:{metaCampaignId:input.metaCampaignId,note:input.note,completed:input.completed}};});
  const checkbox=h.inputs(h.render()).find(n=>n.props.type==="checkbox");
  const pending=checkbox.props.onChange({target:{checked:true}});checkbox.props.onChange({target:{checked:true}});
  assert.equal(calls,1);assert.match(renderToStaticMarkup(h.render()),/1 note belum selesai/);
  assert(h.buttons(h.render()).every(b=>b.props.disabled));resolve();await pending;
  const html=renderToStaticMarkup(h.render());assert.doesNotMatch(html,/note belum selesai/);assert.match(html,/Tersimpan/);assert.equal(h.readCalls(),0);h.unmount();
  const fail=harness(async()=>{},data);await fail.inputs(fail.render()).find(n=>n.props.type==="checkbox").props.onChange({target:{checked:true}});
  assert.match(renderToStaticMarkup(fail.render()),/1 note belum selesai/);assert.match(renderToStaticMarkup(fail.render()),/Gagal menyimpan/);assert.equal(fail.readCalls(),0);fail.unmount();
});

test("blank notes do not warn; edits save on blur without snapshot or read request",async()=>{
  const row={metaCampaignId:"123",campaignName:"Campaign",metaAccountId:1,wlName:"WL",spend:"100",withFee:"105",clicks:"1",cpc:"100"};
  const data={...initial,snapshots:{AWAL:{runId:"r",requestedAt:"2026-11-07T03:00:00Z",finishedAt:"2026-11-07T03:01:00Z",skipped:[],rows:[row]},AKHIR:null},notes:[{metaCampaignId:"123",note:"   ",completed:false}]};
  const requests=[];const h=harness(async()=>{throw new Error("No Meta");},data,async input=>{requests.push(input);return{success:true,note:{metaCampaignId:input.metaCampaignId,note:input.note.trim(),completed:input.completed}};});
  assert.doesNotMatch(renderToStaticMarkup(h.render()),/note belum selesai/);
  const input=h.inputs(h.render()).find(n=>n.props["aria-label"]==="Note Campaign");
  input.props.onChange({target:{value:"Periksa"}});await h.inputs(h.render()).find(n=>n.props["aria-label"]==="Note Campaign").props.onBlur({currentTarget:{value:"Periksa"}});
  assert.equal(requests.length,1);assert.equal(requests[0].shopeeAccountId,7);assert.equal(requests[0].businessDate,"2026-11-07");assert.match(renderToStaticMarkup(h.render()),/1 note belum selesai/);assert.equal(h.readCalls(),0);h.unmount();
});

test("editing clears old saved feedback; moving focus to Selesai saves draft and completion once",async()=>{
  const row={metaCampaignId:"123",campaignName:"Campaign",metaAccountId:1,wlName:"WL",spend:"100",withFee:"105",clicks:"1",cpc:"100"};
  const data={...initial,snapshots:{AWAL:{runId:"r",requestedAt:"2026-11-07T03:00:00Z",finishedAt:"2026-11-07T03:01:00Z",skipped:[],rows:[row]},AKHIR:null}};
  const calls=[];const h=harness(async()=>{},data,async input=>{calls.push(input);return{success:true,note:{metaCampaignId:input.metaCampaignId,note:input.note,completed:input.completed}};});
  const note=()=>h.inputs(h.render()).find(n=>n.props["aria-label"]==="Note Campaign"), checkbox=()=>h.inputs(h.render()).find(n=>n.props.type==="checkbox");
  note().props.onChange({target:{value:"A"}});await note().props.onBlur({currentTarget:{value:"A"}});
  assert.match(renderToStaticMarkup(h.render()),/Tersimpan/);
  note().props.onChange({target:{value:"B"}});assert.doesNotMatch(renderToStaticMarkup(h.render()),/Tersimpan/);
  await note().props.onBlur({currentTarget:{value:"B"},relatedTarget:{getAttribute:()=>"123"}});
  assert.equal(calls.length,1);assert.equal(checkbox().props.disabled,false);
  await checkbox().props.onChange({target:{checked:true}});
  assert.equal(calls.length,2);assert.equal(calls[1].note,"B");assert.equal(calls[1].completed,true);
  assert.doesNotMatch(renderToStaticMarkup(h.render()),/note belum selesai/);h.unmount();
});

test("midnight hides yesterday locally without fetching or starting another snapshot",t=>{
  t.mock.timers.enable({apis:["setTimeout","Date"],now:Date.parse("2026-11-07T16:59:59Z")});
  let calls=0;const h=harness(async()=>{calls++;});h.render();
  t.mock.timers.tick(1000);const html=renderToStaticMarkup(h.render());
  assert.match(html,/8 November 2026/);assert.match(html,/Tanggal WIB berganti/);assert.equal(calls,0);assert.equal(h.readCalls(),0);h.unmount();
});

test("partial notice retains skipped WL names after rereading the previous snapshot",async()=>{
  const h=harness(async()=>({success:true,batch:{progress:{runId:"partial",slot:"AWAL",status:"PARTIAL",current:2,total:2,pages:3,skipped:["WL Dua: tidak dapat dibaca (kode 200)"],message:"Snapshot COMPLETE sebelumnya tetap ditampilkan."},shouldContinue:false,blocked:false}}));
  await h.buttons(h.render())[0].props.onClick();
  const html=renderToStaticMarkup(h.render());
  assert.match(html,/WL Dua: tidak dapat dibaca/);assert.match(html,/Snapshot COMPLETE sebelumnya tetap ditampilkan/);assert.equal(h.readCalls(),1);h.unmount();
});
