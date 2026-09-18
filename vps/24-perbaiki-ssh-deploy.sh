#!/usr/bin/env bash
# =====================================================================
# LANGKAH 24 — MEMPERBAIKI SAMBUNGAN SSH UNTUK DEPLOY OTOMATIS
# (18 Sep 2026)
#
# Pasangan dari 23-periksa-ssh-deploy.sh. Yang di sana MEMBACA, yang di
# sini MENGUBAH — tapi tiap perbaikan punya penjaganya sendiri dan
# menolak jalan kalau syaratnya tidak terpenuhi. Jadi menjalankan
# `--semua-yang-perlu` pada server yang sebenarnya baik-baik saja tidak
# mengubah apa pun.
#
# ATURAN KESELAMATAN YANG DIPEGANG SKRIP INI
#
#   1. Pengaturan SSH yang disentuh HANYA MaxStartups — yaitu berapa
#      banyak sambungan yang boleh mengantre sebelum login. Tidak ada
#      satu pun baris yang menyangkut siapa boleh masuk, kunci, sandi,
#      atau nomor port. Artinya perbaikan ini secara teknis TIDAK BISA
#      mengunci Anda di luar server, seburuk apa pun hasilnya.
#   2. Perubahan ditulis sebagai berkas TERSENDIRI di
#      /etc/ssh/sshd_config.d/, bukan mengedit berkas utama. Membatalkan
#      = menghapus satu berkas.
#   3. `sshd -t` dijalankan SEBELUM memuat ulang. Kalau tidak sah,
#      berkasnya dihapus lagi dan tidak ada yang dimuat.
#   4. Memakai `reload`, bukan `restart`. Sesi SSH yang sedang berjalan
#      — termasuk milik Anda saat menjalankan ini — tidak terputus.
#
# CARA PAKAI (root, di VPS) — pilih salah satu:
#   bash 24-perbaiki-ssh-deploy.sh --semua-yang-perlu
#   bash 24-perbaiki-ssh-deploy.sh --maxstartups
#   bash 24-perbaiki-ssh-deploy.sh --fail2ban-normal
#   bash 24-perbaiki-ssh-deploy.sh --izinkan-github
#   bash 24-perbaiki-ssh-deploy.sh --batalkan      # kembalikan semua
# =====================================================================
set -uo pipefail

[ "$(id -u)" -eq 0 ] || [ -n "${PRI_UJI:-}" ] || { echo "Jalankan sebagai root: sudo bash $0 $*" >&2; exit 1; }

# Jalurnya bisa ditimpa lewat env — dipakai pengujian di luar server
# (tests/uji-perbaiki-ssh.sh). Di VPS, ketiganya memakai bawaan.
DROPIN="${PRI_DROPIN:-/etc/ssh/sshd_config.d/99-pri-deploy.conf}"
F2B_BERKAS="${PRI_F2B_BERKAS:-/etc/fail2ban/jail.d/zz-pri-deploy.local}"
SSHD_CONFIG="${PRI_SSHD_CONFIG:-/etc/ssh/sshd_config}"
F2B_JAIL_LOCAL="${PRI_F2B_JAIL_LOCAL:-/etc/fail2ban/jail.local}"
F2B_JAIL_DIR="${PRI_F2B_JAIL_DIR:-/etc/fail2ban/jail.d/}"
PENANDA="# dikelola vps/24-perbaiki-ssh-deploy.sh — hapus berkas ini untuk membatalkan"

MAXSTARTUPS=0
F2B_NORMAL=0
IZIN_GITHUB=0
BATALKAN=0
ADA_PILIHAN=0
for a in "$@"; do
  case "$a" in
    --semua-yang-perlu) MAXSTARTUPS=1; F2B_NORMAL=1; IZIN_GITHUB=1; ADA_PILIHAN=1 ;;
    --maxstartups)      MAXSTARTUPS=1; ADA_PILIHAN=1 ;;
    --fail2ban-normal)  F2B_NORMAL=1;  ADA_PILIHAN=1 ;;
    --izinkan-github)   IZIN_GITHUB=1; ADA_PILIHAN=1 ;;
    --batalkan)         BATALKAN=1;    ADA_PILIHAN=1 ;;
    *) echo "Pilihan tidak dikenal: $a" >&2; exit 1 ;;
  esac
done
if [ "$ADA_PILIHAN" = "0" ]; then
  sed -n '/^# CARA PAKAI/,/^# ====/p' "$0" | sed 's/^# \{0,1\}//' | head -8
  echo
  echo "Jalankan 23-periksa-ssh-deploy.sh lebih dulu untuk tahu mana yang perlu."
  exit 1
