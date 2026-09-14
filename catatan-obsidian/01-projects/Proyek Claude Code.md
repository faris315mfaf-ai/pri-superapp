---
type: project
status: active
area: PRI
tags: [project, claude, indeks]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp.
     Sunting di sini akan tertimpa — ubah di catatan-obsidian/ pada repo. -->

Peta semua proyek yang pernah dikerjakan lewat Claude Code di komputer ini:
apa isinya, di folder mana, dan sedang berada di tahap apa.

## Daftar proyek

| Proyek | Folder di komputer | Bentuk | Status |
|---|---|---|---|
| [[PRI SuperApp]] | `C:\Users\Admin\pri-superapp` | Aplikasi Next.js | **Aktif** — produksi di VPS |
| [[QC Sosmed - Catatan Teknis\|QC Sosmed]] | `…\nama-project-kamu\Proyek_QC_Sosmed_ClaudeCode` | Workflow n8n | Jalan, tapi sebagian pindah ke SuperApp |
| [[TV Rakyat Otomasi - Catatan Teknis\|TV Rakyat Otomasi]] | `…\nama-project-kamu\tv-rakyat-docs` | Workflow n8n | **Menggantung** — versi perbaikan belum dikonfirmasi jalan |
| [[MonitorKarya]] | `C:\Users\Admin\monitor-karya` | Aplikasi Next.js | Baru satu sesi |

## Jebakan folder: "nama-project-kamu"
Folder `C:\Users\Admin\nama-project-kamu` namanya terdengar seperti proyek
kosong, padahal **dua proyek nyata tinggal di dalamnya** (QC Sosmed dan
TV Rakyat Otomasi). Isi folder root-nya sendiri cuma template React/Vite
bawaan yang tidak pernah dipakai — `README.md` di situ masih tulisan
template, bukan proyek.

Akibatnya sehari-hari: Claude Code sering "nyasar" ke folder ini, dan
perintah pemeriksaan kode bisa melapor "bersih" padahal memeriksa proyek
yang salah. Kalau sedang mengerjakan SuperApp, pastikan folder kerjanya
`pri-superapp` lebih dulu.

## Di mana catatan lain
- Catatan proyek tulisan sendiri: `01-projects/PRI/` — [[AUTOMATION QC]],
  [[AUTOMATION TV RAKYAT]], [[KAFE RAKYAT]], [[PHONE FARM]], [[SURVEY]]
- Ingatan mentah Claude per proyek: `04-archives/claude-memory/`
  (arsip, tidak untuk disunting)
- Platform & API: `03-resources/platform/` — [[SADAR]], [[Supabase]], [[Chocodata]]

<!-- otomatis:diperbarui -->
<!-- /otomatis -->
