#!/usr/bin/env bash
# =====================================================================
# PERBARUI APLIKASI DI VPS (12 Sep 2026)
#
# Satu perintah untuk menerapkan perubahan kode: ambil versi terbaru,
# bangun, ganti, uji, dan KEMBALIKAN sendiri kalau hasilnya tidak sehat.
#
# Dipasang juga sebagai perintah pendek:  pri-perbarui
#
# Kenapa ada pengembalian otomatis: versi lama SELALU disimpan sebagai
# cadangan sebelum yang baru dinyalakan. Kalau yang baru tidak menjawab,
# yang lama dihidupkan lagi dalam hitungan detik — tanpa perlu menunggu
# siapa pun sadar dan tanpa perlu tahu perintah pemulihan.
#
# CARA PAKAI (root, di VPS):
#   pri-perbarui                # ambil kode terbaru lalu terapkan
#   pri-perbarui --tanpa-tarik  # bangun ulang saja, tanpa git pull
#   pri-perbarui --skrip-saja   # ambil kode & segarkan skrip perawatan
#                               # saja: tidak membangun, tidak menyentuh
#                               # aplikasi yang sedang melayani orang.
#                               # Dipakai kalau yang ditambahkan hanya
#                               # skrip di folder vps/ (mis. perbaikan
#                               # database), bukan kode aplikasi.
# =====================================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root: sudo $0" >&2; exit 1; }

SUMBER=/opt/pri/sumber
APP=/opt/pri/aplikasi
SKRIP=/opt/pri-skrip
PORT="$(grep -m1 '^PORT_APLIKASI=' "$APP/.env" 2>/dev/null | cut -d= -f2- || echo 3001)"
PORT="${PORT:-3001}"
TARIK=1
SKRIP_SAJA=0
case "${1:-}" in
  --tanpa-tarik) TARIK=0 ;;
  --skrip-saja)  SKRIP_SAJA=1 ;;
  "")            ;;
  *) echo "Pilihan tidak dikenal: $1 (yang ada: --tanpa-tarik, --skrip-saja)" >&2; exit 1 ;;
esac

# Pasang sendiri sebagai perintah pendek, supaya pembaruan berikutnya
# cukup mengetik satu kata dari mana pun.
if [ ! -L /usr/local/bin/pri-perbarui ] || [ "$(readlink -f /usr/local/bin/pri-perbarui)" != "$(readlink -f "$0")" ]; then
  # "|| true": kalau pemasangan pintasan gagal (mis. /usr/local/bin tidak
  # bisa ditulis), itu hal kecil — pembaruan tetap harus jalan, bukan
  # berhenti diam-diam di baris ini.
  { ln -sf "$(readlink -f "$0")" /usr/local/bin/pri-perbarui 2>/dev/null \
    && echo "  perintah pendek dipasang: pri-perbarui"; } || true
fi

cd "$SUMBER"

if [ "$TARIK" = "1" ]; then
  echo "== 1/6 Mengambil versi terbaru =="
  LAMA="$(git rev-parse --short HEAD)"
  git fetch --quiet origin main
  BARU="$(git rev-parse --short origin/main)"
  if [ "$LAMA" = "$BARU" ]; then
    echo "  sudah versi terbaru ($LAMA) — tidak ada yang perlu diambil"
  else
    echo "  $LAMA -> $BARU"
    git --no-pager log --oneline "$LAMA..origin/main" | sed 's/^/    /'
  fi
  git pull --quiet --ff-only origin main
else
  echo "== 1/6 Melewati pengambilan kode (--tanpa-tarik) =="
fi

echo "== 2/6 Menyegarkan skrip & susunan container =="
mkdir -p "$SKRIP" "$APP/jadwal"
cp -r "$SUMBER/vps/"* "$SKRIP/"
cp "$SUMBER/vps/aplikasi/Dockerfile" "$SUMBER/vps/aplikasi/docker-compose.yml" "$APP/"
cp "$SUMBER/vps/aplikasi/jadwal/"* "$APP/jadwal/"
chmod +x "$APP/jadwal/"*.sh "$SKRIP/"*.sh 2>/dev/null || true

# Berhenti di sini kalau yang dibutuhkan memang cuma skripnya. Membangun
# ulang aplikasi memakan menit dan sempat memutus layanan — tidak pantas
# dibayar hanya untuk menyalin beberapa berkas skrip.
if [ "$SKRIP_SAJA" = "1" ]; then
  echo
  echo "Skrip perawatan sudah yang terbaru di $SKRIP:"
  ls -1 "$SKRIP"/*.sh | sed 's#.*/#  #'
  echo
  echo "Aplikasi TIDAK disentuh (masih versi $(docker image inspect -f '{{.Id}}' pri-aplikasi:terbaru 2>/dev/null | cut -c8-19 || echo '?'))."
  echo "Untuk menerapkan perubahan kode aplikasi, jalankan: pri-perbarui"
  exit 0
fi

