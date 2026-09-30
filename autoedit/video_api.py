"""API auto edit video: kelola template dan jalankan job render.

Semua rute punya pemilik (dipasang di tingkat router): template, unggahan, dan
job selalu milik satu akun SuperApp ("pri-<id>", lihat akses.py).
"""

from __future__ import annotations

import errno
import logging
import os
import shutil
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field, field_validator

import kuota
import video_edit as ve
import video_hook as vh
import video_tasks as vt
from akses import pengguna_wajib

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/video", tags=["video"], dependencies=[Depends(pengguna_wajib)])

# Berapa render yang berjalan BERSAMAAN ditentukan CELERY_CONCURRENCY pada
# worker. Di sini tiga rem supaya satu orang tidak bisa memenuhi antrean semua
# orang atau disk server. Nol = tanpa batas.
MAX_QUEUED_JOBS = max(0, int(os.getenv("VIDEO_MAX_QUEUED_JOBS", "30")))
MAX_BATCH = max(0, int(os.getenv("VIDEO_MAX_BATCH", "20")))
MAX_AKTIF_PER_AKUN = max(0, int(os.getenv("VIDEO_MAX_AKTIF_PER_AKUN", "20")))
MAX_ASSET_MB = float(os.getenv("VIDEO_MAX_ASSET_MB", "200"))
# Sisi terpanjang gambar layer setelah dirapikan. Berkas desain kerap jauh
# lebih besar dari kanvas; satu berkas 3375x5706 memakan 77 MB begitu ffmpeg
# membukanya. Batas ini masih di atas ukuran tampil terbesar (936 px).
MAX_SISI_GAMBAR = int(os.getenv("VIDEO_MAX_IMAGE_SIDE", "1600"))
JENIS_GAMBAR = {".png", ".jpg", ".jpeg", ".webp"}
# Berlaku untuk video layer, intro, dan outro: berkas 4K pada kanvas 720x1280
# memaksa ffmpeg membongkar frame raksasa yang langsung dibuang lagi.
MAX_SISI_VIDEO = int(os.getenv("VIDEO_MAX_VIDEO_SIDE", "1920"))
JENIS_VIDEO = {".mp4", ".mov", ".m4v", ".webm"}
JENIS_ASET = JENIS_GAMBAR | JENIS_VIDEO
STATUS_AKTIF = ("queued", "downloading", "rendering")


# ============================================================
#  VALIDASI ISI TEMPLATE
# ============================================================
#
# overlays/texts masuk ke perintah ffmpeg dan ke perender teks PIL. Nilai yang
# tidak masuk akal (crop berisi filter lain, font 100.000 px) ditolak di pintu
# depan, bukan ditemukan saat worker sedang merender.

_BATAS_OVERLAY = {"w": (0, 8192), "h": (0, 8192), "start": (0, 3600), "end": (0, 3600)}
_BATAS_TEKS = {
    "size": (1, 400), "min_size": (1, 400), "max_lines": (1, 50), "stroke": (0, 50),
    "line_spacing": (0, 400), "box_padding": (0, 400), "line_height": (0.5, 5),
    "max_width": (0, 1), "width": (0, 8192), "x": (-8192, 8192), "y": (-8192, 8192),
    "start": (0, 3600), "end": (0, 3600),
}


def _periksa_angka(item: dict[str, Any], batas: dict[str, tuple[float, float]], jenis: str) -> None:
    for kunci, (bawah, atas) in batas.items():
        nilai = item.get(kunci)
        if nilai is None or nilai == "" or isinstance(nilai, bool):
            continue
        try:
            angka = float(nilai)
        except (TypeError, ValueError):
            raise ValueError(f"{jenis}.{kunci} harus angka") from None
        if not bawah <= angka <= atas:
            raise ValueError(f"{jenis}.{kunci} harus di antara {bawah} dan {atas}")


def _periksa_posisi(nilai: Any, jenis: str) -> None:
    if nilai is None or isinstance(nilai, (int, float)) and not isinstance(nilai, bool):
        return
    teks = str(nilai).strip()
    if teks in ve.POSISI_RUMUS:
        return
    try:
        if -8192 <= float(teks) <= 8192:
            return
    except ValueError:
        pass
    raise ValueError(f"{jenis} tidak sah: {teks[:30]!r}")


class TemplateBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    width: int = Field(default=1080, ge=120, le=4096)
    height: int = Field(default=1920, ge=120, le=4096)
    fps: int = Field(default=30, ge=1, le=60)
    intro: str | None = Field(default=None, max_length=200)
    outro: str | None = Field(default=None, max_length=200)
    max_duration: float | None = Field(default=None, ge=1, le=600)
    overlays: list[dict[str, Any]] = Field(default_factory=list, max_length=30)
    texts: list[dict[str, Any]] = Field(default_factory=list, max_length=20)
    # Kotak teks hook dalam piksel kanvas: {x, y, w, h}. None = pakai posisi
    # bawaan layer teks.
    text_box: dict[str, int] | None = None
    badge_box: dict[str, int] | None = None
    # Keduanya menerima null: set yang dibuat sebelum field ini ada menyimpan
    # nilai kosong, dan membacanya lalu menyimpannya kembali harus tetap bisa.
    kategori: str | None = Field(default="", max_length=30)
    teks_warna: str | None = "white"

    @field_validator("kategori")
    @classmethod
    def _kategori_bersih(cls, v: str | None) -> str:
        return " ".join(str(v or "").split())

    @field_validator("teks_warna")
    @classmethod
    def _warna_sah(cls, v: str | None) -> str:
        return v if v in ("black", "white") else "white"

    @field_validator("overlays")
    @classmethod
    def _overlay_sah(cls, v: list[dict[str, Any]]) -> list[dict[str, Any]]:
        for item in v:
            crop = str(item.get("crop") or "").strip()
            if crop and not ve.POLA_CROP.match(crop):
                raise ValueError("overlay.crop harus berbentuk lebar:tinggi:x:y (angka)")
            if len(str(item.get("file") or "")) > 200:
                raise ValueError("overlay.file terlalu panjang")
            _periksa_angka(item, _BATAS_OVERLAY, "overlay")
            _periksa_posisi(item.get("x"), "overlay.x")
            _periksa_posisi(item.get("y"), "overlay.y")
        return v

    @field_validator("texts")
    @classmethod
    def _teks_sah(cls, v: list[dict[str, Any]]) -> list[dict[str, Any]]:
        for item in v:
            _periksa_angka(item, _BATAS_TEKS, "teks")
            if len(str(item.get("default") or "")) > 2000:
                raise ValueError("teks.default terlalu panjang")
        return v

    @field_validator("text_box", "badge_box")
    @classmethod
    def _kotak_sah(cls, v: dict[str, int] | None) -> dict[str, int] | None:
        if v is not None and any(not -8192 <= int(n) <= 8192 for n in v.values()):
            raise ValueError("koordinat kotak di luar batas kanvas")
        return v


class DuplikatBody(BaseModel):
    """Nama untuk salinan set layer."""

    name: str = Field(min_length=1, max_length=100)


class BatchBody(BaseModel):
    """Satu link dirender dengan banyak set layer sekaligus."""

    url: str = Field(min_length=5, max_length=2000)
    template_ids: list[str] = Field(min_length=1, max_length=MAX_BATCH or None)
    texts: dict[str, str] = {}
    # Warna tulisan berita khusus render ini. Kosong = ikut setelan template.
    teks_warna: str | None = None

    @field_validator("teks_warna")
    @classmethod
    def _warna_render(cls, v: str | None) -> str:
        return v if v in ("black", "white") else ""


class JobBody(BaseModel):
    url: str = Field(min_length=5, max_length=2000)
    template_id: str = Field(min_length=1, max_length=80)
    texts: dict[str, str] = {}


class PreviewBody(BaseModel):
    """Link video yang mau dilihat isinya sebelum diproses."""

    url: str = Field(min_length=5, max_length=2000)


class HookBody(BaseModel):
    """Naskah mentah dari pengguna yang mau dirapikan jadi 3 baris hook."""

    naskah: str = Field(min_length=3, max_length=5000)


class BersihkanBody(BaseModel):
    """Daftar job yang hasil videonya sudah tidak dipakai."""

    job_ids: list[str] = Field(default_factory=list, max_length=500)


# ============================================================
#  BANTUAN
# ============================================================


def _rapikan_gambar(path: Path) -> int | None:
    """Pangkas pinggiran transparan lalu perkecil gambar layer bila kebesaran.

    Dua-duanya menghemat memori saat render. Mengembalikan ukuran berkas baru,
    atau None kalau tidak ada yang diubah.
    """
    if path.suffix.lower() not in JENIS_GAMBAR:
        return None
    try:
        from PIL import Image

        with Image.open(path) as im:
            im = im.convert("RGBA")
            kotak = im.getbbox()
            berubah = False
            if kotak and kotak != (0, 0, im.width, im.height):
                im = im.crop(kotak)
                berubah = True
            sisi = max(im.width, im.height)
            if sisi > MAX_SISI_GAMBAR:
                skala = MAX_SISI_GAMBAR / sisi
                im = im.resize(
                    (max(1, round(im.width * skala)), max(1, round(im.height * skala))),
                    Image.LANCZOS,
                )
                berubah = True
            if not berubah:
                return None
            im.save(path, format="PNG")
    except Exception as error:  # berkas rusak atau format tak terduga
        logger.warning("Gambar %s tidak bisa dirapikan: %s", path.name, error)
        return None
    return path.stat().st_size


