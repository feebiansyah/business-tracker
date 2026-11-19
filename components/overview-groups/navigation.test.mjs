import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { loadTs } from "../../lib/filter/sync-baseline.test.mjs";
const require=createRequire(import.meta.url),React=require("react"),{renderToStaticMarkup}=require("react-dom/server");

test("shell loads member IDs in the existing bulk navigation query for both desktop and drawer",async()=>{
  const calls=[];
  const groups=[{id:8,name:"Dynamic",members:[{shopeeAccountId:1},{shopeeAccountId:2}]}];
  const {AppShell}=loadTs("components/layout/app-shell.tsx",{
    "@/lib/auth/session":{requireUser:async()=>({id:1})},
    "@/lib/prisma":{prisma:{
      shopeeAccount:{findMany:async args=>{calls.push(["accounts",args]);return[{id:1,name:"A"}];}},
      shopeeOverviewGroup:{findMany:async args=>{calls.push(["groups",args]);return groups;}},
    }},
    "./sidebar":{Sidebar:()=>null},"./topbar":{Topbar:()=>null},
  });
  const tree=await AppShell({children:null});
  assert.equal(calls.length,2);
  assert.deepEqual(calls[1][1].select.members,{select:{shopeeAccountId:true}});
  assert.strictEqual(tree.props.children[0].props.overviewGroups,groups);
  assert.strictEqual(tree.props.children[1].props.children[0].props.overviewGroups,groups);
});
test("shared desktop/mobile navigation nests dynamic groups and member accounts inside Shopee",()=>{
  const {SidebarNavigationPanel}=loadTs("components/layout/sidebar.tsx",{
    "next/navigation":{usePathname:()=>"/overview-gabungan/8"},
    "next/link":{default:({children,...p})=>React.createElement("a",p,children)},
    "next/image":{default:()=>null},
    "@/app/auth-actions":{logoutAction:()=>{}},
  });
  const html=renderToStaticMarkup(React.createElement(SidebarNavigationPanel,{pathname:"/overview-gabungan/8",shopeeAccounts:[{id:1,name:"Abdan"},{id:2,name:"Abdan2"},{id:3,name:"Barra"}],overviewGroups:[{id:8,name:"Grup dinamis",members:[{shopeeAccountId:1},{shopeeAccountId:2}]}]}));
  assert.doesNotMatch(html,/aria-label="Overview Gabungan"/);
  const shopee=html.split('<section aria-label="Shopee"')[1].split('</section>')[0];
  assert.match(shopee,/href="\/overview-gabungan\/8"[^>]*aria-current="page"/);
  assert.match(shopee,/aria-label="Tutup anggota Grup dinamis" aria-expanded="true"/);
  assert.equal((shopee.match(/href="\/shopee\/1"/g)||[]).length,1);
  assert.equal((shopee.match(/href="\/shopee\/2"/g)||[]).length,1);
  assert.match(shopee,/href="\/shopee\/3"/);
  assert.match(html,/href="\/shopee"/);assert.match(html,/href="\/settings"/);
  assert.match(html,/Grup dinamis/);
});

test("member workflow opens and activates its group without replacing the existing account submenu",()=>{
  const {SidebarNavigationPanel}=loadTs("components/layout/sidebar.tsx",{
    "next/link":{default:({children,...p})=>React.createElement("a",p,children)},
    "next/image":{default:()=>null},"@/app/auth-actions":{logoutAction:()=>{}},
  });
  const html=renderToStaticMarkup(React.createElement(SidebarNavigationPanel,{pathname:"/shopee/2/fix",shopeeAccounts:[{id:1,name:"A"},{id:2,name:"B"}],overviewGroups:[{id:9,name:"Nama baru",members:[{shopeeAccountId:1},{shopeeAccountId:2}]}]}));
  assert.match(html,/href="\/overview-gabungan\/9"[^>]*class="[^"]*text-blue-200/);
  assert.match(html,/aria-label="Tutup anggota Nama baru" aria-expanded="true"/);
  assert.match(html,/href="\/shopee\/2\/fix"/);
  assert.match(html,/aria-label="Tutup menu B" aria-expanded="true"/);
  assert.match(html,/href="\/shopee\/2"[^>]*class="[^"]*bg-slate-800 text-white/);
});
