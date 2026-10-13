# Bot Redaksi — rancangan integrasi ke SuperApp

Status: **rancangan, belum ada kode** (13 Okt 2026). Melengkapi
[`BOT-REDAKSI.md`](BOT-REDAKSI.md) (apa yang dibangun) dengan **bagaimana
memasangnya ke repo ini**. Acuan tampilan: mockup interaktif
[`mockups/pri-ruang-bot.html`](mockups/pri-ruang-bot.html). Nomor baris di
bawah diambil dari pemetaan repo per 13 Okt 2026 dan bisa bergeser.
Dokumen ini tidak berisi rahasia.

> **Diperbarui 13 Okt 2026 (sore).** Keputusan pemilik terbaru ada di
> [`BOT-REDAKSI-RENCANA-UJICOBA.md`](BOT-REDAKSI-RENCANA-UJICOBA.md) dan
> **menggantikan** bagian berikut di dokumen ini:
>
> - **§1a butir 1 (pengecualian bot dari ±25 titik agregat): tidak dikerjakan.** Pemilik
>   memutuskan bot tetap terhitung anggota.
> - **§1a butir 2 (gerbang Edit Otomatis ≥5 akun): keliru.** Edit Otomatis TVR Saya sudah
>   terbuka untuk semua akun sejak 6 Okt 2026 (`bolehEditOtomatisTvr`); tidak ada
>   perubahan kode untuk Divisi BOT.
> - **§1 / §13 akses Ruang Bot:** hanya **master**, sebagai tab modul master (bukan `modul_izin`).
> - **§1 / §4 / §12 tempat mesin tugas:** diputuskan **runner terpisah di VPS mesin**
>   (bukan cron aplikasi). Runner hanya memegang rahasia runner; aplikasi tetap memegang
>   semua kunci layanan luar dan seluruh keadaan di tabel `bot_*`. Detail di rencana ujicoba §2.
> - **§1a butir 3 (login):** bot dibuat dengan username `bot1`–`bot3` dan kata sandi bawaan
>   pilihan pemilik, **tetapi login ditolak server untuk semua akun Divisi BOT**.
> - **§6 dan tahap 3:** posting bot memakai `bot-posting.ts` sendiri yang memakai ulang lib
>   aturan (`batas-caption`, `jadwal-unggah`); route `/api/tvr/unggah` **tidak diubah** pada ujicoba.

## 1. Keputusan arsitektur

| Hal | Keputusan | Alasan |
|---|---|---|
| Letak di aplikasi | **Satu tab "Ruang Bot"** dengan empat tampilan di dalamnya (Ruang, Detail Bot, Antrean ACC, Sumber & Kuota), dibuka lewat `modul_izin` per akun | Hanya akun yang dibuka master yang melihat tabnya, jadi navigasi anggota lain tidak ramai. Sub-layar (pola Audit) tetap cadangan bila tab terasa berlebihan |
| Akses bot | Bot adalah **akun anggota di Divisi BOT** yang hanya memakai modul **TVR Saya** (keputusan pemilik, 13 Okt 2026) | Bot memakai alat yang sama dengan manusia, sesuai tujuan awal. Lihat §1a |
| Akses Ruang Bot (manusia) | Satu fungsi `bolehRuangBot`: master, Pimred, pemegang wewenang TV. *Menunggu konfirmasi pemilik* | Pola yang sama dengan `bolehRuangTv` dan `bolehAudit` |
| Saklar fitur | **Sakelar modul global** (`sakelar-modul.ts`, bawaan MATI), bukan `fitur_izin` | `pastikanFiturAktif` selalu meloloskan master, jadi kunci fitur tidak berfungsi untuk modul khusus master |
| Mesin tugas | **Rute cron aplikasi** `/api/cron/bot-langkah`, tiap tick memajukan tiap tugas satu langkah | Memakai infrastruktur yang ada. Satu langkah kecil muat dalam batas ±280 dtk |
| Sumber kebenaran | Tabel `bot_*` di Supabase | Ruang hanya menampilkan keadaan nyata, tidak ada simulasi di server |
| Gerak di ruang | **Disimulasikan klien** dari perubahan tahap tugas | Server tidak punya proses yang "hadir" di ruang; klien cukup menganimasikan perpindahan |
| Identitas bot | **Baris `app_user` sungguhan** (`divisi = "Divisi BOT"`), ditambah baris `bot_redaksi` untuk perilaku (mode, kuota, jam). Id mesin = id `app_user` | Menggantikan rancangan awal (id mesin khusus seperti `ID_TIM`). Konsekuensinya dibahas di §1a, terutama pengecualian bot dari peringkat, KPI, koin, dan absensi |
| Persetujuan ACC | **Sebelum** upload, bukan sesudah | Posting sosmed tidak bisa ditarik. Lihat catatan di bawah tentang mockup |

