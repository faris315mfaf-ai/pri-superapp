# PROMPT UNTUK Z-AI — PRI SUPERAPP (Mobile Android, React)

> Copy SELURUH isi di bawah garis ini, paste ke z.ai sebagai satu prompt.
> Jangan dipotong — bagian "ATURAN OUTPUT" di akhir yang bikin hasilnya gampang diintegrasikan ke Supabase nanti.

---

Bangun sebuah **aplikasi mobile superapp** bernama **PRI SuperApp** menggunakan **React + TypeScript + Vite**, dioptimasi untuk tampilan **mobile Android (viewport 360–430px)**. Ini adalah prototype UI/UX dengan **data dummy penuh** — belum ada backend asli. Fokus utama: tampilan yang sangat menarik, modern, dan enak dipakai satu tangan.

## 1. IDENTITAS & KONSEP VISUAL

**Nama aplikasi:** PRI SuperApp
**Sub-judul:** Pusat Kendali Digital Partai Rakyat Indonesia

**Gaya desain WAJIB: Glassmorphism penuh.**
- Semua kartu, panel, modal, bottom sheet, dan navigation bar memakai efek kaca: `backdrop-filter: blur(20px)`, background semi-transparan, border tipis 1px semi-transparan putih, dan shadow lembut berlapis.
- Latar belakang aplikasi memakai **mesh gradient** yang bergerak sangat pelan (animasi 20–30 detik, `prefers-reduced-motion` dihormati) — beberapa blob warna besar yang blur berat, sehingga efek kaca di atasnya benar-benar terlihat.
- Setiap kartu punya highlight tipis di tepi atas (inner border gradient) supaya terasa seperti kaca sungguhan, bukan sekadar kotak transparan.

**Palet warna:**
- Primary (merah PRI): `#DC2626` — dipakai untuk aksi utama, aksen aktif, dan identitas partai
- Secondary (emas): `#F59E0B` — dipakai untuk highlight, badge peringatan, dan status "menunggu"
- Success: `#10B981` (sudah komentar / sukses / selesai)
- Danger: `#EF4444` (belum komentar / gagal)
- Info: `#3B82F6` (proses berjalan)

**Mode Terang (Light):**
- Background base: `#F1F5F9` dengan mesh gradient blob warna merah muda, oranye lembut, dan biru pucat
- Permukaan kaca: `rgba(255,255,255,0.65)`, border `rgba(255,255,255,0.9)`
- Teks utama: `#0F172A`, teks sekunder: `#64748B`

**Mode Gelap (Dark):**
- Background base: `#0B1120` dengan mesh gradient blob merah tua, ungu gelap, dan biru malam
- Permukaan kaca: `rgba(30,41,59,0.55)`, border `rgba(148,163,184,0.18)`
- Teks utama: `#F1F5F9`, teks sekunder: `#94A3B8`

**Toggle tema:** Tombol matahari/bulan di header setiap halaman, dengan animasi transisi halus (crossfade + rotate ikon). Pilihan tema disimpan di state aplikasi. **Kedua tema harus sama-sama indah** — jangan sekadar membalik warna; efek kaca di mode gelap harus tetap terbaca.

**Tipografi:** Pakai Google Fonts — `Plus Jakarta Sans` untuk judul/heading (weight 600–800) dan `Inter` untuk teks isi (weight 400–600). Angka statistik pakai `font-variant-numeric: tabular-nums`.

**Bahasa antarmuka: Bahasa Indonesia sepenuhnya.** Semua label, tombol, pesan error, dan teks kosong (empty state) dalam Bahasa Indonesia yang natural, bukan hasil terjemahan kaku.

## 2. STRUKTUR NAVIGASI & PERAN

Aplikasi punya **3 peran (role)** yang menentukan halaman apa saja yang bisa diakses:

| Peran | Kode role | Akses |
|---|---|---|
| Super Admin | `super_admin` | SEMUA halaman: Dashboard Utama + Modul QC Konten + Modul Otomatisasi TV Rakyat |
| Admin HR | `admin_hr` | Hanya Modul QC Konten Sosmed |
| Admin TV Rakyat | `admin_tv` | Hanya Modul Otomatisasi Video TV Rakyat |

