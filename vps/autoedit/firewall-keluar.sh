#!/usr/bin/env bash
# =====================================================================
# Firewall KELUAR untuk container Auto Edit (subnet 10.251.0.0/24).
#
# Pengunduh video (yt-dlp) menerima link dari pengguna. Daftar situs di
# layanan sudah menolak alamat internal, tapi pengalihan (redirect) dari
# situs publik ke alamat internal hanya bisa ditutup di jaringan. Di sini:
# container Auto Edit boleh ke internet dan ke sesamanya, TIDAK ke alamat
# privat (database produksi, Redis, container lain) maupun ke server sendiri.
#
# Dipasang sebagai layanan systemd (pri-autoedit-firewall.service) oleh
# 12-perbarui.sh supaya berlaku lagi setelah reboot atau docker dijalankan
# ulang. Aman diulang.
# =====================================================================
set -euo pipefail
SUB="${AUTOEDIT_SUBNET:-10.251.0.0/24}"
RANTAI=PRI-AUTOEDIT-KELUAR

iptables -N "$RANTAI" 2>/dev/null || iptables -F "$RANTAI"
iptables -A "$RANTAI" -d "$SUB" -j RETURN
for jaringan in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16 \
                127.0.0.0/8 0.0.0.0/8 224.0.0.0/4 240.0.0.0/4; do
  iptables -A "$RANTAI" -d "$jaringan" -j REJECT --reject-with icmp-admin-prohibited
done
iptables -A "$RANTAI" -j RETURN

# Lalu lintas yang diteruskan (ke container lain / internet) lewat DOCKER-USER.
iptables -N DOCKER-USER 2>/dev/null || true
iptables -C DOCKER-USER -s "$SUB" -j "$RANTAI" 2>/dev/null \
  || iptables -I DOCKER-USER 1 -s "$SUB" -j "$RANTAI"
# Lalu lintas ke server sendiri (sshd, port lokal, alamat publik server) lewat INPUT.
iptables -C INPUT -s "$SUB" -j REJECT --reject-with icmp-admin-prohibited 2>/dev/null \
  || iptables -I INPUT 1 -s "$SUB" -j REJECT --reject-with icmp-admin-prohibited
echo "  firewall keluar Auto Edit aktif untuk $SUB"
