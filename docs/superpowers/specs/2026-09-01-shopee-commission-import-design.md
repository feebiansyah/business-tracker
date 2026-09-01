# Shopee Commission CSV Import — Design

## Tujuan

Subsystem ini mengimpor komisi bersih Shopee Affiliate dari CSV ke histori harian campaign yang sudah ada. Import selalu dimulai dari satu `ShopeeAccount`, mencocokkan `Tag_link2` dengan `Campaign.name` hanya melalui WL yang terhubung ke akun tersebut, lalu menulis nilai agregat ke `CampaignDailyMetric.commission`.

Import melengkapi data Meta, bukan menggantikan sinkronisasi Meta. Meta dapat masuk lebih dahulu atau Shopee dapat masuk lebih dahulu; hasil akhirnya harus sama untuk kombinasi `(campaignId, date)` yang sama.

## Kondisi Existing yang Dipertahankan

- `ShopeeAccount` memiliki banyak `MetaAccount` melalui `MetaAccount.shopeeAccountId`.
- `MetaAccount` memiliki banyak `Campaign`.
- `CampaignDailyMetric` unik pada `(campaignId, date)` dan field Meta serta Shopee bersifat nullable.
- Meta sync meng-upsert hanya `spend`, `clickFp`, dan `cpcFp`; ia tidak boleh mengubah `commission`, `shopeeClicks`, `note`, atau `completed`.
- `note` dan `completed` adalah field manual dan tidak boleh disentuh importer.
- Filter tetap `ACTIVE` dan effective daily budget `< 200000`. Fix, OFF Filter, OFF Fix, checkpoint histori Meta, dan arsitektur Meta sync tidak berubah.
- Prisma generator dan seluruh migration lama tetap dipertahankan.

## Scope Versi Pertama

Versi pertama mencakup:

- route `/shopee/[id]/import`;
- upload, validasi, parse, aggregate, match, dan preview CSV;
- final import komisi per campaign dan tanggal;
- pencatatan import history dan aggregate unmatched;
- daftar import history terbaru pada halaman import.

Versi pertama tidak mencakup Klik Shopee, product breakdown, order count, buyer, status pesanan, Shopee API, scheduler, undo, export history, penyimpanan raw CSV, atau perubahan klasifikasi campaign.

## Route dan Navigasi

Tambahkan route dinamis `/shopee/[id]/import`. ID selalu berasal dari URL dan harus menunjuk ke `ShopeeAccount` yang ada; ID tidak valid atau akun yang tidak ada menghasilkan `notFound()` untuk page read.

Urutan workflow per akun Shopee menjadi:

1. Import Shopee
2. Filter
3. Fix
4. OFF Filter
5. OFF Fix

Link Import Shopee muncul pada navigasi akun dan detail `/shopee/[id]`. Tidak ada akun, WL, campaign, filename, atau tanggal yang di-hardcode.

## Arsitektur Komponen

Pisahkan tanggung jawab berikut:

- **Page/query layer:** memvalidasi akun, membaca metadata akun, dan membaca import history.
- **Upload/preview UI:** menyimpan `File` hanya di memori browser, mengirim preview request, menampilkan ringkasan, dan meminta konfirmasi final.
- **CSV parser:** memvalidasi encoding, header, row, tanggal, tag, dan nominal; tidak mengakses database.
- **Aggregator:** menggabungkan row berdasarkan `(date, normalizedTagLink2)` menggunakan arithmetic decimal.
- **Matcher:** menerima aggregate dan daftar campaign satu akun, lalu menghasilkan matched dan unmatched di memori.
- **Import service/repository:** mengulang parse dan match saat final import, memvalidasi preview fingerprint, lalu menulis seluruh hasil dalam satu transaction.
- **History query/UI:** menampilkan audit import sukses tanpa menyimpan atau menampilkan raw CSV.

Parser, normalizer, aggregator, matcher, preview summary builder, dan persistence payload builder harus berupa unit kecil yang dapat diuji terpisah. Route/action hanya mengorkestrasi unit tersebut.

