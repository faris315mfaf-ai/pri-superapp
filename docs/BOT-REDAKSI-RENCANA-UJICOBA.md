# Bot Redaksi — rencana ujicoba awal (3 pekerjaan)

Status: **rencana, belum ada kode** (13 Okt 2026). Memuat keputusan terbaru
pemilik dan membagi pekerjaan besar menjadi **3 pekerjaan kecil** yang masing-masing
bisa dikirim, diuji, dan dibatalkan sendiri. Rancangan umum ada di
[`BOT-REDAKSI.md`](BOT-REDAKSI.md) dan [`BOT-REDAKSI-INTEGRASI.md`](BOT-REDAKSI-INTEGRASI.md);
tampilan acuan: [`mockups/pri-ruang-bot.html`](mockups/pri-ruang-bot.html).
**Dokumen ini tidak memuat kata sandi apa pun.**

## 0. Status pekerjaan (13 Okt 2026, malam)

**Pekerjaan 1 "Rumah & Ruang": kode selesai dan lolos uji; belum aktif di produksi** karena
menunggu persetujuan migrasi dan akun.

| Bagian | Status |
|---|---|
| Tab RUANG BOT di dock (hanya master), 4 tampilan | Selesai, **sudah di produksi** (data contoh) |
| `DIVISI_BOT`, gerbang login akun bot di `buatSesi`, Kendali Akun BOT di TVR Saya | Selesai, **sudah di produksi** |
| `sql/67_bot_redaksi.sql` | Ditulis, **belum dijalankan** |
| `GET /api/bot/status`, `POST /api/bot/kendali`, `POST /api/bot/internal` (aksi `denyut`, HMAC) | Selesai |
| Realtime `bot-ruang`, saklar modul `ruangbot` (bawaan nyala), audit `bot_*` | Selesai |
| Layar memakai data nyata bila tabel ada dan ada bot; selain itu data contoh | Selesai |
| `scripts/buat-akun-bot.mjs` (latihan dulu, sandi dari env, tidak di repo) | Ditulis, **belum dijalankan** |
| Uji: `uji-ruang-bot` (30), `uji-bot-hmac` (17), `uji-bot-data` (26) | Lulus |

Urutan mengaktifkan (butuh persetujuan pemilik): jalankan `sql/67` → push kode → atur
`BOT_RUNNER_SECRET` di aplikasi → skrip akun (`--jalankan`) → verifikasi.

## 1. Keputusan pemilik yang berlaku

| # | Keputusan |
|---|---|
| 1 | Bot adalah **akun anggota sungguhan** di **Divisi BOT**, dengan username `bot1`, `bot2`, `bot3`. Bot **tetap terhitung anggota** (tidak dikecualikan dari peringkat, KPI, koin, dan sebagainya) |
| 2 | Divisi BOT hanya memakai modul **TVR Saya**; Edit Otomatis terbuka berapa pun jumlah akun sosmednya |
| 3 | **Hanya master** yang bisa membuka **RUANG BOT**; ruangnya muncul sebagai modul master, sesuai mockup, dengan pembaruan berkala |
| 4 | Bot **hidup di mesin**: dipasang sebagai layanan terpisah di VPS mesin (pemisah dari aplikasi dan dari worker render) |
| 5 | Ujicoba awal dibagi menjadi 3 pekerjaan kecil dengan mitigasi risiko |

### Koreksi dari pemeriksaan kode (13 Okt 2026)
- **Edit Otomatis TVR Saya sudah terbuka untuk semua akun sejak 6 Okt 2026**
  (`bolehEditOtomatisTvr` di `src/lib/peran.ts`: terbuka kecuali master menutupnya
  per akun lewat `modul_izin`). Syarat "≥5 akun sosmed sehat" yang tertulis di
  `AGENTS.md` sudah tidak berlaku. Untuk Divisi BOT **tidak ada perubahan kode**;
  cukup pastikan `modul_izin.autoedit` tidak diisi `false`. Catatan di `AGENTS.md`
  perlu diperbarui.
