# Panduan aktivasi Bot Redaksi (satu per satu)

Untuk **pemilik sistem** (13 Okt 2026). Kode Pekerjaan 1–2 sudah ada di produksi tetapi
**belum aktif**. Panduan ini menyalakannya bertahap dan aman. Tiap langkah punya: tujuan,
perintah, hasil yang benar, bila gagal, dan cara mundur.

**Aturan keras**
- **Jangan menempel rahasia atau kata sandi ke chat, repo, atau dokumen.** Ketik langsung di terminal.
- **Jangan lanjut ke langkah berikutnya sebelum "Hasil yang benar" tercapai.**
- Selama ujicoba hanya **`bot1`** yang bekerja. `bot2` dan `bot3` dijeda.
- Rem darurat kapan pun: tombol **Jeda darurat semua bot** di Ruang Bot, atau
  `docker compose --profile bot stop autoedit-bot` di VPS mesin.

Dua tempat kerja:
- **Mac Anda** (folder repo): migrasi SQL, skrip akun, dan penerbitan.
- **VPS aplikasi** `pri-vps` (`/opt/pri-superapp/aplikasi`) dan **VPS mesin** `72.61.143.158`
  (`/opt/pri-mesin`). Masuk ke VPS mesin dengan cara yang biasa Anda pakai (SSH root atau
  konsol Hostinger). Kunci `/root/.ssh/pri-mesin` hanya untuk aplikasi → mesin, bukan untuk Anda.

---

## Langkah 0 — Pastikan kode terbaru sudah di produksi

**Tujuan.** Semua langkah di bawah mengandalkan kode yang sudah ter-deploy.

```bash
cd ~/PROYEK/pri-superapp            # folder repo di Mac
git fetch origin && git log --oneline -3 origin/main
gh run list --limit 2 --repo faris315mfaf-ai/pri-superapp
```

**Hasil yang benar.** Commit teratas `678220d` (atau lebih baru) dan kedua workflow berstatus `completed success`.

**Bila gagal.** Jika "Deploy VPS" gagal karena jaringan sesaat: `gh run rerun <id>`.

---

## Langkah 1 — Ujian lapangan pemanen (spike) di VPS mesin

**Tujuan.** Mengetahui apakah yt-dlp dari VPS mesin benar-benar bisa mendaftar video akun
sumber, dan bentuk URL profil mana yang berhasil. Bentuk URL di kode masih tebakan. Tidak
mengubah apa pun, aman.

**1a. Salin skrip ke VPS mesin** (dari Mac, folder repo):

```bash
scp scripts/spike-pemanen.sh root@72.61.143.158:/opt/pri-mesin/
```

**1b. Jalankan di VPS mesin** (ganti dengan akun yang benar-benar akan dipanen):

```bash
cd /opt/pri-mesin
chmod +x spike-pemanen.sh
SPIKE_DOCKER=pri-autoedit-ts-api ./spike-pemanen.sh \
  "https://www.youtube.com/@NamaKanalNTV/videos" \
  "https://www.tiktok.com/@akunntv" \
  "https://www.instagram.com/akunntv/"
```

`SPIKE_DOCKER` memakai yt-dlp yang sudah ada di kontainer API. Skrip memberi jeda 4 detik
antar-URL; jangan menjalankannya berulang cepat (akun bisa dibatasi platform).

**Hasil yang benar.** Tabel dengan kolom HASIL per URL: `BERHASIL`, `KOSONG`, `GAGAL`, atau
`WAKTU-HABIS`, plus penanda `[DIBATASI]` (429) atau `[BUTUH-LOGIN]`.

| Hasil | Artinya | Tindakan |
|---|---|---|
| YouTube `BERHASIL` | Pemanen YouTube siap | Lanjut |
| TikTok/IG `BERHASIL` | Bisa tanpa cookies | Lanjut |
| `[BUTUH-LOGIN]` | Perlu cookies akun tumbal | Lihat di bawah |
| `[DIBATASI]` | IP dibatasi platform | Tunggu, atau pakai cadangan TikHub |
| `GAGAL` tanpa penanda | Bentuk URL salah atau platform berubah | **Kirim tabelnya ke saya** |

