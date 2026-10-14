"""Akses media: metadata & unduh lewat yt-dlp, frame kunci (PySceneDetect + sebaran rata), audio, sidik suara."""

from __future__ import annotations

import ipaddress
import json
import socket
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import numpy as np

from . import konfig


class GalatLacak(Exception):
    """Galat yang pesannya boleh dibaca pengguna."""


def url_sah(url: str) -> str:
    """Hanya http(s) ke host publik. Alamat IP privat/lokal ditolak (SSRF)."""
    u = (url or "").strip()
    if len(u) > 2000:
        raise GalatLacak("Link terlalu panjang.")
    p = urlparse(u)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise GalatLacak("Link harus diawali http:// atau https://.")
    host = p.hostname.lower().rstrip(".")
    # Nama tanpa titik (layanan internal "lacak-qdrant", bentuk angka "2130706433") dan nama lokal ditolak.
    if "." not in host or host in ("localhost",) or host.endswith((".local", ".internal", ".localhost")):
        raise GalatLacak("Link ini tidak bisa dipakai.")
    try:
        alamat = {ai[4][0] for ai in socket.getaddrinfo(host, p.port or (443 if p.scheme == "https" else 80), proto=socket.IPPROTO_TCP)}
    except (socket.gaierror, UnicodeError, ValueError) as e:
        raise GalatLacak("Alamat link tidak ditemukan.") from e
    for a in alamat:
        try:
            if not ipaddress.ip_address(a.split("%")[0]).is_global:
                raise GalatLacak("Link ini tidak bisa dipakai.")
        except ValueError as e:
            raise GalatLacak("Link ini tidak bisa dipakai.") from e
    return u


def _jalankan(args: list[str], batas: int, teks: bool = True) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(args, capture_output=True, text=teks, timeout=batas)
    except subprocess.TimeoutExpired as e:
        raise GalatLacak(f"Waktu habis menjalankan {Path(args[0]).name}.") from e


def ytdlp_dasar() -> list[str]:
    """Perintah yt-dlp + opsi bersama (cookies bila dipasang dan berkasnya ada)."""
    from pathlib import Path as _P

    args = [konfig.YTDLP, "--no-warnings", "--socket-timeout", "20"]
    if konfig.COOKIES and _P(konfig.COOKIES).is_file():
        args += ["--cookies", konfig.COOKIES]
    return args


def _pesan_ytdlp(stderr: str) -> str:
    s = (stderr or "").lower()
    if "not a bot" in s:
        return "YouTube menolak server (minta verifikasi bukan bot). Link YouTube belum bisa dilacak dari server."
    if "private" in s or "login" in s or "cookies" in s or "sign in" in s:
        return "Video tidak bisa dibuka tanpa login (akun pribadi atau dibatasi)."
    if "not available" in s or "unavailable" in s or "removed" in s or "404" in s:
        return "Video sudah dihapus atau tidak tersedia."
    if "unsupported url" in s:
        return "Situs ini belum didukung."
    return "Video tidak bisa dibaca dari link ini."


def info_video(url: str, batas: int = 60) -> dict:
    """Metadata yt-dlp (-J). Galat -> GalatLacak dengan pesan ramah."""
    r = _jalankan([*ytdlp_dasar(), "-J", "--no-playlist", url], batas)
    if r.returncode != 0:
        raise GalatLacak(_pesan_ytdlp(r.stderr))
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError as e:
        raise GalatLacak("Jawaban yt-dlp tidak terbaca.") from e


def epoch_dari_info(info: dict) -> float | None:
    ts = info.get("timestamp") or info.get("release_timestamp")
    if isinstance(ts, (int, float)) and ts > 0:
        return float(ts)
    tgl = str(info.get("upload_date") or info.get("release_date") or "")
    if len(tgl) == 8 and tgl.isdigit():
        return datetime.strptime(tgl, "%Y%m%d").replace(tzinfo=timezone.utc).timestamp()
    return None


