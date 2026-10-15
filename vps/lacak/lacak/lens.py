"""Cari balik gambar lewat Google Lens (SerpApi) untuk menemukan KANDIDAT video asli.

Lens hanya MENEMUKAN kandidat; yang memutuskan tetap pencocokan isi (SSCD/PDQ/suara/skor) di pekerja.
Murah dan opsional: tanpa kunci SerpApi, atau kuota habis, atau gagal -> daftar kosong + catatan, tidak
pernah menggagalkan pelacakan.

Alur per frame: JPEG <= 480 KB -> POST /image (image_id, berlaku 10 menit; tanpa URL publik) ->
GET /search?engine=google_lens&type=visual_matches -> saring hanya link SATU video platform utama.
1 frame = 1 pencarian. Kuota: batas lokal (LACAK_LENS_KUOTA, bawaan 90 dari paket gratis ±100) DAN sisa
nyata dari /account SerpApi (gratis, tidak menghitung pencarian) bila terbaca.
"""

from __future__ import annotations

import io
import time
from pathlib import Path

from . import cari, konfig, simpan

SERPAPI = "https://serpapi.com"
MAKS_BYTE = 480_000  # batas unggah Image API 500 KB, dengan margin
MAKS_PER_FRAME = 10


def kunci_ada() -> bool:
    return bool(konfig.serpapi_kunci())


def bulan_ini() -> str:
    return time.strftime("%Y-%m")


def terpakai() -> int:
    return simpan.lens_terpakai(bulan_ini())


def kuota() -> int:
    """Kuota yang ditampilkan: 0 bila kunci belum dipasang (UI: 'belum dipasang')."""
    return konfig.LENS_KUOTA if kunci_ada() else 0


def sisa_lokal() -> int:
    return max(0, konfig.LENS_KUOTA - terpakai())


def siapkan_jpeg(jalur: str | Path, maks_byte: int = MAKS_BYTE) -> bytes:
    """Frame -> JPEG kecil (sisi terpanjang <= 640, kualitas diturunkan sampai muat)."""
    from PIL import Image

    with Image.open(str(jalur)) as im:
        im = im.convert("RGB")
        im.thumbnail((640, 640))
        for q in (85, 75, 65, 55, 45, 35):
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=q, optimize=True)
            if buf.tell() <= maks_byte:
                return buf.getvalue()
        im.thumbnail((320, 320))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=40, optimize=True)
        return buf.getvalue()


def pilih_frame(frame: list, n: int) -> list:
    """n frame merata di bagian tengah (awal/akhir sering hitam atau judul), selalu n yang BERBEDA bila bisa."""
    if not frame:
        return []
    if len(frame) <= n:
        return list(frame)
    kolam = list(range(1, len(frame) - 1)) if len(frame) >= n + 2 else list(range(len(frame)))
    dipakai: list[int] = []
    for i in range(n):
        k = round((len(kolam) - 1) * (i + 1) / (n + 1))
        while kolam[k] in dipakai:  # tabrakan akibat pembulatan: geser ke frame berikutnya yang belum dipakai
            k = (k + 1) % len(kolam)
        dipakai.append(kolam[k])
    return [frame[i] for i in sorted(dipakai)]


def kandidat_dari_hasil(data: dict) -> list[dict]:
    """visual_matches -> kandidat (hanya link satu video platform yang dikenali, tanpa duplikat)."""
    hasil: list[dict] = []
    dilihat: set[str] = set()
    for x in data.get("visual_matches") or []:
        if not isinstance(x, dict):
            continue
        url = str(x.get("link") or "")
        k = cari.kunci_video(url)
        if not k or k in dilihat:
            continue
        dilihat.add(k)
        hasil.append(
            {
                "url": cari.rapikan_url(url),
                "judul": str(x.get("title") or ""),
                "durasi": None,
                "epoch": None,
                "akun": "",
                "gambar": str(x.get("thumbnail") or x.get("image") or ""),
                "lewat": "lens",
            }
        )
        if len(hasil) >= MAKS_PER_FRAME:
            break
    return hasil


class _Habis(Exception):
    """Kuota/kunci bermasalah: hentikan semua pencarian Lens untuk job ini."""


