---
type: platform
category: automation
status: active
pricing: n8n Cloud
tags: [platform, pri, otomasi]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp. -->

## Apa ini & untuk apa
Tempat semua otomasi PRI hidup sebelum [[PRI SuperApp]] ada, dan sampai
sekarang masih menjalankan sebagian:

| Otomasi | Isi | Catatan |
|---|---|---|
| [[QC Sosmed - Catatan Teknis\|QC Sosmed]] | scraping komentar, sinkron roster, bot WhatsApp | sebagian pindah ke SuperApp |
| [[TV Rakyat Otomasi - Catatan Teknis\|TV Rakyat Otomasi]] | repost video otomatis | menggantung |

## Cara kerjanya
Logika hidup sebagai **satu berkas JSON** berisi node visual yang terhubung.
"Deploy" berarti mengimpor JSON itu lewat layar web n8n — tidak ada proses
otomatis, tidak ada git.

**Aturan yang berbeda per workflow:**
- Workflow lama QC (v4, sinkron, bot) punya **pembangun Python** — ubah
  pembangunnya, jangan JSON-nya.
- Workflow QC v5 (yang aktif) **tidak punya** pembangun — kodenya diedit
  langsung dari berkas sumber lalu dipasang ke node.

## Jebakan
> [!danger] Jadwal terlalu rapat memblokir SEMUA workflow
> Pernah terjadi: satu workflow dijadwalkan tiap 1 menit → kuota eksekusi
> habis → seluruh otomasi lain ikut berhenti. Periksa daftar eksekusi dulu
> sebelum mendiagnosis workflow yang "tidak jalan".

- **Zona waktu wajib Asia/Jakarta.** Pernah meleset 7 jam karena kosong.
- Batas waktu satu eksekusi **300 detik** — pekerjaan panjang harus dipotong.
- Workflow lama yang sudah digantikan **jangan diaktifkan lagi** — beberapa
  punya pemicu yang memeriksa setiap menit.

## Autentikasi
- Kredensial disimpan di dalam n8n Cloud, bukan di berkas workflow.
- Kunci rahasia **tidak boleh** ditulis di JSON workflow.

## Project/area terkait
- [[AUTOMATION QC]] · [[QC Sosmed - Catatan Teknis]]
- [[AUTOMATION TV RAKYAT]] · [[TV Rakyat Otomasi - Catatan Teknis]]
- [[PRI SuperApp]] · [[Supabase]]

## Catatan & troubleshooting
> [!warning] Kredensial Supabase di n8n mungkin masih menunjuk server lama
> Database PRI sudah pindah ke [[VPS Hostinger]]. Kalau n8n belum diarahkan
> ke alamat baru, data komentar QC **tidak pernah sampai** ke aplikasi —
> tanpa pesan galat. Lihat [[PRI SuperApp - Tugas Menunggu]].