def _rapikan_video(path: Path) -> int | None:
    """Perkecil video layer/outro yang resolusinya jauh di atas kanvas.

    Hanya sekali saat diunggah, jadi setiap render sesudahnya ikut lebih
    ringan. Mengembalikan ukuran berkas baru, atau None kalau tidak berubah.
    """
    if path.suffix.lower() not in JENIS_VIDEO:
        return None
    try:
        info = ve.probe(path)
    except ve.VideoError as error:
        logger.warning("Video %s tidak bisa dibaca: %s", path.name, error)
        return None
    lebar, tinggi = int(info.get("width") or 0), int(info.get("height") or 0)
    if not lebar or not tinggi or max(lebar, tinggi) <= MAX_SISI_VIDEO:
        return None
    skala = MAX_SISI_VIDEO / max(lebar, tinggi)
    # Dibulatkan ke angka genap; encoder yuv420p menolak ukuran ganjil.
    baru_l = max(2, int(round(lebar * skala / 2)) * 2)
    baru_t = max(2, int(round(tinggi * skala / 2)) * 2)
    sementara = path.with_name(path.stem + "-kecil" + path.suffix)
    perintah = [
        ve.FFMPEG_BIN, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-threads", ve.VIDEO_THREADS,
        "-i", str(path),
        "-vf", f"scale={baru_l}:{baru_t}",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "copy",
        str(sementara),
    ]
    try:
        hasil = subprocess.run(perintah, capture_output=True, text=True, timeout=600)
        if hasil.returncode != 0 or not sementara.is_file():
            # Sebagian berkas audionya tidak bisa disalin; ulangi dengan aac.
            perintah[perintah.index("copy")] = "aac"
            hasil = subprocess.run(perintah, capture_output=True, text=True, timeout=600)
        if hasil.returncode != 0 or not sementara.is_file():
            logger.warning("Video %s gagal diperkecil: %s", path.name, (hasil.stderr or "")[:200])
            sementara.unlink(missing_ok=True)
            return None
        sementara.replace(path)
    except (subprocess.TimeoutExpired, OSError) as error:
        logger.warning("Video %s gagal diperkecil: %s", path.name, error)
        sementara.unlink(missing_ok=True)
        return None
    logger.info("Video %s diperkecil %dx%d -> %dx%d", path.name, lebar, tinggi, baru_l, baru_t)
    return path.stat().st_size


def _tangani(error: ve.VideoError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(error))


def _akun(pengguna: dict[str, Any]) -> str:
    return str(pengguna["username"]).strip().lower()


def _pastikan_hook(texts: dict[str, str] | None) -> None:
    """Tolak render tanpa isi berita.

    Setiap set layer punya layer teks "hook" - isi beritanya. Kalau kosong,
    videonya keluar dengan kotak putih tanpa tulisan; ditolak di sini, sebelum
    worker sibuk merender sesuatu yang pasti mengecewakan.
    """
    if not str((texts or {}).get("hook") or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Isi beritanya kosong. Tulis sendiri atau buat otomatis dari link dulu.",
        )


def _pastikan_kuota(pengguna: dict[str, Any], tambahan: int = 0) -> None:
    """Tolak permintaan yang akan melewati jatah penyimpanan pemiliknya."""
    try:
        kuota.pastikan_muat(_akun(pengguna), tambahan)
    except kuota.KuotaHabis as error:
        raise HTTPException(status_code=413, detail=str(error)) from error


def _template_terlihat(template_id: str, pengguna: dict[str, Any]) -> dict[str, Any]:
    """Template yang boleh dibaca akun ini: miliknya sendiri atau template bawaan."""
    try:
        data = ve.load_template(template_id)
    except ve.VideoError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    if not ve.boleh_lihat(data, _akun(pengguna)):
        # 404, bukan 403: keberadaan template orang lain tidak perlu diumumkan.
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' tidak ditemukan")
    return data


def _template_milik(template_id: str, pengguna: dict[str, Any]) -> dict[str, Any]:
    """Template yang boleh diubah akun ini."""
    data = _template_terlihat(template_id, pengguna)
    if not ve.boleh_ubah(data, _akun(pengguna)):
        raise HTTPException(
            status_code=403,
            detail="Template bawaan tidak bisa diubah. Duplikat dulu untuk menyuntingnya.",
        )
    return data


def _job_terjangkau(job_id: str, pengguna: dict[str, Any]) -> dict[str, Any]:
    """Job milik akun ini; milik orang lain dianggap tidak ada."""
    try:
        data = vt.baca_status(job_id)
    except ve.VideoError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    if str(data.get("owner") or "") != _akun(pengguna):
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' tidak ditemukan")
    return data


def _sumber_sah(url: str, pengguna: dict[str, Any]) -> str:
    """Periksa sumber video SEBELUM job dibuat.

    Unggahan hanya boleh dipakai pemiliknya; link harus situs video publik.
    Ketahuan sekarang lebih baik daripada gagal di worker beberapa detik lagi.
    """
    url = url.strip()
    if ve.folder_unggahan(url) is not None:
        if ve.pemilik_unggahan(url) != _akun(pengguna):
            raise HTTPException(
                status_code=404,
                detail="Video unggahan tidak ditemukan (mungkin sudah dibersihkan). Unggah lagi.",
            )
        return url
    try:
        return ve.periksa_url(url)
    except ve.VideoError as error:
        raise _tangani(error) from error


