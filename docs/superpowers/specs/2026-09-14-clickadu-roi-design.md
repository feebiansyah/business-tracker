# Clickadu ROI Design

## Goal

Menambahkan modul Clickadu ROI read-only di dalam masing-masing Shopee Account tanpa mengubah perilaku Meta/Shopee yang sudah berjalan. Modul mengambil statistik Clickadu langsung dari API berdasarkan campaign dan rentang tanggal, menerima upload CSV Shopee yang sesuai, mencocokkan Clickadu `zone` dengan Shopee `Tag_link3`, lalu menghitung biaya IDR, komisi, profit, ROI, dan kandidat blacklist.

Tahap ini berhenti pada analisis dan kandidat blacklist. Tidak ada PUT campaign, tidak ada blacklist via API, dan tidak ada perubahan status campaign.

## Scope

### In scope

- Workflow baru per Shopee Account pada route `/shopee/[id]/clickadu-roi`.
- Konfigurasi Clickadu opsional per Shopee Account.
- Satu Shopee Account dapat memiliki lebih dari satu konfigurasi campaign Clickadu.
- Konfigurasi minimal menyimpan campaign ID, label opsional, dan tag sumber Shopee.
- Token API Clickadu hanya dibaca server-side dari environment variable `CLICKADU_API_TOKEN`.
- Ambil seluruh statistik Clickadu untuk periode terpilih dengan pagination dari page 1 sampai `totalPages`.
- Upload CSV Shopee per analisis; file mentah tidak disimpan.
- Match `Clickadu zone` dengan Shopee `Tag_link3` sebagai string.
- Normalisasi `Tag_link1` dengan `trim().toUpperCase()` dan cocokkan dengan source tag konfigurasi dengan normalisasi yang sama.
- Kurs USD ke IDR diinput manual.
- Kandidat blacklist: `costIdr > 0 && roi < 30`.
- UI ringkasan, tabel per Zone, dan copy kandidat Zone.

### Out of scope

- PUT/update campaign Clickadu.
- Replace/merge blacklist Clickadu.
- Automatic blacklist scheduler.
- Adsterra.
- Perubahan parser/import Shopee existing.
- Perubahan formula Meta/Shopee existing.
- Mengaktifkan kembali placeholder `/adu` atau `/roi-tracker`.
- Menyimpan token Clickadu di database atau client.

## Existing Architecture Constraints

