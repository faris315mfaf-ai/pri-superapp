# Serah terima ke Codex — PRI SuperApp

Ditulis 7 Okt 2026 oleh Claude. Mulai sekarang seluruh update dikerjakan Codex.
Baca juga [`AGENTS.md`](../AGENTS.md) (aturan kerja, infrastruktur, fitur lama).

> **Jangan pernah menulis rahasia (password, kunci API, isi env, token) di berkas
> ini, di repo, atau di pesan commit.**

---

## 1. Cara kerja wajib

| Hal | Aturan |
|---|---|
| Bahasa | Balas pengguna dalam **bahasa Indonesia**. |
| Deploy | **Push ke `main` = deploy otomatis ke produksi** (GitHub Actions "Deploy VPS"). Commit yang hanya mengubah `docs/**`, `**/*.md`, `apk/**`, `catatan-obsidian/**` tidak memicu deploy. |
| Izin | **Selalu tanya dulu sebelum commit/push** — pengguna biasa menjawab "ya commit dan push". Migrasi database produksi juga ditanyakan dulu. |
| Sinkron | Repo dipakai berdua: `git pull --rebase origin main` sebelum push. |
| Identitas | Email commit `faris315mfaf@gmail.com` (sudah di git config repo). |
| Gerbang mutu | `npx tsc --noEmit` · `npx eslint <berkas> --max-warnings 0` · `npm run build` · bila menyentuh `src/mesin-video/`: `npx tsx tests/mesin-video/uji-api.mts` (48/48 lulus per 6 Okt). |
| Cek deploy | `gh run list --limit 3` lalu `gh run watch <id> --exit-status`. Ada dua workflow: **Periksa** (tsc) dan **Deploy VPS**. |
| Deploy gagal | `module-not-found ... font/google` atau `dial tcp :22 i/o timeout` = gangguan jaringan sesaat → `gh run rerun <id>`. |

### Migrasi database produksi

`pri-sql` di VPS **rusak** (`Berkas kunci tidak ada: /opt/pri-superapp/kunci.env`). Pakai cara ini:

```bash
ssh pri-vps 'docker exec -i supabase-db psql -U postgres -w --single-transaction -v ON_ERROR_STOP=1' < sql/NN_nama.sql
ssh pri-vps "docker exec -i supabase-db psql -U postgres -w -c \"NOTIFY pgrst, 'reload schema';\""
```

Jalankan migrasi **sebelum** push kode yang memakai kolom barunya. Migrasi terakhir: `sql/61_daftar_sayap.sql`.

### Jangan dilakukan
- Jangan sentuh container `tf_rembg` (proyek **trifirdaus**, bukan milik PRI).
- Jangan memanggil API yang MENGUBAH data dari dev lokal: env lokal bisa tersambung ke database produksi. Uji tampilan saja.
- Jangan pakai `@container` (container query CSS) pada pembungkus layar — lihat §4.

---

## 2. Update 6–7 Okt 2026 (urut commit)

