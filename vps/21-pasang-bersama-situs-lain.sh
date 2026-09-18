#!/usr/bin/env bash
# =====================================================================
# PASANG APLIKASI DI VPS YANG SUDAH PUNYA SITUS LAIN (18 Sep 2026)
#
# Untuk server yang sudah menjalankan situs lain (mis. /var/www/...)
# dan Caddy di /opt. Skrip ini:
#   - TIDAK menyentuh /var/www
#   - TIDAK menimpa Caddyfile; hanya menambah blok pri-superapp.com
#   - TIDAK memasang firewall baru
#   - TIDAK memasang Supabase lokal — database tetap yang di .env
#
# Syarat: Docker (dipasang otomatis bila belum ada), domain sudah
# menunjuk ke server, dan berkas env aplikasi sudah ada.
#
# CARA PAKAI (sudo):
#   sudo DOMAIN_APP=pri-superapp.com \
#     bash 21-pasang-bersama-situs-lain.sh /jalur/ke/env.txt
# =====================================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Jalankan dengan sudo: sudo bash $0 <env.txt>" >&2; exit 1; }

ENV_SUMBER="${1:-}"
DOMAIN_APP="${DOMAIN_APP:-pri-superapp.com}"
AKAR=/opt/pri-superapp
SUMBER="$AKAR/sumber"
APP="$AKAR/aplikasi"
SKRIP="$AKAR/skrip"
PORT="${PORT_APLIKASI:-3001}"
REPO="https://github.com/faris315mfaf-ai/pri-superapp.git"

if [ -z "$ENV_SUMBER" ] || [ ! -s "$ENV_SUMBER" ]; then
  echo "Sebutkan berkas env aplikasi (hasil salinan .env.local)." >&2
  echo "Contoh: sudo DOMAIN_APP=$DOMAIN_APP bash $0 /tmp/pri.env.txt" >&2
  exit 1
fi

echo "== 1/7 Memeriksa situs lain — tidak akan disentuh =="
ls -1 /var/www 2>/dev/null | sed 's/^/  /var\/www\//' || echo "  (tidak ada /var/www)"

echo "== 2/7 Docker =="
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
docker compose version >/dev/null
echo "  Docker siap"

echo "== 3/7 Kode aplikasi =="
mkdir -p "$AKAR"
chmod 700 "$AKAR"
if [ ! -d "$SUMBER/.git" ]; then
  git clone --depth 1 "$REPO" "$SUMBER"
else
  git -C "$SUMBER" fetch --quiet origin main
  git -C "$SUMBER" pull --ff-only origin main || true
fi
mkdir -p "$SKRIP" "$APP/jadwal"
cp -r "$SUMBER/vps/"* "$SKRIP/"
cp "$SUMBER/vps/aplikasi/Dockerfile" "$SUMBER/vps/aplikasi/docker-compose.yml" "$APP/"
cp "$SUMBER/vps/aplikasi/jadwal/"* "$APP/jadwal/"
chmod +x "$APP/jadwal/"*.sh "$SKRIP/"*.sh 2>/dev/null || true
ln -sf "$SKRIP/12-perbarui.sh" /usr/local/bin/pri-perbarui
ln -sf "$SKRIP/16-jalankan-sql.sh" /usr/local/bin/pri-sql
echo "  kode di $SUMBER"

echo "== 4/7 Pengaturan aplikasi =="
umask 077
cp "$ENV_SUMBER" "$APP/env.txt"
chmod 600 "$APP/env.txt"
# Database Cloud: extra_hosts compose hanya boleh menimpa hostname
# lokal. Nama dummy ini tidak pernah dipakai klien, jadi supabase.co
# tetap ke internet.
if grep -q '^CRON_SECRET=' "$APP/env.txt" && [ -n "$(grep -m1 '^CRON_SECRET=' "$APP/env.txt" | cut -d= -f2-)" ]; then
  CRON_SECRET="$(grep -m1 '^CRON_SECRET=' "$APP/env.txt" | cut -d= -f2- | tr -d '"'"'"'')"
else
  CRON_SECRET="$(openssl rand -hex 24)"
  echo "CRON_SECRET=$CRON_SECRET" >> "$APP/env.txt"
