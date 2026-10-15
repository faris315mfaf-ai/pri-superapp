# Siaran Koordinator ke akun anggota (15 Okt 2026)

Ruang Bot → **Koordinator** → sub tab **Siaran Anggota** (master). Satu video disiarkan ke akun sosmed
anggota yang tertaut di **upload-post**. Mockup: artefak "Siaran Koordinator ke Akun Anggota".

## Dasar
- Anggota menyetujui siaran koordinator **saat mendaftar** SuperApp (keputusan pemilik). Koordinator bertindak
  setingkat superadmin atas akun tertaut; **tidak ada sakelar izin per anggota**. Pastikan teks syarat
  pendaftaran memang menyebut ini.
- Nara (koordinator) hanya mengusulkan: ringkasan di wizard disusun dari data nyata, variasi caption dari LLM
  Nara (bila punya API key). Siaran berjalan setelah master menekan **Siarkan**.

## Alur
1. **Video**: Antrean ACC (hasil bot, disalin dari Stok mesin), Stok Video tim (`ID_TIM.tv`), bahan Video Wajib
   (tidak disalin; berkas milik perintah tidak dihapus siaran), atau unggah baru (alur `siapkan` TVR Saya).
2. **Penerima** (`GET /api/bot/siaran?bagian=penerima`): anggota aktif (bukan master/superadmin/bot) dengan
   `sosmed_profile` penyedia `upload-post`. Status: siap / perlu login ulang / batas harian (3 siaran per akun per
   hari WIB) / tanpa akun. Server **menghitung ulang** saat Siarkan; yang tidak siap dilewati.
3. **Caption & jadwal**: variasi Nara (maks 3; variasi yang mengubah angka atau "Sumber: …" dibuang server).
   Cara kirim: **Serentak** (bawaan — sebanyak mungkin akun sekaligus, boleh menumpuk; permintaan pemilik),
   Bertahap (jeda 45 dtk ± 15 dtk acak, jam tenang 22.00–06.00 WIB dilewati; lebih aman dari deteksi spam),
   Terjadwal (5 menit .. 5 hari, lalu bertahap).
4. **Tinjau**: >50 akun wajib ketik `SIARKAN`. Sakelar **Tampilkan di Ruang Bot**.

## Mesin
- Tabel: `tvr_siaran` (+ `sumber='koordinator'`, `mode`, `jeda_detik`, `kategori`, `perintah_id`, `tampil_ruang`,
  `dijeda`) dan `tvr_siaran_item` (+ `jadwal_kirim`, `varian`) — `sql/77_siaran_koordinator.sql`.
- Pemroses = `prosesSiaranSerentak` (lib/siaran.ts): hanya item yang **sudah jatuh giliran**, melewati siaran yang
  dijeda (dibaca ulang tiap kelompok), klaim atomik (tidak pernah dobel), cek akun anggota masih aktif tepat sebelum
  kirim, 429 → kembali antre. Item koordinator memakai upload-post **`async_upload`** (balasan dalam detik) +
  header `Idempotency-Key`, kelompok 15 paralel, ≤150 item per putaran; kegagalan per platform menyusul lewat
  rekonsiliasi KPI. Siaran Serentak lama tetap sinkron (kelompok 3).
- Berkas milik siaran tidak disapu selama masih ada item menunggu/diproses; video yang sama ke akun yang sama ditolak
  6 jam (`sumber_id`).
  Dipicu `/api/cron/siaran` tiap menit (kunci: satu putaran sekaligus) + `after()` saat dibuat/dipantau.
- Galat disimpan `hasil.galat = pasti|ambigu`. **Ulangi yang gagal** hanya mengirim ulang yang pasti belum terbit;
  yang ambigu (timeout/5xx/terputus) diperiksa manual.
- Terbit → baris `tvrku_post` milik anggota (+ `keyword`/`perintah_id`/`hasil.kategori`), jadi masuk KPI, Pantau
  Video Wajib, dan Insight; anggota dikabari (`siaran_koordinator`). Riwayat anggota: kartu **Siaran Koordinator**
  di TV Rakyat Saya (`GET /api/tvr/siaran-saya`).
- **Ruang Bot**: item yang gilirannya ≤150 dtk lagi → `panggilKeRuang` (karakter anggota tampil walau tidak online,
  `dipanggil: true`, tidak dihitung online di ruang umum); saat dikirim → aktivitas `unggah_sosmed` (Kotak Post).
- Kendali (`PATCH /api/bot/siaran`): jeda, lanjut (giliran terlewat dikirim mulai sekarang), batal sisa, ulangi gagal.

## Uji
`npx tsx tests/uji-siaran-koordinator.mts` (murni: jadwal, jam tenang, status, ulang, variasi, ruang umum).
