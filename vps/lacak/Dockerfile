# =====================================================================
# LACAK SUMBER (Pencari Video Asli) — tahap 1, CPU saja (15 Okt 2026).
# Dibangun DI VPS mesin (konteks vps/lacak dikirim 12-perbarui.sh), dijalankan
# sebagai layanan autoedit-lacak di jaringan internal pri-autoedit (port 7100).
#
#   SSCD (Meta, MIT)            sidik gambar khusus deteksi salinan, 512 dimensi
#   PDQ  (Meta)                 hash gambar 256 bit (saringan cepat)
#   PySceneDetect               frame kunci per adegan
#   RapidOCR + PP-OCRv6 (Apache) watermark & teks di layar, onnxruntime (tanpa paddle)
#   faster-whisper (MIT)        ucapan -> kata kunci (model bawaan "small", int8)
#   Chromaprint (fpcalc)        sidik suara
#   yt-dlp                      metadata, unduh, pencarian YouTube
# Model DIBENAMKAN di image (tanpa unduh saat jalan); SSCD dicocokkan SHA-256.
# =====================================================================
# --- Tahap roda: pdqhash (pembungkus C++ PDQ) tidak punya wheel Linux -> dikompilasi di sini, image akhir
# tetap tanpa kompiler.
FROM python:3.12-slim-bookworm AS roda
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*
RUN pip wheel --no-cache-dir --no-deps -w /roda pdqhash==0.2.8

# --- Tahap jalan ---------------------------------------------------------
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    LACAK_MODEL=/opt/model \
    LACAK_DATA=/data/lacak \
    TZ=Asia/Jakarta

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libchromaprint-tools ca-certificates curl tini \
 && rm -rf /var/lib/apt/lists/*

# torch CPU dari indeks resmi PyTorch (tanpa CUDA: ±200 MB, bukan ±2 GB).
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.14.1

WORKDIR /app
COPY --from=roda /roda /roda
COPY requirements.txt ./
RUN pip install /roda/pdqhash-*.whl && pip install -r requirements.txt && rm -rf /roda

# --- Model ---------------------------------------------------------------
ARG SSCD_URL=https://dl.fbaipublicfiles.com/sscd-copy-detection/sscd_disc_mixup.torchscript.pt
ARG SSCD_SHA256=9f26bd4c848cc19b73d2ae92eea6e04886f61a7b764ceb7a13aeee62e6a6db56
ARG WHISPER=small
RUN mkdir -p /opt/model/whisper \
 && curl -fsSL --retry 3 -o /opt/model/sscd_disc_mixup.torchscript.pt "$SSCD_URL" \
 && echo "$SSCD_SHA256  /opt/model/sscd_disc_mixup.torchscript.pt" | sha256sum -c - \
 && python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER}', device='cpu', compute_type='int8', download_root='/opt/model/whisper')" \
 && python -c "from rapidocr import RapidOCR; RapidOCR(params={'Global.log_level': 'error'})"

COPY lacak ./lacak
COPY tests ./tests
# Gerbang mutu saat build: uji murni wajib lolos.
RUN python -m pytest -q -p no:cacheprovider tests/test_skor.py tests/test_teks.py tests/test_media.py

RUN useradd --uid 10001 --create-home lacak \
 && mkdir -p /data/lacak \
 && chown -R 10001:10001 /data/lacak
USER 10001
ENV LACAK_WHISPER=${WHISPER}
EXPOSE 7100
ENTRYPOINT ["tini", "--"]
CMD ["python", "-m", "lacak"]
