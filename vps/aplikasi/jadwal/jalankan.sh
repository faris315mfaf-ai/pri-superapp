#!/bin/sh
# Menyusun jadwal lalu menyalakan penjadwal. Jadwalnya disamakan dengan
# vercel.json supaya perilaku aplikasi tidak berubah setelah pindah.
set -eu
: "${APP_URL:?APP_URL belum diisi}"
: "${CRON_SECRET:?CRON_SECRET belum diisi — tanpa ini tugas berkala akan ditolak 403}"

mkdir -p /etc/crontabs
cat > /etc/crontabs/root <<'JADWAL'
# menit  jam  tanggal  bulan  hari
*/5  * * * * /panggil.sh sinkron-komen
*/10 * * * * /panggil.sh pantau-server
# Rekonsiliasi KPI digeser ke menit 9,24,39,54 (28 Sep 2026): dulu menit
# 0,15,30,45 — bersamaan dengan sinkron-komen, sinkron-absensi,
# jadwal-tayang, dan pemantau, sehingga lima tugas menyerbu database pada
# detik yang sama.
9,24,39,54 * * * * /panggil.sh rekonsiliasi-kpi
# Absensi dari SADAR (14 Sep 2026): SuperApp hanya menampilkan; datanya
# ditarik dari sadar-pri.id tiap 5 menit (hari ini + kemarin + susulan).
*/5  * * * * /panggil.sh sinkron-absensi
# Posting terjadwal TV Rakyat (15 Sep 2026): Ayrshare menerbitkan sendiri
# tanpa memberi tahu aplikasi, jadi hasilnya ditanyakan berkala supaya
# catatan videonya ikut selesai (status, kanal Konten, wajib komentar).
*/5  * * * * /panggil.sh jadwal-tayang
# Angka per video dari upload-post (25 Sep 2026, dirombak 26 Sep): tiap
# 5 menit ±4 menit kerja (maks ±200 permintaan/menit). Seluruh video akun
# tersambung dikatalogkan; video hari ini disegarkan ±tiap 20 menit,
# kemarin tiap 2 jam, 2–6 hari tiap 12 jam, yang lama seminggu sekali
# (29 Sep 2026: jadwal lama butuh 3x kemampuan robot). Menit 2,7,12,… supaya tidak
# berbarengan dengan tugas lain di menit kelipatan 5.
2,7,12,17,22,27,32,37,42,47,52,57 * * * * /panggil.sh metrik-video
# Antrean siaran (15 Okt 2026): tiap menit mengirim item siaran yang sudah jatuh
# giliran (Siaran Koordinator ke akun anggota, bertahap ±45 dtk) dan memanggil
# karakter anggota ke Ruang Bot. Satu putaran sekaligus (kunci di aplikasi).
* * * * * /panggil.sh siaran
# Pengingat Video Wajib (15 Okt 2026): tiap 10 menit memeriksa perintah wajib
# posting; dua jam sebelum batas jam, anggota yang belum memposting dikabari
# (sekali per perintah per hari). Menit 6,16,… supaya tidak berbarengan.
6,16,26,36,46,56 * * * * /panggil.sh video-wajib
# Rekaman angka nasional TV Rakyat (12 Sep 2026). Sekali sehari sudah
# cukup: yang dibutuhkan panel kenaikan adalah SATU titik pembanding
# per hari. Pukul 23.50 WIB = 16.50 UTC — hampir tutup hari, jadi
# rekamannya mewakili hasil hari itu, bukan hasil setengah hari.
50 16 * * * /panggil.sh rekam-metrik
JADWAL

echo "Penjadwal siap. Waktu server: $(date '+%d/%m/%Y %H:%M:%S %Z')"
echo "Sasaran: ${APP_URL}"
sed 's/^/  /' /etc/crontabs/root

# Menunggu aplikasi benar-benar siap sebelum tugas pertama, supaya
# panggilan pertama tidak gagal hanya karena aplikasinya masih memuat.
i=0
while [ "$i" -lt 60 ]; do
  curl -fsS --max-time 5 "${APP_URL}/api/hidup" >/dev/null 2>&1 && break
  i=$((i + 1))
  sleep 5
done
[ "$i" -lt 60 ] && echo "Aplikasi menjawab — jadwal mulai berjalan." \
                || echo "PERINGATAN: aplikasi belum menjawab, jadwal tetap dijalankan."

# -f: tetap di depan (supaya Docker bisa memantau), -l 8: catat semuanya.
exec crond -f -l 8
