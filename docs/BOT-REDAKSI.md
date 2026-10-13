# Bot Redaksi — rancangan

Status: **rancangan, belum ada kode** (12 Okt 2026). Dokumen ini hasil pemetaan
komponen yang sudah ada di SuperApp. Tidak berisi rahasia.

## Tujuan

2–3 bot yang tiap hari bekerja seperti redaktur: mencari video terbaru dari
akun sumber (NTV dan akun lain), memilih yang paling pas, mengeditnya dengan
alat Auto Edit, lalu memostingnya ke akun sosmed milik bot. Di SuperApp ada
**Ruang Bot** tempat wujud bot terlihat dan aktivitasnya tampil langsung.

## Keputusan yang sudah diambil pemilik

| Hal | Keputusan |
|---|---|
| Sumber video | Scraping akun publik |
| Otonomi | Otomatis penuh, dengan batas |
| Akun sosmed | Akun baru terpisah per bot |
| Wujud | Avatar 2D + ruang dengan aktivitas live |

Batas dari sisi pembangun: bot tampil jelas sebagai bot di dalam aplikasi, dan
**tidak** ada rotasi proxy, spoof fingerprint, atau akun palsu untuk menghindari
deteksi platform. Risiko hak cipta dan ketentuan platform atas konten sumber
tetap menjadi tanggung jawab pemilik.

## Prinsip rancangan

1. **Mesin status bertahap di DB, bukan satu proses panjang.** Cron berbatas
   ±280 dtk, sedangkan unduh + render + posting bisa menit-menitan. Tiap tick
   cron memajukan tiap tugas satu langkah kecil, lalu keluar.
2. **Bot bukan baris `app_user`.** Mengisi `app_user` mencemari roster, KPI,
   absensi, kepatuhan, koin, dan peringkat, dan `role` punya CHECK tanpa
   'bot'. Bot punya tabel sendiri; hanya identitas mesin yang berupa id angka.
3. **Gagal tertutup.** Ragu, kuota habis, akun perlu hubungkan ulang, atau
   tombol jeda aktif → bot berhenti dan mencatat alasannya. Tidak pernah
   memposting "sebisanya".
4. **Semua tindakan tercatat** di log bot (sumber ini juga yang memberi makan
   Ruang Bot).

## Alur satu tugas

```
cari → pilih → unduh → edit → tunggu_render → posting → selesai
                                         ↘ gagal (alasan tercatat)
```

| Tahap | Apa yang terjadi | Memakai yang sudah ada |
|---|---|---|
| cari | Ambil postingan terbaru tiap sumber bot, upsert ke tabel kandidat | `tikhub.ts` `scrapeAkun` (IG/TikTok). YouTube/NTV: feed RSS kanal (baru) |
| pilih | Skor kandidat (kebaruan, tayangan/suka, belum pernah dipakai) lalu juri DeepSeek untuk 3 teratas | `deepseek.ts` `tanyaJson`; field tayangan/suka sudah ada di `PostinganScrape` |
| unduh | Mesin mengunduh URL sumber | `mesin-video/unduh.ts` (yt-dlp, allowlist, batas 200 MB) |
| edit | Hook (DeepSeek) → buat job render dengan template bot | `/api/tvr/hook`, `/api/tvr/jobs`; perlu helper POST baru di `autoedit.ts` |
| tunggu_render | Polling stok/jobs mesin tiap tick | mesin tidak punya callback |
| posting | Unggah ke profil sosmed bot, dengan kunci anti-dobel | `unggahVideoUp`, `ambilKunciUnggah` |

Pencegah ulang: hash URL sumber unik per bot; sumber yang sama tidak dipilih
dua kali, juga lintas bot.

## Data (migrasi `sql/67_bot_redaksi.sql`, RLS aktif tanpa policy)

- `bot_redaksi` — id, nama, persona, id_mesin (angka, pola `ID_TIM`), profil
  sosmed (`sosmed_profile.profile_key`), mode (`acc` | `otomatis`), kuota
  harian, jam aktif WIB, aktif, jeda.
- `bot_sumber` — daftar akun sumber yang **diizinkan** per bot (platform,
  handle, kategori). Bot tidak boleh mengambil dari luar daftar ini.
- `bot_tugas` — satu baris per kandidat yang dikerjakan: tahap, kunci sumber
  (hash), id job mesin, id stok, hasil posting, galat, waktu tiap tahap.
- `bot_log` — aliran kejadian (waktu, bot, jenis, teks singkat) untuk Ruang Bot.
- Pengaturan global di `pengaturan_sistem`: saklar jeda darurat semua bot.

## Identitas & kuota di mesin

Tiap bot butuh id mesin sendiri (mis. `900000002`, `900000003`, …) dengan
kuota di `vps/mesin/docker-compose.yml` — env **api dan worker** harus sama
(`KUOTA_KHUSUS_MB`, `TVR_MAKS_STOK_KHUSUS`, `TVR_JOB_AKTIF_KHUSUS`). Gerbang
`/api/autoedit` perlu jalur bot (seperti `x-autoedit-tim`) yang
memeriksa bahwa pemanggil adalah proses server bot, bukan pengguna.
Perubahan compose = redeploy mesin.

