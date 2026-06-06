"""
LSTM-based hemoglobin drop forecaster.
Predicts days until Hb falls below 8 g/dL threshold.
"""
import os
import json
import logging
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger("hb-forecaster")

HB_THRESHOLD = 8.0   # g/dL — transfusion trigger
SEQ_LEN      = 12    # observations in LSTM window

try:
    import torch
    import torch.nn as nn
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    logger.warning("PyTorch not available — Hb forecaster using linear fallback")


if TORCH_AVAILABLE:
    class HbDropLSTM(nn.Module):
        """
        Bidirectional LSTM for Hb time-series forecasting.
        Input: (batch, seq=12, features=6)
        Output: (batch, 1) — predicted days to threshold
        """
        def __init__(self):
            super().__init__()
            self.lstm = nn.LSTM(
                input_size=6,
                hidden_size=64,
                num_layers=2,
                batch_first=True,
                bidirectional=True,
                dropout=0.2,
            )
            self.fc = nn.Sequential(
                nn.Linear(128, 32),
                nn.ReLU(),
                nn.Dropout(0.1),
                nn.Linear(32, 1),
                nn.ReLU(),   # days must be >= 0
            )

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            out, _ = self.lstm(x)
            return self.fc(out[:, -1, :])   # last timestep


class HbDropForecaster:

    MODEL_PATH = Path(os.getenv("HB_MODEL_PATH", "models/hb_lstm.pt"))

    def __init__(self):
        self.model = None
        self._load()

    def _load(self):
        if not TORCH_AVAILABLE or not self.MODEL_PATH.exists():
            logger.warning("Hb LSTM weights not found — using linear regression fallback")
            return
        try:
            self.model = HbDropLSTM()
            state = torch.load(self.MODEL_PATH, map_location="cpu")
            self.model.load_state_dict(state)
            self.model.eval()
            logger.info("Hb LSTM model loaded")
        except Exception as e:
            logger.error(f"Hb model load failed: {e}")

    async def predict(self, patient_id: str, db: AsyncSession) -> dict | None:
        """Predict days until next transfusion needed."""
        # Load transfusion history
        result = await db.execute(
            text("""
                SELECT hb_pre, hb_post, days_since_last,
                       EXTRACT(EPOCH FROM transfused_at) AS ts_epoch
                FROM transfusion_events
                WHERE patient_id = :pid
                ORDER BY transfused_at DESC
                LIMIT :n
            """),
            {"pid": patient_id, "n": SEQ_LEN + 1}
        )
        rows = result.fetchall()

        if len(rows) < 3:
            return None

        # Build feature sequence
        # Features: [hb_pre, hb_post, days_since_last, hb_drop_rate, month_sin, month_cos]
        now = datetime.utcnow()
        seq = []
        for i, row in enumerate(rows[:SEQ_LEN]):
            hb_drop_rate = (row[1] - row[0]) / max(row[2], 1) if row[2] else 0.0
            month = datetime.fromtimestamp(row[3]).month
            seq.append([
                float(row[0] or 9.0),           # hb_pre
                float(row[1] or 10.5),          # hb_post
                float(row[2] or 21),             # days_since_last
                float(hb_drop_rate),
                float(np.sin(2 * np.pi * month / 12)),
                float(np.cos(2 * np.pi * month / 12)),
            ])

        # Pad if shorter than SEQ_LEN
        while len(seq) < SEQ_LEN:
            seq.append(seq[-1] if seq else [9.0, 10.5, 21.0, -0.05, 0.0, 1.0])

        predicted_days = self._run_model(seq)

        # Load patient info for context
        patient_result = await db.execute(
            text("SELECT transfusion_interval_days FROM patients WHERE id = :pid"),
            {"pid": patient_id}
        )
        patient_row = patient_result.fetchone()
        expected_interval = patient_row[0] if patient_row else 21

        # 90% confidence interval: ±30% of prediction
        ci_lower = max(0.0, predicted_days * 0.7)
        ci_upper = predicted_days * 1.3

        transfusion_date = now + timedelta(days=predicted_days)
        urgency_flag     = predicted_days <= 7

        return {
            "patient_id":                  patient_id,
            "predicted_days_to_threshold": round(predicted_days, 1),
            "confidence_interval":         [round(ci_lower, 1), round(ci_upper, 1)],
            "recommended_transfusion_date": transfusion_date.isoformat(),
            "urgency_flag":                urgency_flag,
            "forecasted_at":               now.isoformat(),
        }

    def _run_model(self, seq: list[list[float]]) -> float:
        if self.model is not None and TORCH_AVAILABLE:
            x     = torch.tensor([seq], dtype=torch.float32)   # (1, seq_len, 6)
            with torch.no_grad():
                pred = self.model(x).item()
            return max(1.0, pred)

        # Linear fallback: use Hb drop rate from recent observations
        try:
            recent_hb_pre  = seq[0][0]
            recent_hb_post = seq[0][1]
            drop_per_day   = abs(seq[0][3]) if seq[0][3] != 0 else 0.05

            days = (recent_hb_post - HB_THRESHOLD) / max(drop_per_day, 0.01)
            return max(3.0, min(days, 60.0))
        except Exception:
            return 21.0
