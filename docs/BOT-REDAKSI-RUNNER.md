# Bot Redaksi — Rumah Bot (runner di VPS mesin): panduan pasang manual

Status: **kode siap, BELUM dinyalakan** (13 Okt 2026). Ini panduan untuk manusia yang
memasang runner di VPS mesin (`72.61.143.158`). Tidak memuat rahasia. Rancangan:
[`BOT-REDAKSI-RENCANA-UJICOBA.md`](BOT-REDAKSI-RENCANA-UJICOBA.md) §2 dan
[`BOT-REDAKSI-PEKERJAAN-2.md`](BOT-REDAKSI-PEKERJAAN-2.md).

## 1. Apa yang dipasang

| Bagian | Letak |
|---|---|
| Kode runner (TypeScript, hanya modul bawaan Node) | `src/bot-runner/*` |
| Bundel | entri esbuild ketiga di `vps/autoedit-ts/Dockerfile` -> `runner.mjs` di image `pri-autoedit-ts:terbaru` (image yang sama dengan API & worker; nama entri `runner.ts`, bukan `utama.ts`, supaya tidak menimpa `utama.mjs` server) |
| Layanan | `autoedit-bot` (kontainer `pri-autoedit-bot`) di `vps/mesin/docker-compose.yml`, **`profiles: ["bot"]`** |
| Rahasia | `/opt/pri-mesin/bot.env` (dibuat manual, izin 0600). Contoh nama variabel: `vps/mesin/bot.env.example` |
| Ujian lapangan | `scripts/spike-pemanen.sh` |

Runner hanya memegang **satu rahasia** (`BOT_RUNNER_SECRET`). Ia memanggil aplikasi lewat
**HTTPS publik** (firewall keluar kontainer menolak alamat privat, jadi WireGuard tidak
bisa dipakai) dan memanggil mesin lewat **soket Unix** `/run/autoedit/api.sock`.
Batas kontainer: 0,5 CPU, 512 MB, 128 proses; tidak ada port terbuka.

## 2. Peringatan penting: profile WAJIB

Pipeline rilis mesin mengirim `docker-compose.yml` ke `/opt/pri-mesin` **tiap deploy
aplikasi** lalu menjalankan `docker compose up -d`. Tanpa `profiles: ["bot"]`, runner akan
ikut menyala (atau ikut gagal) pada setiap deploy. Karena itu:

- `docker compose up -d` biasa **tidak** menyentuh `autoedit-bot`.
- Menyalakan/menghentikannya selalu eksplisit memakai `--profile bot`.
- Konsekuensi: saat image `pri-autoedit-ts:terbaru` diperbarui oleh deploy, kontainer
  runner yang sedang jalan **tetap memakai image lama** sampai dibuat ulang (langkah 5).
- `bot.env` tidak ikut dikirim/ditimpa pipeline (hanya `autoedit.env` yang dikirim).

## 3. Prasyarat

1. Kode ini sudah ter-deploy sehingga image mesin di VPS mesin memuat `runner.mjs`:
   `docker run --rm --entrypoint ls pri-autoedit-ts:terbaru /app` harus menampilkan
   `runner.mjs`. (Image dibangun di VPS aplikasi lalu dikirim ke mesin.)
2. Sisi aplikasi (Pekerjaan 1 & 2B) sudah aktif: `/api/bot/internal` menjawab `denyut`,
   `ambil_kerja`, dan `lapor`, dan migrasi tabel `bot_*` sudah dijalankan.
3. **Ujian lapangan pemanen sudah dijalankan** (langkah 4) dan hasilnya diterima.

## 4. Ujian lapangan pemanen (sebelum runner dinyalakan)

Dari VPS mesin (IP yang sama dengan runner), ujilah akun yang sungguh akan dipanen:

```bash
cd /opt/pri-mesin   # atau salin scripts/spike-pemanen.sh ke sini
SPIKE_DOCKER=pri-autoedit-ts-api ./spike-pemanen.sh \
  "https://www.youtube.com/@NamaKanal/videos" \
  "https://www.tiktok.com/@namaakun" \
  "https://www.instagram.com/namaakun/"
```