**Cookies akun tumbal (hanya bila perlu).** Buat/siapkan akun sosmed **terpisah dari akun
utama**, ekspor cookies format Netscape, taruh di VPS mesin dengan izin 0600, lalu ulangi 1b
dengan `BOT_COOKIES_FILE=<jalur di dalam kontainer>`. Akun tumbal bisa diblokir platform.

**Gerbang.** **Kirim hasil tabel spike kepada saya sebelum lanjut.** Jika URL perlu diubah,
saya ubah di `src/bot-runner/pemanen.ts` (tabel `PROFIL`) dan itu harus ter-deploy dulu
sebelum Langkah 7. Jika semuanya `GAGAL`, berhenti di sini: sumber gratis tidak bisa
dipakai dan perlu keputusan (TikHub berbayar).

---

## Langkah 2 — Jalankan migrasi database `sql/67`

**Tujuan.** Membuat 8 tabel tempat bot menyimpan keadaannya. Hanya **menambah** tabel baru;
tidak mengubah tabel yang ada.

**Sebelum menjalankan:** pastikan Anda memakai versi terbaru berkas (`git pull`), karena
berkas ini sempat bertambah kolom (`bentrok`, `hook`, `percobaan`).

Dari Mac, folder repo:

```bash
ssh pri-vps 'docker exec -i supabase-db psql -U postgres -w --single-transaction -v ON_ERROR_STOP=1' < sql/67_bot_redaksi.sql
ssh pri-vps "docker exec -i supabase-db psql -U postgres -w -c \"NOTIFY pgrst, 'reload schema';\""
```

Perintah pertama berjalan dalam **satu transaksi**: bila ada galat, semuanya dibatalkan dan
tidak ada yang tersisa setengah jadi. Aman diulang.

**Pemeriksaan:**

```bash
ssh pri-vps "docker exec -i supabase-db psql -U postgres -w -c '\dt public.bot_*'"
```

**Hasil yang benar.** Daftar 8 tabel: `bot_blokir`, `bot_kandidat`, `bot_log`, `bot_redaksi`,
`bot_runner`, `bot_sumber`, `bot_tugas`, `bot_video_wajib`. Perintah pertama tidak mencetak galat.

**Bila gagal.** Salin pesan galatnya kepada saya. Jangan jalankan sebagian secara manual.

**Mundur.** Hanya bila perlu dan sebelum ada data (langkah 4 belum jalan):
`DROP TABLE IF EXISTS public.bot_log, public.bot_video_wajib, public.bot_tugas, public.bot_kandidat, public.bot_blokir, public.bot_sumber, public.bot_runner, public.bot_redaksi CASCADE;`
Ruang Bot kembali ke data contoh.

---

## Langkah 3 — Buat dan pasang `BOT_RUNNER_SECRET`

**Tujuan.** Kunci bersama untuk tanda tangan permintaan runner → aplikasi. Tanpa kunci yang
sama di kedua sisi, aplikasi menolak runner (gagal tertutup).

**3a. Buat kunci** (di Mac; **simpan hanya di password manager**, jangan di chat):

```bash
openssl rand -hex 32
```

**3b. Pasang di aplikasi** (VPS aplikasi):

```bash
ssh pri-vps
cd /opt/pri-superapp/aplikasi
# tambahkan SATU baris di env.txt (ketik kuncinya langsung; jangan lewat history yang dibagikan):
nano env.txt          # tambah: BOT_RUNNER_SECRET=<kunci dari 3a>
docker compose up -d --force-recreate aplikasi
```