**Bottom navigation bar (glassmorphism, mengambang di atas konten dengan margin bawah)** — isinya menyesuaikan role:
- `super_admin`: Beranda · QC Konten · TV Rakyat · Notifikasi · Profil (5 tab)
- `admin_hr`: QC Konten · Notifikasi · Profil (3 tab)
- `admin_tv`: TV Rakyat · Notifikasi · Profil (3 tab)

Tab aktif ditandai dengan pill glassmorphism berwarna merah primary di belakang ikon, dengan animasi slide saat berpindah tab.

## 3. HALAMAN LOGIN (halaman pertama)

Layar penuh dengan mesh gradient bergerak sebagai latar. Di tengah, satu kartu kaca besar berisi:

1. Logo lingkaran (inisial "PRI" dengan gradient merah-emas) + nama aplikasi + sub-judul
2. Input **Email** dan **Kata Sandi** — field bergaya kaca, dengan ikon di kiri, dan tombol mata untuk lihat/sembunyikan sandi
3. Checkbox "Ingat saya" + tautan "Lupa kata sandi?"
4. Tombol **Masuk** — lebar penuh, gradient merah, dengan animasi loading (spinner + teks "Memverifikasi...") selama 1,2 detik sebelum masuk
5. Di bawahnya, satu panel kaca kecil berlabel **"Akun Demo"** berisi 3 tombol pintas yang langsung mengisi form dan login:
   - Super Admin — `super@pri.id`
   - Admin HR — `hr@pri.id`
   - Admin TV Rakyat — `tv@pri.id`
   (semua kata sandi: `demo123`)
6. Toggle tema terang/gelap di pojok kanan atas layar

Setelah login berhasil, tampilkan **splash transisi singkat** (0,8 detik) berisi sapaan "Selamat datang, [Nama]" lalu masuk ke halaman sesuai role.

Validasi form: kalau email kosong atau format salah, tampilkan pesan merah di bawah field ("Email tidak boleh kosong" / "Format email tidak valid"). Kalau kredensial salah, guncang (shake) kartu login dan tampilkan "Email atau kata sandi salah".

## 4. HALAMAN DASHBOARD UTAMA (khusus Super Admin)

Halaman ini adalah ringkasan menyeluruh dari kedua modul. Susunannya dari atas ke bawah:

**a) Header sapaan**
"Selamat pagi/siang/sore/malam, Ris" (menyesuaikan jam perangkat) + tanggal hari ini format Indonesia lengkap ("Minggu, 23 Agustus 2026") + avatar bulat di kanan + ikon lonceng notifikasi dengan badge angka merah.

**b) Baris 4 kartu KPI (grid 2×2, kartu kaca kecil)**
Setiap kartu berisi: ikon, angka besar, label, dan indikator tren (panah naik/turun + persentase vs kemarin, warna hijau/merah).
1. **Tingkat Kepatuhan Hari Ini** — `78%` (naik 5%)
2. **Postingan Dipantau** — `12` (naik 3)
3. **Kader Belum Komentar** — `27` (turun 8)
4. **Video Diproses Hari Ini** — `5` (naik 2)

**c) Grafik tren kepatuhan 7 hari terakhir**
Area chart bergaya glassmorphism: garis merah primary dengan gradient fill merah memudar ke transparan, grid halus, titik endpoint diberi penekanan (lingkaran + label angka). Sumbu X: nama hari singkat (Sen, Sel, Rab...). Sumbu Y: 0–100%. Data dummy: 62, 71, 68, 75, 80, 73, 78.

**d) Kartu "Kepatuhan per Akun Wajib"**
Bar horizontal untuk 3 akun, masing-masing menampilkan nama akun, bar progress bergaya kaca, dan persentase:
- `@dpp.pri` — 82%
- `@muhammad.nazaruddin_` — 76%
- `@tvrakyat.official` — 71%

