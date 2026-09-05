from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from project_pepsi import auth
from project_pepsi.app import settings


def token(private_key, **overrides):
    now = datetime.now(timezone.utc)
    claims = {"iss": "https://issuer.example/", "aud": "https://api.project-pepsi", "sub": "auth0|user-1", "iat": now, "exp": now + timedelta(minutes=5), "scope": "read:listings analyze:listings"}
    claims.update(overrides)
    return jwt.encode(claims, private_key, algorithm="RS256", headers={"kid": "test"})


def test_validates_signature_issuer_audience_expiration_and_subject(monkeypatch):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(auth, "_jwks_client", lambda _issuer: SimpleNamespace(get_signing_key_from_jwt=lambda _token: SimpleNamespace(key=private_key.public_key())))
    settings.oidc_issuer = "https://issuer.example/"
    settings.oidc_audience = "https://api.project-pepsi"
    principal = auth.authenticate(f"Bearer {token(private_key)}")
    assert principal.user_id == "auth0|user-1"
    assert "read:listings" in principal.scopes

    with pytest.raises(HTTPException) as error:
        auth.authenticate(f"Bearer {token(private_key, aud='wrong-audience')}")
    assert error.value.status_code == 401

    with pytest.raises(HTTPException) as error:
        auth.authenticate(f"Bearer {token(private_key, exp=datetime.now(timezone.utc) - timedelta(seconds=1))}")
    assert error.value.status_code == 401
