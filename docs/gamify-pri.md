# gamify-PRI — Konsep Gamifikasi SuperApp

> Dokumen brainstorm terstruktur. Bagian 1–5 = ide fitur, bagian 6 = celah eksploitasi
> & risiko perilaku pengguna (WAJIB dibaca sebelum eksekusi), bagian 7 = roadmap.

---

## 0. Prinsip Desain Inti

Satu kalimat yang harus mengikat semua fitur:

> **Koin menghargai kontribusi yang TERVERIFIKASI, bukan aktivitas mentah.**

80% celah farming mati otomatis kalau prinsip ini dipegang: koin absensi dibayar
setelah absen swafoto+GPS tervalidasi (bukan saat tombol ditekan), koin komentar
dibayar setelah komentar tertangkap sistem rekap kepatuhan (bukan saat pengguna
mengaku), koin KPI dibayar saat laporan di-ACC ketua (bukan saat disubmit).

**Loop inti:** aksi nyata → koin → kosmetik/koleksi → status terlihat publik →
tekanan sosial positif → aksi nyata lagi.

---

## 1. Ekonomi Koin Merah Putih (KMP)

### 1.1 Faucet (cara dapat koin) — mapping ke fitur yang sudah ada

| Aksi | Koin | Pemicu pembayaran | Anti-farming |
|---|---|---|---|
| Absen masuk + pulang | +5/hari | Absen valid (swafoto+GPS lolos) | Streak mingguan bonus; cap 1 hari; pola unik DB sudah ada |
| Komentar akun wajib | +3/postingan | Komentar tertangkap rekap kepatuhan | Cap 5 postingan/hari; dibayar T+1 setelah tertangkap |
| Laporan kerja (KPI) | +10 | Ketua menyetujui | Koin saat ACC, bukan submit |
| Video TV Rakyat lolos QC | +25 | Admin TV approve | Rate-limit per orang per minggu |
| Konten "Momen" dapat like | +1/like unik | — | Diminishing return (like ke-10 bernilai 0,5; dst.) |
| Menang mini game | +2 | Server validasi hasil | Cap kemenangan berhadiah per hari |
| Kehadiran live event | +15 | Check-in interaktif di acara | Soal/kode dari panggung, buat bot mati |
| Rekrut kader baru | +50 | Pendaftar **DISETUJUI admin** | Bukan saat daftar — memutus insentif akun palsu |

### 1.2 Sink (cara koin keluar) — ini yang menjaga nilai koin

- **Kosmetik avatar**: baju, aksesoris, frame profil, efek nama di chat, warna nama.
- **Item eksklusif prestasi** (TIDAK bisa dibeli): hanya unlock via pencapaian —
  supaya status bukan cuma soal grinding koin, tapi prestasi.
- **Tiket turnamen** mini game bernilai lebih besar.
- **Gift koin antar kader** — wajib dengan "pajak" 25% (koin hangus) untuk
  merusak nilai ekonomi jual-beli koin.