| Commit | Isi |
|---|---|
| `6cd327b` | TVR Saya: tombol "Hubungkan TV Rakyat Saya" ringkas; Stok Video paling atas. |
| `68549fa` | **Modul Audit** (superadmin & master): login, lama aplikasi menyala, alat & unggahan per pengguna. `sql/60_audit_aktivitas.sql`, `src/lib/audit.ts`, `src/lib/audit-jenis.ts`, `src/app/api/audit/route.ts`, `src/features/audit/audit-screen.tsx`. Layar aktif dikirim lewat `<html data-layar>` (page.tsx). |
| `bf683e1` | TVR Saya: **Edit Otomatis untuk semua akun**; antrean render **10 slot serentak, giliran adil** antar pengguna, maks 20 antre per akun; tombol **Hapus template**. Mesin: `src/mesin-video/{antrean,job,konfig,pekerja}.ts`, `server/{bantu,tvr}.ts`. |
| `81be069` | Kompres Video: unggahan sampai **1 GB**, video asli dihapus setelah hasil jadi. |
| `003fcf9`, `eb60cc5` | **Desain Apple** + Dock macOS + tema **Pagi / Sore / Malam / Classic** (awalnya akun Faris #4 & #176). |
| `2846e31` | **TV Rakyat Official** tata letak dasbor (akun master). |
| `14cabf4` | **Tata letak lebar seluruh modul** + tema Apple dibuka untuk **semua akun master**. |
| `6cac838` | **Pendaftaran SAYAP PARTAI** (logo sayap, provinsi, kota, jabatan sayap). |

---

## 3. Peta fitur baru

### 3.1 Desain Apple & tema (akun master + akun uji Faris)
- **Gerbang**: `src/lib/desain-apple.ts`
  - `bolehDesainApple(u)` = akun uji (#4 farismfaf, #176 faris) **atau** `role === "master"`.
  - `latarBawaan(u)` = akun uji → `"pagi"`, master lain → `"classic"` (bila belum pernah memilih).
  - `tataLebar(u)` = `role === "master"` (tata letak lebar, §3.2).
- **Tema**: `src/hooks/use-latar-apple.ts` — `Latar = "pagi" | "sore" | "malam" | "classic"`; disimpan per akun di preferensi `latar` (+ salinan `localStorage pri:latar`). `latarEfektif()`: Malam hanya di mode gelap (di mode terang tampil Pagi). `temaApple()`: Classic = desain Apple mati.
- **Tampilan**: `globals.css` blok `html[data-desain="apple"]` (font sistem, kaca blur 30px, margin samping 5px, `kepala-layar`, `hero-profil`, dst.). Latar ilustrasi `src/components/latar-apple.tsx` (versi lanskap & potret), dipasang `mesh-background.tsx`.
- **Pemilih tema**: `src/features/profil/pemilih-latar.tsx` (Profil › Pengaturan › Display).
- **Dock macOS**: `src/components/dock.tsx` (magnifikasi pegas framer-motion), mode di `src/hooks/use-mode-nav.ts`; page.tsx menghitung `desainApple`, `pakaiDock`, `kiriKonten`, `kiriSubLayar`, dan memasang `<html data-desain>` & `<html data-nav="dock">`.
- API preferensi menerima kunci `footer | latar | layout:<modul>` (`src/app/api/preferensi/route.ts`).

### 3.2 Tata letak lebar (khusus `role === "master"`, tablet & PC)
Kolom dihitung dari **lebar wadah** (ResizeObserver), bukan lebar layar, karena sidebar/Dock memakan ruang.

- Hook: `src/hooks/use-kolom-wadah.ts` (`useLebarWadah`, `useKolomWadah` → 1/2/3 kolom pada <680 / <1080 / ≥1080 px; `null` sampai terukur — tunda render isi supaya panel tidak terpasang dua kali), `src/hooks/use-tata-lebar.ts`, `src/hooks/use-layar-lebar.ts` (≥1024 px).
- `src/components/tata-letak-modul.tsx`: prop `lebar`, `maksKolom`, dan `bobot` per seksi → seksi dibagi berurutan ke 2–3 kolom (`bagiKolom`), mode Atur Tata Letak tetap satu lajur.
- CSS `.kolom-aplikasi.kolom-lebar` = max-width 1400px di PC.

| Modul | Berkas | Bentuk lebar |
|---|---|---|
| TV Rakyat Official | `features/tv-rakyat/tv-screen.tsx` (`BENTO_MASTER`), `ringkasan-tv.tsx`, `kartu-keyword-wajib.tsx` | Strip ringkasan pipeline → **Keyword Wajib Laporan di puncak** → bento 3/2/1 kolom → Akses cepat. Tanpa TataLetakModul (tidak bisa diatur ulang). |
| Beranda master | `features/dashboard/dashboard-screen.tsx` | Dompet \| Pengumuman+Ringkasan; ubin Semua Dashboard auto-fit; seksi bawah 2 kolom. |
| TVR Saya | `features/tvr-ku/tvrku-screen.tsx` | TataLetakModul `lebar` (stok bobot 3, edit otomatis bobot 4). |
| HR Center | `features/qc-konten/qc-screen.tsx` | TataLetakModul `lebar`; daftar akun `xl:grid-cols-3`. |
| Konten | `features/konten/konten-screen.tsx`, `features/beranda/kartu-video-baru.tsx` (`lebar`) | 2 kolom + Video Baru jadi galeri. |
| TV Nasional | `features/tv-rakyat/tv-nasional-screen.tsx` | Panel angka \| panel insight. |
| Profil | `features/profil/profil-screen.tsx` | Kartu profil di atas; kiri menu/kinerja, kanan Pengaturan. |
| Chat | `features/chat/chat-screen.tsx`, `panel-grup.tsx` | **Terbagi** bila wadah ≥760px: daftar \| percakapan (`PanelPercakapan`/`PanelGrup` prop `tertanam`). Setinggi layar; `.ruang-dock` memberi ruang Dock. |
| Notifikasi | `src/app/page.tsx` (`panelNotif`) | Di PC: panel samping kanan 420px + tirai, bukan layar penuh. |

### 3.3 Pendaftaran SAYAP PARTAI (`6cac838`)
- Daftar → Daftar Sebagai → **SAYAP PARTAI** (`features/auth/auth-screen.tsx`: `PILIHAN_KATEGORI`, `IsianSayap`, `FormDaftar`).
- Pilih logo sayap (wajib) dari `SUB_SAYAP` + `LOGO_SAYAP` (`src/lib/struktur.ts`, berkas `public/sayap/*.webp`), lalu **opsional** provinsi → kota/kabupaten (`src/lib/wilayah.ts` + `src/data/wilayah-indonesia.json`: 38 provinsi, 514 kab/kota, data Kepmendagri dari cahyadsn/wilayah, lisensi MIT) → jabatan sayap (`JABATAN_SAYAP`).
- Server `src/app/api/daftar/route.ts`: kategori `"sayap"` → `divisi = "Divisi Sayap Partai"`, `sub_divisi = sayap`, `jabatan_sayap`, `provinsi`, `kota` (semua divalidasi). **Pengaju jabatan sayap selalu `menunggu` ACC HR** walau sakelar `daftar_auto_aktif` menyala (jabatan sayap membuka modul Dashboard).
- Lengkapi Profil: struktur sayap terkunci (`strukturTetap`) supaya jabatan yang diajukan tidak hilang.
- Kolom baru `app_user.provinsi`, `app_user.kota` (`sql/61_daftar_sayap.sql`, **sudah dijalankan di produksi**).

---

## 4. Jebakan teknis (sudah pernah kena)

- **`container-type` (Tailwind `@container`) pada pembungkus layar** menerapkan containment → modal `position: fixed` di dalamnya terkurung di pembungkus. Pakai `useLebarWadah` (JS). `@container` hanya aman di elemen tanpa turunan fixed (contoh: kartu Video Baru).
- **`backdrop-filter` / `transform` pada leluhur** modal fixed juga membuat containing block baru — karena itu panel chat `tertanam` tidak memakai kelas `glass` di akarnya.
- Tailwind v4 `@theme inline` menyisipkan nilai font/warna langsung; override lewat selektor, bukan variabel.
- Setelah menghapus halaman uji: `rm -rf .next/dev` (tipe basi membuat tsc gagal).
- Skrip deploy yang berjalan adalah salinan `vps/12-perbarui.sh` versi SEBELUMNYA (perubahan skrip baru berlaku di deploy berikutnya).
- Lint `react-hooks/set-state-in-effect` aktif: turunkan state dari kunci, jangan `setState` sinkron di effect.

---

## 5. Pekerjaan tertunda / catatan

1. **Provinsi & kota** pendaftar sayap baru tersimpan dan muncul di notifikasi HR — belum ditampilkan/diedit di Database Anggota (`features/pengguna/tabel-anggota-screen.tsx`) maupun Profil.
2. **Bug lama** di page.tsx `handleTarget`: cabang `notifikasi` memanggil `pilihTab("notifikasi")` padahal tidak ada tab itu (jatuh ke tab awal). Seharusnya `setSubLayar({ nama: "notifikasi" })`.
3. Chat mode layar penuh (HP / non-master): `PanelPercakapan` & `PanelGrup` memakai `lg:left-60` tetap — tidak mengikuti sidebar Apple (264px) / Dock.
4. `localStorage pri:latar` dipakai bersama semua akun di satu perangkat (preferensi server tetap menang saat dimuat).
5. Tata letak lebar & tema master **belum diverifikasi visual oleh Claude** (butuh login master) — minta pengguna kirim screenshot bila ada yang janggal.
6. Dari `AGENTS.md`: Tahap 2 VPS mesin (penghapus latar rembg/BiRefNet, kompres ab-av1+VMAF H.264), ganti password root VPS aplikasi & matikan login password, uji alur "Stok Video Tim → Official → unggah".

---

## 6. Referensi desain (artifact pribadi pemilik, mungkin tidak bisa dibuka Codex)

- Mockup & prototipe interaktif (Desktop/Tablet/Mobile, semua modul): https://claude.ai/artifact/36r5Mu2CRaK9fDk5zKUy14
- Daftar uji tema akun Faris: https://claude.ai/artifact/33B2gegUhox1n4pKamfx74
- Skrip pembangkit mockup ada di scratchpad Claude (tidak tersimpan di repo).
