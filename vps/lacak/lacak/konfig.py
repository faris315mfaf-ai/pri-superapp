"""Konfigurasi layanan Pencari Video Asli (Lacak Sumber), dibaca dari env sekali saat impor."""

from __future__ import annotations

import os
from pathlib import Path


def _int(nama: str, bawaan: int) -> int:
    try:
        return int(os.environ.get(nama, "").strip() or bawaan)
    except ValueError:
        return bawaan


def _float(nama: str, bawaan: float) -> float:
    try:
        return float(os.environ.get(nama, "").strip() or bawaan)
    except ValueError:
        return bawaan


# Data tetap (SQLite, folder kerja). Di VPS mesin: /srv/godam/media/lacak -> /data/lacak.
DATA = Path(os.environ.get("LACAK_DATA", "/data/lacak"))
KERJA = DATA / "kerja"
DB = DATA / "lacak.db"

# Model dibenamkan di image saat build (vps/lacak/Dockerfile).
MODEL = Path(os.environ.get("LACAK_MODEL", "/opt/model"))
SSCD = MODEL / "sscd_disc_mixup.torchscript.pt"
WHISPER = os.environ.get("LACAK_WHISPER", "small")
WHISPER_DIR = MODEL / "whisper"

# Layanan pendamping di jaringan internal pri-autoedit. Kosong = tidak dipakai.
QDRANT_URL = os.environ.get("LACAK_QDRANT", "http://lacak-qdrant:6333").strip()
SEARXNG_URL = os.environ.get("LACAK_SEARXNG", "http://lacak-searxng:8080").strip()

YTDLP = os.environ.get("YTDLP_BIN", "yt-dlp")
# Cookies yt-dlp (opsional, berkas Netscape, bisa ditulis). YouTube memblokir IP server tanpa cookies
# ("Sign in to confirm you're not a bot"), jadi pencarian & unduhan YouTube hanya menyala bila LACAK_YOUTUBE=1.
COOKIES = os.environ.get("LACAK_COOKIES", "").strip()
YOUTUBE = os.environ.get("LACAK_YOUTUBE", "0").strip() == "1"
FFMPEG = os.environ.get("FFMPEG_BIN", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE_BIN", "ffprobe")
FPCALC = os.environ.get("FPCALC_BIN", "fpcalc")

# Utas CPU per model (torch / onnxruntime / ctranslate2). Container dibatasi 2 CPU.
UTAS = max(1, _int("LACAK_UTAS", 2))

# Batas kerja.
MAKS_SUMBER_DETIK = _int("LACAK_MAKS_SUMBER_DETIK", 600)  # video lebih panjang ditolak
MAKS_ANALISIS_DETIK = _int("LACAK_MAKS_ANALISIS_DETIK", 180)  # bagian yang diunduh & dianalisis
MAKS_KANDIDAT = _int("LACAK_MAKS_KANDIDAT", 8)  # kandidat yang diperiksa penuh
MAKS_KANDIDAT_AWAL = _int("LACAK_MAKS_KANDIDAT_AWAL", 24)  # kandidat dari pencarian sebelum disaring sampul
MAKS_FRAME_SADURAN = _int("LACAK_MAKS_FRAME", 24)
JARAK_FRAME_KANDIDAT = _float("LACAK_JARAK_FRAME", 2.0)  # detik antar frame kandidat
BATAS_WAKTU_JOB = _int("LACAK_BATAS_WAKTU", 900)  # detik

# Pemakai biasa (bukan master, bukan bot): satu pelacakan berjalan & jatah per hari.
JATAH_HARIAN = _int("LACAK_JATAH_HARIAN", 30)
RETENSI_HARI = _int("LACAK_RETENSI_HARI", 30)

# Panen koleksi: tiap akun aktif dipanen paling sering tiap PANEN_JAM; tiap putaran paling banyak
# PANEN_UNDUH video baru per akun (sisanya putaran berikutnya).
PANEN_JAM = _float("LACAK_PANEN_JAM", 2.0)
PANEN_DAFTAR = _int("LACAK_PANEN_DAFTAR", 20)
PANEN_UNDUH = _int("LACAK_PANEN_UNDUH", 3)
SIMPAN_VIDEO_HARI = _int("LACAK_SIMPAN_VIDEO_HARI", 90)

PORT = _int("LACAK_PORT", 7100)