- **Kata sandi bawaan dan keamanan.** Akun anggota yang bisa login dengan username
  yang mudah ditebak dan kata sandi lemah adalah celah nyata: pemegang akun bisa
  memakai TVR Saya, memposting lewat akun sosmed yang tertaut, dan membaca stok bot.
  Agar permintaan Anda tetap terpenuhi sekaligus aman, rancangannya:
  1. Kata sandi bawaan tetap disimpan (di-hash `scrypt` seperti akun lain) **tetapi
     login ditolak server untuk semua akun Divisi BOT**, di setiap jalur masuk
     (sandi, Google, WebAuthn, dan jalur sesi lain). Bot digerakkan server, bukan lewat login.
  2. Kata sandi **tidak ditulis di repo atau dokumen**; skrip pembuat akun membacanya
     dari argumen/env saat dijalankan.
  3. Manusia (master) tetap bisa mengendalikan akun bot lewat **beralih akun**
     (`X-Sebagai`), yang tidak memerlukan kata sandi.
  Bila Anda tetap ingin akun bot bisa login biasa, itu risiko yang Anda tanggung;
  saya sarankan tidak.

### Dampak "bot terhitung anggota" (diterima)
Karena bot tidak dikecualikan, ia akan ikut muncul dan terhitung di: peringkat
mingguan/koin/TVR, KPI, laporan TVR, absensi dan kepatuhan (bot akan tampak
tidak hadir), roster/daftar anggota, kontak chat, dan penerima pengumuman. Koin
atau insentif per video bisa mengalir ke akun bot. Tidak ada pekerjaan tambahan
untuk ini di ujicoba, tetapi **dipantau** (lihat §6) dan bisa dibatasi kelak
dengan satu filter terpusat bila mengganggu.

## 2. Arsitektur final: "Rumah Bot" di mesin

```
 Master (RUANG BOT)            VPS aplikasi                         VPS mesin
 ┌──────────────┐   HTTPS   ┌───────────────────┐   HTTPS +      ┌──────────────────────┐
 │ tab modul    │◀─────────▶│ /api/bot/status   │   tanda tangan │ autoedit-bot (baru)  │
 │ master       │  realtime │ /api/bot/internal │◀──────────────▶│  runner TypeScript   │
 └──────────────┘           │ tabel bot_*       │                │  hanya pegang:       │
                            │ semua kunci luar: │                │  APP_URL + rahasia   │
                            │ Supabase, TikHub, │                │  runner              │
                            │ DeepSeek,         │                └──────────┬───────────┘
                            │ upload-post       │                           │ soket Unix
                            └───────────────────┘                           ▼
                                                                  API mesin Auto Edit
                                                                  (hook, jobs, stok, sumber)
```

Pembagian tugas:

- **Runner (mesin)** = jam dan tangan di sisi mesin. Berjalan terus, tiap beberapa
  detik menanyakan pekerjaan ke aplikasi, melakukan bagian yang menyangkut mesin
  (unduh sumber, hook, render, menunggu hasil), lalu melapor.
- **Aplikasi** = otak dan satu-satunya pemegang kunci layanan luar. Ia mengerjakan
  bagian yang butuh kunci (cari lewat TikHub, pilih lewat DeepSeek, posting lewat
  upload-post) dan menyimpan seluruh keadaan di tabel `bot_*`.
- **Mengapa dibelah begini:** runner hanya memegang satu rahasia (rahasia runner),
  jadi bocornya VPS mesin tidak membuka Supabase, upload-post, TikHub, atau DeepSeek.
  Logika posting tetap satu basis kode di aplikasi, tanpa duplikasi di proyek mesin.

### Kontrak runner ↔ aplikasi
`POST /api/bot/internal` dengan aksi `denyut` (detak + keadaan global), `ambil_kerja`
(pekerjaan berikutnya untuk satu bot), dan `lapor` (hasil atau kemajuan).