## Kontrak CSV

### File

- Hanya file `.csv` UTF-8 atau UTF-8 dengan BOM yang diterima.
- Batas file adalah 10 MiB dan maksimal 100.000 non-empty data rows.
- File kosong, file tanpa data, NUL byte, encoding yang tidak dapat dibaca sebagai UTF-8, atau row melebihi batas ditolak sebelum database write.
- Gunakan parser CSV yang memahami quoted field, escaped quote, delimiter, CRLF/LF, dan newline di dalam quoted field. Jangan menggunakan `split(',')`.
- Delimiter yang diterima adalah koma atau titik koma. Parser mendeteksinya dari header dan wajib menghasilkan tepat satu pemetaan header yang valid; hasil ambigu ditolak.

### Header

Tiga header wajib adalah:

- `Waktu Pemesanan`
- `Tag_link2`
- `Komisi Bersih Affiliate (Rp)`

BOM boleh dihapus dari header pertama. Selain penghapusan BOM, nama header dibandingkan secara exact setelah trim whitespace di tepi. Tidak ada alias, fuzzy matching, atau tebakan nama kolom. Kolom tambahan diabaikan. Header wajib yang hilang atau duplikat menolak preview dengan pesan yang menyebut nama header bermasalah.

### Validasi Row

Blank physical lines diabaikan. Setiap logical data row lainnya wajib memiliki tanggal valid, `Tag_link2` non-empty setelah trim, dan commission valid. Satu row invalid menolak seluruh preview; tidak ada partial preview/import. Pesan menyebut nomor logical CSV row dan kolom yang salah, tetapi tidak memantulkan seluruh row yang mungkin berisi data sensitif.

Status pesanan dan kolom lain tidak dibaca. `Komisi Bersih Affiliate (Rp)` adalah satu-satunya sumber nilai commission, termasuk bila nilainya nol atau negatif.

## Parsing Tanggal

`Waktu Pemesanan` dibaca sebagai waktu kalender Shopee dan dikonversi menjadi date-only tanpa konversi zona waktu yang dapat menggeser tanggal. Format ketat yang diterima:

- `YYYY-MM-DD HH:mm:ss`
- `YYYY-MM-DD HH:mm`
- `DD/MM/YYYY HH:mm:ss`
- `DD/MM/YYYY HH:mm`
- varian date-only dari dua bentuk tersebut

Angka tanggal harus zero-padded. Tanggal kalender mustahil, trailing text, format slash yang bukan `DD/MM/YYYY`, dan nilai ambigu ditolak. Nilai yang lolos menjadi string kanonik `YYYY-MM-DD`, kemudian persistence menggunakan UTC midnight sebagaimana date-only existing diperlakukan.

`dateFrom` dan `dateTo` adalah minimum dan maksimum seluruh row valid, termasuk row yang akhirnya unmatched.

## Parsing Commission

Commission diproses sebagai decimal fixed-point dua digit, bukan JavaScript floating point.

Parser menerima:

- integer polos, misalnya `50000`;
- desimal mesin, misalnya `50000.25`;
- format Indonesia, misalnya `50.000` atau `50.000,25`;
- prefix `Rp` dan whitespace di tepi;
- tanda negatif di depan nominal.

Jika hanya ada satu separator:

- koma selalu separator decimal dan maksimal memiliki dua digit pecahan;
- titik dengan kelompok tiga digit yang valid adalah separator ribuan;
- titik dengan satu atau dua digit terakhir adalah separator decimal.

Jika titik dan koma sama-sama ada, titik wajib berupa separator ribuan berkelompok tiga dan koma menjadi separator decimal. Separator berulang yang tidak valid, exponent notation, `NaN`, `Infinity`, lebih dari dua digit pecahan, atau nilai di luar kapasitas `Decimal(18,2)` ditolak. Aggregate dan total history menggunakan decimal exact.

## Aggregation

Normalisasi tag hanya:

```text
normalizeTag(value) = value.trim().toUpperCase()
```

