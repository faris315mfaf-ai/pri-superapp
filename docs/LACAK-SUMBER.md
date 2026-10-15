# Lacak Sumber — Pencari Video Asli (tahap 1, 15 Okt 2026)

Mencari video **asli** dari video saduran: siapa pengunggah pertamanya, bagian mana yang dipakai, dan
kredit "SUMBER: @akun" yang benar. Tahap 1 berjalan di **CPU saja** di VPS mesin.

## Alur

```
peramban ──/api/autoedit/lacak/*──▶ aplikasi (gerbang peran) ──soket──▶ mesin TS /api/lacak/*
runner bot ─────────────────────────────────────────────soket──▶ mesin TS /api/lacak/* (x-autoedit-bot: 1)
mesin TS (src/mesin-video/server/lacak.ts) ──http──▶ autoedit-lacak:7100 (vps/lacak, Python)
autoedit-lacak ──▶ lacak-qdrant:6333 (koleksi)   ──▶ lacak-searxng:8080 (pencarian web)
```

Satu pelacakan (`vps/lacak/lacak/pekerja.py`), batas 15 menit:

1. **Ambil** — metadata + unduh ≤ 180 dtk (yt-dlp, ≤ 480p).
2. **Frame kunci** — PySceneDetect + sebaran rata (≤ 24), sidik SSCD (biasa + cermin) & PDQ.
3. **Teks** — OCR RapidOCR/PP-OCRv6 pada ≤ 12 frame → watermark `@akun` (varian salah baca digabung).
4. **Ucapan** — faster-whisper (`small`, int8) → kata kunci; sidik suara Chromaprint.
5. **Cari** — koleksi sendiri (Qdrant) → video terbaru akun watermark (TikTok, YouTube) → YouTube
   (`ytsearch`) → web (SearXNG `site:`). Disaring dengan kemiripan sampul, ≤ 8 diperiksa penuh.
6. **Cocokkan** — tiap kandidat: frame tiap 2 dtk (≤ 6 menit pertama), SSCD + PDQ + penyelarasan waktu,
   sidik suara dengan pencarian selisih, lalu skor berbobot (`lacak/skor.py`).

Skor: gambar 40 · suara 25 · watermark 15 · waktu unggah 10 · durasi/resolusi 5 · akun tepercaya 5.
Suara tidak bisa dibandingkan atau musik diganti → bobot suara pindah ke gambar.
Zona: ≥ `ambang_yakin` (0,85) = dipakai otomatis (paling awal diunggah), ≥ `ambang_acc` (0,60) = perlu
ACC, lainnya = bukan sumber. Video asli terpilih masuk koleksi (bila `simpan_ke_koleksi`).

## Pemakaian

- **Ruang Bot → tab Lacak Sumber** (master): tempel link, lihat tahap, kandidat, perbandingan, putuskan.
- **Profil → Kelola Bot → Lacak Sumber** (master): akun koleksi (dipanen tiap 2 jam, ≤ 3 video baru per
  putaran, disimpan 90 hari) dan pengaturan ambang & sakelar.
- **TVR Saya → Edit Otomatis → Pakai Link** (master): kartu "Cari video asli" (sakelar `tombol_pengguna`).
- Akses: KHUSUS MASTER (gerbang aplikasi `/api/autoedit/lacak/*`) + runner bot lewat soket mesin. Jatah
  pengguna biasa di layanan (1 berjalan, 30/hari) tetap ada sebagai pengaman bila nanti dibuka.
- **Runner bot**: sebelum job dibuat (`src/bot-runner/giliran.ts`), bila sakelar `lacak_bot` menyala.
  Hasil yakin → link diganti video asli dan kredit ke pemiliknya; selain itu link semula (tidak pernah
  menggagalkan tugas). Menunggu paling lama 8 menit.

## Operasi (VPS mesin `/opt/pri-mesin`)

