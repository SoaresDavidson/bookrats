from fastapi import FastAPI


def create_app(db_path: str, start_poller: bool = True) -> FastAPI:
    app = FastAPI(title="Bookrats")
    app.state.db_path = db_path
    app.state.start_poller = start_poller
    return app
