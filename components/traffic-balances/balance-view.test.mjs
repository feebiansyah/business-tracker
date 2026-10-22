import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("Overview and Dashboard render all balance states independently without combined totals", () => {
  const script = `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import views from './components/traffic-balances/balance-view.tsx';
    const state = {
      '1:CLICKADU': {status:'SUCCESS',balance:'1234.565',updatedAt:'2026-10-21T18:05:00Z',requestId:1,message:''},
      '1:ADSTERRA': {status:'ERROR',balance:'-0.25',updatedAt:'2026-10-21T18:05:00Z',requestId:2,message:'Saldo gagal dimuat.'},
      '2:CLICKADU': {status:'NOT_CONNECTED',balance:null,updatedAt:null,requestId:3,message:''},
    };
    const accounts = [{id:1,name:'Shopee Satu'},{id:2,name:'Shopee Dua'}];
    const props = {accounts,state,onRefresh:()=>{},onRefreshAll:()=>{}};
    console.log(JSON.stringify({overview:renderToStaticMarkup(React.createElement(views.BalanceOverviewView,props)), dashboard:renderToStaticMarkup(React.createElement(views.BalanceDashboardView,props))}));
  `;
  const html = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }));
  for (const view of [html.overview, html.dashboard]) {
    assert.match(view, /1\.234,57 USD/);
    assert.match(view, /-0,25 USD/);
    assert.match(view, /Pembaruan gagal/);
    assert.match(view, /22 Okt 2026.*01.05.*WIB/);
    assert.doesNotMatch(view, /Total Gabungan|Infinity|NaN|available balance/i);
  }
  assert.match(html.overview, /Saldo Clickadu/);
  assert.match(html.overview, /Saldo Adsterra/);
  assert.equal((html.overview.match(/aria-label="Refresh Saldo /g) ?? []).length, 2);
  assert.match(html.overview, /sm:grid-cols-2/);
  assert.match(html.dashboard, /Saldo Traffic/);
  assert.match(html.dashboard, /Refresh Semua Saldo/);
  assert.match(html.dashboard, /Shopee Satu/);
  assert.match(html.dashboard, /Shopee Dua/);
  assert.match(html.dashboard, /Belum terhubung/);
  assert.match(html.dashboard, /Sedang memuat/);
  assert.match(html.dashboard, /overflow-x-auto/);
});