**e) Kartu "Status Pipeline Video TV Rakyat"**
Donut chart kecil + legenda: Menunggu Doksli `3`, Sedang Diproses `1`, Sudah Diposting `8`, Gagal `1`.

**f) Kartu "Peringkat Kader Teraktif"**
Daftar 5 teratas dengan avatar inisial, nama, jumlah komentar, dan medali emas/perak/perunggu untuk 3 teratas.

**g) Panel "Akses Cepat"**
Dua tombol kaca besar dengan ikon: "Buka Modul QC Konten" dan "Buka Otomatisasi TV Rakyat".

**h) Feed "Aktivitas Terbaru"**
Timeline vertikal 6 item terakhir dengan titik warna sesuai jenis aktivitas dan waktu relatif ("5 menit lalu", "1 jam lalu"). Contoh isi: "Analisis QC selesai — 12 postingan diperiksa", "Video 'Banjir Bekasi' berhasil diposting ke Instagram", "3 kader baru ditambahkan ke roster".

## 5. MODUL QC KONTEN SOSMED (Admin HR + Super Admin)

Ini modul paling penting. Alurnya berlapis: **Halaman utama → Detail akun → Detail postingan → Aksi WhatsApp.**

### 5a. Halaman Utama Modul QC

**Header periode:** Tampilkan label periode aktif dengan format khas sistem ini: **"23 Agustus 2026 · 17:00–15:59"** disertai keterangan kecil "Periode berjalan" atau "Periode selesai". Ada tombol kalender kecil untuk memilih periode lain (dropdown berisi 7 periode terakhir).

**Tombol utama "Mulai Analisis":**
Tombol besar lebar penuh dengan gradient merah dan ikon petir. Saat ditekan, tombol berubah jadi **panel proses langsung di tempatnya** yang menampilkan tahapan berjalan satu per satu dengan checklist beranimasi (masing-masing tahap jeda 0,8–1,5 detik):
1. "Mengambil daftar akun wajib..." ✓
2. "Memindai postingan @dpp.pri..." ✓
3. "Memindai postingan @muhammad.nazaruddin_..." ✓
4. "Memindai postingan @tvrakyat.official..." ✓
5. "Mengambil komentar dari 12 postingan..." ✓
6. "Mencocokkan dengan roster kader..." ✓
7. "Menyusun rekap kepatuhan..." ✓

Ada progress bar melingkar dengan persentase di sampingnya. Setelah selesai, tampilkan **toast sukses** "Analisis selesai — 12 postingan diperiksa" dan dashboard hasil muncul dengan animasi fade-in-up bertahap (stagger).

Kalau analisis sudah pernah dijalankan, tampilkan keterangan kecil di bawah tombol: "Terakhir dianalisis 14 menit lalu" dan tombol berubah label jadi **"Analisis Ulang"**.

**Ringkasan hasil (3 kartu kaca kecil sejajar):**
- Total Postingan: `12`
- Kader Patuh Penuh: `45 / 72`
- Perlu Ditindaklanjuti: `27`

**Daftar Akun Wajib (3 kartu besar, bisa diklik):**
Setiap kartu akun menampilkan:
- Avatar bulat + nama akun (`@dpp.pri`) + nama tampilan ("DPP Partai Rakyat Indonesia")
- Badge jumlah postingan hari itu (mis. "5 postingan")
- Ring progress melingkar besar di kanan menampilkan persentase kepatuhan akun itu (82%), warnanya menyesuaikan: hijau ≥80%, kuning 50–79%, merah <50%
- Baris kecil di bawah: "58 sudah komentar · 14 belum" dengan titik warna
- Panah ke kanan menandakan bisa diklik

Data dummy 3 akun:
| Akun | Nama tampilan | Postingan hari ini | Kepatuhan |
|---|---|---|---|
| `dpp.pri` | DPP Partai Rakyat Indonesia | 5 | 82% |
| `muhammad.nazaruddin_` | Muhammad Nazaruddin | 4 | 76% |
| `tvrakyat.official` | TV Rakyat Official | 3 | 71% |

