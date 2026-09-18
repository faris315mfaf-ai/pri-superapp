#!/usr/bin/env bash
# =====================================================================
# LANGKAH 23 — KENAPA DEPLOY OTOMATIS SERING GAGAL MENYAMBUNG SSH
# (18 Sep 2026)
#
# GEJALANYA: job "Deploy VPS" di GitHub gagal dengan
#     dial tcp <server>:22: i/o timeout
# pada 2 dari 4 deploy hari ini, dan dua-duanya langsung berhasil saat
# diulang tanpa mengubah apa pun. Sementara itu SSH dari komputer
# sendiri lancar di jam yang sama.
#
# KENAPA PERLU DIPERIKSA, BUKAN LANGSUNG DIPERBAIKI: kata "timeout"
# sudah menyempitkan kemungkinan, tapi belum menunjuk satu sebab.
# Timeout berarti paketnya DIBUANG DIAM-DIAM — bukan ditolak, bukan
# SSH-nya mati. Yang bisa membuang paket diam-diam ada empat, dan
# obatnya berbeda-beda:
#
#   1. fail2ban memblokir alamat runner GitHub (alamatnya ribuan dan
#      berganti terus, jadi mudah dianggap penyerang baru).
#   2. sshd menolak sambungan baru karena antrean "belum login" penuh
#      (MaxStartups). Port 22 yang terbuka ke internet dihujani bot
#      sepanjang hari; antreannya bisa penuh oleh mereka, lalu
#      sambungan SAH ikut dibuang secara acak. Ini paling cocok dengan
#      gejala "kadang gagal, kadang berhasil".
#   3. Firewall server atau firewall Hostinger membatasi laju sambungan.
#   4. Tabel conntrack penuh.
#
# Menebak satu lalu mengubah pengaturan SSH di server produksi adalah
# cara tercepat mengunci diri sendiri di luar. Jadi skrip ini MEMBACA
# SAJA. Tidak ada satu pun pengaturan yang diubah.
#
# Perbaikannya ada di skrip terpisah (24-perbaiki-ssh-deploy.sh) yang
# hanya menjalankan tindakan sesuai temuan di sini.
#
# CARA PAKAI (root, di VPS):
#   bash /opt/pri-superapp/skrip/23-periksa-ssh-deploy.sh
#   bash ... 23-periksa-ssh-deploy.sh "2026-09-18 11:23" "2026-09-18 16:16"
#     (jam kegagalan dalam UTC — dipakai mencari jejak di log)
# =====================================================================
set -uo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root: sudo bash $0 $*" >&2; exit 1; }

