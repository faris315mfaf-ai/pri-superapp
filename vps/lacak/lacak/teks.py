"""Petunjuk teks: watermark/username (OCR), kata kunci (judul + teks layar + ucapan), dan ucapan (whisper).

Bagian MURNI (ekstrak_handle, kata_kunci) diuji tanpa model. Model OCR & whisper dimuat malas sekali per proses.
"""

from __future__ import annotations

import re
import threading
from collections import Counter

from . import konfig

# --------------------------------------------------------------------- watermark

_POLA_HANDLE = re.compile(r"@\s?([A-Za-z0-9][A-Za-z0-9._]{1,29})")
# Kata yang sering terbaca OCR tetapi bukan akun.
_BUKAN_HANDLE = {"gmail.com", "yahoo.com", "here", "everyone", "admin"}


def ekstrak_handle(teks_per_frame: list[list[tuple[str, float]]]) -> list[dict]:
    """[[(teks, yakin), ...] per frame] -> [{handle, frame, total, yakin}] urut paling sering.

    `frame` = berapa frame memuat handle itu; `total` = jumlah frame yang dibaca.
    """
    total = len(teks_per_frame)
    hitung: Counter[str] = Counter()
    yakin: dict[str, list[float]] = {}
    for frame in teks_per_frame:
        dilihat: set[str] = set()
        for teks, skor in frame:
            for m in _POLA_HANDLE.finditer(teks or ""):
                h = m.group(1).rstrip("._").lower()
                if len(h) < 3 or h in _BUKAN_HANDLE or h in dilihat:
                    continue
                dilihat.add(h)
                hitung[h] += 1
                yakin.setdefault(h, []).append(float(skor))
    # Varian salah baca OCR (@kabarpesisir.ty) digabung ke handle yang paling sering terbaca.
    from difflib import SequenceMatcher

    gugus: list[tuple[str, int, list[float]]] = []
    for h, n in hitung.most_common():
        for i, (utama, m, ys) in enumerate(gugus):
            if SequenceMatcher(None, h, utama).ratio() >= 0.85:
                gugus[i] = (utama, m + n, ys + yakin[h])
                break
        else:
            gugus.append((h, n, list(yakin[h])))
    hasil = [
        {"handle": "@" + h, "frame": min(n, total), "total": total, "yakin": round(sum(ys) / len(ys), 3)}
        for h, n, ys in sorted(gugus, key=lambda g: -g[1])
    ]
    return hasil[:5]


# --------------------------------------------------------------------- kata kunci

_STOP = set(
    """
    yang dan di ke dari untuk dengan pada ini itu adalah akan sudah telah juga atau karena saat oleh dalam
    tidak tak bukan ada bisa dapat harus masih lagi pun para kami kita saya aku anda dia mereka kamu nya
    sebuah seorang satu dua tiga sangat lebih paling sekali hingga sampai agar supaya bahwa jika kalau ketika
    namun tetapi tapi serta maupun sejak setelah sebelum selama tersebut begitu sini sana situ apa siapa
    mana bagaimana kapan mengapa kenapa ya yah sih dong kok deh nih tuh lho wah oh eh hai halo terus jadi
    baru mau ingin bikin buat kata banyak semua setiap beberapa lain secara bagi tentang antara atas bawah
    the a an and or of to in on for with is are was were be this that it at by from as viral fyp foryou
    foryoupage trending video videos shorts reels reel tiktok instagram youtube facebook berita news terkini
    terbaru hari selamat pagi siang sore malam
    """.split()
)
_KATA = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


def _token(teks: str) -> list[str]:
    teks = re.sub(r"https?://\S+", " ", (teks or "").lower())
    teks = re.sub(r"[@#]\S+", " ", teks)
    # Semua kata dipertahankan (kata pendek/angka memutus frasa); penyaringan di _kata_bermakna.
    return _KATA.findall(teks)


def _bermakna(t: str) -> bool:
    return len(t) >= 3 and not t.isdigit() and t not in _STOP