def _periksa_http(r, apa: str) -> None:
    if r.status_code in (401, 403):
        raise _Habis("kunci SerpApi ditolak")
    if r.status_code == 429:
        raise _Habis("kuota SerpApi habis")
    if r.status_code != 200:
        raise RuntimeError(f"{apa}: HTTP {r.status_code}")


def sisa_serpapi(klien) -> int | None:
    """Sisa pencarian nyata dari akun SerpApi (endpoint /account gratis). None = tak terbaca."""
    try:
        r = klien.get(f"{SERPAPI}/account", params={"api_key": konfig.serpapi_kunci()}, timeout=15)
        if r.status_code != 200:
            return None
        j = r.json()
        v = j.get("total_searches_left")
        if v is None:
            v = j.get("plan_searches_left")
        return int(v) if v is not None else None
    except Exception:  # noqa: BLE001
        return None


def _unggah(klien, data: bytes) -> str:
    r = klien.post(
        f"{SERPAPI}/image",
        data={"api_key": konfig.serpapi_kunci()},
        files={"image": ("frame.jpg", data, "image/jpeg")},
        timeout=45,
    )
    _periksa_http(r, "unggah gambar")
    j = r.json()
    if j.get("error"):
        raise RuntimeError(f"unggah gambar: {str(j['error'])[:120]}")
    image_id = str(j.get("image_id") or "")
    if not image_id:
        raise RuntimeError("unggah gambar: tanpa image_id")
    return image_id


def _cari(klien, image_id: str) -> dict:
    r = klien.get(
        f"{SERPAPI}/search",
        params={
            "engine": "google_lens",
            "image_id": image_id,
            "type": "visual_matches",
            "hl": "id",
            "country": konfig.LENS_NEGARA,
            "api_key": konfig.serpapi_kunci(),
        },
        timeout=60,
    )
    _periksa_http(r, "pencarian Lens")
    j = r.json()
    if j.get("error") and not j.get("visual_matches"):
        # "Google hasn't returned any results" dsb.: pencarian sah tanpa hasil, bukan kegagalan.
        return {}
    return j


def tersedia(atur: dict) -> tuple[bool, str]:
    if not atur.get("cari_lens"):
        return False, "dimatikan"
    if not kunci_ada():
        return False, "kunci SerpApi belum dipasang"
    if sisa_lokal() < 1:
        return False, "kuota bulan ini habis"
    return True, ""


def dari_frame(frame: list, atur: dict, butuh: bool = True) -> tuple[list[dict], str]:
    """Kandidat dari Lens untuk satu video + catatan singkat untuk tahap 'cari'. TIDAK melempar."""
    ok, alasan = tersedia(atur)
    if not ok:
        return [], f"Lens {alasan}"
    if not butuh and not konfig.LENS_SELALU:
        return [], "Lens dilewati (sumber lain sudah ada)"
    try:
        import httpx

        pakai = pilih_frame(list(frame), konfig.LENS_FRAME)
        hasil: list[dict] = []
        n_cari = 0
        with httpx.Client() as c:
            sisa = sisa_serpapi(c)
            batas = sisa_lokal() if sisa is None else min(sisa_lokal(), sisa)
            if batas < 1:
                return [], "Lens: kuota SerpApi habis"
            for f in pakai[:batas]:
                try:
                    image_id = _unggah(c, siapkan_jpeg(f))
                    j = _cari(c, image_id)
                except _Habis as e:
                    return cari.gabung(hasil), f"Lens berhenti: {e}"
                except Exception as e:  # noqa: BLE001 — satu frame gagal, lanjut frame berikutnya
                    print(f"[lacak] Lens gagal untuk satu frame: {e}", flush=True)
                    continue
                n_cari += 1
                simpan.lens_tambah(bulan_ini(), 1)
                hasil += kandidat_dari_hasil(j)
        gabung = cari.gabung(hasil)
        return gabung, f"Lens {len(gabung)} kandidat dari {n_cari} pencarian"
    except Exception as e:  # noqa: BLE001
        print(f"[lacak] Lens gagal: {e}", flush=True)
        return [], "Lens gagal"
