import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

function renderViews() {
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
    console.log(JSON.stringify({overview:renderToStaticMarkup(React.createElement(views.BalanceOverviewView,props)), dashboard:renderToStaticMarkup(React.createElement(views.BalanceDashboardView,props)), failed:renderToStaticMarkup(React.createElement(views.BalanceOverviewView,{...props,state:{'1:CLICKADU':{status:'ERROR',balance:null,updatedAt:null,requestId:1,message:'Saldo gagal dimuat.'}}})), refreshing:renderToStaticMarkup(React.createElement(views.BalanceOverviewView,{...props,state:{'1:CLICKADU':{...state['1:CLICKADU'],status:'LOADING'}}}))}));
  `;
  return JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }));
}

test("compact Overview and Dashboard preserve balance values and flag stale balances", () => {
  const html = renderViews();
  for (const view of [html.overview, html.dashboard]) {
    assert.match(view, /1\.234,57 USD/);
    assert.match(view, /-0,25 USD/);
    assert.match(view, /Gagal diperbarui/);
    assert.match(view, /title="[^"]*Diperbarui 22 Okt 2026.*01.05.*WIB[^"]*"/);
    const visibleText = view.replace(/<[^>]*>/g, "");
    assert.doesNotMatch(visibleText, /Diperbarui|WIB|Saldo akun provider|Akun provider yang sama|Credential provider/);
    assert.doesNotMatch(view, /Total Gabungan|Infinity|NaN|available balance/i);
  }
  assert.match(html.overview, /Saldo Clickadu/);
  assert.match(html.overview, /Saldo Adsterra/);
  assert.equal((html.overview.match(/aria-label="Refresh Saldo /g) ?? []).length, 2);
  assert.equal((html.overview.match(/<section\b/g) ?? []).length, 1, "one balance bar instead of two cards");
  assert.equal((html.overview.match(/<button\b/g) ?? []).length, 2);
  assert.doesNotMatch(html.overview.replace(/<[^>]*>/g, ""), /Refresh Saldo/, "individual refresh is icon-only");
  assert.match(html.dashboard, /Saldo Traffic/);
  assert.match(html.dashboard, /Refresh Semua Saldo/);
  assert.match(html.dashboard, /Shopee Satu/);
  assert.match(html.dashboard, /Shopee Dua/);
  assert.match(html.dashboard, /Belum terhubung/);
  assert.match(html.dashboard, /Memuat/);
  assert.match(html.dashboard, /overflow-x-auto/);
});

test("compact error/loading states do not invent balances or successful timestamps", () => {
  const html = renderViews();
  assert.match(html.failed, /Gagal memuat/);
  assert.doesNotMatch(html.failed, /Diperbarui|WIB|0,00 USD/);
  assert.match(html.refreshing, /1\.234,57 USD/);
  assert.match(html.refreshing, /Memuat/);
  assert.match(html.refreshing, /aria-busy="true"/);
  assert.match(html.refreshing, /aria-label="Refresh Saldo Clickadu"[^>]*disabled|disabled[^>]*aria-label="Refresh Saldo Clickadu"/);
});
