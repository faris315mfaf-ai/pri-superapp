---
type: project
status: active
area: PRI
tags: [project, pri, qc, n8n]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp.
     Sunting di sini akan tertimpa — ubah di catatan-obsidian/ pada repo.
     Catatan milik sendiri ada di [[AUTOMATION QC]] — yang itu bebas disunting. -->

Sisi teknis dari [[AUTOMATION QC]]: memverifikasi apakah kader sudah
like/komen di akun Instagram wajib.

## Aturan bisnisnya
- **Periode**: 19:00 WIB sampai 18:59 WIB hari berikutnya (dulu 17:00, dulu
  lagi 00:00 — label lama tetap terbaca supaya riwayat tidak putus)
- **Kewajiban**: tiap kader aktif wajib **minimal 1 komentar di SETIAP
  postingan** akun wajib dalam periode itu. Komen dianggap otomatis like.
- **Tidak ada penghapusan permanen** — data master hanya ditandai nonaktif,
  supaya rekap lama tidak berubah angkanya.

## Di mana logikanya hidup sekarang
Awalnya seluruhnya di n8n. Sekarang **terbelah dua**:

| Bagian | Tempat |
|---|---|
| Tarik komentar & rekap kepatuhan | [[PRI SuperApp]] — dijadwalkan tiap 5 menit di server |
| Leaderboard Kepatuhan Komen, ajuan komentar | [[PRI SuperApp]] |
| Sinkron roster dari Google Sheets | n8n |
| Bot WhatsApp `/rekap`, `/kepatuhan` | n8n (lewat Fonnte) |

> [!warning] `CLAUDE.md` di folder handoff sudah usang
> Dokumen itu menulis **Apify** sebagai scraper. Yang aktif sekarang
> **TikHub** (workflow v5), bukan Apify v4. Siapa pun — termasuk AI — yang
> membaca dokumen itu apa adanya akan mendiagnosis masalah ke arah yang salah.

## Berkas penting
`…\nama-project-kamu\Proyek_QC_Sosmed_ClaudeCode\handoff\`
- `n8n_workflows/` — 3 workflow JSON siap impor
- `n8n_tools/` — pembangun & validator Python. **Ubah di sini**, jangan
  menyunting JSON workflow langsung.
- `sql/` — skema Supabase
- `docs/ARSITEKTUR.md`, `docs/STATUS.md`

## Cara kerja yang dipertahankan
- Antar-node berkomunikasi lewat penyimpanan statis workflow, bukan
  `$('NamaNode')` — kecuali satu pengecualian yang disengaja
- Tiap pengiriman ke database adalah *upsert* dengan kunci unik, dan
  payload-nya dibersihkan dari kunci ganda dulu
- Zona waktu workflow **wajib** `Asia/Jakarta` — pernah meleset 7 jam

## Kunci & akses
Lihat [[AUTOMATION QC]]. Kunci rahasia **tidak ditulis di vault** —
sempat bocor dan sudah dirotasi 14 Sep 2026.

## Catatan ingatan Claude untuk proyek ini
<!-- otomatis:ingatan:qc-sosmed -->
<!-- /otomatis -->

## Terkait
- [[AUTOMATION QC]] · [[PRI SuperApp]] · [[Supabase]] · [[Proyek Claude Code]]

<!-- otomatis:diperbarui -->
<!-- /otomatis -->
