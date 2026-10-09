from bookrats.config import Settings
from bookrats.main import create_app

app = create_app(Settings.from_env().db)