- **Streak freeze** (jaga streak absensi saat izin/sakit — paralel ke fitur perizinan).
- **Boost Momen** (promosikan foto momen sendiri di atas).
- **Sumbangan ke "Pohon DPC"** — tabungan kolektif wilayah (lihat ide liar #6).

### 1.3 Anti-inflasi

- Cap harian/mingguan per faucet (angka di atas adalah cap sekaligus nilai).
- Rasio faucet:sink dipantau bulanan; kalau koin beredar menumpuk → rilis item
  kosmetik musiman (sink alami, karena scarcity).
- **Mata uang musiman terpisah** (mis. "Poin Agustusan") untuk event — kadaluarsa,
  tidak mencemari ekonomi koin utama.

---

## 2. Skor Kontribusi (pengganti istilah "social credit score")

> ⚠️ **Rebranding disarankan.** Istilah "social credit" bermuatan konotasi dystopia
> dan sangat sensitif untuk aplikasi berbau organisasi/politik — risiko viral
> negatif & framing media. Alternatif: **Indeks Kontribusi**, **Skor Garda**, atau
> **PRI Score**. Mekanisme sama, nama lebih aman.

### 2.1 Komponen skor (rumus PUBLIK & transparan — skor rahasia = kecurigaan)

- % kepatuhan komentar (data rekap sudah ada).
- Konsistensi absensi (streak terpanjang 30 hari).
- Laporan kerja disetujui (jumlah & konsistensi).
- Konten lolos QC / Momen featured.
- Interaksi positif (like diterima, bukan diberikan).
- Lama jadi kader (badge veteransi).

### 2.2 Tier dengan nama bercitarasa

`Simpul → Garda → Garda Inti → Pilar → Legenda` — tiap tier membuka kosmetik
frame profil + warna nama di chat.

### 2.3 Aturan emas desain skor

1. Skor **hampir tidak pernah turun** — diam tidak menghukum (cuma decay ringan).
   Skor yang bisa anjlok jadi alat penghinaan antar kader.
2. Disiplin/pelanggaran itu urusan HR di fitur terpisah — **jangan pernah**
   dituangkan ke skor publik.
3. Tampilan skor di profil **opt-in**.
4. Pencapaian di popup profil = badge koleksi (lencana), bukan angka telanjang —
   angka mengundang perbandingan tox**ic**, lencana mengundang obrolan positif.

---

## 3. Fitur Sosial

### 3.1 Profil + popup pencapaian
Ketuk avatar orang mana pun (di chat/leaderboard/momen) → popup: avatar, tier,
lencana, statistik umum, tombol "sapa" (masuk ke chat 1-lawan-1 yang sudah ada —
opt-in tetap berlaku!). Jangan tampilkan nomor WA publik (aturan saat ini: hanya
PENGAWAS yang boleh lihat — pertahankan).

### 3.2 Avatar & kosmetik
- **Berbasis aset kurasi, bukan upload bebas** → mati dari NSFW/indekssi foto asli
  orang. Sistem layer: wajah → rambut → baju → aksesoris → latar → frame.
- Item langka dari event terbatas (FOMO sehat) + item prestasi (tidak bisa dibeli).
- Pratinjau 3D sederhana? Tidak — 2D layer cukup, hemat biaya.

### 3.3 Momen PRI (5 foto terbaik)
- Maks 5 foto aktif (ganti bebas, yang lama tergantikan).
- **Antrean moderasi sebelum tampil** — tiru alur QC konten TV Rakyat; bukan
  trust-then-takedown.
- Like + komentar (re pakai komponen komentar, plus filter & report).
- "Momen Emas" harian dipilih admin → +koin & spotlight.

### 3.4 Chat Global — FITUR PALING BERISIKO, LIHAT §6.4
Chat sekarang 1-lawan-1 dengan persetujuan — global chat membalik total filosofi
itu. Desain ganti: **kanal per DPC/wilayah + 1 kanal nasional**, bukan satu ruang
rantai tak berujung:
- Level minimum untuk ikut kanal nasional (mis. tier Garda) — antisipasi akun baru spam.
- Slow mode (1 pesan / 10 detik untuk level rendah).
- Link terblokir untuk level rendah (pembunuh scam/phishing massal).
- Retensi pendek (lanjutkan pola 3 hari), filter kata, laporan 1-klik, moderator
  kader terpilih + PENGAWAS.

---

## 4. Mini Games (gaya Hago)

Prinsip: **server-authoritative, turn-based/async, hemat infrastruktur** (no
realtime engine berat di Vercel).

1. **Kuis Cepat 1v1** — pengetahuan umum + materi organisasi (dobel fungsi:
   edukasi kader bercampur hiburan; soal bisa dari admin, anti bocor via bank soal besar + acak).
2. **Duel Refleks** — siapa cepat tap benar.
3. **Tebak 4 Gambar 1 Kata** — konten lokal.
4. **Ular tangga async** — giliran ala Hago; push notif "giliranmu" (nyambung ke infra notifikasi/push yang ada).
5. **Runner maskot** (single player) — skor mingguan ke leaderboard.

**Turnamen mingguan antar-DPC** — piala bergilir di dashboard, kosmetik eksklusif
juara. Liga DPC lihat §5.2.

> ⚠️ **Jangan ada taruhan koin antar pemain** (player A vs B stake koin, menang
> ambil semua). Itu mekanisme judi — masalah hukum (lihat §6.3). Entry boleh
> pakai koin, tapi hadiah dari sistem, bukan dari kantong lawan.

---

## 5. Ide Liar Lainnya (lanjutan brainstorm)

1. **Battle Pass Musiman** — "Pass Agustanan" / "Pass HUT Partai" / "Pass
   Ramadan": misi bertingkat (hadiah gratis semua orang; jalur premium bayar
   koin). Motor utama retensi jangka panjang.
