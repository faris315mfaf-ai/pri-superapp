# Bot Redaksi — Posting nyata & Antrean ACC (3A + 3B)

Status: **kode selesai, uji murni lulus; belum aktif di produksi** (13 Okt 2026). Posting nyata **mati**
secara bawaan. Tidak memuat rahasia.

## Alur

```
bot membuat video  →  tugas `siap_ditinjau`  →  Antrean ACC (Ruang Bot, master)
                                                   │ Setujui & jadwalkan
                                                   ▼
                          `disetujui` ──klaim atomik──▶ `posting` ──▶ `selesai` (terjadwal di sosmed)
                              ▲                             │ galat PASTI (belum terkirim)
                              └─────────────────────────────┤
                                                            └ galat AMBIGU (timeout/5xx) ▶ `gagal` (periksa manual)
   Minta edit ulang → tahap `edit` (bot membuat video lagi)     Tolak → `gagal` (tidak menambah hitungan gagal bot)
```

Semua perpindahan tahap atomik (`UPDATE ... WHERE tahap = <asal> RETURNING id`); hanya satu pemanggil yang menang.
Satu bot = satu tugas aktif, jadi bot yang videonya menunggu keputusan tidak membuat video baru sampai diputuskan.

## Pagar keselamatan

1. **Saklar `BOT_POSTING_AKTIF`** (env aplikasi; `1`/`true`/`ya`). Mati = tombol Setujui ditolak 503.
2. Sebelum posting: bot aktif, tidak dijeda (bot maupun global), platform tujuan dikenal, bot punya **tepat satu**
   profil upload-post, akun tujuan tertaut dan tidak perlu login ulang, video ada di stok, caption sah
   (tidak kosong, muat di batas platform).
3. **Tidak pernah mengulang sendiri.** Galat *pasti* (penolakan 4xx, gagal menyalin) → kembali ke `disetujui`,
   berkas dihapus, master menekan "Coba posting lagi". Galat *ambigu* (tanpa status, timeout, 5xx) → `gagal`,
   berkas **dibiarkan**, master memeriksa akun sosmed bot dulu. Status kosong/null dianggap ambigu.
4. **Anti-dobel:** kunci proses (Redis/memori, sama dengan unggah TVR Saya) + klaim atomik `disetujui → posting`.
5. **Jadwal tayang 10 menit ke depan** (dihitung ulang saat posting), supaya masih bisa dibatalkan.
6. Hanya master (`bolehRuangBot`) dan modul Ruang Bot aktif; pembatas laju; semua keputusan masuk Audit (`bot_acc`)
   dan umpan aktivitas bot.
7. Teks yang diposting = **persis caption yang disetujui** (dikirim sebagai caption khusus platform), bukan judul + caption
   seperti unggahan biasa; jadi tidak ada judul dobel dan batas karakter X/Threads benar-benar dijaga.
8. Balasan upload-post `success:false` tanpa rincian dan tanpa request_id diperlakukan **tidak pasti** (tidak diulang).
   Galat apa pun SESUDAH upload-post menjawab (mis. gagal mencatat riwayat) juga menandai tugas `gagal` untuk diperiksa,
   bukan membuka jalan posting ulang. Berkas pada kasus tidak pasti dicatat di `tvrku_post` dengan jadwal sapu.
9. **Tolak** pada tugas dari Video Wajib membuka lagi permintaannya (baris `bot_video_wajib` dihapus); kandidat sumber
   yang ditolak tetap terklaim sehingga tidak dipilih lagi.
10. Tugas `posting` yang mandek >15 menit ditandai "Periksa akun sosmed bot sebelum mengulang" — tidak diulang otomatis.

Catatan: tugas yang mandek di `posting` atau berakhir `gagal` (tidak pasti) tidak punya tombol keputusan lagi —
master memeriksa akun sosmed bot; bot sendiri tidak terblokir (tahap itu bukan tahap aktif). Bila pencatatan riwayat
gagal setelah upload sukses, berkas tetap bisa dibatalkan dari Riwayat (kunci berkas disimpan di tugas).

## Pratinjau & kredit

Kartu ACC memutar video dari stok mesin (lewat `/api/bot/acc/video`, Range diteruskan, diambil saat ditekan).
Caption bawaan = judul + `Sumber: <akun sumber>`; tanda merah bila tanpa kredit, kepanjangan, atau akun tujuan
bermasalah. Master bisa menyunting caption sebelum menyetujui.

## Membatalkan jadwal

Tombol "Batalkan jadwal" (selama >2 menit sebelum tayang) **menghapus berkas video** di penyimpanan. upload-post
tidak punya API pembatalan; ia mengunduh video saat menerbitkan, jadi tanpa berkas postingan gagal terbit.
Batasan: bila penyedia sudah mengunduhnya, postingan tetap tayang. Jeda bot **tidak** otomatis membatalkan jadwal
yang sudah ada (hanya tombol ini).

## Yang BELUM ada

- Mode `otomatis` belum menyetujui sendiri: semua video tetap lewat keputusan master.
- Caption dari otak bot (kini caption bawaan tanpa AI) dan pengecekan asal video (rancangan terpisah).
- Satu platform tujuan per bot (kolom `bot_redaksi.platform`).

## Mengaktifkan

1. SQL (prasyarat 67): `sql/70_bot_posting.sql` — perintah di kepala berkasnya, lalu `NOTIFY pgrst, 'reload schema';`.
2. Pastikan akun bot sudah tertaut ke profil upload-post dan platform tujuannya terhubung (Tautkan Profil, lalu
   Hubungkan Sosmed di TVR Saya akun bot).
3. **Uji dengan akun uji** dulu: set `BOT_POSTING_AKTIF=1` di env aplikasi, restart, setujui satu video,
   periksa jadwalnya di upload-post, lalu coba Batalkan jadwal. Matikan lagi bila belum yakin.

## Uji

`tests/uji-bot-posting.mts` (50): bendera, platform, kredit/caption, jadwal, galat pasti vs ambigu, validasi aksi,
alasan menolak, tanda pemeriksaan. Lapisan basis data dan jaringan (`bot-posting.ts`) belum punya uji otomatis; ia
ditinjau terpisah dan harus dicoba dengan akun uji sebelum posting diaktifkan.
