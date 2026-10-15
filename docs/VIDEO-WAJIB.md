# Video Wajib bernomor perintah (15 Okt 2026)

Kategori sebuah video ditentukan **satu-satunya** oleh perintah (video wajib) yang dipilih Pimred —
tanpa hashtag, tanpa model bahasa, biaya tambahan nol. Mockup: artefak "Kategori Wajib TV Rakyat".

## Alur label (tanpa tebakan)
1. Pimred menerbitkan perintah di panel **Video Wajib** (modul TV Rakyat / TV Rakyat Saya), memilih kategori
   dan (opsional) **Wajib posting**: berlaku otomatis untuk SEMUA akun tersambung dan SEMUA platform tertaut.
2. Anggota menekan **Buat video dari perintah ini** → `usePerintahAktif` (localStorage, per pengguna) menyimpan
   `{id, judul, kategori}`; tab pindah ke TV Rakyat Saya (`PERISTIWA_BUKA_TVRKU`).
3. Buat Video (Edit Otomatis) mengunci kategori; formulir unggah (`unggah-sosmed-saya.tsx`) mengirim `perintah_id`.
4. `/api/tvr/unggah` mengunci kategori ke kategori perintah (kiriman `keyword` lain diabaikan), menyimpan
   `tvrku_post.perintah_id` + `hasil.perintah_id`. Perintah tak aktif ditolak 409.
5. Rekonsiliasi KPI (`lib/kpi-otomatis.ts`) membawa `perintah_id` ke `laporan_video` otomatis.
6. Insight per Kategori menghitung HANYA video bernomor bila kategori itu punya perintah wajib posting / video
   bernomor (`terisolasi`). Saklar "Hitung juga yang dipilih anggota" (`?manual=1`, bawaan mati) menyertakan pilihan
   manual anggota. Yang tidak dihitung muncul di panel "Tidak dihitung ke …"; Pimred/TV Rakyat Nasional bisa
   memasukkannya (`POST /api/tv/video-wajib/hitung`, tercatat `laporan_video.perintah_oleh`, lencana "Dimasukkan Pimred").
   Kategori tanpa perintah tampil persis seperti sebelumnya.

## Pantau
- `GET /api/tv/video-wajib/pantau?id=&tanggal=` (berwenang TV Rakyat): per akun, per platform, per wilayah
  (zona → DPD/DPC → Sayap → "Pusat"), grafik 7 hari. UI: `features/tv-rakyat/pantau-video-wajib.tsx`.
- Yang wajib = anggota aktif (bukan master/superadmin/bot) dengan ≥1 akun di `akun_tvr_user.terhubung`; platform
  wajib = semua yang tertaut. "Selesai" = semua platform terposting pada hari itu (pola `sekali`: kapan pun sejak terbit).
- Posting dihitung dari `tvrku_post` (gagal terbit tidak dihitung; terjadwal pada tanggal terbitnya) ∪ `laporan_video`
  bernomor perintah. Tidak memanggil platform. Logika murni: `lib/video-wajib-perintah.ts`; kueri: `lib/video-wajib-pantau.ts`.
- Panel menampilkan pembagian ringkas (`ringkas`, cache 60 dtk) di bawah tiap perintah; anggota melihat `saya`.

## Pengingat
- Otomatis: `/api/cron/video-wajib` (penjadwal VPS menit 6,16,…; `vps/aplikasi/jadwal/jalankan.sh`) — 2 jam sebelum
  batas jam, sekali per perintah per hari, hanya yang belum selesai. Manual: tombol "Ingatkan yang belum" (1× per jam).
  Keduanya tercatat di `tvr_wajib_pengingat`. Notifikasi dalam aplikasi + push, target `tvrku`.

## Migrasi & kompatibilitas
- `sql/76_video_wajib_perintah.sql` (idempoten) — **dijalankan pemilik di produksi**. Kode tetap jalan tanpanya
  (kolom diperiksa/fallback); perintah wajib posting ditolak 503 sampai SQL dijalankan. Setelah SQL dijalankan, deploy
  ulang tidak diperlukan.
- Panel bisa diciutkan jadi ikon (per perangkat, `pri:video-wajib-kecil`).
- Uji murni: `npx tsx tests/uji-video-wajib.mts`.

## Belum ada / keputusan
- Pantau memakai data yang sudah ada; "pilihan kategori manual anggota" tetap ada (saklar Insight, bawaan mati).
- Video dari bot/Edit Otomatis tim Official tidak ikut perintah (hanya unggahan TV Rakyat Saya).