2. **Liga DPC / Perang Wilayah** — poin tim = agregat kontribusi anggota;
   divisi naik-turun antar DPC tiap musim; papan peringkat wilayah di dashboard
   (struktur wilayah "DPC ..." sudah ada di data kader).
3. **Maskot virtual yang berevolusi** — telur menetas saat verifikasi WA,
   tumbuh seiring XP kontribusi, bentuk final = kepribadian kontribusi
   (komentator/penulis/videograf). Emosional, murah dibuat, susah difarm.
4. **Kuis Massal Live (ala HQ Trivia)** — bulanan, 10 soal, seluruh anggota
   bersamaan, yang bertahan split hadiah koin. Event pamungkas + dorongan
   push notification terbesar.
5. **Kartu Kader Digital** — kartu profil koleksi; dirilis terbatas per angkatan/
   event. *Catatan: JANGAN dibuat bisa ditukar antar pengguna* — undang-undang
   ilegal + lahan RMT; cukup display & flex.
6. **Pohon DPC (tabungan kolektif)** — anggota menyumbang koin; kalau wilayah
   capai target musim → semua anggota dapat kosmetik eksklusif. Kerja tim > ego.
7. **Pencapaian tersembunyi (easter egg)** — "Komentar Subuh" (komentar
   tertangkap sebelum jam 6), "Sejuta Umat" (1000 like), dll. Bahan obrolan organik.
8. **Hall of Fame bulanan** — Kader Telaman/Teladan dipilih admin dari data +
   narasi; hadiah frame eksklusif 1 bulan (berdurasi = selalu ada yang dicari).
9. **Watch Party TV Rakyat** — nonton bareng dengan chat sinkron + hadiah
   kehadiran lewat pertanyaan interaktif tengah tayang (sekalian validasi
   manusia, bukan bot).
10. **Streak & Streak Freeze** — paralel ke fitur perizinan: yang izin resmi
    streak-nya "dibekukan", tidak putus. Adil → tidak memotivasi absen pura-pura sakit.

---

## 6. Celah Eksploitasi & Risiko Perilaku Pengguna

### 6.1 Farming & akun palsu (Sybil)

| Vektor | Mitigasi |
|---|---|
| Komentar spam demi koin | Bayar saat komentar **tertangkap sistem** rekap (T+1), bukan saat klaim; min. panjang & keunikan; cap harian |
| Absen palsu / GPS palsu / satu HP dipakai absen banyak orang | Fondasi sudah kuat (swafoto kamera langsung + GPS + jam server + constraint unik). Tambah: geofence radius kantor, deteksi wajah/frame duplikat, 1 device = 1 akun absen |
| Multi-akun untuk referral & farming | 1 nomor WA terverifikasi = 1 akun (kolom `wa_terverifikasi` sudah ada); koin referral dibayar setelah pendaftar di-ACC admin |
| KPI/limbah laporan demi koin | Koin saat ACC ketua; analitik rasio ACC-per-ketua untuk deteksi ketua "setuju semua tanpa baca" |
| Engagement pod (grup WA like-balik-like) | Diminishing return per like; bobot like berdasar kebaruan & keragaman pemberi; like dari sesama cluster IP/device bernilai 0 |
| Streak dipertahankan lewat manipulasi zona waktu | Jam server WIB saja (pola absensi sudah benar — tiru di semua fitur koin) |

