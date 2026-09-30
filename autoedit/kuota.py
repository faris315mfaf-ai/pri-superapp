"""Batas pemakaian disk per akun.

Tanpa batas semacam ini, satu akun (atau satu skrip) bisa menghabiskan disk
media untuk semua orang. Yang dihitung adalah berkas yang benar-benar menumpuk:
folder template beserta asetnya, dan folder hasil render. Video sumber yang
diunduh sementara tidak ikut dihitung karena umurnya pendek dan dibersihkan
sendiri.
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path

logger = logging.getLogger(__name__)

# Jatah bawaan per akun. Disk media punya partisi sendiri di VPS, jadi
# jatuhnya satu akun ke batas tidak pernah merusak layanan lain.
KUOTA_AKUN_MB = int(os.getenv("KUOTA_AKUN_MB", "2048"))

# Menjumlah ukuran folder berarti membaca disk, dan halaman menanyakan status
# tiap dua detik. Hasilnya diingat sebentar supaya tidak jadi beban sendiri.
CACHE_DETIK = float(os.getenv("KUOTA_CACHE_DETIK", "20"))
_cache: dict[str, tuple[int, float]] = {}


class KuotaHabis(RuntimeError):
    """Pemakaian sudah melewati jatah pemiliknya."""


def batas_byte(pemilik: str) -> int:
    """Jatah akun ini dalam byte."""
    return KUOTA_AKUN_MB * 1_048_576


def _ukuran_folder(folder: Path) -> int:
    total = 0
    try:
        for anak in folder.rglob("*"):
            try:
                if anak.is_file():
                    total += anak.stat().st_size
            except OSError:
                continue
    except OSError:
        pass
    return total


def _pemilik_template(folder: Path) -> str:
    try:
        isi = json.loads((folder / "template.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ""
    return str(isi.get("owner") or "").strip().lower()


def pemakaian_byte(pemilik: str, paksa: bool = False) -> int:
    """Berapa byte yang sedang dipakai akun ini (template + hasil render)."""
    pemilik = str(pemilik or "").strip().lower()
    tersimpan = _cache.get(pemilik)
    if tersimpan and not paksa and tersimpan[1] > time.time():
        return tersimpan[0]

    import video_edit as ve
    import video_tasks as vt

    total = 0
    templates = ve.templates_dir()
    if templates.is_dir():
        for folder in templates.iterdir():
            if folder.is_dir() and _pemilik_template(folder) == pemilik:
                total += _ukuran_folder(folder)
    try:
        for job in vt.daftar_job(500, owner=pemilik):
            folder = vt.job_path(str(job.get("job_id") or ""))
            if folder.is_dir():
                total += _ukuran_folder(folder)
    except Exception:  # noqa: BLE001 - Redis mati tidak boleh memblokir pemakaian
        logger.warning("Pemakaian job %s tidak terbaca", pemilik)

    _cache[pemilik] = (total, time.time() + CACHE_DETIK)
    return total


def pastikan_muat(pemilik: str, tambahan: int = 0) -> None:
    """Lempar KuotaHabis kalau menambah `tambahan` byte akan melewati jatah."""
    batas = batas_byte(pemilik)
    dipakai = pemakaian_byte(pemilik)
    # Tanpa `tambahan` yang diketahui (mis. render, yang ukurannya baru
    # ketahuan setelah jadi), syaratnya harus BENAR-BENAR di bawah batas -
    # kalau tidak, pemakai yang persis penuh masih bisa memulai pekerjaan baru.
    if dipakai + max(0, tambahan) < batas or (tambahan > 0 and dipakai + tambahan <= batas):
        return
    raise KuotaHabis(
        f"Jatah penyimpanan akun sudah terpakai {dipakai / 1_048_576:.0f} MB dari "
        f"{batas / 1_048_576:.0f} MB. Hapus beberapa template atau hasil render dulu."
    )


def lupakan(pemilik: str) -> None:
    """Buang hitungan yang diingat, mis. setelah menghapus sesuatu."""
    _cache.pop(str(pemilik or "").strip().lower(), None)
