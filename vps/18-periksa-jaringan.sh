#!/usr/bin/env bash
# =====================================================================
# WEBSITE TIDAK TERJANGKAU PADAHAL SERVER HIDUP (12 Sep 2026)
#
# Gejala dari luar: SSH (22) menjawab, tapi 80 & 443 TIME OUT — bukan
# "ditolak". Kalau Caddy sekadar mati, kernel menjawab "ditolak" seketika.
# Time out berarti paketnya DIJATUHKAN. Tiga pelaku yang mungkin, dan
# skrip ini memeriksa ketiganya berurutan, memperbaiki yang bisa:
#
#   1. Caddy (container) tidak jalan / tidak mendengar 80 & 443.
#   2. UFW kehilangan izin 80/443 (default-nya DROP semua yang masuk).
#   3. Semua di dalam beres → yang menjatuhkan ada DI LUAR mesin:
#      firewall di panel Hostinger. Itu tidak bisa diperbaiki dari sini,
#      dan skrip ini mengatakannya terang-terangan alih-alih menebak.
#
# CARA PAKAI (root, di VPS):
#   bash /opt/pri/sumber/vps/18-periksa-jaringan.sh
# =====================================================================
set -uo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root." >&2; exit 1; }

DIPERBAIKI=0
MASALAH=0

echo "===== 1. CADDY ====="
CT="$(docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null \
      | awk -F'\t' 'index($2,"caddy"){print $1"\t"$3; exit}')"
NAMA_CT="${CT%%$'\t'*}"
STATUS_CT="${CT#*$'\t'}"
if [ -z "$NAMA_CT" ]; then
  echo "  container Caddy TIDAK ADA sama sekali."
  MASALAH=1
else
  echo "  container: $NAMA_CT ($STATUS_CT)"
  case "$STATUS_CT" in
    Up*) ;;
    *)
      echo "  -> tidak jalan; dinyalakan..."
      if docker start "$NAMA_CT" >/dev/null 2>&1; then
        sleep 3
        echo "  -> Caddy dinyalakan."
        DIPERBAIKI=1
      else
        echo "  -> GAGAL menyalakan. Catatan terakhir:"
        docker logs --tail 20 "$NAMA_CT" 2>&1 | sed 's/^/     /'
        MASALAH=1
      fi
      ;;
  esac
fi

echo
echo "===== 2. PORT 80 & 443 DI DALAM MESIN ====="
# Diperiksa lewat docker-proxy / ss: siapa yang mendengar di 0.0.0.0:80/443.
for P in 80 443; do
  if ss -tlnH 2>/dev/null | awk '{print $4}' | grep -qE "(^|:)$P$"; then
    echo "  port $P: ada yang mendengar"
  else
    echo "  port $P: TIDAK ADA yang mendengar"
    MASALAH=1
  fi
done
# Jawaban nyata dari dalam: Caddy harus mengalihkan http -> https (308).
KODE_LOKAL="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 -H 'Host: pri-superapp.com' http://127.0.0.1/ 2>/dev/null || echo 000)"
echo "  http://127.0.0.1 (Host pri-superapp.com) -> $KODE_LOKAL"
if [ "$KODE_LOKAL" = "000" ] && [ -n "$NAMA_CT" ]; then
  echo "  -> Caddy tidak menjawab dari dalam; dimulai ulang..."
  docker restart "$NAMA_CT" >/dev/null 2>&1 && sleep 4
  KODE_LOKAL="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 -H 'Host: pri-superapp.com' http://127.0.0.1/ 2>/dev/null || echo 000)"
  echo "  -> setelah dimulai ulang: $KODE_LOKAL"
  [ "$KODE_LOKAL" != "000" ] && DIPERBAIKI=1 || MASALAH=1
fi

echo
echo "===== 3. FIREWALL (UFW) ====="
if command -v ufw >/dev/null 2>&1; then
  UFW="$(ufw status 2>/dev/null || true)"
  echo "$UFW" | head -1 | sed 's/^/  /'
  if echo "$UFW" | grep -q "^Status: active"; then
    for P in 80 443; do
      if echo "$UFW" | grep -qE "^$P(/tcp)?\s+ALLOW"; then
        echo "  port $P: diizinkan"
      else
        echo "  port $P: TIDAK diizinkan -> dibuka sekarang"
        ufw allow "$P"/tcp >/dev/null 2>&1 && DIPERBAIKI=1 || MASALAH=1
      fi
    done
    echo "$UFW" | grep -qE "^(22|OpenSSH)(/tcp)?\s+ALLOW" \
      && echo "  port 22: diizinkan" \
      || { echo "  port 22: TIDAK diizinkan -> dibuka (jangan sampai terkunci)"; ufw allow OpenSSH >/dev/null 2>&1 || true; }
  else
    echo "  ufw tidak aktif — bukan dia pelakunya."
  fi
else
  echo "  ufw tidak terpasang."
fi

echo
echo "===== 4. ATURAN DROP LAIN (iptables/nft) ====="
# Aturan DROP eksplisit untuk 80/443 di luar ufw — jarang, tapi kalau ada
# harus terlihat, bukan ditebak.
DROP="$(iptables -S 2>/dev/null | grep -E -- '--dport (80|443)\b' | grep -E 'DROP|REJECT' || true)"
if [ -n "$DROP" ]; then
  echo "  DITEMUKAN aturan yang menjatuhkan 80/443:"
  echo "$DROP" | sed 's/^/    /'
  MASALAH=1
else
  echo "  tidak ada aturan DROP/REJECT eksplisit untuk 80/443."
fi
POL="$(iptables -S INPUT 2>/dev/null | head -1 || true)"
[ -n "$POL" ] && echo "  kebijakan INPUT: $POL"

echo
echo "===== 5. DARI LUAR (lewat alamat publik sendiri) ====="
IP_PUBLIK="$(curl -s --max-time 8 https://api.ipify.org 2>/dev/null || true)"
echo "  alamat publik mesin ini: ${IP_PUBLIK:-tidak terbaca}"
if [ -n "$IP_PUBLIK" ]; then
  KODE_LUAR="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H 'Host: pri-superapp.com' "http://$IP_PUBLIK/" 2>/dev/null || echo 000)"
  echo "  http://$IP_PUBLIK (dari mesin sendiri) -> $KODE_LUAR"
fi

echo
echo "===== KESIMPULAN ====="
if [ "$DIPERBAIKI" = 1 ]; then
  echo "  Ada yang diperbaiki di dalam mesin. Coba buka https://pri-superapp.com sekarang."
fi
if [ "$KODE_LOKAL" != "000" ] && [ "$MASALAH" = 0 ] && [ "$DIPERBAIKI" = 0 ]; then
  echo "  Di dalam mesin SEMUA BERES: Caddy jalan, port mendengar, ufw mengizinkan."
  echo "  Berarti yang menjatuhkan paket ada DI LUAR mesin — hampir pasti"
  echo "  FIREWALL DI PANEL HOSTINGER (hPanel -> VPS -> Firewall)."
  echo "  Pastikan ada aturan yang mengizinkan TCP 80 dan 443 dari mana saja,"
  echo "  atau nonaktifkan firewall panel itu. SSH-nya lolos, jadi aturan"
  echo "  di sana kemungkinan hanya membuka port 22."
elif [ "$MASALAH" = 1 ]; then
  echo "  Masih ada masalah di dalam mesin (lihat baris bertanda TIDAK/GAGAL di atas)."
  echo "  Kirimkan seluruh keluaran ini apa adanya."
fi