> **Catatan mockup.** Di mockup, hasil bot bermode ACC muncul di antrean setelah
> tahap Posting. Pada implementasi nyata urutannya dibalik: setelah Edit selesai,
> tugas berstatus `menunggu_acc`; baru setelah disetujui bot mengunggah
> (dengan `scheduled_date`). Tahap Posting tetap ada di ruang, hanya terjadi
> setelah ACC bila mode `acc`.

## 1a. Divisi BOT: bot sebagai akun anggota

Keputusan pemilik: bot ditempatkan di **Divisi BOT**, dan divisi itu **hanya
membuka modul TVR Saya**. Artinya bot memakai persis alat yang dipakai anggota:
unggah sosmed, Edit Otomatis TVR Saya, Stok Video, jadwal, dan laporan. Tidak
ada jalur khusus bot di mesin Auto Edit.

### Cara bot "bertindak sebagai" akunnya
Sudah ada preseden: `src/lib/sebagai.ts` (header `X-Sebagai`) membuat admin
PALUGODAM mengendalikan akun anggota Divisi PALUGODAM, **hanya** di endpoint TVR
Saya yang memanggil `userEfektifTvr()`. Rencana yang sama untuk Divisi BOT:

1. Tambah `DIVISI_BOT = "Divisi BOT"` di `struktur.ts`, dan izinkan `targetKendali`
   mengendalikan akun Divisi BOT bagi master/Pimred. Manfaat sampingan: manusia
   bisa mengambil alih akun bot di TVR Saya (memperbaiki, menguji, atau
   menghubungkan ulang) tanpa jalur baru.
2. Mesin tugas cron **tidak** memakai HTTP dan sesi. Ia memanggil fungsi lib
   (`posting-anggota.ts`) dengan objek `UserEfektif` milik akun bot, sehingga
   tidak perlu mencetak token sesi (jalan pintas `buatSesi` dihindari).
3. Kendali tetap terkunci di modul TVR Saya. Endpoint lain (chat, absensi, koin)
   memakai `pastikanMasuk` biasa dan tidak mengenali bot.

### Yang dibawa gratis oleh pilihan ini
- **Mesin Auto Edit tidak berubah.** Id mesin = id `app_user`; kuota bawaan
  2 GB, stok 48 jam, template per akun, dan penghapus latar berlaku seperti
  anggota. Tidak ada id khusus, tidak ada env kuota baru, dan **tidak perlu redeploy
  mesin** untuk kuota (berbeda dengan rancangan awal).
- Profil sosmed lewat alur `hubungkan` yang ada (`sosmed_profile`,
  `akun_tvr_user`), jadi tidak perlu tabel profil khusus.
- Riwayat, KPI video, dan laporan TVR bot sudah tercatat oleh sistem yang ada.

### Yang harus ditangani (harga pilihan ini)
1. **Pengecualian bot dari agregat.** Ada 205 pembaca `app_user` di 86 berkas,
   dan ±25 titik agregat akan ikut menghitung bot: `peringkat-mingguan`,
   `peringkat-koin`, `peringkat-tvr`, `tvr-peringkat.ts`, `kpi`, `kepatuhan`,
   `absensi` (+ `sadar`), `koin/kelola`, `koin.ts`, `dashboard/*`,
   `tvr/laporan-*`, `penerima-hr.ts`, `notifikasi.ts` (siaran), dan `pengguna`
   (daftar anggota/roster). Rencana: satu fungsi `adalahBot(user)` dan satu
   filter terpusat (`.neq("divisi", DIVISI_BOT)` lewat helper), diterapkan
   di titik-titik itu dan diuji. Bot sendiri tetap muncul di Ruang Bot.
2. **Gerbang Edit Otomatis TVR Saya** terbuka hanya bila ≥5 akun sosmed sehat.
   Akun bot hanya punya 1 profil, jadi master harus **membuka paksa**
   `modul_izin.autoedit = true` per akun bot (mekanisme sudah ada).
