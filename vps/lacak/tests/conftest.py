import os
import sys
from pathlib import Path

import pytest

AKAR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AKAR))


PUBLIK = ("tiktok.com", "youtube.com", "instagram.com", "facebook.com", "x.com", "contoh.com", "example.com", "tiktokcdn.com")


@pytest.fixture(autouse=True)
def dns_palsu(monkeypatch):
    """Uji tidak bergantung internet: domain platform -> IP publik dokumentasi; IP literal apa adanya."""
    import ipaddress
    import socket

    from lacak import media

    def getaddrinfo(host, port, *a, **k):
        try:
            ipaddress.ip_address(host)
            ip = host
        except ValueError:
            if host in ("rebind.contoh-jahat.com",):
                ip = "10.251.0.5"
            elif any(host == d or host.endswith("." + d) for d in PUBLIK):
                ip = "93.184.216.34"
            else:
                raise socket.gaierror("tidak dikenal")
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port))]

    monkeypatch.setattr(media.socket, "getaddrinfo", getaddrinfo)


@pytest.fixture(autouse=True)
def data_sementara(tmp_path, monkeypatch):
    """Setiap uji: folder data sendiri + indeks vektor di memori."""
    from lacak import indeks, konfig

    monkeypatch.setattr(konfig, "DATA", tmp_path / "data")
    monkeypatch.setattr(konfig, "KERJA", tmp_path / "data" / "kerja")
    monkeypatch.setattr(konfig, "DB", tmp_path / "data" / "lacak.db")
    from qdrant_client import QdrantClient

    indeks.atur_klien(QdrantClient(":memory:"))
    from lacak import simpan

    simpan.siapkan()
    yield


def pytest_configure(config):
    config.addinivalue_line("markers", "berat: memakai model & ffmpeg sungguhan (lambat)")
    os.environ.setdefault("LACAK_QDRANT", ":memory:")