def iso(epoch: float | None) -> str:
    if epoch is None:
        return ""
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def platform_dari(info: dict, url: str = "") -> str:
    kunci = str(info.get("extractor_key") or info.get("extractor") or "").lower()
    host = (urlparse(url or str(info.get("webpage_url") or "")).hostname or "").lower()
    for nama, cocok in (
        ("TikTok", ("tiktok",)),
        ("Instagram", ("instagram",)),
        ("YouTube", ("youtube", "youtu.be")),
        ("Facebook", ("facebook", "fb.watch")),
        ("X", ("twitter", "x.com")),
    ):
        if any(c in kunci or c in host for c in cocok):
            return nama
    return kunci.capitalize() if kunci else (host or "Web")


def akun_dari(info: dict) -> str:
    """Nama akun untuk kredit: @handle bila ada (TikTok/IG/YouTube), selain itu nama kanal."""
    for k in ("uploader_id", "channel_handle"):
        v = str(info.get(k) or "").strip()
        if v and not v.isdigit() and not v.startswith("UC"):
            return v if v.startswith("@") else "@" + v
    for k in ("channel", "uploader", "creator"):
        v = str(info.get(k) or "").strip()
        if v:
            return v
    return ""


def identitas_akun(info: dict) -> list[str]:
    """Semua nama yang mungkin menunjuk pemilik video (untuk dicocokkan dengan watermark)."""
    hasil = []
    for k in ("uploader_id", "channel_handle", "uploader", "channel", "creator", "uploader_url", "channel_url"):
        v = str(info.get(k) or "").strip()
        if not v:
            continue
        if k.endswith("_url"):
            v = v.rstrip("/").rsplit("/", 1)[-1]
        hasil.append(v)
    return hasil


def video_info(info: dict, url: str) -> dict:
    """Bentuk VideoInfo (lib/lacak-tipe.ts)."""
    return {
        "url": str(info.get("webpage_url") or url),
        "judul": str(info.get("title") or info.get("description") or "")[:300],
        "akun": akun_dari(info),
        "platform": platform_dari(info, url),
        "diunggah": iso(epoch_dari_info(info)),
        "durasi": float(info.get("duration") or 0.0),
        "lebar": int(info.get("width") or 0),
        "tinggi": int(info.get("height") or 0),
        "gambar": str(info.get("thumbnail") or ""),
    }


def unduh(url: str, folder: Path, maks_detik: int, durasi: float | None = None, batas: int = 240) -> Path:
    """Unduh versi kecil (<= 480p), paling banyak `maks_detik` pertama. Hasil: folder/video.<ext>."""
    folder.mkdir(parents=True, exist_ok=True)
    keluar = str(folder / "video.%(ext)s")
    args = [
        *ytdlp_dasar(),
        "--no-playlist",
        "-f",
        "b[height<=480]/bv*[height<=480]+ba/w/b",
        "--max-filesize",
        "200M",
        "-o",
        keluar,
        "--merge-output-format",
        "mp4",
    ]
    if durasi is None or durasi > maks_detik + 1:
        args += ["--download-sections", f"*0-{maks_detik}", "--force-keyframes-at-cuts"]
    args.append(url)
    r = _jalankan(args, batas)
    hasil = sorted(p for p in folder.glob("video.*") if p.suffix not in (".part", ".ytdl"))
    if r.returncode != 0 or not hasil:
        raise GalatLacak(_pesan_ytdlp(r.stderr))
    return hasil[0]


def durasi_berkas(berkas: Path) -> float:
    r = _jalankan([konfig.FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(berkas)], 30)
    try:
        return float((r.stdout or "0").strip() or 0)
    except ValueError:
        return 0.0


def ukuran_berkas(berkas: Path) -> tuple[int, int]:
    r = _jalankan(
        [konfig.FFPROBE, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(berkas)],
        30,
    )
    try:
        w, h = (r.stdout or "").strip().split(",")[:2]
        return int(w), int(h)
    except ValueError:
        return 0, 0


