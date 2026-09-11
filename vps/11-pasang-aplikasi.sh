#!/usr/bin/env bash
# =====================================================================
# LANGKAH 11 — MEMASANG APLIKASI DI VPS (11 Sep 2026)
#
# Membuat tumpukan container "pri" berisi tiga bagian:
#   aplikasi  — Next.js, hasil build standalone
#   redis     — cache bersama (sesi, detak, siapa online) di dalam server
#   jadwal    — tugas berkala, pengganti Vercel Cron
#
# Semuanya berdampingan dengan tumpukan Supabase dan dengan aplikasi
# lain yang sudah lebih dulu ada di server ini. Tidak ada yang ditimpa.
#
# URUTAN SENGAJA: bangun dulu, jalankan, pastikan sehat, BARU domainnya
# diarahkan ke sini. Jadi kalau ada yang gagal, tidak ada pengunjung
# yang pernah melihat halaman rusak.
#
# CARA PAKAI (root, di VPS):
#   DOMAIN_APP=pri-superapp.com bash 11-pasang-aplikasi.sh
# =====================================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root: sudo bash $0" >&2; exit 1; }
: "${DOMAIN_APP:?Isi DOMAIN_APP, contoh: DOMAIN_APP=pri-superapp.com bash $0}"

SKRIP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP=/opt/pri/aplikasi
SUMBER=/opt/pri/sumber
PORT="${PORT_APLIKASI:-3001}"

echo "== 1/8 Memeriksa syarat =="
command -v docker >/dev/null || { echo "Docker belum ada — jalankan 01-siapkan-vps.sh dulu." >&2; exit 1; }
command -v caddy  >/dev/null || { echo "Caddy belum ada — jalankan 01-siapkan-vps.sh dulu." >&2; exit 1; }
[ -f /opt/pri/kunci.env ] || { echo "Supabase belum terpasang — jalankan 02-pasang-supabase.sh dulu." >&2; exit 1; }
# shellcheck disable=SC1091
. /opt/pri/kunci.env
# Caddy bisa berupa layanan sistem ATAU container milik aplikasi lain,
# dan berkas pengaturannya beda tempat. Dikenali dulu, baru dibaca —
# membaca /etc/caddy/Caddyfile begitu saja bisa mengambil berkas yang
# sama sekali tidak dipakai siapa pun.
# shellcheck disable=SC1091
. "$SKRIP_DIR/blok-caddy.sh"
kenali_caddy || exit 1
DOMAIN_DB="$(grep -m1 '^API_EXTERNAL_URL=' /opt/pri/supabase/.env 2>/dev/null | cut -d= -f2- | sed 's#^https\?://##; s#/.*$##')"
[ -n "${DOMAIN_DB:-}" ] || {
  echo "Alamat Supabase tidak terbaca dari /opt/pri/supabase/.env." >&2
  echo "Jalankan 02-pasang-supabase.sh dulu." >&2
  exit 1
}
echo "  alamat Supabase: $DOMAIN_DB"

if [ ! -d "$SUMBER/src" ] || [ ! -f "$SUMBER/package.json" ]; then
  echo >&2
  echo "Kode aplikasi belum ada di $SUMBER." >&2
  echo "Kirim dari komputer Anda (jalankan DI KOMPUTER, bukan di VPS):" >&2
  echo "  scp -r C:/Users/Admin/pri-superapp root@\$(hostname -I | awk '{print \$1}'):$SUMBER" >&2
  exit 1
fi

IP_SERVER="$( (ip -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1; curl -4 -fsS --max-time 10 https://api.ipify.org 2>/dev/null) | sort -u | grep -v '^$' || true)"
IP_DOM="$(getent ahosts "$DOMAIN_APP" | awk '{print $1}' | sort -u || true)"
COCOK=0
for a in $IP_DOM; do for b in $IP_SERVER; do [ "$a" = "$b" ] && COCOK=1; done; done
if [ "$COCOK" -ne 1 ]; then
  echo >&2
  echo "$DOMAIN_APP belum menunjuk ke server ini — sertifikat HTTPS pasti gagal terbit." >&2
  echo "  alamat server : $(echo $IP_SERVER | tr '\n' ' ')" >&2
  echo "  alamat domain : ${IP_DOM:-belum diarahkan}" >&2
  echo "Arahkan A record-nya, tunggu 5-15 menit, lalu ulangi." >&2
  exit 1
