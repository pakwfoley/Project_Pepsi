from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import Depends, Header, HTTPException

from .config import get_settings


@dataclass(frozen=True)
class Principal:
    user_id: str
    scopes: frozenset[str]


@lru_cache(maxsize=4)
def _jwks_client(issuer: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{issuer.rstrip('/')}/.well-known/jwks.json", cache_keys=True)


def authenticate(authorization: str = Header(default="")) -> Principal:
    settings = get_settings()
    issuer = settings.oidc_issuer.strip().rstrip("/") + "/"
    audience = settings.oidc_audience.strip()
    if issuer == "/" or not audience:
        raise HTTPException(status_code=503, detail={"code": "OIDC_CONFIGURATION_MISSING", "error": "User authentication is not configured."})
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "error": "A bearer access token is required."})
    token = authorization[7:].strip()
    try:
        signing_key = _jwks_client(issuer).get_signing_key_from_jwt(token)
        claims = jwt.decode(token, signing_key.key, algorithms=["RS256"], audience=audience, issuer=issuer, options={"require": ["exp", "iat", "iss", "aud", "sub"]})
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail={"code": "INVALID_ACCESS_TOKEN", "error": "The access token is invalid or expired."}) from exc
    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject:
        raise HTTPException(status_code=401, detail={"code": "INVALID_ACCESS_TOKEN", "error": "The access token has no subject."})
    return Principal(subject, frozenset(str(claims.get("scope", "")).split()))


def require_scope(scope: str):
    def dependency(principal: Principal = Depends(authenticate)) -> Principal:
        if scope not in principal.scopes:
            raise HTTPException(status_code=403, detail={"code": "INSUFFICIENT_SCOPE", "error": f"Required scope: {scope}"})
        return principal
    return dependency
