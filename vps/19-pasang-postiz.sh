#!/usr/bin/env bash
# =====================================================================
# LANGKAH 19 — MEMASANG POSTIZ SWAKELOLA DI VPS (15 Sep 2026)
#
# Postiz akan menggantikan upload-post sebagai gerbang posting ke akun
# sosmed PRIBADI anggota (TV Rakyat Saya). Bedanya: upload-post disewa
# dari orang lain (kuota 225 profil, tagihan bulanan, batas yang bisa
# mereka ubah sepihak), Postiz berjalan di server kita sendiri.
#
# TV Rakyat OFFICIAL tetap lewat Ayrshare — tidak disentuh skrip ini.
#
# YANG DIPASANG — tumpukan terpisah bernama "postiz":
#   postiz     — aplikasinya (tampilan + API jadi satu)
#   postiz-db  — PostgreSQL MILIK POSTIZ SENDIRI
#   postiz-cache — Redis milik Postiz sendiri
#
# KENAPA DATABASENYA SENDIRI, TIDAK MENUMPANG SUPABASE: Supabase di
# server ini memegang SELURUH data partai. Postiz menjalankan migrasi
# skemanya sendiri setiap kali versinya naik. Membiarkan aplikasi luar
# menulis skema di database yang sama dengan data anggota adalah risiko
# yang tidak sepadan dengan hemat beberapa ratus megabita.
#
# Seperti tumpukan lain di server ini: TIDAK ADA port yang terbuka ke
# internet. Semua hanya mendengar di dalam server; Caddy yang memegang
# port 80/443 dan membagi berdasarkan nama domain, jadi situs tetangga
# (auto-comment.tech dll.) tidak tersentuh.
#
# CARA PAKAI (root, di VPS):
#   DOMAIN_POSTIZ=postiz.pri-superapp.com bash 19-pasang-postiz.sh
# =====================================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root: sudo bash $0" >&2; exit 1; }
: "${DOMAIN_POSTIZ:?Isi DOMAIN_POSTIZ, contoh: DOMAIN_POSTIZ=postiz.pri-superapp.com bash $0}"

SKRIP_DIR="$(cd "$(dirname "$0")" && pwd)"
DIR=/opt/postiz
PORT="${PORT_POSTIZ:-5001}"
# Versi image. SENGAJA bisa ditimpa: setelah pemasangan pertama berhasil,
# kunci ke versi yang terbukti jalan (skrip mencetak digest-nya di akhir)
# supaya `docker compose pull` berikutnya tidak diam-diam mengganti versi
# di tengah masa uji coba.
TAG="${POSTIZ_TAG:-latest}"

