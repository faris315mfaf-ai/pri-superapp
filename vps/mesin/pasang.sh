#!/usr/bin/env bash
# =====================================================================
# PASANG / SEGARKAN VPS MESIN AUTO EDIT (5 Okt 2026)
#
# Dijalankan root di VPS mesin (72.61.143.158) dari /opt/pri-mesin. Berkas
# ini, docker-compose.yml, dan autoedit/*.sh dikirim ke sana oleh
# 12-perbarui.sh (mode mesin "jauh") setiap pembaruan. Aman diulang.
#
#   bash /opt/pri-mesin/pasang.sh [UKURAN_DISK_GB]   (bawaan 300)
#
# Yang TIDAK diurus di sini (sekali saja, dengan tangan): WireGuard wg0
# (10.77.0.2), UFW dasar (SSH + 51820/udp dari VPS aplikasi), fail2ban,
# dan login SSH khusus kunci.
# =====================================================================
set -euo pipefail
DIR=/opt/pri-mesin
UKURAN_GB="${1:-300}"
[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root." >&2; exit 1; }

# 1. Disk media: image ext4 ukuran tetap di /srv/godam/media (+ folder socket).
#    Kalau penuh, yang berhenti hanya Auto Edit, bukan sistem.
bash "$DIR/autoedit/siapkan-disk.sh" "$UKURAN_GB" >/dev/null

# 2. Firewall keluar container (subnet 10.251.0.0/24): internet boleh,
#    alamat privat — termasuk jalur WireGuard ke VPS aplikasi — tidak.
install -m 755 "$DIR/autoedit/firewall-keluar.sh" /usr/local/sbin/pri-autoedit-firewall
cat > /etc/systemd/system/pri-autoedit-firewall.service <<'UNIT'
[Unit]
Description=Firewall keluar container Auto Edit PRI
After=docker.service
PartOf=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/pri-autoedit-firewall

[Install]
WantedBy=multi-user.target docker.service
UNIT
systemctl daemon-reload
systemctl enable --quiet pri-autoedit-firewall.service
systemctl restart pri-autoedit-firewall.service

# 3. Port jembatan (7700) hanya untuk VPS aplikasi, hanya lewat wg0.
ufw status | grep -q "7700/tcp on wg0" \
  || ufw allow in on wg0 from 10.77.0.1 to any port 7700 proto tcp comment "Jembatan Auto Edit dari VPS aplikasi" >/dev/null

# 4. Cadangan harian template (berkas desain anggota) — 14 hari, hardlink.
{
  echo 'SHELL=/bin/bash'
  echo 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
  echo "50 2 * * * root bash $DIR/autoedit/cadangan-template.sh >> /var/log/pri-autoedit-cadangan.log 2>&1"
} > /etc/cron.d/pri-autoedit
chmod 644 /etc/cron.d/pri-autoedit

echo "VPS mesin siap: $(df -h --output=avail /srv/godam/media | tail -1 | tr -d ' ') bebas di disk media"
