"""Healthcheck container API: tanya /health lewat socket Unix (tanpa port)."""

import os
import socket
import sys

SOCKET = os.getenv("AUTOEDIT_SOCKET", "/run/autoedit/api.sock")

try:
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
        s.settimeout(5)
        s.connect(SOCKET)
        s.sendall(b"GET /health HTTP/1.0\r\nHost: autoedit\r\n\r\n")
        sys.exit(0 if b" 200 " in s.recv(64) else 1)
except OSError:
    sys.exit(1)
