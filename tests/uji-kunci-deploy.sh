#!/usr/bin/env bash
# =====================================================================
# Uji vps/30-periksa-kunci-deploy.sh tanpa server.
#
# Yang dikunci:
#   • SUSUNAN KUNCI TIDAK BOLEH TERCETAK — hanya sidik jarinya. Kunci
#     publik memang tidak rahasia, tapi mencetak isi authorized_keys ke
#     layar/chat adalah kebiasaan yang cepat atau lambat ikut membawa
#     hal yang memang rahasia.
#   • Sebab yang berbeda harus menghasilkan kesimpulan yang berbeda:
#     izin salah, kunci tidak ada, pengguna tidak ada, pubkey dimatikan.
# =====================================================================
set -uo pipefail

AKAR="$(cd "$(dirname "$0")/.." && pwd)"
SKRIP="$AKAR/vps/30-periksa-kunci-deploy.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

lulus=0; gagal=0
cek() {
  if [ "$2" = "1" ]; then lulus=$((lulus+1)); echo "  ✔ $1"
  else gagal=$((gagal+1)); echo "  ✘ $1 ${3:-}"; fi
}

mkdir -p "$T/bin" "$T/rumah/.ssh" "$T/sumber"
KUNCI_ISI="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIISINYAKUNCIPUBLIKPANJANGSEKALI deploy@github"
echo "$KUNCI_ISI" > "$T/rumah/.ssh/authorized_keys"

cat > "$T/bin/getent" <<SH
#!/usr/bin/env bash
[ "\${UJI_USER_ADA:-1}" = "1" ] || exit 2
echo "deployuser:x:1001:1001::$T/rumah:/bin/bash"
SH
cat > "$T/bin/sshd" <<'SH'
#!/usr/bin/env bash
[ "${1:-}" = "-T" ] || exit 0
echo "pubkeyauthentication ${UJI_PUBKEY:-yes}"
echo "authorizedkeysfile .ssh/authorized_keys"
echo "permitrootlogin prohibit-password"
[ -n "${UJI_ALLOWUSERS:-}" ] && echo "allowusers ${UJI_ALLOWUSERS}"
exit 0
SH
cat > "$T/bin/journalctl" <<'SH'
#!/usr/bin/env bash
case "${UJI_LOG:-kosong}" in
  izin) echo "Sep 19 06:09:10 PORTAL sshd[1]: Authentication refused: bad ownership or modes for file /home/deployuser/.ssh/authorized_keys" ;;
  allow) echo "Sep 19 06:09:10 PORTAL sshd[1]: User deployuser from 4.3.2.1 not allowed because not listed in AllowUsers" ;;
esac
exit 0
SH
cat > "$T/bin/ssh-keygen" <<'SH'
#!/usr/bin/env bash
echo "256 SHA256:CONTOHSIDIKJARIabcdef1234567890 deploy@github (ED25519)"
SH
cat > "$T/bin/stat" <<SH
#!/usr/bin/env bash
# Windows tidak menerapkan chmod/chown, jadi nilainya ditentukan uji.
case "\$1" in
  -c)
    case "\$2" in
      %a) case "\$3" in
            */.ssh) echo "\${UJI_IZIN_DIR:-700}" ;;
            *) echo "\${UJI_IZIN_AK:-600}" ;;
          esac ;;
      %U) echo "\${UJI_PEMILIK:-deployuser}" ;;
      %U:%G) echo "\${UJI_PEMILIK:-deployuser}:\${UJI_PEMILIK:-deployuser}" ;;
    esac
    exit 0 ;;
