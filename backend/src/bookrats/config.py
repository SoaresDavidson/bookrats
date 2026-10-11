import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    db: str = "./bookrats.db"
    goodreads_poll_seconds: int = 900
    google_books_key: str | None = None
    kosync_upstream: str | None = None

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            db=os.environ.get("BOOKRATS_DB", "./bookrats.db"),
            goodreads_poll_seconds=int(os.environ.get("BOOKRATS_GOODREADS_POLL_SECONDS", "900")),
            google_books_key=os.environ.get("BOOKRATS_GOOGLE_BOOKS_KEY") or None,
            kosync_upstream=(os.environ.get("BOOKRATS_KOSYNC_UPSTREAM") or "").rstrip("/") or None,
        )
