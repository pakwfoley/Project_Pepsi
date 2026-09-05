FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

COPY pyproject.toml README.md alembic.ini ./
COPY project_pepsi ./project_pepsi
COPY migrations ./migrations

RUN pip install --no-cache-dir . \
    && useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app

USER appuser

CMD ["sh", "-c", "alembic upgrade head && uvicorn project_pepsi.app:app --host 0.0.0.0 --port ${PORT}"]
