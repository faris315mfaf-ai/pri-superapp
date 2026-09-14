---
type: project
status: active
area: PRI
tags: [project, pri, superapp, akses]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp.
     Sunting di sini akan tertimpa — ubah di catatan-obsidian/ pada repo. -->

Siapa boleh apa di [[PRI SuperApp]]. Aturan ini menyentuh puluhan gerbang di
server — salah satu terlewat = kebocoran hak akses.

## Peran (kolom `role`)
| Peran | Keterangan |
|---|---|
| `anggota` | bawaan |
| `ketua` | bisa membentuk tim |
| `super_admin` | **otomatis** dari jabatan "Ketua Umum" — bukan dipilih |
| `superadmin` | akun tersembunyi id 251, dashboard & konten penuh |
| `master` | kuasa tertinggi, tersembunyi dari daftar anggota |

Peran `admin_hr` dan `admin_tv` **sudah tidak ada** sejak 30 Agu 2026 — hanya
tersisa sebagai label akun lama.

> [!important] Ketua Umum = super admin, otomatis
> `lib/sesi.ts` menaikkan pemegang jabatan "Ketua Umum" menjadi `super_admin`
> untuk seluruh aplikasi. Peran di database tetap anggota/ketua; yang berubah
> hanya hak efektifnya. **Inilah sebabnya jabatan sayap punya kolom sendiri**
> (lihat di bawah).

## Kuasa yang datang dari DIVISI, bukan peran
- **Divisi HR** → setara admin HR lama. ±13 endpoint HR memeriksa
  `adalahHR(user)`, dan HR Center hanya untuk Divisi HR.
- **Divisi TV Rakyat** → boleh unggah & ACC video Official, tanpa penunjukan.
- **Divisi PALUGODAM** → Studio, ACC ajuan komentar, kendali akun.

## Jabatan partai (11)
Ketua Umum · Wakil Ketua Umum · Sekjen · Wakil Sekjen · Bendahara Umum ·
Wakil Bendahara Umum · Direktur Eksekutif · Wakil Direktur Eksekutif ·
Kepala Sekretariat · Ketua HRD · Pimpinan Redaksi TV Rakyat.

**Semua pemegang jabatan otomatis mendapat dashboard penuh.** Enam jabatan
puncak otomatis mendapat Asisten AI.

> [!warning] Kalau memanggil aturan akses, kirim USER UTUH
> `bolehDashboard()` menerima `{role, jabatan}`. Mengirim hanya `user.role`
> membuat aturan jabatan **tidak berlaku** — dan itu gagal diam-diam.

## Struktur: Zona · Sayap · Divisi
Disimpan di kolom `divisi` + `sub_divisi`. Zona dan Sayap adalah divisi
bersubkategori. Gelar dirakit otomatis: "Kepala Zona Sumatera", "Sayap PERI".

**Jabatan sayap punya kolom terpisah** (`jabatan_sayap`) dengan 6 jabatan yang
namanya **identik** dengan jabatan DPP. Kalau ditumpangkan ke kolom `jabatan`,
Ketua Umum sayap akan langsung menjadi penguasa seluruh aplikasi lewat aturan
di atas. Dengan kolom terpisah hal itu mustahil, bahkan bila kelak ada aturan
baru yang lupa membedakan. Ketua Umum sayap **berhak dashboard**, tanpa
pengaruh apa pun di DPP.

**Struktur ganda** — satu orang boleh punya sampai 4 struktur (mis. Zona Jawa
Barat sekaligus Divisi HR). Struktur pertama tetap di kolom lama (nol migrasi
data); tambahannya di kolom `struktur_lain`.

## Modul per akun
Master bisa membuka/menutup modul per akun (`modul_izin`): dashboard, qc, tv,
tvrku, chat, asisten, acara. Ditegakkan di navigasi **dan** di gerbang server.

## Mode Developer — backdoor yang disengaja
> [!danger] Password-nya "1", dan tombolnya terlihat semua orang
> Tombol "developer mode" di layar masuk membuka impersonasi sesi — bisa
> menjadi peran/jabatan/divisi apa pun **hingga Ketua Umum**, di produksi.
> User memilih ini secara sadar dan menerima risikonya. Data akun asli tidak
> berubah; keluar = sesi dihapus.
>
> Kalau mau lebih aman: ganti kata sandinya jadi rahasia panjang, atau
> sembunyikan tombolnya. **Jangan dihapus tanpa diminta.**

Catatan serupa: akun `superadmin` (id 251) bersandi lemah "12345678" atas
permintaan user, dan akun `adminpalugodam` (id 226) bersandi 8 digit.

## Kelemahan lama yang belum dibereskan
Notifikasi ke HR masih memakai pola peran lama `["admin_hr","super_admin",
"master"]`. Orang Divisi HR yang berperan `anggota` **tidak** menerima push —
mereka tetap melihatnya di dalam aplikasi.

## Terkait
- [[PRI SuperApp]] · [[PRI SuperApp - Modul & Fitur]] · [[PRI SuperApp - Jebakan & Insiden]]

<!-- otomatis:diperbarui -->
<!-- /otomatis -->
