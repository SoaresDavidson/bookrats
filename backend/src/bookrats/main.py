import asyncio
import contextlib
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request

from bookrats import kosync
from bookrats.config import Settings
from bookrats.goodreads import poll_forever


def create_app(db_path: str, start_poller: bool = True) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        task = None
        if start_poller:
            task = asyncio.create_task(
                poll_forever(db_path, Settings.from_env().goodreads_poll_seconds)
            )
        try:
            yield
        finally:
            if task:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task

    app = FastAPI(title="Bookrats", lifespan=lifespan)
    app.state.db_path = db_path
    app.state.start_poller = start_poller

    @app.exception_handler(kosync.KosyncError)
    async def _kosync_error(request: Request, exc: kosync.KosyncError):
        return kosync.error_response(exc.status, exc.code, exc.message)

    app.include_router(kosync.router)
    return app
