import os
import json
import logging
from datetime import timedelta

from celery import Celery


redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload)


handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logging.getLogger().handlers.clear()
logging.getLogger().addHandler(handler)
# Dinaikkan ke huruf besar dan disaring: logging Python hanya menerima nama
# level huruf besar, jadi LOG_LEVEL=warning (ejaan yang lazim dipakai Celery
# dan uvicorn) dulu membuat seluruh aplikasi gagal dijalankan.
_TINGKAT_SAH = {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG", "NOTSET"}
_tingkat = os.getenv("LOG_LEVEL", "INFO").strip().upper()
if _tingkat == "WARN":
    _tingkat = "WARNING"
if _tingkat not in _TINGKAT_SAH:
    _tingkat = "INFO"
logging.getLogger().setLevel(_tingkat)

celery_app = Celery("pri_autoedit", broker=redis_url, backend=redis_url)
celery_app.conf.update(
    include=["video_tasks"],
    timezone="Asia/Jakarta",
    enable_utc=False,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Status job sudah ditulis sendiri ke Redis (video_tasks.tulis_status);
    # hasil tugas Celery tidak pernah dibaca, jadi tidak perlu disimpan.
    task_ignore_result=True,
    # Dengan acks_late, tugas yang berjalan lebih lama dari visibility_timeout
    # dikirim ULANG oleh Redis ke worker lain - render ganda. Bawaan Redis 1
    # jam, padahal unduhan (10 mnt) + render (30 mnt) + antre bisa lebih.
    broker_transport_options={"visibility_timeout": int(os.getenv("CELERY_VISIBILITY_TIMEOUT", "14400"))},
    worker_prefetch_multiplier=1,
    worker_concurrency=int(os.getenv("CELERY_CONCURRENCY", "1")),
    worker_max_tasks_per_child=10,
    result_expires=timedelta(hours=1),
)