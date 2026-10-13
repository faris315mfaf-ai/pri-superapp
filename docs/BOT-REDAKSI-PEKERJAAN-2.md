# Bot Redaksi — Pekerjaan 2 "Otak di mesin" (rencana terkoreksi)

Status: **kode 2A–2E selesai dan lolos uji; belum aktif** (13 Okt 2026). 2F (Tugas Bot di TVR Saya) selesai. Menggantikan bagian Pekerjaan 2 di
[`BOT-REDAKSI-RENCANA-UJICOBA.md`](BOT-REDAKSI-RENCANA-UJICOBA.md) bila berbeda. Tidak memuat rahasia.

## 1. Temuan pemetaan mesin yang mengubah rancangan

| Temuan (fakta repo) | Dampak pada rancangan |
|---|---|
| Mesin **tidak punya langkah unduh terpisah**: sumber diunduh DI DALAM job render (status `downloading`) | Tahap `unduh` dan `edit` digabung dalam satu job mesin. Sumber yang buruk baru ketahuan saat job gagal |
| `POST /api/tvr/jobs` **tidak mengembalikan `job_id`** langsung; job gagal **hilang** dari daftar | Satu bot = satu job aktif, runner menyimpan penanda (hook) dan membandingkan daftar job sebelum/sesudah. Job yang hilang tanpa muncul di stok = gagal |
| **Tidak ada fungsi daftar akun/profil** di mesin; `--flat-playlist` tidak ada di mana pun | Modul **pemanen** (yt-dlp listing) harus dibuat baru di runner. Biner yt-dlp sudah ada di image |
| Mesin hanya mendengar di **soket Unix** (tanpa port TCP) | Runner memasang volume `/srv/godam/sock` dan memakai `socketPath` |
| Firewall keluar kontainer **menolak alamat privat** (10/8, 172.16/12) | Runner tidak bisa memakai jalur WireGuard. Ia memanggil aplikasi lewat **internet publik** (`https://pri-superapp.com`) dan mesin lewat soket |
| **Pipeline rilis mesin menyalakan SELURUH compose tiap deploy aplikasi**; build jauh yang gagal menggagalkan rilis mesin | Layanan runner **wajib `profiles: ["bot"]`** supaya tidak menyala sendiri, dan runner **dibundel di image yang sudah ada** (entri esbuild ketiga) bukan image baru. Bundel diuji lokal sebelum push |
| `autoedit.env` di VPS mesin disaring ketat | Runner memakai berkas env **sendiri** (`bot.env`, dibuat manual, izin 0600) |
| yt-dlp berversi "latest saat image dibangun" tanpa pembaruan otomatis | Risiko usang antar deploy dicatat; pemanen mendeteksi kegagalan beruntun dan berhenti |
| Template per akun wajib ada, tidak ada pilihan di badan job | Pemeriksaan awal: 409 "Buat dan tetapkan template dulu" dilaporkan sebagai `template_belum_ada` (penghalang konfigurasi, bukan kegagalan bot) |
| Kuota penyimpanan penuh = **413**, antrean penuh = 429, stok penuh = 409 | Dipetakan ke kode galat di `lib/bot-protokol.ts` |

## 2. Alur final

```
runner ──ambil_kerja──▶ aplikasi (bot-mesin.putuskan)
                        ├─ diam (alasan)
                        ├─ panen  (daftar sumber)        ──▶ runner: yt-dlp listing ──lapor kandidat──▶ app
                        ├─ buat_video (url, naskah)      ──▶ runner: hook → job mesin ──lapor job_dibuat──▶ app
                        └─ pantau_job                    ──▶ runner: poll stok       ──lapor job_selesai/gagal──▶ app
```

- Aplikasi memilih kandidat (skor kebaruan/tayangan, bukan yang diklaim bot lain, bukan yang
  sudah dipakai manusia) dan **mengklaimnya secara atomik** sebelum membuat tugas.
