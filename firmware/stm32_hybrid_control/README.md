# STM32 Hybrid Control Firmware Skeleton

Target: **STM32F411CEU6 "Black Pill"** (per `docs/BBU_IMPLEMENTATION_PLAN.md` §2.1 Lean BoM).

This is a **skeleton, not production firmware** — gives the team a starting point
for W2 that already contains the right state machine, LPF math, and pin map.
W2 work is to flesh out the HAL calls, integrate with the gate driver carrier
board, and bench-tune timings.

## What's here

- `main.c` — complete state machine + 1 kHz control loop + complementary PWM stub
- `pin_map.md` — Black Pill pin assignment matching §4.5 hardware
- `README.md` — this file (build / flash SOP)

## What's NOT here (manual W2 work)

- **STM32CubeIDE `.ioc` project file** — generate fresh: `File → New → STM32 Project → STM32F411CEU6`, then paste `main.c` over the generated stub
- **HAL_Init() pin config** — generate via CubeMX (TIM1 PWM CH1+CH1N, TIM2 PWM CH1+CH1N, ADC1 with DMA, USART2 for telemetry)
- **Clock tree** — HSE 25 MHz crystal, target 96 MHz core, 48 MHz USB (for UART CDC)
- **`hal_stub.h`** placeholders — replace with `stm32f4xx_hal.h`
- **DMA buffer for ADC** — 4-channel scan @ 1 kHz triggered by TIM3
- **Watchdog (IWDG)** — set to 100 ms timeout; main loop must reset before timeout

## Build / Flash SOP (W2 Tue 5/27)

1. Install STM32CubeIDE 1.15+ (free) on the lab laptop
2. New project: `STM32F411CEU6`, init all peripherals to default
3. Configure CubeMX:
   - **TIM1**: PWM CH1 / CH1N with dead-time = 500 ns, 20 kHz freq → LFP path
   - **TIM2**: same → supercap path
   - **TIM3**: 1 kHz, triggers ADC1 conversion
   - **ADC1**: 4 channels (Hall LFP, Hall SC, V_bus, V_sc), DMA circular
   - **USART2**: 115200 8N1 → telemetry to Pi 5
   - **GPIO**: PB0 = K1 relay drive, PB1 = Q3 precharge MOSFET gate, PB2 = E-stop input EXTI
4. Generate code, paste contents of `main.c` over `Core/Src/main.c`'s placeholder
5. Build, flash via DFU (USB-C) or ST-Link
6. Open `Putty` / serial monitor @ 115200 → see telemetry stream

## Bench test SOP (W2 Wed 5/28)

**Before connecting battery / supercap**, validate state machine on bench:

1. Signal generator → ADC1 ch3 (V_bus simulated 25.6 V via voltage divider)
2. Signal generator → ADC1 ch4 (V_sc simulated 0 V → ramp to 25 V)
3. Logic analyzer on K1 / Q3 GPIO + TIM1/TIM2 PWM outputs
4. Expected sequence:
   - **t=0**: state INIT, all outputs low
   - **t=0+50ms**: state PRECHARGE, Q3 high
   - **when V_sc reaches > 24.3 V**: state BYPASS_RELAY, K1 high, Q3 low
   - **+10s ramp**: PWM duty linearly 0 → ~0.6 (LFP), 0 → ~0.4 (SC)
   - **steady state**: PWM duty tracks p_total_w via LPF τ=0.5s

If any transition is wrong, **DON'T connect battery** — fix firmware first.

## Cross-references

- §4.5 hardware schematic (MOSFET + gate driver)
- §4.5.5 precharge state machine spec (this firmware implements it)
- `scripts/hybrid_control_emulator.py` — same math, Python — use to validate
  LPF coefficient choices before flashing
