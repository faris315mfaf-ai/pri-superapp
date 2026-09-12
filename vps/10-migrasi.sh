#!/usr/bin/env bash
# =====================================================================
# LANGKAH 3-6 DALAM SATU PERINTAH (11 Sep 2026).
#
# Menggantikan urutan lama 03 → 00-node 04 → 05 → 00-node 06 yang
# masing-masing butuh perintah, alat, dan berkas pengaturan sendiri.
# Sekarang: SATU berkas isian, SATU perintah, dan semua alat terkunci
# di dalam satu container yang dibangun sekali di awal.
#
# CARA PAKAI (root, di VPS):
#   bash 10-migrasi.sh            # bangun container lalu jalankan semua
#   bash 10-migrasi.sh uji        # hanya mengulang pemeriksaan
#   bash 10-migrasi.sh data       # hanya menyalin ulang database
#   bash 10-migrasi.sh berkas     # hanya melanjutkan salinan berkas
#
# Syarat: 02-pasang-supabase.sh sudah selesai (kunci & Supabase hidup).
# =====================================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root: sudo bash $0" >&2; exit 1; }

PERINTAH="${1:-semua}"
SKRIP_DIR="$(cd "$(dirname "$0")" && pwd)"
ISIAN=/opt/pri/migrasi.txt
KERJA=/opt/pri/kerja

# ---------------------------------------------------------------------
# 1. Nilai dari sisi VPS diambil otomatis — tidak usah diketik ulang.
# ---------------------------------------------------------------------
[ -f /opt/pri/kunci.env ] || { echo "Belum ada /opt/pri/kunci.env. Jalankan 02-pasang-supabase.sh dulu." >&2; exit 1; }
# shellcheck disable=SC1091
. /opt/pri/kunci.env

# Alamat dibaca dari pengaturan Supabase sendiri, BUKAN dari Caddyfile.
# Caddy di server ini ternyata berupa container dengan berkas pengaturan
# di tempat lain, jadi menebak /etc/caddy/Caddyfile membaca berkas yang
# tidak dipakai siapa pun. API_EXTERNAL_URL adalah sumber yang benar.
DOMAIN="$(grep -m1 '^API_EXTERNAL_URL=' /opt/pri/supabase/.env 2>/dev/null | cut -d= -f2- | sed 's#^https\?://##; s#/.*$##')"
[ -n "$DOMAIN" ] || {
  echo "Alamat Supabase tidak terbaca dari /opt/pri/supabase/.env." >&2
  echo "Jalankan 02-pasang-supabase.sh dulu." >&2
  exit 1
}

# ---------------------------------------------------------------------
# 2. Yang HARUS diisi manusia cuma tiga baris — semuanya milik Cloud.
# ---------------------------------------------------------------------
if [ ! -s "$ISIAN" ]; then
  umask 077
  cat > "$ISIAN" <<'EOF'
# Isi tiga nilai di bawah, lalu jalankan lagi: bash 10-migrasi.sh
# Semuanya milik Supabase Cloud yang sekarang dipakai.
# JANGAN pakai tanda kutip. Berkas ini rahasia — jangan masuk Git/chat.
#
# 1) Alamat koneksi database. Supabase Dashboard > Connect >
#    "Session pooler". Ganti [YOUR-PASSWORD] dengan sandi database.
SUMBER_DB=postgresql://postgres.pichnkyjepsirpclofhs:SANDI@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
#
# 2) Alamat REST (tanpa garis miring di akhir).
SUMBER_URL=https://pichnkyjepsirpclofhs.supabase.co
#
# 3) Secret key. Dashboard > Settings > API Keys (yang sb_secret_...).
SUMBER_KEY=isi-secret-key-supabase-cloud
EOF
  echo "Berkas isian dibuat: $ISIAN"
  echo "Isi tiga nilainya (nano $ISIAN), lalu jalankan lagi perintah ini."
  exit 0
fi

# shellcheck disable=SC1090
set -a; . "$ISIAN"; set +a

for k in SUMBER_DB SUMBER_URL SUMBER_KEY; do
  nilai="${!k:-}"
  case "$nilai" in
    ""|*SANDI*|isi-*)
      echo "$k di $ISIAN belum diisi dengan benar." >&2
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------
# 3. Membangun container (sekali; berikutnya dipakai ulang dari cache).
# ---------------------------------------------------------------------
echo "== Menyiapkan container migrasi =="
BANGUN="$(mktemp -d)"
trap 'rm -rf "$BANGUN"' EXIT
cp "$SKRIP_DIR/migrator/Dockerfile" "$SKRIP_DIR/migrator/jalankan.sh" "$BANGUN/"
cp "$SKRIP_DIR/04-pindah-storage.mjs" "$SKRIP_DIR/05-ganti-url.sql" "$SKRIP_DIR/06-uji-migrasi.mjs" "$BANGUN/"
docker build -q -t pri-migrator "$BANGUN" | sed 's/^/  /'

# ---------------------------------------------------------------------
# 4. Jaringan: container harus bisa memanggil database Supabase di VPS
#    dengan nama "db", persis seperti layanan Supabase lainnya.
# ---------------------------------------------------------------------
# Container database dicari dari IMAGE-nya: namanya berbeda antar versi
# paket Supabase, dan nama container PASTI bisa dipanggil lewat jaringan
# Docker — berbeda dengan nama layanan yang bergantung pada alias.
DB_CT="$(docker ps --format '{{.Names}}\t{{.Image}}' | awk -F'\t' 'index($2, "supabase/postgres") {print $1; exit}')"
[ -n "$DB_CT" ] || { echo "Container database Supabase tidak ditemukan — Supabase belum jalan?" >&2; exit 1; }
JARINGAN="$(docker inspect "$DB_CT" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | awk '{print $1}')"
[ -n "$JARINGAN" ] || { echo "Jaringan container $DB_CT tidak terbaca." >&2; exit 1; }
echo "  database: $DB_CT   jaringan: $JARINGAN"

mkdir -p "$KERJA/dump"

# ---------------------------------------------------------------------
# 5. Jalan. Kunci rahasia dioper lewat environment, tidak pernah
#    tertulis di daftar proses maupun di dalam image.
# ---------------------------------------------------------------------
docker run --rm -i \
  --name pri-migrator-jalan \
  --network "$JARINGAN" \
  -v "$KERJA:/kerja" \
  -e SUMBER_DB="$SUMBER_DB" \
  -e SUMBER_URL="${SUMBER_URL%/}" \
  -e SUMBER_KEY="$SUMBER_KEY" \
  -e TUJUAN_DB="postgresql://postgres:${PG_PASS}@${DB_CT}:5432/postgres" \
  -e TUJUAN_URL="https://${DOMAIN}" \
  -e TUJUAN_KEY="$SERVICE_KEY" \
  -e TUJUAN_ANON_KEY="$ANON_KEY" \
  pri-migrator "$PERINTAH"
