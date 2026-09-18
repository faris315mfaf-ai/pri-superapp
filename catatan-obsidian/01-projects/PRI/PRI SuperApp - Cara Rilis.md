---
type: project
status: active
area: PRI
tags: [project, pri, superapp, rilis]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp.
     Sunting di sini akan tertimpa — ubah di catatan-obsidian/ pada repo. -->

## Alurnya
1. Kode diedit → diuji (pemeriksa tipe + lint + build) → commit → **push ke GitHub `main`**
2. GitHub Actions masuk ke VPS dan menjalankan **`pri-perbarui`** sendiri
3. VPS menarik kode terbaru, membangun, mengganti yang jalan; kalau gagal, versi lama dikembalikan otomatis

Deploy manual tetap ada: masuk ke VPS, ketik `pri-perbarui`. Dipakai kalau Actions sedang bermasalah, atau untuk `--tanpa-tarik` setelah ubah kunci.

### Pemasangan sekali (deploy otomatis)
Di VPS:
```
bash /opt/pri/sumber/vps/17-pasang-deploy-otomatis.sh
```
Skrip itu mencetak tiga nilai. Tempel ke GitHub → Settings → Secrets and variables → Actions:
`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.

Uji lewat tab Actions → **Deploy VPS** → Run workflow. Push berikutnya ke `main` men-deploy sendiri. Perubahan hanya catatan/markdown tidak memicu deploy.

## Kalau ada migrasi database
**Selalu `pri-sql` dulu, baru push ke `main`.** Terbalik tidak merusak, tapi
fiturnya akan memberi pesan "jalankan migrasi dulu" sampai dijalankan.

```
pri-sql 53_absensi_sadar.sql
# lalu push ke main — Actions yang menjalankan pri-perbarui
```

## Jaring pengaman `pri-perbarui`
Sebelum membangun, versi yang sedang jalan disimpan sebagai cadangan. Setelah
versi baru dinyalakan, skrip menunggu aplikasi menjawab sampai 2 menit.
**Kalau tidak menjawab: versi lama dipasang kembali otomatis**, catatan galat
ditampilkan. Jadi salah kode tidak pernah berarti aplikasi mati menunggu
seseorang sadar.

Skrip juga memeriksa sendiri apakah gambar bisa dimuat setelah versi baru
menyala — jebakan yang pernah membuat seluruh foto hilang tanpa galat.

Ada jeda beberapa detik saat container diganti. Kalau kelak perlu tanpa jeda
sama sekali, itu butuh dua container bergantian — belum dibuat.

## Perintah di VPS
| Perintah | Gunanya |
|---|---|
| *(otomatis)* | push ke `main` → GitHub Actions → `pri-perbarui` |
| `pri-perbarui` | tarik + bangun + nyalakan (aplikasi & penjadwal), cadangan jika Actions tidak jalan |
| `pri-perbarui --tanpa-tarik` | bangun ulang tanpa menarik (mis. setelah ubah kunci) |
| `pri-sql <berkas.sql>` | jalankan satu migrasi database |

## Skrip pemeriksa & perbaikan
Dijalankan dengan `bash vps/<nama>` dari folder sumber di VPS.

| Skrip | Kapan dipakai |
|---|---|
| `09-periksa-kesehatan.sh` | pemeriksaan menyeluruh: disk, RAM, container, koneksi, cadangan, sertifikat |
| `15-periksa-gambar.sh` | foto tidak muncul |
| `18-periksa-jaringan.sh` | situs tidak bisa dibuka padahal server hidup |
| `14-perbaiki-foto.sh` | alamat foto/berkas salah setelah pindah domain |
| `13-solidkan-database.sh` | merapikan database setelah migrasi |
| `07-cadangan-harian.sh` | memasang cadangan otomatis |
| `08-ganti-domain.sh` | pindah nama domain |

Skrip pemasangan awal (sudah dijalankan, disimpan untuk rujukan):
`01-siapkan-vps` → `02-pasang-supabase` → `10-migrasi` → `11-pasang-aplikasi`.

## Mengubah kunci rahasia
Tidak lewat Git. Edit langsung di VPS:
```
nano /opt/pri/aplikasi/env.txt
pri-perbarui --tanpa-tarik
```

> [!warning] `.env.local` di komputer sendiri TIDAK lengkap
> Beberapa kunci hanya pernah ada di server. Jadi menjalankan aplikasi di
> komputer sendiri tidak bisa menguji semua fitur.

## Vercel — sisa peralihan
Salinan di [[Vercel]] hanya mengalihkan pengunjung ke alamat utama. Di-deploy
**hanya bila diminta**, dengan versi alat yang dikunci:
```
npx vercel@59.11.7 --prod --yes --archive=tgz
```
Versi terbaru alat itu tidak membaca sesi login lama — akan mengira belum
login padahal sudah.

## Kalau ganti komputer
```
git clone https://github.com/faris315mfaf-ai/pri-superapp.git
npm install
```
Yang **tidak** ikut GitHub dan harus disalin manual: `.env.local` (kunci) dan
keystore APK. Jangan dikirim lewat chat.

## Membuat APK
> [!danger] Ikon diunduh dari alamat live, bukan dari berkas lokal
> Kalau logo diganti tapi belum di-deploy, APK akan berisi logo **lama** —
> tanpa pesan galat apa pun. Deploy dulu, baru bangun APK.

## Terkait
- [[PRI SuperApp]] · [[PRI SuperApp - Tugas Menunggu]] · [[PRI SuperApp - Riwayat Rilis]] · [[VPS Hostinger]]

<!-- otomatis:diperbarui -->
<!-- /otomatis -->
