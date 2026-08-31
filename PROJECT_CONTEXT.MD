# BUSINESS TRACKER — PROJECT CONTEXT

## 1. TUJUAN PROJECT

Project ini adalah web Business Tracker internal untuk mengelola dan menganalisis bisnis advertising.

Sistem utama yang digunakan:

1. Meta Ads
2. Shopee Affiliate
3. ADU
4. Terra
5. ROI / Profit Tracker

Project dibuat dari nol menggunakan VS Code.

Tujuan akhirnya adalah menggantikan sebanyak mungkin proses manual yang sebelumnya dilakukan menggunakan Google Sheets, CSV, dan beberapa website/tool terpisah.

Web harus menjadi pusat data untuk:

- Meta Ads
- Shopee
- ADU
- Terra
- Spend
- Revenue / Komisi
- Profit
- ROI
- Campaign
- Zone
- Ad Account / WL
- Business Manager
- histori data harian
- analisis akun/campaign/zone yang menguntungkan dan merugikan


---

# 2. ISTILAH YANG DIGUNAKAN

Pahami istilah berikut sebelum mengerjakan project.


## BM

BM = Meta Business Manager.

Satu BM dapat memiliki beberapa WL.


## WL

WL = Meta Ad Account.

Dalam pembicaraan project ini, user sering menyebut Meta Ad Account sebagai "WL".

Contoh:

Adv Pras -01 | 6940
Adv Det -06 | 9917


## Campaign

Campaign berada di dalam WL / Ad Account.

Struktur sederhananya:

BM
└── WL / Ad Account
    └── Campaign
        └── Ad Set
            └── Ad


## SHOPEE ACCOUNT

Setiap WL dapat memiliki pasangan akun Shopee tertentu.

Hubungan WL dengan akun Shopee nantinya harus disimpan di database dan BUKAN di-hardcode di frontend.


## ZONE

Zone adalah ID sumber traffic / placement yang digunakan pada network seperti ADU atau Terra.

Contoh:

2085370
2100941
2101219
2141603

Zone digunakan untuk mengevaluasi traffic mana yang menghasilkan keuntungan atau kerugian.


---

# 3. PRINSIP UTAMA PROJECT

Project harus dibuat agar scalable.

JANGAN membuat sistem yang bergantung pada:

- hardcode daftar WL
- hardcode akun Shopee
- hardcode BM
- hardcode campaign
- hardcode zone
- copy paste data manual ke source code

Data operasional harus disimpan di database.

Frontend hanya menampilkan dan mengelola data tersebut.


---

# 4. META ADS

Web nantinya harus dapat mengambil data Meta menggunakan Meta Graph API.

Data Meta dapat berasal dari banyak:

- Business Manager
- Ad Account / WL
- Campaign


## Struktur

BM
→ WL
→ Campaign
→ Ad Set
→ Ad


## Informasi WL

Contoh data yang dibutuhkan:

- WL Name
- WL ID / Ad Account ID
- BM
- Status
- Amount Spent
- Spend Cap
- Remaining Balance
- Daily Spend
- Remaining Days


## Remaining Balance

Konsep:

remaining_balance = spend_cap - amount_spent


## Remaining Days

Konsep:

remaining_days = remaining_balance / daily_spend

Harus menangani kondisi:

daily_spend = 0

agar tidak menghasilkan:

- Infinity
- NaN
- angka negatif yang tidak masuk akal


## Status WL

WL harus dapat dibedakan antara:

- Aktif
- Bermasalah / Nonaktif


Default tampilan:

WL aktif di atas.

WL bermasalah di bawah.


---

# 5. META DAILY PERFORMANCE

Data performa Meta perlu disimpan berdasarkan tanggal.

Minimal:

- Date
- BM
- WL
- Campaign
- Spend
- Result / Klik FP
- CPC FP

Nantinya dapat dikembangkan dengan:

- Impressions
- Reach
- Frequency
- CTR
- CPM
- Unique Link Click
- Ad performance


Data historis JANGAN direplace ketika mengambil tanggal baru.

Contoh BENAR:

Date       Campaign A   Campaign B
2026-08-23 20.4658      20.1124
2026-08-24 18.5000      22.4000
2026-08-25 25.1000      19.8000

