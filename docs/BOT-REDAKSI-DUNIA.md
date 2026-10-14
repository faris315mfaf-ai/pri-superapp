# Bot Redaksi — dunia empat ruang (Ruang Bot, tab Ruang)

Dikerjakan 13 Okt 2026. Tab **Ruang** di Ruang Bot kini satu gedung empat ruang yang dipisah sekat kaca
(mockup acuan: `docs/mockups/pri-ruang-bot.html`). Siapa berada di mana datang dari data nyata.

| Ruang | Isi | Siapa di sana |
|---|---|---|
| Ruang kerja | meja Pencarian / Edit / Posting, sofa, mesin kopi | bot yang punya API key, di meja tahap tugas yang sedang berjalan; menganggur = sofa |
| Ruang meeting | meja rapat, layar, tiga kursi | bot berkunci + Nara, bila **rapat** |
| Ruang koordinator | meja Nara, papan penugasan | Nara |
| Kamar tidur | tiga kasur | bot **tanpa API key** (tidur, huruf Z naik) |

## Aturan (kode)
- **Tidur**: tidak ada baris `bot_otak` untuk bot itu → `punya_otak=false` → berjalan ke kamar tidur lewat pintu dan
  berbaring di kasur sesuai nomor urut (bot ke-1 = kasur 1). Key dipasang → bangun dan bekerja; dicabut → kembali tidur.
  Bot tidur tidak ikut rapat dan tidak bisa diberi tugas oleh Nara (pagar server sudah ada).
- **Meja kerja** (`mejaDariTahapTugas`): `cari`/`pilih` → meja Pencarian; `unduh`/`edit` → meja Edit;
  `disetujui`/`posting` → meja Posting. `siap_ditinjau`/`menunggu_acc` = bot tidak duduk di meja (menunggu ACC di sofa).
  Dijeda → sofa "Dijeda". Satu kursi per meja: bot lain antre di tengah ruangan.
- **Rapat**: tombol **Panggil rapat** (manual) ATAU room Chat ramai (pesan terakhir `chat_terakhir` < 3 menit).
  Mengklik pil "RUANG MEETING" membuka tab Chat.
- **Nara**: duduk di meja koordinator; tanpa API key ia duduk dengan gelembung "Belum punya API key". Usulan yang
  **disetujui** (`bot_usulan.status in (disetujui, dijalankan)`, < 3 menit) → Nara berjalan ke papan, menempel
  catatan, mengantar surat tugas (kertas melayang) ke bot, lalu pulang; bot menampilkan gelembung
  "Tugas baru dari Nara: …". Usulan disetujui 24 jam terakhir tampil sebagai catatan di papan (maks 3 per bot).
  Klik Nara / pil "RUANG KOORDINATOR" membuka tab Koordinator.
- Semua jalan melewati **pintu** (celah sekat); diuji di `tests/uji-ruang-dunia.mts` (`segmenMenembus`).

## Berkas
- `src/features/ruang-bot/denah.ts` — tata letak, pintu, sekat, jalur, geometri (murni).
- `simulasi-bot.ts` — simulasi bot (mode contoh = siklus; mode nyata `diam` = tempat dari server lewat `setSasaran`).
- `simulasi-nara.ts` — mesin keadaan Nara (meja / jalan / tempel / serah / rapat).
- `dunia-gambar.ts` — penggambar kanvas (latar statis + objek berurut kedalaman); `ruang-isometrik.tsx` — komponen & overlay.
- `peta-nyata.ts` — `sasaranBot`, `petaCatatan`, `suratBaru` (server → dunia).
- `src/lib/bot-dunia-murni.ts` + `bot-dunia.ts` — aturan murni + pemuat data; `GET /api/bot/status` kini membawa
  `bots[].punya_otak`, `bots[].tugas_aktif`, `koordinator`, `chat_terakhir`.

