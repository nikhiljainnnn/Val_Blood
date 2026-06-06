"""
RakSetu Federated Learning Aggregator
- Flower (flwr) FedAvg server with differential privacy
- DISHA-compliant: no raw patient data crosses hospital boundaries
- Aggregates gradient updates from hospital nodes
"""
import os
import io
import json
import logging
import threading
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("federated-aggregator")

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models/global"))
MODEL_DIR.mkdir(parents=True, exist_ok=True)

FLOWER_PORT = int(os.getenv("FLOWER_PORT", "9090"))
MIN_CLIENTS = int(os.getenv("FL_MIN_CLIENTS", "2"))   # 2 for demo, 3 for prod

# Track rounds and metrics
_fl_state: dict = {
    "round":          0,
    "connected_nodes": 0,
    "last_aggregated": None,
    "accuracy":        0.0,
    "status":          "idle",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start Flower server in background thread
    _start_flower_server()
    logger.info(f"Federated aggregator started — Flower on port {FLOWER_PORT}")
    yield
    logger.info("Federated aggregator shutting down")


app = FastAPI(title="RakSetu Federated Aggregator", version="1.0.0", lifespan=lifespan)


# ─── REST API ─────────────────────────────────────────────────────────────────
@app.get("/fl/status")
async def fl_status():
    """Current federated learning status."""
    return {
        **_fl_state,
        "min_clients_required": MIN_CLIENTS,
        "model_dir":            str(MODEL_DIR),
        "server_port":          FLOWER_PORT,
    }


@app.get("/fl/model/latest")
async def get_latest_model():
    """Download the latest aggregated global model weights."""
    model_path = MODEL_DIR / "global_model_latest.npz"
    if not model_path.exists():
        raise HTTPException(status_code=404, detail="No aggregated model available yet")
    return FileResponse(str(model_path), media_type="application/octet-stream")


@app.get("/fl/metrics")
async def get_metrics():
    """Return federated learning metrics history."""
    metrics_path = MODEL_DIR / "metrics_history.json"
    if not metrics_path.exists():
        return {"rounds": [], "message": "No metrics yet"}
    with open(metrics_path) as f:
        return json.load(f)


@app.post("/fl/trigger")
async def trigger_round():
    """Manually trigger a federated learning round (admin use)."""
    if _fl_state["connected_nodes"] < MIN_CLIENTS:
        raise HTTPException(
            status_code=400,
            detail=f"Need {MIN_CLIENTS} clients, have {_fl_state['connected_nodes']}"
        )
    _fl_state["status"] = "training"
    return {"message": "Training round triggered", "state": _fl_state}


@app.get("/fl/nodes")
async def get_nodes():
    """List connected hospital nodes."""
    nodes_path = MODEL_DIR / "connected_nodes.json"
    if not nodes_path.exists():
        return {"nodes": [], "count": 0}
    with open(nodes_path) as f:
        return json.load(f)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "federated-aggregator", "fl_status": _fl_state["status"]}


# ─── Flower FL Server ─────────────────────────────────────────────────────────
def _start_flower_server():
    """Start Flower federated learning server in a background thread."""
    thread = threading.Thread(target=_run_flower, daemon=True)
    thread.start()