Data tanggal baru harus menambah histori.


---

# 6. SHOPEE

Shopee digunakan sebagai salah satu sumber revenue / komisi.

Data yang pernah digunakan dalam workflow:

- Komisi Bersih
- Klik Shopee
- Tag Link


Konsep Tag Link sebelumnya:

Tag Link 1
Tag Link 2
Tag Link 3
Tag Link 4
Tag Link 5


Dalam workflow lama:

Tag Link 3 sering digunakan sebagai identifier utama.

Jika Tag Link 3 kosong, dapat menggunakan Tag Link 2 sebagai fallback.


## Data Shopee

Minimal sistem nantinya harus dapat menyimpan:

- tanggal
- akun Shopee
- campaign / tag
- klik
- komisi
- tag link


---

# 7. RELASI WL DAN SHOPEE

Ini penting.

WL Meta mempunyai pasangan akun Shopee.

Relasi ini harus berada di database.

Contoh konsep:

WL
-----------------------
id
meta_account_id
name
bm_id
shopee_account_id


ShopeeAccount
-----------------------
id
name
status


Dengan demikian jika WL bertambah, user cukup menambahnya melalui sistem/admin.

JANGAN mengubah source code hanya untuk menambahkan WL.


---

# 8. ADU

ADU adalah salah satu sumber traffic/data yang digunakan dalam Business Tracker.

Data ADU dapat di-import menggunakan CSV jika API belum digunakan.

Data harus dapat dianalisis berdasarkan Zone.


Contoh Zone:

2085370
2100941
2101219


Data minimal yang mungkin tersedia:

- Zone
- Cost / Spend
- Revenue
- Profit
- ROI


Nama kolom asli CSV dapat berbeda.

Jangan mengasumsikan struktur CSV sebelum melihat file sebenarnya.


---

# 9. TERRA

Terra juga digunakan sebagai sumber data.

Terra mempunyai konsep Zone yang perlu dianalisis.

Tabel Terra harus default diurutkan berdasarkan:

SPEND TERTINGGI
↓
SPEND TERENDAH


Zone yang menguntungkan:

HIJAU


Zone yang tidak menguntungkan:

MERAH


Jangan hanya mengandalkan warna.

Tetap tampilkan angka/status agar informasi masih jelas.


---

# 10. ROI TRACKER

ROI Tracker merupakan salah satu fitur utama.

Konsep dasar:

PROFIT = REVENUE - COST


ROI:

ROI = PROFIT / COST * 100


Contoh:

Cost = Rp100.000
Revenue = Rp150.000

Profit:

Rp50.000

ROI:

50%


Harus menangani:

COST = 0

agar tidak menghasilkan division by zero.


---

# 11. ANALISIS ZONE

Zone harus dapat dikategorikan menjadi:

PROFITABLE
LOSS


Contoh:

Zone 2085370
Cost = 193.5118

dan seterusnya.


Sistem harus dapat membuat kesimpulan otomatis.


## LOSS ZONE

Salah satu kebutuhan penting:

Tampilkan daftar Zone yang:

- merugi
- dan Spend di atas threshold tertentu


Default threshold yang pernah digunakan:

Rp1.000


Tetapi threshold sebaiknya dapat diubah oleh user.


Contoh output:

Zona Rugi Spend > Rp1.000

2101219
2141603
2102502
2083456


---

# 12. COPY LOSS ZONE

Dashboard harus menyediakan tombol:

COPY ZONE


Output copy harus berbentuk:

2101219, 2141603, 2102502, 2083456


Tujuannya agar daftar Zone dapat langsung ditempel ke sistem lain.


---

# 13. WARNA STATUS

Untuk tabel performance:

HIJAU
= aman / profitable


MERAH
= rugi / tidak profitable


Gunakan warna sebagai bantuan visual, bukan satu-satunya indikator.

Tetap tampilkan nilai:

- Profit
- ROI
- Status


---

# 14. SORTING

Tabel harus mendukung sorting.

Khusus Terra:

Default:

Spend terbesar → terkecil


Tabel lain nantinya minimal dapat sort berdasarkan:

- Spend
- Revenue
- Profit
- ROI
- Click
- CPC


---

# 15. FILTER

