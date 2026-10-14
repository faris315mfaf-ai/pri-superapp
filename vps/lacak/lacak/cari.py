"""Pencarian kandidat video asli di internet: akun dari watermark, YouTube (yt-dlp), dan web (SearXNG).

Hanya mengumpulkan link + metadata ringan. Pemeriksaan isi (gambar/suara) ada di pekerja.
"""

from __future__ import annotations

import json
import re
import subprocess
from urllib.parse import urlparse, urlunparse

from . import konfig

# Link yang menunjuk SATU video di platform utama.
_POLA_VIDEO = [
    ("TikTok", re.compile(r"^https?://(?:www\.|m\.)?tiktok\.com/@[^/]+/(?:video|photo)/(\d+)", re.I)),
    ("TikTok", re.compile(r"^https?://(?:vm|vt)\.tiktok\.com/([A-Za-z0-9]+)", re.I)),
    ("Instagram", re.compile(r"^https?://(?:www\.)?instagram\.com/(?:[^/]+/)?(?:reel|reels|p|tv)/([A-Za-z0-9_-]+)", re.I)),
    ("YouTube", re.compile(r"^https?://(?:www\.|m\.)?youtube\.com/(?:shorts/|watch\?v=|live/)([A-Za-z0-9_-]{11})", re.I)),
    ("YouTube", re.compile(r"^https?://youtu\.be/([A-Za-z0-9_-]{11})", re.I)),
    ("Facebook", re.compile(r"^https?://(?:www\.|m\.|web\.)?facebook\.com/(?:reel/|watch/?\?v=|[^/]+/videos/(?:[^/]+/)?)(\d+)", re.I)),
    ("Facebook", re.compile(r"^https?://fb\.watch/([A-Za-z0-9_-]+)", re.I)),
    ("X", re.compile(r"^https?://(?:www\.)?(?:twitter|x)\.com/[^/]+/status/(\d+)", re.I)),
]


def kunci_video(url: str) -> str | None:
    """'TikTok:7425519034128' dsb. None = bukan link satu video yang dikenali."""
    for platform, pola in _POLA_VIDEO:
        m = pola.match((url or "").strip())
        if m:
            return f"{platform}:{m.group(1)}"
    return None


def rapikan_url(url: str) -> str:
    p = urlparse(url.strip())
    if "youtube.com" in (p.hostname or "") and p.path == "/watch":
        return urlunparse(p._replace(fragment=""))
    return urlunparse(p._replace(query="", fragment=""))


def _ytdlp_json(args: list[str], batas: int = 60) -> dict | None:
    try:
        from .media import ytdlp_dasar

        r = subprocess.run([*ytdlp_dasar(), *args], capture_output=True, text=True, timeout=batas)
    except subprocess.TimeoutExpired:
        return None
    if r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return None


def _entri(data: dict | None, lewat: str) -> list[dict]:
    hasil: list[dict] = []
    for e in (data or {}).get("entries") or []:
        if not isinstance(e, dict):
            continue
        url = str(e.get("url") or e.get("webpage_url") or "")
        if url and not url.startswith("http"):
            # YouTube flat: url = id
            if re.fullmatch(r"[A-Za-z0-9_-]{11}", url):
                url = f"https://www.youtube.com/watch?v={url}"
            else:
                continue
        if not url or not kunci_video(url):
            continue
        hasil.append(
            {
                "url": rapikan_url(url),
                "judul": str(e.get("title") or ""),
                "durasi": float(e.get("duration") or 0) or None,
                "epoch": float(e["timestamp"]) if isinstance(e.get("timestamp"), (int, float)) else None,
                "akun": str(e.get("uploader_id") or e.get("channel") or e.get("uploader") or ""),
                "gambar": _sampul(e),
                "lewat": lewat,
            }
        )
    return hasil


