"""PyTorch LSTM RUL predictor for the Battery Digital Twin.

Architecture (matches proposal §E.1 Tier-C):
  - 2-layer LSTM, hidden=64
  - Input: (batch, 99, 7) — per-cycle summary features for cycles 2-100
  - Output: scalar log10(cycle_life)
  - Trained with MSE on log-transformed targets, MAPE measured on
    cycle-life predictions

Why LSTM and not just MLP: the proposal commits to LSTM as the trained
model. A summary-feature MLP would also work but loses the temporal
structure that LSTM is designed for; the time-series of per-cycle
summaries lets the model see fade trajectories rather than just averages.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn


# ---------------------------------------------------------------------------
# Architecture
# ---------------------------------------------------------------------------
class LstmRulModel(nn.Module):
    """2-layer LSTM → Dense → scalar log10(cycle_life)."""

    def __init__(self, input_dim: int = 7, hidden_dim: int = 64, num_layers: int = 2, dropout: float = 0.1):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.head = nn.Sequential(
            nn.Linear(hidden_dim, 32),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(32, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, T, F)
        out, _ = self.lstm(x)
        # Use the last timestep's hidden state
        return self.head(out[:, -1, :]).squeeze(-1)


# ---------------------------------------------------------------------------
# Standardisation — fit on train, apply to test
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class FeatureScaler:
    """Per-feature z-score normalisation. Stats are vectors of length F."""

    mean: np.ndarray  # (F,)
    std: np.ndarray   # (F,)

    @classmethod
    def fit(cls, X: np.ndarray) -> "FeatureScaler":
        # X shape: (N, T, F). Standardise per feature across all cells & timesteps.
        F = X.shape[-1]
        Xf = X.reshape(-1, F)
        mean = Xf.mean(axis=0)
        std = Xf.std(axis=0)
        std = np.where(std < 1e-8, 1.0, std)
        return cls(mean=mean, std=std)

    def transform(self, X: np.ndarray) -> np.ndarray:
        return (X - self.mean) / self.std

    def to_dict(self) -> dict:
        return {"mean": self.mean.tolist(), "std": self.std.tolist()}

    @classmethod
    def from_dict(cls, d: dict) -> "FeatureScaler":
        return cls(mean=np.asarray(d["mean"]), std=np.asarray(d["std"]))


# ---------------------------------------------------------------------------
# Training loop
# ---------------------------------------------------------------------------
@dataclass
class TrainResult:
    model: LstmRulModel
    scaler: FeatureScaler
    history: list[dict]
    final_train_loss: float
    final_val_loss: float


def train_model(
    X_train: np.ndarray,         # (N, T, F)
    y_train_log: np.ndarray,     # (N,) log10(cycle_life)
    X_val: np.ndarray,
    y_val_log: np.ndarray,
    *,
    epochs: int = 200,
    batch_size: int = 16,
    lr: float = 1e-3,
    weight_decay: float = 1e-4,
    hidden_dim: int = 64,
    num_layers: int = 2,
    dropout: float = 0.15,
    patience: int = 30,
    seed: int = 0,
    device: str = "cpu",
    verbose: bool = True,
) -> TrainResult:
    """Train with early stopping. Returns model + scaler + history."""
    torch.manual_seed(seed)
    np.random.seed(seed)

    scaler = FeatureScaler.fit(X_train)
    Xtr = torch.tensor(scaler.transform(X_train), dtype=torch.float32, device=device)
    Xva = torch.tensor(scaler.transform(X_val), dtype=torch.float32, device=device)
    ytr = torch.tensor(y_train_log, dtype=torch.float32, device=device)
    yva = torch.tensor(y_val_log, dtype=torch.float32, device=device)

    model = LstmRulModel(
        input_dim=Xtr.shape[-1],
        hidden_dim=hidden_dim,
        num_layers=num_layers,
        dropout=dropout,
    ).to(device)

    optim = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=weight_decay)
    loss_fn = nn.MSELoss()

    history: list[dict] = []
    best_val = float("inf")
    best_state = None
    best_epoch = 0
    no_improve = 0

    n = Xtr.shape[0]
    for epoch in range(1, epochs + 1):
        model.train()
        perm = torch.randperm(n, device=device)
        losses = []
        for start in range(0, n, batch_size):
            idx = perm[start : start + batch_size]
            xb, yb = Xtr[idx], ytr[idx]
            optim.zero_grad()
            pred = model(xb)
            loss = loss_fn(pred, yb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optim.step()
            losses.append(loss.item())
        train_loss = float(np.mean(losses))

        model.eval()
        with torch.no_grad():
            val_pred = model(Xva)
            val_loss = float(loss_fn(val_pred, yva).item())

        history.append({"epoch": epoch, "train_loss": train_loss, "val_loss": val_loss})

        if val_loss < best_val - 1e-5:
            best_val = val_loss
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
            best_epoch = epoch
            no_improve = 0
        else:
            no_improve += 1

        if verbose and (epoch % 20 == 0 or epoch == 1 or no_improve >= patience):
            print(f"  epoch {epoch:>4d}  train {train_loss:.4f}  val {val_loss:.4f}  best@{best_epoch} {best_val:.4f}")

        if no_improve >= patience:
            if verbose:
                print(f"  early stop at epoch {epoch} (no improvement for {patience} epochs)")
            break

    if best_state is not None:
        model.load_state_dict(best_state)

    return TrainResult(
        model=model,
        scaler=scaler,
        history=history,
        final_train_loss=history[-1]["train_loss"],
        final_val_loss=best_val,
    )


# ---------------------------------------------------------------------------
# Inference + persistence
# ---------------------------------------------------------------------------
def predict_cycles(model: LstmRulModel, scaler: FeatureScaler, X: np.ndarray, device: str = "cpu") -> np.ndarray:
    model.eval()
    with torch.no_grad():
        Xn = torch.tensor(scaler.transform(X), dtype=torch.float32, device=device)
        log_pred = model(Xn).cpu().numpy()
    return 10.0 ** log_pred


def save_checkpoint(path: Path, model: LstmRulModel, scaler: FeatureScaler, meta: dict) -> None:
    torch.save(
        {
            "state_dict": model.state_dict(),
            "scaler": scaler.to_dict(),
            "meta": meta,
            "arch": {
                "input_dim": model.lstm.input_size,
                "hidden_dim": model.lstm.hidden_size,
                "num_layers": model.lstm.num_layers,
            },
        },
        path,
    )


def load_checkpoint(path: Path, device: str = "cpu") -> tuple[LstmRulModel, FeatureScaler, dict]:
    ckpt = torch.load(path, map_location=device, weights_only=True)
    arch = ckpt["arch"]
    model = LstmRulModel(input_dim=arch["input_dim"], hidden_dim=arch["hidden_dim"], num_layers=arch["num_layers"]).to(device)
    model.load_state_dict(ckpt["state_dict"])
    scaler = FeatureScaler.from_dict(ckpt["scaler"])
    return model, scaler, ckpt.get("meta", {})
