"""HTTP API layanan Lacak Sumber (hanya di jaringan internal pri-autoedit, port 7100).

Identitas datang dari mesin TS (src/mesin-video/server/lacak.ts), yang menerimanya dari gerbang aplikasi:
  x-pengguna : id akun (angka, wajib)
  x-peran    : "master" bila master (diisi aplikasi, tidak bisa diisi peramban)
  x-bot      : "1" bila dipanggil runner bot lewat soket mesin
"""

from __future__ import annotations

import re
import threading
import time
from contextlib import asynccontextmanager
from typing import Literal
from urllib.parse import urlparse

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import cari, indeks, konfig, media, pekerja, simpan
from .media import GalatLacak


@asynccontextmanager
async def _hidup(_app: FastAPI):
    pekerja.mulai()
    yield


app = FastAPI(title="PRI Lacak Sumber", lifespan=_hidup, docs_url=None, redoc_url=None, openapi_url=None)


@app.exception_handler(GalatLacak)
async def _galat_lacak(_req, e: GalatLacak):
    return JSONResponse({"detail": str(e)}, status_code=400)


class Siapa:
    def __init__(self, pengguna: str, master: bool, bot: bool):
        self.pengguna = pengguna
        self.master = master
        self.bot = bot


def _siapa(x_pengguna: str | None, x_peran: str | None, x_bot: str | None) -> Siapa:
    p = (x_pengguna or "").strip()
    if not re.fullmatch(r"\d{1,12}", p):
        raise HTTPException(401, "Identitas tidak ada.")
    return Siapa(p, (x_peran or "").strip().lower() == "master", (x_bot or "").strip() == "1")


def _wajib_master(s: Siapa) -> None:
    if not s.master:
        raise HTTPException(403, "Hanya master.")


def _boleh_lihat(s: Siapa, job: dict) -> bool:
    return s.master or job.get("diminta_oleh") == s.pengguna


# ------------------------------------------------------------------ kesehatan


@app.get("/hidup")
def hidup():
    """Pemeriksaan kesehatan container: proses & utas pekerja hidup (tanpa memanggil layanan lain)."""
    return {"hidup": pekerja.utas_hidup()}


@app.get("/sehat")
def sehat():
    return {
        "sehat": True,
        "antre": pekerja.posisi_antrean(),
        "berjalan": pekerja.sedang_dikerjakan(),
        "qdrant": indeks.sehat(),
        "searxng": cari.sehat_searxng(),
        "sscd": konfig.SSCD.exists(),
        "whisper": konfig.WHISPER,
    }


# ------------------------------------------------------------------ pelacakan


class BodiJob(BaseModel):
    url: str = Field(min_length=8, max_length=2000)


_kunci_buat = threading.Lock()
ANTREAN_MAKS_UMUM = 50  # bot boleh sampai ANTREAN_MAKS_BOT (slot cadangan)
ANTREAN_MAKS_BOT = 80


@app.post("/jobs")
def buat_job(b: BodiJob, x_pengguna: str | None = Header(None), x_peran: str | None = Header(None), x_bot: str | None = Header(None)):
    s = _siapa(x_pengguna, x_peran, x_bot)
    atur = simpan.pengaturan()
    url = media.url_sah(b.url)
    with _kunci_buat:  # periksa jatah + masukkan antrean harus satu langkah (endpoint jalan di threadpool)
        return _buat_job_terkunci(s, atur, url)


def _buat_job_terkunci(s: Siapa, atur: dict, url: str) -> dict:
    if s.bot:
        if not atur["lacak_bot"]:
            raise HTTPException(409, "Lacak otomatis untuk bot sedang dimatikan master.")
        sumber = "bot"
    elif s.master:
        sumber = "master"
    else:
        if not atur["tombol_pengguna"]:
            raise HTTPException(403, "Pencarian video asli sedang dimatikan master.")
        sumber = "pengguna"
        if simpan.hitung_job(s.pengguna, 0, ("antre", "berjalan")) > 0:
            raise HTTPException(429, "Masih ada pencarian yang berjalan. Tunggu sampai selesai atau batalkan dulu.")
        if simpan.hitung_job(s.pengguna, time.time() - 86400) >= konfig.JATAH_HARIAN:
            raise HTTPException(429, f"Batas {konfig.JATAH_HARIAN} pencarian per hari sudah tercapai.")
    if pekerja.posisi_antrean() >= (ANTREAN_MAKS_BOT if s.bot else ANTREAN_MAKS_UMUM):
        raise HTTPException(503, "Antrean pencarian sedang penuh. Coba lagi beberapa menit lagi.")
    return pekerja.publik(pekerja.job_baru(url, s.pengguna, sumber))