`--force-recreate` perlu agar kontainer membaca env baru. Aplikasi mulai ulang sebentar
(beberapa detik); lakukan saat sepi.

**Hasil yang benar.** Dari Mac:

```bash
curl -s -X POST -o /dev/null -w "%{http_code}\n" -H "Content-Type: application/json" -d '{}' https://pri-superapp.com/api/bot/internal
```

Hasilnya harus berubah dari **503** menjadi **401** (kunci sudah terkonfigurasi; permintaan
tanpa tanda tangan ditolak). Beranda tetap 200: `curl -s -o /dev/null -w "%{http_code}\n" https://pri-superapp.com/`.

**Bila tetap 503.** Kunci belum terbaca: pastikan barisnya tepat `BOT_RUNNER_SECRET=...`
(tanpa spasi/kutip), minimal 16 karakter, lalu ulangi `--force-recreate`.

**Mundur.** Hapus barisnya dari `env.txt` dan `--force-recreate` lagi (kembali 503).

---

## Langkah 4 — Buat akun `bot1`–`bot3` (skrip)

**Tujuan.** Membuat tiga akun anggota di Divisi BOT dan baris perilakunya. Ini yang membuat
bot "ada" dan memunculkan data nyata di Ruang Bot.

Dari Mac, folder repo. Skrip membaca `.env.local` (kunci Supabase produksi). Kata sandi dibaca
dari env dan **tidak tampil di layar maupun riwayat**:

```bash
read -rs BOT_SANDI_AWAL; export BOT_SANDI_AWAL     # ketik kata sandi bawaan lalu Enter (tidak tampil)
node scripts/buat-akun-bot.mjs                      # LATIHAN: tidak menulis apa pun
```

Periksa keluarannya: harus menyebut tiga akun BARU (`bot1`, `bot2`, `bot3`) dan
`bot_redaksi: akan dibuat`. Bila ada kalimat "Username ... sudah dipakai akun BUKAN bot",
**berhenti** dan hubungi saya.

Bila latihan benar:

```bash
node scripts/buat-akun-bot.mjs --jalankan
unset BOT_SANDI_AWAL
```

**Hasil yang benar.** Tiga baris "dibuat, id N" dan pesan "Akun bot TIDAK bisa login".
Skrip aman diulang (tidak membuat dobel).

**Wajib: uji bahwa akun bot TIDAK bisa login** (ini pagar keselamatan terpenting). Di
aplikasi, keluar dulu, lalu coba masuk dengan username `bot1` dan kata sandi tadi.
**Hasil yang benar:** pesan "Nomor/username atau kata sandi salah". Bila bot1 berhasil masuk,
**hentikan semuanya dan hubungi saya segera**.

**Pemeriksaan Ruang Bot.** Masuk sebagai master → tab **Ruang Bot**: chip kanan atas berubah
dari "Data contoh" menjadi **"Data nyata"**, dan terlihat tiga bot (Raka, Sinta, Dimas) diam di
sofa. Chip runner masih **"Runner mati"** (wajar).

**Mundur.** Nonaktifkan lewat jeda; atau hapus akun bila perlu:
`DELETE FROM bot_redaksi WHERE user_id IN (SELECT id FROM app_user WHERE divisi='Divisi BOT');`
lalu hapus baris `app_user` berdivisi itu (konfirmasi dulu ke saya).

---

## Langkah 5 — Jeda `bot2` dan `bot3`, siapkan `bot1`

**Tujuan.** Ujicoba hanya dengan satu bot, supaya mudah diamati dan hemat sumber daya mesin.

Di Ruang Bot (master):
1. Tab **Detail Bot** → pilih **Sinta** → **Jeda bot ini**. Ulangi untuk **Dimas**.
2. Tab **Sumber & Kuota** → pastikan **kuota 1** per hari.
3. Masih di **Sumber & Kuota** → **Tambah sumber**: akun NTV hasil spike yang berhasil, platform
   yang sesuai, kategori NEWS, **bot: Raka (bot1)**.

