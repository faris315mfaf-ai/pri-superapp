# PRI SuperApp

Aplikasi internal partai: absensi, KPI video, QC komentar sosmed, TV Rakyat
(Official & akun anggota), chat, pengumuman, dan dashboard pengurus.

**Produksi:** https://pri-superapp.vercel.app

## Teknologi

- Next.js (App Router) + TypeScript + Tailwind
- Supabase (PostgreSQL, Storage) — skema di folder `sql/`
- Vercel (hosting), upload-post & Ayrshare (posting sosmed), Cloudflare R2 / Supabase Storage (video), n8n (otomasi)

## Menjalankan di komputer sendiri

```bash
npm install
cp .env.example .env.local   # isi kuncinya — minta ke pemilik proyek
npm run dev
```

Buka http://localhost:3000.

## Aturan kerja tim

1. **Jangan pernah commit rahasia.** Kunci hanya di `.env.local` (sudah diabaikan Git). Keystore APK dan `apk/KUNCI-PENTING.txt` juga diabaikan.
2. Sebelum commit wajib bersih: `npx tsc --noEmit`, `npx eslint <berkas yang diubah>`, `npm run build`.
3. Kerjakan di branch sendiri, lalu buka Pull Request ke `main`. Jangan push langsung ke `main`.
4. Perubahan skema database ditulis sebagai berkas baru bernomor di `sql/` dan diterapkan ke Supabase oleh pemilik proyek.
5. Deploy ke produksi hanya oleh pemilik proyek (`npx vercel --prod`).

## Struktur singkat

```
src/app/api/       ← endpoint server (Next.js route handlers)
src/features/      ← layar & komponen per fitur
src/lib/           ← logika bersama (sesi, KPI, wewenang, notifikasi)
src/services/      ← pemanggil API dari sisi klien
sql/               ← skema & migrasi database (urut nomor)
n8n_kode/          ← kode untuk workflow n8n
apk/               ← proyek Android TWA (tanpa kunci)
docs/              ← catatan arsitektur
```