3. **Login dan verifikasi.** `app_user` mewajibkan email unik dan `password_hash`
   tidak null; rilis 2.1 mewajibkan verifikasi WA dan tutorial. Akun bot dibuat
   dengan email internal (mis. `bot-raka@bot.pri-superapp.invalid`), hash acak
   yang tidak pernah dipakai (tidak ada yang tahu sandinya, tidak ada sesi),
   `wa_terverifikasi` dan penanda tutorial diisi agar tidak memicu layar wajib.
   Uji bahwa `api/login` menolak akun ini.
4. **Kemunculan di fitur sosial.** Bot akan muncul di pencarian anggota, kontak
   chat, dan daftar penerima pengumuman bila tidak disaring. Perlu disaring di
   tempat yang sama dengan butir 1.
5. **Pembuatan akun** sebaiknya lewat satu fungsi/endpoint khusus master
   (`bot-akun.ts`), bukan formulir Kelola Pengguna, agar `divisi`, `role`
   (`anggota`), dan pengaman di atas selalu terisi.
6. **Hak koin dan insentif** (kelola-koin, kewajiban video harian) tidak boleh
   berlaku bagi bot; masuk dalam butir 1.

Bila daftar pengecualian ternyata terlalu luas atau berisiko, cadangan adalah
kembali ke rancangan awal (bot di luar `app_user`, id mesin khusus). Itu
menghindari ±25 titik pengecualian, tetapi menambah id mesin khusus, kuota
compose, dan ekstraksi posting yang lebih besar.

## 2. Peta berkas

### Baru

| Berkas | Isi |
|---|---|
| `sql/67_bot_redaksi.sql` | Tabel `bot_redaksi`, `bot_sumber`, `bot_tugas`, `bot_log`, `bot_acc` (lihat §3) |
| `src/lib/bot-akses.ts` | `bolehRuangBot(user)`, pagar API |
| `src/lib/bot-mesin.ts` | Mesin status bertahap (fungsi murni, mudah diuji): `langkahBerikut(tugas, keadaan)` |
| `src/lib/bot-sumber.ts` | Ambil kandidat: TikHub (IG/TikTok), feed RSS YouTube; dedupe per hash URL |
| `src/lib/bot-pilih.ts` | Skor kandidat + juri DeepSeek untuk skor abu-abu |
| `src/lib/bot-render.ts` | Panggil mesin Auto Edit (hook, job, polling stok) sebagai identitas bot |
| `src/lib/posting-anggota.ts` | **Diekstrak** dari `api/tvr/unggah/route.ts`, dipakai route dan bot |
| `src/lib/bot-realtime.ts` | Pembungkus `siarkanRealtime` untuk topik `bot-ruang` |
| `src/app/api/bot/status/route.ts` | GET keadaan ruang (bot, tugas, log terakhir, kuota) |
| `src/app/api/bot/acc/route.ts` | GET antrean, POST setujui / tolak / edit ulang |
| `src/app/api/bot/sumber/route.ts` | CRUD sumber dan daftar blokir |
| `src/app/api/bot/kendali/route.ts` | Jeda, mode, kuota, jam aktif |
| `src/app/api/cron/bot-langkah/route.ts` | Mesin tugas bertahap |
| `src/features/ruang-bot/ruang-bot-screen.tsx` | Cangkang tab + pemilih tampilan |
| `src/features/ruang-bot/ruang-isometrik.tsx` | Komponen kanvas (porting mesin render mockup) |
| `src/features/ruang-bot/sprite-bot.ts` | `drawChar` dan data rupa bot |
| `src/features/ruang-bot/{detail-bot,antrean-acc,sumber-kuota}.tsx` | Tiga tampilan lain |
| `tests/uji-bot-*.mts` | Uji mandiri (lihat §9) |

### Diubah