**Catatan penting:** Rancang komponen daftar akun ini supaya **mudah ditambah akun baru dan platform baru**. Sediakan field `platform` pada setiap akun (nilai saat ini semua `"instagram"`), dan siapkan ikon platform untuk: Instagram, TikTok, Twitter/X, Facebook, Threads, YouTube Shorts. Tampilkan ikon platform kecil di pojok avatar. Di bagian atas daftar, sediakan **filter chip platform** (Semua · Instagram · TikTok · X · Facebook · Threads · YouTube) — untuk sekarang chip selain Instagram dan "Semua" ditampilkan tapi dalam keadaan nonaktif dengan label kecil "Segera hadir".

### 5b. Halaman Detail Akun (setelah kartu akun diklik)

Buka sebagai **halaman penuh baru** dengan animasi slide dari kanan, ada tombol kembali di kiri atas.

Header: avatar akun besar, nama akun, statistik ringkas (jumlah postingan, rata-rata kepatuhan, total komentar terkumpul).

**Daftar viewcard postingan hari itu** — kartu kaca vertikal, setiap kartu berisi:
- Thumbnail gambar postingan (pakai placeholder gradient berwarna dengan ikon, atau gambar dummy dari `https://picsum.photos/seed/[id]/400/400`)
- Caption postingan dipotong 2 baris
- Waktu posting ("Diposting 09:42 WIB")
- Baris statistik mini dengan ikon: ❤️ jumlah like · 💬 jumlah komentar
- **Progress bar kepatuhan** khusus postingan itu + teks "18 dari 24 kader sudah komentar"
- Badge status di pojok kanan atas: "Lengkap" (hijau) kalau 100%, "Perlu Tindak Lanjut" (kuning/merah) kalau belum
- Seluruh kartu bisa diklik

Buat **5 postingan dummy** untuk `@dpp.pri` dengan variasi angka (satu di antaranya sudah 100% supaya terlihat state "Lengkap"), 4 untuk `@muhammad.nazaruddin_`, dan 3 untuk `@tvrakyat.official`.

### 5c. Halaman Detail Postingan (setelah viewcard diklik)

Ini layar paling detail. Buka sebagai halaman penuh (slide dari kanan) ATAU bottom sheet yang bisa ditarik ke atas hingga penuh — pilih yang paling elegan.

**Bagian atas:**
- Thumbnail postingan besar
- Caption lengkap
- Tombol **"Buka di Instagram"** (tautan keluar, ikon panah keluar)
- Baris statistik dalam 3 kartu mini: Jumlah Like `1.247`, Jumlah Komentar `86`, Kepatuhan `75%`

**Tab pemisah (segmented control bergaya kaca) — 2 tab:**

**Tab 1: "Belum Komentar" (tab default, karena ini yang paling perlu ditindaklanjuti)**
Daftar kader yang belum komentar. Tampilkan **jumlahnya di badge tab** (mis. "Belum Komentar · 6"). Setiap baris berisi:
- Avatar inisial berwarna (warna diambil dari hash nama supaya konsisten)
- Nama kader (mis. "Budi Santoso")
- Jabatan/wilayah kecil di bawah nama (mis. "DPC Jakarta Selatan")
- Username IG kader (`@budi.santoso`)
- **Tombol WhatsApp hijau di kanan** (ikon WhatsApp)

**Saat tombol WhatsApp ditekan**, buka `wa.me` dengan pesan yang sudah terisi otomatis:
```
https://wa.me/[nomor]?text=[pesan terformat URL]
```
Isi pesan template:
> Assalamualaikum Kak [Nama], mohon bantuannya untuk memberi komentar di postingan @[akun_wajib] berikut ya: [link postingan] — Terima kasih 🙏 (Pesan otomatis dari PRI SuperApp)

Sediakan juga **tombol "Ingatkan Semua"** di atas daftar — saat ditekan, tampilkan modal konfirmasi kaca berisi "Kirim pengingat WhatsApp ke 6 kader?" dengan tombol Batal / Kirim. Setelah dikonfirmasi, tampilkan toast "Pengingat terkirim ke 6 kader" (simulasi saja).

