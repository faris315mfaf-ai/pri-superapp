# Bot Redaksi — Pekerjaan 3 "Tangan di sosmed" (rencana)

Status: **rancangan, belum ada kode** (13 Okt 2026). Melanjutkan
[`BOT-REDAKSI-PEKERJAAN-2.md`](BOT-REDAKSI-PEKERJAAN-2.md). Memetakan lima permintaan pemilik
(13 Okt) ke paket kerja. Instagram dilewati dulu (hasil spike: YouTube dan TikTok berhasil,
Instagram butuh login). Tidak memuat rahasia; kata sandi awal akun bot dibaca dari variabel
lingkungan, bukan dari berkas ini.

## 1. Pemetaan permintaan ke paket kerja

| Permintaan pemilik | Paket | Ringkas |
|---|---|---|
| 1. Buat akun superapp bot1–3 dan hubungkan | 3G | Jalankan `scripts/buat-akun-bot.mjs` (sudah ada, dry-run default). Operasi, bukan kode baru |
| 2a. Master menautkan profil upload-post ke akun superapp, dengan pencarian dan filter divisi | 3C | Perluas fitur tautan yang **sudah ada** (§2) |
| 2b. Master membuat dan menamai template untuk dipakai bot | 3D | Perlu keputusan (§3) |
| 3. Bot punya akun superapp + profil sosmed yang dikelola | 3A + 3B | Posting inti dan Antrean ACC nyata |
| 4. Hubungkan bot dengan API key agar punya otak sendiri | 3E | Perlu keputusan penyimpanan kunci (§4) |
| 5. Rancangan cara melacak asal video | 3F | Dokumen [`BOT-REDAKSI-ASAL-VIDEO.md`](BOT-REDAKSI-ASAL-VIDEO.md); dibangun bertahap A–D |

## 2. Paket 3C — tautan profil upload-post (temuan pemetaan)

Fitur "tautkan profil upload-post yang sudah ada ke anggota" **sudah ada dua kali**: HR Center
(`src/features/dashboard/tv-anggota-panel.tsx`, `modal-tautkan-profil.tsx`, API
`/api/dashboard/tv-anggota`) dan Studio PALUGODAM (`/api/studio`). Kelemahannya:

- Pemilih anggota hanya mencari **nama**, tanpa filter divisi, dipotong 8 hasil.
- Divisi BOT sengaja di luar daftar `DIVISI`, jadi filter divisi tidak memunculkan bot.
- Aksi tautkan tidak memanggil `catatAudit` dan tidak mengirim kabar.
- Banyak kueri memakai `maybeSingle()`; bila satu pengguna atau satu `profile_key` punya dua baris,
  galat PostgREST dibuang dan hasilnya `null`. Akibatnya pemeriksaan "profil sudah dimiliki orang
  lain" bisa **lolos** dan profil tertaut ganda, atau pengguna dianggap tanpa profil.
- Indeks unik `sosmed_profile` tidak terverifikasi di repo (DDL dibuat lewat migrasi Supabase).

Rencana 3C:

1. Pemilih akun yang dipakai bersama: cari nama/username dan filter divisi (termasuk opsi "Divisi BOT"),
   data dari roster yang membawa field `divisi` (GET `/api/dashboard/tv-anggota` sudah membawanya).
2. Pengerasan validasi di sisi server, di satu fungsi bersama: profil ada di `daftarProfilUp`;
   belum dipakai baris mana pun (semua penyedia dan jenis, tanpa `maybeSingle`); pengguna aktif,
   bukan master, belum punya profil jenis `pengguna` kecuali `ganti` eksplisit; penyedia
   `upload-post`; profil `perluUlang` ditampilkan sebagai peringatan.
3. Jejak: jenis audit baru (`profil_tertaut`), kabar ke anggota yang ditautkan, bersihkan cache
   koneksi (`lupakanKoneksiTvr`), sinkron `akun_tvr_user`.
4. Periksa langsung di basis data apakah `sosmed_profile` punya indeks unik pada
   `(penyedia, profile_key)` dan `(penyedia, user_id)`; bila tidak, tambahkan lewat SQL manual.
5. Untuk akun bot: setelah tertaut, bot dapat memakai tombol unggah TVR Saya seperti anggota biasa.
   Tidak ada jalur khusus.

Risiko utama: **salah tautan** (akun sosmed orang lain terbaca milik bot atau sebaliknya; KPI dan
unggahan salah sasaran). Mitigasi: konfirmasi dua langkah dengan pratinjau akun terhubung, validasi
di atas, audit.

## 3. Paket 3D — template buatan master untuk bot (butuh keputusan)

Temuan: rute TVR hanya mengenal **satu template per akun** (bernama "TVR Saya"); template bernama
ganda hanya ada di keluarga `/api/video`. Mesin membaca template per akun (`tvr-<id>`).

