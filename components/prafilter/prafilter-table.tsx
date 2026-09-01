import { CampaignJenisControl } from "@/components/prafilter/campaign-jenis-control";
import { CampaignNoteControl } from "@/components/prafilter/campaign-note-control";
import { CampaignStatusControl } from "@/components/prafilter/campaign-status-control";

type PrafilterRow = {
  id: number;
  name: string;
  metaAccountName: string;
  jenis: string | null;
  operationalStatus: string;
  note: string | null;
  cpc: number | null;
  spend: number | null;
  clicks: number | null;
  commission: number | null;
  costWithFee: number;
  profit: number | null;
  profitPercent: number | null;
};

const rupiahFormatter = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const cpcFormatter = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 4 });
const percentFormatter = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function money(value: number | null) {
  return value === null ? "-" : rupiahFormatter.format(value);
}

export function PrafilterTable({ shopeeAccountId, rows }: { shopeeAccountId: number; rows: PrafilterRow[] }) {
  if (rows.length === 0) {
    return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Belum ada Prafilter untuk tanggal ini. Pilih tanggal lalu klik Ambil Prafilter.</div>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-375 text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Nama Campaign</th><th className="px-4 py-3">Nama WL</th><th className="px-4 py-3">Jenis</th><th className="px-4 py-3 text-right">CPC</th><th className="px-4 py-3 text-right">Spend</th><th className="px-4 py-3 text-right">(+) 5%</th><th className="px-4 py-3 text-right">Klik Meta</th><th className="px-4 py-3 text-right">Komisi</th><th className="px-4 py-3 text-right">Profit</th><th className="px-4 py-3 text-right">(%) Profit</th><th className="px-4 py-3">Note</th></tr></thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((row) => (
            <tr key={row.id} className={row.operationalStatus === "OFF" ? "bg-slate-50" : undefined}>
              <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
              <td className="px-4 py-3 text-slate-600">{row.metaAccountName}</td>
              <td className="px-4 py-3"><CampaignJenisControl shopeeAccountId={shopeeAccountId} campaignId={row.id} value={row.jenis} /></td>
              <td className="px-4 py-3 text-right tabular-nums">{row.cpc === null ? "-" : cpcFormatter.format(row.cpc)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{money(row.spend)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{row.spend === null ? "-" : money(row.costWithFee)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{row.clicks ?? "-"}</td>
              <td className="px-4 py-3 text-right tabular-nums">{money(row.commission)}</td>
              <td className={`px-4 py-3 text-right tabular-nums ${row.profit !== null && row.profit < 0 ? "text-red-700" : ""}`}>{money(row.profit)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{row.profitPercent === null ? "-" : `${percentFormatter.format(row.profitPercent)}%`}</td>
              <td className="px-4 py-3"><div className="flex items-center gap-2"><CampaignStatusControl shopeeAccountId={shopeeAccountId} campaignId={row.id} value={row.operationalStatus} /><CampaignNoteControl shopeeAccountId={shopeeAccountId} campaignId={row.id} value={row.note} /></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