**Tab 2: "Sudah Komentar"**
Daftar kader yang sudah komentar, setiap baris berisi:
- Avatar inisial + nama + username
- **Isi komentarnya** ditampilkan dalam bubble kecil bergaya kaca
- Waktu komentar ("10:15 WIB")
- Centang hijau di kanan

Di atas kedua tab, sediakan **kolom pencarian** untuk mencari nama kader, dan di kanan atas ada tombol filter kecil.

Buat **24 kader dummy** dengan nama Indonesia yang beragam, wilayah DPC yang berbeda-beda (Jakarta Selatan, Bandung, Surabaya, Medan, Makassar, Semarang, dst), nomor WhatsApp dummy berformat `628xxxxxxxxxx`, dan username Instagram. Bagi mereka ke status sudah/belum komentar berbeda-beda per postingan supaya data terasa hidup.

## 6. MODUL OTOMATISASI VIDEO TV RAKYAT (Admin TV + Super Admin)

Alur modul ini berurutan seperti pipeline. Tampilkan sebagai **stepper vertikal bergaya kaca** yang jelas tahapannya.

### 6a. Panel "Cek Berita Terbaru"

Kartu kaca di paling atas dengan tombol **"Cek Berita Terbaru dari Nusantara TV"** (ikon refresh/radar). Saat ditekan, muncul animasi pemindaian (radar berputar / skeleton loading) selama 1,5 detik, lalu tampilkan daftar **6 berita dummy** dalam bentuk kartu horizontal yang bisa di-scroll ke samping ATAU daftar vertikal — pilih yang paling rapi di layar mobile.

Setiap kartu berita berisi:
- Thumbnail
- Judul berita (mis. "Banjir Rendam 300 Rumah di Bekasi Timur", "Harga Cabai Melonjak Jelang Akhir Pekan", "Pemuda Bandung Ciptakan Alat Penjernih Air")
- Sumber & waktu ("Nusantara TV · 2 jam lalu")
- Badge platform asal (TikTok / Instagram) dengan ikon
- Link video ditampilkan dalam teks mono kecil yang bisa disalin (ada ikon salin, dan saat disalin muncul toast "Link disalin")
- Tombol **"Gunakan Link Ini"** yang otomatis mengisi kolom URL di langkah berikutnya

### 6b. Panel "Kirim Video untuk Diproses"

Kartu kaca berisi:
- Label "Link Video Asli (Doksli)" + kolom input URL besar dengan ikon tautan. Placeholder: `https://www.tiktok.com/@... atau https://www.instagram.com/reel/...`
- Validasi langsung: kalau bukan URL valid atau bukan dari domain TikTok/Instagram, tampilkan pesan merah "Masukkan link TikTok atau Instagram yang valid"
- Kolom opsional "Judul Overlay" dan "Highlight" (teks pendek yang akan muncul di video) — beri keterangan kecil "Kosongkan agar AI yang membuatkan otomatis"
- Tombol **"Proses Video"** lebar penuh gradient merah, nonaktif (disabled, opacity rendah) selama URL belum valid

### 6c. Panel Progress Generate Video

Setelah Submit ditekan, panel ini muncul menggantikan form dengan animasi. Isinya:

- **Ring progress besar di tengah** menampilkan persentase yang naik dari 0% ke 100% secara bertahap (total sekitar 12–15 detik untuk simulasi), dengan angka besar di tengah lingkaran
- Di bawahnya, **daftar tahapan** dengan status masing-masing (menunggu / berjalan / selesai), tahapan yang sedang berjalan diberi animasi pulse:
  1. `Mengambil video sumber` — 0–15%
  2. `Membuat judul & caption dengan AI` — 15–30%
  3. `Mengunggah ke penyimpanan sementara` — 30–50%
  4. `Merender overlay judul & highlight` — 50–85%
  5. `Finalisasi video` — 85–100%
