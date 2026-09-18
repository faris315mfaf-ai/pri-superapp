#!/usr/bin/env bash
# =====================================================================
# Uji vps/24-perbaiki-ssh-deploy.sh TANPA server, tanpa sshd sungguhan.
#
# Skrip itu mengubah pengaturan SSH di server produksi. Yang paling
# mahal kalau salah bukan "fiturnya tidak jalan", melainkan perubahan
# yang terlanjur ditulis padahal tidak sah — atau perubahan yang tetap
# tertinggal setelah gagal. Maka yang diuji di sini adalah PENJAGANYA:
#   • menolak jalan kalau syaratnya tidak terpenuhi;
#   • menghapus lagi berkasnya kalau `sshd -t` menolak;
#   • bisa dibatalkan sepenuhnya.
#
# Caranya: sshd, systemctl, fail2ban-client, dan curl palsu ditaruh di
# depan PATH.
# =====================================================================
set -uo pipefail

AKAR="$(cd "$(dirname "$0")/.." && pwd)"
SKRIP="$AKAR/vps/24-perbaiki-ssh-deploy.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

lulus=0; gagal=0
cek() {
  if [ "$2" = "1" ]; then lulus=$((lulus+1)); echo "  ✔ $1"
  else gagal=$((gagal+1)); echo "  ✘ $1 ${3:-}"; fi
}

mkdir -p "$T/bin" "$T/sshd_config.d" "$T/jail.d"
DROPIN="$T/sshd_config.d/99-pri-deploy.conf"
F2B="$T/jail.d/zz-pri-deploy.local"
SSHDCONF="$T/sshd_config"
echo "Include /etc/ssh/sshd_config.d/*.conf" > "$SSHDCONF"

cat > "$T/bin/sshd" <<'SH'
#!/usr/bin/env bash
# -T mencetak pengaturan efektif; -t memeriksa keabsahan.
if [ "${1:-}" = "-T" ]; then echo "maxstartups ${UJI_MAXSTARTUPS:-10:30:100}"; exit 0; fi
if [ "${1:-}" = "-t" ]; then
  if [ "${UJI_SSHD_T_GAGAL:-0}" = "1" ]; then echo "/etc/ssh/sshd_config: baris tidak sah" >&2; exit 1; fi
  exit 0
fi
exit 0
SH
cat > "$T/bin/systemctl" <<'SH'
#!/usr/bin/env bash
case "${1:-}" in
  is-active) [ "${UJI_F2B_AKTIF:-1}" = "1" ] && exit 0 || exit 3 ;;
  reload)    [ "${UJI_RELOAD_GAGAL:-0}" = "1" ] && exit 1 || exit 0 ;;
esac
exit 0
SH
cat > "$T/bin/fail2ban-client" <<'SH'
#!/usr/bin/env bash
case "$*" in
  *"get sshd ignoreip"*) echo "127.0.0.1/8 ::1 10.0.0.0/8"; exit 0 ;;
  reload) exit 0 ;;
esac
exit 0
SH
cat > "$T/bin/curl" <<'SH'
#!/usr/bin/env bash
# Hanya melayani api.github.com/meta; sisanya diam.
case "$*" in
  *api.github.com/meta*) echo '{"actions":["4.3.2.0/24","13.64.0.0/16","2603:1030::/32"]}'; exit 0 ;;