def kata_kunci(
    judul: str = "",
    deskripsi: str = "",
    teks_layar: list[str] | None = None,
    transkrip: str = "",
    maks: int = 6,
) -> list[str]:
    """Kata kunci pencarian. Frasa dua kata yang muncul di >= 2 sumber didahulukan (tanpa tumpang tindih),
    lalu kata tunggal terpenting. Judul & teks layar berbobot 2, deskripsi & ucapan berbobot 1."""
    sumber = [(judul, 2.0), (" ".join(teks_layar or []), 2.0), (deskripsi, 1.0), (transkrip, 1.0)]
    satu: Counter[str] = Counter()
    dua: Counter[str] = Counter()
    dua_sumber: Counter[str] = Counter()
    for teks, bobot in sumber:
        tok = _token(teks)
        frasa_di_sini: set[str] = set()
        for i, t in enumerate(tok):
            if not _bermakna(t):
                continue
            satu[t] += bobot
            if i + 1 < len(tok) and _bermakna(tok[i + 1]):
                f = f"{t} {tok[i + 1]}"
                dua[f] += bobot
                frasa_di_sini.add(f)
        dua_sumber.update(frasa_di_sini)
    layak = {f for f in dua if dua_sumber[f] >= 2}
    urut_layak = sorted(layak, key=lambda f: (-dua[f], f))  # deterministik
    hasil: list[str] = []
    dipakai: set[str] = set()
    for frasa, _n in dua.most_common():
        if len(hasil) >= maks // 2:
            break
        kata2 = frasa.split()
        if frasa not in layak or any(w in dipakai for w in kata2):
            continue
        # Frasa layak yang bersambung digabung: "desa sungai" + "sungai rampah" -> "desa sungai rampah".
        lanjut = next((f for f in urut_layak if f.split()[0] == kata2[-1] and f.split()[1] not in dipakai and f.split()[1] not in kata2), None)
        if lanjut:
            kata2.append(lanjut.split()[1])
        else:
            depan = next((f for f in urut_layak if f.split()[1] == kata2[0] and f.split()[0] not in dipakai and f.split()[0] not in kata2), None)
            if depan:
                kata2.insert(0, depan.split()[0])
        hasil.append(" ".join(kata2))
        dipakai.update(kata2)
    for kata, _ in satu.most_common():
        if len(hasil) >= maks:
            break
        if kata in dipakai:
            continue
        hasil.append(kata)
        dipakai.add(kata)
    return hasil


# --------------------------------------------------------------------- model (dimuat malas)

_kunci_ocr = threading.Lock()
_ocr = None
_kunci_whisper = threading.Lock()
_whisper = None


def _mesin_ocr():
    global _ocr
    with _kunci_ocr:
        if _ocr is None:
            from rapidocr import RapidOCR

            _ocr = RapidOCR(
                params={
                    "Global.log_level": "error",
                    "EngineConfig.onnxruntime.intra_op_num_threads": konfig.UTAS,
                    "EngineConfig.onnxruntime.inter_op_num_threads": 1,
                }
            )
        return _ocr


def baca_teks(berkas: list[str]) -> list[list[tuple[str, float]]]:
    """OCR tiap gambar -> [[(teks, yakin), ...], ...]. Gambar yang gagal dibaca = daftar kosong."""
    mesin = _mesin_ocr()
    hasil: list[list[tuple[str, float]]] = []
    for b in berkas:
        try:
            r = mesin(b)
            txts = list(r.txts or ()) if r is not None else []
            scores = list(r.scores or ()) if r is not None else []
            hasil.append([(str(t), float(s)) for t, s in zip(txts, scores)])
        except Exception as e:  # noqa: BLE001 — satu frame rusak tidak menggagalkan pelacakan
            print(f"[lacak] OCR gagal {b}: {e}", flush=True)
            hasil.append([])
    return hasil


def _mesin_whisper():
    global _whisper
    with _kunci_whisper:
        if _whisper is None:
            from faster_whisper import WhisperModel

            _whisper = WhisperModel(
                konfig.WHISPER,
                device="cpu",
                compute_type="int8",
                cpu_threads=konfig.UTAS,
                download_root=str(konfig.WHISPER_DIR),
            )
        return _whisper


def transkrip(audio_16k) -> str:
    """audio float32 mono 16 kHz (numpy) -> teks bahasa Indonesia. Kosong bila tidak ada ucapan."""
    if audio_16k is None or len(audio_16k) < 16000:
        return ""
    model = _mesin_whisper()
    segmen, _ = model.transcribe(audio_16k, language="id", beam_size=1, vad_filter=True)
    return " ".join(s.text.strip() for s in segmen).strip()