def _run_flower():
    try:
        import flwr as fl
        from flwr.server.strategy import FedAvg
        from flwr.common import Parameters, FitRes, EvaluateRes, Scalar
        from flwr.server.client_proxy import ClientProxy

        class RakSetuFedAvgStrategy(FedAvg):
            """
            Custom FedAvg with:
            1. Gradient clipping (bound C=1.0)
            2. Gaussian noise injection (σ=0.1, differential privacy)
            3. Model versioning to disk
            4. Metrics tracking
            """
            CLIP_BOUND = 1.0
            NOISE_STD  = 0.1

            def aggregate_fit(
                self,
                server_round: int,
                results: list[tuple[ClientProxy, FitRes]],
                failures: list,
            ):
                if not results:
                    logger.warning(f"Round {server_round}: no results")
                    return None, {}

                logger.info(f"Round {server_round}: aggregating {len(results)} clients")

                # Deserialize parameters
                client_params = [
                    fl.common.parameters_to_ndarrays(fit_res.parameters)
                    for _, fit_res in results
                ]

                # DP Step 1: Clip gradients
                clipped = []
                for params in client_params:
                    norm = np.sqrt(sum(np.sum(p ** 2) for p in params))
                    scale = min(1.0, self.CLIP_BOUND / (norm + 1e-8))
                    clipped.append([p * scale for p in params])

                # DP Step 2: Average
                n = len(clipped)
                aggregated = [
                    np.mean([c[i] for c in clipped], axis=0)
                    for i in range(len(clipped[0]))
                ]

                # DP Step 3: Add Gaussian noise
                noisy = [
                    a + np.random.normal(0, self.NOISE_STD * self.CLIP_BOUND, a.shape)
                    for a in aggregated
                ]

                # Save model to disk
                self._save_model(noisy, server_round)

                # Update state
                _fl_state["round"]           = server_round
                _fl_state["last_aggregated"] = datetime.utcnow().isoformat()
                _fl_state["status"]          = "idle"

                return fl.common.ndarrays_to_parameters(noisy), {
                    "round": server_round, "clients": n
                }

            def aggregate_evaluate(
                self,
                server_round: int,
                results: list[tuple[ClientProxy, EvaluateRes]],
                failures: list,
            ):
                if not results:
                    return None, {}

                # Weighted average of client losses
                total_examples = sum(r.num_examples for _, r in results)
                weighted_loss  = sum(
                    r.loss * r.num_examples / total_examples
                    for _, r in results
                )
                avg_accuracy = sum(
                    r.metrics.get("accuracy", 0) * r.num_examples / total_examples
                    for _, r in results
                )

                _fl_state["accuracy"] = round(float(avg_accuracy), 4)
                self._save_metrics(server_round, float(weighted_loss), float(avg_accuracy))

                logger.info(
                    f"Round {server_round} eval — loss: {weighted_loss:.4f}, "
                    f"accuracy: {avg_accuracy:.4f}"
                )
                return weighted_loss, {"accuracy": avg_accuracy}

            def _save_model(self, params: list[np.ndarray], round_num: int):
                path_latest = MODEL_DIR / "global_model_latest.npz"
                path_round  = MODEL_DIR / f"global_model_round_{round_num:04d}.npz"
                np.savez(str(path_latest), *params)
                np.savez(str(path_round),  *params)
                logger.info(f"Global model saved: round {round_num}")

            def _save_metrics(self, round_num: int, loss: float, accuracy: float):
                path = MODEL_DIR / "metrics_history.json"
                history = []
                if path.exists():
                    with open(path) as f:
                        try:
                            data = json.load(f)
                            history = data.get("rounds", [])
                        except Exception:
                            history = []

                history.append({
                    "round":    round_num,
                    "loss":     round(loss, 6),
                    "accuracy": round(accuracy, 6),
                    "ts":       datetime.utcnow().isoformat(),
                })

                with open(path, "w") as f:
                    json.dump({"rounds": history}, f, indent=2)

        strategy = RakSetuFedAvgStrategy(
            min_fit_clients=MIN_CLIENTS,
            min_evaluate_clients=MIN_CLIENTS,
            min_available_clients=MIN_CLIENTS,
            fraction_fit=1.0,
            fraction_evaluate=1.0,
        )

        _fl_state["status"] = "listening"
        fl.server.start_server(
            server_address=f"0.0.0.0:{FLOWER_PORT}",
            strategy=strategy,
            config=fl.server.ServerConfig(num_rounds=100),
        )

    except ImportError:
        logger.warning("Flower (flwr) not installed — federated learning disabled")
        _fl_state["status"] = "disabled"
    except Exception as e:
        logger.error(f"Flower server error: {e}")
        _fl_state["status"] = "error"
