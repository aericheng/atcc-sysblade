"""TCN / 1D-CNN RUL predictor — production edge model.

Why this package exists alongside lstm_rul: the STM32N6 Neural-ART NPU does
not accelerate LSTM/GRU recurrent ops (they fall back to the Cortex-M55
CPU), and the onnxruntime LSTM op cannot be statically INT8-quantised. A
dilated 1D-CNN (TCN) over the same (99, 7) per-cycle feature sequence is
NPU-native (Conv1d / ReLU / Pool / Gemm), statically quantisable, and
reaches comparable cycle-life accuracy. This is the model the production
edge path deploys; lstm_rul is retained as the competition-era baseline.
"""
