import Link from "next/link";
export default function DashboardPage() {
  return <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><p className="text-sm font-medium text-blue-600">Business Tracker</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Pilih akun Shopee</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Lihat ringkasan dan histori performa pada halaman Overview masing-masing akun Shopee.</p><Link href="/shopee" className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">Buka Akun Shopee</Link></section>;
}