| Berkas | Perubahan |
|---|---|
| `src/components/bottom-nav.tsx` | Tambah `"ruangbot"` ke `KunciTab` dan `KONFIG_TAB` (ikon lucide, label) |
| `src/components/warna-dock.ts` | Warna ikon Dock (wajib, kalau tidak `tsc` gagal) |
| `src/app/page.tsx` | `dynamic()` ssr:false untuk layar, `URUTAN_TAB`, mount di `layarTab` |
| `src/lib/peran.ts` | Entri `MODUL_AKUN` (kunci = `KunciTab`, otomatis jadi tab) |
| `src/lib/sakelar-modul.ts` | Tambah ke `DAFTAR_MODUL` (bawaan MATI) |
| `src/lib/audit-jenis.ts` | Jenis `bot_*`, kelompok baru `bot`, `LABEL_LAYAR_AUDIT.ruangbot` |
| `src/features/audit/audit-screen.tsx` | Label kelompok `bot` |
| `src/lib/autoedit.ts` | Helper POST JSON server-internal; identitas = id `app_user` bot (bukan id khusus) |
| `src/lib/struktur.ts`, `src/lib/sebagai.ts` | `DIVISI_BOT`; `targetKendali` boleh mengendalikan akun Divisi BOT (master/Pimred) |
| ±25 titik agregat (lihat §1a butir 1) | Pengecualian `Divisi BOT` dari peringkat, KPI, koin, absensi, kepatuhan, roster, penerima pengumuman |
| `src/lib/bot-akun.ts` (baru) | Buat akun bot (email internal, hash acak, WA/tutorial terisi), `adalahBot(user)`, filter terpusat |
| `src/app/api/tvr/unggah/route.ts` | Memanggil `posting-anggota.ts` (perilaku tidak berubah) |
| `src/services/index.ts` | Tipe + fungsi `getRuangBot`, `kirimKendaliBot`, dst. di akhir berkas |
| `vps/aplikasi/jadwal/jalankan.sh` | Baris crontab `bot-langkah` |
| `vps/mesin/docker-compose.yml` | Kuota id bot (env **api dan worker** harus identik) |
| `src/app/page.tsx` (`handleTarget`) | Cabang `target: "ruangbot"` untuk notifikasi |
| `docs/SERAH-TERIMA-CODEX.md`, `AGENTS.md` | Catatan modul baru |

## 3. Model data (`sql/67_bot_redaksi.sql`)

Idempoten, RLS aktif tanpa policy (hanya service key server), komentar
Indonesia, mengikuti `sql/60_audit_aktivitas.sql`.

- **`bot_redaksi`**: `id`, `user_id` (id `app_user` akun bot, unik; sekaligus id mesin
  dan kunci profil sosmed lewat `sosmed_profile`), `nama`, `persona`, `rupa` (jsonb: warna,
  rambut, aksesori), `platform`, `mode` (`acc` | `otomatis`), `kuota_harian`, `jam_mulai`,
  `jam_selesai`, `aktif`, `jeda`, `gagal_beruntun`, `dibuat_pada`.
- **`bot_sumber`**: `id`, `bot_id`, `platform`, `handle`, `kategori`, `aktif`,
  `terakhir_ambil`, `kandidat_24j`.
- **`bot_tugas`**: `id`, `bot_id`, `tahap` (`cari | pilih | unduh | edit | menunggu_acc | posting | selesai | gagal`),
  `kunci_sumber` (hash URL, **unik per sumber lintas bot**), `url_sumber`, `judul`, `kategori`,
  `id_job_mesin`, `id_stok_mesin`, `video_path` / `r2_key`, `caption`, `jadwal`,
  `hasil_posting` (jsonb), `galat`, `dikunci_sampai`, `dibuat_pada`, `diubah_pada`, waktu per tahap.
- **`bot_log`**: `id`, `bot_id`, `tugas_id`, `tahap`, `teks`, `dibuat_pada`. Sumber umpan Ruang.
- **`bot_blokir`**: `id`, `kata`.
- Pengaturan global di `pengaturan_sistem`: `bot_jeda_global` (`'1'` = semua bot berhenti).

Indeks: `bot_tugas (bot_id, tahap)`, `bot_tugas (kunci_sumber) unique`,
`bot_log (bot_id, dibuat_pada desc)`.

Kode wajib tahan tabel belum ada (`tabelBelumAda` di `api-helper.ts`) agar
deploy aman sebelum migrasi dijalankan.

## 4. Mesin tugas (cron `bot-langkah`)

Rute mengikuti `api/cron/jadwal-tayang/route.ts`: `dynamic = "force-dynamic"`,
`maxDuration = 120`, otorisasi `Bearer CRON_SECRET`, `tundaKarenaMacet` dan
`jalankanLatar` dari `penjaga-supabase.ts`. Dijadwalkan tiap 2 menit di
`jalankan.sh` (hindari menit kelipatan 5 yang sudah ramai).