esac
exit 0
SH
chmod +x "$T/bin"/*

jalankan() {
  PATH="$T/bin:$PATH" PRI_UJI=1 PRI_SUMBER="$T/sumber" bash "$SKRIP" deployuser 2>&1
}

echo
echo "[A] Susunan kunci TIDAK boleh tercetak"
chmod 600 "$T/rumah/.ssh/authorized_keys"; chmod 700 "$T/rumah/.ssh"
OUT="$(jalankan)"
cek "isi kunci publik tidak muncul" "$(echo "$OUT" | grep -q 'ISINYAKUNCIPUBLIKPANJANGSEKALI' && echo 0 || echo 1)" "KUNCI TERCETAK"
cek "sidik jarinya muncul" "$(echo "$OUT" | grep -q 'SHA256:CONTOHSIDIKJARI' && echo 1 || echo 0)"
cek "jumlah kuncinya dilaporkan" "$(echo "$OUT" | grep -q '1 kunci' && echo 1 || echo 0)" "$(echo "$OUT" | grep authorized_keys | head -2)"

echo
echo "[B] sshd sendiri bilang IZIN salah — sebab paling pasti"
OUT="$(UJI_LOG=izin jalankan)"
cek "alasan dari log ditampilkan" "$(echo "$OUT" | grep -q 'bad ownership or modes' && echo 1 || echo 0)"
cek "disimpulkan sebagai masalah IZIN" "$(echo "$OUT" | grep -q 'karena IZIN BERKAS salah' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/KESIMPULAN/,$p' | head -4)"
cek "dikatakan cukup chmod, bukan ganti kunci" "$(echo "$OUT" | grep -q 'cuma chmod, bukan mengganti kunci' && echo 1 || echo 0)"

echo
echo "[C] Izin berkas memang longgar — terdeteksi walau log kosong"
OUT="$(UJI_IZIN_AK=666 jalankan)"
cek "izin longgar dilaporkan" "$(echo "$OUT" | grep -q 'sshd menolak kunci bila berkasnya bisa ditulis' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/KESIMPULAN/,$p' | head -4)"
OUT="$(UJI_IZIN_DIR=777 jalankan)"
cek "folder ~/.ssh terlalu longgar juga terdeteksi" "$(echo "$OUT" | grep -q 'seharusnya 700' && echo 1 || echo 0)"
OUT="$(UJI_PEMILIK=oranglain jalankan)"
cek "berkas milik pengguna lain terdeteksi" "$(echo "$OUT" | grep -q 'dimiliki pengguna LAIN' && echo 1 || echo 0)"
OUT="$(jalankan)"
cek "izin & pemilik yang BENAR tidak memicu peringatan palsu" "$(echo "$OUT" | grep -qE 'bisa ditulis grup/umum|seharusnya 700|pengguna LAIN' && echo 0 || echo 1)" "$(echo "$OUT" | sed -n '/KESIMPULAN/,$p' | head -4)"

echo
echo "[D] authorized_keys hilang"
mv "$T/rumah/.ssh/authorized_keys" "$T/simpan"
OUT="$(jalankan)"
cek "dinyatakan tidak ada" "$(echo "$OUT" | grep -q 'authorized_keys TIDAK ADA' && echo 1 || echo 0)"
cek "masuk kesimpulan" "$(echo "$OUT" | grep -q 'tidak akan pernah diterima' && echo 1 || echo 0)"
mv "$T/simpan" "$T/rumah/.ssh/authorized_keys"

echo
echo "[E] PubkeyAuthentication dimatikan"
OUT="$(UJI_PUBKEY=no jalankan)"
cek "dinyatakan penyebab langsung" "$(echo "$OUT" | grep -q 'SEMUA login pakai kunci ditolak' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/KESIMPULAN/,$p' | head -4)"

echo
echo "[F] AllowUsers membatasi"
OUT="$(UJI_ALLOWUSERS='adminportalpri' jalankan)"
cek "daftarnya ditampilkan" "$(echo "$OUT" | grep -q 'hanya pengguna ini yang boleh masuk' && echo 1 || echo 0)"
cek "diperingatkan bisa jadi sebabnya" "$(echo "$OUT" | grep -q 'AllowUsers dipasang' && echo 1 || echo 0)"

echo
echo "[G] Pengguna tidak ada"
OUT="$(UJI_USER_ADA=0 jalankan)"
cek "dinyatakan pengguna tidak ada" "$(echo "$OUT" | grep -q 'TIDAK ADA di server ini' && echo 1 || echo 0)"

echo
echo "[H] Selalu memberi jalan keluar sementara"
OUT="$(jalankan)"
cek "memberi cara menurunkan kode manual" "$(echo "$OUT" | grep -q '12-perbarui.sh' && echo 1 || echo 0)"
cek "memberi cara memasang ulang kunci deploy" "$(echo "$OUT" | grep -q '17-pasang-deploy-otomatis' && echo 1 || echo 0)"

echo
echo "HASIL: $lulus lulus, $gagal gagal"
[ "$gagal" -eq 0 ] || exit 1