echo "== 3/6 Menyimpan versi sekarang sebagai cadangan =="
# Kalau yang baru bermasalah, inilah yang dihidupkan kembali.
if docker image inspect pri-aplikasi:terbaru >/dev/null 2>&1; then
  docker tag pri-aplikasi:terbaru pri-aplikasi:sebelumnya
  echo "  cadangan siap (pri-aplikasi:sebelumnya)"
  ADA_CADANGAN=1
else
  echo "  belum ada versi sebelumnya — pemasangan pertama"
  ADA_CADANGAN=0
fi

echo "== 4/6 Membangun =="
cd "$APP"
docker compose build aplikasi

echo "== 5/6 Mengganti yang sedang jalan =="
docker compose up -d --force-recreate aplikasi
echo -n "  menunggu aplikasi menjawab"
SIAP=0
for i in $(seq 1 40); do
  if curl -fsS --max-time 5 "http://127.0.0.1:$PORT/api/hidup" >/dev/null 2>&1; then SIAP=1; echo " OK"; break; fi
  echo -n "."; sleep 3
done

if [ "$SIAP" -ne 1 ]; then
  echo
  echo "VERSI BARU TIDAK MENJAWAB — mengembalikan versi sebelumnya." >&2
  docker compose logs --tail=30 aplikasi >&2
  if [ "$ADA_CADANGAN" = "1" ]; then
    docker tag pri-aplikasi:sebelumnya pri-aplikasi:terbaru
    docker compose up -d --force-recreate aplikasi
    echo -n "  menunggu versi lama hidup" >&2
    for i in $(seq 1 40); do
      curl -fsS --max-time 5 "http://127.0.0.1:$PORT/api/hidup" >/dev/null 2>&1 && { echo " OK" >&2; break; }
      echo -n "." >&2; sleep 3
    done
    echo "Versi lama sudah jalan lagi. Perbaiki kodenya, lalu ulangi." >&2
  else
    echo "Tidak ada cadangan untuk dikembalikan." >&2
  fi
  exit 1
fi

echo "== 6/6 Memeriksa hasil =="
curl -s --max-time 30 "http://127.0.0.1:$PORT/api/sehat" | head -c 200; echo

# --- Daftar host gambar --------------------------------------------
# Diperiksa sejak 12 Sep 2026, setelah kejadian ini: aplikasi terbangun
# tanpa SUPABASE_URL, next/image menolak SEMUA foto dari server sendiri,
# dan yang terlihat pengguna hanyalah foto kosong di mana-mana — tanpa
# satu pun galat di log. Nyaris mustahil ditebak dari gejalanya.
#
# Alamat berkas palsu sengaja dipakai: yang ditanyakan bukan ada atau
# tidaknya berkas, melainkan boleh atau tidaknya HOST itu.
HOST_DB="$(grep -m1 '^SUPABASE_URL=' "$APP/.env" 2>/dev/null | cut -d= -f2- \
           | tr -d '"' | sed 's#^https\?://##; s#/.*$##' || true)"
if [ -n "$HOST_DB" ]; then
  UJI="https%3A%2F%2F$HOST_DB%2Fstorage%2Fv1%2Fobject%2Fpublic%2Fuji%2Fuji.jpg"
  JAWAB="$(curl -s --max-time 20 "http://127.0.0.1:$PORT/_next/image?url=$UJI&w=64&q=75" | head -c 200 || true)"
  case "$JAWAB" in
    *"is not allowed"*)
      echo >&2
      echo "  PERINGATAN BESAR: foto TIDAK AKAN TAMPIL." >&2
      echo "  next/image menolak gambar dari $HOST_DB." >&2
      echo "  Sebabnya SUPABASE_URL tidak sampai ke proses build." >&2
      echo "  Periksa baris SUPABASE_URL di $APP/.env, lalu ulangi: pri-perbarui" >&2
      ;;
    *) echo "  daftar host gambar: $HOST_DB diterima" ;;
  esac
fi
# "|| true": tanpa itu, env.txt yang tidak ada membuat pembaruan yang
# SUDAH BERHASIL berakhir dengan status gagal di baris terakhir ini —
# tanpa pesan "SELESAI" dan tanpa petunjuk pengembalian.
DOMAIN_APP="$(grep -m1 '^APP_URL=' "$APP/env.txt" 2>/dev/null | cut -d= -f2- | sed 's#^https\?://##; s#/.*$##' || true)"
if [ -n "$DOMAIN_APP" ]; then
  curl -s -o /dev/null -m 30 -w "  https://$DOMAIN_APP -> %{http_code}\n" "https://$DOMAIN_APP/api/hidup" || true
fi
echo "  versi kode: $(git -C "$SUMBER" rev-parse --short HEAD) ($(git -C "$SUMBER" log -1 --format=%s | head -c 60))"

echo
echo "SELESAI. Kalau ternyata ada yang salah, kembalikan dengan:"
echo "  docker tag pri-aplikasi:sebelumnya pri-aplikasi:terbaru && docker compose -f $APP/docker-compose.yml up -d --force-recreate aplikasi"