### 6.2 Teknis (API & klien)

- **Klaim ganda / replay**: klaim koin = idempoten. Constraint unik `(user_id, aksi, periode)`
  di database — pola "satu absen per hari" yang sudah dipakai adalah template yang tepat.
- **Ledger append-only**: tabel `transaksi_koin` hanya insert (tambah/saldo), saldo =
  turunan; TIDAK ADA update/hapus saldo. Audit bisa diperiksa kapan pun.
- **Race condition transfer/gift koin**: satu transaksi DB atomik dengan cek
  `saldo >= jumlah` di dalam transaksi (RPC/transaction Supabase) — bukan dua
  update terpisah.
- **Cheat mini game**: skor dihitung di server dari input minimal (seed/answer
  server); klien tidak pernah boleh kirim "saya menang, +2 koin".
- **Bot & skrip**: rate limiting per user/IP/device di SEMUA endpoint baru —
  pola rate limit login/OTP/daftar yang baru dipasang tinggal diperluas.
- **Penyalahgunaan storage foto Momen**: kompres + limit ukuran di server
  (pola 150 KB absensi), NSFW auto-scan, antrean moderasi, retensi.

### 6.3 Ekonomi & hukum komersial

- **Judian (paling bahaya secara hukum)**: apapun mekanisme stake-pool-cashout
  = judi menurut hukum Indonesia. Aturan besi: (1) koin TIDAK PERNAH bisa
  ditukar uang/barang/jasa riil; (2) tidak ada taruhan antar pemain;
  (3) tidak ada "roda keberuntungan" berhadiah bernilai — kotak hadiah harian
  isi item kosmetik saja.
- **RMT (jual beli akun/koin)**: item mayoritas account-bound; pajak gift 25%;
  deteksi pola transfer aneh (satu akung "ATM" menerima banyak gift kecil);
  larangan eksplisit di ToS.
- **Inflasi**: cap faucet + sink musiman + mata uang event terpisah (§1.3).
- **Hadiah fisik** (jaket, dll. dari koin): tunda dulu — implikasi pajak &
  mengubah status hukum koin dari "kosmetik tertutup" jadi "alat pembayaran".
  Kalau mau, konsultasi hukum dulu.

### 6.4 Moderasi konten & chat (UU ITE — tanggung jawab platform)

- **Chat global** = vektor terbesar: disinformasi politik, SARA, ujaran
  kebencian, scam link, spam rekrutmen. Platform yang lalai bisa dipersalahkan
  (UU ITE). Mitigasi wajib sebelum rilis: filter kata + link, slow mode,
  level minimum, laporan 1-klik + SLA moderator, retensi pendek, log audit,
  kill-switch per kanal (pola sakelar `chat_aktif` yang sudah ada → buat per kanal).
- **Foto Momen**: NSFW, hak cipta, **foto orang lain tanpa izin (UU PDP!)**,
  konten pencemaran nama baik → antrean moderasi manual sebelum publish +
  tombol hapus mandiri oleh pemilik + laporan.
- **Avatar**: hanya aset kurasi — jangan pernah buka upload gambar avatar bebas.
- **Nama tampilan**: ambil dari data resmi kader, bukan teks bebas (kalau bebas:
  impersonasi pengurus → kacau).

### 6.5 Psikososial & etika

