from fastapi import FastAPI, Request

from bookrats import kosync


def create_app(db_path: str, start_poller: bool = True) -> FastAPI:
    app = FastAPI(title="Bookrats")
    app.state.db_path = db_path
    app.state.start_poller = start_poller

    @app.exception_handler(kosync.KosyncError)
    async def _kosync_error(request: Request, exc: kosync.KosyncError):
        return kosync.error_response(exc.status, exc.code, exc.message)

    app.include_router(kosync.router)
    return app