- Setiap permintaan ditandatangani HMAC (isi + stempel waktu + nonce); jendela
  5 menit; nonce dipakai sekali (cegah pemutaran ulang).
- Aksi hanya berlaku untuk akun Divisi BOT. Runner tidak bisa menyentuh akun lain.
- Gagal tertutup: jika `denyut` gagal 3 kali berturut-turut atau aplikasi menjawab
  `jeda`, runner berhenti bekerja. Tanpa detak 3 menit, Ruang menampilkan "Runner mati"
  dan master dikabari.

### Penempatan di VPS mesin
- Layanan baru `autoedit-bot` (kontainer `pri-autoedit-bot`) di
  `vps/mesin/docker-compose.yml`, **terpisah** dari `autoedit-ts-api` dan
  `autoedit-ts-worker`; satu jaringan `autoedit`; tanpa port terbuka.
- Batas sumber daya ketat (mis. `cpus: 0.5`, `memory: 512M`, `pids: 128`) agar tidak
  mengganggu worker render (6,5 CPU / 16 GB).
- Memasang soket yang sama dengan jembatan (`/srv/godam/sock:/run/autoedit`)
  untuk memanggil API mesin; berkas sistem hanya-baca; `restart: unless-stopped`.
- Rahasia di berkas env di VPS (izin 0600, di luar repo), bukan di compose.
- Rilis lewat `vps/mesin/pasang.sh` secara **manual**, terpisah dari deploy aplikasi
  (GitHub Actions). Hanya layanan baru yang dinyalakan; layanan lain tidak disentuh.

## 3. Pembagian: 3 pekerjaan kecil

| # | Pekerjaan | Hasil yang bisa dilihat | Menyentuh sosmed? | Menyentuh mesin? |
|---|---|---|---|---|
| 1 | **Rumah & Ruang**: akun bot, tab RUANG BOT, data, runner kosong | Master melihat ruangan dengan 3 bot diam dan "Runner online" | Tidak | Hanya detak |
| 2 | **Otak di mesin**: cari → pilih → unduh → edit sampai video jadi | Satu video buatan bot1 muncul di Stok, tanpa diposting | Tidak | Ya (render) |
| 3 | **Tangan di sosmed**: ACC lalu posting terkendali | Satu video benar-benar tayang di akun uji setelah disetujui master | Ya | Ya |

Syarat lanjut antar pekerjaan (gerbang Go/No-Go) ada di akhir tiap pekerjaan.
Setiap pekerjaan dikirim sebagai commit tersendiri. Push ke `main` memicu deploy
dan me-restart aplikasi; migrasi SQL dijalankan manual **sebelum** push dan hanya
setelah Anda menyetujuinya.

---

## 4. Pekerjaan 1 — Rumah & Ruang

**Tujuan.** Semua fondasi di aplikasi, tanpa pekerjaan nyata. Pada akhirnya master
melihat Ruang Bot yang hidup (data dari tabel, bukan simulasi) dan runner kosong
terhubung.

### Langkah
1. **Migrasi `sql/67_bot_redaksi.sql`**: `bot_redaksi`, `bot_sumber`, `bot_tugas`,
   `bot_log`, `bot_blokir`, `bot_runner` (detak terakhir). Idempoten, RLS aktif tanpa policy.
   Kode tahan tabel belum ada (`tabelBelumAda`).
2. **Konstanta dan helper**: `DIVISI_BOT` (`struktur.ts`), `adalahBot(user)`,
   `bolehRuangBot(user)` = **hanya master** (superadmin masuk sebagai master).
3. **Skrip pembuat akun** (`scripts/buat-akun-bot.mts`, dijalankan master): membuat
   `bot1`–`bot3` dengan `divisi = Divisi BOT`, `role = anggota`, email internal
   (domain tak terpakai), kata sandi dari argumen/env (di-hash `scrypt`), penanda WA
   terverifikasi dan tutorial selesai terisi, `modul_izin.autoedit` tidak `false`.
