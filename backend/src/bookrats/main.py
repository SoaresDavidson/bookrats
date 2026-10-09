import asyncio
import contextlib
import os
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from bookrats import api, kosync
from bookrats.config import Settings
from bookrats.deps import new_http_client
from bookrats.goodreads import poll_forever


def create_app(db_path: str, start_poller: bool = True) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        task = None
        app.state.http = new_http_client()
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
            http = getattr(app.state, "http", None)
            if http is not None:
                await http.aclose()
                app.state.http = None

    app = FastAPI(title="Bookrats", lifespan=lifespan)
    app.state.db_path = db_path
    app.state.start_poller = start_poller

    @app.exception_handler(kosync.KosyncError)
    async def _kosync_error(request: Request, exc: kosync.KosyncError):
        return kosync.error_response(exc.status, exc.code, exc.message)

    app.include_router(kosync.router)
    app.include_router(api.router, prefix="/api")

    web_dist = Path(os.environ.get("BOOKRATS_WEB_DIST", "/app/web/dist"))
    if web_dist.is_dir():
        app.mount("/app", StaticFiles(directory=web_dist, html=True), name="web")

        @app.get("/", include_in_schema=False)
        async def _root():
            return RedirectResponse("/app/", status_code=307)

    return app