# Jam kegagalan (UTC). Bawaannya dua kejadian yang sudah tercatat.
JAM_GAGAL=("$@")
[ ${#JAM_GAGAL[@]} -eq 0 ] && JAM_GAGAL=("2026-09-18 11:23" "2026-09-18 16:16")

TEMUAN=()   # dikumpulkan, dicetak sebagai kesimpulan di akhir
catat() { TEMUAN+=("$1"); }

garis() { printf '%s\n' "------------------------------------------------------------"; }

echo "PEMERIKSAAN SAMBUNGAN SSH UNTUK DEPLOY OTOMATIS"
echo "Server : $(hostname) — $(date -Is)"
echo "Catatan: skrip ini TIDAK mengubah apa pun."
garis

# ---------------------------------------------------------------------
echo "== 1/6 fail2ban =="
if ! command -v fail2ban-client >/dev/null 2>&1; then
  echo "  fail2ban tidak terpasang."
  catat "fail2ban TIDAK terpasang — berarti ia bukan penyebabnya."
  F2B=0
elif ! systemctl is-active --quiet fail2ban 2>/dev/null; then
  echo "  fail2ban terpasang tapi TIDAK berjalan."
  catat "fail2ban terpasang tapi mati — bukan penyebabnya."
  F2B=0
else
  F2B=1
  JAILS="$(fail2ban-client status 2>/dev/null | sed -n 's/.*Jail list:[[:space:]]*//p' | tr ',' ' ')"
  echo "  jail aktif: ${JAILS:-(tidak terbaca)}"
  for J in $JAILS; do
    J="$(echo "$J" | tr -d ' ')"
    [ -n "$J" ] || continue
    ST="$(fail2ban-client status "$J" 2>/dev/null)"
    KINI="$(echo "$ST" | sed -n 's/.*Currently banned:[[:space:]]*//p' | head -1)"
    TOTAL="$(echo "$ST" | sed -n 's/.*Total banned:[[:space:]]*//p' | head -1)"
    printf "    %-14s sedang diblokir: %-6s total sejak nyala: %s\n" "$J" "${KINI:-?}" "${TOTAL:-?}"
  done

  # "mode aggressive" pada jail sshd ikut memblokir sambungan yang
  # ditutup SEBELUM login selesai. Alat deploy (drone-ssh) membuka dan
  # menutup sambungan dengan cepat, jadi mode ini bisa menganggapnya
  # penyerang padahal kuncinya sah.
  MODE="$(grep -rhoE '^[[:space:]]*mode[[:space:]]*=[[:space:]]*\w+' /etc/fail2ban/jail.local /etc/fail2ban/jail.d/ 2>/dev/null | head -3 | tr -d ' ')"
  if echo "$MODE" | grep -qi aggressive; then
    echo "  PERHATIAN: ada jail bermode 'aggressive' ($MODE)."
    catat "fail2ban memakai mode 'aggressive' — ini memblokir sambungan yang ditutup sebelum login selesai, dan alat deploy bisa terkena. Turunkan ke 'normal'."
  else
    echo "  mode jail: ${MODE:-normal/bawaan}"
  fi

  IGN="$(grep -rhE '^[[:space:]]*ignoreip' /etc/fail2ban/jail.local /etc/fail2ban/jail.d/ 2>/dev/null | head -2)"
  echo "  ignoreip: ${IGN:-(tidak diatur)}"
fi
garis

# ---------------------------------------------------------------------
echo "== 2/6 Apakah ada pemblokiran TEPAT saat deploy gagal =="
LOGF2B=/var/log/fail2ban.log
KENA=0
if [ "$F2B" = "1" ] && [ -r "$LOGF2B" ]; then
  for JAM in "${JAM_GAGAL[@]}"; do
    # Log fail2ban memakai waktu LOKAL server; jam kegagalan dari GitHub
    # adalah UTC. Dicari dua-duanya supaya tidak meleset karena zona.
    JAM_LOKAL="$(date -d "$JAM UTC" '+%Y-%m-%d %H:%M' 2>/dev/null || echo "$JAM")"
    HIT="$(grep -E "Ban" "$LOGF2B" 2>/dev/null | grep -E "${JAM:0:16}|${JAM_LOKAL:0:16}" | head -5)"
    if [ -n "$HIT" ]; then
      KENA=1
      echo "  ADA pemblokiran sekitar $JAM UTC (= $JAM_LOKAL lokal):"
      echo "$HIT" | sed 's/^/      /'
    else
      echo "  tidak ada pemblokiran sekitar $JAM UTC (= $JAM_LOKAL lokal)"
    fi
  done
  echo "  pemblokiran 24 jam terakhir: $(grep -c 'Ban ' "$LOGF2B" 2>/dev/null || echo 0) baris (seluruh isi berkas)"
else
  echo "  dilewati (fail2ban tidak aktif atau $LOGF2B tidak terbaca)"
fi
[ "$KENA" = "1" ] && catat "TERBUKTI: ada pemblokiran fail2ban tepat di jam deploy gagal." \
                  || { [ "$F2B" = "1" ] && catat "Tidak ditemukan pemblokiran fail2ban di jam deploy gagal — kemungkinan besar BUKAN fail2ban."; }
garis

# ---------------------------------------------------------------------
echo "== 3/6 sshd: antrean sambungan & hujan bot =="
MAXS="$(sshd -T 2>/dev/null | sed -n 's/^maxstartups[[:space:]]*//p')"
echo "  MaxStartups sekarang: ${MAXS:-(tidak terbaca)}   (bawaan OpenSSH: 10:30:100)"
echo "     artinya: mulai ${MAXS%%:*} sambungan yang belum login, sebagian DIBUANG acak."

# Pesan ini dicetak sshd persis ketika ia mulai membuang sambungan.
THROT="$( { journalctl -u ssh -u sshd --since '48 hours ago' 2>/dev/null || cat /var/log/auth.log 2>/dev/null; } \
          | grep -ciE 'beginning MaxStartups throttling|drop connection #' || true)"
echo "  jejak pembuangan sambungan (48 jam): ${THROT:-0} baris"
if [ "${THROT:-0}" -gt 0 ]; then
  catat "TERBUKTI: sshd membuang sambungan karena antreannya penuh (MaxStartups). Inilah yang paling cocok dengan 'kadang gagal, kadang berhasil'."
fi

GAGAL_AUTH="$( { journalctl -u ssh -u sshd --since '24 hours ago' 2>/dev/null || cat /var/log/auth.log 2>/dev/null; } \
              | grep -ciE 'Failed password|Invalid user|Connection closed by authenticating' || true)"
echo "  percobaan login gagal (24 jam): ${GAGAL_AUTH:-0}"
if [ "${GAGAL_AUTH:-0}" -gt 2000 ]; then
  catat "Port 22 dihujani bot (${GAGAL_AUTH} percobaan gagal dalam 24 jam). Itu yang memenuhi antrean sshd."
fi
garis

# ---------------------------------------------------------------------
echo "== 4/6 Firewall di server =="
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
  echo "  ufw AKTIF:"
  ufw status numbered 2>/dev/null | grep -iE '22|ssh|limit' | sed 's/^/      /' || true
  if ufw status 2>/dev/null | grep -iE '^22|ssh' | grep -qi limit; then
    catat "ufw memakai aturan LIMIT pada port 22 — ia membuang sambungan ke-7 dan seterusnya dari satu alamat dalam 30 detik. Runner GitHub bisa terkena."
  fi
else
  echo "  ufw tidak aktif / tidak terpasang."
fi
if command -v nft >/dev/null 2>&1 && nft list ruleset 2>/dev/null | grep -q 'dport 22'; then
  echo "  aturan nftables yang menyentuh port 22:"
  nft list ruleset 2>/dev/null | grep -B2 'dport 22' | head -12 | sed 's/^/      /'
fi
IPT="$(iptables -S 2>/dev/null | grep -E '\-\-dport 22|recent|hashlimit|limit' | head -8)"
if [ -n "$IPT" ]; then
  echo "  aturan iptables yang menyentuh port 22 / pembatas laju:"
  echo "$IPT" | sed 's/^/      /'
  echo "$IPT" | grep -qE 'recent|hashlimit|limit' && \
    catat "Ada aturan PEMBATAS LAJU di iptables pada port 22 — pembatas semacam ini membuang paket diam-diam, persis menghasilkan 'i/o timeout'."
else
  echo "  tidak ada aturan iptables khusus port 22."
fi
garis

# ---------------------------------------------------------------------
echo "== 5/6 Conntrack & antrean SYN =="
CT_MAKS="$(cat /proc/sys/net/netfilter/nf_conntrack_max 2>/dev/null || echo '')"
CT_KINI="$(cat /proc/sys/net/netfilter/nf_conntrack_count 2>/dev/null || echo '')"
if [ -n "$CT_MAKS" ] && [ -n "$CT_KINI" ]; then
  PERSEN=$(( CT_KINI * 100 / (CT_MAKS > 0 ? CT_MAKS : 1) ))
  echo "  conntrack: $CT_KINI / $CT_MAKS (${PERSEN}%)"
  [ "$PERSEN" -gt 80 ] && catat "Tabel conntrack hampir penuh (${PERSEN}%) — sambungan baru akan dibuang."
else
  echo "  conntrack: tidak terbaca (mungkin modulnya tidak dimuat)"
fi
PENUH="$(dmesg 2>/dev/null | grep -ciE 'conntrack table full|TCP: request_sock|possible SYN flooding' || true)"
echo "  pesan kernel soal antrean penuh: ${PENUH:-0}"
[ "${PENUH:-0}" -gt 0 ] && catat "Kernel mencatat antrean sambungan penuh / dugaan SYN flood — ini juga membuang paket diam-diam."
garis

# ---------------------------------------------------------------------
echo "== 6/6 KESIMPULAN =="
if [ ${#TEMUAN[@]} -eq 0 ]; then
  echo "  Tidak ada satu pun penyebab yang terbukti dari log yang tersedia."
  echo "  Kemungkinan besar pembatasan terjadi DI LUAR server — firewall"
  echo "  Hostinger di depan mesin ini. Periksa di panel Hostinger:"
  echo "  apakah ada aturan yang membatasi port 22."
else
  for t in "${TEMUAN[@]}"; do echo "  • $t"; done
fi
echo
echo "LANGKAH BERIKUTNYA"
echo "  Kirimkan seluruh keluaran di atas. Perbaikannya dipilih dari"
echo "  temuan ini, bukan ditebak — mengubah pengaturan SSH tanpa bukti"
echo "  adalah cara tercepat mengunci diri di luar server."
echo
echo "  Perbaikan yang paling mungkin, dan sudah disiapkan:"
echo "    • antrean sshd penuh  -> naikkan MaxStartups (aman, bisa dibatalkan)"
echo "    • fail2ban aggressive -> turunkan ke mode normal"
echo "    • pembatas laju       -> beri pengecualian untuk alamat GitHub"
echo "  Semuanya ada di 24-perbaiki-ssh-deploy.sh, dan tidak satu pun"
echo "  berjalan tanpa Anda memintanya secara khusus."
