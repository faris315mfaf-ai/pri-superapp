# Mockup dari kode PRI SuperApp

Pratinjau lokal **komponen aplikasi yang sudah ada**, memakai data contoh. Tidak memerlukan `.env` atau login. Versi terbaru menampilkan komponen eksperimen `src/features/beranda/beranda-faris.tsx` yang juga dipasang pada jalur beranda akun `faris`.

Layar yang tersedia: Beranda Faris (`BerandaFaris`), beranda pengguna lama (`BerandaSimpelGlass`), referensi beranda master (`DashboardScreen`), TVR Saya (`TvrKuScreen`), dan TV Rakyat Official (`TvScreen`). Navigasi memakai `SideNav`, `Dock`, dan `BottomNav` asli. Latar dan tema memakai `MeshBackground`, `useLatarApple`, dan `src/app/globals.css` asli. Bilah di luar aplikasi menyediakan pemilih layar, tema Pagi/Sore/Malam/Classic, dan lebar desktop/tablet/HP.

## Jalankan dari akar repo

```sh
node docs/mockups/kode-asli/build.mjs
python3 -m http.server 4176 --bind 127.0.0.1 --directory docs/mockups/kode-asli/dist
```

Buka http://127.0.0.1:4176/. Bangun ulang setelah sumber aplikasi berubah. Hasil build di `dist/` diabaikan Git.

## Batas pratinjau

- Identitas, angka, daftar video, pengumuman, dan akun sosmed adalah data contoh di `fixtures.js`. Identitas contoh memakai peran anggota; pilihan referensi master memakai identitas lokal terpisah.
- `entry.jsx` mengimpor komponen produksi secara langsung. Daftar navigasi dibatasi pada tiga layar pratinjau.
- Semua `fetch` dijawab di memori; mutasi ditolak dengan pesan pratinjau, kecuali preferensi tampilan lokal. CSP `connect-src 'none'` memblokir transport jaringan dari halaman aplikasi. Server statis hanya menyajikan folder hasil build.
- Berkas video contoh tidak disertakan. Thumbnail memakai ilustrasi tutorial yang sudah ada di repo. Pemutaran, render, unduh, dan posting sungguhan tidak dijalankan.
- Adaptor `next/image`, `next/dynamic`, `next/link`, dan `next/navigation` memungkinkan komponen dirender tanpa server Next. Optimasi gambar dan routing Next tidak disimulasikan.
- Font disalin dari cache build Next lokal bila tersedia; jika tidak tersedia, font cadangan browser digunakan. Tidak ada font eksternal yang diunduh.
- Pratinjau dapat menampilkan perilaku/batasan tampilan dari kode saat ini; aksi yang hanya menampilkan pesan pratinjau (misalnya profil dan absensi) tersedia sebagai navigasi asli ketika kode dijalankan di aplikasi Next.


## Eksperimen Faris (6 Oktober 2026)

- `dashboardEksperimen` membatasi desain baru ke username `faris`, pada cabang beranda anggota/ketua. Akun lain tetap memakai beranda sebelumnya.
- Komponen baru menggunakan layanan KPI video, absensi pribadi, komentar pribadi, streak, dompet, dan pengumuman yang sudah ada. Matriks izin dan sakelar komentar tetap diperiksa. Tidak memanggil API dashboard master.
- Pintasan TV Official dan Dashboard hanya muncul bila tab tersebut tersedia. Stok Video, Edit Otomatis, Hubungkan TV Rakyat, dan unggahan memakai mekanisme `gulirKe` TVR Saya.
- Dompet kini memuat saldo saat pertama dipasang, selain penyegaran berkala yang sudah ada.
- Diverifikasi: TypeScript, ESLint berkas sumber yang diubah, build produksi, gerbang username, tampilan desktop/HP/tablet dan mode malam. Tidak ada migrasi database atau perubahan peran.
- Gambar hasil: `../faris-dashboard.png`. Produksi belum diperbarui; commit/push menunggu izin sesuai dokumen serah-terima.