fi
SUPABASE_URL="$(grep -m1 '^SUPABASE_URL=' "$APP/env.txt" | cut -d= -f2- | tr -d '"')"
cat > "$APP/.env" <<EOF
SUPABASE_URL=$SUPABASE_URL
DOMAIN_DB=pri-db.internal
PORT_APLIKASI=$PORT
CRON_SECRET=$CRON_SECRET
EOF
# Rapikan nilai berbaris-banyak (kunci privat Ayrshare) seperti 11-pasang.
python3 - "$APP/env.txt" <<'PY'
import re, sys, pathlib
berkas = pathlib.Path(sys.argv[1])
keluar, nama_kini, nilai_kini = [], None, []
def bersihkan(nilai):
    nilai = nilai.strip()
    if len(nilai) >= 2 and nilai[0] == nilai[-1] and nilai[0] in "\"'":
        nilai = nilai[1:-1]
    return nilai
def tutup():
    global nama_kini, nilai_kini
    if nama_kini is None:
        return
    gabung = "\\n".join(nilai_kini) if len(nilai_kini) > 1 else nilai_kini[0]
    if len(gabung) >= 2 and gabung[0] == gabung[-1] and gabung[0] in "\"'":
        gabung = gabung[1:-1]
    keluar.append(f"{nama_kini}={gabung}")
    nama_kini, nilai_kini = None, []
for baris in berkas.read_text(encoding="utf-8", errors="replace").splitlines():
    m = re.match(r"^([A-Z0-9_]+)=(.*)$", baris)
    if m:
        tutup()
        nama_kini, nilai_kini = m.group(1), [bersihkan(m.group(2))]
        continue
    if not baris.strip() or baris.lstrip().startswith("#"):
        tutup()
        keluar.append(baris)
        continue
    if nama_kini is not None:
        nilai_kini.append(bersihkan(baris))
    else:
        keluar.append(baris)
tutup()
berkas.write_text("\n".join(keluar) + "\n", encoding="utf-8")
berkas.chmod(0o600)
print("  env.txt dirapikan")
PY

echo "== 5/7 Membangun & menyalakan (ini yang paling lama) =="
cd "$APP"
docker compose build
docker compose up -d
echo -n "  menunggu aplikasi"
SIAP=0
for i in $(seq 1 60); do
  if curl -fsS --max-time 5 "http://127.0.0.1:$PORT/api/hidup" >/dev/null 2>&1; then
    SIAP=1
    echo " OK"
    break
  fi
  echo -n "."
  sleep 5
done
if [ "$SIAP" -ne 1 ]; then
  echo
  echo "Aplikasi belum menjawab. Catatan:" >&2
  docker compose logs --tail=40 aplikasi >&2
  exit 1
fi

echo "== 6/7 Mengarahkan $DOMAIN_APP tanpa menimpa situs lain =="
# shellcheck disable=SC1091
. "$SKRIP/blok-caddy.sh"
kenali_caddy || exit 1
TUJUAN="$(alamat_dalam_untuk_caddy pri-aplikasi 3000)" || exit 1
echo "  Caddy meneruskan ke: $TUJUAN"
cat > /tmp/blok-aplikasi.caddy <<EOF
$DOMAIN_APP {
	encode zstd gzip
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

echo "== 7/7 Izin deploy untuk adminportalpri =="
if id adminportalpri >/dev/null 2>&1; then
  cat > /etc/sudoers.d/pri-superapp <<'EOF'
adminportalpri ALL=(root) NOPASSWD: /usr/local/bin/pri-perbarui, /opt/pri-superapp/skrip/12-perbarui.sh
EOF
  chmod 440 /etc/sudoers.d/pri-superapp
  visudo -cf /etc/sudoers.d/pri-superapp >/dev/null
  echo "  adminportalpri boleh sudo pri-perbarui tanpa sandi"
fi

echo
echo "SELESAI."
echo "  Aplikasi : https://$DOMAIN_APP"
echo "  Folder   : $AKAR"
echo "  Situs /var/www tidak diubah."
echo
echo "Lanjut CI/CD: sudo bash $SKRIP/17-pasang-deploy-otomatis.sh"