echo "== 1/7 Memeriksa syarat =="
command -v docker >/dev/null || { echo "Docker belum ada — jalankan 01-siapkan-vps.sh dulu." >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl belum ada: apt-get install -y openssl" >&2; exit 1; }
# shellcheck disable=SC1091
. "$SKRIP_DIR/blok-caddy.sh"
kenali_caddy || exit 1

# Domainnya harus sudah menunjuk ke server ini SEBELUM Caddy diminta
# menerbitkan sertifikat — kalau tidak, penerbitan gagal dan percobaan
# berulang bisa kena batas laju Let's Encrypt selama berjam-jam.
IP_SERVER="$( (ip -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1; curl -4 -fsS --max-time 10 https://api.ipify.org 2>/dev/null) | sort -u | grep -v '^$' || true)"
IP_DOM="$(getent ahosts "$DOMAIN_POSTIZ" | awk '{print $1}' | sort -u || true)"
COCOK=0
for a in $IP_DOM; do for b in $IP_SERVER; do [ "$a" = "$b" ] && COCOK=1; done; done
if [ "$COCOK" -ne 1 ]; then
  echo >&2
  echo "$DOMAIN_POSTIZ belum menunjuk ke server ini — sertifikat HTTPS pasti gagal terbit." >&2
  echo "  alamat server : $(echo "$IP_SERVER" | tr '\n' ' ')" >&2
  echo "  alamat domain : ${IP_DOM:-belum diarahkan}" >&2
  echo "Tambahkan A record $DOMAIN_POSTIZ -> IP server, tunggu 5-15 menit, lalu ulangi." >&2
  exit 1
fi
echo "  domain sudah menunjuk ke server ini"

echo "== 2/7 Menyiapkan folder & kunci =="
mkdir -p "$DIR" "$DIR/berkas" "$DIR/data"
# Kunci dibuat DI SERVER dan tidak pernah keluar dari sini — tidak ke
# repositori, tidak ke chat. Kalau berkasnya sudah ada, isinya
# DIPERTAHANKAN: menimpanya berarti seluruh sesi login Postiz gugur dan
# akun sosmed yang sudah ditautkan anggota harus ditautkan ulang.
if [ -f "$DIR/env.txt" ]; then
  echo "  env.txt sudah ada — kunci lama dipertahankan."
  # shellcheck disable=SC1091
  . "$DIR/env.txt"
else
  SANDI_DB="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 32)"
  cat > "$DIR/env.txt" <<EOF
# Kunci Postiz — JANGAN disalin ke mana pun. Dibuat $(date -Is).
SANDI_DB=$SANDI_DB
JWT_SECRET=$JWT_SECRET
DOMAIN_POSTIZ=$DOMAIN_POSTIZ
PORT_POSTIZ=$PORT
POSTIZ_TAG=$TAG
EOF
  chmod 600 "$DIR/env.txt"
  echo "  kunci baru dibuat di $DIR/env.txt (hanya bisa dibaca root)"
fi
# shellcheck disable=SC1091
. "$DIR/env.txt"
# Nilai dari env.txt yang MENANG — compose membacanya dari sana. Tanpa
# baris ini, pemasangan ulang di server yang env.txt-nya memakai port
# lain akan memeriksa kesehatan di port yang salah, lalu menyatakan
# gagal padahal Postiz sebenarnya hidup.
PORT="${PORT_POSTIZ:-$PORT}"
TAG="${POSTIZ_TAG:-$TAG}"

echo "== 3/7 Menulis susunan container =="
cat > "$DIR/docker-compose.yml" <<'YAML'
# Tumpukan Postiz — berdampingan dengan tumpukan "pri" dan Supabase.
# Tidak ada port yang terbuka ke internet; Caddy yang menjadi gerbang.
name: postiz

services:
  postiz:
    image: ghcr.io/gitroomhq/postiz-app:${POSTIZ_TAG}
    container_name: postiz
    restart: unless-stopped
    environment:
      # Alamat PUBLIK. Postiz memakainya untuk menyusun URL balikan
      # OAuth tiap platform — kalau salah, penautan akun anggota gagal
      # dengan pesan "redirect_uri mismatch" dari platformnya.
      MAIN_URL: "https://${DOMAIN_POSTIZ}"
      NEXT_PUBLIC_URL: "https://${DOMAIN_POSTIZ}"
      BACKEND_INTERNAL_URL: "http://localhost:3000"
      DATABASE_URL: "postgresql://postiz:${SANDI_DB}@postiz-db:5432/postiz"
      REDIS_URL: "redis://postiz-cache:6379"
      JWT_SECRET: "${JWT_SECRET}"
      # Pendaftaran DITUTUP. Postiz ini bukan layanan umum — hanya
      # pengurus TV Rakyat yang boleh punya akun. Dibuka sekali saja
      # saat membuat akun pertama (lihat petunjuk di akhir skrip).
      DISABLE_REGISTRATION: "${DISABLE_REGISTRATION:-true}"
      STORAGE_PROVIDER: "local"
      UPLOAD_DIRECTORY: "/uploads"
      NEXT_PUBLIC_UPLOAD_DIRECTORY: "/uploads"
      TZ: Asia/Jakarta
    volumes:
      - /opt/postiz/berkas:/uploads
    ports:
      - "127.0.0.1:${PORT_POSTIZ}:5000"
    depends_on:
      postiz-db:
        condition: service_healthy
      postiz-cache:
        condition: service_healthy
    networks:
      - postiz
    deploy:
      resources:
        limits:
          memory: 2G
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postiz-db:
    image: postgres:17-alpine
    container_name: postiz-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: postiz
      POSTGRES_PASSWORD: ${SANDI_DB}
      POSTGRES_DB: postiz
      TZ: Asia/Jakarta
    volumes:
      - /opt/postiz/data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postiz -d postiz"]
      interval: 10s
      timeout: 5s
      retries: 10
    networks:
      - postiz
    deploy:
      resources:
        limits:
          memory: 1G
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postiz-cache:
    image: redis:7-alpine
    container_name: postiz-cache
    restart: unless-stopped
    command: ["redis-server", "--save", "", "--appendonly", "no"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 10
    networks:
      - postiz
    deploy:
      resources:
        limits:
          memory: 256M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

networks:
  postiz:
    name: postiz
YAML

echo "== 4/7 Menarik image & menyalakan =="
cd "$DIR"
docker compose --env-file "$DIR/env.txt" pull
docker compose --env-file "$DIR/env.txt" up -d

echo "== 5/7 Menunggu Postiz siap =="
SIAP=0
for i in $(seq 1 60); do
  KODE="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:$PORT/" 2>/dev/null || echo 000)"
  if [ "$KODE" = "200" ] || [ "$KODE" = "302" ] || [ "$KODE" = "307" ]; then SIAP=1; break; fi
  sleep 5
  [ $((i % 6)) -eq 0 ] && echo "  masih menunggu… (${i}0 detik)"
done
if [ "$SIAP" -ne 1 ]; then
  echo >&2
  echo "Postiz tidak menjawab di 127.0.0.1:$PORT setelah 5 menit." >&2
  echo "Lihat sebabnya:  docker compose --env-file $DIR/env.txt -f $DIR/docker-compose.yml logs --tail 80 postiz" >&2
  echo "Domain BELUM diarahkan ke sini, jadi tidak ada pengunjung yang melihat halaman rusak." >&2
  exit 1
fi
echo "  Postiz menjawab di dalam server"

echo "== 6/7 Mengarahkan domain =="
# Kalau Caddy berupa container, "127.0.0.1" baginya berarti dirinya
# sendiri — ia harus memanggil lewat nama container.
TUJUAN="$(alamat_dalam_untuk_caddy postiz 5000)" || exit 1
echo "  Caddy akan meneruskan ke: $TUJUAN"
cat > /tmp/blok-postiz.caddy <<EOF
$DOMAIN_POSTIZ {
	encode zstd gzip
	# Video anggota bisa 75 MB dan Postiz menyimpan medianya sendiri.
	request_body {
		max_size 210MB
	}
	reverse_proxy $TUJUAN {
		transport http {
			read_timeout 600s
			write_timeout 600s
		}
	}
}
EOF
pasang_blok_caddy "PRI Postiz" /tmp/blok-postiz.caddy || exit 1
lapor_situs_caddy "$DOMAIN_POSTIZ"
sleep 5
curl -s -o /dev/null -m 30 -w "  https://$DOMAIN_POSTIZ -> %{http_code}\n" "https://$DOMAIN_POSTIZ/"

echo "== 7/7 Ringkasan =="
DIGEST="$(docker inspect --format '{{index .RepoDigests 0}}' "ghcr.io/gitroomhq/postiz-app:$TAG" 2>/dev/null || true)"
echo
echo "SELESAI."
echo "  Postiz     : https://$DOMAIN_POSTIZ"
echo "  Container  : docker compose --env-file $DIR/env.txt -f $DIR/docker-compose.yml ps"
echo "  Catatan    : docker compose --env-file $DIR/env.txt -f $DIR/docker-compose.yml logs -f postiz"
[ -n "$DIGEST" ] && echo "  Versi      : $DIGEST"
echo
echo "LANGKAH BERIKUTNYA (dikerjakan sekali, lewat peramban):"
echo "  1. Buka https://$DOMAIN_POSTIZ dan buat akun pengurus PERTAMA."
echo "     Kalau halaman daftar tertutup, buka sementara:"
echo "       DISABLE_REGISTRATION=false docker compose --env-file $DIR/env.txt -f $DIR/docker-compose.yml up -d postiz"
echo "     lalu SETELAH akun jadi, tutup lagi:"
echo "       docker compose --env-file $DIR/env.txt -f $DIR/docker-compose.yml up -d postiz"
echo "  2. Di Postiz: Settings -> isi kunci OAuth tiap sosmed yang dipakai"
echo "     (TikTok, Instagram, YouTube, Facebook, X, Threads). Ini bagian"
echo "     paling lama: tiap platform butuh aplikasi developer sendiri."
echo "  3. Settings -> Public API -> buat kunci, lalu REKAM KONTRAKNYA:"
echo "       POSTIZ_URL=https://$DOMAIN_POSTIZ POSTIZ_API_KEY=<kunci> \\"
echo "         node /opt/pri/sumber/alat/postiz-rekam-kontrak.mjs --kirim-uji"
echo "     Jangan pindahkan anggota mana pun sebelum laporan itu bersih."
echo "  4. Isi POSTIZ_URL dan POSTIZ_API_KEY di /opt/pri/aplikasi/env.txt,"
echo "     lalu jalankan: pri-perbarui"
