<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# PRI SuperApp — panduan agen (Codex / Claude)

> **Mulai 7 Okt 2026 seluruh update dikerjakan Codex.** Baca dulu
> [`docs/SERAH-TERIMA-CODEX.md`](docs/SERAH-TERIMA-CODEX.md): update terbaru
> (desain Apple & tema master, tata letak lebar, Sayap Partai), cara migrasi
> produksi, jebakan teknis, dan pekerjaan tertunda.

Ditulis 5 Okt 2026 sebagai serah-terima antar-agen. **Jangan pernah menulis
rahasia (password, kunci API, isi env) di berkas ini atau di repo.**

## Cara kerja
- Balas pengguna dalam **bahasa Indonesia**.
- **Push ke `main` = deploy otomatis ke produksi** (GitHub Actions → VPS).
  Commit yang hanya mengubah `docs/**`, `**/*.md`, `apk/**`, `catatan-obsidian/**`
  tidak memicu deploy. Deploy me-restart aplikasi & worker render — push saat sepi.
- Identitas commit wajib email `faris315mfaf@gmail.com` (sudah di git config repo).
- Repo dipakai berdua: `git pull --rebase origin main` sebelum push.
- Gerbang mutu sebelum push: `npx tsc --noEmit`, `npx eslint <berkas> --max-warnings 0`,
  `npm run build`, dan bila menyentuh `src/mesin-video/`: `npx tsx tests/mesin-video/uji-api.mts`.
- Deploy gagal karena "module-not-found ... font/google" = gangguan jaringan sesaat:
  jalankan ulang workflow "Deploy VPS" (`gh run rerun <id>`).
- Node produksi 22 (Mac lokal Node 26).

## Infrastruktur
- **VPS aplikasi** `187.77.113.63` (Hostinger KVM 8, Jakarta, Ubuntu 26.04):
  aplikasi Next.js (`/opt/pri-superapp`), Supabase self-host (`db.pri-superapp.com`),
  Caddy, dan situs lain. Rahasia: `/opt/pri-superapp/aplikasi/env.txt`, `/opt/pri-superapp/kunci.txt`.
  Skrip deploy: `vps/12-perbarui.sh` (terpasang sebagai `pri-perbarui`; yang berjalan
  saat deploy adalah salinan versi SEBELUMNYA — perubahan skrip baru berlaku deploy berikutnya).
  Container `tf_rembg` (proyek **trifirdaus**) BUKAN milik PRI — jangan disentuh.
- **VPS mesin Auto Edit** `72.61.143.158` (Hostinger KVM 8): `/opt/pri-mesin`
  (`vps/mesin/docker-compose.yml`, `vps/mesin/pasang.sh`). Redis antrean + API + worker
  render + jembatan. Disk media 300 GB `/srv/godam/media` (template, stok video, unggahan).
  Login SSH hanya dengan kunci; UFW + fail2ban.
- **Jalur privat WireGuard** `wg0`: aplikasi `10.77.0.1` ↔ mesin `10.77.0.2`.
  Aplikasi memanggil mesin lewat socket `/srv/godam/sock/api.sock` → jembatan socat →
  `10.77.0.2:7700` (hanya terbuka di wg0). VPS aplikasi berjalan mode
  `autoedit-mesin = jauh`: image mesin dibangun di VPS aplikasi lalu dikirim ke VPS mesin
  (kunci `/root/.ssh/pri-mesin`, hanya diterima dari 10.77.0.1).
- Disk media lama 60 GB di VPS aplikasi dibiarkan sebagai cadangan rollback.
- R2 (Cloudflare) BELUM diatur; penyimpanan video memakai bucket privat Supabase `tvrku`.

## Fitur penting & letak kode
- **Edit Otomatis TVR Saya**: terbuka untuk SEMUA akun sejak 6 Okt 2026 (syarat ≥5 akun sosmed
  sudah dicabut) — `bolehEditOtomatisTvr` di `src/lib/peran.ts`; master bisa menutupnya per akun
  (`modul_izin.autoedit = false`). Gerbang server: `src/lib/autoedit.ts`,
  `src/app/api/autoedit/[...jalur]/route.ts`.
- **Stok Video** (`src/features/tvr-ku/stok-video-tvr.tsx`) untuk semua akun TVR Saya;
  video terhapus otomatis 48 jam; kuota pribadi 2 GB (`KUOTA_AKUN_MB` di VPS mesin).
