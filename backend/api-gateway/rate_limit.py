"""
Redis-backed sliding window rate limiter.
Default: 100 requests per minute per IP.
"""
import time
from fastapi import Request, HTTPException, status
from shared.redis_client import get_redis


class RateLimiter:
    def __init__(self, max_requests: int = 100, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window       = window_seconds
        self.redis        = get_redis()

    async def check(self, request: Request):
        ip  = request.client.host if request.client else "unknown"
        key = f"rate:{ip}"
        now = time.time()

        pipe = self.redis.pipeline()
        pipe.zremrangebyscore(key, 0, now - self.window)
        pipe.zadd(key, {str(now): now})
        pipe.zcard(key)
        pipe.expire(key, self.window)
        results = await pipe.execute()

        count = results[2]
        if count > self.max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Max {self.max_requests} req/{self.window}s",
                headers={"Retry-After": str(self.window)},
            )