def _pastikan_antrean_muat(tambahan: int, pengguna: dict[str, Any]) -> None:
    """Tolak kalau antrean server atau job aktif akun ini sudah penuh."""
    if MAX_AKTIF_PER_AKUN > 0:
        aktif = [
            j for j in vt.daftar_job(MAX_AKTIF_PER_AKUN + tambahan + 1, owner=_akun(pengguna))
            if j.get("status") in STATUS_AKTIF
        ]
        if len(aktif) + tambahan > MAX_AKTIF_PER_AKUN:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Masih ada {len(aktif)} video milikmu yang belum selesai (maksimal "
                    f"{MAX_AKTIF_PER_AKUN}). Tunggu sebagian selesai lalu coba lagi."
                ),
            )
    if MAX_QUEUED_JOBS > 0:
        antre = [
            j for j in vt.daftar_job(MAX_QUEUED_JOBS + tambahan + 1)
            if j.get("status") == "queued"
        ]
        if len(antre) + tambahan > MAX_QUEUED_JOBS:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Antrean server penuh: {len(antre)} video menunggu (maksimal "
                    f"{MAX_QUEUED_JOBS}). Coba lagi beberapa menit lagi."
                ),
            )


def _galat_tulis(error: OSError) -> HTTPException:
    """Ubah kegagalan tulis ke disk jadi jawaban yang bisa dimengerti."""
    if error.errno == errno.ENOSPC:
        logger.error("Volume media penuh saat menerima unggahan: %s", ve.ruang_media())
        return HTTPException(
            status_code=507,
            detail=(
                "Ruang penyimpanan server sedang penuh, jadi berkasnya tidak bisa "
                "disimpan. Berkas lama sedang dibersihkan otomatis - coba lagi "
                "beberapa saat lagi."
            ),
        )
    logger.exception("Gagal menulis unggahan ke disk")
    return HTTPException(status_code=500, detail="Gagal menyimpan berkas di server.")


def _sediakan_ruang(request: Request, batas_byte: int) -> None:
    """Pastikan volume masih muat menampung unggahan ini.

    Ukurannya diambil dari Content-Length kalau ada, jadi berkas kecil tidak
    ikut ditolak hanya karena batas maksimalnya besar.
    """
    try:
        perlu = int(request.headers.get("content-length") or 0)
    except (TypeError, ValueError):
        perlu = 0
    perlu = min(perlu, batas_byte) if perlu > 0 else batas_byte
    perlu_mb = perlu / 1_048_576
    sisa_mb = ve.sediakan_ruang(perlu_mb)
    if sisa_mb < perlu_mb:
        logger.error("Unggahan %.0f MB ditolak: sisa volume %.0f MB", perlu_mb, sisa_mb)
        raise HTTPException(
            status_code=507,
            detail=(
                f"Ruang penyimpanan server tinggal {sisa_mb:.0f} MB, tidak cukup "
                f"untuk berkas {perlu_mb:.0f} MB. Coba berkas yang lebih kecil atau ulangi nanti."
            ),
        )


async def _tulis_unggahan(file: UploadFile, tujuan: Path, batas: int, pesan_besar: str) -> int:
    """Salin unggahan ke disk per 1 MB; potongan setengah jadi selalu dibuang."""
    ukuran = 0
    try:
        with tujuan.open("wb") as keluar:
            while potongan := await file.read(1_048_576):
                ukuran += len(potongan)
                if ukuran > batas:
                    raise HTTPException(status_code=413, detail=pesan_besar)
                keluar.write(potongan)
    except OSError as error:
        tujuan.unlink(missing_ok=True)
        raise _galat_tulis(error) from error
    except BaseException:
        tujuan.unlink(missing_ok=True)
        raise
    return ukuran


def _pastikan_isi_media(berkas: Path) -> None:
    """Pastikan berkasnya benar-benar gambar/video, bukan sekadar bernama .png."""
    if berkas.suffix.lower() in JENIS_GAMBAR:
        try:
            from PIL import Image

            with Image.open(berkas) as im:
                im.verify()
        except Exception as error:  # noqa: BLE001
            raise HTTPException(status_code=415, detail="Berkas ini bukan gambar yang bisa dibaca.") from error
        return
    try:
        info = ve.probe(berkas)
    except Exception as error:  # noqa: BLE001
        raise HTTPException(status_code=415, detail="Berkas ini bukan video yang bisa dibaca.") from error
    if not info.get("width") or not info.get("height"):
        raise HTTPException(status_code=415, detail="Video ini tidak punya gambar.")


