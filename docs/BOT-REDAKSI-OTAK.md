# Bot Redaksi — "Otak" tersendiri per bot (API key)

Status: **kode selesai dan teruji; belum aktif di produksi** (13 Okt 2026). Tidak memuat rahasia.

## Apa yang dilakukan

Setiap bot boleh punya API key LLM sendiri (DeepSeek atau Google Gemini). Dengan key itu bot menulis
**hook** videonya sendiri (teks lower-third "KICKER! isi"). Bot tanpa key tetap jalan memakai otak bawaan
mesin (key bersama milik mesin). Takarir dan penilai sumber akan memakai fungsi yang sama
(`tanyaOtakBot` di `src/lib/bot-otak.ts`) saat Pekerjaan 3A/3F dibangun.

Pemakaian token tercatat di `ai_pemakaian` dengan fitur `bot:hook` / `bot:uji` dan user = akun bot,
jadi terlihat di Panel Master → Pemakaian Token AI.

## Keamanan kunci

- Disimpan **terenkripsi AES-256-GCM** di tabel `bot_otak` (`sql/69_bot_otak.sql`), bukan polos.
  Kunci induk = env `BOT_KUNCI_INDUK` (min. 32 karakter). Tiap nilai punya IV acak, dan terikat ke
  id bot (AAD) sehingga sandi satu bot tidak bisa dipindah ke bot lain.
- **Tulis-saja:** setelah disimpan layar hanya menampilkan `••••` + 4 karakter terakhir. Tidak ada
  endpoint yang mengembalikan kunci.
- Didekripsi hanya di aplikasi, sesaat sebelum memanggil penyedia. **Tidak dikirim ke runner** (Rumah Bot):
  aplikasi yang menulis hook lalu mengirim teks hook-nya saja lewat perintah `buat_video` (`hook`).
- Kunci hanya dikirim lewat header (`Authorization` / `x-goog-api-key`), tidak pernah di URL. Pesan galat,
  log, dan audit tidak memuat kunci (audit hanya mencatat penyedia dan 4 karakter terakhir).
- Gagal-tertutup: tanpa `BOT_KUNCI_INDUK` tombol Simpan ditolak (503), tidak ada penyimpanan polos.
- Hanya master (`bolehRuangBot`), dengan pembatas laju dan catatan audit (`bot_otak`).

## Mengaktifkan

1. Jalankan SQL (prasyarat `sql/67`):
   ```bash
   ssh pri-vps 'docker exec -i supabase-db psql -U postgres -w --single-transaction -v ON_ERROR_STOP=1' < sql/69_bot_otak.sql
   ```
   lalu `NOTIFY pgrst, 'reload schema';`
2. Buat kunci induk dan taruh di env aplikasi VPS (`/opt/pri-superapp/aplikasi/env.txt`) sebagai
   `BOT_KUNCI_INDUK=<nilai>`, lalu restart aplikasi. Buat nilainya dengan:
   ```bash
   openssl rand -base64 32
   ```
   Simpan salinannya di tempat aman. **Jangan ganti nilainya sembarangan:** key bot yang sudah tersimpan
   tidak bisa dibuka lagi dan harus dimasukkan ulang.
3. Di TVR Saya akun master → bagian **Otak Bot (API key)**: pilih penyedia, tempel key, Simpan, lalu Uji.

## Cara kerja hook

`ambilKerja` (sisi aplikasi) memberi perintah `buat_video`. Bila bot punya key, aplikasi memanggil
penyedia dengan prompt hook yang sama dengan mesin (`PROMPT_HOOK`), merapikan hasilnya, lalu menambahkan
`hook` ke perintah. Runner yang menerima `hook` melewati `POST /api/tvr/hook` ke mesin. Bila panggilan
gagal (kunci salah, kuota, waktu habis, jawaban tak masuk akal) aplikasi diam-diam tidak menambahkan
`hook` dan runner memakai jalur mesin seperti sebelumnya; satu video tidak pernah gagal gara-gara otak bot.
Batas waktu panggilan 20 detik.

## Uji

`tests/uji-bot-otak.mts` (enkripsi, validasi), `tests/uji-bot-otak-panggil.mts` (pemanggil penyedia dengan
fetch tiruan: header, pemetaan galat, kunci tidak bocor), `tests/bot-runner/uji-giliran.mts` (hook dari otak
bot dipakai / jalur mesin).
