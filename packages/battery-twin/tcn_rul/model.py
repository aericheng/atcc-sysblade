"""PyTorch TCN (dilated 1D-CNN) RUL predictor for the Battery Digital Twin.

Architecture:
  - Input: (batch, 99, 7) — per-cycle summary features for cycles 2-100
    (identical interface to lstm_rul so the data pipeline is shared)
  - Transpose to (batch, 7, 99) and run a stack of dilated Conv1d residual
    blocks (dilations 1/2/4/8, kernel 3, "same" padding) → GlobalAvgPool →
    Dense head → scalar log10(cycle_life)
  - Output: scalar log10(cycle_life)

Why dilated Conv1d and not LSTM:
  1. NPU-native — STM32N6 Neural-ART accelerates Conv1d/ReLU/Pool/Gemm;
     it does NOT accelerate LSTM/GRU (recurrent ops fall back to the M55
     CPU per ST X-CUBE-AI docs).
  2. Statically INT8-quantisable — onnxruntime quantize_static handles
     Conv/Gemm; the LSTM op only supports dynamic (weights-only) quant,
     so its INT8 "compression" never touched the recurrent core.
  3. Comparable accuracy — dilations 1..8 over a 99-step sequence give a
     receptive field that already covers the full fade trajectory, so the
     temporal structure the LSTM exploited is still captured.

Non-causal symmetric padding is used deliberately: at inference the full
99-cycle history is already available, so there is no need for causal
masking, and symmetric "same" padding keeps every layer length-preserving
(output_len = L for kernel 3 with padding = dilation).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import torch
import torch.nn as nn

# Reuse the exact FeatureScaler the LSTM path uses so train/eval parity holds.
from lstm_rul.model import FeatureScaler  # noqa: F401  (re-exported)


class _TcnResidualBlock(nn.Module):
    """Two dilated Conv1d layers + residual, length-preserving."""

    def __init__(self, c_in: int, c_out: int, kernel: int, dilation: int, dropout: float):
        super().__init__()
        pad = (kernel - 1) * dilation // 2  # 'same' padding (kernel odd → exact)
        self.conv1 = nn.Conv1d(c_in, c_out, kernel, padding=pad, dilation=dilation)
        self.relu1 = nn.ReLU()
        self.drop1 = nn.Dropout(dropout)
        self.conv2 = nn.Conv1d(c_out, c_out, kernel, padding=pad, dilation=dilation)
        self.relu2 = nn.ReLU()
        self.drop2 = nn.Dropout(dropout)
        self.downsample = nn.Conv1d(c_in, c_out, 1) if c_in != c_out else None
        self.relu_out = nn.ReLU()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        y = self.drop1(self.relu1(self.conv1(x)))
        y = self.drop2(self.relu2(self.conv2(y)))
        res = x if self.downsample is None else self.downsample(x)
        return self.relu_out(y + res)


class TcnRulModel(nn.Module):
    """Dilated 1D-CNN → GlobalAvgPool → Dense → scalar log10(cycle_life)."""

    def __init__(
        self,
        input_dim: int = 7,
        channels: tuple[int, ...] = (32, 32, 32, 48),
        kernel: int = 3,
        dropout: float = 0.15,
    ):
        super().__init__()
        blocks: list[nn.Module] = []
        c_prev = input_dim
        for i, c in enumerate(channels):
            blocks.append(_TcnResidualBlock(c_prev, c, kernel, dilation=2 ** i, dropout=dropout))
            c_prev = c
        self.tcn = nn.Sequential(*blocks)
        self.pool = nn.AdaptiveAvgPool1d(1)  # GlobalAveragePool over time
        self.head = nn.Sequential(
            nn.Linear(c_prev, 32),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(32, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, T, F) → (B, F, T) for Conv1d
        x = x.transpose(1, 2)
        x = self.tcn(x)
        x = self.pool(x).squeeze(-1)  # (B, C)
        return self.head(x).squeeze(-1)


@dataclass
class TrainResult:
    model: TcnRulModel
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
    epochs: int = 300,
    batch_size: int = 16,
    lr: float = 1e-3,
    weight_decay: float = 1e-4,
    channels: tuple[int, ...] = (32, 32, 32, 48),
    kernel: int = 3,
    dropout: float = 0.15,
    patience: int = 40,
    seed: int = 0,
    device: str = "cpu",
    verbose: bool = False,
) -> TrainResult:
    """Train with early stopping. Mirrors lstm_rul.model.train_model so the
    two architectures can be compared under an identical protocol."""
    torch.manual_seed(seed)
    np.random.seed(seed)

    scaler = FeatureScaler.fit(X_train)
    Xtr = torch.tensor(scaler.transform(X_train), dtype=torch.float32, device=device)
    Xva = torch.tensor(scaler.transform(X_val), dtype=torch.float32, device=device)
    ytr = torch.tensor(y_train_log, dtype=torch.float32, device=device)
    yva = torch.tensor(y_val_log, dtype=torch.float32, device=device)

    model = TcnRulModel(input_dim=Xtr.shape[-1], channels=channels, kernel=kernel, dropout=dropout).to(device)
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
            loss = loss_fn(model(xb), yb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optim.step()
            losses.append(loss.item())
        train_loss = float(np.mean(losses))

        model.eval()
        with torch.no_grad():
            val_loss = float(loss_fn(model(Xva), yva).item())
        history.append({"epoch": epoch, "train_loss": train_loss, "val_loss": val_loss})

        if val_loss < best_val - 1e-5:
            best_val = val_loss
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
            best_epoch = epoch
            no_improve = 0
        else:
            no_improve += 1
        if verbose and (epoch % 20 == 0 or epoch == 1):
            print(f"  epoch {epoch:>4d}  train {train_loss:.4f}  val {val_loss:.4f}  best@{best_epoch} {best_val:.4f}")
        if no_improve >= patience:
            if verbose:
                print(f"  early stop at epoch {epoch}")
            break

    if best_state is not None:
        model.load_state_dict(best_state)
    return TrainResult(model, scaler, history, history[-1]["train_loss"], best_val)


def predict_cycles(model: TcnRulModel, scaler: FeatureScaler, X: np.ndarray, device: str = "cpu") -> np.ndarray:
    model.eval()
    with torch.no_grad():
        Xn = torch.tensor(scaler.transform(X), dtype=torch.float32, device=device)
        log_pred = model(Xn).cpu().numpy()
    return 10.0 ** log_pred
