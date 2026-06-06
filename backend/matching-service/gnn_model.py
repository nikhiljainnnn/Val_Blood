"""
Graph Neural Network for donor-patient compatibility re-ranking.
Uses PyTorch Geometric GraphSAGE on a bipartite donor-patient graph.
"""
import os
import logging
import numpy as np
from pathlib import Path

logger = logging.getLogger("gnn-model")

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torch_geometric.nn import SAGEConv
    from torch_geometric.data import Data
    TORCH_AVAILABLE = True
except ImportError:
    logger.warning("PyTorch Geometric not available — GNN re-ranking disabled")
    TORCH_AVAILABLE = False


if TORCH_AVAILABLE:
    class RakSetuGNN(nn.Module):
        """
        Bipartite graph encoder for donor-patient matching.

        Nodes: patients + donors (different node types via masking)
        Edges: compatibility connections with 16-dim antigen features
        Output: per-edge compatibility score refined by neighborhood context
        """
        def __init__(
            self,
            in_channels: int = 32,
            hidden:      int = 64,
            out:         int = 32,
        ):
            super().__init__()
            self.conv1 = SAGEConv(in_channels, hidden)
            self.conv2 = SAGEConv(hidden, out)
            self.bn1   = nn.BatchNorm1d(hidden)
            self.bn2   = nn.BatchNorm1d(out)

            # Edge MLP: takes concatenated node embeddings + antigen edge features
            # 16 antigen binary features + 2 * out (node embeddings)
            self.edge_mlp = nn.Sequential(
                nn.Linear(16 + 2 * out, 64),
                nn.ReLU(),
                nn.Dropout(0.1),
                nn.Linear(64, 32),
                nn.ReLU(),
                nn.Linear(32, 1),
                nn.Sigmoid(),
            )

        def forward(
            self,
            x: "torch.Tensor",            # (num_nodes, in_channels)
            edge_index: "torch.Tensor",   # (2, num_edges)
            edge_attr: "torch.Tensor",    # (num_edges, 16)
        ) -> "torch.Tensor":              # (num_edges, 1)
            # Graph convolutions
            x = F.relu(self.bn1(self.conv1(x, edge_index)))
            x = F.dropout(x, p=0.1, training=self.training)
            x = self.bn2(self.conv2(x, edge_index))

            # Edge prediction: concatenate source/target embeddings + antigen features
            src, dst = edge_index
            edge_feats = torch.cat([x[src], x[dst], edge_attr], dim=-1)
            return self.edge_mlp(edge_feats)


class GNNRanker:
    """
    Wrapper around RakSetuGNN for inference.
    Falls back to compatibility score if model not loaded.
    """
    MODEL_PATH = Path(os.getenv("GNN_MODEL_PATH", "models/gnn_weights.pt"))

    def __init__(self):
        self.model     = None
        self.is_loaded = False
        self._try_load()

    def _try_load(self):
        if not TORCH_AVAILABLE:
            return
        if not self.MODEL_PATH.exists():
            logger.warning(f"GNN weights not found at {self.MODEL_PATH} — using score-only ranking")
            return
        try:
            self.model = RakSetuGNN()
            state = torch.load(self.MODEL_PATH, map_location="cpu")
            self.model.load_state_dict(state)
            self.model.eval()
            self.is_loaded = True
            logger.info("GNN model loaded successfully")
        except Exception as e:
            logger.error(f"GNN load failed: {e}")

    async def rerank(
        self,
        scored_donors: list[dict],
        patient_id: str,
        donor_ids: list[str],
    ) -> list[dict]:
        """
        Re-rank donors using GNN embeddings.
        If model unavailable, returns original ranking.
        """
        if not self.is_loaded or not scored_donors:
            return scored_donors

        try:
            with torch.no_grad():
                # Build synthetic node features (32-dim)
                # In production: loaded from feature store
                num_nodes = 1 + len(scored_donors)  # 1 patient + N donors
                x = torch.randn(num_nodes, 32)

                # Edges: patient(0) → donor(i+1)
                src = [0] * len(scored_donors)
                dst = list(range(1, len(scored_donors) + 1))
                edge_index = torch.tensor([src, dst], dtype=torch.long)

                # Edge attributes: antigen mismatch vector (16-dim)
                edge_attrs = []
                for d in scored_donors:
                    # Encode: score + mismatch_count as proxy (extend with real antigens)
                    attr = np.zeros(16, dtype=np.float32)
                    attr[0] = d["score"]
                    attr[1] = d["mismatch_count"] / 15.0
                    edge_attrs.append(attr)
                edge_attr = torch.tensor(np.array(edge_attrs), dtype=torch.float32)

                gnn_scores = self.model(x, edge_index, edge_attr).squeeze().numpy()

            # Blend GNN score with compatibility score (70/30)
            for i, d in enumerate(scored_donors):
                d["score"] = round(0.7 * float(gnn_scores[i]) + 0.3 * d["score"], 4)

            return sorted(scored_donors, key=lambda x: x["score"], reverse=True)

        except Exception as e:
            logger.error(f"GNN rerank failed: {e} — falling back to score-only")
            return scored_donors
