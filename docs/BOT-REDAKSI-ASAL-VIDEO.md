# Bot Redaksi — melacak sumber asli video dan mengenali "video yang sama"

Status: **rancangan, belum ada kode** (13 Okt 2026). Menjawab pertanyaan pemilik: bila NTV
mengunggah video A yang ternyata diambil dari video orang lain, bagaimana bot (1) mengetahui
asalnya, (2) mencari sumber lain yang videonya **sama persis**, dan (3) tahu bahwa dua
unggahan memakai rekaman yang sama. Tidak memuat rahasia.

## 1. Masalahnya, dengan tepat

Bot membutuhkan **rekaman mentah (doksli)** untuk diedit. Video NTV yang sudah tayang adalah
**hasil suntingan NTV**: ada logo, teks, dan potongannya sendiri. Memakainya mentah-mentah berarti
memposting ulang karya NTV dengan template kita. Idealnya bot memakai **rekaman asli** di balik
video itu.

Ada tiga pertanyaan berbeda yang sering tertukar:

| # | Pertanyaan | Contoh | Kunci yang cocok |
|---|---|---|---|
| 1 | URL ini sama dengan URL itu? | Dua bentuk tautan Instagram yang sama | `kunci_kanonik` (sudah ada, `lib/bot-kunci.ts`) |
| 2 | **Rekaman ini sama dengan rekaman itu**, walau diunggah di platform atau akun berbeda? | Klip warga di TikTok, lalu dipakai NTV di Instagram | **Sidik konten** (baru, §4) |
| 3 | Dari mana NTV mengambil rekaman ini? | Takarir menulis "Sumber: @warga123" | **Kredit + pencocokan** (§3) |

`kunci_kanonik` tidak cukup untuk nomor 2 dan 3: dua URL berbeda bisa memuat rekaman yang sama.

## 2. Prinsip

1. **Bertingkat dan bisa dijelaskan.** Setiap kesimpulan membawa tingkat keyakinan dan bukti
   yang bisa dilihat master (kutipan takarir, bingkai berdampingan). Bot tidak menebak diam-diam.
2. **Murah dulu, mahal belakangan.** Mulai dari metadata dan teks (gratis, tanpa mengunduh
   video), baru sidik visual untuk kandidat teratas.
3. **Manusia memutuskan bila ragu.** Keyakinan menengah selalu lewat Antrean ACC dengan bukti.
4. **Asal tidak diketahui ≠ boleh dipakai.** Menemukan asal video tidak memberi hak atas video itu.
   Kredit sumber asli wajib ada di takarir, dan konten milik NTV sendiri tidak diedit ulang otomatis.

## 3. Menemukan asal sebuah video (kredit lalu pencocokan)

### Tahap A — Baca kredit (tanpa unduh video; murah)
- Ambil metadata lengkap video A lewat yt-dlp (bukan mode daftar): takarir/deskripsi, pengunggah,
  tag, tautan di takarir, tanda kolaborasi.
- Ekstrak kredit dengan **aturan teks** (pola "Sumber:", "Source:", "Credit:", "cr:", "Video:",
  "Via:", "dok.", @sebutan, tautan) lalu **LLM** (otak bot, §6 di dokumen bot) untuk takarir yang
  tidak berpola. Keluaran: `{akun, platform, url?, kutipan}`.
- Bila ada **URL** → ubah ke `kunci_kanonik`; selesai (keyakinan tinggi bila video itu masih ada).
- Hasil umum: banyak unggahan media memuat kredit; banyak juga yang tidak. Tahap ini
  menjawab sebagian besar kasus berkredit dengan biaya hampir nol.

### Tahap B — Dari "akun" ke "video", bila kredit hanya berupa nama akun
- Daftar unggahan terbaru akun yang dikredit (yt-dlp daftar, sama seperti pemanen) dalam jendela
  waktu **sebelum** video A terbit (mis. 14 hari).