Tiap tick, per bot yang `aktif`, tidak `jeda`, `bot_jeda_global` mati, dan
sekarang dalam jam aktif:

1. Ambil satu tugas dengan **klaim atomik** (`dikunci_sampai` diperbarui hanya bila kosong/kedaluwarsa), supaya dua tick tidak memproses tugas yang sama.
2. Jalankan **satu langkah** sesuai `tahap`, catat ke `bot_log`, siarkan `bot-ruang`.
3. Lepas klaim.

| Tahap | Satu langkah | Catatan |
|---|---|---|
| `cari` | Ambil kandidat dari semua sumber aktif bot, simpan tugas baru bila kuota hari ini belum habis | TikHub berkuota: hormati batas, hentikan bila 429 |
| `pilih` | Skor kandidat; juri DeepSeek hanya untuk skor abu-abu | Catat pemakaian lewat `catatPemakaianAi` |
| `unduh` | Minta mesin mengunduh URL sumber (yt-dlp, allowlist domain) | Mesin hanya mengunduh satu URL; gagal 429 → coba tick berikutnya |
| `edit` | Buat hook lalu job render dengan template bot; tiap tick polling stok/jobs | Mesin tanpa callback, jadi polling. Maksimum 1 job aktif per bot |
| `menunggu_acc` | Hanya bila mode `acc`: berhenti sampai keputusan | Tidak ada langkah otomatis |
| `posting` | Salin hasil dari stok mesin ke penyimpanan unggah, panggil `posting-anggota.ts` | Kunci anti-dobel `ambilKunciUnggah`; setelah timeout **jangan** diulang otomatis |
| `selesai` / `gagal` | Catat hasil, naikkan kuota, kabari | `gagal_beruntun` ≥ 3 → bot berhenti sendiri + notifikasi |

Aturan keselamatan di tingkat mesin, bukan UI:

- Tugas tanpa `kunci_sumber` unik tidak boleh dibuat (pagar dobel sumber).
- Sumber di luar `bot_sumber` aktif atau yang cocok `bot_blokir` ditolak.
- Caption **selalu** memuat kredit sumber; tanpa itu langkah `posting` gagal tertutup.
- Kuota harian dihitung dari `bot_tugas.selesai` hari ini (WIB), bukan dari hitungan memori.
- Bot tidak pernah melompati `menunggu_acc` bila mode `acc`.

## 5. Mesin Auto Edit

Sekarang `mintaJsonMesin` hanya GET dan tidak ada helper POST JSON server ke
mesin. Yang perlu ditambah di `src/lib/autoedit.ts`:

1. Helper `kirimJsonMesin(metode, jalur, isi, idPengguna)` yang mengirim
   `x-autoedit-pengguna: <id app_user bot>` lewat socket Unix. Hanya bisa dipanggil dari
   kode server (bukan dari rute `/api/autoedit` yang memakai sesi pengguna), supaya
   pengguna biasa tidak bisa menyamar sebagai bot.
2. Pemakaian rute mesin yang sudah ada: `/api/tvr/hook`, `/api/tvr/jobs`, `/api/tvr/stok`.

Karena bot adalah akun anggota biasa, **kuota mesin memakai bawaan anggota**
(2 GB, 20 job aktif, stok 48 jam). Tidak ada perubahan `docker-compose.yml` mesin
dan tidak perlu redeploy mesin. Bila kelak bot butuh kuota lain, barulah
env `KUOTA_KHUSUS_MB` dan kawan-kawannya diisi (api dan worker harus identik).

Template tiap bot (kanvas, overlay, kotak teks, badge kategori) dibuat
**sekali lewat UI TVR Saya**, dengan mengendalikan akun bot lewat beralih akun.
Gerbang Edit Otomatis dibuka paksa oleh master (§1a butir 2).

## 6. Posting

- Ekstrak logika posting dari `api/tvr/unggah/route.ts` (714 baris, butuh sesi
  manusia) ke `src/lib/posting-anggota.ts`. Route lama memanggil fungsi yang
  sama; perilakunya harus **identik** (uji regresi sebelum dan sesudah).
- Fungsi bersama membawa: batas caption per platform, validasi jadwal
  (5 menit–7 hari), pagar dobel, `unggahVideoUp`, penulisan `tvrku_post`, KPI.