Tidak boleh menghapus atau mengubah punctuation, dash, underscore, angka, whitespace internal, maupun karakter lain.

Aggregate di memori memakai key `(date, normalizedTagLink2)`. Untuk setiap key simpan:

- date kanonik;
- nilai display `tagLink2` yang sudah trim dari kemunculan pertama;
- normalized tag;
- `commission = SUM(Komisi Bersih Affiliate (Rp))`;
- `rowCount`.

`csvRowCount` adalah jumlah logical data rows valid sebelum aggregation. `tagCount` adalah jumlah normalized tag unik di seluruh tanggal. `matchedCount` dan `unmatchedCount` adalah jumlah aggregate groups, bukan jumlah raw rows atau jumlah tag unik.

## Campaign Matching dan Scope

Matcher melakukan satu query untuk memuat seluruh campaign yang dimiliki akun melalui:

```text
ShopeeAccount.id
  -> MetaAccount.shopeeAccountId
  -> Campaign.metaAccountId
```

Tidak ada filter status atau budget pada query ini. Campaign dapat berada di Filter, Fix, OFF Filter, atau OFF Fix.

Campaign dibuat menjadi map berdasarkan `Campaign.name.trim().toUpperCase()`. Setiap aggregate hanya matched bila map menghasilkan tepat satu campaign dalam scope akun tersebut.

- Tidak ditemukan: unmatched dengan reason `CAMPAIGN_NOT_FOUND`.
- Lebih dari satu campaign dalam scope memiliki normalized name sama: unmatched dengan reason `AMBIGUOUS_CAMPAIGN_NAME`.
- Campaign dari Shopee account lain tidak pernah dimuat dan tidak dapat menjadi kandidat.

Importer tidak membuat Campaign baru. Campaign database yang tidak muncul dalam CSV diabaikan sepenuhnya: tidak dianggap error, tidak ditulis nol, dan nilai existing tidak dihapus.

## Preview Flow

Flow wajib:

```text
pilih file
-> preview request
-> parse dan validasi
-> aggregate
-> load campaign scope sekali
-> match di memori
-> tampilkan preview
-> user klik Import Sekarang
-> final import request
```

Preview tidak melakukan write database dan tidak menyimpan file. Response preview minimal berisi:

- original filename;
- SHA-256 file fingerprint;
- tanggal awal dan akhir;
- raw CSV row count;
- unique tag count;
- matched aggregate count;
- unmatched aggregate count;
- total matched commission;
- total unmatched commission;
- seluruh daftar aggregate unmatched: date, tag, commission, rowCount, dan reason.

Raw rows tidak ditampilkan. Matched aggregate detail tidak wajib ditampilkan pada versi pertama.

Browser mempertahankan `File` hanya dalam memory selama halaman hidup. Tombol `Import Sekarang` mengirim file yang sama dan preview fingerprint kembali ke server. Final import tidak mempercayai aggregate atau total dari client: server menghitung hash, parse, aggregate, load scope, dan match ulang.

Jika hash berbeda, file harus dipreview ulang. Jika ringkasan matching final berbeda dari preview karena campaign/WL berubah di antara preview dan import, final action menolak sebagai preview stale dan meminta preview ulang. Dengan demikian user tidak mengimpor hasil yang berbeda dari yang dikonfirmasi.

## Final Import dan `CampaignDailyMetric`

Untuk setiap matched aggregate, operational key adalah `(campaignId, date)`:

- row belum ada: buat `CampaignDailyMetric` dengan `campaignId`, `date`, dan `commission`; field Meta, `shopeeClicks`, dan `note` tetap null, sedangkan `completed` memakai default false;
- row sudah ada: update hanya `commission` dengan aggregate terbaru;
- jangan menambahkan aggregate baru ke commission lama;
- jangan mengubah `spend`, `clickFp`, `cpcFp`, `shopeeClicks`, `note`, atau `completed`.