- **Bullying skor**: jangan pernah ada leaderboard "terendah"; skor tidak turun
  drastis; tampilan opt-in. Skor publik di aplikasi organisasi = alat
  penghinaan bila salah desain.
- **Penyalahgunaan oleh organisasi sendiri**: skor harus murni dari kontribusi
  terverifikasi — bukan alat kunci fitur esensial ("skor rendah = tidak bisa
  absen/lapor") karena akan berubah jadi sistem represi & cerita media buruk.
- **Kecanduan / dark pattern**: streak anxiety dikompensasi streak freeze;
  push notification jam wajar; jangan loop "buka lagi dalam 10 menit".
- **Privasi**: profil publik hanya: nama, avatar kosmetik, tier, lencana,
  statistik agregat. TANPA nomor WA, lokasi, tanggal lahir penuh (fitur ultah
  internal tetap di ranah privat).

### 6.6 Kepatuhan UU PDP (data pribadi)

- Foto momen, skor perilaku, riwayat aktivitas = data pribadi → butuh dasar
  pemrosesan & kebijakan yang jelas di pendaftaran.
- Hak hapus: foto momen harus bisa dihapus mandiri + hilang dari cache/feed.
- Anak/umur: kalau ada anggota di bawah umur, hati-hati mempublikasikan foto.
- Export/kepemilikan data saat kader keluar dari organisasi.

### 6.7 Matriks ringkas fitur → risiko utama → mitigasi kunci

| Fitur | Risiko #1 | Mitigasi kunci |
|---|---|---|
| Koin dari absensi | Absen wakil/lokasi palsu | Geofence + wajah + 1 device 1 akun |
| Koin dari komentar | Spam | Bayar saat tertangkap rekap, T+1, cap |
| Koin dari KPI | Laporan sampah | Bayar saat ACC + analitik ketua |
| Momen (5 foto) | NSFW/hak cipta/PDP | Moderasi pra-publish + laporan |
| Chat global | Disinfo/SARA/scam (UU ITE) | Level gate + filter + moderator + kill-switch |
| Mini game | Cheat skor klien | Server-authoritative |
| Gift koin | RMT antar akun | Pajak 25% + deteksi pola |
| Skor/tier | Bullying, framing "social credit" | Rebrand + opt-in + tak pernah anjlok |
| Avatar | Upload NSFW | Aset kurasi saja, tanpa upload |
| Turnamen | Taruhan = judi | Hadiah dari sistem, bukan stake lawan |

---

## 7. Roadmap Bertahap (urutan = urutan risiko naik)

| Fase | Isi | Kenapa urutnya begitu |
|---|---|---|
| 0 | Ledger koin + klaim idempoten + rate limit semua endpoint baru + mata uang terkunci kosmetik | Fondasi anti-exploit dulu, fitur belakangan |
| 1 | Koin dari absensi & komentar terkonfirmasi, streak, leaderboard DPC, popup profil pencapaian | Pakai data/validasi yang SUDAH ada; risiko moderasi nol |
| 2 | Avatar kosmetik + toko + Momen (moderasi manual) | Sink koin pertama; moderasi mulai dijajal |
| 3 | Mini games async + turnamen DPC | Perlu server-authoritative game logic |
| 4 | Chat global per kanal | PALING berisiko — hanya setelah moderasi teruji di fase 2 |
| 5 | Battle pass musiman, kuis live massal, maskot | Retensi jangka panjang setelah loop terbukti |

## 8. Metrik Keberhasilan

- **North star**: % kader aktif-mingguan (absen lengkap + komentar lengkap).
- Retensi D7/D30 pengguna baru.
- Kepatuhan komentar (rekap) sebelum vs sesudah gamifikasi.
- Rasio koin faucet:sink (inflasi terkendali ± 1,2–1,5).
- Laporan moderasi per 1.000 pesan/foto (kesehatan komunitas).
- % Momen lolos moderasi vs ditolak (kualitas UGC).
