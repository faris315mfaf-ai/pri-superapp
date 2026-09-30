"""PRI Auto Edit - API.

Alat edit video untuk akun master SuperApp: template berlapis, render
(worker Celery), hook berita, dan outro. Semua berkas tinggal di disk media
yang dipakai bersama API dan worker. Tidak ada login di sini: API hanya
mendengar di socket Unix yang dijangkau aplikasi SuperApp (lihat akses.py).
"""

import logging

from fastapi import FastAPI

import video_edit
from outro_api import router as outro_router
from tvr_api import router as tvr_router
from video_api import router as video_router

logger = logging.getLogger(__name__)

app = FastAPI(title="PRI Auto Edit", docs_url=None, redoc_url=None, openapi_url=None)
app.include_router(video_router)
app.include_router(outro_router)
app.include_router(tvr_router)

# Penyapu disk media: berkas kedaluwarsa (unggahan, cache unduhan, job, outro)
# dibuang saat start lalu tiap setengah jam. Cukup satu proses - uvicorn
# dijalankan dengan satu worker.
try:
    video_edit.jaga_volume_di_latar()
except Exception:  # noqa: BLE001 - penjaga tidak boleh menghalangi server hidup
    logger.exception("Penjaga volume gagal dimulai")


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
