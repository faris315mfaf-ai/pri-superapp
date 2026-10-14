# Ruang Bot jadi ruang komunal pengguna (tahap 1 KHUSUS MASTER sudah dibangun 14 Okt 2026)

Dicatat 14 Okt 2026 dari arahan pemilik. Ini RENCANA; yang sudah ada hari ini: gedung empat ruang
untuk bot Redaksi (lihat `BOT-REDAKSI-DUNIA.md`). Satu ruang, banyak orang: Ruang Bot berubah dari
"kantor bot Redaksi" menjadi tempat berkumpul seluruh pengguna aplikasi.

## Arahan pemilik (apa adanya)
1. **Ruang seperti pertemuan.** Pengguna yang login dan online otomatis muncul di ruangan. Aktivitas
   karakter di ruangan ditentukan oleh apa yang sedang dilakukan pengguna itu.
2. **Ruang database** yang terhubung dengan ruang utama. Dipakai saat pengguna mengunggah video atau
   menambah stok video: selama proses upload, karakternya terus beranimasi seperti mengisi berkas ke
   rak-rak penyimpanan.
3. **Animasi alat**: saat pengguna memakai Auto Edit, alat kompres video, atau alat blur watermark.
4. **Upload ke sosmed = proses paling ramai.** Saat pengguna mengunggah ke sosmed, karakter
   meletakkan sesuatu ke **kotak post** (kotak pos) di ruangan; animasikan dengan itu.
5. **Lebih dari 100 karakter acak.** Setiap pengguna yang login mendapat karakter, tidak ada yang kembar.
   Di atas nama ada **waktu**; info di atas karakter = informasi **realtime** dari pengguna superapp.
6. **Seluruh proses wajib realtime**, berdasarkan apa yang dilakukan pengguna, lalu dianimasikan.

## Pemetaan ke yang sudah ada (untuk perencanaan)
- Gedung empat ruang + simulasi + kanvas: `src/features/ruang-bot/` (denah, simulasi, dunia-gambar).
- Realtime: topik `bot-ruang` lewat `src/lib/realtime-server.ts` / `realtime-klien.ts`; presence/online
  pengguna: belum diperiksa (cari mekanisme "online" yang sudah ada sebelum membuat baru).
- Sumber peristiwa yang harus dipancarkan: login/online, upload video & stok (Stok Video, `/api/tv/*`),
  Auto Edit (`/api/autoedit`), alat kompres, alat blur watermark, unggah sosmed (`/api/tv/unggah`).
- Karakter bot Redaksi (Raka/Sinta/Dimas/Nara) tetap ada; karakter pengguna menjadi penghuni tambahan.

## Hal yang perlu diputuskan sebelum membangun
- **Siapa boleh melihat ruangan.** Hari ini hanya master (`bolehRuangBot`). "Semua pengguna yang
  login muncul" berarti aktivitas orang terlihat orang lain: tentukan audiens (semua anggota? satu
  divisi? master saja) dan info apa yang boleh tampil (nama, aksi umum vs judul video/akun sosmed).
- Pemetaan pengguna -> karakter (tetap per akun, dihasilkan dari id, tanpa kembar; >100 rupa).
- Beban realtime bila banyak pengguna online sekaligus (batasi jumlah karakter di kanvas, dst).
- Peristiwa dipancarkan dari server (tidak percaya klien) dengan payload minimal.

## Keputusan pemilik (14 Okt 2026) & yang sudah dibangun
- **Khusus master**, informasi **lengkap**: nama, divisi, aksi, judul video, akun sosmed.
- **Presence = yang sedang online/membuka aplikasi** (kehadiran detak `lib/kehadiran`, ±60 dtk), bukan yang sekadar login.
- Dibangun: sayap penghuni (aula + ruang database/rak + ruang alat + ruang pos/kotak post), 288 rupa karakter unik,
  aksi nyata dari server (`lib/dunia*.ts`, `GET /api/bot/dunia`, `POST /api/aktivitas`), animasi realtime
  (topik `dunia-ruang`), panel "Sedang online". Penjelasan teknis: bagian "Penghuni (pengguna online)" di
  `BOT-REDAKSI-DUNIA.md`.
- Belum: tampilan untuk non-master (menunggu keputusan audiens & privasi), animasi untuk aksi di luar daftar
  `JENIS_AUDIT` (mis. membuka layar tertentu hanya tampil sebagai teks), hitungan "waktu" di atas nama sudah
  memakai: lama aksi (m:ss) bila berjalan, jam selesai (WIB) bila baru selesai, jam WIB sekarang bila tidak ada aksi.
