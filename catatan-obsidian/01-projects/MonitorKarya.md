---
type: project
status: active
area: karier
started: 
due: 
tags: [project, monitorkarya]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp.
     Sunting di sini akan tertimpa — ubah di catatan-obsidian/ pada repo. -->

## Tujuan
Aplikasi pemantauan karya — pekerjaan dicatat beserta **berkas buktinya**.
Terpisah penuh dari [[PRI SuperApp]]: database sendiri, akun sendiri, repo
sendiri.

## Konteks
- **Folder**: `C:\Users\Admin\monitor-karya`
- **Teknologi**: Next.js + Prisma + Supabase (proyek Supabase **sendiri**,
  berbayar ±$10/bulan — bukan yang dipakai [[AUTOMATION QC]])
- **Status**: baru satu sesi Claude Code. Belum ada catatan rilis atau
  produksi — perlakukan sebagai proyek yang masih dibangun.

## Keputusan yang sudah diambil
- **Login tidak memakai Supabase Auth.** Dibuat sendiri: sandi di-hash
  dengan scrypt, sesi lewat cookie ber-HMAC, disimpan di tabel `User`
  milik Prisma. Disengaja, bukan kelalaian — jangan "diperbaiki" jadi
  Supabase Auth tanpa membicarakannya dulu.
- **Berkas bukti disimpan di bucket Supabase privat**, hanya bisa diraih
  dari sisi server memakai service role, lalu disajikan lewat tautan
  bertanda tangan yang berumur 5 menit. Tidak ada bucket publik.
- **Skema database dikelola Prisma**, migrasinya dijalankan lewat MCP.

## Jebakan yang sudah memakan korban
> [!danger] `git checkout` bisa menghapus `.env`
> Di repo ini `.env` pernah ikut terlacak git. Berpindah commit/branch
> membuat git menimpa `.env` lokal lalu menghapusnya — tanpa peringatan,
> karena sekarang berkas itu diabaikan. Periksa dulu:
> `git ls-tree <tujuan> -- .env` sebelum checkout atau merge.

- Terminal di komputer ini **PowerShell tanpa bash**. Perintah untuk
  dijalankan sendiri harus bentuk PowerShell, bukan bash.

## Terkait
- [[Proyek Claude Code]] · [[Supabase]]

<!-- otomatis:diperbarui -->
<!-- /otomatis -->