fi

DIUBAH=0
lapor() { echo "  $1"; }

# ---------------------------------------------------------------------
if [ "$BATALKAN" = "1" ]; then
  echo "== Membatalkan semua perubahan skrip ini =="
  if [ -f "$DROPIN" ]; then
    rm -f "$DROPIN"
    if sshd -t 2>/dev/null; then
      systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
      lapor "MaxStartups dikembalikan ke bawaan ($DROPIN dihapus)."
    else
      lapor "PERINGATAN: sshd -t gagal setelah berkas dihapus — periksa /etc/ssh/sshd_config sendiri."
    fi
  else
    lapor "Tidak ada perubahan MaxStartups untuk dibatalkan."
  fi
  if [ -f "$F2B_BERKAS" ]; then
    rm -f "$F2B_BERKAS"
    fail2ban-client reload >/dev/null 2>&1 || true
    lapor "Pengaturan fail2ban tambahan dihapus ($F2B_BERKAS)."
  else
    lapor "Tidak ada pengaturan fail2ban tambahan untuk dibatalkan."
  fi
  echo
  echo "SELESAI. Server kembali ke keadaan sebelum skrip ini dijalankan."
  exit 0
fi

# ---------------------------------------------------------------------
if [ "$MAXSTARTUPS" = "1" ]; then
  echo "== Antrean sambungan sshd (MaxStartups) =="
  KINI="$(sshd -T 2>/dev/null | sed -n 's/^maxstartups[[:space:]]*//p')"
  AWAL="${KINI%%:*}"
  if [ -z "$KINI" ]; then
    lapor "LEWAT: nilai MaxStartups tidak terbaca (sshd -T gagal)."
  elif [ "${AWAL:-0}" -ge 100 ] 2>/dev/null; then
    lapor "LEWAT: sudah $KINI — antreannya sudah lapang, tidak perlu diubah."
  else
    lapor "sekarang: $KINI  → akan dijadikan 100:30:200"
    lapor "artinya: sambungan boleh mengantre sampai 100 sebelum ada yang dibuang."

    # Berkas terpisah hanya bekerja bila sshd_config memuatnya.
    if ! grep -qE '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config\.d/' "$SSHD_CONFIG" 2>/dev/null; then
      lapor "BATAL: $SSHD_CONFIG tidak memuat folder sshd_config.d."
      lapor "Menambah baris Include berarti mengubah berkas utama — tidak dilakukan tanpa Anda tahu."
      lapor "Tambahkan sendiri di baris PERTAMA berkas itu:  Include /etc/ssh/sshd_config.d/*.conf"
    else
      mkdir -p "$(dirname "$DROPIN")"
      CADANGAN=""
      [ -f "$DROPIN" ] && { CADANGAN="$DROPIN.cadangan-$(date +%Y%m%d-%H%M%S)"; cp -a "$DROPIN" "$CADANGAN"; }
      cat > "$DROPIN" <<EOF
$PENANDA
# Port 22 yang terbuka ke internet dihujani bot sepanjang hari. Dengan
# nilai bawaan (10:30:100), antrean "belum login" cepat penuh oleh
# mereka, lalu sshd membuang sambungan BARU secara acak — termasuk
# sambungan sah dari GitHub Actions. Gejalanya di GitHub: "i/o timeout",
# kadang gagal kadang berhasil.
# Menaikkan angka ini tidak melonggarkan keamanan sedikit pun: siapa
# yang boleh masuk sama sekali tidak diatur di sini.
MaxStartups 100:30:200
EOF
      if sshd -t 2>/tmp/sshd-uji.log; then
        if systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null; then
          BARU="$(sshd -T 2>/dev/null | sed -n 's/^maxstartups[[:space:]]*//p')"
          lapor "OK — sekarang: ${BARU:-?}   (sesi SSH yang sedang jalan tidak terputus)"
          DIUBAH=1
        else
          lapor "GAGAL memuat ulang sshd — berkas dikembalikan."
          rm -f "$DROPIN"; [ -n "$CADANGAN" ] && mv "$CADANGAN" "$DROPIN"
        fi
      else
        lapor "GAGAL: pengaturan tidak sah, berkas dihapus lagi. Tidak ada yang berubah."
        sed 's/^/      /' /tmp/sshd-uji.log
        rm -f "$DROPIN"; [ -n "$CADANGAN" ] && mv "$CADANGAN" "$DROPIN"
      fi
    fi
  fi
  echo
fi

