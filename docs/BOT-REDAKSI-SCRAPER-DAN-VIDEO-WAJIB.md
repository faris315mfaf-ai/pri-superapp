# Bot Redaksi — scraper gratis, anti-tabrakan antar bot, dan deteksi Video Wajib

Status: **rancangan dan hasil riset, belum ada kode** (13 Okt 2026). Melengkapi
[`BOT-REDAKSI-RENCANA-UJICOBA.md`](BOT-REDAKSI-RENCANA-UJICOBA.md). Tidak memuat rahasia.

## 1. Temuan pemetaan kode (fakta repo)

### n8n hanya penjadwal
- n8n memicu `POST /api/berita/scrape` dengan header `x-pri-secret` tiap ±5 menit
  (`src/app/api/berita/scrape/route.ts`). Seluruh pekerjaan scraping dilakukan
  **kode aplikasi**, lewat TikHub (berbayar, hanya IG dan TikTok)
  (`src/lib/scrape-berita.ts`, `src/lib/tikhub.ts`). Workflow n8n tidak ada di repo.
- Artinya "menggantikan n8n" cukup berarti **mengganti pemicu waktu**, dan opsional
  **mengganti TikHub** dengan scraper gratis. Tidak perlu alat workflow baru: runner
  bot sudah punya jam sendiri.

### Tidak ada penguncian video antar-orang
- Tabel `berita`: kolom `dipakai` **tidak pernah diisi `true`** oleh kode. Tidak ada
  `dipakai_oleh` atau kunci.
- `POST /api/tv/tugas` tidak mengecek URL ganda, jadi satu berita bisa ditugaskan dua
  kali. Satu-satunya penanda "terpakai" bersifat turunan (`/api/berita/hasil` mencocokkan
  `berita.link_video` dengan `tugas_link.url` dan `video_antrian`).
- "DOKSLI" di sistem berarti dokumentasi atau video asli tanpa overlay (status default
  `video_antrian` = `MENUNGGU DOKSLI`; di Video Wajib, `link_doksli` adalah tautan bahan).
- **Akibat:** anti-tabrakan antar bot harus dibangun sendiri; tidak ada mekanisme untuk dipakai ulang.

### Video Wajib dari Pimred
- Tabel `tvr_video_wajib` (judul, keterangan, `link_doksli`, kategori, `batas_waktu` bertipe
  date, `aktif`, berkas bahan opsional di R2/bucket). Dibuat oleh pemegang wewenang
  (Pimred, Direktur Eksekutif, TV Rakyat Nasional, tim TV).
- **Siaran ke semua anggota**: tidak ada penerima per-akun, **tidak ada status
  "terpenuhi"**, dan **tidak ada notifikasi** (`kirimKabar` tidak dipanggil). Anggota hanya
  melihat daftar baris `aktif = true` (maks 50) di panel; mereka melapor lewat alur TVR Saya
  biasa, tanpa tertaut ke id permintaan.
- `GET /api/tv/video-wajib` mengembalikan juga `berkas_url` bertanda tangan (24 jam).
- Fitur "Request Video" lama (per-user, status dikerjakan/selesai) sudah dihapus 13 Sep;
  tabel `tvr_request*` yatim.
- Semua logika ada di route handler, bukan fungsi lib, jadi proses server tidak bisa
  memakainya langsung tanpa ekstraksi atau query sendiri.

## 2. Scraper gratis di GitHub

Hasil riset 13 Okt 2026 (dari halaman proyek dan ulasan; **status IG/TikTok berubah
cepat, wajib diuji sebelum dipercaya**).