def _cabut_tugas(status: dict[str, Any]) -> None:
    """Hentikan satu job: tandai batal, cabut dari antrean, catat keadaannya."""
    job_id = str(status["job_id"])
    vt.minta_batal(job_id)
    # terminate sengaja tidak dipakai: worker memakai kumpulan utas, dan utas
    # tidak bisa ditembak dari luar. Yang berjalan berhenti sendiri di sela
    # langkah berikutnya karena menanyakan penanda batal.
    tugas = status.get("task_id")
    if tugas:
        try:
            vt.celery_app.control.revoke(str(tugas))
        except Exception:  # noqa: BLE001
            logger.warning("Gagal mencabut tugas %s", tugas)
    if status.get("status") == "queued":
        vt.tulis_status(job_id, status="dibatalkan", log="Dihentikan sebelum mulai.")
    else:
        vt.tulis_status(job_id, log="Diminta berhenti; menunggu proses berhenti.")


def _buang_job(job_id: str) -> None:
    vt.buang_job(job_id)
    shutil.rmtree(vt.job_path(job_id), ignore_errors=True)


# ============================================================
#  INFO, PRATINJAU LINK, HOOK
# ============================================================


@router.get("/info")
def info_video(pengguna: dict[str, Any] = Depends(pengguna_wajib)) -> dict[str, Any]:
    """Batas dan sisa jatah, dibaca halaman saat dibuka.

    Angkanya dikirim dari server supaya berkas tidak ditolak SESUDAH terunggah
    penuh hanya karena halaman dan server tidak sepakat.
    """
    pemilik = _akun(pengguna)
    dipakai = kuota.pemakaian_byte(pemilik)
    batas = kuota.batas_byte(pemilik)
    return {
        "worker_aktif": vt.worker_hidup(),
        "maks_aset_mb": MAX_ASSET_MB,
        "maks_sumber_mb": ve.MAX_SOURCE_UPLOAD_MB,
        "jenis_aset": sorted(JENIS_ASET),
        "jenis_sumber": sorted(JENIS_VIDEO),
        "kuota": {
            "dipakai_mb": round(dipakai / 1_048_576, 1),
            "batas_mb": round(batas / 1_048_576),
            "persen": min(100, round(dipakai * 100 / batas)) if batas else 0,
            "tamu": False,
        },
    }


@router.post("/preview")
def pratinjau_link(body: PreviewBody) -> dict[str, Any]:
    """Tampilkan isi link (judul, durasi, sampul) tanpa mengunduh videonya."""
    try:
        return ve.preview_source(body.url)
    except ve.VideoError as error:
        raise _tangani(error) from error


@router.post("/hook")
async def buat_hook(body: HookBody) -> dict[str, Any]:
    """Ubah naskah mentah jadi hook siap tempel. Tanpa DeepSeek pun tetap jalan."""
    hasil = await vh.buat_hook(body.naskah)
    if not hasil["hook"]:
        raise HTTPException(status_code=400, detail="Naskah terlalu pendek untuk dijadikan hook.")
    return hasil


# ============================================================
#  TEMPLATE
# ============================================================


@router.get("/templates")
def daftar_template(pengguna: dict[str, Any] = Depends(pengguna_wajib)) -> dict[str, Any]:
    return {"templates": ve.list_templates(owner=_akun(pengguna))}


@router.post("/templates")
def buat_template(
    body: TemplateBody,
    template_id: str | None = None,
    pengguna: dict[str, Any] = Depends(pengguna_wajib),
) -> dict[str, Any]:
    """Buat atau perbarui template."""
    if template_id and ve.template_path(template_id).joinpath("template.json").is_file():
        _template_milik(template_id, pengguna)
    try:
        hasil = ve.save_template(body.model_dump(), template_id, owner=_akun(pengguna))
    except ve.VideoError as error:
        raise _tangani(error) from error
    # Berkas layer yang tidak dirujuk lagi tetap memakan jatah penyimpanan.
    try:
        ve.buang_aset_tak_terpakai(str(hasil.get("id") or template_id), hasil)
        kuota.lupakan(_akun(pengguna))
    except Exception:  # noqa: BLE001 - kebersihan tidak boleh menggagalkan simpan
        logger.exception("Pembersihan aset %s gagal", template_id)
    return hasil


def _dengan_aset(data: dict[str, Any], pengguna: dict[str, Any]) -> dict[str, Any]:
    aset = sorted(
        p.name for p in (ve.template_path(data["id"]) / "assets").glob("*") if p.is_file()
    )
    # Kotak badge tebakan kalau pengguna belum menggambarnya; can_edit memberi
    # tahu halaman apakah kendali penyuntingan perlu dikunci.
    return {
        **data,
        "assets": aset,
        "badge_box_default": ve.kotak_kategori_bawaan(data.get("text_box")),
        "can_edit": ve.boleh_ubah(data, _akun(pengguna)),
    }


@router.get("/templates/{template_id}")
def ambil_template(template_id: str, pengguna: dict[str, Any] = Depends(pengguna_wajib)) -> dict[str, Any]:
    return _dengan_aset(_template_terlihat(template_id, pengguna), pengguna)


