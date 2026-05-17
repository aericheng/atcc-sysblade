# Black Pill F411 pin map — Sysblade hybrid control

| Pin   | Peripheral | Function                          | Connects to                |
|-------|-----------|-----------------------------------|----------------------------|
| PA8   | TIM1_CH1  | PWM out — LFP path high-side      | UCC27282 ch1 PWM input     |
| PB13  | TIM1_CH1N | PWM out — LFP path low-side       | UCC27282 ch1 PWMN input    |
| PA0   | TIM2_CH1  | PWM out — supercap path high-side | UCC27282 ch2 PWM input     |
| PA1   | TIM2_CH2  | PWM out — supercap path low-side  | UCC27282 ch2 PWMN input    |
| PA2   | USART2_TX | Telemetry @ 115200                | Pi 5 USB-UART RX (GPIO 15) |
| PA3   | USART2_RX | (Optional) command-in from Pi 5   | Pi 5 USB-UART TX (GPIO 14) |
| PA4   | ADC1_IN4  | Hall sensor LFP current           | HASS 50-S Vout (or INA226 alt-route) |
| PA5   | ADC1_IN5  | Hall sensor supercap current      | HASS 50-S Vout (SC path)   |
| PA6   | ADC1_IN6  | V_bus voltage divider (1:10)      | DC bus + via 100k/10k      |
| PA7   | ADC1_IN7  | V_supercap voltage divider (1:10) | Supercap + via 100k/10k    |
| PB0   | GPIO_OUT  | K1 relay drive (40A bypass)       | 2N7000 gate → relay coil   |
| PB1   | GPIO_OUT  | Q3 precharge MOSFET gate          | IRFB4115 gate via UCC27282 |
| PB2   | EXTI2     | **E-STOP input** (active low)     | E-stop button + 10k pull-up |
| PB10  | I2C2_SCL  | (Optional) DS18B20 1-wire OR I2C  | Temp sensors / OLED        |
| PB11  | I2C2_SDA  | "                                 | "                          |
| PC13  | GPIO_OUT  | Status LED (active low on board)  | Onboard blue LED           |

## Notes

- TIM1 is advanced timer with complementary outputs + dead-time — required for half-bridge driver
- TIM2 is general-purpose; use CH1+CH2 instead of CH1+CH1N (TIM2 has no complementary mode)
  - **Implication**: TIM2's two channels need manually-inverted PWM via firmware; dead-time enforced in software per tick. Lower priority for first M3 build; can use single-ended drive initially.
- E-stop is **EXTI2** (PB2) → ISR sets `g_fault = 1`, main loop polls and disables PWM next tick (<1 ms)
- ADC sample timing: 100 cycles per sample × 4 channels × 1 kHz = 400k ADC cycles → use 12 MHz ADC clock (PCLK2/4) — sample window must complete in 1 ms
- USART2 TX is non-blocking via DMA so the 1 kHz loop is never stalled by telemetry
