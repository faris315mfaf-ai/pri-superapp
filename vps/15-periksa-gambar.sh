#!/usr/bin/env bash
# =====================================================================
# MEMERIKSA KENAPA FOTO DITOLAK (12 Sep 2026)
#
# Gejalanya: next/image menjawab «"url" parameter is not allowed» untuk
# gambar dari server penyimpanan sendiri, jadi seluruh foto kosong.
#
# Daftar host yang boleh itu ditentukan SAAT APLIKASI DIBANGUN dan
# tersimpan di dalam image. Jadi yang perlu dilihat bukan kode di folder
# sumber, melainkan apa yang BENAR-BENAR terbawa ke dalam aplikasi yang
# sedang jalan. Skrip ini membandingkan keduanya.
#
# Tidak mengubah apa pun — hanya membaca dan melapor.
#
# CARA PAKAI (root, di VPS):
#   bash 15-periksa-gambar.sh
# =====================================================================
set -uo pipefail

SUMBER=/opt/pri/sumber
APP=/opt/pri/aplikasi
CT=pri-aplikasi

echo "===== 1. KODE DI FOLDER SUMBER ====="
if [ -d "$SUMBER/.git" ]; then
  echo "  versi: $(git -C "$SUMBER" log --oneline -1 2>/dev/null)"
else
  echo "  (bukan folder git?)"
fi
if grep -q "HOST_BERKAS_TETAP" "$SUMBER/next.config.ts" 2>/dev/null; then
  echo "  next.config.ts: SUDAH memuat daftar host tetap"
else
  echo "  next.config.ts: BELUM memuat daftar host tetap — kode belum terbaru"
fi

# Next memilih next.config.js / .mjs LEBIH DULU daripada .ts. Satu berkas
# lama yang tertinggal di sini membuat seluruh perubahan di .ts diabaikan
# tanpa pesan apa pun.
LAIN="$(ls "$SUMBER"/next.config.* 2>/dev/null | grep -v '\.ts$' || true)"
if [ -n "$LAIN" ]; then
  echo "  MENCURIGAKAN: ada berkas konfigurasi lain yang MENGALAHKAN next.config.ts:"
  echo "$LAIN" | sed 's/^/    /'
fi

echo
echo "===== 2. NILAI YANG DIPAKAI SAAT MEMBANGUN ====="
NILAI="$(grep -m1 '^SUPABASE_URL=' "$APP/.env" 2>/dev/null || true)"
if [ -n "$NILAI" ]; then
  echo "  $APP/.env -> $NILAI"
else
  echo "  $APP/.env TIDAK memuat SUPABASE_URL"
  echo "  (inilah yang dibaca docker compose untuk args saat membangun)"
fi
if grep -q 'SUPABASE_URL' "$APP/docker-compose.yml" 2>/dev/null; then
  echo "  docker-compose.yml: meneruskan SUPABASE_URL ke proses build (ada)"
else
  echo "  docker-compose.yml: TIDAK meneruskan SUPABASE_URL ke proses build"
fi

echo
echo "===== 3. IMAGE & CONTAINER YANG JALAN ====="
docker image inspect -f '  image pri-aplikasi:terbaru dibuat {{.Created}}' pri-aplikasi:terbaru 2>/dev/null \
  || echo "  image pri-aplikasi:terbaru tidak ada"
ID_IMG="$(docker image inspect -f '{{.Id}}' pri-aplikasi:terbaru 2>/dev/null || true)"
ID_CT="$(docker inspect -f '{{.Image}}' "$CT" 2>/dev/null || true)"
echo "  container $CT memakai image: ${ID_CT:0:19}"
echo "  image terbaru hasil build  : ${ID_IMG:0:19}"
if [ -n "$ID_IMG" ] && [ -n "$ID_CT" ] && [ "$ID_IMG" != "$ID_CT" ]; then
  echo "  !! CONTAINER MASIH MEMAKAI IMAGE LAMA — belum dinyalakan ulang"
fi

echo
echo "===== 4. DAFTAR HOST GAMBAR DI DALAM APLIKASI YANG JALAN ====="
# Inilah kebenarannya. Sisanya cuma dugaan.
HASIL="$(docker exec "$CT" node -e '
  const fs = require("fs");
  for (const p of ["/app/.next/required-server-files.json"]) {
    try {
      const c = JSON.parse(fs.readFileSync(p, "utf8")).config;
      console.log(JSON.stringify({
        remotePatterns: c.images.remotePatterns,
        dangerouslyAllowLocalIP: c.images.dangerouslyAllowLocalIP,
      }));
      process.exit(0);
    } catch {}
  }
  process.exit(3);