@router.get("/templates/{template_id}/preview.png")
def pratinjau_template(
    template_id: str,
    teks: int = 0,
    contoh_hook: str = "",
    pengguna: dict[str, Any] = Depends(pengguna_wajib),
) -> Response:
    """Gambar komposit layer statis template (tanpa video), untuk halaman.

    ``teks=1`` ikut menggambar tulisan contoh memakai perender yang sama dengan
    pembuatan video, supaya yang terlihat benar-benar bentuk akhirnya.
    """
    import io

    template = _template_terlihat(template_id, pengguna)
    contoh = None
    if teks:
        contoh = {
            "hook": (contoh_hook or "VIRAL! CONTOH TULISAN BERITA UNTUK MELIHAT LETAK DAN UKURANNYA")[:180],
            "sumber": "SUMBER: CONTOH",
        }
    try:
        kanvas = ve.komposit_statis(template, contoh)
    except ve.VideoError as error:
        raise _tangani(error) from error
    buf = io.BytesIO()
    kanvas.convert("RGB").save(buf, format="PNG", optimize=True)
    return Response(content=buf.getvalue(), media_type="image/png", headers={"Cache-Control": "no-store"})


# Kapan tiap akun terakhir menjalankan deteksi. Analisisnya membaca seluruh
# gambar layer; menekan tombolnya berkali-kali adalah cara termurah membuat
# server sibuk tanpa hasil.
_deteksi_terakhir: dict[str, float] = {}
JEDA_DETEKSI_DETIK = float(os.getenv("VIDEO_JEDA_DETEKSI", "3"))


@router.post("/templates/{template_id}/detect-box")
def deteksi_kotak(template_id: str, pengguna: dict[str, Any] = Depends(pengguna_wajib)) -> dict[str, Any]:
    """Tebak posisi kotak teks dari layer gambar template."""
    pemilik = _akun(pengguna)
    sekarang = time.time()
    if sekarang - _deteksi_terakhir.get(pemilik, 0) < JEDA_DETEKSI_DETIK:
        raise HTTPException(
            status_code=429, detail=f"Tunggu {JEDA_DETEKSI_DETIK:.0f} detik sebelum mendeteksi lagi."
        )
    _deteksi_terakhir[pemilik] = sekarang
    template = _template_terlihat(template_id, pengguna)
    try:
        kotak = ve.deteksi_kotak_teks(ve.komposit_statis(template))
    except ve.VideoError as error:
        raise _tangani(error) from error
    if kotak is None:
        raise HTTPException(status_code=404, detail="Tidak menemukan bidang polos yang cukup luas untuk kotak teks.")
    return {"text_box": kotak}


@router.post("/templates/{template_id}/duplicate")
def duplikat_template(
    template_id: str, body: DuplikatBody, pengguna: dict[str, Any] = Depends(pengguna_wajib)
) -> dict[str, Any]:
    """Salin set layer; salinannya milik yang menyalin (juga dari template bawaan)."""
    _template_terlihat(template_id, pengguna)
    try:
        hasil = ve.duplicate_template(template_id, body.name, owner=_akun(pengguna))
    except ve.VideoError as error:
        raise _tangani(error) from error
    return _dengan_aset(hasil, pengguna)


@router.delete("/templates/{template_id}")
def hapus_template(template_id: str, pengguna: dict[str, Any] = Depends(pengguna_wajib)) -> dict[str, bool]:
    _template_milik(template_id, pengguna)
    # Menghapus template yang sedang dipakai membuat job berjalan kehilangan
    # bahannya. Job terlantar ditandai gagal dulu supaya tidak menyandera.
    vt.tandai_terlantar()
    berjalan = [
        j for j in vt.daftar_job(200, owner=_akun(pengguna))
        if j.get("template_id") == template_id and j.get("status") in STATUS_AKTIF
    ]
    if berjalan:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Template ini sedang dipakai {len(berjalan)} video yang belum selesai. "
                "Tunggu sampai selesai atau hentikan dulu."
            ),
        )
    ve.delete_template(template_id)
    kuota.lupakan(_akun(pengguna))
    return {"ok": True}


@router.post("/templates/{template_id}/assets")
async def unggah_aset(
    template_id: str,
    request: Request,
    file: UploadFile = File(...),
    pengguna: dict[str, Any] = Depends(pengguna_wajib),
) -> dict[str, Any]:
    """Terima satu berkas layer (gambar overlay, intro, atau outro)."""
    _template_milik(template_id, pengguna)
    _pastikan_kuota(pengguna)
    nama = ve._aman(Path(file.filename or "aset").name)
    if Path(nama).suffix.lower() not in JENIS_ASET:
        raise HTTPException(
            status_code=415, detail=f"Jenis berkas tidak didukung. Pakai: {', '.join(sorted(JENIS_ASET))}"
        )
    batas = int(MAX_ASSET_MB * 1_048_576)
    _sediakan_ruang(request, batas)
    folder = ve.template_path(template_id) / "assets"
    folder.mkdir(parents=True, exist_ok=True)
    tujuan = folder / nama
    try:
        ukuran = await _tulis_unggahan(file, tujuan, batas, f"Berkas melebihi {MAX_ASSET_MB:.0f} MB")
    finally:
        kuota.lupakan(_akun(pengguna))
    try:
        _pastikan_isi_media(tujuan)
    except HTTPException:
        tujuan.unlink(missing_ok=True)
        raise
    ukuran = _rapikan_gambar(tujuan) or _rapikan_video(tujuan) or ukuran
    return {"file": f"assets/{nama}", "size": ukuran}