def waktu_adegan(berkas: Path, durasi: float, maks: int) -> list[float]:
    """Detik frame kunci: tengah tiap adegan (PySceneDetect) + sebaran rata, digabung, <= maks."""
    titik: list[float] = []
    try:
        from scenedetect import ContentDetector, detect

        for awal, akhir in detect(str(berkas), ContentDetector(), show_progress=False):
            a, b = awal.get_seconds(), akhir.get_seconds()
            if b - a >= 0.5:
                titik.append((a + b) / 2)
    except Exception as e:  # noqa: BLE001 — pemotong adegan gagal: cukup sebaran rata
        print(f"[lacak] deteksi adegan gagal: {e}", flush=True)
    if durasi > 0:
        langkah = max(1.5, durasi / maks)
        t = langkah / 2
        while t < durasi:
            titik.append(t)
            t += langkah
    titik = sorted(x for x in titik if 0 <= x < max(durasi - 0.2, 0.2))
    rapi: list[float] = []
    for x in titik:
        if not rapi or x - rapi[-1] >= 1.0:
            rapi.append(round(x, 2))
    if len(rapi) > maks:
        idx = np.linspace(0, len(rapi) - 1, maks).round().astype(int)
        rapi = [rapi[i] for i in sorted(set(idx.tolist()))]
    return rapi


def waktu_rata(durasi: float, jarak: float, maks: int) -> list[float]:
    if durasi <= 0:
        return [0.0]
    n = min(maks, max(1, int(durasi // jarak)))
    langkah = durasi / n
    return [round(langkah * (i + 0.5), 2) for i in range(n)]


def ambil_frame(berkas: Path, waktu: list[float], folder: Path, tinggi: int = 480) -> list[Path]:
    """Satu PNG per detik `waktu` (seek cepat). Frame yang gagal dilewati (daftar bisa lebih pendek)."""
    folder.mkdir(parents=True, exist_ok=True)
    hasil: list[Path] = []
    for i, t in enumerate(waktu):
        p = folder / f"f{i:03d}.png"
        r = _jalankan(
            [konfig.FFMPEG, "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", str(berkas), "-frames:v", "1", "-vf", f"scale=-2:{tinggi}", str(p)],
            60,
        )
        if r.returncode == 0 and p.exists() and p.stat().st_size > 0:
            hasil.append(p)
        else:
            hasil.append(Path(""))
    return hasil


def audio_16k(berkas: Path, maks_detik: int = 90) -> np.ndarray | None:
    r = _jalankan(
        [konfig.FFMPEG, "-v", "error", "-i", str(berkas), "-t", str(maks_detik), "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
        120,
        teks=False,
    )
    if r.returncode != 0 or not r.stdout:
        return None
    return np.frombuffer(r.stdout, dtype=np.float32).copy()


def sidik_suara(berkas: Path, maks_detik: int) -> np.ndarray | None:
    r = _jalankan([konfig.FPCALC, "-raw", "-json", "-length", str(maks_detik), str(berkas)], 120)
    # fpcalc 1.5 (Debian) keluar dengan kode 3 + "Error decoding audio frame (End of file)" di akhir berkas
    # walau sidiknya utuh: yang menentukan adalah JSON-nya, bukan kode keluar.
    try:
        data = json.loads(r.stdout or "")
    except json.JSONDecodeError:
        return None
    fp = data.get("fingerprint") if isinstance(data, dict) else None
    if not isinstance(fp, list):
        return None
    if len(fp) < 40:
        return None
    return np.array(fp, dtype=np.int64).astype(np.uint32)


def unduh_gambar(url: str, tujuan: Path, batas: int = 20) -> Path | None:
    """Sampul kandidat (untuk saringan cepat). Gagal = None."""
    if not url:
        return None
    try:
        url_sah(url)
    except GalatLacak:
        return None
    import httpx

    try:
        # Pengalihan diikuti manual (maks 3) supaya SETIAP lompatan diperiksa url_sah.
        with httpx.Client(timeout=batas, follow_redirects=False, headers={"User-Agent": "Mozilla/5.0"}) as c:
            r = c.get(url)
            for _ in range(3):
                if r.status_code not in (301, 302, 303, 307, 308) or "location" not in r.headers:
                    break
                berikut = str(httpx.URL(str(r.url)).join(r.headers["location"]))
                url_sah(berikut)
                r = c.get(berikut)
        if r.status_code != 200 or len(r.content) < 200 or len(r.content) > 8_000_000:
            return None
        tujuan.parent.mkdir(parents=True, exist_ok=True)
        tujuan.write_bytes(r.content)
        return tujuan
    except Exception:  # noqa: BLE001
        return None
