# =====================================================================
# PENJADWAL TUGAS BERKALA (11 Sep 2026) — pengganti Vercel Cron.
#
# Pindah dari Vercel berarti kehilangan Vercel Cron, dan tiga tugas
# berkala aplikasi ini ikut mati diam-diam: sinkron komentar, pemantau
# server, dan rekonsiliasi KPI. Diam-diam itu bagian bahayanya — tidak
# ada yang error, datanya saja berhenti diperbarui.
#
# Container ini sengaja sangat kecil: cuma penjadwal bawaan Linux dan
# curl. Tugasnya hanya memanggil alamat di aplikasi, sama persis seperti
# yang dulu dilakukan Vercel.
# =====================================================================
FROM alpine:3.21
RUN apk add --no-cache curl tzdata
ENV TZ=Asia/Jakarta
COPY jalankan.sh /jalankan.sh
COPY panggil.sh /panggil.sh
RUN chmod +x /jalankan.sh /panggil.sh
CMD ["/jalankan.sh"]
