"""Sidik gambar: SSCD (deteksi salinan, 512 dimensi, Meta) dan PDQ (hash 256 bit, Meta)."""

from __future__ import annotations

import threading
from pathlib import Path

import numpy as np
from PIL import Image

from . import konfig

DIMENSI = 512
_RERATA = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_SIMPANGAN = np.array([0.229, 0.224, 0.225], dtype=np.float32)
_SISI_PENDEK = 288  # rekomendasi README SSCD

_kunci = threading.Lock()
_model = None


def _sscd():
    global _model
    with _kunci:
        if _model is None:
            import torch

            torch.set_num_threads(konfig.UTAS)
            if not konfig.SSCD.exists():
                raise RuntimeError(f"Model SSCD tidak ada di {konfig.SSCD}")
            m = torch.jit.load(str(konfig.SSCD), map_location="cpu")
            m.eval()
            _model = m
        return _model


def _tensor(gambar: Image.Image) -> np.ndarray:
    g = gambar.convert("RGB")
    w, h = g.size
    s = _SISI_PENDEK / max(1, min(w, h))
    g = g.resize((max(1, round(w * s)), max(1, round(h * s))), Image.BICUBIC)
    a = (np.asarray(g, dtype=np.float32) / 255.0 - _RERATA) / _SIMPANGAN
    return a.transpose(2, 0, 1)


def vektor(berkas: list[Path | str], cermin: bool = False) -> np.ndarray:
    """[n, 512] vektor SSCD ternormalisasi L2. Berkas kosong/rusak -> baris nol (tidak cocok dengan apa pun).
    `cermin` = gambar dibalik kiri-kanan dulu (untuk saduran yang di-mirror)."""
    import torch

    model = _sscd()
    hasil = np.zeros((len(berkas), DIMENSI), dtype=np.float32)
    for i, b in enumerate(berkas):
        if not b or not Path(b).is_file():
            continue
        try:
            with Image.open(b) as g:
                if cermin:
                    g = g.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                x = torch.from_numpy(_tensor(g)).unsqueeze(0)
            with torch.no_grad():
                v = model(x)[0].numpy().astype(np.float32)
            n = float(np.linalg.norm(v))
            if n > 0:
                hasil[i] = v / n
        except Exception as e:  # noqa: BLE001 — satu frame rusak tidak menggagalkan pelacakan
            print(f"[lacak] SSCD gagal {b}: {e}", flush=True)
    return hasil


def pdq(berkas: list[Path | str]) -> list[np.ndarray]:
    """Hash PDQ (256 bit sebagai array 0/1). Gagal -> hash nol (jarak jauh ke apa pun yang bermakna)."""
    import pdqhash

    hasil: list[np.ndarray] = []
    for b in berkas:
        try:
            with Image.open(b) as g:
                h, _kualitas = pdqhash.compute(np.asarray(g.convert("RGB")))
            hasil.append(np.asarray(h, dtype=np.uint8))
        except Exception:  # noqa: BLE001
            hasil.append(np.zeros(256, dtype=np.uint8))
    return hasil


def pdq_hex(h: np.ndarray) -> str:
    bits = np.asarray(h, dtype=np.uint8)[:256]
    return np.packbits(bits).tobytes().hex()


def pdq_dari_hex(s: str) -> np.ndarray:
    try:
        return np.unpackbits(np.frombuffer(bytes.fromhex(s), dtype=np.uint8))[:256]
    except ValueError:
        return np.zeros(256, dtype=np.uint8)