- Video Wajib Pimred didahulukan: bila ada permintaan aktif yang belum diambil bot lain, ia
  menjadi tugas (sumber = `link_doksli`) sebelum hasil panen.
- Hasil akhir Pekerjaan 2: tugas `siap_ditinjau` dengan video di Stok mesin. **Tidak ada
  jalur posting.**

Protokol lengkap (tipe): `src/lib/bot-protokol.ts`. Logika keputusan murni: `src/lib/bot-mesin.ts`.
Kunci anti-tabrakan: `src/lib/bot-kunci.ts`.

## 3. Pekerjaan kecil di dalam Pekerjaan 2

| # | Pekerjaan | Pemilik berkas | Syarat selesai |
|---|---|---|---|
| 2A | Inti murni: kunci kanonik, mesin keputusan, protokol | `lib/bot-kunci`, `bot-mesin`, `bot-protokol` | **Selesai**, 30 + 36 uji lulus |
| 2B | **Selesai** (69 + 146 uji). Sisi aplikasi: `ambil_kerja` dan `lapor`, pemilihan + klaim atomik, pembaca Video Wajib | `lib/bot-kerja`, `bot-pilih`, `bot-video-wajib`, route `internal` | Uji murni lulus; semua tahan tabel belum ada |
| 2C | **Selesai** (88 uji). CRUD Sumber & Blokir (API + layar nyata) | `api/bot/sumber`, `bot-data`, tampilan Sumber & Kuota | Master bisa menambah/mematikan sumber; validasi dan audit |
| 2D | **Selesai** (241 uji, bundel esbuild terverifikasi). Runner di mesin: klien aplikasi, klien mesin lewat soket, pemanen yt-dlp, mesin giliran | `src/bot-runner/*`, Dockerfile, compose (profile), `bot.env.example` | Bundel esbuild sukses lokal; uji murni lulus |
| 2E | **Selesai** (belum dijalankan di VPS). Skrip ujian pemanen (spike) untuk dijalankan di VPS mesin | `scripts/spike-pemanen.sh` | Menghasilkan laporan keberhasilan per akun |
| 2F | **Selesai** (31 + 204 uji). Bagian "Tugas Bot" di TVR Saya akun bot | `features/tvr-ku/*` | Tampil hanya untuk akun Divisi BOT |

## 4. Risiko dan mitigasi (tambahan dari temuan mesin)

| Risiko | Mitigasi |
|---|---|
| Layanan baru menyala sendiri saat deploy aplikasi dan mengganggu mesin | `profiles: ["bot"]`; dinyalakan manual `docker compose --profile bot up -d autoedit-bot` |
| Bundel runner merusak build image mesin (rilis mesin gagal) | Runner hanya memakai modul bawaan Node; entri esbuild ditambah dan **dijalankan lokal** sebelum push; uji `node --check` hasil bundel |
| Runner merebut CPU worker render | Batas kontainer ketat; satu job aktif per bot; jam aktif di luar jam ramai |
| Job hilang tanpa jejak (gagal) | Runner menyimpan hook dan membandingkan daftar job/stok; hilang tanpa stok = `job_gagal` (`hilang`) |
| Kuota 413 atau stok penuh memblokir bot diam-diam | Dipetakan ke kode galat; Ruang menampilkan penghalang jelas dan bot berhenti, bukan mengulang |
| Template bot belum dibuat | Pemeriksaan awal; penghalang `template_belum_ada` tidak menambah hitungan gagal beruntun |
| yt-dlp usang atau diblokir | Pemanen berhenti setelah N kegagalan beruntun dan melapor; spike mengukur lebih dulu |
| Dua bot mengambil video sama | `UNIQUE kunci_kanonik` + klaim `UPDATE ... WHERE diklaim_oleh IS NULL`; uji serentak |
| Runner dibajak (VPS mesin) | Hanya memegang `BOT_RUNNER_SECRET`; HMAC + nonce; aksi terbatas pada akun Divisi BOT |
