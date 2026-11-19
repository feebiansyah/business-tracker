import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {loadTs} from "../../lib/filter/sync-baseline.test.mjs";
const require=createRequire(import.meta.url),React=require("react"),{renderToStaticMarkup}=require("react-dom/server");
test("group report labels each origin, keeps unknown values and exposes no combined write actions",()=>{
  const {OverviewGroupReport}=loadTs("components/overview-groups/group-report.tsx",{
    "@/components/shopee/status-badge":loadTs("components/shopee/status-badge.tsx"),
    "@/components/dashboard/shopee-performance-card":loadTs("components/dashboard/shopee-performance-card.tsx",{
      "next/link":{default:({children,...p})=>React.createElement("a",p,children)},
      "./dashboard-page-size-select":{DashboardPageSizeSelect:()=>null},
    }),
    "next/link":{default:({children,...p})=>React.createElement("a",p,children)},
    "@/components/traffic-balances/traffic-balances":{TrafficBalances:()=>null},
    "@/components/dashboard/dashboard-page-size-select":{DashboardPageSizeSelect:()=>null},
  });
  const accounts=[1,2].map(id=>({id,name:"Akun "+id,status:"ACTIVE",lastMetaSyncAt:null,commissionImports:[],clickImports:[],
    metaAccounts:[{id,name:"WL "+id,status:"ACTIVE",accountId:"act"+id,businessManager:null}],
    clickaduCampaignConfigs:[{campaignId:"same",label:null,lastBlacklistReplacedAt:null}],adsterraCampaignConfigs:[]}));
  const performance={id:7,name:"Gabungan",wlCount:2,summary:{budget:null,costWithFee:null,commission:null,profit:null,profitPercent:null},days:[{date:"2026-11-13",budget:100,costWithFee:105,commission:300,profit:195,profitPercent:185.71}],state:{sort:"date",dir:"desc",page:1,pageSize:25},pagination:{total:1,page:1,pageCount:1,pageSize:25}};
  const html=renderToStaticMarkup(React.createElement(OverviewGroupReport,{group:{id:7,name:"Gabungan",members:accounts.map(a=>({shopeeAccountId:a.id,shopeeAccount:a}))},report:{performance,state:{from:"",to:"",accounts:{7:performance.state}},incompleteDays:1,partialSpendByDate:{"2026-11-13":["Akun 2"]}},reminders:{pendingNotes:2,wls:[{id:1,shopeeAccountId:1,name:"WL 1",status:"ACTIVE",message:"Belum terverifikasi melalui Sync Meta"}]}}));
  assert.match(html,/Akun 1/);assert.match(html,/Akun 2/);
  assert.match(html,/Campaign ID juga dikonfigurasi/);
  assert.match(html,/1 tanggal belum lengkap/);
  assert.match(html,/Belum terverifikasi/);
  assert.doesNotMatch(html,/>Sync Meta<|Import Shopee|Tambah WL|Hapus akun/);
  assert.match(html,/href="\/shopee\/1"/);
  assert.match(html,/Data sebagian/);
  assert.match(html,/Tanpa data Spend: Akun 2/);
});

test("individual performance card keeps its baseline render without group-only notices",()=>{
  const {ShopeePerformanceCard}=loadTs("components/dashboard/shopee-performance-card.tsx",{
    "next/link":{default:({children,...p})=>React.createElement("a",p,children)},
    "./dashboard-page-size-select":{DashboardPageSizeSelect:()=>null},
  });
  const account={id:1,name:"Individual",wlCount:1,summary:{budget:100,costWithFee:105,commission:300,profit:195,profitPercent:185.71},days:[{date:"2026-11-13",budget:100,costWithFee:105,commission:300,profit:195,profitPercent:185.71}],state:{sort:"date",dir:"desc",page:1,pageSize:25},pagination:{total:1,page:1,pageCount:1,pageSize:25}};
  const props={account,dashboardState:{from:"",to:"",accounts:{1:account.state}}};
  const html=renderToStaticMarkup(React.createElement(ShopeePerformanceCard,props));
  assert.doesNotMatch(html,/Data sebagian/);
  assert.equal(createHash("sha256").update(html).digest("hex"),"7fe6d51791ce30830f923b3a5d779d0a065bca655c5691e0086420a594082558");
});