Dashboard nantinya harus mendukung filter seperti:

- Date
- BM
- WL
- Shopee Account
- Campaign
- Zone
- Status
- Profitable / Loss


Dan threshold seperti:

Spend > X


---

# 16. HISTORICAL DATA

Salah satu masalah sistem lama adalah data tanggal berikutnya dapat menggantikan data sebelumnya.

JANGAN lakukan itu.

Data harus mempunyai histori.

Contoh:

2026-08-28
2026-08-29
2026-08-30
2026-08-31

semuanya tetap tersimpan.


Gunakan kombinasi identifier yang tepat agar tidak membuat duplicate data.

Contoh:

date
+
source
+
account
+
campaign
+
zone

tergantung jenis datanya.


---

# 17. IMPORT CSV

Karena beberapa platform mungkin belum menggunakan API, sistem harus dirancang untuk menerima CSV.

Contoh:

Meta CSV
Shopee CSV
ADU CSV
Terra CSV


Alur ideal:

Upload CSV
↓
Backend membaca CSV
↓
Validasi header
↓
Normalisasi data
↓
Preview
↓
Import
↓
Database
↓
Dashboard


JANGAN langsung memasukkan data yang formatnya tidak valid.


---

# 18. DATABASE

Project harus menggunakan database untuk data persistent.

Jangan menggunakan array JavaScript sebagai database permanen.

Database minimal harus mampu menyimpan:

- users (jika dibutuhkan)
- business managers
- meta ad accounts / WL
- Shopee accounts
- relasi WL ↔ Shopee
- campaigns
- daily Meta performance
- Shopee performance
- ADU performance
- Terra performance
- zones
- import history


Database dipilih berdasarkan kebutuhan deployment.

Jangan menentukan SQLite/PostgreSQL/MySQL secara sembarangan sebelum mempertimbangkan deployment.


---

# 19. IMPORT HISTORY

Setiap import sebaiknya tercatat.

Contoh:

ImportHistory

id
source
filename
date
rows_received
rows_imported
rows_failed
created_at


Tujuannya agar user dapat mengetahui:

- file apa yang sudah di-import
- kapan di-import
- berapa data berhasil
- apakah ada error


---

# 20. DUPLICATE PROTECTION

Import file yang sama atau data tanggal yang sama tidak boleh membuat data menjadi dobel tanpa peringatan.

Gunakan unique key / upsert sesuai kebutuhan.

Tetapi jangan mengganti historical data tanggal lain.


---

# 21. DASHBOARD

Dashboard utama nantinya harus memberikan ringkasan bisnis.

Contoh cards:

TOTAL SPEND

TOTAL REVENUE

TOTAL PROFIT

ROI

ACTIVE WL

PROBLEM WL

LOSS ZONES


Kemudian dapat memiliki chart:

Spend vs Revenue

Profit by Date

ROI by Date


Dan tabel:

Meta Performance

Shopee Performance

ADU

Terra

Loss Zones


---

# 22. UI / UX

Dashboard harus:

- sederhana
- cepat
- desktop friendly
- mudah dibaca
- tidak terlalu ramai
- data penting langsung terlihat
- responsive jika memungkinkan


Gunakan format angka yang mudah dibaca.

Contoh:

Rp1.250.000

bukan:

1250000


Persentase:

12.50%

bukan angka desimal yang sulit dibaca.


---

# 23. PROJECT ARCHITECTURE

Jangan membuat semua backend di satu file besar.

Pisahkan tanggung jawab.

Contoh konsep:

src/
├── routes/
├── controllers/
├── services/
├── repositories/
├── database/
├── utils/
└── config/


Frontend juga jangan menjadi satu file JavaScript raksasa jika project mulai besar.


---

# 24. ENVIRONMENT VARIABLES

Credential rahasia harus disimpan di:

.env


Contoh:

META_ACCESS_TOKEN=
DATABASE_URL=
SESSION_SECRET=


JANGAN:

- hardcode token
- commit token ke Git
- memasukkan token ke frontend


Tambahkan:

.env

ke:

.gitignore


Gunakan:

.env.example

untuk contoh variable tanpa credential asli.


---

# 25. META ACCESS TOKEN

Meta Access Token adalah SECRET.