## Tidak ada migrasi baru
Memakai tabel yang sudah ada (`bot_otak` sql/70, `bot_chat` sql/73, `bot_koordinator` + `bot_usulan` sql/74). Tabel yang
belum ada = bagian itu kosong (bot dianggap tidur, Nara "Belum aktif"), layar tidak error.

## Mode contoh
Tanpa data server, Ruang tetap berjalan sebagai simulasi: Dimas contoh tidur (tanpa key); tombol "Pasang/Cabut API key
(contoh)" di kartu bot memperlihatkan bangun/tidur; "Panggil rapat" mengumpulkan bot dan Nara.

## Belum
- Bot lebih dari 3 (kasur/kursi rapat hanya 3; sisanya menunggu di tengah ruangan).
- Animasi tidak mereplay usulan yang disetujui lebih dari 3 menit lalu (hanya catatan di papan).


## Penghuni (pengguna online) — 14 Okt 2026, khusus master
Denah kini 28x16: gedung bot (x 0..16) + **sayap penghuni** (x 16..28): **Aula** (semua yang online berdiri di slotnya;
pintu depan di pojok kanan, orang baru muncul/pergi di sana), **Ruang Database** (6 rak), **Ruang Alat** (Auto Edit,
Kompres, Blur Watermark; 2 operator per mesin), **Ruang Pos** (kotak post, 3 tempat berdiri). Pintu ke tiga ruang di
garis y=6; semua jalan lewat pintu (diuji `segmenMenembus`).

| Aksi pengguna (jenis audit) | Animasi |
|---|---|
| `stok_tambah`, `stok_hapus`, `stok_tim`, `upload_video` (klien) | ke Ruang Database, mengisi berkas ke rak (sel rak bertambah) |
| `edit_otomatis`, `auto_edit`, `hapus_latar`, `template` | mesin Auto Edit (film bergulir + bilah render) |
| `kompres` | mesin Kompres (pelat menekan, ukuran menyusut) |
| `blur_watermark` | mesin Blur (mosaik bergerak menutup watermark) |
| `unggah_sosmed`, `unggah_official`, `siaran`, `tv_riwayat` | Ruang Pos: surat dimasukkan ke kotak post, bendera naik |

**Alur data (semua dari server, tidak ada yang dikarang):**
- Presence: `daftarHadir()` (detak 10 dtk). Layar yang dibuka: `catatLayar` (menumpang detak).
- Aksi: `catatAudit` -> `denyutAktivitas` (aksi tercatat setelah selesai, animasi berekor 12-25 dtk);
  proxy `/api/autoedit` dan rute unggah sosmed memakai `mulaiAktivitas`/`akhiriAktivitas` (animasi hidup selama
  permintaan berlangsung, mis. unggah stok ratusan MB); unggah klien langsung ke penyimpanan lapor lewat `POST /api/aktivitas`.
- Penyimpanan Redis `dunia:akt:<id>` / `dunia:layar:<id>` (TTL pendek; memori proses bila tanpa Redis).
- Siaran Realtime `dunia-ruang` (payload `{t}`) -> klien muat ulang `GET /api/bot/dunia` (hanya master; memuat nama,
  judul, akun). Polling cadangan 8 dtk. Akun sosmed diperkaya dari `akun_tvr_user` (platform @username).
- Karakter: `karakterDariId` (permutasi, 288 rupa = 24 kaus x 12 wajah); bentrokan diselesaikan `tetapkanKarakter`.
- Di atas nama: waktu (lama aksi m:ss / jam selesai WIB / jam WIB sekarang). Gelembung: aksi + judul + akun.

Berkas: `src/lib/dunia-murni.ts`, `dunia.ts`; `src/features/ruang-bot/{karakter-pengguna,simulasi-penghuni,dunia-sayap,dunia-primitif,use-dunia,panel-online}.ts(x)`;
uji: `tests/uji-dunia.mts`. Batas: aula menampung ~60 karakter (lebihnya tercantum di daftar saja).
