---
type: project
status: active
area: PRI
tags: [project, pri, superapp, fitur]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp.
     Sunting di sini akan tertimpa — ubah di catatan-obsidian/ pada repo. -->

Daftar lengkap apa saja yang bisa dilakukan [[PRI SuperApp]], per modul.

## Beranda
Ringkasan harian: target KPI, kehadiran hari ini, kepatuhan komentar, streak
🔥 harian, pengumuman, teks berjalan juara komentar periode lalu.
- Anggota **tanpa jabatan** melihat beranda sederhana (`BerandaSimpelGlass`):
  pintasan Pengumuman & Leaderboard, 4 ubin, 6 modul, tombol Chat Admin WA.
- Pemegang jabatan melihat beranda pengurus dengan kartu ringkasan.
- Ketua Umum **tidak** melihat kartu KPI/absensi — bukan objek penilaian.
- Robot AI melayang (bisa diseret, posisinya diingat) untuk master/super admin.

## Absensi → penampil [[SADAR]]
Sejak 14 Sep 2026 SuperApp **tidak lagi mencatat absen**. Dua tampilan:
- **Absensi SuperApp** — cerminan yang sudah dicocokkan ke akun: jam masuk/
  pulang, tepat waktu/telat (batas 09:15 WIB), izin SuperApp.