4. **Blokir login Divisi BOT** di semua jalur masuk, dengan pesan sama seperti
   "username atau kata sandi salah" (tidak membocorkan keberadaan akun).
5. **Tab RUANG BOT** untuk master: `KunciTab`, `KONFIG_TAB`, `warna-dock.ts`,
   `TAB_ROLE.master`, `dynamic()` di `page.tsx`, `LABEL_LAYAR_AUDIT`. Tidak lewat
   `modul_izin`, karena khusus peran master.
6. **API baca**: `GET /api/bot/status` (bot, tugas, log, kuota, status runner),
   berpagar `bolehRuangBot`, `bungkus`, tanpa cache.
7. **Komponen kanvas + empat tampilan** (Ruang, Detail Bot, Antrean ACC, Sumber & Kuota)
   dari mockup, membaca API di atas. Data awal: 3 bot diam di sofa. Tampilan yang
   belum ada datanya (ACC, sumber) menampilkan keadaan kosong yang jelas.
8. **Realtime**: topik `bot-ruang` (payload hanya `{jenis, t}`) + polling cadangan
   (20 dtk terputus, 90 dtk tersambung).
9. **Kendali**: saklar `bot_jeda_global` dan jeda per bot lewat `POST /api/bot/kendali`
   (pagar master, rate-limit, audit `bot_jeda`).
10. **Titik akhir runner**: `POST /api/bot/internal` hanya aksi `denyut`, dengan tanda
    tangan HMAC dan uji pemutaran ulang.
11. **Sakelar modul** global (bawaan MATI) untuk mematikan seluruh tab tanpa deploy.

### Uji dan kriteria selesai
- `tests/uji-bot-akses.mts`: master lolos; semua peran lain 403 di semua `/api/bot/*`.
- `tests/uji-login-bot.mts`: `bot1` dengan kata sandi bawaan **ditolak** di semua jalur masuk.
- `tests/uji-bot-hmac.mts`: tanda tangan salah, kedaluwarsa, dan nonce ulang ditolak.
- `tsc`, `eslint --max-warnings 0`, `npm run build` bersih.
- Master membuka tab, melihat 3 bot, menekan jeda, dan status berubah; bukan-master tidak melihat tab.
- Estimasi: ±3–4 hari.

### Titik deploy
SQL manual (setelah persetujuan Anda) → push → jalankan skrip akun → verifikasi.

### Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Kata sandi lemah + username mudah ditebak membuka akun bot | Login Divisi BOT ditolak server di semua jalur + uji otomatis; kata sandi tidak di repo; hash `scrypt` |
| Bot muncul di peringkat, absensi, roster, koin | Diterima pemilik; dipantau (§6); filter terpusat disiapkan sebagai opsi bila mengganggu |
| Migrasi gagal atau terlanjur dijalankan setengah | Satu transaksi (`--single-transaction`, `ON_ERROR_STOP`), idempoten, hanya tabel baru + 3 baris `app_user`; mundur dengan menghapus baris itu |
| Kode terdeploy sebelum tabel ada | SQL lebih dulu; kode tahan tabel belum ada |
| Tab ke-8 menyesakkan navigasi bawah master di ponsel | Cek kapasitas `bottom-nav`; cadangan: sub-layar dari Panel Master |
| Kanvas boros baterai atau memicu aturan lint | Loop dihentikan saat tab tidak aktif; posisi bot di `ref`; uji di ponsel |
| Endpoint internal disalahgunakan | HMAC + jendela waktu + nonce sekali pakai + hanya akun Divisi BOT + rate-limit |
| Deploy me-restart aplikasi saat ramai | Dikirim saat sepi |

**Mundur:** matikan sakelar modul, `git revert`, hapus 3 baris akun bot.
**Gerbang ke Pekerjaan 2:** tab tampil benar, login bot ditolak, uji HMAC lolos.

---

## 5. Pekerjaan 2 — Otak di mesin (sampai video jadi, tanpa posting)

