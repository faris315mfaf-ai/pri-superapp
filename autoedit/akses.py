"""Siapa yang sedang memanggil: diputuskan PRI SuperApp, bukan di sini.

Backend ini tidak punya port jaringan. Ia hanya mendengar di socket Unix
(/run/autoedit/api.sock) yang dipasang ke dua container saja: dirinya dan
aplikasi SuperApp. Rute /api/autoedit/* di SuperApp memeriksa sesi login
dan peran master, lalu meneruskan permintaan ke sini dengan header
``X-Autoedit-Pengguna`` berisi id akun. Karena itu header tersebut dipercaya
apa adanya - tidak ada jalan lain untuk sampai ke socket ini.
"""

from __future__ import annotations

import logging
import re
import threading
from typing import Any

from fastapi import Header, HTTPException

logger = logging.getLogger(__name__)

# Pemilik template/job/unggahan = "pri-<id akun>". Id, bukan username:
# username di SuperApp bisa diganti, id tidak.
POLA_ID = re.compile(r"^[0-9]{1,12}$")

# Akun yang sudah pernah dibuatkan template awal di proses ini.
_sudah_disiapkan: set[str] = set()
_kunci = threading.Lock()


def _siapkan_template_awal(pemilik: str) -> None:
    """Akun yang belum punya template sama sekali dapat satu, meminjam bawaan."""
    import video_edit as ve

    with _kunci:
        if pemilik in _sudah_disiapkan:
            return
        _sudah_disiapkan.add(pemilik)
    try:
        if ve.list_templates(owner=pemilik):
            return
        ve.template_awal_untuk(pemilik)
    except ve.VideoError as error:
        # Template bawaan belum ada di disk: halaman membuatkan template kosong.
        logger.info("Template awal untuk %s tidak dibuat: %s", pemilik, error)
    except Exception:  # noqa: BLE001 - tidak boleh menggagalkan permintaan
        logger.exception("Template awal untuk %s gagal dibuat", pemilik)


def pengguna_wajib(x_autoedit_pengguna: str = Header(default="")) -> dict[str, Any]:
    id_akun = x_autoedit_pengguna.strip()
    if not POLA_ID.match(id_akun):
        raise HTTPException(status_code=401, detail="Permintaan tidak lewat SuperApp.")
    pemilik = f"pri-{id_akun}"
    _siapkan_template_awal(pemilik)
    return {"user_id": id_akun, "username": pemilik}


def pengguna_tvr(x_autoedit_pengguna: str = Header(default="")) -> dict[str, Any]:
    """Identitas untuk Edit Otomatis TVR Saya.

    Sama dengan pengguna_wajib, tanpa membuatkan template awal: akun TVR punya
    tepat satu template sendiri (tvr_api), tidak perlu salinan template bawaan.
    """
    id_akun = x_autoedit_pengguna.strip()
    if not POLA_ID.match(id_akun):
        raise HTTPException(status_code=401, detail="Permintaan tidak lewat SuperApp.")
    return {"user_id": id_akun, "username": f"pri-{id_akun}"}