- Teks estimasi kecil: "Perkiraan selesai 40 detik lagi"
- Tombol **"Batalkan"** berbingkai (outline) di bawah, yang memunculkan konfirmasi sebelum benar-benar membatalkan

### 6d. Popup Pratinjau Video (setelah 100%)

Munculkan **modal glassmorphism** (atau bottom sheet penuh) dengan animasi scale-up + backdrop blur berat. Isinya:

- Judul modal: "Video Siap Ditinjau"
- **Pemutar video** berformat vertikal 9:16 (pakai elemen `<video>` dengan poster placeholder; boleh pakai video dummy publik atau sekadar area gradient dengan tombol play besar di tengah — yang penting bentuknya benar dan kontrolnya berfungsi)
- Di bawah video, kartu kecil berisi metadata hasil: **Judul** yang di-generate, **Highlight**, **Caption** lengkap (bisa di-expand), dan **Sumber**
- Tombol kecil "Salin Caption"
- **Panel pilihan platform tujuan** — daftar toggle switch bergaya kaca dengan ikon: Instagram (aktif), TikTok (aktif), YouTube Shorts (aktif), Facebook (nonaktif), Twitter/X (nonaktif), Threads (nonaktif). User bisa menyalakan/mematikan masing-masing
- **Dua tombol aksi besar berdampingan:**
  - **"Buang"** — outline merah, ikon tempat sampah. Menampilkan konfirmasi "Yakin membuang video ini? Proses tidak bisa diulang." lalu menutup modal dan menampilkan toast "Video dibuang"
  - **"Unggah ke Semua Sosmed"** — gradient hijau/merah, ikon roket. Saat ditekan, tampilkan progress unggah per platform (daftar dengan spinner lalu centang hijau satu per satu), lalu toast sukses "Video berhasil diunggah ke 3 platform" dan modal tertutup

### 6e. Riwayat Video

Di bawah panel utama, kartu "Riwayat Pemrosesan" berisi daftar 8 video dummy dengan:
- Thumbnail kecil
- Judul video
- Waktu proses
- **Badge status** berwarna: `Sudah Diposting` (hijau), `Sedang Diproses` (biru, dengan dot animasi), `Menunggu Doksli` (kuning), `Gagal` (merah)
- Untuk yang sudah diposting: baris ikon platform tempat video itu terunggah + tombol "Lihat Postingan"
- Untuk yang gagal: tombol "Coba Lagi"

Sediakan **filter chip status** di atas daftar (Semua · Diposting · Diproses · Menunggu · Gagal).

## 7. HALAMAN NOTIFIKASI & PUSH NOTIFICATION

**Sistem notifikasi harus ada di 3 lapis:**

**a) Toast notification** — muncul dari atas layar, kartu kaca kecil dengan ikon berwarna sesuai jenis (sukses hijau, error merah, info biru, peringatan kuning), hilang otomatis setelah 4 detik, bisa ditutup manual, dan bertumpuk rapi kalau ada beberapa sekaligus.

**b) Simulasi push notification** — banner yang meluncur turun dari atas layar menyerupai notifikasi Android sungguhan: ikon aplikasi, nama aplikasi, judul, isi singkat, dan waktu. Banner ini bisa diklik untuk langsung menuju halaman terkait. **Picu otomatis 2 notifikasi dummy** beberapa detik setelah pengguna login, contohnya:
- "3 kader belum berkomentar di postingan @dpp.pri terbaru" → mengarah ke Modul QC
- "Video 'Banjir Bekasi' selesai dirender dan siap ditinjau" → mengarah ke Modul TV Rakyat

**c) Halaman Pusat Notifikasi** (tab di bottom nav) — daftar semua notifikasi dengan:
- Pengelompokan "Hari Ini" / "Kemarin" / "Lebih Lama"
- Titik biru penanda belum dibaca
- Ikon berwarna per kategori (QC, Video, Sistem)
- Swipe ke kiri untuk menghapus
- Tombol "Tandai semua sudah dibaca" di kanan atas
- Badge angka merah di ikon lonceng header dan di tab bottom nav yang berkurang saat notifikasi dibaca