| Opsi | Cara | Plus | Minus |
|---|---|---|---|
| A | Master membuat template di akunnya, lalu "salin ke bot" lewat rute salin baru di mesin | Template bernama, bisa dipakai banyak bot | Perlu perubahan **mesin** (rilis mesin, risiko tinggi) |
| B | Master mengedit template **di dalam akun bot** (impersonasi `kendaliMaster`) dan menamainya sebagai label di tabel app | Tanpa ubah mesin | Satu template aktif per bot; "nama" hanya label di aplikasi |
| C | Pustaka template di app: app menyimpan definisi template (JSON) bernama; saat bot dipasangi, app mengirim definisi itu ke template akun bot lewat rute tulis yang sudah ada | Bernama, banyak bot, tanpa ubah mesin bila rute tulis menerima JSON | Perlu memastikan bentuk JSON stabil; salinan bisa melenceng dari sumber |

Rekomendasi: **C**, dengan B sebagai langkah cadangan. Sebelum membangun, pemetaan ulang rute tulis
template untuk memastikan C layak.

## 4. Paket 3E — "otak" tersendiri per bot (butuh keputusan)

Tujuan: tiap bot punya API key LLM sendiri untuk hook, takarir, juri pemilih, dan ekstraksi kredit.

- Tidak ada pembantu enkripsi di repo. Usulan: AES-256-GCM dengan kunci induk di env aplikasi
  (`BOT_KUNCI_INDUK`), kolom `bot_redaksi.kunci_otak_terenkripsi` + `kunci_otak_akhir` (4 karakter
  terakhir untuk tampilan). Antarmuka **tulis-saja**: kunci tidak pernah dikirim balik ke browser.
- Tombol "uji kunci" memanggil satu permintaan kecil; hasil dicatat lewat `catatPemakaianAi`.
- Kunci hanya didekripsi di aplikasi saat memanggil LLM. **Tidak dikirim ke runner** (runner tetap
  hanya memegang `BOT_RUNNER_SECRET`).
- Pilihan penyedia dibatasi daftar yang sudah didukung aplikasi; tanpa kunci, bot memakai otak
  bawaan aplikasi atau berhenti di langkah yang butuh LLM (diputuskan di §6).

Alternatif lebih sederhana: kunci per bot di env VPS (`BOT_OTAK_BOT1`), tanpa enkripsi basis data,
tetapi master tidak bisa mengelolanya dari antarmuka. Tidak direkomendasikan.

## 5. Paket 3A dan 3B — posting dan Antrean ACC

Urutan status tetap: `siap_ditinjau → menunggu_acc → disetujui → posting → selesai`.

- `lib/bot-posting.ts` memakai ulang pustaka unggah yang ada (salin stok mesin ke penyimpanan
  `tvrku`, panggil upload-post). Bendera `POSTING_AKTIF` **mati** secara bawaan.
- Mode `acc` (awal): tidak ada unggah sebelum master menyetujui. Mode `otomatis` hanya setelah
  dinyalakan master per bot.
- Peralihan status atomik (`UPDATE ... WHERE tahap = <asal> RETURNING id`) supaya klik ganda atau
  dua proses tidak memposting dua kali.
- Jadwal maksimal 30 menit ke depan karena upload-post tidak punya API pembatalan; **jeda** membatalkan
  dengan menghapus berkas penyimpanan sebelum waktu jadwal.
- Pencocokan KPI: simpan `request_id`, judul masuk takarir, tulis baris `tvrku_post` segera setelah
  unggah.
- 3B: layar Antrean ACC memakai API nyata (setujui, tolak, edit takarir) dengan audit.

## 6. Urutan pengerjaan dan titik uji

| Tahap | Isi | Bergantung pada | Risiko produksi |
|---|---|---|---|
| 1 | 3C: pemilih akun + validasi + audit | — | Rendah (hanya app) |
| 2 | 3G: SQL 67, `BOT_RUNNER_SECRET`, jalankan skrip akun (dengan persetujuan), tautkan profil bot via 3C | tahap 1 | Sedang (operasi manual) |
| 3 | 3D: template (setelah keputusan) | tahap 2 | Rendah bila C |
| 4 | 3E: kunci otak | keputusan §4 | Sedang (rahasia) |
| 5 | 3A + 3B: posting di belakang bendera, uji akun uji, mode `acc` | tahap 2–4 | Tinggi (posting nyata) |
| 6 | 3F tahap A (kredit), lalu B (sidik) | tahap 4 | Rendah–sedang |

Aturan sepanjang pekerjaan: tiap paket punya uji murni; tidak ada push ke `main` tanpa perintah
pemilik; perubahan mesin (bila ada) diuji lokal dulu.

## 7. Keputusan yang dibutuhkan dari pemilik

1. Template: opsi A, B, atau C (§3). Rekomendasi C.
2. Penyimpanan kunci otak: AES-GCM di basis data dengan kunci induk di env (rekomendasi) atau env per bot.
3. Urutan: mulai dari 3C (rekomendasi) atau 3A.
4. Persetujuan eksplisit sebelum menjalankan skrip pembuat akun bot dan SQL 67 di produksi.
