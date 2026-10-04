# Menjalankan PRI SuperApp di macOS

Panduan menyiapkan repo ini di MacBook untuk dikerjakan bersama (kolaboratif).
Repo: `github.com/faris315mfaf-ai/pri-superapp` (privat). Produksi berjalan di
VPS sendiri — **push ke `main` otomatis men-deploy** ke produksi.

---

## 1. Prasyarat

Pasang [Homebrew](https://brew.sh) dulu bila belum, lalu:

```bash
brew install git node ffmpeg
```

- **Node 22** (produksi memakai Node 22). Cek: `node -v`.
- **ffmpeg** — wajib untuk menjalankan uji mesin Auto Edit (`tests/mesin-video`).
- Opsional: `brew install gh` (GitHub CLI, memudahkan login) dan
  `brew install redis` (hanya bila mau menjalankan mesin Auto Edit penuh di lokal).

---

## 2. Clone

Repo privat → saat clone diminta login GitHub (akun `faris315mfaf-ai`).
Bila diminta "password", **bukan** sandi biasa — pakai **Personal Access Token**
(GitHub → Settings → Developer settings → Personal access tokens), atau login
sekali lewat CLI: `gh auth login`.

```bash
mkdir -p ~/Developer && cd ~/Developer
git clone https://github.com/faris315mfaf-ai/pri-superapp.git
cd pri-superapp
```

---

## 3. Setel identitas commit (WAJIB)

Deploy otomatis **menolak** commit yang email penulisnya bukan ini:

```bash
git config user.email faris315mfaf@gmail.com
git config user.name "M. Faris Ahlul Firdaus"
```

---

## 4. Pasang paket

```bash
npm install
```

---

## 5. Kunci rahasia (.env) — TIDAK ikut di repo

Rahasia (Supabase, upload-post, Cloudinary, DeepSeek, SMTP, dll) sengaja TIDAK
disimpan di Git. Untuk menjalankan aplikasi di lokal:

```bash
cp .env.example .env.local
```

Lalu isi nilainya. Untuk sekadar ngoding + `npm run build`, cukup isi
`SUPABASE_URL`. Untuk menjalankan aplikasi penuh (login, data), salin nilai asli
dari VPS: `/opt/pri-superapp/aplikasi/env.txt` (lewat SSH ke server).
**Jangan pernah commit `.env` / `.env.local`** — sudah diabaikan `.gitignore`.

---

## 6. Menjalankan

### Dev server (aplikasi SuperApp)

```bash
npm run dev
```

Buka http://localhost:3000.

### Build produksi (cek sebelum deploy)

```bash
npm run build
```

> Jangan jalankan `npm run build` saat `npm run dev` masih hidup (chunk bisa bentrok).

---

## 7. Uji & gerbang mutu (jalankan sebelum push)

```bash
npx tsc --noEmit        # tipe
npm run lint            # eslint (atau: npx eslint . --max-warnings 0)
npm run build           # build
```

### Uji mesin Auto Edit (butuh ffmpeg; Redis ditiru otomatis)

```bash
npx tsx tests/mesin-video/uji-api.mts     # rute + render sungguhan (±1 mnt)
npx tsx tests/mesin-video/uji-teks.mts    # perender tulisan
npx tsx tests/mesin-video/uji-media.mts   # perintah ffmpeg + unduh/SSRF
npx tsx tests/mesin-video/uji-outro.mts   # auto outro
```

> Mesin Auto Edit (`src/mesin-video/`) adalah layanan Node terpisah yang jalan di
> VPS (lihat `vps/autoedit-ts/`). Untuk pengembangan biasa tak perlu dijalankan
> di lokal — cukup uji di atas. Bila ingin menjalankannya penuh di lokal perlu
> Redis (`brew services start redis`) + ffmpeg.

---

## 8. Alur kerja kolaboratif

Repo dipakai berdua (ada rekan yang ikut push). **Selalu rebase dulu** sebelum push:

```bash
git pull --rebase origin main
# ... kerja, commit ...
git push origin main
```

- **Push ke `main` = DEPLOY OTOMATIS** ke produksi (GitHub Actions → VPS
  menjalankan `pri-perbarui`). Versi yang gagal build dikembalikan otomatis.
- Pastikan `npx tsc --noEmit`, lint, dan `npm run build` lolos sebelum push.
- Jangan ubah berkas di `.github/workflows/` dari token biasa (butuh scope `workflow`).

---

## 9. Catatan lintas-OS

- `.gitattributes` memaksa akhir baris **LF** di semua OS → pindah Windows↔Mac
  tidak memunculkan berkas "berubah" palsu. Jangan ubah ini.
- Skrip `*.sh`, `*.mjs`, dan `Dockerfile` **wajib LF** (dijalankan di Linux/VPS).

---

## 10. Struktur singkat

```
src/app/            Next.js (App Router) — halaman & rute API (/api/*)
src/features/       Komponen fitur per layar (tvr-ku, auto-edit, dashboard, ...)
src/lib/            Logika bersama (sesi, peran, supabase, r2, rate-limit, ...)
src/mesin-video/    Mesin Auto Edit (layanan Node + worker di VPS)
tests/mesin-video/  Uji mesin Auto Edit
vps/                Skrip & compose deploy VPS (12-perbarui.sh, autoedit-ts/, ...)
sql/                Skema & migrasi SQL (dijalankan manual di Supabase)
docs/               Dokumen (termasuk berkas ini)
```
