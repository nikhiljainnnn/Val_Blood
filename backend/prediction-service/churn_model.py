"""
Donor churn prediction model.
XGBoost on behavioral time-series features.
Falls back to heuristic model if weights not found.
"""
import os
import json
import pickle
import logging
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from shared.redis_client import get_redis

logger = logging.getLogger("churn-model")
redis  = get_redis()

FEATURE_CACHE_TTL = 21600  # 6 hours


class DonorChurnPredictor:

    MODEL_PATH = Path(os.getenv("CHURN_MODEL_PATH", "models/churn_xgb.pkl"))
    FEATURE_NAMES = [
        "days_since_last_donation",
        "days_since_last_msg_reply",
        "days_since_last_app_login",
        "donations_90d",
        "msg_opens_90d",
        "msg_replies_90d",
        "call_answers_90d",
        "donation_velocity",
        "engagement_velocity",
        "avg_donation_interval_days",
        "interval_std",
        "days_to_next_eligible",
        "lifetime_donations",
        "account_age_days",
        "karma_score",
        "guardian_circle_count",
        "is_exam_season",
        "is_festival_month",
        "month_sin",
        "month_cos",
    ]

    def __init__(self):
        self.model = None
        self._load_model()

    def _load_model(self):
        if self.MODEL_PATH.exists():
            try:
                with open(self.MODEL_PATH, "rb") as f:
                    self.model = pickle.load(f)
                logger.info("XGBoost churn model loaded")
            except Exception as e:
                logger.error(f"Failed to load churn model: {e}")
        else:
            logger.warning("Churn model weights not found — using heuristic fallback")

    async def predict_batch(
        self,
        donor_ids: list[str],
        db: AsyncSession,
    ) -> dict[str, float]:
        """Returns {donor_id: churn_probability}."""
        features_list = []
        id_order      = []

        for donor_id in donor_ids:
            cached = await redis.get(f"features:{donor_id}")
            if cached:
                row = json.loads(cached)
            else:
                row = await self._build_features(donor_id, db)
                if row:
                    await redis.setex(
                        f"features:{donor_id}",
                        FEATURE_CACHE_TTL,
                        json.dumps(row)
                    )

            if row:
                features_list.append(row)
                id_order.append(donor_id)

        if not features_list:
            return {}

        df = pd.DataFrame(features_list)

        if self.model is not None:
            X     = df[self.FEATURE_NAMES].fillna(0).values
            probs = self.model.predict_proba(X)[:, 1]
        else:
            # Heuristic fallback
            probs = self._heuristic_probs(df)

        return {did: float(prob) for did, prob in zip(id_order, probs)}

    async def _build_features(self, donor_id: str, db: AsyncSession) -> dict | None:
        now = datetime.utcnow()

        # Pull signals from last 90 days
        result = await db.execute(
            text("""
                SELECT signal_type, ts, value
                FROM donor_signals
                WHERE donor_id = :donor_id
                AND ts > NOW() - INTERVAL '90 days'
                ORDER BY ts DESC
            """),
            {"donor_id": donor_id}
        )
        signals = result.fetchall()

        # Pull donor profile
        donor_result = await db.execute(
            text("""
                SELECT d.lifetime_donations, d.karma_score, d.last_donation_at,
                       d.account_age_days, p.city,
                       COUNT(gc.id) AS circle_count
                FROM donors d
                JOIN persons p ON p.id = d.person_id
                LEFT JOIN guardian_circles gc ON gc.donor_id = d.id
                WHERE d.id = :donor_id
                GROUP BY d.lifetime_donations, d.karma_score, d.last_donation_at,
                         d.account_age_days, p.city
            """),
            {"donor_id": donor_id}
        )
        donor_row = donor_result.fetchone()
        if not donor_row:
            return None

        # Group signals by type
        def last_signal_days(sig_type: str) -> float:
            matches = [s for s in signals if s[0] == sig_type]
            if not matches:
                return 999.0
            return (now - matches[0][1]).total_seconds() / 86400

        def count_signal(sig_type: str) -> int:
            return sum(1 for s in signals if s[0] == sig_type)

        donations = [s for s in signals if s[0] == "donation_done"]
        donations_30d = sum(
            1 for d in donations
            if (now - d[1]).days <= 30
        )

        intervals = []
        for i in range(len(donations) - 1):
            intervals.append((donations[i][1] - donations[i + 1][1]).total_seconds() / 86400)

        last_donation = donor_row[2]
        days_since_donation = (
            (now - last_donation).days if last_donation else 999
        )

        month = now.month
        return {
            "days_since_last_donation":  days_since_donation,
            "days_since_last_msg_reply": last_signal_days("msg_reply"),
            "days_since_last_app_login": last_signal_days("app_login"),
            "donations_90d":             len(donations),
            "msg_opens_90d":             count_signal("msg_open"),
            "msg_replies_90d":           count_signal("msg_reply"),
            "call_answers_90d":          count_signal("call_answered"),
            "donation_velocity":         donations_30d / max(len(donations), 1),
            "engagement_velocity":       (count_signal("msg_reply") / max(count_signal("msg_open"), 1)),
            "avg_donation_interval_days": float(np.mean(intervals)) if intervals else 999.0,
            "interval_std":              float(np.std(intervals)) if intervals else 0.0,
            "days_to_next_eligible":     max(0, 56 - days_since_donation),
            "lifetime_donations":        donor_row[0] or 0,
            "account_age_days":          donor_row[3] or 0,
            "karma_score":               donor_row[1] or 0,
            "guardian_circle_count":     int(donor_row[5] or 0),
            "is_exam_season":            int(month in [3, 4, 11, 12]),
            "is_festival_month":         int(month in [10, 11, 1, 2]),
            "month_sin":                 float(np.sin(2 * np.pi * month / 12)),
            "month_cos":                 float(np.cos(2 * np.pi * month / 12)),
        }

    @staticmethod
    def _heuristic_probs(df: pd.DataFrame) -> np.ndarray:
        """Simple heuristic when model weights unavailable."""
        scores = np.zeros(len(df))
        scores += np.clip(df["days_since_last_donation"].fillna(999) / 200, 0, 0.5)
        scores += np.clip(df["days_since_last_msg_reply"].fillna(999) / 200, 0, 0.3)
        scores -= np.clip(df["lifetime_donations"].fillna(0) / 50, 0, 0.2)
        return np.clip(scores, 0.0, 1.0).values