**Hasil yang benar.** Sinta dan Dimas berstatus Dijeda; satu sumber aktif tampil di daftar milik
Raka. Bot tidak mulai bekerja (runner belum menyala).

---

## Langkah 6 — Buat template video `bot1`

**Tujuan.** Mesin Auto Edit memakai **template per akun**. Tanpa template, job render ditolak
("Buat dan tetapkan template dulu"), dan bot berhenti di penghalang itu.

1. Masuk sebagai master → **TVR Saya** → bagian **Kendali Akun BOT** → ketuk bulatan **Raka**.
   Aplikasi berganti menjadi akun `bot1` (hanya modul TVR Saya); pita di atas layar menandakannya.
2. Buka **Edit Otomatis** di TVR Saya → buat dan **tetapkan** template (kanvas, overlay, kotak
   teks hook, badge kategori) seperti yang dilakukan anggota. Unggah aset sesuai desain
   TV Rakyat.
3. Selesai → tekan **Kembali ke akun saya** pada pita di atas layar.

**Hasil yang benar.** Template berstatus siap/ditetapkan di Edit Otomatis akun `bot1`.
**Bukti terbaik:** sebelum keluar, jalankan satu **Edit Otomatis manual** dari akun bot1 dan
pastikan videonya jadi di Stok.

**Bila gagal.** Edit Otomatis terbuka untuk semua akun, jadi bila menu tidak muncul, pastikan
Anda benar-benar berada di akun bot1 (nama di pita atas). Bila tombol bulatan bot kosong,
ulangi Langkah 4.

---

## Langkah 7 — Nyalakan runner di VPS mesin

**Tujuan.** Menghidupkan "Rumah Bot". Inilah yang membuat bot benar-benar bekerja.
**Ini satu-satunya langkah yang menghasilkan aktivitas nyata.**

**7a. Pastikan image mesin memuat runner** (VPS mesin):

```bash
docker run --rm --entrypoint ls pri-autoedit-ts:terbaru /app
```

Harus menampilkan `runner.mjs`. Bila tidak ada, deploy aplikasi belum membangun ulang image
mesin: hubungi saya sebelum lanjut.

**7b. Buat berkas rahasia** (VPS mesin; ketik langsung, jangan ditempel ke chat):

```bash
cd /opt/pri-mesin
install -m 0600 /dev/null bot.env
nano bot.env
#   APP_URL=https://pri-superapp.com
#   BOT_RUNNER_SECRET=<kunci yang SAMA PERSIS dengan Langkah 3>
```

Bila Langkah 1 menyatakan butuh cookies, ikuti bagian cookies di `docs/BOT-REDAKSI-RUNNER.md` §5.

**7c. Nyalakan hanya runner:**

```bash
docker compose --profile bot up -d autoedit-bot
docker compose --profile bot ps autoedit-bot
docker logs --tail 50 -f pri-autoedit-bot       # Ctrl+C untuk keluar dari log
```

**Hasil yang benar.** Di log ada `mulai (versi ...)` dan **tidak** ada "denyut gagal". Dalam
±15 detik, di Ruang Bot chip menjadi **"Runner online"**. Layanan mesin lain tidak berubah
(`docker ps` menampilkan API dan worker tetap sehat).

| Pesan di log | Penyebab | Perbaikan |
|---|---|---|
| `denyut gagal ... 401` | Kunci beda, atau jam VPS melenceng >5 menit | Samakan kunci (Langkah 3); periksa jam `date` |
| `denyut gagal ... 503` | Aplikasi belum membaca kunci | Ulangi Langkah 3b |
| `bot berhenti bekerja: jeda global` | Jeda darurat menyala | Cabut jeda di Ruang Bot |

**Mundur.** `docker compose --profile bot stop autoedit-bot` (aman; runner tanpa keadaan).

---

## Langkah 8 — Amati satu siklus penuh `bot1`