`SPIKE_DOCKER` memakai yt-dlp yang sudah ada di kontainer API. Tabel yang tercetak:
URL, HASIL (`BERHASIL` / `KOSONG` / `GAGAL` / `WAKTU-HABIS`), jumlah item, detik, galat
singkat (`[DIBATASI]` untuk 429, `[BUTUH-LOGIN]` untuk tuntutan login). Skrip tidak
mengirim data ke mana pun dan tidak mencetak isi cookies.

Cara menafsirkan:
- YouTube `BERHASIL` tanpa cookies: pemanen YouTube siap.
- TikTok/Instagram `[BUTUH-LOGIN]`: siapkan **akun sosmed tumbal** (bukan akun utama),
  ekspor cookies Netscape-nya, taruh di VPS mesin dengan izin 0600, dan ulangi dengan
  `BOT_COOKIES_FILE=<jalur di dalam kontainer>`. Bila tetap gagal, platform itu belum bisa
  dipanen gratis; pakai TikHub sebagai cadangan per sumber (di sisi aplikasi).
- Bentuk URL profil per platform ada **satu tempat**: tabel `PROFIL` di
  `src/bot-runner/pemanen.ts`. Ubah di sana bila ujian menunjukkan bentuk lain yang
  lebih andal (mis. YouTube tanpa `/videos`).
- Jangan menjalankan berulang cepat: skrip memberi jeda 4 detik antar-URL; pembatasan
  laju platform nyata dan akun tumbal bisa diblokir.

## 5. Pasang dan nyalakan

Semua di VPS mesin sebagai root, direktori `/opt/pri-mesin`.

```bash
cd /opt/pri-mesin

# 1) Berkas rahasia (isi manual; JANGAN ditempel ke chat/repo)
install -m 0600 /dev/null bot.env
nano bot.env         # nama variabel: lihat bot.env.example di repo (vps/mesin/)
#   APP_URL=https://<domain aplikasi>
#   BOT_RUNNER_SECRET=<acak; sama persis dengan di aplikasi>
#   (opsional) BOT_COOKIES_FILE=/run/bot-cookies/cookies.txt

# 2) (hanya bila memakai cookies) siapkan folder, buka baris volume di compose,
#    pemilik uid 10001 (pengguna kontainer), izin 0600
mkdir -p /srv/godam/bot-cookies && chown 10001:10001 /srv/godam/bot-cookies
#   letakkan cookies.txt di sana: chown 10001:10001 + chmod 600
#   lalu hapus tanda # pada baris "- /srv/godam/bot-cookies:/run/bot-cookies"
#   di docker-compose.yml (perhatikan: pipeline rilis menimpa compose ini tiap
#   deploy, jadi edit juga salinan di repo: vps/mesin/docker-compose.yml)

# 3) Nyalakan HANYA runner
docker compose --profile bot up -d autoedit-bot

# 4) Periksa
docker compose --profile bot ps autoedit-bot
docker logs --tail 50 -f pri-autoedit-bot
```

Rahasia yang sama harus ada di sisi aplikasi: `BOT_RUNNER_SECRET` di env aplikasi
(VPS aplikasi, berkas env yang sama dengan rahasia aplikasi lainnya), lalu aplikasi
dimulai ulang agar membacanya. Tanpa itu `/api/bot/internal` menjawab 503 dan runner
mencatat "denyut gagal".

Tanda berhasil: log menampilkan `mulai (versi ...)`, lalu **tidak** ada "denyut gagal";
di Ruang Bot (master) indikator runner berubah menjadi online dalam ±15 detik.

### Perbarui runner setelah deploy

```bash
cd /opt/pri-mesin
docker compose --profile bot up -d --force-recreate autoedit-bot
```

## 6. Memeriksa log

```bash
docker logs --tail 100 pri-autoedit-bot            # 100 baris terakhir
docker logs -f --since 10m pri-autoedit-bot        # ikuti
docker inspect -f '{{.State.Health.Status}}' pri-autoedit-bot
```

