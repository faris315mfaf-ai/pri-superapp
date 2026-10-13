# Bot Redaksi — otak berkepribadian, room chat, dan agen koordinator

Status: **rancangan + tahap 1–2 dibangun** (13 Okt 2026). Tidak memuat rahasia.

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
| 3 | **Koordinator + penugasan**: agen koordinator membaca permintaan, mengusulkan pembagian tugas (kosakata tetap), usulan muncul sebagai kartu yang disetujui master; tugas manual per-URL | berikutnya |

## Tahap 3 (rencana, belum dibangun)
- Koordinator bukan baris `bot_redaksi` (supaya runner tidak menganggapnya pekerja): tabel `bot_koordinator` satu baris,
  kunci API sendiri (enkripsi sama, AAD `bot:0`).
- Keluaran koordinator: JSON `{ balasan, usulan: [{ bot, aksi, ... }] }`. `aksi` ∈ {`kerjakan_url`, `cari_sekarang`,
  `ubah_kuota`, `jeda`, `lanjut`} dengan parameter divalidasi ketat. Aksi lain diabaikan.
- `kerjakan_url`: kandidat dibuat dari URL (kunci kanonik, cek tabrakan manusia/asal/sidik) lalu diklaim atomik untuk
  bot itu; tetap berhenti di Antrean ACC.
- Tiap usulan tersimpan di `bot_chat` bertanda `usulan` + status (menunggu/disetujui/ditolak/kedaluwarsa) dan masuk Audit.
