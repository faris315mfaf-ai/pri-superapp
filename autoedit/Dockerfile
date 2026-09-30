# ============================================================
# Image PRI Auto Edit: API (FastAPI) dan worker render (Celery) memakai
# image yang SAMA; perannya dipilih lewat ROLE (api | worker).
# ============================================================
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive \
    MEDIA_DIR=/data/media

WORKDIR /app

# ffmpeg untuk menyusun video; fonts-dejavu cadangan kalau font bawaan hilang.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Berjalan sebagai pengguna biasa, bukan root: ffmpeg dan yt-dlp memproses
# berkas dari internet, dan celah di keduanya tidak boleh langsung jadi root.
# uid 10001 = pemilik disk media & folder socket di server.
RUN useradd --uid 10001 --create-home autoedit \
    && mkdir -p /data/media /run/autoedit \
    && chown -R autoedit:autoedit /data /run/autoedit \
    && chmod +x start.sh
USER autoedit

CMD ["./start.sh"]
