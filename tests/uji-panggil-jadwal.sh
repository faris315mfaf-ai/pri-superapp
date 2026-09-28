#!/bin/sh
# Uji vps/aplikasi/jadwal/panggil.sh (28 Sep 2026) tanpa server: curl
# diganti tiruan lewat PATH. Jalankan: sh tests/uji-panggil-jadwal.sh
set -u
AKAR=$(cd "$(dirname "$0")/.." && pwd)
SKRIP="$AKAR/vps/aplikasi/jadwal/panggil.sh"
KERJA=$(mktemp -d)
trap 'rm -rf "$KERJA"' EXIT
lulus=0
gagal=0
cek() {
  if [ "$2" = "0" ]; then lulus=$((lulus + 1)); echo "  ✔ $1"; else gagal=$((gagal + 1)); echo "  ✘ $1 — $3"; fi
}

# Tiruan curl: tulis $ISI ke berkas -o, cetak $KODE (atau gagal bila $KODE=gagal).
cat > "$KERJA/curl" <<'TIRUAN'
#!/bin/sh
keluar=""
while [ $# -gt 0 ]; do
  if [ "$1" = "-o" ]; then keluar="$2"; shift; fi
  shift
done
[ -n "$keluar" ] && printf '%s' "$ISI" > "$keluar"
if [ "$KODE" = "gagal" ]; then printf '000'; exit 28; fi
printf '%s' "$KODE"
TIRUAN
chmod +x "$KERJA/curl"
export PATH="$KERJA:$PATH" APP_URL="http://contoh" CRON_SECRET="rahasia"

hasil=$(KODE=200 ISI='{"jalan":true}' sh "$SKRIP" metrik-video)
echo "$hasil" | grep -q "metrik-video OK" ; cek "200 biasa → OK" $? "$hasil"

hasil=$(KODE=200 ISI='{"jalan":false,"ditunda":true,"alasan":"x"}' sh "$SKRIP" sinkron-komen)
echo "$hasil" | grep -q "sinkron-komen DITUNDA" ; cek "200 + ditunda → DITUNDA" $? "$hasil"

hasil=$(KODE=gagal ISI='' sh "$SKRIP" rekonsiliasi-kpi)
echo "$hasil" | grep -q "GAGAL kode=000 " ; cek "curl gagal → kode=000 (bukan 000000)" $? "$hasil"

hasil=$(KODE=500 ISI='{"error":"rusak"}' sh "$SKRIP" pantau-server)
echo "$hasil" | grep -q 'pantau-server GAGAL kode=500 .*"error":"rusak"' ; cek "500 → isi jawaban tugas ITU sendiri" $? "$hasil"

# Dua tugas bersamaan tidak saling menimpa jawaban.
( KODE=500 ISI='{"milik":"A"}' sh "$SKRIP" tugas-a > "$KERJA/a.log" ) &
( KODE=500 ISI='{"milik":"B"}' sh "$SKRIP" tugas-b > "$KERJA/b.log" ) &
wait
grep -q '"milik":"A"' "$KERJA/a.log" && grep -q '"milik":"B"' "$KERJA/b.log" ; cek "tugas bersamaan: jawaban tidak tertukar" $? "$(cat "$KERJA/a.log" "$KERJA/b.log")"

sisa=$(ls /tmp/jawaban-tugas-a.* /tmp/jawaban-metrik-video.* 2>/dev/null | wc -l)
[ "$sisa" -eq 0 ] ; cek "berkas sementara dibersihkan" $? "sisa $sisa"

echo ""
echo "$lulus lulus, $gagal gagal"
[ "$gagal" -eq 0 ]
