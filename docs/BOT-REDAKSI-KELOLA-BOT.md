# Kelola Bot (Profil → Kelola Bot) — khusus master, 14 Okt 2026

Menggantikan `scripts/buat-akun-bot.mjs` dan kerja di terminal. Tombol **Kelola Bot** ada di layar Profil, di bawah Audit
(hanya tampil untuk master: `bolehRuangBot`). Tiga tab:

1. **Akun Bot** — daftar bot (potret, username, platform, jumlah akun sosmed tertaut, punya API key atau tidur), ubah profil,
   dan **Tambah bot**: nama, peran, watak, platform utama, nama akun sosmed (tampilan), warna, rupa karakter (10 pilihan).
   Server (`POST /api/bot/akun`, aksi `buat`) membuat akun superapp di **Divisi BOT** (username otomatis `bot1`, `bot2`, …;
   kata sandi acak yang tidak pernah ditampilkan; **tidak bisa login** — `lib/sesi` menolak Divisi BOT) + baris `bot_redaksi`
   (mode ACC, kuota 1/hari). Bila baris `bot_redaksi` gagal, akun yang baru dibuat dibatalkan. Batas 12 bot (`MAKS_BOT`).
2. **Profil Upload-Post** — per bot: tombol "Profil baru" (membuat profil bernama di upload-post dan menautkannya ke bot lalu
   menyalin tautan login 48 jam untuk pemilik akun sosmed) dan daftar profil upload-post yang belum tertaut untuk ditautkan ke
   bot mana pun (pemilih akun punya pencarian + filter divisi). Komponen: `ModalTautkanProfil`, `TautanProfilMaster`.
3. **Otak (API Key)** — tutorial mendapatkan API key **DeepSeek** (`platform.deepseek.com`) dan **Google Gemini**
   (`aistudio.google.com/apikey`), lalu kartu Nara + kartu per bot (`OtakBot`): pilih penyedia, tempel key, Simpan, Uji.
   Key tulis-saja, terenkripsi AES-GCM (`BOT_KUNCI_INDUK`), tidak pernah ditampilkan lagi dan tidak dikirim ke runner.

Urutan menyiapkan bot baru: Akun Bot → Profil Upload-Post → Otak (API Key) → template video (TVR Saya → Kendali Akun BOT)
→ sumber & kuota (Ruang Bot). Bot tanpa API key tidur di kamar tidur Ruang Bot.

Berkas: `src/features/kelola-bot/kelola-bot-screen.tsx`, `src/app/api/bot/akun/route.ts`, `src/lib/bot-akun-murni.ts`
(validasi, username berikut, rupa), uji `tests/uji-bot-akun.mts`. Jenis audit: `bot_akun`.