Dipasang otomatis oleh `vps/12-perbarui.sh` (`perbarui_lacak_jauh`): konteks `vps/lacak` dikirim (tar),
image `pri-lacak:terbaru` **dibangun di VPS mesin**, lalu `docker compose --profile lacak up -d`.
Gagal di langkah ini tidak menggagalkan Auto Edit.

```bash
cd /opt/pri-mesin && docker compose --profile lacak ps
docker logs --tail 100 pri-autoedit-lacak
docker exec pri-autoedit-lacak python -c "import urllib.request,json;print(urllib.request.urlopen('http://127.0.0.1:7100/sehat').read().decode())"
```

Data: `/srv/godam/media/lacak` (SQLite `lacak.db`), volume `pri-lacak-qdrant`. Rahasia SearXNG di
`/opt/pri-mesin/lacak.env` (dibuat otomatis, 0600, tidak di repo).
Env penting: `LACAK_WHISPER` (`small`; `large-v3-turbo` lebih akurat ±3× lebih lambat, perlu build ulang
dengan `--build-arg WHISPER=large-v3-turbo`), `LACAK_UTAS`, `LACAK_BATAS_WAKTU`, `LACAK_JATAH_HARIAN`.

## Uji

```bash
cd vps/lacak && python -m pytest -q                     # 35 uji (4 ujung-ke-ujung butuh model)
npx tsx tests/mesin-video/uji-lacak.mts                 # penerusan mesin TS
npx tsx tests/bot-runner/uji-lacak-runner.mts           # langkah lacak di runner
```

Di dalam container: `docker exec -e LACAK_MODEL_UJI=/opt/model pri-autoedit-lacak python -m pytest -q`.

## Belum (tahap 2)

Pelokalan segmen neural (VSC22/TransVCL), DINOv3/Perception Encoder, sidik suara neural — semuanya butuh
GPU atau layanan berbayar.

## Cari balik gambar (Google Lens via SerpApi, 15 Okt 2026)

Kode: `vps/lacak/lacak/lens.py`. Lens hanya MENEMUKAN kandidat (sumber `lens`, prioritas 4); pencocokan isi
tetap di pekerja. Tahap "cari" memanggilnya hanya bila koleksi & akun watermark tidak menemukan apa pun.

- Per video: `LACAK_LENS_FRAME` frame (bawaan 2, maks 4) = 1 pencarian per frame. Frame → JPEG ≤ 480 KB →
  `POST serpapi.com/image` (image_id, berlaku 10 menit — TANPA URL publik) → `google_lens` `type=visual_matches`
  → hanya link satu video TikTok/Instagram/YouTube/Facebook/X.
- Kuota: batas lokal `LACAK_LENS_KUOTA` (bawaan 90, paket gratis ±100/bulan; dihitung di SQLite per bulan) DAN
  sisa nyata dari `serpapi.com/account` (gratis) bila terbaca. Habis/ditolak (401/403/429) → berhenti diam-diam,
  pelacakan lanjut tanpa Lens. Pencarian yang gagal tidak dihitung. Biaya unggah gambar tidak terdokumentasi
  SerpApi — cek pemakaian di dasbor SerpApi setelah beberapa percobaan.
- **Pasang kunci (dikerjakan pemilik, jangan di chat/repo):** di VPS mesin tambahkan satu baris
  `SERPAPI_KEY=<kunci>` ke `/opt/pri-mesin/lacak.env` (berkas 0600), lalu
  `cd /opt/pri-mesin && docker compose --profile lacak up -d autoedit-lacak`. Nyalakan sakelar
  "Cari balik gambar" di Profil → Kelola Bot → Lacak Sumber (ditolak 400 bila kunci belum ada).
- Env: `LACAK_LENS_NEGARA` (id), `LACAK_LENS_SELALU=1` (uji: abaikan syarat "sumber lain kosong").
- Uji: `vps/lacak/tests/test_lens.py` (SerpApi dipalsukan dengan MockTransport; ikut gerbang build image).