Buat **10 notifikasi dummy** dengan variasi kategori dan waktu.

## 8. HALAMAN PROFIL

Kartu kaca berisi avatar besar, nama, email, badge peran (dengan warna berbeda per role), dan daftar pengaturan bergaya list:
- Mode Tema (toggle terang/gelap)
- Notifikasi Push (toggle)
- Notifikasi WhatsApp (toggle)
- Bahasa (Indonesia — nonaktif)
- Tentang Aplikasi (versi 1.0.0)
- **Keluar** (merah, dengan modal konfirmasi, kembali ke halaman login)

## 9. DETAIL TEKNIS & INTERAKSI

- **Animasi:** gunakan transisi halus di semua perpindahan halaman (slide), munculnya kartu (fade-in-up bertahap/stagger), penekanan tombol (scale 0.97 saat ditekan), dan modal (scale + blur backdrop). Hormati `prefers-reduced-motion`.
- **Skeleton loading:** setiap daftar yang "memuat data" harus menampilkan skeleton bergaya kaca dengan efek shimmer, bukan spinner polos.
- **Empty state:** setiap daftar yang kosong menampilkan ilustrasi sederhana (ikon besar) + judul + keterangan + tombol aksi. Contoh: "Belum ada analisis hari ini — Tekan tombol Mulai Analisis untuk memeriksa kepatuhan kader."
- **Pull-to-refresh** pada halaman dashboard dan daftar.
- **Haptic-like feedback visual** saat menekan tombol penting.
- **Aksesibilitas:** kontras teks minimal WCAG AA di kedua tema, area sentuh minimal 44×44px, fokus keyboard terlihat jelas.
- **Responsif:** desain utama untuk 360–430px; kalau dibuka di layar lebar, konten dibatasi maksimal 480px dan dipusatkan dengan latar mesh gradient di sisinya (seperti pratinjau perangkat).

## 10. ATURAN OUTPUT (SANGAT PENTING — IKUTI PERSIS)

Kode ini nanti akan dipindahkan ke proyek utama yang memakai **Supabase** sebagai backend dan **n8n** sebagai mesin otomasi. Karena itu:

**a) Semua data dummy WAJIB diletakkan di satu folder terpisah: `src/data/`**, dipecah per domain menjadi file-file berikut, dan **tidak boleh ada satu pun data dummy yang ditulis langsung (hardcode) di dalam komponen JSX**:
- `src/data/users.ts` — akun login 3 role
- `src/data/akunWajib.ts` — 3 akun sosmed yang dipantau
- `src/data/kader.ts` — 24 kader
- `src/data/postingan.ts` — 12 postingan
- `src/data/komentar.ts` — data komentar per postingan
- `src/data/rekap.ts` — hasil rekap kepatuhan
- `src/data/videoAntrian.ts` — riwayat & antrian video TV Rakyat
- `src/data/beritaNtv.ts` — daftar berita Nusantara TV
- `src/data/notifikasi.ts` — notifikasi

**b) Nama field WAJIB memakai penamaan berikut PERSIS** (ini mengikuti skema database yang sudah berjalan — jangan diubah, jangan di-camelCase-kan, jangan diterjemahkan ke Inggris):

