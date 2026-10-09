FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
COPY pyproject.toml uv.lock ./
COPY src ./src
RUN uv sync --frozen --no-dev
RUN useradd --create-home app && mkdir /data && chown app /data
ENV PATH="/app/.venv/bin:$PATH" \
    BOOKRATS_DB=/data/bookrats.db
USER app
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "bookrats.asgi:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
