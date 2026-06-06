"""
RakSetu API Gateway Authentication
====================================
Supports two modes:
  1. AWS Cognito (production/demo) -- RS256 JWT from Cognito User Pool
  2. Local HS256 JWT (dev fallback) -- used when COGNITO_USER_POOL_ID not set

Cognito is used in production because:
  - Handles phone-based OTP natively (donor WhatsApp number verification)
  - No password management required
  - Free tier for <50,000 MAU
  - Integrates with App Runner directly

Set in .env:
    COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
    COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxx
    AWS_REGION=us-east-1
"""
import os
import json
import logging
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Optional

from jose import jwk, jwt, JWTError
from fastapi import HTTPException, status

logger = logging.getLogger("auth")

# ── Cognito config ────────────────────────────────────────────────────────────
COGNITO_REGION    = os.getenv("AWS_REGION", "us-east-1")
COGNITO_USER_POOL = os.getenv("COGNITO_USER_POOL_ID", "")
COGNITO_CLIENT_ID = os.getenv("COGNITO_CLIENT_ID", "")

# ── Local JWT fallback (dev only) ─────────────────────────────────────────────
JWT_SECRET    = os.getenv("JWT_SECRET", "dev_secret_change_in_production_32chars")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_M  = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))

USE_COGNITO = bool(COGNITO_USER_POOL)


@dataclass
class TokenData:
    user_id: str
    role:    str
    name:    str
    phone:   str = ""


# ── Cognito JWKS (cached — fetched once per process) ─────────────────────────
@lru_cache(maxsize=1)
def _get_cognito_jwks() -> list:
    """Fetch and cache Cognito JWKS public keys."""
    jwks_url = (
        f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com"
        f"/{COGNITO_USER_POOL}/.well-known/jwks.json"
    )
    try:
        with urllib.request.urlopen(jwks_url, timeout=5) as r:
            return json.loads(r.read())["keys"]
    except Exception as e:
        logger.error(f"Failed to fetch Cognito JWKS: {e}")
        return []


def verify_cognito_token(token: str) -> Optional[TokenData]:
    """
    Verify a Cognito-issued RS256 JWT.
    Cognito User Pool issues tokens after OTP verification --
    perfect for donor phone number authentication.
    """
    try:
        keys = _get_cognito_jwks()
        if not keys:
            return None

        headers = jwt.get_unverified_headers(token)
        key = next((k for k in keys if k["kid"] == headers.get("kid")), None)
        if not key:
            logger.warning("Cognito: no matching key found in JWKS")
            return None

        payload = jwt.decode(
            token,
            jwk.construct(key),
            algorithms=["RS256"],
            audience=COGNITO_CLIENT_ID,
            options={"verify_exp": True},
        )

        # Cognito puts phone in "phone_number", name in "name"
        return TokenData(
            user_id=payload.get("sub", ""),
            role=payload.get("custom:role", "donor"),
            name=payload.get("name", payload.get("phone_number", "")),
            phone=payload.get("phone_number", ""),
        )

    except JWTError as e:
        logger.warning(f"Cognito JWT verification failed: {e}")
        return None
    except Exception as e:
        logger.error(f"Cognito token error: {e}")
        return None


# ── Local JWT (dev fallback) ──────────────────────────────────────────────────
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create local HS256 JWT for development. NOT used in production (Cognito handles this)."""
    payload = data.copy()
    expire  = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=JWT_EXPIRE_M))
    payload.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_local_token(token: str) -> Optional[TokenData]:
    """Verify local HS256 JWT (dev only)."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return TokenData(
            user_id=payload.get("sub", ""),
            role=payload.get("role", ""),
            name=payload.get("name", ""),
            phone=payload.get("phone", ""),
        )
    except JWTError:
        return None


# ── Unified verify (routes to Cognito or local) ───────────────────────────────
def verify_token(token: str) -> Optional[TokenData]:
    """
    Main auth entry point.
    Uses Cognito in production, local JWT in dev (when COGNITO_USER_POOL_ID not set).
    """
    if USE_COGNITO:
        return verify_cognito_token(token)
    return verify_local_token(token)


def require_token(token: str) -> TokenData:
    """Dependency-injectable version that raises 401 on failure."""
    data = verify_token(token)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return data