**Tujuan.** Satu bot (hanya `bot1`) bekerja penuh di mesin dan menghasilkan satu
video di Stok. **Jalur posting tidak ada** pada pekerjaan ini (dijaga bendera
`POSTING_AKTIF=0`, bahkan kodenya belum dimuat).

### Langkah
1. **Layanan `autoedit-bot`** di compose mesin (§2) + `Dockerfile` ringan + berkas env.
   Kode runner di `src/bot-runner/` (TypeScript, tanpa dependensi berat), mesin status
   murni di berkas sendiri agar mudah diuji.
2. **Titik akhir runner lengkap**: `ambil_kerja` dan `lapor`, status per tahap
   (`cari → pilih → unduh → edit → siap_ditinjau`), klaim atomik per tugas.
3. **Pencarian**: `bot-sumber.ts` (TikHub untuk IG/TikTok), dedupe `kunci_sumber`
   unik lintas bot, batas permintaan harian, berhenti saat 429.
4. **Pemilihan**: `bot-pilih.ts` (skor kebaruan/tayangan + juri DeepSeek untuk skor
   abu-abu); alasan keputusan dicatat ke `bot_log`.
5. **Sumber & Kuota nyata**: CRUD `bot_sumber`, daftar blokir, kuota harian, jam aktif
   (WIB, dihitung di aplikasi).
6. **Beralih akun untuk Divisi BOT** (`targetKendali` di `sebagai.ts`, khusus master)
   agar master bisa membuat **template bot1** lewat UI TVR Saya. Template dibuat
   manual sekali.
7. **Pemeriksaan awal tugas**: template ada, kuota mesin cukup, hook dibuat lewat
   `/api/tvr/hook`, job lewat `/api/tvr/jobs`, polling stok sampai selesai.
8. **Ruang hidup**: tiap langkah menulis `bot_log` + siaran realtime; bot di ruang
   berpindah meja sesuai tahap; "Runner online/mati" dari detak.
9. **Lingkup ujicoba**: hanya `bot1`, satu sumber (akun NTV di Instagram), kuota
   **1 tugas per hari**, jam aktif sempit di luar jam ramai render.

### Uji dan kriteria selesai
- `tests/uji-bot-mesin.mts` (fungsi murni): urutan tahap, kuota, gagal beruntun,
  jeda, jam aktif, pencegahan tugas ganda.
- `tests/uji-bot-sumber.mts`: dedupe, allowlist, blokir.
- Satu siklus penuh `bot1`: video jadi muncul di Stok, tercatat di log, Ruang menampilkan
  semua tahap; **tidak ada** satu pun panggilan upload-post.
- Tombol jeda menghentikan runner dalam satu putaran.
- Estimasi: ±5–6 hari.

### Titik deploy
1. Push aplikasi dulu (endpoint siap, runner belum ada → Ruang menampilkan "Runner mati").
2. Di VPS mesin: buat berkas env, jalankan `pasang.sh` dengan **hanya** layanan baru
   (Anda yang menjalankan atau menyetujui; saya tidak mengakses VPS tanpa perintah).
3. Verifikasi layanan lain tetap sehat (`docker ps`, uji status API mesin).

### Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Rahasia runner bocor | Runner hanya memegang rahasia ini; HMAC + nonce + jendela waktu; hanya akun Divisi BOT; prosedur rotasi (ganti di dua sisi, runner restart) |
| Runner merebut CPU dari render anggota | Batas kontainer (0,5 CPU / 512 MB); maksimum 1 job aktif per bot; jam aktif di luar jam ramai; antrean render sudah adil per pemilik |
| Kuota/biaya TikHub membengkak | Batas permintaan harian per bot; berhenti saat 429; angka pemakaian tampil di Sumber & Kuota |
| yt-dlp diblokir atau kena 429 | Mundur bertahap, coba kandidat berikutnya, maksimum 3 percobaan per tugas, lalu `gagal` dengan alasan |
| Loop tak berujung menghabiskan render | Pagar `kunci_sumber` unik; kuota dihitung dari tugas yang **dibuat**, bukan hanya yang selesai; berhenti otomatis setelah 3 gagal beruntun + kabar ke master |
| Juri LLM salah pilih | Pada ujicoba manusia menilai hasilnya; skor dan alasan tersimpan untuk kalibrasi |
| Template belum ada → job gagal | Pemeriksaan awal; Ruang menampilkan penghalang jelas "template belum dibuat" |
| Kuota mesin akun bot (2 GB) penuh | Stok terhapus otomatis 48 jam; cek kuota sebelum render |
| Salah pasang di mesin mengganggu layanan render | Compose hanya **menambah** satu layanan; hanya `up -d autoedit-bot`; verifikasi layanan lain; mundur dengan `stop autoedit-bot` |
| Aplikasi tidak terjangkau dari mesin | Runner gagal tertutup (berhenti), Ruang menampilkan "Runner mati" |

**Mundur:** hentikan kontainer, `bot_jeda_global = 1`.
**Gerbang ke Pekerjaan 3:** minimal 3 siklus bersih berturut-turut, tanpa kebocoran
render atau kuota, dan video hasil dinilai layak oleh master.

---

## 6. Pekerjaan 3 — Tangan di sosmed (ACC lalu posting terkendali)

**Tujuan.** Satu video hasil bot benar-benar tayang di **akun uji** setelah
disetujui master. Kemudian diperluas ke `bot2` dan `bot3`.

### Langkah
1. **`bot-posting.ts` khusus bot (tidak menyentuh `/api/tvr/unggah`)**: urutan
   salin hasil dari stok mesin ke penyimpanan unggah (pola `api/tv/stok-tim`) → susun
   caption dengan **kredit sumber wajib** → validasi memakai lib yang sudah ada
   (`BATAS_CAPTION_TVR`, `periksaJadwal`) → kunci `ambilKunciUnggah` + pagar riwayat →
   `unggahVideoUp` → tulis `tvrku_post` agar pencocok KPI mencatat tautan tayang.
   Hanya orkestrasi yang baru; aturan bisnis dipakai ulang, bukan disalin.
2. **Antrean ACC nyata**: status `siap_ditinjau → menunggu_acc → disetujui → posting`;
   persetujuan memakai transisi atomik (klik ganda tidak memposting dua kali); layar
   menampilkan pratinjau, caption, kredit, dan jadwal sebelum tombol Setujui.
3. **Jadwal pendek**: posting dijadwalkan paling lama 30 menit ke depan, supaya
   jeda darurat masih sempat membatalkan; jeda juga membatalkan jadwal bot yang
   belum tayang (memakai fungsi pembatalan jadwal yang sudah ada).
4. **Deteksi akun bermasalah**: `reauth_required` atau galat platform menghentikan
   bot dan mengabari master.
5. **Notifikasi** (`kirimKabar`) ke master: video menunggu ACC, posting gagal,
   akun perlu dihubungkan ulang. Cabang `target: "ruangbot"` di `handleTarget`.
6. **Akun uji**: hubungkan **akun sosmed uji** untuk `bot1` lewat beralih akun
   (login sosmed tetap manusia). Mode `acc`, kuota 1 per hari, jarak antar-post ≥ 3 jam.
7. **Perluasan bertahap**: `bot2`, lalu `bot3` hanya setelah `bot1` lolos 3 hari.
   Mode `otomatis` belum dibuka pada ujicoba ini.

### Uji dan kriteria selesai
- `tests/uji-bot-posting.mts`: kredit sumber wajib, batas caption, jadwal, pagar dobel,
  klik ganda tidak memposting dua kali, timeout **tidak** diulang otomatis.
- Uji produksi dengan teknik yang sudah ada (sesi uji, pembersihan sesudahnya):
  satu video disetujui → tayang di akun uji → tautan tercatat di `laporan_video`.
