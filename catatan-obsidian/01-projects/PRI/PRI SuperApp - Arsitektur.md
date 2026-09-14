---
type: project
status: active
area: PRI
tags: [project, pri, superapp, arsitektur]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp.
     Sunting di sini akan tertimpa — ubah di catatan-obsidian/ pada repo. -->

Bagaimana [[PRI SuperApp]] dibangun dan berjalan.

## Susunan di VPS
```
Internet
   │
   ▼
godam-caddy-1  ← container Caddy, pegang port 80/443, atur di /opt/godam/Caddyfile
   │                (BUKAN layanan sistem — lihat Jebakan)
   ├── pri-superapp.com      → pri-aplikasi   (Next.js standalone, 127.0.0.1:3001)
   ├── db.pri-superapp.com   → supabase-envoy (gerbang Supabase)
   └── auto-comment.tech     → situs lain milik user (JANGAN diganggu)

Tumpukan `pri`      : pri-aplikasi · pri-redis · pri-jadwal
Tumpukan `supabase` : supabase-db · -envoy · -pooler · -rest · -auth · -storage
                      · -realtime · -meta · -studio · -imgproxy · -edge-functions
```
Tidak ada port yang terbuka ke internet — semuanya `127.0.0.1`.

**Spesifikasi VPS**: Hostinger KVM 8, Ubuntu, 8 vCPU / 32 GB RAM / 400 GB,
IP `187.77.113.63`, ping ±23 ms dari Indonesia.

## Empat keputusan yang jangan dibalik
1. **Klien Supabase sisi server memakai alamat PUBLIK**, bukan nama dalam
   container. Sebabnya 10 tempat memanggil `getPublicUrl()` lalu **menyimpan
   hasilnya ke database** — alamat dalam akan tersimpan permanen dan tidak
   bisa dibuka siapa pun. Efisiensinya diganti dengan `extra_hosts`
   `db.pri-superapp.com:host-gateway` supaya panggilan tidak keluar internet.
2. **Healthcheck container = `/api/hidup`** (tanpa database), bukan
   `/api/sehat` yang menjawab 503 saat DB bermasalah. Kalau `/api/sehat`
   dipakai Docker, DB ngadat sebentar akan membuat aplikasi restart berulang
   padahal itu tidak memperbaiki apa pun.
3. **Upstash dikosongkan di env.** `klienCache()` memilih Upstash lebih dulu
   daripada `REDIS_URL`; kalau nilainya tertinggal, cache tetap menyeberang
   internet walau Redis lokal sudah jalan.
4. **`next.config.ts` membaca host gambar saat BUILD**, bukan saat jalan.
   Salah di sini = seluruh foto kosong tanpa satu pun galat di log.

## Penjadwal (container `pri-jadwal`)
Pindah dari Vercel mematikan Vercel Cron, dan tugas berkala berhenti
**diam-diam**. Container ini memanggil alamat aplikasi dari jaringan dalam
dengan `Authorization: Bearer $CRON_SECRET`.

| Jadwal | Tugas | Gunanya |
|---|---|---|
| tiap 5 mnt | `sinkron-komen` | tarik komentar sosmed → rekap kepatuhan |
| tiap 5 mnt | `sinkron-absensi` | tarik absensi dari [[SADAR]] |
| tiap 10 mnt | `pantau-server` | deteksi anomali → nyalakan mode hemat |
| tiap 15 mnt | `rekonsiliasi-kpi` | video yang tayang → masuk KPI |
| 23.50 WIB | `rekam-metrik` | satu titik pembanding harian TV Nasional |

> [!warning] Daftar tugas dipanggang ke dalam image
> Menambah tugas baru **wajib** membangun ulang container `jadwal` —
> `pri-perbarui` sudah melakukannya sejak 14 Sep 2026.

## Cara aplikasi menjaga dirinya
**DETAK** — satu endpoint `/api/detak` mengembalikan satu "tanda" global
(gabungan id terbesar dari notifikasi, pengumuman, postingan, laporan video,
feed konten). Dihitung **sekali untuk semua orang** (cache 5 detik). Biaya
server: 5 kueri per 5 detik untuk seluruh aplikasi, berapa pun jumlah
pengguna. Tanda berubah → semua layar menarik ulang.

Penjaganya: hanya saat tab terlihat · jitter ±2 dtk · gagal berturut = mundur
berlipat · diam >3 menit = jeda 30 dtk.

**REM OTOMATIS** — server yang menentukan irama, bukan klien. `/api/detak`
mengukur lama kuerinya sendiri lalu memerintahkan jeda: normal 10 dtk, mode
hemat 30, DB ≥1500 ms 30, DB ≥4000 ms 60. Terbukti bekerja saat kelebihan
beban sungguhan 11 Sep 2026.

**CACHE BERSAMA** — `lib/cache-bersama.ts`: memori proses → Redis bersama →
"single-flight" (permintaan bersamaan untuk kunci sama menunggu satu
perhitungan). Dipakai di rekap, peringkat, juara komen, dashboard, sakelar.

**MODE HEMAT** — sakelar di `pengaturan_sistem` yang bisa dinyalakan pemantau
secara otomatis saat server anomali, atau manual dari Panel Master. Fitur
berat (Ludo, pet di beranda, efek juara, asisten) punya sakelar sendiri.

> [!info] Galat fitur yang dimatikan memakai status **423**, bukan 5xx
> Pembungkus galat menyamarkan pesan 5xx di produksi, jadi pesan
> "fitur dinonaktifkan" tidak akan pernah sampai ke layar kalau memakai 503.

## Penyimpanan video
Tiga generasi hidup berdampingan, dibedakan dari bentuk URL-nya:
- **Bucket Supabase `tvrku`** — jalur produksi saat ini
- **[[Cloudflare R2]]** — dipakai bila env `R2_*` diisi (produksi: tidak)
- **[[Cloudinary]]** — tempat singgah + mesin kompresi >50 MB

Penyapu tanpa cron: berkas dihapus 2 jam setelah tayang (postingan di sosmed
tetap). Absensi lama: foto 7 hari. Bahan video wajib: ikut umur perintahnya.

## Rute & modul
<!-- otomatis:api -->
<!-- /otomatis -->

## Terkait
- [[PRI SuperApp]] · [[PRI SuperApp - Jebakan & Insiden]] · [[VPS Hostinger]]

<!-- otomatis:diperbarui -->
<!-- /otomatis -->