- Profil sosmed bot: baris `sosmed_profile` berjenis `bot`. Login sosmed
  dilakukan **manusia sekali** lewat tautan hubungkan upload-post; token yang
  kedaluwarsa (`reauth_required`) membuat bot berhenti dan memunculkan
  peringatan di Ruang.
- Kuota upload-post dipakai bersama anggota: bot berhenti bila
  `kuotaMenipis` (`metrik-video-up.ts`).

## 7. Antarmuka

### Pendaftaran tab
`bottom-nav.tsx` (`KunciTab` + `KONFIG_TAB`) → `warna-dock.ts` →
`page.tsx` (import dinamis `ssr:false` dengan `MuatLayar`, `URUTAN_TAB`, `layarTab`)
→ `peran.ts` `MODUL_AKUN`. Entri `MODUL_AKUN` tanpa `bukanTab` otomatis menjadi
tab bagi akun yang dibuka master.

### Komponen kanvas (`ruang-isometrik.tsx`)
Porting dari mockup, dengan aturan repo (SERAH-TERIMA §4):

- Kanvas 2D di `useRef`, loop `requestAnimationFrame` dihentikan saat tab tidak
  aktif (`useTabAktif`) atau layar tersembunyi.
- Ukuran lewat `useLebarWadah`/`useKolomWadah`; **jangan** `@container` pada
  pembungkus layar, **jangan** `transform`/`backdrop-filter` di leluhur elemen `fixed`.
- Hindari `setState` di dalam effect (aturan lint `react-hooks/set-state-in-effect`):
  posisi bot hidup di `ref`, hanya gelembung/teks yang masuk state.
- CSP aman untuk kanvas 2D; sprite digambar lewat kode, tanpa berkas gambar.
- Warna ruangan bersifat tetap (dunia pixel-art). Bingkai, kartu, tab, dan tabel
  memakai token tema (`teks-utama`, `teks-sekunder`, `text-pri`, `bg-pri/10`),
  komponen `GlassCard`, `ScreenHeader`, `SeksiLipat`, dan `toast`.
- Wadah layar `kolom-aplikasi px-4 pb-32` dengan `kolom-lebar` untuk layar lebar.
- Tampilan ponsel: label meja disembunyikan, ruangan tetap utuh (seperti mockup).

### Data ke layar
- `GET /api/bot/status` mengembalikan bot, tugas aktif, 40 log terakhir, kuota,
  hasil hari ini. Klien menurunkan posisi bot dari `tahap` tugasnya: pindah meja
  = animasi jalan; bubble = teks log terbaru.
- Realtime: topik `bot-ruang`, payload hanya `{jenis, t}`; klien memuat ulang
  lewat GET (jeda 900 ms). Polling cadangan 20 dtk saat terputus, 90 dtk saat
  tersambung, mengikuti `tim-langsung.tsx`. Topik cukup string yang sama di
  `bot-realtime.ts` dan klien; CSP sudah mengizinkan `wss`.
- `useSegarOtomatis` / `useVersiSegar` untuk Detail Bot, Antrean ACC, dan Sumber.

## 8. Audit, notifikasi, kendali

- `catatAudit` jenis baru: `bot_jeda`, `bot_mode`, `bot_acc`, `bot_sumber`,
  `bot_kuota`, `bot_posting`. Kelompok baru `bot` perlu `LABEL_KELOMPOK_AUDIT`
  dan label di `audit-screen.tsx`. Kolom jenis bertipe text, tanpa migrasi.
- `kirimKabar` ke Pimred/tim TV saat: video menunggu ACC, bot gagal 3×
  berturut, akun sosmed perlu hubungkan ulang, kuota TikHub/upload-post menipis.
  `target` baru `"ruangbot"` butuh cabang di `handleTarget` (`page.tsx`).
- Kendali: saklar jeda global (`pengaturan_sistem.bot_jeda_global`), jeda per bot,
  perubahan mode/kuota/jam aktif, semuanya lewat `/api/bot/kendali` berpagar
  `bolehRuangBot`, dengan rate-limit (`pastikanTidakMelebihiBatas`) dan audit.
- Sakelar modul global memungkinkan master mematikan seluruh tab tanpa deploy.

## 9. Pengujian

Repo tidak punya runner (tanpa jest/vitest). Uji berupa skrip mandiri
`npx tsx tests/<nama>.mts` dengan `cek(nama, ok)` dan exit 1 bila gagal.