```ts
// Akun sosmed yang wajib dikomentari
type AkunWajib = {
  id: string
  akun_wajib: string          // contoh: "dpp.pri"
  nama_tampilan: string
  platform: string            // "instagram" | "tiktok" | "twitter" | "facebook" | "threads" | "youtube"
  avatar_url: string
  aktif: boolean
}

// Orang / anggota
type Kader = {
  id: string
  nama_kader: string
  wilayah: string             // contoh: "DPC Jakarta Selatan"
  jabatan: string
  nomor_wa: string            // format: "628xxxxxxxxxx"
  ig_username: string
  aktif: boolean
}

// Postingan yang dipantau
type Postingan = {
  id_postingan: string
  akun_wajib: string
  platform: string
  caption_asli: string
  thumbnail_url: string
  link_postingan: string
  waktu_posting: string       // ISO 8601
  jumlah_like: number
  jumlah_komentar: number
  periode: string             // format: "2026-08-23 17:00-15:59"
}

// Komentar yang tertangkap
type Komentar = {
  id_komentar: string
  id_postingan: string
  ig_username: string
  nama_kader: string | null   // null kalau bukan kader terdaftar
  isi_komentar: string
  waktu_komentar: string      // ISO 8601
}

// Rekap kepatuhan per orang per postingan
type Rekap = {
  id_unik: string             // format: periode|||nama_kader|||platform|||akun_wajib|||id_postingan
  periode: string
  nama_kader: string
  platform: string
  akun_wajib: string
  id_postingan: string
  sudah_komentar: boolean
  jumlah_komentar: number
}

// Antrian & riwayat video TV Rakyat
type VideoAntrian = {
  id: string
  judul: string
  link: string                // link video di platform sumber
  jenis: string               // "TIKTOK" | "INSTAGRAM"
  video_asli: string          // link doksli
  caption_asli: string
  judul_overlay: string
  highlight: string
  status: string              // "MENUNGGU DOKSLI" | "SEDANG DIPROSES" | "SUDAH DIPROSES" | "GAGAL"
  link_instagram: string
  thumbnail_url: string
  jam_tanggal: string         // ISO 8601
  platform_terunggah: string[]
}
```

**c) Semua pengambilan data WAJIB lewat lapisan perantara di `src/services/`**, bukan langsung mengimpor file data ke dalam komponen. Buat fungsi-fungsi seperti `getAkunWajib()`, `getPostinganByAkun(akun_wajib, periode)`, `getRekapPostingan(id_postingan)`, `prosesVideo(url)`, `getBeritaTerbaru()` — semuanya `async` dan mengembalikan `Promise` dengan jeda buatan 300–800ms supaya terasa seperti panggilan jaringan sungguhan. **Tujuannya: nanti isi fungsi ini tinggal diganti panggilan Supabase/n8n tanpa menyentuh satu pun komponen UI.**

**d) Struktur folder yang diminta:**
```
src/
  components/       # komponen kecil yang dipakai ulang (GlassCard, Toast, ProgressRing, dst)
  features/
    auth/           # halaman login
    dashboard/      # dashboard super admin
    qc-konten/      # modul QC (halaman utama, detail akun, detail postingan)
    tv-rakyat/      # modul otomatisasi video
    notifikasi/
    profil/
  data/             # SEMUA data dummy
  services/         # lapisan perantara pengambilan data
  hooks/            # useTheme, useToast, useAuth, dst
  types/            # definisi TypeScript
  styles/           # token warna, efek kaca
```

**e) Satu komponen = satu file.** Jangan membuat satu file raksasa berisi seluruh aplikasi. Setiap halaman dipecah jadi beberapa komponen kecil yang jelas namanya.

**f) Token desain (warna, radius, blur, shadow, spacing) dikumpulkan di satu tempat** sebagai CSS custom properties, sehingga mengganti tema atau warna cukup dari satu file.

**g)** Gunakan **Tailwind CSS** untuk styling. Jangan pakai pustaka komponen berat seperti Material UI — cukup Tailwind + komponen buatan sendiri, supaya efek glassmorphism-nya bisa dikendalikan penuh. Untuk grafik gunakan **Recharts**. Untuk ikon gunakan **lucide-react**. Untuk animasi gunakan **framer-motion**.

**h)** Aplikasi harus **bisa langsung dijalankan** dengan `npm install && npm run dev` tanpa perlu konfigurasi tambahan, tanpa variabel environment, dan tanpa koneksi internet ke API mana pun.

---

Bangun aplikasi ini selengkap dan seindah mungkin. Prioritaskan kualitas visual glassmorphism, kehalusan animasi, dan kelengkapan alur dari login sampai aksi terakhir di setiap modul. Pastikan mode terang dan gelap dua-duanya terlihat premium.