Karena upsert mengganti commission pada key yang sama, re-import file/periode sama idempotent secara operasional. Re-import dengan nilai CSV yang berubah mengganti nilai lama dengan SUM terbaru. Row campaign/date di luar aggregate matched file tidak disentuh.

Meta sync berikutnya tetap menggunakan Meta-only update payload sehingga commission hasil Shopee, note, dan completed bertahan. Source order bebas:

- Meta dahulu lalu Shopee: Shopee mengisi commission pada row existing.
- Shopee dahulu lalu Meta: Shopee membuat row nullable, kemudian Meta mengisi hanya field Meta.

## Import History Data Model

Migration implementasi nanti bersifat additive dan menambahkan relasi `ShopeeAccount.commissionImports` tanpa mengubah tabel existing.

### `ShopeeCommissionImport`

- `id Int @id @default(autoincrement())`
- `shopeeAccountId Int`
- relation ke `ShopeeAccount` dengan delete restricted
- `originalFilename String`
- `fileSha256 String`
- `dateFrom DateTime @db.Date`
- `dateTo DateTime @db.Date`
- `csvRowCount Int`
- `tagCount Int`
- `matchedCount Int`
- `unmatchedCount Int`
- `matchedCommission Decimal @db.Decimal(18,2)`
- `unmatchedCommission Decimal @db.Decimal(18,2)`
- `createdAt DateTime @default(now())`
- relation `unmatched ShopeeCommissionImportUnmatched[]`
- index `(shopeeAccountId, createdAt)`

### `ShopeeCommissionImportUnmatched`

- `id Int @id @default(autoincrement())`
- `importId Int`
- relation ke `ShopeeCommissionImport` dengan cascade delete
- `date DateTime @db.Date`
- `tagLink2 String`
- `commission Decimal @db.Decimal(18,2)`
- `rowCount Int`
- `reason String`, dibatasi aplikasi pada `CAMPAIGN_NOT_FOUND | AMBIGUOUS_CAMPAIGN_NAME`
- index `(importId, date)`

History hanya mencatat final import yang committed. Preview dan final import gagal tidak membuat history sukses. Re-import periode atau file sama boleh membuat history baru sebagai audit trail, sementara nilai operational metric tetap latest replacement.

Raw CSV dan matched raw detail tidak disimpan dalam model mana pun.

## Transaction dan Efisiensi Write

Final import memakai satu database transaction per file:

1. lock row `ShopeeAccount` target dengan `SELECT ... FOR UPDATE` agar final import untuk akun sama berjalan serial;
2. validasi akun masih ada dan load campaign scope satu kali di transaction;
3. re-check preview fingerprint dan summary;
4. create `ShopeeCommissionImport`;
5. upsert matched aggregate ke `CampaignDailyMetric`;
6. batch insert unmatched aggregate history;
7. commit.

Kegagalan salah satu langkah me-roll back history, metric updates, dan unmatched detail bersama-sama.

Jangan query campaign per raw row dan jangan insert raw row. Untuk matched aggregate, gunakan parameterized multi-row MySQL `INSERT ... ON DUPLICATE KEY UPDATE commission = VALUES(commission), updatedAt = NOW()` dalam chunk maksimal 500 values di transaction yang sama. Insert clause hanya menyebut field minimum untuk row baru; duplicate clause hanya mengubah `commission` dan `updatedAt`. Jangan pernah memasukkan field Meta/manual ke duplicate update clause. Unmatched history memakai `createMany` dalam chunk maksimal 500.

Semua raw SQL wajib dibangun dengan Prisma parameterization, bukan string concatenation. Unique key existing `(campaignId, date)` adalah arbiter idempotency.

## Concurrency dan Race