fi
echo "  $DOMAIN_APP sudah menunjuk ke server ini"

echo "== 2/8 Menyiapkan folder =="
mkdir -p "$APP/jadwal"
cp "$SKRIP_DIR/aplikasi/Dockerfile" "$SKRIP_DIR/aplikasi/docker-compose.yml" "$APP/"
cp "$SKRIP_DIR/aplikasi/jadwal/"* "$APP/jadwal/"
chmod +x "$APP/jadwal/"*.sh

echo "== 3/8 Menyusun pengaturan aplikasi =="
if [ ! -s "$APP/env.txt" ]; then
  echo >&2
  echo "Pengaturan aplikasi belum ada: $APP/env.txt" >&2
  echo "Kirim berkas .env.local dari komputer Anda ke sana:" >&2
  echo "  scp C:/Users/Admin/pri-superapp/.env.local root@IP:$APP/env.txt" >&2
  echo "Nilai Supabase & Redis di dalamnya akan diganti otomatis ke milik server ini." >&2
  exit 1
fi
# Rahasia tugas berkala: dibuat sekali lalu dipakai terus.
if ! grep -q '^CRON_SECRET=' "$APP/env.txt" || [ -z "$(grep -m1 '^CRON_SECRET=' "$APP/env.txt" | cut -d= -f2-)" ]; then
  CRON_SECRET="$(openssl rand -hex 24)"
else
  CRON_SECRET="$(grep -m1 '^CRON_SECRET=' "$APP/env.txt" | cut -d= -f2- | tr -d '"'"'"'')"
fi
# Nilai yang WAJIB mengikuti server ini, apa pun isi berkas kiriman.
CRON_SECRET="$CRON_SECRET" DOMAIN_DB="$DOMAIN_DB" DOMAIN_APP="$DOMAIN_APP" \
SERVICE_KEY="$SERVICE_KEY" ANON_KEY="$ANON_KEY" python3 - "$APP/env.txt" <<'PY'
import os, re, sys, pathlib
berkas = pathlib.Path(sys.argv[1])
paksa = {
    "SUPABASE_URL": f"https://{os.environ['DOMAIN_DB']}",
    "SUPABASE_SECRET_KEY": os.environ["SERVICE_KEY"],
    "SUPABASE_PUBLISHABLE_KEY": os.environ["ANON_KEY"],
    # Redis ada di dalam server, bukan menyeberang internet.
    "REDIS_URL": "redis://redis:6379",
    "APP_URL": f"https://{os.environ['DOMAIN_APP']}",
    "CRON_SECRET": os.environ["CRON_SECRET"],
    "NODE_ENV": "production",
}
# Upstash (REST) sengaja DIKOSONGKAN: kalau masih terisi, ia menang atas
# REDIS_URL dan cache tetap menyeberang internet ke layanan luar.
kosongkan = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN",
             "KV_REST_API_URL", "KV_REST_API_TOKEN"]
keluar, sudah = [], set()
for baris in berkas.read_text(encoding="utf-8", errors="replace").splitlines():
    m = re.match(r"^([A-Z0-9_]+)=(.*)$", baris)
    if not m:
        keluar.append(baris)
        continue
    nama, nilai = m.group(1), m.group(2).strip()
    # Tanda kutip dibuang: env_file Docker memperlakukannya sebagai isi.
    if len(nilai) >= 2 and nilai[0] == nilai[-1] and nilai[0] in "\"'":
        nilai = nilai[1:-1]
    if nama in paksa:
        nilai = paksa[nama]; sudah.add(nama)
    elif nama in kosongkan:
        continue
    keluar.append(f"{nama}={nilai}")