| Skrip | Menguji |
|---|---|
| `tests/uji-bot-mesin.mts` | `langkahBerikut`: urutan tahap, gerbang ACC tidak bisa dilompati, kuota harian, gagal beruntun, jeda global, jam aktif |
| `tests/uji-bot-akses.mts` | `bolehRuangBot`: master, Pimred, tim TV lolos; anggota biasa ditolak (pola `uji-autoedit-gerbang.mts`) |
| `tests/uji-bot-sumber.mts` | Dedupe `kunci_sumber`, allowlist sumber, daftar blokir, caption wajib kredit |
| `tests/uji-posting-anggota.mts` | Regresi hasil ekstraksi: jadwal, batas caption, pagar dobel identik dengan route lama |
| `tests/mesin-video/uji-api.mts` | Tambah kasus kuota id bot (`pri-900000002`) |

Gerbang mutu (AGENTS.md): `npx tsc --noEmit`, `npx eslint <berkas> --max-warnings 0`,
`npm run build`, dan `npm run uji:mesin` bila menyentuh `src/mesin-video/`.
Uji nyata di produksi memakai teknik di memori "Uji API produksi TVR" (sesi
perangkat via service key), dengan akun uji dan pembersihan sesudahnya.

## 10. Tahapan dan titik deploy

Tiap tahap dikirim terpisah. **Push ke `main` memicu deploy dan me-restart
aplikasi**; migrasi SQL dijalankan manual **sebelum** push kode.

| # | Tahap | Isi | Deploy / tindakan manusia |
|---|---|---|---|
| 0 | Persiapan | Nama dan persona bot, akun sosmed baru dan hubungkan, daftar sumber, template per bot, kuota | Hanya manusia, tanpa kode |
| 1 | Kerangka + Ruang | `sql/67`, `DIVISI_BOT` + akun bot (`bot-akun.ts`), **pengecualian bot dari ±25 titik agregat + uji**, tab, akses, sakelar modul MATI, kanvas, status API, realtime | Terapkan SQL → push. Tab tidak terlihat siapa pun sampai master membukanya. Pengecualian agregat dikirim **sebelum** akun bot pertama dibuat |
| 2 | Cari + pilih (dry-run) | `bot-sumber`, `bot-pilih`, cron `bot-langkah` hanya tahap `cari`/`pilih`, Sumber & Kuota nyata | Rebuild container `jadwal` otomatis saat deploy. Tidak unduh, tidak posting |
| 3 | Unduh + edit | Helper POST mesin, buka paksa Edit Otomatis per akun bot, template per bot (lewat beralih akun) | Tanpa redeploy mesin (kuota bawaan anggota). Push aplikasi saja |
| 4 | Posting mode `acc` | Ekstraksi `posting-anggota.ts` + uji regresi, Antrean ACC nyata, notifikasi | Uji akun nyata kecil dulu |
| 5 | Lepas otomatis | Mode `otomatis` per bot setelah masa percobaan | Pantau 1–2 minggu |

Perkiraan kasar: tahap 1 ±3–4 hari, 2 ±2–3, 3 ±2–3 (termasuk mesin), 4 ±3–4
(ekstraksi paling berisiko), 5 hanya konfigurasi dan pemantauan.

### Rencana mundur
Matikan sakelar modul dan `bot_jeda_global` (tanpa deploy), lalu bila perlu
`git revert` commit tahap terkait. Tabel `bot_*` boleh dibiarkan; tidak ada kode
lain yang membacanya.

## 11. Risiko khusus integrasi

0. **Pengecualian Divisi BOT dari agregat** (§1a butir 1) adalah risiko terbesar baru: satu titik terlewat membuat bot muncul di peringkat, KPI, koin, atau absensi anggota. Wajib daftar titik tertulis, uji, dan akun bot pertama dibuat setelahnya.
1. **Ekstraksi `posting-anggota.ts`** menyentuh jalur unggah anggota yang sudah
   dipakai produksi. Wajib ada uji regresi dan sebaiknya dikerjakan sebagai commit
   tersendiri dengan perilaku identik.
2. **Cron dan batas waktu**: bila satu langkah melampaui ±280 dtk, klaim
   `dikunci_sampai` harus kedaluwarsa sendiri dan tugas ditandai butuh pemeriksaan,
   bukan diulang (menghindari posting dobel).
3. **Kuota bersama**: render, TikHub, dan upload-post dibagi dengan anggota; bot
   berprioritas rendah dan mengalah lebih dulu.