- Import final untuk Shopee account sama diserialkan melalui row lock akun.
- Import untuk Shopee account berbeda dapat berjalan bersamaan.
- Campaign/WL yang berubah antara preview dan final menghasilkan stale-preview rejection sebelum write.
- Meta sync dan Shopee import dapat beririsan karena masing-masing hanya mengubah kolom miliknya. Upsert Shopee duplicate clause tidak membawa field Meta/manual; upsert Meta tidak membawa commission/manual.
- Jika campaign dihapus setelah final scope validation, foreign-key/database error membatalkan seluruh transaction.
- Database deadlock atau transient connection error boleh dicoba ulang maksimal dua kali untuk seluruh transaction. Setiap retry mengulang scope validation dan tidak membuat history ganda karena percobaan gagal telah rollback.

## Validation dan Error Handling

Error preview bersifat spesifik dan aman, misalnya:

- `CSV wajib memiliki kolom Tag_link2.`
- `Baris 42: Waktu Pemesanan tidak valid.`
- `Baris 77: Komisi Bersih Affiliate (Rp) tidak valid.`
- `File melebihi batas 10 MiB.`

Final import membedakan file berubah, preview stale, akun tidak ditemukan/tidak berwenang, conflict/deadlock yang habis retry, dan kegagalan database umum. Detail stack/database tetap di server log dan tidak dikirim ke browser.

Unmatched bukan error dan tidak menghalangi matched aggregates diimpor. Aggregate ambiguous diperlakukan sebagai unmatched agar importer tidak memilih campaign secara arbitrer.

## UI dan History UX

Halaman import menampilkan:

1. identitas akun Shopee dan link kembali ke detail akun;
2. file picker CSV dan tombol `Preview`;
3. validation error bila ada;
4. summary cards preview;
5. tabel aggregate unmatched yang dapat dipaginasi bila panjang;
6. tombol `Import Sekarang` yang hanya aktif untuk preview terbaru;
7. success summary setelah commit;
8. tabel import history terbaru untuk akun tersebut.

History minimal menampilkan waktu import, filename, rentang tanggal, raw rows, unique tags, matched/unmatched count, dan total matched/unmatched commission. History dibaca hanya untuk akun pada URL. Detail raw CSV tidak tersedia karena file tidak disimpan.

Saat file berubah, preview lama dan tombol final import dibatalkan. Selama preview/final request berjalan, kontrol submit dinonaktifkan untuk mencegah double-click. Refresh halaman menghapus file/preview dari browser tetapi tidak memengaruhi history committed.

## Security

- File diproses hanya di server; tidak ada credential atau database access di client.
- Preview dan final action memperlakukan ID route, filename, MIME, bytes, headers, rows, preview fingerprint, dan seluruh client input sebagai untrusted.
- Validasi ownership/authorization dilakukan pada setiap action, bukan hanya saat page render. Pada kondisi project sekarang minimal validasi account scope wajib; ketika auth/user ownership tersedia, action harus memakai policy authorization project yang sama.
- Original filename disimpan sebagai basename yang disanitasi, maksimal 255 karakter, tanpa path separator atau control character.
- Jangan menulis isi CSV, row, atau nominal per-row ke application log.
- Batas 10 MiB/100.000 rows diterapkan pada preview dan final. Parsing harus berhenti saat batas terlampaui.
- Formula-like cell tidak dieksekusi; seluruh field diperlakukan sebagai text lalu divalidasi.

## Failure dan Retry Semantics

- Preview gagal: tidak ada database write; user memperbaiki/memilih file lalu preview ulang.
- Preview sukses tetapi final stale: tidak ada write; user wajib preview ulang.
- Final gagal sebelum commit: transaction rollback total dan preview dapat dicoba ulang dengan file yang masih berada di browser.
- Final berhasil tetapi response ke browser terputus: history adalah sumber audit. Mengulang file aman untuk metric karena replacement upsert, tetapi membuat history baru sesuai aturan audit trail.
- Unmatched tetap tercatat pada setiap history sukses dan dapat diperbaiki dengan membuat/mengubah campaign di luar importer lalu re-import CSV.

## Migration Strategy

Implementasi nanti membuat satu migration Prisma additive untuk dua tabel history, foreign keys, dan indexes. Migration tidak mengubah atau menghapus `Campaign`, `CampaignDailyMetric`, `ShopeeAccount`, `MetaAccount`, data existing, unique key metric, atau migration lama. Database tidak di-reset.