- **Ruang Bot untuk semua anggota** (14 Okt 2026): master tetap layar penuh (`ruang-bot-screen.tsx`, `/api/bot/*`);
  peran lain (kecuali superadmin) mendapat mode lihat `src/features/ruang-bot/ruang-bot-umum.tsx`:
  ruangan, siapa online (nama + jenis kegiatan saja — disanitasi di `src/lib/ruang-umum-murni.ts`),
  dan **chat global** (`/api/ruang/chat`, tabel `chat_global` + `chat_global_bisu` dari `sql/75`).
  Aturan chat: 500 karakter, 5 pesan/30 dtk, kata kasar disamarkan, riwayat 7 hari, master hapus/bisukan.
- **Lacak Sumber / Pencari Video Asli** (15 Okt 2026, tahap 1 CPU): layanan Python `vps/lacak`
  (SSCD + PDQ + RapidOCR + faster-whisper + Chromaprint + Qdrant + SearXNG) di VPS mesin, profil compose
  `lacak`, dibangun DI VPS mesin oleh `12-perbarui.sh`. Mesin TS meneruskan `/api/lacak/*`
  (`src/mesin-video/server/lacak.ts`); UI `src/features/lacak-sumber/`; runner bot memakainya sebelum job.
  Panduan: `docs/LACAK-SUMBER.md`.
- **Video Wajib bernomor perintah** (15 Okt 2026): kategori video dibawa dari perintah Pimred sampai Insight (tanpa
  hashtag/LLM); wajib posting otomatis semua akun & platform, Pantau, pengingat, panel bisa diciutkan. Wajib jalankan
  `sql/76_video_wajib_perintah.sql` di produksi. Panduan: `docs/VIDEO-WAJIB.md`.
- **Siaran Koordinator ke akun anggota** (15 Okt 2026): Ruang Bot → Koordinator → Siaran Anggota (master) menyiarkan
  satu video ke akun upload-post anggota (persetujuan saat pendaftaran); bawaan serentak (upload-post asinkron,
  ±150 akun/menit), opsi bertahap/terjadwal; karakter anggota dipanggil ke Ruang Bot. Wajib
  `sql/77_siaran_koordinator.sql`; cron `/api/cron/siaran` tiap menit. Panduan: `docs/SIARAN-KOORDINATOR.md`.
- **Karakter Saya** (16 Okt 2026, tahap 1, uji coba akun Faris #4/#176 — `bolehKarakterSaya` di `src/lib/karakter-murni.ts`):
  tab Ruang Bot untuk memilih rupa pixel art (kulit, rambut 20, atasan 9, warna pakaian). Aset `public/karakter|ruang|perabot/v1`
  dibuat dari lembar ChatGPT oleh `alat/sprite/potong-*.mjs` (ruang memakai `alat/sprite/kalibrasi-ruang.json`). Perakit klien:
  `src/features/ruang-bot/karakter-sprite.ts`; API `/api/ruang/karakter`; wajib `sql/78_karakter_pengguna.sql`.
  Tahap 2 (belum): dunia Ruang Bot baru di tile 64×32 memakai modul ruang & perabot.
- **Tutorial interaktif**: mesin `src/features/tur/lapisan-tur.tsx`, langkah di `src/lib/tur.ts`
  (penanda `data-tur` di komponen asli).
- **Akun TIM TV Rakyat Official**: identitas mesin `900000001` (`ID_TIM` di `src/lib/autoedit.ts`),
  header `X-Autoedit-Tim: tv` lewat context `src/features/auto-edit/tim.ts`. Kuota 5 GB,
  150 stok, 60 antrean (`KUOTA_KHUSUS_MB`, `TVR_MAKS_STOK_KHUSUS`, `TVR_JOB_AKTIF_KHUSUS`).
  Upload ke akun Official: `src/app/api/tv/stok-tim/route.ts` → `video_antrian` → pratinjau
  & `/api/tv/unggah` (Ayrshare).
- Render serentak diatur master di HR Center (Redis `videojob:slot`, 1..10); kini 10.
  Diukur: CPU jenuh di ±3–4 slot.

## Pekerjaan tertunda
- Tahap 2 di VPS mesin: penghapus latar video (rembg; uji awal isnet kurang bagus pada latar
  ramai — uji BiRefNet/contoh nyata dulu; deteksi warna latar otomatis sebagai lapis 1) dan
  mesin kompres video (ab-av1 + VMAF, keluaran H.264).
- Ganti password root VPS aplikasi & matikan login password (pernah tertulis di chat).
- Uji alur penuh "Stok Video Tim → Official → unggah" dengan akun tim TV.