- Jeda darurat membatalkan jadwal yang belum tayang.
- Estimasi: ±4–5 hari.

### Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Hak cipta dan takedown atas konten sumber | Akun uji dulu; kredit sumber wajib; hanya sumber allowlist; ACC manual; kuota 1 per hari; simpan URL sumber; siapkan prosedur menurunkan konten bila ada keluhan |
| Posting dobel (tidak bisa ditarik) | Transisi status atomik; kunci proses + pagar riwayat; tanpa percobaan ulang otomatis setelah timeout |
| Salah klik Setujui | Layar pratinjau dengan caption dan kredit; konfirmasi di halaman; semua keputusan diaudit |
| Token upload-post kedaluwarsa | Deteksi `reauth_required`; bot berhenti dan master dikabari |
| Akun bot dibatasi atau diblokir platform | Kuota rendah, jarak antar-post, berhenti seketika pada peringatan platform; akun uji terpisah dari akun utama |
| Jadwal sudah di antrean saat jeda ditekan | Jadwal pendek (≤ 30 menit) + pembatalan otomatis saat jeda |
| Kuota upload-post (dibagi seluruh anggota) | Berhenti saat `kuotaMenipis`; angka tampil di Sumber & Kuota |
| Aturan bisnis menyimpang dari jalur anggota | Memakai lib yang sama (`batas-caption`, `jadwal-unggah`); tidak menyalin logika; uji kesetaraan |
| Bot ikut peringkat, koin, KPI sehingga angka anggota terdistorsi | Diterima; setelah posting pertama periksa peringkat TVR, koin, dan KPI; opsi filter terpusat bila mengganggu |
| Menyentuh jalur produksi anggota | Tidak: `/api/tvr/unggah` tidak diubah pada ujicoba; penyatuan kode ditunda sebagai pekerjaan terpisah |

**Mundur:** `POSTING_AKTIF=0`, `bot_jeda_global=1`, batalkan jadwal tertunda, `git revert`.
**Gerbang selesai ujicoba:** 3 hari bersih tanpa posting dobel, tanpa keluhan konten,
dan angka peringkat/koin/KPI anggota tidak terdistorsi secara berarti.

---

## 7. Prasyarat yang hanya bisa dikerjakan manusia

1. Menyetujui dan menjalankan `sql/67` (dan migrasi lain) di produksi.
2. Menyiapkan kata sandi bawaan akun bot saat menjalankan skrip pembuat akun.
3. Membuat 1 akun sosmed **uji** dan menghubungkannya ke `bot1` (login sosmed tidak bisa diotomasi).
4. Membuat template video `bot1` lewat TVR Saya (aset diunggah manual).
5. Membuat dan memasang rahasia runner di kedua sisi, lalu menjalankan `pasang.sh` di VPS mesin.
6. Menetapkan sumber awal, kuota harian, dan jam aktif ujicoba.

## 8. Pemantauan selama ujicoba

- Ruang Bot: detak runner, tugas tersangkut, kuota harian, galat terakhir.
- Log audit `bot_*` dan umpan `bot_log`.
- Notifikasi ke master untuk: gagal 3× beruntun, runner mati, akun perlu hubungkan ulang, kuota layanan menipis.
- Harian: peringkat TVR/koin/KPI (efek bot terhitung anggota), antrean render, kuota TikHub dan upload-post.

## 9. Ringkasan jadwal kasar

| Pekerjaan | Perkiraan | Titik bergantung pada Anda |
|---|---|---|
| 1 Rumah & Ruang | 3–4 hari | Persetujuan SQL, kata sandi bawaan, deploy |
| 2 Otak di mesin | 5–6 hari | Template bot1, rahasia runner, `pasang.sh` di VPS mesin |
| 3 Tangan di sosmed | 4–5 hari | Akun sosmed uji, persetujuan tiap video |

Total ±12–15 hari kerja, ditambah masa pengamatan di antara gerbang.