Token hanya boleh digunakan oleh backend.

Frontend:

Browser
↓
Backend API
↓
Meta Graph API


JANGAN:

Browser
↓
Meta Graph API menggunakan token rahasia


---

# 26. ERROR HANDLING

API harus memberikan error yang jelas.

Contoh:

{
  "success": false,
  "message": "Terra CSV tidak memiliki kolom Zone"
}


Bukan hanya:

500 Internal Server Error


Backend tetap harus mencatat detail teknis error untuk debugging.


---

# 27. VALIDATION

Semua input harus divalidasi.

Contoh:

Spend tidak boleh string sembarangan.

Date harus valid.

Zone ID tidak boleh hilang jika diperlukan.

CSV harus mempunyai kolom wajib.


---

# 28. DEVELOPMENT RULES UNTUK CODEX

SEBELUM MEMBUAT ATAU MENGUBAH KODE:

1. Baca PROJECT_CONTEXT.md.
2. Periksa struktur project yang ada.
3. Pahami file yang berhubungan dengan perubahan.
4. Jangan menghapus fitur yang sudah berjalan tanpa alasan.
5. Jangan melakukan rewrite besar jika perubahan kecil sudah cukup.
6. Jelaskan perubahan penting.
7. Jaga backward compatibility jika memungkinkan.


---

# 29. JANGAN BERASUMSI

Jika struktur data eksternal belum diketahui, jangan mengarang.

Contoh:

Jika belum melihat CSV Terra:

JANGAN menganggap kolom pasti bernama:

zone_id
spend
revenue


Periksa CSV sebenarnya terlebih dahulu.


---

# 30. SAAT USER MEMBERIKAN FILE CSV

Lakukan:

1. inspect header
2. inspect beberapa row
3. identifikasi tipe data
4. jelaskan mapping
5. baru implementasikan parser


Jangan membuat parser berdasarkan tebakan.


---

# 31. PRIORITAS DEVELOPMENT

Project dibuat bertahap.

JANGAN langsung membuat semua fitur sekaligus.


Urutan awal yang disarankan:

PHASE 1
Project foundation

PHASE 2
Database

PHASE 3
Master data BM / WL / Shopee

PHASE 4
Meta integration

PHASE 5
Shopee data

PHASE 6
ADU / Terra import

PHASE 7
ROI Tracker

PHASE 8
Dashboard & reporting

PHASE 9
Automation & optimization


Tetapi urutan dapat berubah berdasarkan keputusan user.


---

# 32. WORKFLOW KERJA DENGAN USER

User ingin membangun project sambil belajar menggunakan VS Code.

Karena itu:

JANGAN memberikan 20 perubahan sekaligus.

Lebih baik:

Step 1
→ kerjakan
→ test

Step 2
→ kerjakan
→ test

Step 3
→ kerjakan
→ test


Jika terjadi error:

Periksa error sebenarnya terlebih dahulu.

Jangan menebak-nebak dan mengganti banyak file sekaligus.


---

# 33. SAAT MENULIS KODE

Prioritaskan:

- readable
- maintainable
- modular
- sederhana
- mudah dikembangkan


Hindari overengineering.

Project ini adalah aplikasi bisnis nyata, bukan demo/tutorial.


---

# 34. FITUR LAMA BUKAN ACUAN MUTLAK

User sebelumnya mempunyai beberapa:

- Google Apps Script
- Google Sheets
- CSV importer
- Express web app
- Meta exporter
- ROI tracker


Project baru ini dibuat DARI NOL.

Sistem lama digunakan untuk memahami business logic.

JANGAN otomatis menyalin architecture lama.


---

# 35. TUJUAN JANGKA PANJANG

Target akhirnya adalah satu Business Tracker yang memungkinkan user melihat:

META
+
SHOPEE
+
ADU
+
TERRA

dalam satu sistem.


Sehingga user dapat mengetahui:

Berapa uang yang dikeluarkan?

↓

Dari mana traffic berasal?

↓

Berapa revenue yang dihasilkan?

↓

Berapa profit?

↓

Berapa ROI?

↓

WL/Campaign/Zone mana yang bagus?

↓

WL/Campaign/Zone mana yang harus dihentikan?


# END OF PROJECT CONTEXT