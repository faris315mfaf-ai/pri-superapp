#!/usr/bin/env bash
# =====================================================================
# LANGKAH 30 — KENAPA KUNCI DEPLOY DITOLAK SERVER (19 Sep 2026)
#
# GEJALA BARU, BERBEDA dari yang kemarin:
#     ssh: handshake failed: ssh: unable to authenticate,
#     attempted methods [none publickey], no supported methods remain
#
# Bedanya penting. Kemarin gejalanya "i/o timeout" — paket tidak sampai.
# Sekarang sambungannya SAMPAI dan server MENJAWAB, lalu MENOLAK
# kuncinya. Jadi perbaikan antrean kemarin bekerja; yang rusak sekarang
# hal lain: kuncinya tidak lagi diterima.
#
# Deploy otomatis MATI TOTAL selama ini belum beres — tidak ada kode
# baru yang sampai ke server.
#
# EMPAT SEBAB YANG MUNGKIN, dan sshd mencatat alasannya sendiri:
#   1. Kunci publiknya hilang dari authorized_keys (dihapus/tertimpa).
#   2. IZIN BERKAS salah. Ini jebakan klasik: sshd DIAM-DIAM menolak
#      kunci bila ~/.ssh atau authorized_keys bisa ditulis grup/umum.
#      Sering terjadi setelah seseorang menjalankan chmod/chown massal.
#   3. Pengaturan sshd berubah — PubkeyAuthentication no, AllowUsers,
#      atau AuthorizedKeysFile diarahkan ke tempat lain.
#   4. Pengguna tujuannya berubah/terkunci.
#
# Skrip ini MEMBACA SAJA. Tidak memperbaiki izin, tidak menambah kunci —
# menambahkan kunci ke server produksi harus dilakukan sadar, bukan
# sebagai efek samping pemeriksaan. SUSUNAN KUNCI TIDAK PERNAH DICETAK,
# hanya sidik jarinya.
#
# CARA PAKAI (root, di VPS):
#   bash 30-periksa-kunci-deploy.sh            # periksa root + pemilik sumber
#   bash 30-periksa-kunci-deploy.sh namauser   # periksa pengguna tertentu
# =====================================================================
set -uo pipefail

[ "$(id -u)" -eq 0 ] || [ -n "${PRI_UJI:-}" ] || { echo "Jalankan sebagai root: sudo bash $0" >&2; exit 1; }

SUMBER="${PRI_SUMBER:-/opt/pri-superapp/sumber}"
TEMUAN=()
catat() { TEMUAN+=("$1"); }
garis() { printf '%s\n' "------------------------------------------------------------"; }

# Siapa yang diperiksa: argumen, atau root + pemilik folder sumber
# (itulah dua kandidat VPS_USER yang masuk akal).
if [ $# -gt 0 ]; then
  ORANG="$*"
else
  ORANG="root"
  P="$(stat -c '%U' "$SUMBER" 2>/dev/null || true)"
  [ -n "$P" ] && [ "$P" != "root" ] && ORANG="root $P"
fi

echo "MEMERIKSA KUNCI DEPLOY"
echo "Server : $(hostname) — $(date -Is)"
echo "Catatan: MEMBACA SAJA. Susunan kunci tidak dicetak, hanya sidik jari."
garis

# ---------------------------------------------------------------------
echo "== 1/4 Alasan penolakan menurut sshd =="
# sshd mencatat alasannya sendiri. Ini jawaban paling langsung —
# jauh lebih baik daripada menebak dari daftar kemungkinan.
LOG="$( { journalctl -u ssh -u sshd --since '2 hours ago' 2>/dev/null || tail -500 /var/log/auth.log 2>/dev/null; } \
        | grep -iE 'authentication refused|bad ownership|bad modes|invalid user|failed publickey|no matching|not allowed because|user .* not allowed' \
        | tail -8 || true)"
if [ -n "$LOG" ]; then
  printf '%s\n' "$LOG" | cut -c1-170 | sed 's/^/      /'
  printf '%s\n' "$LOG" | grep -qi 'bad ownership\|bad modes' && \
    catat "sshd MENOLAK karena IZIN BERKAS salah (bad ownership/modes) — ini sebab yang pasti, dan perbaikannya cuma chmod, bukan mengganti kunci."
  printf '%s\n' "$LOG" | grep -qi 'not allowed because\|user .* not allowed' && \
    catat "sshd menolak PENGGUNANYA (AllowUsers/DenyUsers) — kuncinya mungkin baik-baik saja."
else
  echo "      tidak ada catatan penolakan dalam 2 jam terakhir."
  echo "      (kalau deploy baru saja gagal, coba jalankan ulang deploy lalu ulangi skrip ini)"
fi
garis

# ---------------------------------------------------------------------
echo "== 2/4 Berkas kunci tiap pengguna =="
for U in $ORANG; do
  H="$(getent passwd "$U" 2>/dev/null | cut -d: -f6)"
  if [ -z "$H" ]; then
    echo "  $U : pengguna TIDAK ADA di server ini"
    catat "Pengguna \"$U\" tidak ada — kalau VPS_USER diisi nama ini, deploy pasti gagal."
    continue
  fi
  AK="$H/.ssh/authorized_keys"
  echo "  $U  (rumah: $H)"
  if [ ! -d "$H/.ssh" ]; then
    echo "      ~/.ssh TIDAK ADA"
    catat "$U tidak punya folder ~/.ssh — tidak ada kunci yang bisa diterima."
    continue
  fi
  printf "      %-22s izin %s  pemilik %s\n" "~/.ssh" "$(stat -c '%a' "$H/.ssh" 2>/dev/null)" "$(stat -c '%U:%G' "$H/.ssh" 2>/dev/null)"
  if [ ! -f "$AK" ]; then
    echo "      authorized_keys TIDAK ADA"
    catat "$U tidak punya authorized_keys — kunci deploy tidak akan pernah diterima."
    continue
  fi
  IZIN="$(stat -c '%a' "$AK" 2>/dev/null)"
  printf "      %-22s izin %s  pemilik %s  (%s kunci)\n" "authorized_keys" "$IZIN" \
    "$(stat -c '%U:%G' "$AK" 2>/dev/null)" "$(grep -cE '^(ssh-|ecdsa-|sk-)' "$AK" 2>/dev/null || echo 0)"

  # sshd menolak diam-diam bila bisa ditulis grup/umum.
  case "$IZIN" in
    600|400|644) : ;;
    *) catat "Izin authorized_keys milik $U = $IZIN — sshd menolak kunci bila berkasnya bisa ditulis grup/umum. Seharusnya 600." ;;
  esac
  IZIN_DIR="$(stat -c '%a' "$H/.ssh" 2>/dev/null)"
  case "$IZIN_DIR" in
    700|750|755) : ;;
    *) catat "Izin folder ~/.ssh milik $U = $IZIN_DIR — seharusnya 700." ;;
  esac
  [ "$(stat -c '%U' "$AK" 2>/dev/null)" != "$U" ] && \
    catat "authorized_keys milik $U dimiliki pengguna LAIN ($(stat -c '%U' "$AK" 2>/dev/null)) — sshd menolak berkas yang bukan milik pemiliknya."

  # Sidik jari saja — susunan kuncinya TIDAK dicetak.
  echo "      sidik jari kunci yang diterima:"
  ssh-keygen -lf "$AK" 2>/dev/null | sed 's/^/          /' | head -6 || echo "          (tidak terbaca)"
