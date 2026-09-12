#!/usr/bin/env bash
# =====================================================================
# LANGKAH 1 — Menyiapkan VPS Hostinger (Ubuntu) sebagai pengganti
# Supabase Cloud untuk PRI SuperApp.
#
# KENAPA CARANYA BEGINI:
# Aplikasi memanggil database lewat REST (supabase-js) di 156 berkas,
# ditambah Storage (8 bucket) dan Realtime. Menulis ulang semua itu ke
# PostgreSQL polos = ribuan baris berubah = ladang bug. Maka yang kita
# pasang di VPS adalah PAKET SUPABASE YANG SAMA (open source, Docker),
# sehingga kode aplikasi TIDAK berubah sama sekali — cukup 3 baris env
# (SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY).
#
# Skrip ini hanya memasang perkakas dasar + firewall. Belum menyentuh
# data apa pun, jadi aman diulang kalau gagal di tengah.
#
# CARA PAKAI (sebagai root di VPS):
#   bash 01-siapkan-vps.sh
# =====================================================================
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Jalankan sebagai root: sudo bash $0" >&2
  exit 1
fi

echo "== 1/7 Zona waktu Asia/Jakarta =="
timedatectl set-timezone Asia/Jakarta || true

echo "== 2/9 Memperbarui sistem =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
# Pembaruan MENYELURUH sengaja TIDAK otomatis (11 Sep 2026): server ini
# bisa sudah melayani aplikasi lain, dan `apt-get upgrade` bisa memulai
# ulang layanan di tengah jam kerja. Jalankan sendiri saat sepi:
#   UPGRADE=1 bash 01-siapkan-vps.sh
if [ "${UPGRADE:-0}" = "1" ]; then
  apt-get upgrade -y
else
  TERTUNDA=$(apt-get -s upgrade 2>/dev/null | grep -c '^Inst' || true)
  echo "  $TERTUNDA paket bisa diperbarui — dilewati (pakai UPGRADE=1 bila mau)."
fi

echo "== 3/7 Paket dasar =="
apt-get install -y curl git ufw fail2ban ca-certificates gnupg python3 jq \
  debian-keyring debian-archive-keyring apt-transport-https

echo "== 4/7 Docker =="
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
# Compose v2 wajib (kita memakai fitur "!override" pada berkas override).
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 tidak tersedia. Hentikan dan laporkan ini." >&2
  exit 1
fi
docker --version
docker compose version

echo "== 5/7 Caddy (HTTPS otomatis) =="
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -y
  apt-get install -y caddy
fi
systemctl enable --now caddy

echo "== 6/9 Firewall =="
# Kalau server ini sudah melayani sesuatu di port lain, menyalakan ufw
# bisa memutusnya diam-diam. Port yang SUDAH mendengar ke publik
# diizinkan lebih dulu, lalu dilaporkan supaya terlihat.
SUDAH=$(ss -tlnH 2>/dev/null | awk '{print $4}' | grep -vE '^(127\.0\.0\.1|\[::1\])' | sed -E 's/.*:([0-9]+)$/\1/' | sort -un | tr '\n' ' ')
echo "  port yang sudah melayani publik: ${SUDAH:-(tidak ada)}"
for p in $SUDAH; do
  case "$p" in
    22|80|443) ;;
    *) echo "  mengizinkan port $p yang sudah dipakai layanan lain"; ufw allow "$p"/tcp >/dev/null ;;
  esac
done
# Hanya SSH + web yang terbuka. Postgres (5432) TIDAK pernah dibuka ke
# internet: aplikasi memanggil lewat HTTPS/REST, bukan koneksi Postgres
# langsung. Ini menutup pintu masuk paling berbahaya.
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban
ufw status verbose | head -20

echo "== 7/9 Swap (jaring pengaman memori) =="
# VPS 32 GB seharusnya tidak pernah kehabisan memori untuk beban ini,
# tetapi tanpa swap sama sekali, satu lonjakan sesaat (mis. pg_restore
# atau backup) bisa membuat kernel MEMBUNUH PostgreSQL. Swap kecil
# dipakai sebagai rem darurat, bukan sebagai memori tambahan — karena
# itu swappiness disetel rendah supaya database tetap di RAM.
if [ ! -f /swapfile ] && ! swapon --show | grep -q .; then
  RAM_GB=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1024 / 1024 ))
  if [ "$RAM_GB" -ge 16 ]; then SWAP_GB=4; else SWAP_GB=2; fi
  echo "RAM ${RAM_GB} GB -> swap ${SWAP_GB} GB"
  fallocate -l "${SWAP_GB}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_GB * 1024))
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
  echo "Swap sudah ada — dilewati."
fi
cat > /etc/sysctl.d/99-pri.conf <<'EOF'
# Database harus tetap di RAM; swap hanya untuk keadaan darurat.
vm.swappiness = 10
# Menulis halaman kotor lebih awal supaya tidak ada hentakan besar
# saat checkpoint PostgreSQL.
vm.dirty_background_ratio = 5
vm.dirty_ratio = 10
# Koneksi banyak + Docker: batas berkas dan antrean dinaikkan.
fs.file-max = 2097152
net.core.somaxconn = 4096
EOF
sysctl --system >/dev/null
free -h | sed 's/^/  /'

echo "== 8/9 Batas berkas untuk Docker =="
mkdir -p /etc/systemd/system/docker.service.d
cat > /etc/systemd/system/docker.service.d/limits.conf <<'EOF'
[Service]
LimitNOFILE=1048576
LimitNPROC=infinity
LimitCORE=infinity
EOF
systemctl daemon-reload
# Memulai ulang Docker ikut memulai ulang SEMUA container di server ini.
# Kalau sudah ada yang jalan, jangan diganggu: setelan baru toh berlaku
# pada pemulaian berikutnya.
JALAN=$(docker ps -q 2>/dev/null | wc -l)
if [ "$JALAN" -gt 0 ]; then
  echo "  ada $JALAN container sedang jalan — Docker TIDAK dimulai ulang."
  echo "  setelan batas berkas berlaku setelah: systemctl restart docker (lakukan saat sepi)."
else
  systemctl restart docker
fi

echo "== 9/9 Folder kerja =="
mkdir -p /opt/pri/skrip /opt/pri/cadangan /opt/pri/dump
chmod 700 /opt/pri

echo
echo "SELESAI. VPS siap."
echo "Lanjut: pastikan domain sudah diarahkan (A record) ke IP VPS ini,"
echo "lalu jalankan:  DOMAIN=db.domainanda.com bash 02-pasang-supabase.sh"