| Alat | Lisensi | Kegunaan di sini | Catatan |
|---|---|---|---|
| **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** | Unlicense (biner PyInstaller membawa kode GPLv3+) | Mendaftar video akun/kanal (`--flat-playlist`) dan mengunduh. **Sudah ada di mesin** | Rilis stabil bulanan + nightly. TikTok: ekstraktor profil sudah diperbaiki sejak 2024.05.27, cookie membantu daftar penuh. Instagram: hampir selalu perlu cookie, dan satu laporan 2026 menunjukkan perlu *impersonation* (`curl_cffi`). YouTube kanal: umumnya jalan |
| **[Instaloader](https://github.com/instaloader/instaloader)** | MIT | Profil Instagram publik: daftar postingan, caption, metadata | Tanpa login untuk profil publik, tetapi pembatasan laju dan blokir akun umum. Tidak ada jaminan |
| **[gallery-dl](https://github.com/mikf/gallery-dl)** | GPL-2.0 | Cadangan multi-situs (IG, X, dll.) | Pengembangan pindah ke Codeberg; cakupan IG/TikTok tidak terverifikasi di halaman proyek |
| **[RSSHub](https://github.com/DIYgod/RSSHub)** | AGPL-3.0 | Pembuat umpan RSS untuk banyak situs (YouTube, situs berita NTV bila ada rutenya); image Docker `diygod/rsshub` | Rute IG/TikTok historisnya rapuh. AGPL aman untuk instans pribadi tanpa modifikasi |
| TikTokApi (davidteather) | tidak terverifikasi | TikTok via Playwright | Sering rusak saat TikTok berubah; **tidak direkomendasikan sebagai pilihan pertama** |
| instagrapi | — | API privat Instagram | Pembuatnya sendiri menyebutnya rapuh; risiko akun diblokir tinggi. **Dihindari** |
| YouTube feed bawaan | — | `youtube.com/feeds/videos.xml?channel_id=…` | Resmi, gratis, stabil; tanpa alat tambahan |

Pengganti n8n (hanya bila kelak ingin pembuat alur visual): Activepieces (inti MIT), Node-RED
(Apache-2.0), Huginn (MIT, tag rilis lama), Windmill (AGPL). **Tidak diperlukan** untuk
rancangan ini.

### Rekomendasi: "Pemanen" berbasis yt-dlp di Rumah Bot
- Modul `pemanen` di layanan `autoedit-bot`, memakai **yt-dlp** yang sudah ada di mesin:
  mendaftar video terbaru tiap sumber (`--flat-playlist` + metadata), lalu mengirim kandidat
  ke aplikasi lewat `POST /api/bot/internal` (tabel `bot_kandidat`).
- **YouTube/NTV lewat feed RSS bawaan YouTube**, bukan scraping.
- **IG/TikTok**: yt-dlp dengan berkas cookie dari **akun sosmed tumbal khusus** (bukan akun
  utama), disimpan hanya di VPS mesin dengan izin 0600, di luar repo. TikHub tetap sebagai
  cadangan berbayar yang bisa dinyalakan per sumber.
- Pembatasan laju yang sopan: jeda antar-permintaan, batas per akun per jam, berhenti seketika
  saat 429 atau tantangan login. **Tidak ada** rotasi proxy atau penyamaran sidik jari.
- Pembaruan yt-dlp terjadwal (nightly/mingguan) karena situs sering berubah.
- Pemicu waktu = jam runner (mengganti n8n); gerbang interval tetap memakai
  `pengaturan_sistem` seperti `bolehScrapeTerjadwal`.

### Ujian sehari sebelum membangun (spike)
Dari IP VPS mesin: jalankan yt-dlp `--flat-playlist` pada akun NTV (YouTube, TikTok,
Instagram) dan akun lain yang Anda tentukan; catat tingkat keberhasilan, kebutuhan cookie,
dan kecepatan. Keputusan alat dibuat dari hasil ujian ini, bukan dari daftar di atas.

### Peringatan
- Scraping Instagram/TikTok melanggar ketentuan layanan mereka; akun tumbal bisa diblokir.
- Hak cipta konten sumber tetap tanggung jawab pemilik (kredit sumber wajib, ACC manual).

## 3. Anti-tabrakan antar bot

Aturan: **satu video sumber hanya boleh dipakai satu bot, dan tidak dipakai dua kali.**

Karena sistem lama tidak punya penguncian (§1), dibangun di tabel baru:

1. **Kunci kanonik sumber.** Tiap kandidat diberi `kunci_kanonik = platform + ":" + id_postingan`
   (shortcode IG, id video TikTok/YouTube), diekstrak dari URL setelah dinormalkan
   (buang parameter pelacak, domain pendek, `www`). Tabel `bot_kandidat` punya
   **`UNIQUE (kunci_kanonik)`**.
2. **Klaim atomik.** Bot mengklaim kandidat dengan satu perintah SQL
   (`UPDATE bot_kandidat SET diklaim_oleh = :bot, diklaim_pada = now() WHERE id = :id AND diklaim_oleh IS NULL RETURNING id`).
   Hanya satu bot yang mendapat baris; bot lain mendapat nol baris dan memilih kandidat
   lain. Klaim terjadi **sebelum** unduh, jadi tidak ada unduhan sia-sia.
3. **Klaim kedaluwarsa.** Klaim yang tidak maju dalam 30 menit dilepas, tetapi kandidat yang
   sudah menjadi tugas (`bot_tugas`) tidak pernah dilepas dan tidak pernah dipakai ulang
   (pemakaian ulang hanya lewat reset master).
4. **Pemeriksaan lintas sistem.** Sebelum memilih, kunci kanonik dicocokkan dengan sumber yang
   sudah dipakai manusia: `video_antrian.video_asli`, `tugas_link.url`, `berita.link_video`,
   dan `tvrku_post`. Hasil tabrakan dicatat. Opsional: menandai `berita.dipakai = true`
   (kolom yang selama ini mati).
5. **Pembagian sumber.** Tiap sumber ditetapkan ke satu bot (kolom `bot_id` di `bot_sumber`,
   seperti di mockup). Ini mengurangi persaingan; klaim atomik tetap jadi pengaman bila
   dua bot berbagi sumber.
6. **Video yang sama di platform berbeda** (NTV memposting klip identik di IG, TikTok, dan
   YouTube): tahap awal memakai heuristik judul/caption mirip + durasi ±2 detik; tahap lanjut
   memakai sidik frame (perceptual hash) dari mesin. Dicatat sebagai risiko tersisa.
7. **Uji tabrakan.** Uji otomatis yang menjalankan 3 klaim serentak atas satu kandidat dan
   memastikan hanya satu berhasil; uji kunci kanonik untuk berbagai bentuk URL.

## 4. Deteksi Video Wajib oleh bot

Berdasarkan §1, deteksi dilakukan dengan **polling**, karena tidak ada notifikasi.

1. **Pembaca permintaan.** Fungsi lib baru membaca `tvr_video_wajib` (aktif, belum lewat
   `batas_waktu`) memakai query yang sama dengan route; route tidak diubah.
2. **Pelacakan sendiri.** Tabel `bot_video_wajib (video_wajib_id UNIQUE, bot_id, status, tugas_id)`.
   Karena sistem lama tidak mencatat pemenuhan, bot yang melacak: satu permintaan hanya
   diambil satu bot (klaim atomik yang sama seperti §3).
3. **Prioritas.** Permintaan Pimred didahulukan atas hasil pencarian otomatis, dan
   `batas_waktu` dipakai untuk urutan.
4. **Bahan.** `link_doksli` (diunduh mesin; domain wajib lolos allowlist) atau `berkas_url`
   (berkas bahan di R2/bucket, tautan 24 jam diambil saat dibutuhkan). Hasilnya melewati
   alur yang sama: edit → ACC → posting, dengan kategori dari permintaan.
5. **Tampil di mana-mana.** Di Ruang Bot sebagai kartu "Permintaan Pimred" (tenggat, bot yang
   mengambil, status), dan di **TVR Saya akun bot** sebagai bagian "Tugas Bot" (hanya untuk
   akun Divisi BOT, yaitu saat master mengendalikan akun bot): daftar permintaan terdeteksi,
   daftar kandidat dari pemanen, klaim dan statusnya, dengan tombol "Cari sekarang" dan
   "Ambil permintaan" untuk master.
6. **Pemberitahuan ke Pimred (opsional, tahap lanjut).** Karena sistem lama tidak mencatat
   siapa yang memenuhi permintaan, bisa ditambah tabel pemenuhan agar Pimred melihat
   "dipenuhi oleh bot Raka". Menyentuh fitur Pimred, jadi di luar ujicoba awal.

## 5. Dampak pada rencana ujicoba

| Pekerjaan | Penambahan |
|---|---|
| Spike (sebelum 1) | Ujian yt-dlp sehari dari VPS mesin (§2); keputusan alat dari hasilnya |
| 1 Rumah & Ruang | Tabel `bot_kandidat`, `bot_video_wajib` di `sql/67`; DIVISI_BOT; kendali bot; gerbang login di `buatSesi`; tab dan dock (sebagian **sudah dikerjakan**) |
| 2 Otak di mesin | Modul `pemanen` (yt-dlp) + klaim atomik + pembaca Video Wajib; bagian "Tugas Bot" di TVR Saya; uji tabrakan |
| 3 Tangan di sosmed | Tidak berubah. Permintaan Pimred selalu lewat ACC |

Risiko tambahan:

| Risiko | Mitigasi |
|---|---|
| Scraper IG/TikTok gratis diblokir atau sering rusak | Spike dulu; YouTube lewat feed resmi; TikHub sebagai cadangan per sumber; yt-dlp diperbarui terjadwal; kegagalan dicatat, bot berhenti mencari tanpa merusak tugas lain |
| Akun tumbal diblokir | Akun terpisah dari akun utama; batas laju sopan; berhenti saat tantangan login |
| Cookie bocor | Hanya di VPS mesin, izin 0600, di luar repo; tidak melewati aplikasi |
| Dua bot mengambil video yang sama | Kunci kanonik unik + klaim atomik + uji serentak |
| Klip identik di platform berbeda lolos | Heuristik awal, sidik frame kelak; dicatat sebagai risiko tersisa |
| Video Wajib dipenuhi dobel (manusia dan bot) | Tidak ada status pemenuhan di sistem lama; bot hanya mengambil permintaan yang belum diklaim bot lain dan Pimred dapat menutupnya (`aktif = false`) |
| Pimred tidak tahu bot sudah mengerjakan | Kartu di Ruang Bot; pemberitahuan opsional tahap lanjut |
