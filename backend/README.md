# Project Pepsi FastAPI backend

This is the production backend authority for Project Pepsi. It preserves the versioned `/api/analyze` scanner contract, stores structured records in PostgreSQL, keeps OpenAI calls server-side, and implements financial policy deterministically.

## Local setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[test]"
Copy-Item .env.example .env
alembic upgrade head
uvicorn project_pepsi.app:app --reload
```

Set `DATABASE_URL` and `OPENAI_API_KEY` through the deployment platform's secret manager. Never commit `.env`.

For zero-config local development the backend defaults to a local SQLite file. PostgreSQL is the production system of record; set `DATABASE_URL` to a `postgresql+psycopg://...` connection string before running migrations in a deployed environment. SQLite is development-only and is not an alternate production persistence path.

Run the test suite with:

```powershell
python -m pytest
```

## Cutover

This service is the production backend authority and PostgreSQL is the system of record. The private Sites Worker is an authenticated gateway only. Worker/D1 code and bindings are **LEGACY/BRIDGE** migration artifacts; do not add new production logic or persistence to them.

## Railway

Create a service from this repository with `/backend` as its root directory, then add a Railway PostgreSQL service. Set `DATABASE_URL` to the PostgreSQL private connection URL, `OPENAI_API_KEY` as a sealed variable, and `ALLOWED_ORIGINS` to the private Sites origin. The container runs migrations before starting and Railway checks `/health` before marking a deployment healthy.