- Next.js App Router, TypeScript, Prisma 6.19.3, MySQL.
- Prisma generator harus tetap:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../lib/generated/prisma"
}
```

- Workflow Shopee saat ini didefinisikan melalui `components/layout/navigation-state.ts` dan `components/layout/navigation.ts`, lalu dirender oleh `components/layout/sidebar.tsx`.
- Server actions wajib memanggil `requireUser()` mengikuti pola existing.
- Test suite memakai `node --test` dan file `.test.mjs` yang mengimpor modul `.ts` secara langsung.
- Parser CSV existing memakai `csv-parse/sync`, UTF-8, BOM support, delimiter comma/semicolon, batas 10 MiB, dan maksimal 100.000 baris. Modul Clickadu ROI mengikuti batas dan gaya error yang sama tetapi tidak memodifikasi parser commission existing.

## Data Model

Tambahkan model baru `ClickaduCampaignConfig`.

```prisma
model ClickaduCampaignConfig {
  id              Int      @id @default(autoincrement())
  campaignId      String   @db.VarChar(64)
  label           String?  @db.VarChar(191)
  sourceTag       String   @db.VarChar(64)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  shopeeAccountId Int
  shopeeAccount   ShopeeAccount @relation(fields: [shopeeAccountId], references: [id], onDelete: Cascade)

  @@unique([shopeeAccountId, campaignId])
  @@index([shopeeAccountId])
}
```

Tambahkan relation `clickaduCampaignConfigs ClickaduCampaignConfig[]` pada `ShopeeAccount`.

Alasan desain:

- Konfigurasi bersifat opsional karena row hanya ada untuk Shopee Account yang memakai Clickadu.
- `campaignId` disimpan sebagai string agar tidak mengandalkan batas integer eksternal.
- `sourceTag` menyimpan identitas sumber Shopee, misalnya `ADU`; pembandingan tetap case-insensitive saat parsing.
- Tidak ada token di model.
- Tidak ada persistence untuk hasil analisis pada tahap pertama; hasil dihitung per request agar tidak menambah lifecycle/history yang belum dibutuhkan.

## Clickadu API Client

Buat modul terisolasi `lib/clickadu-roi/clickadu-client.ts`.

Endpoint yang sudah dibuktikan:

```text
GET https://ssp.clickadu.com/v1.0/api/client/statistics/
```

Query:

- `limit`
- `page`, mulai dari `1`
- `dateFrom=YYYY-MM-DD`
- `dateTill=YYYY-MM-DD`
- `groupBy=zone`
- `campaignId`
- `withTestExpenses=0`

Header:

```text
Authorization: <CLICKADU_API_TOKEN>
Accept: application/json
```

Client wajib:

1. Menolak request bila `CLICKADU_API_TOKEN` tidak tersedia.
2. Mulai pada `page=1`.
3. Parse dan validasi struktur response minimal yang dipakai aplikasi.
4. Lanjut page berikutnya sampai `page >= totalPages`.
5. Menggabungkan `items` seluruh page tanpa kehilangan Zone.
6. Memperlakukan `zone` sebagai string saat masuk domain model.
7. Tidak mencetak token ke log/error.
8. Menghasilkan error publik yang aman bila API gagal, 429, timeout, atau response tidak valid.

Field yang dipakai dari setiap item:

- `zone`
- `impressions`
- `clicks`
- `spent`

Field lain dari API tidak dibutuhkan untuk tahap pertama dan tidak perlu dipersist.

## Shopee CSV Parsing for ROI

Buat parser khusus `lib/clickadu-roi/shopee-csv.ts`; jangan ubah parser commission existing karena tujuan dan required header berbeda.

Required headers:

- `Tag_link1`
- `Tag_link3`
- `Komisi Bersih Affiliate (Rp)`

Parser mengikuti behavior aman existing:

- UTF-8 + BOM.
- Delimiter comma atau semicolon.
- Maksimum 10 MiB.
- Maksimum 100.000 logical rows.
- Header wajib unik.
- `Tag_link1` dinormalisasi `trim().toUpperCase()`.
- `Tag_link3` di-`trim()` dan tetap string.
- Komisi diparse dengan helper commission existing agar presisi/format Rupiah konsisten.

Rows dipakai hanya bila normalized `Tag_link1` sama dengan normalized `sourceTag` konfigurasi. Row dengan `Tag_link3` kosong diabaikan dan dihitung sebagai ignored row untuk feedback UI.

Komisi diakumulasi per `Tag_link3`. Beberapa order pada Zone yang sama dijumlahkan.

## ROI Calculation

Buat fungsi domain murni di `lib/clickadu-roi/calculate.ts`.

Untuk setiap Zone dari Clickadu:

```text
costIdr = spentUsd * exchangeRate
commission = aggregateShopeeCommission[zone] ?? 0
profit = commission - costIdr
roi = costIdr > 0 ? profit / costIdr * 100 : null
blacklistCandidate = costIdr > 0 && roi < 30
```

Aturan:

- Clickadu `spent` adalah USD.
- `exchangeRate` wajib angka positif.
- Zone yang ada di CSV Shopee tetapi tidak ada di statistik Clickadu tidak membuat row traffic baru karena tabel berpusat pada spend Clickadu.
- Zone dengan spend 0 aman dan `roi=null`; bukan kandidat blacklist.
- Total ROI dihitung dari total profit / total cost IDR, bukan rata-rata ROI per Zone.
- Sorting default tabel: `spentUsd` descending agar konsisten dengan workflow traffic lama.

Status UI:

- `Blacklist` bila ROI < 30% dan cost > 0.
- `Aman` bila ROI >= 30%.
- `Tanpa Spend` bila cost = 0.

Profit negatif ditampilkan merah; profit non-negatif hijau. Kandidat blacklist ditandai merah.

## Server Flow

Route: `/shopee/[id]/clickadu-roi`.

Halaman memuat:

- Shopee Account.
- Daftar `ClickaduCampaignConfig` milik account.
- Empty/setup state bila belum ada konfigurasi.

Server actions pada `app/shopee/[id]/clickadu-roi/actions.ts`:

1. `saveClickaduConfigAction`
   - require authenticated user.
   - validasi Shopee Account ada.
   - validasi campaign ID non-empty string.
   - normalisasi source tag untuk penyimpanan ke uppercase trimmed value.
   - create/update konfigurasi.
   - tidak melakukan request Clickadu.

2. `deleteClickaduConfigAction`
   - require authenticated user.
   - hanya boleh menghapus config yang dimiliki Shopee Account pada route tersebut.

3. `analyzeClickaduRoiAction`
   - require authenticated user.
   - validasi config milik Shopee Account.
   - validasi `dateFrom <= dateTill`.
   - validasi kurs positif.
   - baca CSV upload.
   - parse CSV Shopee dan aggregate komisi per Zone.
   - fetch Clickadu statistics semua halaman.
   - hitung rows + totals + blacklist candidate list.
   - return serializable analysis result ke client.
   - tidak menyimpan hasil analisis ke database.

Tidak ada request API otomatis pada page load. API hanya dipanggil ketika user menekan tombol analisis.

## UI

Workflow baru diberi label `Clickadu ROI` dengan slug `clickadu-roi`.

Halaman terdiri dari empat area:

1. **Konfigurasi campaign**
   - daftar campaign Clickadu yang sudah dikonfigurasi.
   - form campaign ID, label opsional, source tag.
   - create/edit/delete.

2. **Form analisis**
   - campaign selector.
   - tanggal mulai.
   - tanggal akhir.
   - kurs USD → IDR manual.
   - file Shopee CSV.
   - tombol `Analisis ROI`.

3. **Summary cards**
   - Total Spend USD.
   - Total Biaya IDR.
   - Total Komisi.
   - Total Profit.
   - ROI total.
   - jumlah kandidat blacklist.

4. **Zone table + candidate copy**
   - Zone.
   - Impressions.
   - Clicks.
   - Spend USD.
   - Cost IDR.
   - Commission.
   - Profit.
   - ROI.
   - Status.
   - default sort spend tertinggi.
   - candidate list dalam format `2101219, 2141603, 2102502`.
   - tombol Copy menggunakan client component kecil; tidak ada write ke Clickadu.

UI mengikuti komponen dan spacing existing: card putih, border slate, responsive horizontal table overflow, format data padat.

## Error Handling

User-facing errors harus spesifik tetapi tidak membocorkan secret:

- token server belum diset.
- config/campaign tidak valid.
- file terlalu besar / encoding / header invalid.
- tanggal invalid.
- kurs invalid.
- Clickadu 401/404/429/5xx.
- Clickadu timeout/network error.
- malformed API response.

Server log boleh menyertakan status HTTP dan campaign ID, tetapi tidak boleh mencetak Authorization header atau token.

## Security

- `CLICKADU_API_TOKEN` hanya dibaca di server module.
- Tidak pernah dikirim ke browser.
- Tidak disimpan di DB.
- Tidak dimasukkan test fixture.
- Semua server action memanggil `requireUser()`.
- Config action memverifikasi ownership berdasarkan `shopeeAccountId`.
- Upload dibatasi ukuran dan jumlah baris.

## Testing Strategy

Unit tests mencakup:

- client mulai page 1 dan lanjut sampai `totalPages`.
- request membawa date range, `groupBy=zone`, campaign ID, dan `withTestExpenses=0` tanpa mengekspos token dalam result/error.
- parsing response dan konversi `zone` menjadi string.
- parser CSV menerima `ADU`, `Adu`, whitespace/case variants sesuai sourceTag normalized.
- komisi terakumulasi per Tag_link3.
- Zone ID tetap string.
- USD → IDR.
- profit dan ROI.
- ROI <30% menjadi kandidat.
- ROI =30% bukan kandidat.
- cost=0 menghasilkan ROI null dan bukan kandidat.
- total ROI dihitung dari aggregate totals.
- navigation state mengenali `/shopee/[id]/clickadu-roi`.

Integration coverage mencakup persistence config melalui Prisma bila pola test DB existing memungkinkan. Build/lint/full test harus tetap lulus sebelum merge.

## Acceptance Criteria

Tahap pertama selesai bila:

- user dapat membuat konfigurasi Clickadu pada Shopee Account;
- user dapat memilih campaign, periode, kurs, dan upload CSV Shopee;
- aplikasi mengambil semua halaman statistik Clickadu dari API;
- Zone match terhadap Tag_link3;
- summary dan tabel ROI sesuai formula;
- list kandidat ROI <30% dapat di-copy;
- tidak ada write request ke Clickadu;
- tidak ada regression pada Meta/Shopee existing;
- token tidak muncul di source, DB, test, browser, atau log.