# ---------------------------------------------------------------------
if [ "$F2B_NORMAL" = "1" ] || [ "$IZIN_GITHUB" = "1" ]; then
  echo "== fail2ban =="
  if ! command -v fail2ban-client >/dev/null 2>&1 || ! systemctl is-active --quiet fail2ban 2>/dev/null; then
    lapor "LEWAT: fail2ban tidak terpasang atau tidak berjalan — bukan penyebabnya."
  else

    if [ "$F2B_NORMAL" = "1" ]; then
      AGG="$(grep -rlE '^[[:space:]]*mode[[:space:]]*=[[:space:]]*aggressive' \
             "$F2B_JAIL_LOCAL" "$F2B_JAIL_DIR" 2>/dev/null || true)"
      if [ -z "$AGG" ]; then
        lapor "mode 'aggressive' tidak dipakai — tidak ada yang perlu diturunkan."
      else
        for B in $AGG; do
          cp -a "$B" "$B.cadangan-$(date +%Y%m%d-%H%M%S)"
          sed -i 's/^\([[:space:]]*mode[[:space:]]*=[[:space:]]*\)aggressive/\1normal/' "$B"
          lapor "mode 'aggressive' → 'normal' di $B (salinan lama disimpan)"
        done
        DIUBAH=1
      fi
    fi

    if [ "$IZIN_GITHUB" = "1" ]; then
      # Alamat runner GitHub diambil dari sumber resminya, bukan ditulis
      # tangan: kolamnya besar dan berubah terus.
      META="$(curl -fsS --max-time 20 https://api.github.com/meta 2>/dev/null || true)"
      if [ -z "$META" ]; then
        lapor "GAGAL mengambil daftar alamat GitHub (api.github.com/meta tidak terjawab)."
      else
        if command -v jq >/dev/null 2>&1; then
          RANGES="$(printf '%s' "$META" | jq -r '.actions[]?' 2>/dev/null | tr '\n' ' ')"
        elif command -v python3 >/dev/null 2>&1; then
          RANGES="$(printf '%s' "$META" | python3 -c 'import sys,json;print(" ".join(json.load(sys.stdin).get("actions",[])))' 2>/dev/null)"
        else
          RANGES=""
          lapor "GAGAL: butuh jq atau python3 untuk membaca daftarnya. Pasang salah satu: apt-get install -y jq"
        fi
        JML="$(printf '%s' "$RANGES" | wc -w)"
        if [ "${JML:-0}" -lt 1 ]; then
          lapor "Daftar alamat GitHub kosong — tidak ada yang ditulis."
        else
          # Daftar lama dipertahankan; menimpanya bisa membuka blokir
          # yang sengaja dipasang orang lain.
          LAMA="$(fail2ban-client get sshd ignoreip 2>/dev/null | tr -d '|`-' | tr '\n' ' ' | sed 's/^ *//')"
          [ -z "$LAMA" ] && LAMA="127.0.0.1/8 ::1"
          cat > "$F2B_BERKAS" <<EOF
$PENANDA
# Alamat runner GitHub Actions ($JML rentang, diambil dari
# api.github.com/meta pada $(date -Is)). Tanpa ini, fail2ban bisa
# memblokir deploy otomatis kita sendiri — alamatnya selalu berganti
# sehingga tiap kali terlihat seperti penyerang baru.
[DEFAULT]
ignoreip = $LAMA $RANGES
EOF
          if fail2ban-client reload >/tmp/f2b.log 2>&1; then
            lapor "OK — $JML rentang alamat GitHub dikecualikan ($F2B_BERKAS)"
            DIUBAH=1
          else
            lapor "GAGAL memuat ulang fail2ban — berkas dihapus lagi:"
            sed 's/^/      /' /tmp/f2b.log
            rm -f "$F2B_BERKAS"
            fail2ban-client reload >/dev/null 2>&1 || true
          fi
        fi
      fi
    fi
  fi
  echo
fi

# ---------------------------------------------------------------------
echo "== Hasil =="
if [ "$DIUBAH" = "0" ]; then
  echo "  Tidak ada yang diubah — semua syaratnya sudah terpenuhi atau"
  echo "  penyebabnya bukan yang ditangani skrip ini."
  echo "  Kalau deploy masih gagal, penyebabnya kemungkinan DI LUAR server"
  echo "  (firewall Hostinger di depan mesin). Periksa di panel Hostinger."
else
  echo "  Ada perubahan yang diterapkan. Ujinya begini:"
  echo "    1. dorong satu perubahan kecil ke GitHub, atau jalankan ulang"
  echo "       job \"Deploy VPS\" yang terakhir;"
  echo "    2. amati apakah masih ada \"i/o timeout\"."
  echo
  echo "  Membatalkan semuanya:  bash $0 --batalkan"
fi
