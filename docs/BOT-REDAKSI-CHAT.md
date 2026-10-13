# Bot Redaksi — otak berkepribadian, room chat, dan agen koordinator

Status: **tahap 1–3 dibangun di kode** (13 Okt 2026); belum aktif di produksi sebelum SQL 73–74 dan API key dipasang. Tidak memuat rahasia.

## Tujuan (dari pemilik)
Tiap agen punya otak dan cara berpikir sendiri. Ada satu **room chat** bersama tempat pemilik bercakap dengan
agen, dan satu **agen koordinator** (admin) yang bertugas membagi tugas ke agen lain.

## Prinsip keselamatan (berlaku untuk semua tahap)
1. **Bicara ≠ bertindak.** Teks bot/koordinator tidak pernah langsung menjadi aksi. Aksi hanya lewat kosakata tertutup
   (daftar aksi tetap) yang dieksekusi KODE, melalui pagar yang sudah ada (jeda, kuota, jam aktif, anti-tabrakan,
   Antrean ACC). Model tidak bisa menambah jenis aksi.
2. **Usulan harus disetujui manusia** (tombol Setujui/Tolak di room) sampai pemilik secara sadar mengizinkan otonomi.
3. **Tanpa percakapan berantai antar-agen:** agen hanya menjawab pesan manusia; koordinator hanya merespons manusia.
   Tidak ada bot-membalas-bot (mencegah lingkaran biaya token).
4. **Biaya terkendali:** pembatas laju per pengirim, maksimal 3 jawaban agen per pesan, keluaran ≤400 token, konteks
   terakhir 12 pesan. Pemakaian token tercatat di `ai_pemakaian` (fitur `bot:chat`, `bot:koordinator`).
5. **Berpijak pada fakta:** setiap jawaban agen diberi ringkasan keadaan NYATA dirinya (tugas aktif, kuota, jeda) dan
   dilarang mengaku melakukan hal yang tidak ia lakukan.
6. Kunci API tiap agen tetap terenkripsi dan hanya dipakai di aplikasi (lihat `BOT-REDAKSI-OTAK.md`).

## Tahap
| # | Isi | Status |
|---|---|---|
| 1 | **Kepribadian masuk prompt**: `peran` + `persona` tiap bot dipakai di hook, caption, dan chat; master menyuntingnya di seksi Otak Bot | dibangun |
| 2 | **Room chat**: tabel `bot_chat`, API, tab Chat di Ruang Bot; agen yang disebut (@Raka) menjawab sesuai kepribadian dan keadaannya | dibangun |
| 3 | **Koordinator + penugasan**: Nara membaca permintaan, mengusulkan pembagian tugas (kosakata tetap), usulan muncul sebagai kartu yang disetujui master; tugas manual per-URL | **dibangun** (tab Koordinator + kartu di Chat; API key Nara di TVR Saya → Otak Bot) |

## Tahap 3 — cara kerja (dibangun)

- **Di mana API key Nara dipasang:** TVR Saya (akun master) → seksi **Otak Bot (API key)** → kartu **Nara · Koordinator Redaksi**
  (paling atas, bertepi merah muda). Pilih penyedia (DeepSeek/Gemini), tempel key, **Simpan**, lalu **Uji**. Key tersimpan terenkripsi
  (AES-GCM, AAD `bot:0`, kunci induk `BOT_KUNCI_INDUK`), tulis-saja, tidak pernah dikembalikan ke layar. Peran dan watak Nara
  disunting di kartu yang sama. API: `/api/bot/koordinator`.
- **Memberi arahan:** tab **Koordinator** di Ruang Bot (atau tulis `@Nara …` di tab **Chat**). Nara memakai key-nya untuk membaca
  permintaan dan keadaan NYATA tiap agen (tugas, kuota, jeda, tidur/bangun), lalu menjawab JSON.
- **Kosakata tertutup:** `kerjakan_url` (wajib tautan yang ditulis pemilik persis di pesannya; tautan karangan model dibuang),
  `cari_sekarang`, `ubah_kuota` (1–6), `jeda`, `lanjut`. Selain itu dibuang. Judul usulan disusun kode, bukan model.
- **Pagar saat usulan dibuat dan diperiksa ULANG saat disetujui:** agen tidur (tanpa API key) tidak bisa ditugasi; bot dijeda,
  nonaktif, punya tugas berjalan, atau kuota habis ditolak; maksimal 3 usulan terbuka; usulan basi hangus 2 jam.
- **Eksekusi:** hanya setelah master menekan **Setujui & jalankan** (`/api/bot/usulan`). `kerjakan_url` memakai gerbang yang sama
  dengan pengambilan Video Wajib (`hitungPutusan`), memeriksa tabrakan dengan sistem manusia dan bot lain, lalu mengklaim tautan
  secara atomik. Hasil video tetap berhenti di Antrean ACC. Nara tidak bisa memposting maupun menyetujui usulannya sendiri.
- **Jeda:** `jeda` menjeda bot sampai `lanjut` (tanpa penghitung waktu).
- **Yang belum:** denah isometrik empat ruang (kerja, meeting, koordinator, kamar tidur) seperti di mockup belum dipindah ke
  aplikasi; fungsinya sudah ada di tab Koordinator dan Chat. Tautan `kerjakan_url` belum diperiksa sidik visual (tidak ada pratinjau),
  dan bahan hook hanya topik dari pesan Anda.

## Mengaktifkan tahap 3

1. Berurutan: `sql/73_bot_chat.sql` lalu `sql/74_bot_koordinator.sql` (prasyarat 67), dan `NOTIFY pgrst, 'reload schema';`.
2. `BOT_KUNCI_INDUK` sudah terpasang di server (lihat `BOT-REDAKSI-OTAK.md`).
3. TVR Saya → Otak Bot → kartu Nara: pasang API key, Simpan, Uji.
4. Ruang Bot → Koordinator: beri arahan, mis. “kerjakan berita banjir dari https://youtu.be/… untuk @Raka”.
