#!/bin/sh
# Uji penyalin log beban (vps/33-pasang-pengumpul-log.sh) tanpa docker:
# log kontainer diganti berkas tiruan lewat PRI_UJI_MASUKAN.
# Jalankan: sh tests/uji-pengumpul-log.sh
set -u
AKAR=$(cd "$(dirname "$0")/.." && pwd)
KERJA=$(mktemp -d)
trap 'rm -rf "$KERJA"' EXIT
# Ambil badan penyalin dari pemasangnya (di antara penanda heredoc PENYALIN).
awk '/^cat > \/usr\/local\/bin\/pri-kumpul-log <<.PENYALIN.$/{f=1; next} /^PENYALIN$/{f=0} f' \
  "$AKAR/vps/33-pasang-pengumpul-log.sh" > "$KERJA/penyalin.sh"
lulus=0
gagal=0
cek() {
  if [ "$2" = "0" ]; then lulus=$((lulus + 1)); echo "  ✔ $1"; else gagal=$((gagal + 1)); echo "  ✘ $1 — $3"; fi
}
export PRI_LOG_DIR="$KERJA/log" PRI_UJI_MASUKAN="$KERJA/masuk"
mkdir -p "$PRI_UJI_MASUKAN"
jalan() { sh "$KERJA/penyalin.sh"; }

cat > "$PRI_UJI_MASUKAN/supabase-menit.txt" <<'X'
2026-09-29T02:00:01.1Z [supabase/menit] {"n":10}
2026-09-29T02:00:30.2Z GET /api/sesi 200
2026-09-29T02:01:01.3Z [supabase/menit] {"n":20}
X
cat > "$PRI_UJI_MASUKAN/jadwal.txt" <<'X'
2026-09-29T02:00:00.1Z # menit  jam  tanggal  bulan  hari
2026-09-29T02:00:00.2Z */5  * * * * /panggil.sh sinkron-komen
2026-09-29T02:05:00.1Z 29/09 09:05:00 sinkron-absensi OK 0s
2026-09-29T02:05:07.1Z 29/09 09:05:07 metrik-video DITUNDA 1s (database macet)
2026-09-29T02:09:10.1Z 29/09 09:09:10 rekonsiliasi-kpi GAGAL kode=000 280s {"x":1}
X
jalan
F="$PRI_LOG_DIR/supabase-menit-2026-09-29.log"
[ "$(wc -l < "$F")" -eq 2 ] && ! grep -q "api/sesi" "$F" ; cek "salinan pertama: hanya baris [supabase/menit]" $? "$(cat "$F")"
J="$PRI_LOG_DIR/jadwal-2026-09-29.log"
[ "$(wc -l < "$J")" -eq 3 ] && ! grep -q "panggil.sh\|# menit" "$J" ; cek "jadwal: hanya OK/DITUNDA/GAGAL, isi crontab tersaring" $? "$(cat "$J")"

# Putaran berikutnya melihat jendela yang tumpang tindih + satu baris baru.
printf '%s\n' '2026-09-29T02:02:01.4Z [supabase/menit] {"n":30}' >> "$PRI_UJI_MASUKAN/supabase-menit.txt"
jalan
[ "$(wc -l < "$F")" -eq 3 ] && [ "$(grep -c '"n":10' "$F")" -eq 1 ] ; cek "jalan ulang: hanya baris baru, tanpa duplikat" $? "$(cat "$F")"
jalan
[ "$(wc -l < "$F")" -eq 3 ] ; cek "tanpa baris baru: berkas tidak berubah" $? "$(wc -l < "$F")"

# Pergantian tanggal (UTC) → berkas baru.
printf '%s\n' '2026-09-29T23:59:01.5Z [supabase/menit] {"n":40}' '2026-09-30T00:00:01.6Z [supabase/menit] {"n":50}' >> "$PRI_UJI_MASUKAN/supabase-menit.txt"
jalan
[ -f "$PRI_LOG_DIR/supabase-menit-2026-09-30.log" ] && [ "$(wc -l < "$PRI_LOG_DIR/supabase-menit-2026-09-30.log")" -eq 1 ] && [ "$(wc -l < "$F")" -eq 4 ] ; cek "ganti tanggal: baris masuk berkas harinya masing-masing" $? "$(ls "$PRI_LOG_DIR")"

# Kontainer baru (log kosong / mulai ulang): tidak galat, tidak menulis apa pun.
: > "$PRI_UJI_MASUKAN/supabase-menit.txt"
: > "$PRI_UJI_MASUKAN/jadwal.txt"
jalan ; cek "masukan kosong: keluar tanpa galat" $? "kode $?"
[ "$(wc -l < "$F")" -eq 4 ] ; cek "masukan kosong: berkas tetap" $? ""

echo ""
echo "$lulus lulus, $gagal gagal"
[ "$gagal" -eq 0 ]