@app.get("/jobs/{id_}")
def lihat_job(id_: str, x_pengguna: str | None = Header(None), x_peran: str | None = Header(None), x_bot: str | None = Header(None)):
    s = _siapa(x_pengguna, x_peran, x_bot)
    job = simpan.ambil_job(id_) if re.fullmatch(r"[0-9a-f]{16}", id_) else None
    if not job or not _boleh_lihat(s, job):
        raise HTTPException(404, "Pencarian tidak ditemukan.")
    return pekerja.publik(job)


class BodiKeputusan(BaseModel):
    aksi: Literal["pakai_asli", "pakai_kredit", "bukan", "tanpa_sumber"]
    kandidat: int | None = None


@app.post("/jobs/{id_}/keputusan")
def keputusan(id_: str, b: BodiKeputusan, x_pengguna: str | None = Header(None), x_peran: str | None = Header(None), x_bot: str | None = Header(None)):
    s = _siapa(x_pengguna, x_peran, x_bot)
    job = simpan.ambil_job(id_) if re.fullmatch(r"[0-9a-f]{16}", id_) else None
    if not job or not _boleh_lihat(s, job):
        raise HTTPException(404, "Pencarian tidak ditemukan.")
    return pekerja.publik(pekerja.putuskan(job, b.aksi, b.kandidat, s.pengguna, ubah_koleksi=s.master or s.bot))


@app.post("/jobs/{id_}/batal")
def batal(id_: str, x_pengguna: str | None = Header(None), x_peran: str | None = Header(None), x_bot: str | None = Header(None)):
    s = _siapa(x_pengguna, x_peran, x_bot)
    job = simpan.ambil_job(id_) if re.fullmatch(r"[0-9a-f]{16}", id_) else None
    if not job or not _boleh_lihat(s, job):
        raise HTTPException(404, "Pencarian tidak ditemukan.")
    return pekerja.publik(pekerja.batalkan(job))


def _ringkas(j: dict) -> dict:
    sad = j.get("saduran") or {}
    kandidat = j.get("kandidat") or []
    idx = j.get("terpilih")
    if idx is None and kandidat and j.get("zona") == "perlu_acc":
        idx = 0
    k = kandidat[idx] if idx is not None and idx < len(kandidat) else None
    return {
        "id": j["id"],
        "status": j["status"],
        "sumber": j["sumber"],
        "diminta_oleh": j["diminta_oleh"],
        "dibuat": j["dibuat"],
        "zona": j.get("zona"),
        "kredit": j.get("kredit", ""),
        "judul": sad.get("judul") or j.get("_url", ""),
        "skor": k["skor"] if k else None,
        "ditemukan_lewat": k["ditemukan_lewat"] if k else None,
    }


@app.get("/riwayat")
def riwayat(limit: int = Query(50, ge=1, le=200), x_pengguna: str | None = Header(None), x_peran: str | None = Header(None), x_bot: str | None = Header(None)):
    s = _siapa(x_pengguna, x_peran, x_bot)
    return {"item": [_ringkas(j) for j in simpan.daftar_job(None if s.master else s.pengguna, limit)]}


# ------------------------------------------------------------------ koleksi (master)

_JENIS = ("media_resmi", "kreator", "instansi")


def akun_dari_url(url: str) -> tuple[str, str, str]:
    """Link profil -> (handle, platform, url baku). GalatLacak bila bukan profil yang dikenali."""
    u = media.url_sah(url)
    p = urlparse(u)
    host = (p.hostname or "").lower().removeprefix("www.").removeprefix("m.")
    bagian = [x for x in p.path.split("/") if x]
    if host.endswith("tiktok.com") and bagian and bagian[0].startswith("@"):
        h = bagian[0]
        return h, "TikTok", f"https://www.tiktok.com/{h}"
    if host.endswith("instagram.com") and bagian and bagian[0] not in ("p", "reel", "reels", "tv", "explore"):
        h = "@" + bagian[0]
        return h, "Instagram", f"https://www.instagram.com/{bagian[0]}/"
    if host.endswith("youtube.com") and bagian:
        if bagian[0].startswith("@"):
            return bagian[0], "YouTube", f"https://www.youtube.com/{bagian[0]}/shorts"
        if bagian[0] in ("channel", "c", "user") and len(bagian) > 1:
            return bagian[1], "YouTube", f"https://www.youtube.com/{bagian[0]}/{bagian[1]}/shorts"
    if host.endswith("facebook.com") and bagian and bagian[0] not in ("watch", "reel", "share", "story.php"):
        return bagian[0], "Facebook", f"https://www.facebook.com/{bagian[0]}/videos"
    raise GalatLacak("Link profil tidak dikenali. Pakai link profil TikTok, Instagram, YouTube, atau Facebook.")