Template tiap bot **dibuat sekali lewat UI** (aset diunggah manual).

## Posting

- Login sosmed tiap akun bot **tetap dilakukan manusia sekali** lewat tautan
  hubungkan upload-post (tidak bisa diotomasi). Token bisa kedaluwarsa
  (`reauth_required`): bot berhenti dan memunculkan peringatan di Ruang Bot.
- Logika posting sekarang terkubur di route `/api/tvr/unggah` (700+ baris,
  butuh sesi manusia). Perlu **diekstrak ke fungsi lib** yang dipakai bersama
  route dan bot, bukan ditiru. Pagar dobel dan batas caption ikut terbawa.
- Caption selalu memuat kredit sumber (field "sumber" sudah ada).
- Kuota upload-post dipakai bersama seluruh anggota: bot berhenti bila
  `kuotaMenipis`.

## Batas keselamatan (wajib, bukan opsional)

- Kuota harian per bot (awal rendah, mis. 2–3 post/hari) dan jam aktif WIB.
- Daftar sumber diizinkan (`bot_sumber`) + daftar blokir.
- Saklar jeda darurat global dan per bot, terlihat di Ruang Bot.
- Mode awal tiap bot **`acc`** (hasil menunggu persetujuan manusia); dilepas ke
  `otomatis` per bot setelah masa percobaan. Pilihan "otomatis penuh" tetap
  tersedia, hanya default-nya hati-hati. Jalur `/api/tv/unggah` sudah punya
  persetujuan Pimred; jalur TVR Saya tidak — perlu keputusan tata kelola.
- Render bot berprioritas rendah, maksimum 1 job aktif per bot, dijadwalkan di
  luar jam ramai (CPU jenuh di ±3–4 render).
- Log lengkap + notifikasi ke pemilik bila bot gagal berturut-turut.

## Ruang Bot (UI)

- Pola paling cocok: **`tv-langsung`** — server menyiarkan kejadian lewat
  `siarkanRealtime`, klien mendengar dengan `kanalLangsung`, dan umpan
  aktivitas dibaca dari log. Bukan pola lobi robot (gerakannya disimulasikan
  klien, tidak ada peserta sisi server).
- Tiap tahap tugas = satu "meja": Meja Pencarian, Meja Edit, Meja Posting,
  Pojok Istirahat. Avatar bot berpindah ke meja sesuai tahap; bubble menampilkan
  kejadian terbaru.
- Avatar: **SVG baru** (tidak ada sprite raster di repo), memakai pola
  `robot-svg.tsx` / sistem skin yang ada, satu persona per bot.
- Panel samping: kuota hari ini, antrean, riwayat post (tautan), status akun,
  tombol jeda. Panel kendali hanya untuk master/Pimred.
- Topik realtime publik: payload hanya `{jenis, t}`, detail diambil lewat API
  berpagar.

## Tahapan pembangunan

0. **Persiapan manusia**: nama/persona bot, akun sosmed baru + hubungkan,
   daftar sumber, template per bot, kuota harian.
1. **Kerangka + Ruang Bot** dengan data contoh: migrasi, `bot_log`, UI ruang,
   avatar. Tidak menyentuh mesin atau sosmed.
2. **Cari + pilih (dry-run)**: bot menjalankan pencarian dan seleksi, hanya
   mencatat ke log. Tidak unduh, tidak posting.
3. **Unduh + edit**: helper POST mesin, id mesin bot, hasil berhenti di stok.
4. **Posting mode `acc`**: ekstraksi lib posting, antre persetujuan.
5. **Lepas otomatis per bot** dengan semua batas aktif.

Setiap tahap dikirim dan dipantau terpisah (push ke `main` = deploy).

## Risiko yang harus diterima atau dimitigasi

- **Hak cipta/takedown** atas konten NTV dan akun lain; akun bot bisa kena
  strike atau suspend. Mitigasi: kredit sumber, daftar sumber terbatas, mode
  `acc` di awal, akun terpisah agar tidak menular ke akun utama.
- **Scraping rapuh**: TikHub berbayar dan berkuota; yt-dlp hanya untuk URL
  tunggal dan kena 429; IG butuh cookie. YouTube/Facebook/NTV belum ter-scrape
  sama sekali.
- **Kapasitas render** dibagi dengan ratusan anggota.
- **Dua kunci DeepSeek di dua env** (aplikasi dan mesin): pastikan keduanya
  terisi.

## Keputusan yang masih terbuka

1. Berapa bot, nama, dan persona masing-masing?
2. Platform mana per bot (IG/TikTok/YouTube/…)?
3. Daftar sumber awal (akun NTV dan lainnya)?
4. Kuota harian dan jam aktif per bot?
5. Siapa pemilik akun sosmed bot dan siapa yang menanggung hubungkan ulang?
6. Mode awal `acc` dulu, atau langsung otomatis?

Mockup visual Ruang Bot (isometrik pixel-art, interaktif): `docs/mockups/pri-ruang-bot.html` — buka langsung di browser.