for nama, nilai in paksa.items():
    if nama not in sudah:
        keluar.append(f"{nama}={nilai}")
berkas.write_text("\n".join(keluar) + "\n", encoding="utf-8")
berkas.chmod(0o600)
print(f"  {len(paksa)} nilai disesuaikan ke server ini, {len(kosongkan)} nilai cache luar dimatikan")
PY

# Nilai untuk docker compose sendiri (bukan untuk aplikasi).
umask 077
cat > "$APP/.env" <<EOF
SUPABASE_URL=https://$DOMAIN_DB
DOMAIN_DB=$DOMAIN_DB
PORT_APLIKASI=$PORT
CRON_SECRET=$CRON_SECRET
EOF

echo "== 4/8 Memeriksa port $PORT bebas =="
PEMAKAI="$(ss -tlnp 2>/dev/null | awk -v p=":$PORT\$" '$4 ~ p {print $NF}' | head -1)"
if [ -n "$PEMAKAI" ] && ! docker ps --format '{{.Names}} {{.Ports}}' | grep -q "pri-aplikasi.*:$PORT->"; then
  echo "Port $PORT sudah dipakai: $PEMAKAI" >&2
  echo "Pakai port lain: PORT_APLIKASI=3002 DOMAIN_APP=$DOMAIN_APP bash $0" >&2
  exit 1
fi
echo "  port $PORT bebas"

echo "== 5/8 Membangun container aplikasi (ini yang paling lama) =="
cd "$APP"
docker compose build --pull

echo "== 6/8 Menyalakan =="
docker compose up -d
echo -n "Menunggu aplikasi siap"
SIAP=0
for i in $(seq 1 60); do
  if curl -fsS --max-time 5 "http://127.0.0.1:$PORT/api/hidup" >/dev/null 2>&1; then SIAP=1; echo " OK"; break; fi
  echo -n "."; sleep 5
done
if [ "$SIAP" -ne 1 ]; then
  echo
  echo "Aplikasi belum menjawab. Catatan terakhir:" >&2
  docker compose logs --tail=40 aplikasi >&2
  echo "Domain BELUM diarahkan ke sini, jadi pengunjung tidak melihat apa pun yang rusak." >&2
  exit 1
fi

echo "== 7/8 Memeriksa sambungan ke database & cache =="
curl -s --max-time 30 "http://127.0.0.1:$PORT/api/sehat" | head -c 300; echo
docker compose exec -T redis redis-cli ping | sed 's/^/  redis: /'

echo "== 8/8 Mengarahkan domain ke aplikasi =="
# Sama seperti Supabase: kalau Caddy berupa container, ia harus memanggil
# aplikasi lewat nama container, bukan 127.0.0.1 yang berarti dirinya sendiri.
TUJUAN="$(alamat_dalam_untuk_caddy pri-aplikasi 3000)" || exit 1
echo "  Caddy akan meneruskan ke: $TUJUAN"
cat > /tmp/blok-aplikasi.caddy <<EOF
$DOMAIN_APP {
	encode zstd gzip
	# Unggahan video bisa 75 MB; beri ruang lebih.
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
pasang_blok_caddy "PRI Aplikasi" /tmp/blok-aplikasi.caddy || exit 1
lapor_situs_caddy "$DOMAIN_APP"
sleep 5
curl -s -o /dev/null -m 30 -w "  https://$DOMAIN_APP -> %{http_code}\n" "https://$DOMAIN_APP/api/hidup"

echo
echo "SELESAI."
echo "  Aplikasi   : https://$DOMAIN_APP"
echo "  Database   : https://$DOMAIN_DB"
echo "  Container  : docker compose -f $APP/docker-compose.yml ps"
echo "  Catatan    : docker compose -f $APP/docker-compose.yml logs -f aplikasi"
echo
echo "Langkah berikutnya: matikan cron di Vercel (vercel.json) supaya tugas"
echo "berkala tidak berjalan dua kali, lalu arahkan pengguna ke domain baru."
