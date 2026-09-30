"""API Edit Otomatis TVR Saya: satu template per akun, satu video per akun.

Dipanggil lewat /api/autoedit/tvr/* di SuperApp (akun yang modul Edit
Otomatis-nya dibuka master). Alurnya:

1. TEMPLATE. Bahan diunggah ke DRAF dulu: kotak monas (PNG), boom like share
   (PNG/GIF/video), bingkai teratas (PNG), video penutup. Letak tulisan
   ditentukan di pratinjau, lalu "Simpan & Tetapkan" memindahkan draf ke
   tempatnya - MENGGANTIKAN berkas lama, bukan menumpuk. Batal = draf dibuang,
   template lama utuh.
2. EDIT. Video sumber (unggah atau link) + tulisan -> satu job di antrean
   server bersama. Satu akun hanya boleh memegang satu video sampai
   dituntaskan (diunggah atau diedit ulang).
3. HASIL disimpan sementara (umur job, 24 jam) sampai anggota memilih.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field, field_validator
from starlette.concurrency import run_in_threadpool

import kuota
import video_api as va
import video_edit as ve
import video_hook as vh
import video_tasks as vt
from akses import pengguna_tvr

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tvr", tags=["tvr"], dependencies=[Depends(pengguna_tvr)])

LEBAR, TINGGI, FPS = 720, 1280, 30
SLOT = ("kotak", "boom", "bingkai", "penutup")
NAMA_SLOT = {
    "kotak": "Kotak monas",
    "boom": "Boom like share",
    "bingkai": "Bingkai teratas",
    "penutup": "Video penutup",
}
JENIS_VIDEO = {".mp4", ".mov", ".webm", ".m4v"}
# Kotak monas & bingkai teratas WAJIB PNG: keduanya butuh bagian tembus
# pandang, dan hanya PNG yang pasti menyimpannya.
JENIS_SLOT: dict[str, set[str]] = {
    "kotak": {".png"},
    "boom": {".png", ".gif"} | JENIS_VIDEO,
    "bingkai": {".png"},
    "penutup": set(JENIS_VIDEO),
}
SLOT_WAJIB = ("kotak", "bingkai")
SLOT_BOLEH_KOSONG = ("boom", "penutup")
MAKS_GIF_MB = float(os.getenv("TVR_MAKS_GIF_MB", "20"))
MAKS_ANIMASI_DETIK = float(os.getenv("TVR_MAKS_ANIMASI_DETIK", "60"))
MAKS_HOOK = 180
# Video sumber lebih panjang dari ini dipotong (bukan ditolak): menjaga lama
# antrean, dan hasilnya tetap di bawah batas 100 MB form unggah sosmed.
MAKS_DURASI_DETIK = float(os.getenv("TVR_MAKS_DURASI_DETIK", "180"))
MAKS_SUMBER = 60
# Penunjuk akun -> job hidup sedikit lebih lama dari job-nya sendiri, supaya
# job yang kedaluwarsa terbaca "sudah tidak ada", bukan penunjuknya yang hilang.
UMUR_PENUNJUK = int(vt.JOB_RETENTION_HOURS * 3600) + 3600
KUNCI_JOB_AKUN = "tvrjob:"
KUNCI_UNGGAHAN = "tvrunggah:"
JEDA_DETEKSI_DETIK = float(os.getenv("VIDEO_JEDA_DETEKSI", "3"))

# Susunan tulisan PERSIS template GODAM (susunanBawaan di modul Auto Edit
# master, kanvas 720x1280): tulisan berita, badge kategori, kredit sumber.
# Kotak monas, tulisan berita, dan badge tampil pada detik 0-3.
TEKS_HOOK: dict[str, Any] = {
    "name": "hook", "style": "berita", "align": "justify", "size": 38, "min_size": 22,
    "max_lines": 4, "x": 38, "y": 783, "width": 660, "line_height": 1.15,
    "color": "black", "kicker_color": "#d32d27", "start": 0, "end": 3,
}
TEKS_KATEGORI: dict[str, Any] = {
    "name": "kategori", "style": "kategori", "source": "kategori", "color": "white",
    "start": 0, "end": 3,
}
PILIHAN_RATA = ("justify", "left", "center", "right")
MAKS_KATEGORI = 30
TEKS_SUMBER: dict[str, Any] = {
    "name": "sumber", "size": 10, "x": None, "y": 1253, "align": "right",
    "color": "white", "stroke": 1, "stroke_color": "black",
}

_kunci_induk = threading.Lock()
_kunci_akun: dict[str, threading.Lock] = {}
_deteksi_terakhir: dict[str, float] = {}


def _kunci(akun: str) -> threading.Lock:
    """Satu kunci per akun: simpan template dan kirim job tidak boleh balapan
    (klik ganda, dua perangkat)."""
    with _kunci_induk:
        if akun not in _kunci_akun:
            _kunci_akun[akun] = threading.Lock()
        return _kunci_akun[akun]


def _akun(pengguna: dict[str, Any]) -> str:
    return str(pengguna["username"])


def _id_template(pengguna: dict[str, Any]) -> str:
    return f"tvr-{pengguna['user_id']}"


def _folder_aset(pengguna: dict[str, Any]) -> Path:
    return ve.template_path(_id_template(pengguna)) / "assets"


def _folder_draf(pengguna: dict[str, Any]) -> Path:
    return _folder_aset(pengguna) / ".draf"


def _berkas_slot(folder: Path, slot: str) -> Path | None:
    """Berkas milik satu slot di folder ini ("kotak.png", "boom.mov", ...)."""
    if not folder.is_dir():
        return None
    calon = sorted(
        (p for p in folder.glob(f"{slot}.*") if p.is_file()),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return calon[0] if calon else None


def _baca_template(pengguna: dict[str, Any]) -> dict[str, Any] | None:
    try:
        return ve.load_template(_id_template(pengguna))
    except ve.VideoError:
        return None


def _jenis(berkas: Path | None) -> str:
    if berkas is None:
        return ""
    akhiran = berkas.suffix.lower()
    if akhiran == ".gif":
        return "gif"
    return "video" if akhiran in JENIS_VIDEO else "gambar"


def _info_slot(pengguna: dict[str, Any], template: dict[str, Any] | None) -> dict[str, Any]:
    hasil: dict[str, Any] = {}
    for slot in SLOT:
        hidup = _berkas_slot(_folder_aset(pengguna), slot)
        draf = _berkas_slot(_folder_draf(pengguna), slot)
        dipakai = draf or hidup
        info: dict[str, Any] = {
            "ada": hidup is not None,
            "draf": draf is not None,
            "jenis": _jenis(dipakai),
        }
        if slot == "boom" and dipakai is not None and _jenis(dipakai) == "video":
            info["alpha"] = ve._punya_alpha(dipakai)
        hasil[slot] = info
    if template:
        hasil["boom"]["kunci_hijau"] = bool(template.get("kunci_hijau"))
    return hasil


def _rata(template: dict[str, Any] | None) -> str:
    """Perataan tulisan berita: disimpan di layer "berita", seperti GODAM."""
    for layer in (template or {}).get("texts") or []:
        if layer.get("style") == "berita" and layer.get("align") in PILIHAN_RATA:
            return str(layer["align"])
    return "justify"


def _keadaan(pengguna: dict[str, Any]) -> dict[str, Any]:
    """Keadaan template akun ini untuk halaman."""
    template = _baca_template(pengguna)
    isi = template or {}
    return {
        "ada": template is not None,
        "siap": bool(template and template.get("siap")),
        "slot": _info_slot(pengguna, template),
        "text_box": isi.get("text_box"),
        "badge_box": isi.get("badge_box"),
        # Tebakan letak badge bila belum digambar (sama dengan GODAM).
        "badge_box_default": ve.kotak_kategori_bawaan(isi.get("text_box")),
        "kategori": str(isi.get("kategori") or ""),
        "rata": _rata(template),
        "teks_warna": isi.get("teks_warna") or "white",
        "diperbarui": isi.get("diperbarui"),
    }


def _susunan(pengguna: dict[str, Any], berkas: dict[str, Path | None], kunci_hijau: bool) -> list[dict[str, Any]]:
    """Tiga layer tetap, urut dari bawah ke atas. ``berkas`` = path per slot."""

    def rujukan(slot: str) -> str:
        path = berkas.get(slot)
        if path is None:
            return ""
        return path.relative_to(ve.template_path(_id_template(pengguna))).as_posix()

    boom = berkas.get("boom")
    boom_bergerak = _jenis(boom) in ("video", "gif")
    return [
        # Selebar layar, menempel ke dasar; tingginya mengikuti rasio berkas.
        {"label": "kotak monas", "file": rujukan("kotak"), "x": 0, "y": "main_h-h",
         "w": LEBAR, "h": None, "start": 0, "end": 3},
        # Ukuran & letak persis GODAM (280x158 di 45,55). Animasi diputar
        # berulang; latar hijau dibuang bila dicentang.
        {"label": "boom like share", "file": rujukan("boom"), "x": 45, "y": 55,
         "w": 280, "h": 158, "loop": boom_bergerak,
         "kunci_hijau": bool(kunci_hijau and _jenis(boom) == "video")},
        {"label": "bingkai teratas", "file": rujukan("bingkai"), "x": 0, "y": "main_h-h",
         "w": LEBAR, "h": None},
    ]


def _template_dari(
    pengguna: dict[str, Any],
    berkas: dict[str, Path | None],
    text_box: dict[str, int] | None,
    teks_warna: str,
    kunci_hijau: bool,
    badge_box: dict[str, int] | None = None,
    kategori: str = "",
    rata: str = "justify",
) -> dict[str, Any]:
    penutup = berkas.get("penutup")
    return {
        "name": "TVR Saya",
        "width": LEBAR,
        "height": TINGGI,
        "fps": FPS,
        "intro": None,
        "outro": (
            penutup.relative_to(ve.template_path(_id_template(pengguna))).as_posix()
            if penutup else None
        ),
        "max_duration": MAKS_DURASI_DETIK,
        "overlays": _susunan(pengguna, berkas, kunci_hijau),
        "texts": [
            {**TEKS_HOOK, "align": rata if rata in PILIHAN_RATA else "justify"},
            TEKS_KATEGORI,
            TEKS_SUMBER,
        ],
        "text_box": text_box,
        "badge_box": badge_box,
        "kategori": kategori,
        "teks_warna": teks_warna if teks_warna in ("white", "black") else "white",
        "kunci_hijau": bool(kunci_hijau),
    }


def _pastikan_template(pengguna: dict[str, Any]) -> dict[str, Any]:
    """Template akun ini; dibuat kosong (belum ditetapkan) bila belum ada."""
    ada = _baca_template(pengguna)
    if ada is not None:
        return ada
    tid = _id_template(pengguna)
    isi = _template_dari(pengguna, {}, None, "white", False)
    isi["siap"] = False
    isi["name"] = ve.nama_set_unik("TVR Saya", tid, _akun(pengguna))
    return ve.save_template(isi, tid, owner=_akun(pengguna))


def _template_gabungan(
    pengguna: dict[str, Any],
    text_box: dict[str, int] | None,
    teks_warna: str | None,
    badge_box: dict[str, int] | None = None,
    kategori: str | None = None,
    rata: str | None = None,
) -> dict[str, Any]:
    """Template seperti yang AKAN tersimpan: draf menimpa berkas yang ada,
    pilihan yang belum disimpan (dari pratinjau) menimpa yang tersimpan."""
    template = _baca_template(pengguna) or {}
    berkas = {
        slot: _berkas_slot(_folder_draf(pengguna), slot) or _berkas_slot(_folder_aset(pengguna), slot)
        for slot in SLOT
    }
    isi = _template_dari(
        pengguna,
        berkas,
        text_box if text_box is not None else template.get("text_box"),
        teks_warna or str(template.get("teks_warna") or "white"),
        bool(template.get("kunci_hijau")),
        badge_box if badge_box is not None else template.get("badge_box"),
        kategori if kategori is not None else str(template.get("kategori") or ""),
        rata or _rata(template),
    )
    isi["id"] = _id_template(pengguna)
    return isi


# ============================================================
#  VALIDASI BERKAS
# ============================================================


def _awal_berkas(path: Path, n: int = 12) -> bytes:
    with path.open("rb") as f:
        return f.read(n)


def _alpha_webm(path: Path) -> bool:
    """WEBM VP8/VP9 menyimpan transparansinya sebagai tag, bukan pix_fmt."""
    hasil = subprocess.run(
        [ve.FFPROBE_BIN, "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream_tags=alpha_mode", "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True, timeout=60,
    )
    return (hasil.stdout or "").strip() == "1"


def _webm_ke_mov(path: Path) -> Path:
    """WEBM transparan -> MOV qtrle beralpha.

    Dekoder VP9 bawaan ffmpeg MEMBUANG transparansi WEBM; hanya libvpx yang
    membacanya. Diubah sekali saat diunggah supaya setiap render memakai
    berkas yang pasti terbaca beralpha. Lebarnya dibatasi 2x tempat gambarnya.
    """
    kodek = subprocess.run(
        [ve.FFPROBE_BIN, "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=codec_name", "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True, timeout=60,
    ).stdout.strip()
    dekoder = "libvpx" if kodek == "vp8" else "libvpx-vp9"
    tujuan = path.with_suffix(".mov")
    perintah = [
        ve.FFMPEG_BIN, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-c:v", dekoder, "-i", str(path),
        "-vf", "scale='min(560,iw)':-2", "-c:v", "qtrle", "-pix_fmt", "argb", "-an", str(tujuan),
    ]
    hasil = subprocess.run(perintah, capture_output=True, text=True, timeout=600)
    if hasil.returncode != 0 or not tujuan.is_file():
        tujuan.unlink(missing_ok=True)
        raise HTTPException(status_code=415, detail="WEBM transparan ini tidak bisa dibaca. Coba format MOV atau GIF.")
    path.unlink(missing_ok=True)
    return tujuan


def _periksa_dan_rapikan(slot: str, path: Path) -> Path:
    """Tolak berkas yang bukan jenis aslinya, lalu rapikan. Mengembalikan path akhir."""
    akhiran = path.suffix.lower()
    nama = NAMA_SLOT[slot]
    if akhiran == ".png":
        if _awal_berkas(path, 8) != b"\x89PNG\r\n\x1a\n":
            raise HTTPException(status_code=415, detail=f"{nama}: berkas ini bukan PNG asli (hanya berganti nama).")
        va._pastikan_isi_media(path)
        va._rapikan_gambar(path)
        return path
    if akhiran == ".gif":
        if _awal_berkas(path, 6) not in (b"GIF87a", b"GIF89a"):
            raise HTTPException(status_code=415, detail=f"{nama}: berkas ini bukan GIF asli.")
        try:
            from PIL import Image

            with Image.open(path) as im:
                im.verify()
        except Exception as error:  # noqa: BLE001
            raise HTTPException(status_code=415, detail=f"{nama}: GIF ini rusak.") from error
        return path
    # Video.
    va._pastikan_isi_media(path)
    durasi = float(ve.probe(path).get("duration") or 0)
    if durasi < 0.2:
        raise HTTPException(status_code=415, detail=f"{nama}: videonya terlalu pendek atau kosong.")
    if durasi > MAKS_ANIMASI_DETIK:
        raise HTTPException(
            status_code=413,
            detail=f"{nama}: videonya {durasi:.0f} detik, maksimal {MAKS_ANIMASI_DETIK:.0f} detik.",
        )
    if akhiran == ".webm" and slot == "boom" and _alpha_webm(path):
        return _webm_ke_mov(path)
    va._rapikan_video(path)
    return path


# ============================================================
#  TEMPLATE
# ============================================================


class KotakTeks(BaseModel):
    x: int = Field(ge=0, le=LEBAR)
    y: int = Field(ge=0, le=TINGGI)
    w: int = Field(ge=20, le=LEBAR)
    h: int = Field(ge=20, le=TINGGI)


def _bersih_kategori(nilai: str) -> str:
    """Kategori ditulis kapital, spasi dirapikan (sama dengan GODAM)."""
    return " ".join(str(nilai or "").split()).upper()[:MAKS_KATEGORI]


class SimpanBody(BaseModel):
    text_box: KotakTeks | None = None
    # Kosong = tebakan otomatis di atas kotak tulisan.
    badge_box: KotakTeks | None = None
    kategori: str = Field(default="", max_length=MAKS_KATEGORI)
    rata: Literal["justify", "left", "center", "right"] = "justify"
    teks_warna: Literal["white", "black"] = "white"
    kunci_hijau: bool = False
    kosongkan: list[Literal["boom", "penutup"]] = Field(default_factory=list, max_length=2)


def _kotak_sah(kotak: KotakTeks | None) -> dict[str, int] | None:
    if kotak is None:
        return None
    if kotak.x + kotak.w > LEBAR or kotak.y + kotak.h > TINGGI:
        raise HTTPException(status_code=422, detail="Kotak tulisan keluar dari layar.")
    return kotak.model_dump()


@router.get("/ringkas")
def ringkas(pengguna: dict[str, Any] = Depends(pengguna_tvr)) -> dict[str, Any]:
    """Semua yang dibutuhkan halaman saat dibuka, dalam satu panggilan."""
    return {
        "template": _keadaan(pengguna),
        **_job_dan_antrean(pengguna),
        "batas": {
            "maks_aset_mb": va.MAX_ASSET_MB,
            "maks_gif_mb": MAKS_GIF_MB,
            "maks_sumber_mb": ve.MAX_SOURCE_UPLOAD_MB,
            "maks_animasi_detik": MAKS_ANIMASI_DETIK,
            "maks_durasi_detik": MAKS_DURASI_DETIK,
            "maks_hook": MAKS_HOOK,
            "maks_sumber_teks": MAKS_SUMBER,
            "maks_kategori": MAKS_KATEGORI,
            "jenis_slot": {k: sorted(v) for k, v in JENIS_SLOT.items()},
            "jenis_sumber": sorted(va.JENIS_VIDEO),
            "umur_simpan_jam": vt.JOB_RETENTION_HOURS,
        },
    }


@router.post("/template/draf/{slot}")
async def unggah_draf(
    slot: str,
    request: Request,
    file: UploadFile = File(...),
    pengguna: dict[str, Any] = Depends(pengguna_tvr),
) -> dict[str, Any]:
    """Terima satu bahan ke DRAF. Template yang berlaku belum berubah."""
    if slot not in JENIS_SLOT:
        raise HTTPException(status_code=404, detail="Bahan tidak dikenal.")
    akhiran = Path(file.filename or "").suffix.lower()
    if akhiran not in JENIS_SLOT[slot]:
        jenis = ", ".join(s.lstrip(".").upper() for s in sorted(JENIS_SLOT[slot]))
        wajib = " wajib" if len(JENIS_SLOT[slot]) == 1 else " harus"
        raise HTTPException(status_code=415, detail=f"{NAMA_SLOT[slot]}{wajib} {jenis}.")
    va._pastikan_kuota(pengguna)
    batas = int((MAKS_GIF_MB if akhiran == ".gif" else va.MAX_ASSET_MB) * 1_048_576)
    va._sediakan_ruang(request, batas)
    with _kunci(_akun(pengguna)):
        await run_in_threadpool(_pastikan_template, pengguna)
    draf = _folder_draf(pengguna)
    draf.mkdir(parents=True, exist_ok=True)
    # Ditulis ke nama sementara dulu: draf lama slot ini tetap utuh sampai
    # berkas baru lolos pemeriksaan.
    sementara = draf / f"_{slot}-{uuid.uuid4().hex[:8]}{akhiran}"
    try:
        await va._tulis_unggahan(
            file, sementara, batas,
            f"{NAMA_SLOT[slot]} melebihi {batas / 1_048_576:.0f} MB.",
        )
        akhir = await run_in_threadpool(_periksa_dan_rapikan, slot, sementara)
    except BaseException:
        sementara.unlink(missing_ok=True)
        sementara.with_suffix(".mov").unlink(missing_ok=True)
        raise
    finally:
        kuota.lupakan(_akun(pengguna))
    with _kunci(_akun(pengguna)):
        if not akhir.is_file():
            # Template disimpan (draf dibereskan) selagi berkas ini diunggah.
            raise HTTPException(status_code=409, detail="Template baru saja disimpan. Unggah bahan ini sekali lagi.")
        for lama in draf.glob(f"{slot}.*"):
            lama.unlink(missing_ok=True)
        akhir.replace(draf / f"{slot}{akhir.suffix.lower()}")
    return {"template": _keadaan(pengguna)}


@router.delete("/template/draf")
def buang_draf(pengguna: dict[str, Any] = Depends(pengguna_tvr)) -> dict[str, Any]:
    """Batal: semua draf dibuang, template yang berlaku tetap."""
    with _kunci(_akun(pengguna)):
        shutil.rmtree(_folder_draf(pengguna), ignore_errors=True)
    kuota.lupakan(_akun(pengguna))
    return {"template": _keadaan(pengguna)}


def _kotak_dari_teks(nilai: str) -> dict[str, int] | None:
    """"x,y,w,h" dari alamat pratinjau; None bila kosong/tidak sah."""
    try:
        x, y, w, h = (int(float(b)) for b in nilai.split(","))
        return _kotak_sah(KotakTeks(x=x, y=y, w=w, h=h))
    except Exception:  # noqa: BLE001
        return None


@router.get("/template/pratinjau.png")
def pratinjau(
    kotak: str = "",
    badge: str = "",
    kategori: str | None = None,
    rata: str = "",
    warna: str = "",
    teks: str = "",
    pengguna: dict[str, Any] = Depends(pengguna_tvr),
) -> Response:
    """Gambar template (draf + yang berlaku) beserta contoh tulisannya."""
    import io

    template = _template_gabungan(
        pengguna,
        _kotak_dari_teks(kotak) if kotak else None,
        warna if warna in ("white", "black") else None,
        _kotak_dari_teks(badge) if badge else None,
        _bersih_kategori(kategori) if kategori is not None else None,
        rata if rata in PILIHAN_RATA else None,
    )
    contoh = {
        "hook": (teks.strip() or "VIRAL! CONTOH TULISAN BERITA UNTUK MELIHAT LETAK DAN UKURANNYA")[:MAKS_HOOK],
        "sumber": "SUMBER: CONTOH",
    }
    try:
        kanvas = ve.komposit_statis(template, contoh)
    except ve.VideoError as error:
        raise va._tangani(error) from error
    buf = io.BytesIO()
    kanvas.convert("RGB").save(buf, format="PNG", optimize=True)
    return Response(content=buf.getvalue(), media_type="image/png", headers={"Cache-Control": "no-store"})


@router.post("/template/deteksi")
def deteksi(pengguna: dict[str, Any] = Depends(pengguna_tvr)) -> dict[str, Any]:
    """Tebak letak kotak tulisan dari gambar kotak monas & bingkai."""
    akun = _akun(pengguna)
    sekarang = time.time()
    if sekarang - _deteksi_terakhir.get(akun, 0) < JEDA_DETEKSI_DETIK:
        raise HTTPException(status_code=429, detail=f"Tunggu {JEDA_DETEKSI_DETIK:.0f} detik sebelum mendeteksi lagi.")
    _deteksi_terakhir[akun] = sekarang
    template = _template_gabungan(pengguna, None, None)
    try:
        kotak = ve.deteksi_kotak_teks(ve.komposit_statis(template))
    except ve.VideoError as error:
        raise va._tangani(error) from error
    if kotak is None:
        raise HTTPException(
            status_code=404,
            detail="Tidak menemukan bidang polos untuk tulisan. Tentukan sendiri dengan menyeret di gambar.",
        )
    return {"text_box": kotak}


@router.put("/template")
def simpan_template(body: SimpanBody, pengguna: dict[str, Any] = Depends(pengguna_tvr)) -> dict[str, Any]:
    """Simpan & Tetapkan: draf menggantikan berkas lama, template siap dipakai."""
    akun = _akun(pengguna)
    tid = _id_template(pengguna)
    kotak = _kotak_sah(body.text_box)
    with _kunci(akun):
        if _baca_template(pengguna) is None:
            raise HTTPException(status_code=404, detail="Unggah bahan template dulu.")
        aset, draf = _folder_aset(pengguna), _folder_draf(pengguna)
        # Periksa kelengkapan SEBELUM memindahkan apa pun: gagal di sini
        # tidak boleh meninggalkan template setengah berganti.
        akan: dict[str, Path | None] = {}
        for slot in SLOT:
            if slot in body.kosongkan:
                akan[slot] = None
            else:
                akan[slot] = _berkas_slot(draf, slot) or _berkas_slot(aset, slot)
        kurang = [NAMA_SLOT[s] for s in SLOT_WAJIB if akan[s] is None]
        if kurang:
            raise HTTPException(status_code=400, detail=f"{' dan '.join(kurang)} wajib diunggah.")
        if kotak is None:
            raise HTTPException(status_code=400, detail="Tentukan posisi tulisan dulu.")

        final: dict[str, Path | None] = {}
        for slot in SLOT:
            baru = _berkas_slot(draf, slot)
            if slot in body.kosongkan or baru is not None:
                # Berkas lama slot ini (apa pun akhirannya) beserta salinan
                # ringannya dibuang: template yang diedit MENGGANTIKAN, tidak
                # menumpuk.
                for lama in aset.glob(f"{slot}.*"):
                    lama.unlink(missing_ok=True)
                ringan = aset / ".ringan"
                if ringan.is_dir():
                    for lama in ringan.glob(f"{slot}-*"):
                        lama.unlink(missing_ok=True)
            if slot in body.kosongkan:
                if baru is not None:
                    baru.unlink(missing_ok=True)
                final[slot] = None
            elif baru is not None:
                tujuan = aset / f"{slot}{baru.suffix.lower()}"
                baru.replace(tujuan)
                final[slot] = tujuan
            else:
                final[slot] = _berkas_slot(aset, slot)
        shutil.rmtree(draf, ignore_errors=True)

        isi = _template_dari(
            pengguna, final, kotak, body.teks_warna, body.kunci_hijau,
            _kotak_sah(body.badge_box), _bersih_kategori(body.kategori), body.rata,
        )
        isi["siap"] = True
        isi["diperbarui"] = time.time()
        isi["name"] = (_baca_template(pengguna) or {}).get("name") or "TVR Saya"
        try:
            hasil = ve.save_template(isi, tid, owner=akun)
            ve.buang_aset_tak_terpakai(tid, hasil)
        except ve.VideoError as error:
            raise va._tangani(error) from error
    kuota.lupakan(akun)
    return {"template": _keadaan(pengguna)}


# ============================================================
#  VIDEO SUMBER & TULISAN
# ============================================================


@router.post("/sumber")
async def unggah_sumber(
    request: Request,
    file: UploadFile = File(...),
    pengguna: dict[str, Any] = Depends(pengguna_tvr),
) -> dict[str, Any]:
    """Video sumber dari perangkat anggota; unggahan sebelumnya dibuang bila
    tidak sedang dipakai job, supaya disk tidak menumpuk."""
    hasil = await va.unggah_sumber(request, file, pengguna)
    akun = _akun(pengguna)
    r = vt._r()
    lama = r.get(KUNCI_UNGGAHAN + akun)
    if lama and lama != hasil["url"] and not _dipakai_job_aktif(akun, lama):
        folder = ve.folder_unggahan(lama)
        if folder is not None and ve.pemilik_unggahan(lama) == akun:
            shutil.rmtree(folder, ignore_errors=True)
    r.set(KUNCI_UNGGAHAN + akun, hasil["url"], ex=UMUR_PENUNJUK)
    return hasil


class HookBody(BaseModel):
    naskah: str = Field(min_length=1, max_length=5000)


@router.post("/hook")
async def buat_hook(body: HookBody) -> dict[str, Any]:
    """Tulisan berita dari caption/naskah mentah (AI, dengan cadangan tanpa AI)."""
    hasil = await vh.buat_hook(body.naskah)
    if not hasil.get("hook"):
        raise HTTPException(status_code=400, detail="Naskahnya terlalu pendek untuk dijadikan tulisan.")
    return hasil


# ============================================================
#  JOB: SATU PER AKUN
# ============================================================


def _job_dipegang(akun: str) -> dict[str, Any] | None:
    """Job yang sedang dipegang akun ini, atau None (penunjuk basi dibuang)."""
    r = vt._r()
    job_id = r.get(KUNCI_JOB_AKUN + akun)
    if not job_id:
        return None
    try:
        status = vt.baca_status(job_id)
    except ve.VideoError:
        r.delete(KUNCI_JOB_AKUN + akun)
        return None
    if str(status.get("owner") or "") != akun:
        r.delete(KUNCI_JOB_AKUN + akun)
        return None
    return vt.segarkan_kalau_terlantar(status)


def _dipakai_job_aktif(akun: str, url: str) -> bool:
    job = _job_dipegang(akun)
    return bool(job and job.get("status") in vt.STATUS_AKTIF_JOB and job.get("sumber_url") == url)


def _ringkas_job(status: dict[str, Any]) -> dict[str, Any]:
    kunci = ("job_id", "status", "progress", "message", "error", "durasi", "size",
             "created", "sumber_url", "texts")
    return {k: status.get(k) for k in kunci}


def _job_dan_antrean(pengguna: dict[str, Any]) -> dict[str, Any]:
    job = _job_dipegang(_akun(pengguna))
    if job is None:
        return {"job": None, "antrean": None}
    antrean = vt.posisi_antrean(job["job_id"]) if job.get("status") in vt.STATUS_AKTIF_JOB else None
    return {"job": _ringkas_job(job), "antrean": antrean}


class JobBody(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    hook: str = Field(max_length=MAKS_HOOK)
    sumber: str = Field(default="", max_length=MAKS_SUMBER)

    @field_validator("hook")
    @classmethod
    def _hook_isi(cls, nilai: str) -> str:
        nilai = " ".join(nilai.split())
        if not nilai:
            raise ValueError("Tulisan beritanya kosong.")
        return nilai


@router.post("/jobs")
def kirim_job(body: JobBody, pengguna: dict[str, Any] = Depends(pengguna_tvr)) -> dict[str, Any]:
    akun = _akun(pengguna)
    tid = _id_template(pengguna)
    with _kunci(akun):
        template = _baca_template(pengguna)
        if not template or not template.get("siap"):
            raise HTTPException(status_code=409, detail="Buat dan tetapkan template dulu.")
        for layer in template.get("overlays") or []:
            if layer.get("file"):
                try:
                    ve._aset(template, layer["file"])
                except ve.VideoError as error:
                    raise HTTPException(
                        status_code=409, detail="Bahan template ada yang hilang. Unggah ulang lewat Edit Template."
                    ) from error
        lama = _job_dipegang(akun)
        if lama is not None:
            st = lama.get("status")
            if st in vt.STATUS_AKTIF_JOB:
                raise HTTPException(status_code=409, detail="Videomu sebelumnya masih diproses. Tunggu sampai selesai.")
            if st == "done":
                raise HTTPException(
                    status_code=409,
                    detail="Videomu sebelumnya sudah jadi. Unggah ke sosmed atau edit ulang dulu.",
                )
            # Gagal/dibatalkan: dibuang, diganti yang baru.
            vt.buang_job(lama["job_id"])
        url = va._sumber_sah(body.url, pengguna)
        va._pastikan_kuota(pengguna)
        va._pastikan_antrean_muat(1, pengguna)
        texts = {"hook": body.hook, "sumber": " ".join(body.sumber.split())}
        job_id = vt.buat_job(url, tid, texts, owner=akun)
        vt._r().set(KUNCI_JOB_AKUN + akun, job_id, ex=UMUR_PENUNJUK)
        vt.render_video.delay(job_id, url, tid, texts)
    return _job_dan_antrean(pengguna)


@router.get("/jobs/saya")
def job_saya(pengguna: dict[str, Any] = Depends(pengguna_tvr)) -> dict[str, Any]:
    """Dipantau halaman tiap beberapa detik: status + nomor antrean terkini."""
    return _job_dan_antrean(pengguna)


@router.get("/jobs/saya/berkas")
def berkas_job_saya(pengguna: dict[str, Any] = Depends(pengguna_tvr)) -> FileResponse:
    job = _job_dipegang(_akun(pengguna))
    if job is None or job.get("status") != "done" or not job.get("output"):
        raise HTTPException(status_code=409, detail="Videonya belum jadi.")
    berkas = vt.job_path(job["job_id"]) / ve._aman(str(job["output"]))
    if not berkas.is_file():
        raise HTTPException(status_code=404, detail="Berkas hasil sudah tidak ada (lewat masa simpan). Edit ulang.")
    return FileResponse(berkas, media_type="video/mp4", filename=f"tvr-edit-{job['job_id']}.mp4")


@router.delete("/jobs/saya")
def lepas_job_saya(hapus_sumber: bool = False, pengguna: dict[str, Any] = Depends(pengguna_tvr)) -> dict[str, Any]:
    """Edit ulang / batal / sesudah diunggah: hasil dihapus, antrean kembali kosong.

    ``hapus_sumber`` ikut membuang video unggahan sumbernya (setelah videonya
    diunggah ke sosmed). Tanpa itu sumbernya disimpan supaya bisa diedit ulang
    tanpa mengunggah lagi.
    """
    akun = _akun(pengguna)
    r = vt._r()
    with _kunci(akun):
        job = _job_dipegang(akun)
        r.delete(KUNCI_JOB_AKUN + akun)
        sumber = str((job or {}).get("sumber_url") or "")
        if job is not None:
            st = job.get("status")
            if st in vt.STATUS_BERJALAN_JOB:
                # Sedang dikerjakan worker: diminta berhenti. Catatannya
                # dibiarkan supaya worker masih bisa membaca permintaan itu;
                # berkasnya dibersihkan worker/penyapu.
                vt.minta_batal(job["job_id"])
                vt.tulis_status(job["job_id"], log="Dibatalkan pemiliknya.")
            else:
                if st == "queued":
                    va._cabut_tugas(job)
                vt.buang_job(job["job_id"])
        if hapus_sumber:
            if not sumber:
                sumber = str(r.get(KUNCI_UNGGAHAN + akun) or "")
            folder = ve.folder_unggahan(sumber)
            if folder is not None and ve.pemilik_unggahan(sumber) == akun:
                shutil.rmtree(folder, ignore_errors=True)
            if r.get(KUNCI_UNGGAHAN + akun) == sumber:
                r.delete(KUNCI_UNGGAHAN + akun)
    kuota.lupakan(akun)
    return {"ok": True}