done
garis

# ---------------------------------------------------------------------
echo "== 3/4 Pengaturan sshd yang menyangkut kunci =="
for K in pubkeyauthentication authorizedkeysfile permitrootlogin allowusers denyusers allowgroups; do
  V="$(sshd -T 2>/dev/null | sed -n "s/^$K[[:space:]]*//p" | head -1)"
  printf "      %-22s %s\n" "$K" "${V:-(bawaan)}"
  case "$K:$V" in
    pubkeyauthentication:no) catat "PubkeyAuthentication = no — SEMUA login pakai kunci ditolak. Ini penyebab langsung." ;;
  esac
done
ALLOW="$(sshd -T 2>/dev/null | sed -n 's/^allowusers[[:space:]]*//p' | head -1)"
if [ -n "$ALLOW" ]; then
  echo "      -> hanya pengguna ini yang boleh masuk: $ALLOW"
  catat "AllowUsers dipasang ($ALLOW). Kalau VPS_USER tidak ada dalam daftar itu, deploy pasti ditolak."
fi
echo "      berkas tambahan yang dimuat:"
ls -1 /etc/ssh/sshd_config.d/*.conf 2>/dev/null | sed 's/^/          /' || echo "          (tidak ada)"
garis

# ---------------------------------------------------------------------
echo "== 4/4 Perubahan terakhir pada berkas terkait =="
for F in /etc/ssh/sshd_config /etc/ssh/sshd_config.d; do
  [ -e "$F" ] && printf "      %-38s diubah %s\n" "$F" "$(date -r "$F" '+%Y-%m-%d %H:%M' 2>/dev/null)"
done
for U in $ORANG; do
  H="$(getent passwd "$U" 2>/dev/null | cut -d: -f6)"
  [ -n "$H" ] && [ -f "$H/.ssh/authorized_keys" ] && \
    printf "      %-38s diubah %s\n" "$H/.ssh/authorized_keys" "$(date -r "$H/.ssh/authorized_keys" '+%Y-%m-%d %H:%M' 2>/dev/null)"
done
echo "      (bandingkan dengan jam deploy mulai gagal — yang berubah persis"
echo "       sebelum itu kemungkinan besar penyebabnya)"
garis

echo "== KESIMPULAN =="
if [ ${#TEMUAN[@]} -eq 0 ]; then
  echo "  Tidak ada sebab yang menonjol dari yang terbaca."
  echo "  Kemungkinan tersisa: kunci di GitHub (VPS_SSH_KEY) tidak lagi"
  echo "  berpasangan dengan yang ada di authorized_keys — mis. kuncinya"
  echo "  dibuat ulang di satu sisi saja."
else
  for t in "${TEMUAN[@]}"; do echo "  • $t"; done
fi
echo
echo "CARA MEMASTIKAN PASANGANNYA COCOK"
echo "  Sidik jari di atas harus SAMA dengan sidik jari kunci privat yang"
echo "  tersimpan di GitHub (Settings -> Secrets -> VPS_SSH_KEY)."
echo "  Kalau berbeda, jalankan ulang pemasangan deploy otomatis:"
echo "    bash /opt/pri-superapp/skrip/17-pasang-deploy-otomatis.sh"
echo "  lalu salin kunci privat barunya ke secret VPS_SSH_KEY di GitHub."
echo
echo "Sementara deploy otomatis mati, kode baru bisa diturunkan manual:"
echo "  sudo -u \$(stat -c '%U' $SUMBER) git -C $SUMBER pull --ff-only origin main"
echo "  bash /opt/pri-superapp/skrip/12-perbarui.sh"