**Tujuan.** Membuktikan alur: cari → pilih → buat video → siap ditinjau. **Belum ada posting.**

1. Pantau di **Ruang Bot** (umpan aktivitas) dan, bila perlu, di VPS mesin: `docker logs -f pri-autoedit-bot`.
2. Urutan yang diharapkan (jam aktif bawaan 08:00–20:00 WIB; di luar jam bot tidak memulai):
   - `Mencari`: runner memanen sumber → kandidat muncul (lihat bagian **Tugas Bot** di TVR Saya akun bot1).
   - `Membuat video`: mesin mengunduh dan merender (beberapa menit).
   - Tugas berstatus **Siap ditinjau**; video muncul di **Stok Video** akun bot1.
3. Tonton videonya. Periksa: template benar, hook masuk akal, sumber sesuai.

**Hasil yang benar.** Satu video di Stok akun bot1, tugas `siap_ditinjau`, **tidak ada** posting ke sosmed.

**Gerbang ke Pekerjaan 3.** Minimal **3 siklus bersih berturut-turut** tanpa: render macet,
kuota mesin penuh, kandidat ganda, atau bot lain ikut bekerja.

| Gejala | Kemungkinan | Tindakan |
|---|---|---|
| Tidak ada kandidat | Sumber salah/dibatasi | Ruang Bot → log; ulang spike; "Cari sekarang" |
| `Penghalang: template belum dibuat` | Langkah 6 belum beres | Ulangi Langkah 6 |
| `Penghalang: kuota penuh / stok penuh` | Stok mesin akun bot penuh | Hapus video lama di Stok bot1 |
| Bot diam terus | Jeda, di luar jam, atau kuota 1/hari habis | Lihat alasan di Tugas Bot |
| Gagal beruntun 3× | Bot berhenti sendiri | Baca log, perbaiki penyebab, lalu lanjutkan bot |

---

## Rem darurat dan rollback keseluruhan

| Keperluan | Tindakan | Efek |
|---|---|---|
| Hentikan semua bot sekarang | Ruang Bot → **Jeda darurat semua bot** | Runner berhenti bekerja pada denyut berikutnya |
| Matikan runner sepenuhnya | `docker compose --profile bot stop autoedit-bot` (VPS mesin) | Tidak ada proses; aman |
| Sembunyikan tab Ruang Bot | Panel Master → sakelar modul **Ruang Bot** → mati | Tab hilang, `/api/bot/*` menolak (423) |
| Tutup jalur runner | Hapus `BOT_RUNNER_SECRET` dari `env.txt` + `--force-recreate aplikasi` | `/api/bot/internal` kembali 503 |

Rollback kode terakhir bila perlu: `git revert 678220d 750c12a` lalu push (tabel `bot_*`
boleh dibiarkan; tidak ada kode lain yang membacanya).

---

## Ringkasan (centang satu per satu)

| # | Langkah | Di mana | Selesai bila |
|---|---|---|---|
| 0 | Kode terbaru di produksi | Mac | `678220d` + workflow success |
| 1 | Spike pemanen | VPS mesin | Tabel hasil diterima saya |
| 2 | Migrasi `sql/67` | Mac → `pri-vps` | 8 tabel `bot_*` terdaftar |
| 3 | `BOT_RUNNER_SECRET` di aplikasi | `pri-vps` | `/api/bot/internal` = 401 |
| 4 | Skrip akun bot | Mac | "Data nyata" + login bot1 **ditolak** |
| 5 | Jeda bot2/bot3, sumber bot1 | Ruang Bot | Hanya Raka aktif, 1 sumber |
| 6 | Template bot1 | TVR Saya → Kendali Akun BOT | Edit manual jadi video |
| 7 | Nyalakan runner | VPS mesin | "Runner online" |
| 8 | Amati siklus | Ruang Bot | Video di Stok, tanpa posting |