4. **Dua kunci DeepSeek di dua env** (aplikasi dan mesin): pastikan keduanya terisi.
5. **Topik realtime publik**: payload tidak boleh memuat data; detail hanya lewat API berpagar.
6. **Ketergantungan manusia**: login sosmed bot, template per bot, dan hubungkan
   ulang token tidak bisa diotomasi.
7. **Hak cipta / ketentuan platform** atas konten sumber tetap tanggung jawab
   pemilik (lihat `BOT-REDAKSI.md`).

## 12. Dampak pilihan tempat mesin tugas

| Aspek | Cron di aplikasi (rekomendasi) | Worker Node terpisah di VPS mesin |
|---|---|---|
| Kecepatan siklus | Tiap tahap ≥ 1 tick (2 menit). Satu video (cari → pilih → unduh → edit → posting) ±12–20 menit minimum. Wajar untuk 2–3 video per hari per bot | Detik-an; bisa menunggu render sampai selesai tanpa polling |
| Batas waktu | ±280 dtk per tick, jadi tiap langkah harus kecil dan idempoten | Tanpa batas, proses panjang bebas |
| Deploy | Ikut deploy aplikasi (GitHub Actions). Tiap deploy me-restart aplikasi dan bisa memotong langkah yang sedang jalan; klaim kedaluwarsa dan langkah diulang aman bila idempoten | Deploy manual lewat `pasang.sh` di VPS mesin, terpisah dari aplikasi. Dua jalur rilis, risiko versi tidak sejalan |
| Kode posting | Satu basis kode: `posting-anggota.ts` dipakai route dan bot | `mesin-video` adalah proyek TypeScript terpisah dengan Dockerfile sendiri. Logika posting harus diduplikasi atau dibagi lewat paket, lebih rawan beda perilaku |
| Rahasia | Tidak ada rahasia baru | Perlu kunci Supabase, upload-post, TikHub, dan DeepSeek di VPS mesin: permukaan rahasia bertambah |
| Jalur jaringan | Aplikasi → mesin lewat socket yang sudah ada | Mesin harus memanggil Supabase dan layanan luar sendiri, dan menjangkau aplikasi lewat WireGuard (yang sekarang hanya aplikasi → mesin) |
| Beban | Ringan (panggilan HTTP). Render berat tetap di mesin. `tundaKarenaMacet` membuat bot melambat otomatis saat DB sibuk | CPU mesin sudah jenuh di ±3–4 render; worker ringan, tetapi kegagalan satu proses menghentikan semua bot |
| Pemantauan | Log kontainer `jadwal` dan umpan audit yang sudah ada | Layanan baru yang harus dipantau dan dijaga hidup |
| Animasi Ruang | Perubahan keadaan datang berkelompok per tick; klien menutupi jeda dengan animasi jalan | Perubahan lebih halus dan dekat waktu nyata |
| Biaya pengerjaan | Paling kecil | ±3–5 hari lebih banyak, ditambah beban operasional tetap |

Kesimpulan: untuk 2–3 bot dengan beberapa video per hari, cron aplikasi cukup
dan jauh lebih murah dirawat. Worker terpisah baru layak bila bot bertambah
banyak atau dibutuhkan reaksi di bawah satu menit. Memilih cron tidak menutup
pintu: mesin tugas ditulis sebagai fungsi murni (`bot-mesin.ts`), sehingga bisa
dipindah ke worker kelak tanpa menulis ulang logikanya.

## 13. Keputusan yang masih terbuka

1. ~~Akses~~ **Diputuskan:** bot = akun di Divisi BOT, hanya modul TVR Saya.
   Masih terbuka: **siapa manusia yang boleh membuka tab Ruang Bot** (rekomendasi:
   master, Pimred, pemegang wewenang TV) dan siapa yang boleh mengendalikan akun bot.
2. Tab atau sub-layar? (rekomendasi: tab lewat `modul_izin`)
3. Mesin tugas di cron aplikasi (rekomendasi) atau worker Node terpisah di VPS mesin?
   Dampak kedua pilihan dibahas di §12.
4. Mode awal tiap bot `acc` (rekomendasi) atau langsung `otomatis`?
5. Jam aktif dan kuota harian awal per bot?
6. Daftar sumber awal dan platform tiap bot?
7. Perlukah umumkan modul di catatan rilis in-app (`changelog.ts`)? Untuk modul
   khusus master/tim tidak wajib.
