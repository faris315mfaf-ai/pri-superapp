---
type: project
status: active
area: PRI
started: 2026-08-23
due: 
tags: [project, pri, superapp]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp.
     Sunting di sini akan tertimpa — ubah di catatan-obsidian/ pada repo. -->

## Tujuan
Satu aplikasi untuk seluruh kerja harian PRI — absensi, KPI video, kepatuhan
komentar, produksi & analitik TV Rakyat, chat, dashboard pimpinan —
menggantikan sekumpulan spreadsheet, grup WhatsApp, dan tiga otomasi n8n
yang selama ini berjalan sendiri-sendiri.

## Kartu identitas
| | |
|---|---|
| **Alamat** | [pri-superapp.com](https://pri-superapp.com) |
| **Folder** | `C:\Users\Admin\pri-superapp` |
| **Kode** | GitHub privat `faris315mfaf-ai/pri-superapp`, branch `main` |
| **Teknologi** | Next.js 16 · React 19 · Tailwind 4 · shadcn/ui · framer-motion |
| **Database** | Supabase dipasang sendiri di VPS (`db.pri-superapp.com`) |
| **Dimulai** | 23 Agustus 2026 (dari hasil kerja agent Z.ai, diekstrak ke repo sendiri) |
| **Rilis** | push GitHub → ketik `pri-perbarui` di VPS |

## Peta catatan
| Catatan | Isinya |
|---|---|
| [[PRI SuperApp - Tugas Menunggu]] | **Cek ini dulu** kalau ada fitur yang belum jalan |
| [[PRI SuperApp - Arsitektur]] | Bagaimana aplikasi ini dibangun & berjalan |
| [[PRI SuperApp - Modul & Fitur]] | Daftar lengkap fitur per modul |
| [[PRI SuperApp - Peran & Akses]] | Siapa boleh apa — aturan hak akses |
| [[PRI SuperApp - Integrasi & API]] | 15+ layanan luar yang dipakai |
| [[PRI SuperApp - Database]] | Tabel, migrasi, jebakan PostgREST |
| [[PRI SuperApp - Jebakan & Insiden]] | Pelajaran mahal yang jangan diulang |
| [[PRI SuperApp - Cara Rilis]] | Perintah rilis & pemulihan |
| [[PRI SuperApp - Riwayat Rilis]] | Versi & perubahan (otomatis dari kode) |

## Sejarah singkat
- **23 Agu 2026** — lahir sebagai penggabung tiga proyek n8n ([[AUTOMATION QC]],
  [[AUTOMATION TV RAKYAT]], PRI). Deploy pertama ke Vercel.
- **25 Agu** — absensi, laporan kerja, chat, perizinan, tim.
- **26–31 Agu** — QC pindah dari scraping n8n ke [[Ayrshare]]; wajah ([[Luxand]]);
  OTP pindah ke email; TVR Saya lewat [[upload-post]].
- **1–5 Sep** — dashboard TV Nasional, Siaran Serentak, Studio PALUGODAM,
  Pet Robot, Ludo, Mode Simpel.
- **7 Sep** — insiden Supabase lambat → lapisan cache bersama.
- **8–11 Sep** — skrip migrasi VPS, struktur Zona/Sayap/Divisi, detak 10 detik.
- **12 Sep** — **pindah total ke VPS**: database dan aplikasi.
- **13 Sep** — insight per kategori, tarik data [[Chocodata]], kategori "Selesai".
- **14 Sep** — absensi pindah ke [[SADAR]]; SuperApp jadi penampil.

## Ukuran proyek
<!-- otomatis:modul -->
<!-- /otomatis -->

## Terkait
- [[Proyek Claude Code]] — peta semua proyek di komputer ini
- [[AUTOMATION QC]] · [[QC Sosmed - Catatan Teknis]]
- [[AUTOMATION TV RAKYAT]] · [[TV Rakyat Otomasi - Catatan Teknis]]

<!-- otomatis:diperbarui -->
<!-- /otomatis -->
