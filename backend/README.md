# Project Pepsi FastAPI backend

This is the target backend for Project Pepsi. It preserves the existing `/api/analyze` scanner contract, stores structured records in PostgreSQL, keeps OpenAI calls server-side, and implements financial policy deterministically.

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

For zero-config local development the backend defaults to a local SQLite file. PostgreSQL is the production target; set `DATABASE_URL` to a `postgresql+psycopg://...` connection string before running migrations in a deployed environment.

Run the test suite with:

```powershell
python -m pytest
```

## Cutover

Deploy this service with PostgreSQL, run `alembic upgrade head`, set the frontend and extension backend URL, verify parity, and only then retire the Worker/D1 compatibility endpoints.