esac
exit 1
SH
chmod +x "$T/bin"/*

jalankan() {
  PATH="$T/bin:$PATH" PRI_UJI=1 \
    PRI_DROPIN="$DROPIN" PRI_F2B_BERKAS="$F2B" PRI_SSHD_CONFIG="$SSHDCONF" \
    PRI_F2B_JAIL_LOCAL="$T/jail.local" PRI_F2B_JAIL_DIR="$T/jail.d/" \
    bash "$SKRIP" "$@" 2>&1
}

echo
echo "[A] Tanpa pilihan — jangan mengubah apa pun, tampilkan cara pakai"
OUT="$(jalankan)"; KODE=$?
cek "keluar dengan kode galat" "$([ "$KODE" != "0" ] && echo 1 || echo 0)" "kode=$KODE"
cek "menyebut cara pakai" "$(echo "$OUT" | grep -q -- "--maxstartups" && echo 1 || echo 0)"
cek "tidak menulis berkas apa pun" "$([ ! -f "$DROPIN" ] && [ ! -f "$F2B" ] && echo 1 || echo 0)"

echo
echo "[B] MaxStartups sudah lapang — tidak perlu diubah"
OUT="$(UJI_MAXSTARTUPS=100:30:200 jalankan --maxstartups)"
cek "dilaporkan dilewati" "$(echo "$OUT" | grep -q "LEWAT" && echo 1 || echo 0)" "$OUT"
cek "berkas tidak dibuat" "$([ ! -f "$DROPIN" ] && echo 1 || echo 0)"

echo
echo "[C] MaxStartups masih bawaan — dinaikkan"
OUT="$(jalankan --maxstartups)"
cek "berkas dibuat" "$([ -f "$DROPIN" ] && echo 1 || echo 0)"
cek "isinya MaxStartups 100:30:200" "$(grep -q '^MaxStartups 100:30:200' "$DROPIN" && echo 1 || echo 0)"
cek "diberi penanda supaya jelas siapa yang membuat" "$(grep -q 'hapus berkas ini untuk membatalkan' "$DROPIN" && echo 1 || echo 0)"
cek "berkas sshd_config utama TIDAK disentuh" "$([ "$(cat "$SSHDCONF")" = "Include /etc/ssh/sshd_config.d/*.conf" ] && echo 1 || echo 0)"

echo
echo "[D] sshd menolak pengaturannya — berkas HARUS dihapus lagi"
rm -f "$DROPIN"
OUT="$(UJI_SSHD_T_GAGAL=1 jalankan --maxstartups)"
cek "melaporkan gagal" "$(echo "$OUT" | grep -q "GAGAL" && echo 1 || echo 0)" "$OUT"
cek "berkas TIDAK tertinggal" "$([ ! -f "$DROPIN" ] && echo 1 || echo 0)"
cek "menyatakan tidak ada yang berubah" "$(echo "$OUT" | grep -q "Tidak ada yang berubah" && echo 1 || echo 0)"

echo
echo "[E] sshd_config tidak memuat folder sshd_config.d — jangan edit berkas utama"
echo "# tanpa Include" > "$SSHDCONF"
OUT="$(jalankan --maxstartups)"
cek "dibatalkan" "$(echo "$OUT" | grep -q "BATAL" && echo 1 || echo 0)" "$OUT"
cek "berkas utama tetap utuh" "$([ "$(cat "$SSHDCONF")" = "# tanpa Include" ] && echo 1 || echo 0)"
cek "berkas tambahan tidak dibuat" "$([ ! -f "$DROPIN" ] && echo 1 || echo 0)"
echo "Include /etc/ssh/sshd_config.d/*.conf" > "$SSHDCONF"

echo
echo "[F] fail2ban mati — jangan sentuh apa pun"
OUT="$(UJI_F2B_AKTIF=0 jalankan --fail2ban-normal)"
cek "dilaporkan dilewati" "$(echo "$OUT" | grep -q "LEWAT" && echo 1 || echo 0)" "$OUT"

echo
echo "[G] Tidak ada mode aggressive — tidak ada yang diturunkan"
printf '[sshd]\nmode = normal\n' > "$T/jail.d/sshd.local"
OUT="$(jalankan --fail2ban-normal)"
cek "dilaporkan tidak perlu" "$(echo "$OUT" | grep -q "tidak ada yang perlu diturunkan\|tidak dipakai" && echo 1 || echo 0)" "$OUT"
cek "berkasnya tidak berubah" "$(grep -q 'mode = normal' "$T/jail.d/sshd.local" && echo 1 || echo 0)"

echo
echo "[H] Ada mode aggressive — diturunkan, salinan lama disimpan"
printf '[sshd]\nmode = aggressive\nmaxretry = 3\n' > "$T/jail.d/sshd.local"
OUT="$(jalankan --fail2ban-normal)"
cek "sekarang normal" "$(grep -q '^mode = normal' "$T/jail.d/sshd.local" && echo 1 || echo 0)" "$(cat "$T/jail.d/sshd.local")"
cek "baris lain tidak ikut berubah" "$(grep -q '^maxretry = 3' "$T/jail.d/sshd.local" && echo 1 || echo 0)"
cek "ada salinan cadangan" "$(ls "$T"/jail.d/sshd.local.cadangan-* >/dev/null 2>&1 && echo 1 || echo 0)"
rm -f "$T"/jail.d/sshd.local.cadangan-* "$T/jail.d/sshd.local"

echo
echo "[I] Mengizinkan alamat GitHub"
OUT="$(jalankan --izinkan-github)"
cek "berkas fail2ban dibuat" "$([ -f "$F2B" ] && echo 1 || echo 0)"
cek "rentang GitHub masuk" "$(grep -q '13.64.0.0/16' "$F2B" && echo 1 || echo 0)" "$(cat "$F2B" 2>/dev/null)"
cek "IPv6 ikut" "$(grep -q '2603:1030::/32' "$F2B" && echo 1 || echo 0)"
cek "daftar LAMA dipertahankan" "$(grep -q '10.0.0.0/8' "$F2B" && echo 1 || echo 0)"
cek "menyebut jumlah rentangnya" "$(echo "$OUT" | grep -qE '3 rentang' && echo 1 || echo 0)" "$OUT"

echo
echo "[J] Membatalkan — semua kembali seperti semula"
jalankan --maxstartups >/dev/null
cek "sebelum dibatalkan, kedua berkas ada" "$([ -f "$DROPIN" ] && [ -f "$F2B" ] && echo 1 || echo 0)"
OUT="$(jalankan --batalkan)"
cek "berkas sshd dihapus" "$([ ! -f "$DROPIN" ] && echo 1 || echo 0)"
cek "berkas fail2ban dihapus" "$([ ! -f "$F2B" ] && echo 1 || echo 0)"
cek "dinyatakan selesai" "$(echo "$OUT" | grep -q "kembali ke keadaan sebelum" && echo 1 || echo 0)"

echo
echo "[K] Pilihan salah ketik ditolak"
OUT="$(jalankan --maxstartup 2>&1)"; KODE=$?
cek "keluar dengan kode galat" "$([ "$KODE" != "0" ] && echo 1 || echo 0)" "kode=$KODE"
cek "menyebut tidak dikenal" "$(echo "$OUT" | grep -q "tidak dikenal" && echo 1 || echo 0)"

echo
echo "[L] --semua-yang-perlu pada server yang sudah baik = tidak mengubah apa pun"
OUT="$(UJI_MAXSTARTUPS=100:30:200 UJI_F2B_AKTIF=0 jalankan --semua-yang-perlu)"
cek "berkas sshd tidak dibuat" "$([ ! -f "$DROPIN" ] && echo 1 || echo 0)"
cek "berkas fail2ban tidak dibuat" "$([ ! -f "$F2B" ] && echo 1 || echo 0)"
cek "dinyatakan tidak ada yang diubah" "$(echo "$OUT" | grep -q "Tidak ada yang diubah" && echo 1 || echo 0)" "$OUT"

echo
echo "HASIL: $lulus lulus, $gagal gagal"
[ "$gagal" -eq 0 ] || exit 1
