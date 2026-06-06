"""
Hospital Flower Node Client
- Trains local model on hospital's own patient data
- Sends only gradient updates to aggregator (never raw data)
- Run one instance per hospital
"""
import os
import json
import logging
import argparse
import numpy as np
from pathlib import Path

logger = logging.getLogger("fl-node-client")
logging.basicConfig(level=logging.INFO)

AGGREGATOR_URL = os.getenv("FL_AGGREGATOR_URL", "localhost:9090")
HOSPITAL_ID    = os.getenv("HOSPITAL_ID", "hospital_demo_1")
MODEL_PATH     = Path(os.getenv("LOCAL_MODEL_PATH", "models/local_churn_xgb.pkl"))


def run_node_client():
    """Start a Flower client for this hospital node."""
    try:
        import flwr as fl
        import torch
        import torch.nn as nn
        from torch.utils.data import DataLoader, TensorDataset
    except ImportError:
        logger.error("flwr and torch required for federated client. pip install flwr torch")
        return

    class LocalChurnModel(nn.Module):
        """Lightweight MLP that mirrors XGBoost feature space."""
        def __init__(self, input_dim: int = 20):
            super().__init__()
            self.net = nn.Sequential(
                nn.Linear(input_dim, 64),
                nn.ReLU(),
                nn.Dropout(0.1),
                nn.Linear(64, 32),
                nn.ReLU(),
                nn.Linear(32, 1),
                nn.Sigmoid(),
            )

        def forward(self, x):
            return self.net(x)

    class RakSetuFlowerClient(fl.client.NumPyClient):
        def __init__(self, hospital_id: str):
            self.hospital_id = hospital_id
            self.model       = LocalChurnModel()
            self.criterion   = nn.BCELoss()
            self.optimizer   = torch.optim.Adam(self.model.parameters(), lr=1e-3)
            logger.info(f"Flower client initialized for hospital: {hospital_id}")

        def get_parameters(self, config):
            return [p.detach().numpy() for p in self.model.parameters()]

        def set_parameters(self, parameters):
            for p, new_p in zip(self.model.parameters(), parameters):
                p.data = torch.tensor(new_p)

        def fit(self, parameters, config):
            """Train model on local data for one FL round."""
            self.set_parameters(parameters)

            # Load local hospital data (never leaves this node)
            X_train, y_train = self._load_local_data()

            if X_train is None or len(X_train) == 0:
                logger.warning(f"No local training data for {self.hospital_id}")
                return self.get_parameters({}), 0, {}

            dataset    = TensorDataset(
                torch.tensor(X_train, dtype=torch.float32),
                torch.tensor(y_train, dtype=torch.float32).unsqueeze(1)
            )
            loader     = DataLoader(dataset, batch_size=32, shuffle=True)
            local_epochs = config.get("local_epochs", 3)

            self.model.train()
            total_loss = 0.0
            for epoch in range(local_epochs):
                for X_batch, y_batch in loader:
                    self.optimizer.zero_grad()
                    preds = self.model(X_batch)
                    loss  = self.criterion(preds, y_batch)
                    loss.backward()
                    self.optimizer.step()
                    total_loss += loss.item()

            avg_loss = total_loss / (len(loader) * local_epochs)
            logger.info(f"Hospital {self.hospital_id} — FL round loss: {avg_loss:.4f}")

            return self.get_parameters({}), len(X_train), {"loss": avg_loss}

        def evaluate(self, parameters, config):
            """Evaluate on local validation set."""
            self.set_parameters(parameters)

            X_val, y_val = self._load_local_data(split="val")
            if X_val is None or len(X_val) == 0:
                return 0.0, 0, {"accuracy": 0.0}

            self.model.eval()
            with torch.no_grad():
                X_t    = torch.tensor(X_val, dtype=torch.float32)
                preds  = self.model(X_t).squeeze().numpy()
                binary = (preds >= 0.5).astype(int)
                acc    = float(np.mean(binary == y_val))
                loss   = float(self.criterion(
                    torch.tensor(preds).unsqueeze(1),
                    torch.tensor(y_val, dtype=torch.float32).unsqueeze(1)
                ).item())

            logger.info(f"Hospital {self.hospital_id} — FL eval accuracy: {acc:.4f}")
            return loss, len(X_val), {"accuracy": acc}

        def _load_local_data(self, split: str = "train"):
            """
            Load hospital's local training data.
            In production: query local PostgreSQL for donor signals.
            In demo: generate synthetic data.
            """
            local_data_path = Path(f"data/{self.hospital_id}_{split}.npz")

            if local_data_path.exists():
                data = np.load(str(local_data_path))
                return data["X"], data["y"]

            # Demo: generate synthetic donor behavioral data
            logger.info(f"Generating synthetic data for {self.hospital_id}/{split}")
            n_samples = 200 if split == "train" else 50
            np.random.seed(hash(self.hospital_id + split) % 2**32)

            X = np.random.randn(n_samples, 20).astype(np.float32)
            # Simulate churn: donors who haven't donated in 90+ days are likely churned
            y = (X[:, 0] < -0.5).astype(np.float32)

            # Save for reproducibility
            local_data_path.parent.mkdir(exist_ok=True)
            np.savez(str(local_data_path), X=X, y=y)
            return X, y

    # Start Flower client
    client = RakSetuFlowerClient(HOSPITAL_ID)
    fl.client.start_numpy_client(
        server_address=AGGREGATOR_URL,
        client=client,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RakSetu Flower Node Client")
    parser.add_argument("--hospital-id",  default=HOSPITAL_ID)
    parser.add_argument("--aggregator",   default=AGGREGATOR_URL)
    args = parser.parse_args()

    os.environ["HOSPITAL_ID"]       = args.hospital_id
    os.environ["FL_AGGREGATOR_URL"] = args.aggregator

    logger.info(f"Starting FL node for hospital: {args.hospital_id}")
    run_node_client()
