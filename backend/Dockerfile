FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web ./
RUN npm run build

FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
COPY backend/src ./src
RUN uv sync --frozen --no-dev
COPY --from=web /web/dist /app/web/dist
RUN useradd --create-home app && mkdir /data && chown app /data
ENV PATH="/app/.venv/bin:$PATH" \
    BOOKRATS_DB=/data/bookrats.db \
    BOOKRATS_WEB_DIST=/app/web/dist
USER app
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "bookrats.asgi:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