' 2>/dev/null || true)"

DI_DAFTAR=tidak
if [ -n "$HASIL" ]; then
  echo "$HASIL" | tr ',' '\n' | grep -o '"hostname":"[^"]*"' | sed 's/"hostname":"/    /; s/"$//'
  case "$HASIL" in
    *db.pri-superapp.com*) DI_DAFTAR=ya; echo "  -> db.pri-superapp.com ADA di daftar" ;;
    *) echo "  -> db.pri-superapp.com TIDAK ADA di daftar" ;;
  esac
  case "$HASIL" in
    *'"dangerouslyAllowLocalIP":true'*) IZIN_DALAM=ya;   echo "  -> gambar dari alamat dalam: DIIZINKAN" ;;
    *)                                  IZIN_DALAM=tidak; echo "  -> gambar dari alamat dalam: masih diperiksa Next" ;;
  esac
else
  echo "  tidak terbaca dari required-server-files.json, dicoba cara lain:"
  if docker exec "$CT" sh -c 'grep -rqs "db.pri-superapp.com" /app/.next' 2>/dev/null; then
    echo "    nama host ditemukan di dalam aplikasi"
  else
    echo "    nama host TIDAK ditemukan di dalam aplikasi sama sekali"
  fi
fi

echo
echo "===== 5. JAWABAN NYATA DARI APLIKASI ====="
PORT="$(grep -m1 '^PORT_APLIKASI=' "$APP/.env" 2>/dev/null | cut -d= -f2- || true)"
PORT="${PORT:-3001}"
DITOLAK=tidak
for H in db.pri-superapp.com pichnkyjepsirpclofhs.supabase.co; do
  J="$(curl -s --max-time 20 \
       "http://127.0.0.1:$PORT/_next/image?url=https%3A%2F%2F$H%2Fstorage%2Fv1%2Fobject%2Fpublic%2Fuji%2Fuji.jpg&w=64&q=75" \
       | head -c 80 || true)"
  case "$J" in
    *"not allowed"*) echo "  $H -> DITOLAK"
                     [ "$H" = db.pri-superapp.com ] && DITOLAK=ya ;;
    *"upstream"*)    echo "  $H -> boleh (berkas ujinya saja yang tidak ada)" ;;
    *)               echo "  $H -> $J" ;;
  esac
done

echo
echo "===== 6. KESIMPULAN ====="
# Next memakai pesan penolakan yang SAMA PERSIS untuk dua hal yang sangat
# berbeda: host tidak terdaftar, atau host mengarah ke alamat jaringan
# dalam. Tanpa dipisahkan di sini, pencarian sebabnya mudah salah arah.
if [ "$DITOLAK" = tidak ]; then
  echo "  Tidak ada yang perlu diperbaiki: gambar dari db.pri-superapp.com diterima."
elif [ "$DI_DAFTAR" = tidak ]; then
  echo "  SEBAB: db.pri-superapp.com tidak ada di daftar host yang dibawa"
  echo "         aplikasi saat dibangun. Bangun ulang: pri-perbarui"
else
  echo "  Host SUDAH terdaftar tapi tetap ditolak — berarti bukan soal daftar."
  echo "  SEBAB: Next 16 menolak gambar yang nama hostnya mengarah ke alamat"
  echo "         jaringan DALAM. Di server ini db.pri-superapp.com memang"
  echo "         sengaja diarahkan ke dalam (extra_hosts) supaya cepat."
  if [ "${IZIN_DALAM:-tidak}" = ya ]; then
    echo "  Padahal izinnya sudah menyala di aplikasi ini — laporkan hasil ini."
  else
    echo "  Perbaikannya sudah ada di kode terbaru. Ambil lalu bangun ulang:"
    echo "    pri-perbarui"
  fi
  echo
  echo "  Bukti dari catatan aplikasi (kalau ada):"
  docker logs --tail 300 "$CT" 2>&1 | grep -i "private IP" | tail -3 | sed 's/^/    /' \
    || echo "    (tidak ada barisnya)"
fi

echo
echo "Selesai membaca. Tidak ada yang diubah."
