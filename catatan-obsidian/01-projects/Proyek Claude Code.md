---
type: project
status: active
area: PRI
tags: [project, claude, indeks]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp.
     Sunting di sini akan tertimpa — ubah di catatan-obsidian/ pada repo. -->

Peta semua proyek yang pernah dikerjakan lewat Claude Code di komputer ini.

## Daftar proyek

| Proyek | Folder di komputer | Bentuk | Status |
|---|---|---|---|
| [[PRI SuperApp]] | `C:\Users\Admin\pri-superapp` | Aplikasi Next.js | **Aktif** — produksi di VPS |
| [[QC Sosmed - Catatan Teknis\|QC Sosmed]] | `…\nama-project-kamu\Proyek_QC_Sosmed_ClaudeCode` | Workflow n8n | Jalan, sebagian pindah ke SuperApp |
| [[TV Rakyat Otomasi - Catatan Teknis\|TV Rakyat Otomasi]] | `…\nama-project-kamu\tv-rakyat-docs` | Workflow n8n | **Menggantung** — versi perbaikan belum dikonfirmasi |
| [[MonitorKarya]] | `C:\Users\Admin\monitor-karya` | Aplikasi Next.js | Baru satu sesi |

## Jebakan folder: "nama-project-kamu"
Folder `C:\Users\Admin\nama-project-kamu` namanya terdengar seperti proyek
kosong, padahal **dua proyek nyata tinggal di dalamnya**. Isi folder root-nya
sendiri cuma template React bawaan yang tidak pernah dipakai — bahkan
`README.md` di situ masih tulisan template.

Akibatnya sehari-hari: Claude Code sering "nyasar" ke folder ini, dan
pemeriksaan kode bisa melapor "bersih" padahal memeriksa proyek yang salah.
Kalau sedang mengerjakan SuperApp, pastikan folder kerjanya `pri-superapp`.

## Catatan mendalam PRI SuperApp
Proyek terbesar, punya sembilan catatan sendiri:

| | |
|---|---|
| [[PRI SuperApp]] | hub — identitas, sejarah, peta |
| [[PRI SuperApp - Tugas Menunggu]] | **cek ini dulu** kalau ada yang belum jalan |
| [[PRI SuperApp - Modul & Fitur]] | daftar lengkap fitur per modul |
| [[PRI SuperApp - Arsitektur]] | susunan server, penjadwal, cara menjaga diri |
| [[PRI SuperApp - Peran & Akses]] | siapa boleh apa |
| [[PRI SuperApp - Database]] | tabel, migrasi, jebakan |
| [[PRI SuperApp - Integrasi & API]] | semua layanan luar |
| [[PRI SuperApp - Jebakan & Insiden]] | pelajaran mahal |
| [[PRI SuperApp - Cara Rilis]] | perintah rilis & pemulihan |

## Platform & layanan
Ditulis dari kontrak yang **diverifikasi langsung**, bukan dari dokumentasi
yang mungkin sudah usang.

**Server & penyimpanan** — [[VPS Hostinger]] · [[Supabase]] ·
[[Cloudflare R2]] · [[Cloudinary]] · [[Vercel]]

**Sosial media** — [[upload-post]] · [[Ayrshare]] · [[TikHub]] ·
[[Chocodata]]

**AI & video** — [[DeepSeek]] · [[Creatomate]] · [[Luxand]]

**Komunikasi & lainnya** — [[SADAR]] · [[Fonnte & Convia]] · [[n8n]]

## Di mana catatan lain
- Catatan proyek tulisan sendiri: [[AUTOMATION QC]], [[AUTOMATION TV RAKYAT]],
  [[KAFE RAKYAT]], [[PHONE FARM]], [[SURVEY]]
- Ingatan mentah Claude per proyek: `04-archives/claude-memory/`
  (arsip otomatis, tidak untuk disunting)

<!-- otomatis:diperbarui -->
<!-- /otomatis -->