def _statistik() -> dict:
    s30 = simpan.statistik_job(time.time() - 30 * 86400)
    return {
        "akun": len(simpan.daftar_akun()),
        "video": simpan.hitung_video(),
        "vektor": indeks.hitung(),
        **s30,
        "lens_bulan_ini": 0,
        "lens_kuota": 0,
    }


@app.get("/koleksi")
def koleksi(x_pengguna: str | None = Header(None), x_peran: str | None = Header(None), x_bot: str | None = Header(None)):
    _wajib_master(_siapa(x_pengguna, x_peran, x_bot))
    return {"akun": simpan.daftar_akun(), "statistik": _statistik()}


class BodiAkun(BaseModel):
    url: str = Field(min_length=8, max_length=500)
    jenis: Literal["media_resmi", "kreator", "instansi"] = "kreator"


@app.post("/koleksi")
def tambah_akun(b: BodiAkun, x_pengguna: str | None = Header(None), x_peran: str | None = Header(None), x_bot: str | None = Header(None)):
    _wajib_master(_siapa(x_pengguna, x_peran, x_bot))
    handle, platform, url = akun_dari_url(b.url)
    return simpan.tambah_akun(handle, platform, url, b.jenis)


class BodiUbahAkun(BaseModel):
    aktif: bool | None = None
    jenis: Literal["media_resmi", "kreator", "instansi"] | None = None


@app.patch("/koleksi/{id_}")
def ubah_akun(id_: int, b: BodiUbahAkun, x_pengguna: str | None = Header(None), x_peran: str | None = Header(None), x_bot: str | None = Header(None)):
    _wajib_master(_siapa(x_pengguna, x_peran, x_bot))
    hasil = simpan.ubah_akun(id_, b.aktif, b.jenis)
    if not hasil:
        raise HTTPException(404, "Akun tidak ditemukan.")
    return hasil


@app.delete("/koleksi/{id_}")
def hapus_akun(id_: int, x_pengguna: str | None = Header(None), x_peran: str | None = Header(None), x_bot: str | None = Header(None)):
    _wajib_master(_siapa(x_pengguna, x_peran, x_bot))
    if not simpan.ambil_akun(id_):
        raise HTTPException(404, "Akun tidak ditemukan.")
    # Vektor dihapus DULU: bila Qdrant tidak terjangkau, baris tetap ada dan bisa dicoba lagi (tanpa yatim).
    try:
        indeks.hapus(simpan.video_akun(id_))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, "Indeks koleksi sedang tidak terjangkau. Coba lagi sebentar lagi.") from e
    simpan.hapus_akun(id_)
    return {"sukses": True}


# ------------------------------------------------------------------ pengaturan


@app.get("/pengaturan")
def lihat_pengaturan(x_pengguna: str | None = Header(None), x_peran: str | None = Header(None), x_bot: str | None = Header(None)):
    _siapa(x_pengguna, x_peran, x_bot)
    return simpan.pengaturan()


class BodiPengaturan(BaseModel):
    ambang_yakin: float = Field(ge=0.5, le=0.99)
    ambang_acc: float = Field(ge=0.3, le=0.94)
    lacak_bot: bool
    tombol_pengguna: bool
    cari_lens: bool
    simpan_ke_koleksi: bool


@app.put("/pengaturan")
def ubah_pengaturan(b: BodiPengaturan, x_pengguna: str | None = Header(None), x_peran: str | None = Header(None), x_bot: str | None = Header(None)):
    _wajib_master(_siapa(x_pengguna, x_peran, x_bot))
    if b.ambang_yakin < b.ambang_acc + 0.05 - 1e-9:
        raise HTTPException(400, "Ambang yakin harus minimal 0,05 di atas ambang perlu ACC.")
    data = b.model_dump()
    data["ambang_yakin"] = round(data["ambang_yakin"], 2)
    data["ambang_acc"] = round(data["ambang_acc"], 2)
    # Cari balik gambar belum tersedia di tahap 1 (butuh kunci SerpAPI + gambar publik).
    data["cari_lens"] = False
    return simpan.simpan_pengaturan(data)