def _sampul(e: dict) -> str:
    if e.get("thumbnail"):
        return str(e["thumbnail"])
    th = e.get("thumbnails") or []
    if isinstance(th, list) and th:
        terakhir = th[-1]
        if isinstance(terakhir, dict) and terakhir.get("url"):
            return str(terakhir["url"])
    return ""


def url_profil(handle: str, platform: str) -> str:
    h = handle.strip().lstrip("@")
    return {
        "TikTok": f"https://www.tiktok.com/@{h}",
        "YouTube": f"https://www.youtube.com/@{h}/shorts",
        "Instagram": f"https://www.instagram.com/{h}/",
        "Facebook": f"https://www.facebook.com/{h}/videos",
    }.get(platform, "")


def dari_akun(handle: str, platform: str, batas: int = 30) -> list[dict]:
    """Video terbaru satu akun (daftar ringan, tanpa unduh)."""
    url = url_profil(handle, platform)
    if not url:
        return []
    return _entri(_ytdlp_json(["--flat-playlist", "-J", "--playlist-end", str(batas), url], 90), "akun")


def daftar_profil(url: str, batas: int) -> list[dict]:
    """Untuk panen koleksi: daftar video dari link profil apa pun yang didukung yt-dlp."""
    return _entri(_ytdlp_json(["--flat-playlist", "-J", "--playlist-end", str(batas), url], 120), "koleksi")


def dari_youtube(kata: list[str], batas: int = 10) -> list[dict]:
    if not kata or not konfig.YOUTUBE:
        return []
    q = " ".join(kata[:5])
    return _entri(_ytdlp_json(["--flat-playlist", "-J", f"ytsearch{batas}:{q}"], 60), "youtube")


def dari_web(kata: list[str], batas_per_situs: int = 6) -> list[dict]:
    """SearXNG: kata kunci dibatasi ke situs video (TikTok, Instagram, Facebook, YouTube)."""
    if not kata or not konfig.SEARXNG_URL:
        return []
    import httpx

    q = " ".join(kata[:5])
    hasil: list[dict] = []
    dilihat: set[str] = set()
    situs_dicari = ("tiktok.com", "instagram.com", "facebook.com") + (("youtube.com",) if konfig.YOUTUBE else ())
    with httpx.Client(timeout=20) as c:
        for situs in situs_dicari:
            try:
                r = c.get(f"{konfig.SEARXNG_URL}/search", params={"q": f"{q} site:{situs}", "format": "json", "language": "id"})
                if r.status_code != 200:
                    continue
                n = 0
                for x in r.json().get("results") or []:
                    url = str(x.get("url") or "")
                    k = kunci_video(url)
                    if not k or k in dilihat:
                        continue
                    dilihat.add(k)
                    hasil.append(
                        {"url": rapikan_url(url), "judul": str(x.get("title") or ""), "durasi": None, "epoch": None, "akun": "", "gambar": str(x.get("thumbnail") or x.get("img_src") or ""), "lewat": "web"}
                    )
                    n += 1
                    if n >= batas_per_situs:
                        break
            except Exception as e:  # noqa: BLE001 — satu situs gagal tidak menghentikan yang lain
                print(f"[lacak] SearXNG {situs}: {e}", flush=True)
    return hasil


def sehat_searxng() -> bool:
    if not konfig.SEARXNG_URL:
        return False
    import httpx

    try:
        return httpx.get(f"{konfig.SEARXNG_URL}/healthz", timeout=5).status_code == 200
    except Exception:  # noqa: BLE001
        return False


def gabung(*daftar: list[dict], kecuali: set[str] | None = None) -> list[dict]:
    """Satukan, buang duplikat (kunci video), pertahankan urutan sumber pertama."""
    dilihat = set(kecuali or set())
    hasil: list[dict] = []
    for d in daftar:
        for x in d:
            k = kunci_video(x["url"]) or rapikan_url(x["url"])
            if k in dilihat:
                continue
            dilihat.add(k)
            hasil.append(x)
    return hasil