Sebelum dan sesudah migration, verifikasi row count protected (`ShopeeAccount`, `MetaAccount`, `Campaign`, `CampaignDailyMetric`) tidak berubah. Jalankan Prisma format, validate, migrate dev dengan nama migration yang spesifik, generate, dan migrate status. Tidak diperlukan backfill karena history dimulai ketika importer dipakai.

## Testing Strategy

### Unit tests

- exact required headers, BOM handling, missing/duplicate header rejection;
- quoted CSV, comma/semicolon delimiter, CRLF/LF, dan embedded newline;
- seluruh format tanggal yang diterima serta impossible/ambiguous date rejection;
- integer, Indonesian, machine decimal, zero, negative, overflow, dan invalid commission parsing;
- tag normalization hanya trim + uppercase dan mempertahankan punctuation/internal whitespace;
- aggregate multi-row/multi-date dengan decimal exact dan rowCount benar;
- numeric totals tanpa floating-point drift;
- matched, not found, duplicate normalized campaign name, dan cross-Shopee exclusion;
- preview counts/totals memakai definisi aggregate yang dikunci;
- persistence payload Shopee hanya memiliki `commission` pada duplicate update;
- Meta update payload tetap tidak memiliki `commission`, `note`, atau `completed`.

### Integration tests

- preview melakukan zero database writes;
- final import membuat history, unmatched detail, dan matched metrics dalam satu transaction;
- Shopee-first membuat metric dengan field Meta null;
- Meta-first mempertahankan field Meta dan hanya mengisi commission;
- Meta sync setelah Shopee mempertahankan commission, note, dan completed;
- re-import file sama mempertahankan commission yang sama dan menambah history baru;
- re-import nilai berubah mengganti, bukan menambah, commission;
- campaign yang tidak ada di CSV tidak berubah;
- kegagalan di tengah write me-roll back seluruh transaction;
- concurrent import akun sama terserialisasi;
- stale preview ditolak tanpa write;
- seluruh query/action tidak dapat membaca atau menulis campaign akun Shopee lain.

### Route dan regression verification

- `/shopee/[id]/import` valid, invalid, dan missing account;
- preview serta history hanya menampilkan scope akun URL;
- existing `/shopee/[id]`, Filter, detail harian, Fix/OFF placeholders, WL, dan Meta sync tetap berjalan;
- Filter/Fix/OFF rules dan history checkpoint Meta tidak berubah;
- Prisma validate/generate/status, full tests, TypeScript, lint, dan production build lulus.

Gunakan `AffiliateCommissionReport_202609012341.csv` sebagai fixture design/testing bila file tersedia, tetapi test tidak boleh bergantung pada filename atau tanggal tersebut. Fixture sanitasi kecil harus menyimpan bentuk header dan nilai representatif tanpa menyimpan data sensitif produksi.

## Non-Goals

- Menyimpan raw CSV atau raw order rows
- Membaca status pesanan
- Membuat Campaign dari unmatched tag
- Fuzzy matching atau normalisasi di luar trim + uppercase
- Matching lintas ShopeeAccount
- Mengisi nol untuk campaign/tanggal yang tidak ada di CSV
- Mengubah Klik Shopee atau field Meta/manual
- Mengubah Filter/Fix/OFF classification
- Mengubah Meta checkpoint, transport, atau sync architecture
- Shopee API, scheduler, undo, export, product/order/buyer reporting
- Hardcode filename, tanggal, campaign, WL, atau Shopee account

## Acceptance Criteria

Subsystem dianggap sesuai desain bila preview wajib dan bebas write, final import transactional, aggregate/matching scoped benar, unmatched tercatat tanpa menggagalkan matched, re-import mengganti commission pada `(campaignId,date)`, source order Meta/Shopee menghasilkan state akhir yang sama, raw CSV tidak tersimpan, dan tidak ada jalur yang dapat menimpa field Meta, `note`, atau `completed`.