- Beri skor tiap calon: kemiripan durasi (±15%), tumpang-tindih kata kunci takarir, selisih waktu.
- Ambil **3 calon teratas** untuk diverifikasi visual (Tahap C).

### Tahap C — Verifikasi visual (sidik konten)
Detail di §4. Menjawab "apakah rekaman ini benar-benar sama?" terlepas dari takarir.

### Tahap D — Mencari sumber lain tanpa kredit
Bila A tidak berkredit: bentuk kata kunci dari judul/takarir (LLM), cari kandidat:
- YouTube lewat pencarian bawaan yt-dlp (`ytsearchN:kata kunci`, gratis).
- Platform lain: hanya lewat akun yang sudah diizinkan (daftar sumber), karena pencarian
  TikTok/Instagram/X tidak andal dan gratis.
Lalu verifikasi visual calon teratas. Pencarian balik gambar/video eksternal (Google Lens, TinEye)
berbayar atau tidak berAPI; **ditunda** sebagai pilihan berbayar kelak.

## 4. Sidik konten: mengenali "rekaman yang sama"

**Cara.** Tidak membandingkan berkas (selalu beda: kompresi, resolusi, logo). Yang dibandingkan
adalah **sidik visual** dari bingkai.

1. Unduh **pratinjau ringan** (resolusi ≤360p, 15–20 detik pertama) hanya untuk calon teratas.
2. Di mesin (ffmpeg sudah ada di image): ambil ±1 bingkai per detik, **potong bagian tepi** (logo
   dan teks biasanya di tepi) dan simpan bagian tengah ±70%.
3. Hitung **hash perseptual** 64-bit tiap bingkai (pHash/dHash; `sharp` sudah ada di image).
   Sidik video = deret hash + durasi.
4. Bandingkan dua sidik dengan **jarak Hamming** per bingkai, boleh bergeser waktu (video yang
   dipotong mulai di detik berbeda), dan uji juga versi **cermin**. Skor = porsi bingkai yang
   cocok. Ambang awal: ≥0,8 = sama; 0,5–0,8 = mungkin; <0,5 = beda (akan dikalibrasi, §7).
5. Simpan sidik di tabel baru; bandingkan dengan semua sidik yang pernah ada.

**Kegunaannya**
- **Asal video**: calon sumber dari Tahap B/D dikonfirmasi bila sidiknya cocok.
- **Tabrakan konten**: dua kandidat dengan URL berbeda tapi rekaman sama (klip yang sama di IG, TikTok,
  YouTube) terdeteksi, sehingga bot kedua tidak memakai rekaman yang sama (melengkapi pagar URL).
- **"NTV mengambil dari sumber yang sama?"**: bila dua unggahan NTV (atau NTV dan akun lain) bersidik
  sama, itu satu rekaman.

**Batas jujur.** Sidik visual lemah terhadap: pemotongan besar, filter berat, kecepatan diubah,
tumpukan beberapa klip, dan overlay yang menutupi tengah layar. Untuk kasus itu hasilnya "tidak
yakin" dan dikirim ke manusia; bukan dianggap tidak ada.

## 5. Memilih versi terbaik dari beberapa sumber yang sama

Bila beberapa versi bersidik sama (mis. unggahan asli warga dan versi NTV), bot memilih untuk bahan:

1. Bukan milik penerbit yang menambahkan **logo/teks sendiri** (versi pengunggah asli lebih bersih).
2. Resolusi dan bitrate lebih tinggi.
3. Durasi lebih panjang (versi lengkap).
4. Masih tersedia dan lolos daftar domain yang diizinkan.

Versi yang dipilih menjadi `url` tugas; kredit ke **pengunggah asli** masuk takarir.

## 6. Keputusan akhir per kandidat

