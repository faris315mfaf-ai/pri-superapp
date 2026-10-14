"""Indeks vektor koleksi (Qdrant): satu titik per frame video koleksi (vektor SSCD + waktu + PDQ).

Qdrant tidak terjangkau -> pelacakan tetap jalan tanpa jalur koleksi (dicatat di tahap "cari").
"""

from __future__ import annotations

import threading
import uuid
from collections import defaultdict

import numpy as np

from . import konfig

KOLEKSI = "bingkai"
DIMENSI = 512

_kunci = threading.Lock()
_klien = None
_siap = False


def _qdrant():
    global _klien
    with _kunci:
        if _klien is None:
            from qdrant_client import QdrantClient

            if konfig.QDRANT_URL in ("", ":memory:"):
                _klien = QdrantClient(":memory:")
            else:
                _klien = QdrantClient(url=konfig.QDRANT_URL, timeout=20)
        return _klien


def atur_klien(klien) -> None:
    """Untuk uji: pakai klien lain (mis. QdrantClient(':memory:'))."""
    global _klien, _siap
    with _kunci:
        _klien = klien
        _siap = False


def siapkan() -> bool:
    """Buat koleksi + indeks payload bila belum ada. False bila Qdrant tidak terjangkau."""
    global _siap
    if _siap:
        return True
    try:
        from qdrant_client import models

        q = _qdrant()
        if not q.collection_exists(KOLEKSI):
            q.create_collection(
                KOLEKSI,
                vectors_config=models.VectorParams(size=DIMENSI, distance=models.Distance.COSINE, on_disk=True),
                quantization_config=models.ScalarQuantization(
                    scalar=models.ScalarQuantizationConfig(type=models.ScalarType.INT8, always_ram=True)
                ),
            )
            try:
                q.create_payload_index(KOLEKSI, field_name="video", field_schema=models.PayloadSchemaType.KEYWORD)
            except Exception:  # noqa: BLE001 — mode lokal (uji) tidak mendukung indeks payload
                pass
        _siap = True
        return True
    except Exception as e:  # noqa: BLE001
        print(f"[lacak] Qdrant tidak siap: {e}", flush=True)
        return False


def _id_titik(video: str, i: int) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"{video}#{i}"))


def simpan(video: str, vek: np.ndarray, waktu: list[float], pdq_hex: list[str]) -> int:
    from qdrant_client import models

    if not siapkan():
        return 0
    titik = []
    for i in range(len(waktu)):
        v = vek[i]
        if not np.any(v):
            continue
        titik.append(models.PointStruct(id=_id_titik(video, i), vector=v.tolist(), payload={"video": video, "t": float(waktu[i]), "pdq": pdq_hex[i]}))
    if titik:
        _qdrant().upsert(KOLEKSI, points=titik, wait=True)
    return len(titik)


def cari(vek: np.ndarray, batas: int = 20, ambang: float = 0.6) -> dict[str, list[tuple[int, float, float]]]:
    """Untuk tiap vektor query: titik koleksi terdekat. -> {video: [(indeks_query, skor, t), ...]}"""
    from qdrant_client import models

    hasil: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
    if not siapkan():
        return hasil
    permintaan = [
        models.QueryRequest(query=v.tolist(), limit=batas, score_threshold=ambang, with_payload=True)
        for v in vek
        if np.any(v)
    ]
    indeks = [i for i, v in enumerate(vek) if np.any(v)]
    if not permintaan:
        return hasil
    jawaban = _qdrant().query_batch_points(KOLEKSI, requests=permintaan)
    for i, r in zip(indeks, jawaban):
        for p in r.points:
            pl = p.payload or {}
            hasil[str(pl.get("video"))].append((i, float(p.score), float(pl.get("t", 0.0))))
    return dict(hasil)


def ambil(video: str) -> tuple[np.ndarray, list[float], list[str]] | None:
    """Semua frame satu video koleksi, urut waktu."""
    from qdrant_client import models

    if not siapkan():
        return None
    titik, _ = _qdrant().scroll(
        KOLEKSI,
        scroll_filter=models.Filter(must=[models.FieldCondition(key="video", match=models.MatchValue(value=video))]),
        with_vectors=True,
        with_payload=True,
        limit=1000,
    )
    if not titik:
        return None
    titik = sorted(titik, key=lambda p: float((p.payload or {}).get("t", 0.0)))
    vek = np.array([p.vector for p in titik], dtype=np.float32)
    n = np.linalg.norm(vek, axis=1, keepdims=True)
    vek = vek / np.where(n == 0, 1, n)
    return vek, [float((p.payload or {}).get("t", 0.0)) for p in titik], [str((p.payload or {}).get("pdq", "")) for p in titik]


def hapus(video_ids: list[str]) -> None:
    from qdrant_client import models

    if not video_ids:
        return
    if not siapkan():
        raise RuntimeError("Qdrant tidak terjangkau")
    _qdrant().delete(
        KOLEKSI,
        points_selector=models.FilterSelector(filter=models.Filter(must=[models.FieldCondition(key="video", match=models.MatchAny(any=video_ids))])),
        wait=True,
    )


def hitung() -> int:
    if not siapkan():
        return 0
    try:
        return int(_qdrant().count(KOLEKSI, exact=False).count)
    except Exception:  # noqa: BLE001
        return 0


def sehat() -> bool:
    try:
        _qdrant().get_collections()
        return True
    except Exception:  # noqa: BLE001
        return False