@router.delete("/templates/{template_id}/assets/{nama}")
def hapus_aset(template_id: str, nama: str, pengguna: dict[str, Any] = Depends(pengguna_wajib)) -> dict[str, bool]:
    _template_milik(template_id, pengguna)
    (ve.template_path(template_id) / "assets" / ve._aman(nama)).unlink(missing_ok=True)
    kuota.lupakan(_akun(pengguna))
    return {"ok": True}


# ============================================================
#  VIDEO SUMBER & JOB RENDER
# ============================================================


@router.post("/sources")
async def unggah_sumber(
    request: Request,
    file: UploadFile = File(...),
    pengguna: dict[str, Any] = Depends(pengguna_wajib),
) -> dict[str, Any]:
    """Terima video sumber dari komputer pengguna.

    Mengembalikan alamat "upload://<id>" yang dipakai persis seperti link.
    Pemiliknya dicatat, jadi hanya akun ini yang bisa memakainya untuk render.
    """
    nama = ve._aman(Path(file.filename or "video").name)
    if Path(nama).suffix.lower() not in JENIS_VIDEO:
        raise HTTPException(
            status_code=415, detail=f"Jenis berkas tidak didukung. Pakai: {', '.join(sorted(JENIS_VIDEO))}"
        )
    batas = int(ve.MAX_SOURCE_UPLOAD_MB * 1_048_576)
    _sediakan_ruang(request, batas)
    id_unggahan = uuid.uuid4().hex[:12]
    folder = ve.uploads_dir() / id_unggahan
    folder.mkdir(parents=True, exist_ok=True)
    tujuan = folder / f"source{Path(nama).suffix.lower()}"
    try:
        ukuran = await _tulis_unggahan(
            file, tujuan, batas, f"Video sumber melebihi {ve.MAX_SOURCE_UPLOAD_MB:.0f} MB."
        )
        info = ve.probe(tujuan)
    except ve.VideoError as error:
        shutil.rmtree(folder, ignore_errors=True)
        raise HTTPException(status_code=415, detail=f"Berkas bukan video yang bisa dibaca: {error}") from error
    except BaseException:
        shutil.rmtree(folder, ignore_errors=True)
        raise
    durasi = float(info.get("duration") or 0)
    if durasi > ve.MAX_SOURCE_SECONDS + 1:
        # Ditolak di sini juga: percuma menyimpan berkas yang pasti tidak diproses.
        shutil.rmtree(folder, ignore_errors=True)
        raise HTTPException(
            status_code=413,
            detail=(
                f"Videonya {durasi / 60:.0f} menit, lebih panjang dari batas "
                f"{ve.MAX_SOURCE_SECONDS / 60:.0f} menit."
            ),
        )
    (folder / ".pemilik").write_text(_akun(pengguna), encoding="utf-8")
    return {
        "url": f"{ve.AWALAN_UNGGAHAN}{id_unggahan}",
        "name": nama,
        "size": ukuran,
        "duration": info.get("duration"),
        "width": info.get("width"),
        "height": info.get("height"),
    }


def _kirim_job(url: str, template_id: str, texts: dict[str, str], pengguna: dict[str, Any], teks_warna: str = "") -> str:
    job_id = vt.buat_job(url, template_id, texts, owner=_akun(pengguna))
    tambahan = {"teks_warna": teks_warna} if teks_warna else {}
    vt.render_video.delay(job_id, url, template_id, texts, **tambahan)
    return job_id


@router.post("/jobs")
def mulai_job(body: JobBody, pengguna: dict[str, Any] = Depends(pengguna_wajib)) -> dict[str, Any]:
    _template_terlihat(body.template_id, pengguna)
    _pastikan_hook(body.texts)
    url = _sumber_sah(body.url, pengguna)
    _pastikan_kuota(pengguna)
    _pastikan_antrean_muat(1, pengguna)
    return {"job_id": _kirim_job(url, body.template_id, body.texts, pengguna), "status": "queued"}


