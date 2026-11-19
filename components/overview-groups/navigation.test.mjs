import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { loadTs } from "../../lib/filter/sync-baseline.test.mjs";
const require=createRequire(import.meta.url),React=require("react"),{renderToStaticMarkup}=require("react-dom/server");
test("shared desktop/mobile navigation renders group links separately without replacing individual accounts",()=>{
  const {SidebarNavigationPanel}=loadTs("components/layout/sidebar.tsx",{
    "next/navigation":{usePathname:()=>"/overview-gabungan/8"},
    "next/link":{default:({children,...p})=>React.createElement("a",p,children)},
    "next/image":{default:()=>null},
    "@/app/auth-actions":{logoutAction:()=>{}},
  });
  const html=renderToStaticMarkup(React.createElement(SidebarNavigationPanel,{pathname:"/overview-gabungan/8",shopeeAccounts:[{id:1,name:"Abdan"}],overviewGroups:[{id:8,name:"Abdan Gabungan"}]}));
  assert.match(html,/Overview Gabungan/);assert.match(html,/href="\/overview-gabungan\/8"/);
  assert.match(html,/href="\/shopee"/);assert.match(html,/href="\/settings"/);
  assert.match(html,/Abdan Gabungan/);
});