| Keadaan | Keyakinan | Tindakan bot |
|---|---|---|
| Asal ditemukan dan sidik cocok | Tinggi | Pakai rekaman **asli** sebagai bahan; kredit ke asal |
| Asal kemungkinan (kredit tanpa URL, sidik 0,5–0,8) | Sedang | Kirim ke Antrean ACC dengan bukti (kutipan + bingkai berdampingan) |
| Tidak ada asal; konten diproduksi NTV sendiri | — | **Lewati otomatis** (tidak diedit ulang), tandai "milik penerbit" |
| Tidak ada asal; asal tidak diketahui | Rendah | Lewati, atau ACC manual bila master mau |
| Sidik cocok dengan video yang sudah dipakai | — | **Tolak**: tabrakan konten |

## 7. Data dan protokol (usulan; mengikuti pola yang ada)

- Kolom baru `bot_kandidat`: `status_asal` (`belum` | `diperiksa` | `terverifikasi` | `tidak_ditemukan` | `milik_penerbit`),
  `asal_url`, `asal_kunci`, `asal_keyakinan` (0–1), `asal_bukti` (jsonb: kutipan kredit, skor, bingkai).
- Tabel baru `bot_sidik`: `kandidat_id`, `hash` (array bigint/teks), `durasi_detik`, `dibuat_pada`,
  `sumber` (kandidat | video_dipakai). Pencocokan bisa berurutan (ribuan baris cukup).
- Protokol runner: perintah baru `periksa_asal` (`{kandidat_id, url}`) dan laporan `asal_diperiksa`
  (`{kandidat_id, kredit?, calon[], sidik?}`), mengikuti `lib/bot-protokol.ts`. Pekerjaan berat
  (unduh pratinjau, ffmpeg, hash) di runner; **keputusan dan penyimpanan di aplikasi**, sama seperti
  sekarang.
- Anggaran: maks N verifikasi visual per bot per hari, satu ffmpeg serentak, prioritas rendah agar
  tidak mengganggu render anggota. Pratinjau dihapus setelah sidik dihitung.

## 8. Tahapan membangun

| # | Isi | Nilai | Risiko |
|---|---|---|---|
| A | Ekstrak kredit (aturan + LLM) dan ubah URL kredit jadi kunci kanonik; simpan `asal_*` | Tinggi, hampir gratis | Rendah |
| B | Sidik konten dan pencocokan; deteksi tabrakan konten lintas URL | Tinggi untuk anti-tabrakan | Sedang (beban mesin, ambang) |
| C | Dari kredit akun ke video (Tahap B), pencarian YouTube (Tahap D), pemilihan versi terbaik | Sedang | Sedang |
| D | Pencarian balik eksternal berbayar | Opsional | Biaya |

**Kalibrasi, bukan sekali jadi.** Buat himpunan uji ±30 unggahan NTV yang asalnya sudah Anda
ketahui (berkredit, tanpa kredit, milik sendiri, versi dipotong). Ukur ketepatan dan keterjangkauan
tiap tahap, atur ambang. Ulangi tiap dua minggu dengan koreksi master dari Antrean ACC.

## 9. Risiko

| Risiko | Mitigasi |
|---|---|
| Salah menyimpulkan asal, memakai rekaman orang lain tanpa kredit benar | Keyakinan bertingkat; menengah selalu ke ACC dengan bukti; kredit ke asal wajib |
| Konten milik NTV diedit ulang tanpa izin | Status `milik_penerbit` dilewati otomatis; hanya master yang bisa mengesampingkan |
| Beban unduh dan ffmpeg mengganggu render | Pratinjau ≤360p, 15–20 dtk, anggaran harian, satu proses, prioritas rendah |
| Hak cipta | Menemukan asal tidak memberi hak; kredit wajib, ACC manual, akun uji dulu |
| Ambang salah (terlalu longgar/ketat) | Himpunan uji berlabel dan kalibrasi berkala; semua keputusan tercatat dan dapat dikoreksi |
| Sidik buta terhadap suntingan berat | Hasil "tidak yakin" → manusia, bukan dianggap tidak ada |