@router.post("/jobs/batch")
def mulai_banyak_job(body: BatchBody, pengguna: dict[str, Any] = Depends(pengguna_wajib)) -> dict[str, Any]:
    """Satu job per set layer untuk link yang sama.

    Video sumbernya diunduh sekali lalu dipakai ulang dari cache, jadi banyak
    set tidak berarti banyak unduhan.
    """
    ids: list[str] = []
    for tid in body.template_ids:
        tid = tid.strip()
        if tid and tid not in ids:
            ids.append(tid)
    if not ids:
        raise HTTPException(status_code=400, detail="Pilih minimal satu set layer.")
    for tid in ids:
        _template_terlihat(tid, pengguna)
    _pastikan_hook(body.texts)
    url = _sumber_sah(body.url, pengguna)
    _pastikan_kuota(pengguna)
    _pastikan_antrean_muat(len(ids), pengguna)
    jobs = [
        {
            "job_id": _kirim_job(url, tid, body.texts, pengguna, body.teks_warna or ""),
            "template_id": tid,
            "status": "queued",
        }
        for tid in ids
    ]
    return {"jobs": jobs}


@router.get("/jobs")
def daftar_job(limit: int = 20, pengguna: dict[str, Any] = Depends(pengguna_wajib)) -> dict[str, Any]:
    """Riwayat render akun ini."""
    # Job yang ditinggal worker mati ditandai gagal dulu, supaya daftar yang
    # tampil adalah keadaan sebenarnya - bukan "menyusun 2%" yang beku.
    vt.tandai_terlantar()
    return {"jobs": vt.daftar_job(max(1, min(100, limit)), owner=_akun(pengguna))}


@router.get("/jobs/{job_id}")
def status_job(job_id: str, pengguna: dict[str, Any] = Depends(pengguna_wajib)) -> dict[str, Any]:
    # Dipoll halaman tiap beberapa detik: job aktif yang lama membisu ditandai
    # gagal di sini supaya tombol Coba lagi muncul.
    return vt.segarkan_kalau_terlantar(_job_terjangkau(job_id, pengguna))


@router.get("/jobs/{job_id}/file")
def berkas_job(job_id: str, pengguna: dict[str, Any] = Depends(pengguna_wajib)) -> FileResponse:
    status = _job_terjangkau(job_id, pengguna)
    if not status.get("output"):
        raise HTTPException(status_code=409, detail="Video belum selesai disusun")
    berkas = vt.job_path(job_id) / ve._aman(str(status["output"]))
    if not berkas.is_file():
        raise HTTPException(status_code=404, detail="Berkas hasil sudah tidak ada")
    return FileResponse(berkas, media_type="video/mp4", filename=f"{job_id}.mp4")


@router.post("/jobs/stop")
def hentikan_job(pengguna: dict[str, Any] = Depends(pengguna_wajib)) -> dict[str, Any]:
    """Hentikan semua pembuatan video milik akun ini yang belum selesai."""
    belum = [j for j in vt.daftar_job(500, owner=_akun(pengguna)) if j.get("status") in STATUS_AKTIF]
    for j in belum:
        _cabut_tugas(j)
    return {"dihentikan": len(belum)}


@router.delete("/jobs/{job_id}")
def hapus_job(job_id: str, pengguna: dict[str, Any] = Depends(pengguna_wajib)) -> dict[str, bool]:
    _job_terjangkau(job_id, pengguna)
    _buang_job(job_id)
    return {"ok": True}


@router.post("/jobs/{job_id}/stop")
def hentikan_satu_job(job_id: str, pengguna: dict[str, Any] = Depends(pengguna_wajib)) -> dict[str, Any]:
    """Hentikan SATU pembuatan video."""
    status = _job_terjangkau(job_id, pengguna)
    if status.get("status") not in STATUS_AKTIF:
        raise HTTPException(status_code=409, detail="Video ini sudah tidak berjalan.")
    _cabut_tugas(status)
    return {"ok": True, "job_id": job_id}


@router.post("/jobs/{job_id}/ulangi")
def ulangi_job(job_id: str, pengguna: dict[str, Any] = Depends(pengguna_wajib)) -> dict[str, Any]:
    """Jalankan ulang satu job dengan bahan yang sama persis."""
    status = _job_terjangkau(job_id, pengguna)
    sumber = str(status.get("sumber_url") or "")
    template_id = str(status.get("template_id") or "")
    if not sumber or not template_id:
        raise HTTPException(status_code=409, detail="Bahan job ini sudah tidak lengkap; buat ulang dari awal.")
    _template_terlihat(template_id, pengguna)
    sumber = _sumber_sah(sumber, pengguna)
    _pastikan_kuota(pengguna)
    _pastikan_antrean_muat(1, pengguna)
    texts = status.get("texts") or {}
    return {"job_id": _kirim_job(sumber, template_id, texts, pengguna), "template_id": template_id, "status": "queued"}


@router.post("/jobs/cleanup")
def bersihkan_job(body: BersihkanBody, pengguna: dict[str, Any] = Depends(pengguna_wajib)) -> dict[str, int]:
    """Buang hasil render yang sudah tidak ditampilkan lagi."""
    dihapus = 0
    for job_id in body.job_ids[:500]:
        job_id = str(job_id).strip()
        if not job_id:
            continue
        try:
            _job_terjangkau(job_id, pengguna)
        except HTTPException:
            continue  # bukan miliknya, atau sudah tidak ada
        _buang_job(job_id)
        dihapus += 1
    return {"dihapus": dihapus}
