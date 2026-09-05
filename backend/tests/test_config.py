from project_pepsi.config import Settings


def test_railway_postgres_url_uses_installed_psycopg_driver():
    settings = Settings(database_url="postgresql://user:pass@postgres.railway.internal:5432/railway")
    assert settings.database_url.startswith("postgresql+psycopg://")


def test_local_sqlite_url_is_unchanged():
    settings = Settings(database_url="sqlite+pysqlite:///./project_pepsi.db")
    assert settings.database_url == "sqlite+pysqlite:///./project_pepsi.db"
