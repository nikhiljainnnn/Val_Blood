"""
JWT authentication utilities for RakSetu API Gateway.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from dataclasses import dataclass

from jose import jwt, JWTError
from passlib.context import CryptContext

JWT_SECRET    = os.getenv("JWT_SECRET", "dev_secret_change_in_production_32chars")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_M  = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@dataclass
class TokenData:
    user_id: str
    role:    str
    name:    str


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    payload = data.copy()
    expire  = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=JWT_EXPIRE_M))
    payload.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> Optional[TokenData]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return TokenData(
            user_id=payload.get("sub", ""),
            role=payload.get("role", ""),
            name=payload.get("name", ""),
        )
    except JWTError:
        return None