- **Absensi SADAR** — isi mentah dari SADAR per tanggal, bisa mundur 62 hari;
  HR melihat semua orang + saringan hadir/sakit/izin/alfa/**belum cocok**.

Pengajuan **izin/sakit dengan surat** (bucket privat) + antrean persetujuan
atasan/HR **tetap di SuperApp**. Rekap absensi → PDF → bisa dikirim WhatsApp.

## TV Rakyat Official
Modul tim redaksi:
- **Video Wajib** — perintah video untuk seluruh anggota, lengkap dengan
  **berkas bahan yang diunggah langsung** (sejak 13 Sep 2026, menggantikan
  fitur Request Video) + kolom sumber video + kategori + batas waktu.
- **Kategori wajib** (`keyword_wajib`) — tiap video harus punya kategori.
  Kategori **tidak bisa dihapus** (laporan lama merujuknya); hanya bisa
  dinonaktifkan sementara atau ditandai **Selesai** (acara usai — kreator
  tidak bisa mengunggah lagi, datanya tetap tampil).
  Ada kategori tetap **"Video Sendiri"** yang hidup di kode, tak bisa hilang.
- Unggah video manual, pipeline render, riwayat, pengaturan tim.
- Wewenang: seluruh anggota Divisi TV Rakyat (sejak 2 Sep 2026 tanpa
  penunjukan Pimred).

## TV Rakyat Nasional
Dashboard angka gabungan — **hanya dashboard**, kendali produksinya tetap di
Official supaya tidak ada dua "tempat resmi" yang berbeda.
- **Kenaikan nasional** — hari ini, kemarin, sepekan, sebulan (butuh rekaman
  harian dari cron `rekam-metrik`).
- **Insight per kategori** — ringkas, lalu **halaman penuh**: kartu embed
  video dipisah per sosial media, tiap kartu membawa angkanya (tayangan,
  suka, komentar, dibagikan, favorit, durasi) + total & rata-rata tayangan.
  Embed dimuat saat diminta — puluhan iframe sekaligus melumpuhkan ponsel.
- **Tarik data** per kategori lewat [[Chocodata]] (6 sosmed), berpotongan
  supaya tidak melewati batas waktu.
- **Tambah link batch** — tempel banyak link sekaligus, ganda dibuang, yang
  ditolak dilaporkan per baris beserta alasannya.

## TVR Saya (TV Rakyat pribadi anggota)
- **Unggah ke sosmed sendiri** lewat [[upload-post]] — 6 platform, jadwal
  5 menit–7 hari, caption berbeda per platform.
- **KPI video**: aturan **5 video × 6 sosmed** per hari, ketat per platform.
  100% ⇔ tercapai. Unggahan lewat aplikasi **otomatis** jadi laporan KPI.
- **Laporan link manual** sebagai cadangan (untuk yang posting di luar aplikasi).
- **Rangkuman Link Harian** — laporan per sosmed siap salin/bagikan WhatsApp.
- **Permohonan sosmed terblokir** (bebas KPI, butuh ACC HR).
- **Siaran Serentak** (master) — satu video sekali klik ke belasan profil.
- **Studio PALUGODAM** — lihat bagian sendiri di bawah.

## Studio PALUGODAM
Jalur produksi otomatis untuk Divisi PALUGODAM, tiga fase:
1. **Unggah** — tempel link TikTok/IG, [[TikHub]] mengambil videonya tanpa
   watermark, disimpan ke penyimpanan sendiri.
2. **Render** — [[DeepSeek]] menulis judul/highlight/caption, [[Creatomate]]
   menempelkannya sebagai overlay ke video.
3. **Siaran** — hasilnya dikirim ke profil-profil [[upload-post]].

Aturan **1 anggota = 1 profil + 1 template**, ditautkan admin di tab
"Anggota & Template". Ada **mode per akun** (link/caption/judul sendiri tiap
akun) dan **satu klik** AUTO EDIT / AUTO UPLOAD. Render tidak menunggu semua
akun — yang belum lengkap dilewati, bisa menyusul.

## QC / HR Center
- **Kepatuhan komentar** — tiap kader wajib minimal 1 komentar di setiap
  postingan akun wajib, dalam jendela **19:00 → 18:59 WIB**.
- **Leaderboard Kepatuhan Komen** per sosmed.
- **Ajuan komentar** — kalau sistem tak membaca komentar seseorang, siapa pun
  bisa mengajukan (atas nama sendiri atau orang lain), di-ACC Divisi PALUGODAM.
- **Database Anggota** — tabel dengan cari/urut, ganti sandi, chat WA langsung,
  tetapkan zona, tab Akun Tertaut, dan **Pencocokan [[SADAR]]**.
- **Absensi Hari Ini** — filter status × keterlambatan × divisi × zona + grafik.
- **Setel KPI**, **ACC KPI** (dimatikan sejak 12 Sep — laporan langsung dihitung).
- **Kelola Pengguna**, **Kirim Pengumuman** (bisa sekalian ke WhatsApp).

## Dashboard
Enam sub-dashboard + Ringkasan Utama: absensi, KPI anggota (2 tab + 4 grafik
+ detail per orang), kepatuhan komen, analitik TV Rakyat, TV Nasional,
kelengkapan data anggota. Semua pemegang jabatan otomatis mendapat akses penuh.

## Chat
Percakapan berpasangan (harus di-accept dulu), grup, **penanda online**
(menumpang detak — nol permintaan tambahan), notifikasi push, streak
berpasangan, robot menyapa di profil.

## Asisten AI
Teks & **suara langsung** (Gemini Live) dengan robot berwajah. Ketua Umum,
super admin, dan master mendapat **mode akses penuh**: AI bisa mengirim
notifikasi, pengumuman, chat grup, dan membaca detail anggota. Semua aksi
AI tercatat di log audit. Master bisa melatih AI dengan berkas `.txt`.

## Permainan (percobaan)
- **Pet Robot** — POU-style: rawat robot, 3 toko × 30 item, hewan robot
  (kucing/anjing/kapibara, tumbuh 3 tahap), 40+ aksesoris, skin musiman,
  pasar trading, lobi realtime layar penuh. Pemegang jabatan: pet mati.
- **Ludo Robot** — papan 2,5D multipemain. **Saat ini dimatikan** lewat
  sakelar `fitur_ludo`.
- **Koin** — didapat dari upload video, laporan, absen, chat, juara komen,
  daftar akun sosmed, login harian, komentar video. Ada leaderboard koin.

## Mode Simpel
Halaman `/simpel` yang sangat ringan untuk HP lemah: tanpa animasi, tanpa
robot, tanpa polling. Penanda per perangkat, tombol petir di semua modul.

## Lainnya
Acara/kalender, Laporan Kerja (rencana pagi → laporan sore → KPI), Perizinan,
Tim & atasan, Notifikasi + push, Pengumuman berjenjang, Tur pemandu,
Panel Master (metrik server, token AI, sakelar fitur, ekspor TXT untuk AI,
buat akun, ambang akurasi wajah).

## Terkait
- [[PRI SuperApp]] · [[PRI SuperApp - Peran & Akses]] · [[PRI SuperApp - Integrasi & API]]

<!-- otomatis:diperbarui -->
<!-- /otomatis -->