Makna pesan umum:
- `denyut gagal (Nx): aplikasi 401 ... (periksa BOT_RUNNER_SECRET / jam server)` -> rahasia
  berbeda atau jam VPS melenceng >5 menit (jendela tanda tangan).
- `denyut gagal ... aplikasi 503` -> aplikasi belum mengatur `BOT_RUNNER_SECRET`.
- `bot berhenti bekerja: denyut gagal 3x berturut-turut` -> gagal tertutup bekerja.
  Runner tetap mencoba denyut dengan jeda berlipat (maks 2 menit) dan pulih sendiri.
- `bot berhenti bekerja: jeda global dari aplikasi` -> master menekan jeda di Ruang Bot.
- `panen <platform>/<handle>: dibatasi ...` -> 429/login terdeteksi; sumber dihentikan.
  Tiga kegagalan beruntun satu sumber -> dilewati 1 jam.

Healthcheck hanya berarti "proses masih berputar" (penanda `/tmp/runner-hidup` lebih baru
dari 2 menit). Keterjangkauan aplikasi terlihat di Ruang Bot, bukan di healthcheck.

## 7. Berhenti dan rollback

```bash
# Berhenti sementara (runner menyelesaikan langkah, keluar bersih, ≤30 dtk)
docker compose --profile bot stop autoedit-bot

# Matikan dan hapus kontainer (data tidak ada yang hilang: runner tanpa keadaan)
docker compose --profile bot rm -f autoedit-bot
```

Cara tercepat menghentikan SELURUH bot tanpa menyentuh VPS: tekan **jeda global** di Ruang
Bot (runner berhenti bekerja pada denyut berikutnya). Hentikan kontainer bila perlu
mematikan sepenuhnya. Layanan mesin lain (`autoedit-ts-api`, `-worker`, redis, rembg,
jembatan) tidak terpengaruh. Runner tanpa keadaan: aplikasi menyimpan semua tugas, jadi
menyalakan ulang kapan pun aman (tugas yang terputus dilanjutkan aplikasi lewat `pantau_job`
atau ditandai gagal).

Rollback kode: bila `runner.mjs` bermasalah, hentikan kontainer; image API/worker tidak
berubah karena runner hanya satu berkas bundel tambahan.

## 8. Rotasi rahasia

1. Buat rahasia baru: `openssl rand -hex 32`.
2. Ganti `BOT_RUNNER_SECRET` di env aplikasi, mulai ulang aplikasi.
3. Ganti di `/opt/pri-mesin/bot.env`, lalu
   `docker compose --profile bot up -d --force-recreate autoedit-bot`.
4. Selama jeda di antara langkah 2 dan 3 runner mendapat 401 dan berhenti bekerja
   (gagal tertutup); ia pulih sendiri begitu rahasianya cocok. Lakukan di luar jam ramai.
5. Rahasia lama tidak lagi diterima. Jangan menyimpan rahasia di chat, repo, atau log.

## 9. Batas dan risiko yang diketahui

- yt-dlp berversi "terbaru saat image dibangun" tanpa pembaruan otomatis: bila platform
  berubah, pemanen gagal beruntun lalu melapor; perbarui dengan membangun ulang image.
- Pemanen hanya menjalankan **satu** yt-dlp pada satu waktu, tanpa proxy/rotasi/penyamaran.
  Scraping IG/TikTok melanggar ketentuan layanan mereka; akun tumbal bisa diblokir.
- Badan permintaan `/api/bot/internal` dibatasi 8 KB di aplikasi; runner memangkas caption
  dan jumlah kandidat agar laporan muat. Bila batas aplikasi dinaikkan, naikkan juga
  `MAKS_LAPORAN_KARAKTER` di `src/bot-runner/pemanen.ts`.
- Mesin tidak mengembalikan `job_id` saat membuat job; runner mengenalinya dari selisih
  daftar stok/job (satu bot = satu job aktif). Job yang gagal menghilang dari antrean tanpa
  masuk stok: dinyatakan gagal (`hilang`) setelah 2 polling berturut-turut.
