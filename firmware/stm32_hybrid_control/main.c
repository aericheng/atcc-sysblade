/*
 * Sysblade hybrid control firmware — STM32F411 "Black Pill"
 *
 * Implements:
 *   - Precharge state machine (INIT → PRECHARGE → BYPASS → RAMP → RUNNING → FAULT)
 *     per docs/BBU_IMPLEMENTATION_PLAN.md §4.5.5
 *   - First-order complementary filter (LPF τ=0.5 s) splitting load between
 *     LFP and supercap paths, mirroring scripts/hybrid_control_emulator.py
 *   - 1 kHz inner loop (TIM3 → ADC1 DMA → control_tick → TIM1/TIM2 PWM update)
 *   - 10 Hz telemetry uplink to Pi 5 over USART2
 *   - E-stop EXTI on PB2 → fault state, all PWM = 0 in < 1 ms
 *
 * (!) SKELETON — uses placeholder hal_stub.h. Replace with stm32f4xx_hal.h and
 * CubeMX-generated pin init before flashing. See README.md.
 */

#include "hal_stub.h"   /* Replace with stm32f4xx_hal.h in real project */
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

/* ===== Configuration constants ====================================== */

/* Control loop tick (1 kHz) — same as hybrid_control_emulator.py dt_s */
#define LOOP_HZ           1000.0f
#define LOOP_DT_S         (1.0f / LOOP_HZ)

/* LPF time constant — matches §1.3 sim SPLIT_FILTER_TAU_S = 0.5 s */
#define LPF_TAU_S         0.5f

/* L3 PWM ramp duration (precharge done → full duty) */
#define RAMP_TAU_S        10.0f

/* Precharge timeout — if v_sc fails to reach threshold in this time, FAULT */
#define PRECHARGE_TIMEOUT_S   30.0f

/* L1 done threshold — supercap voltage must reach 95% of bus before closing K1 */
#define PRECHARGE_DONE_FRACTION  0.95f

/* PWM duty clamps — IR2110 fallback wants 5–95 % to keep bootstrap charged */
#define DUTY_MIN          0.05f
#define DUTY_MAX          0.95f

/* Thermal cutout (DS18B20 — if added) */
#define TEMP_LFP_WARN_C   50.0f
#define TEMP_LFP_TRIP_C   60.0f

/* ADC scaling — voltage divider 100k:10k → factor 11 + Vref 3.3 V / 4096 */
#define V_BUS_SCALE       (11.0f * 3.3f / 4096.0f)
#define V_SC_SCALE        V_BUS_SCALE
/* Hall sensor: HASS 50-S → 0.625 V / A, ref 2.5 V */
#define I_HALL_SCALE      (3.3f / 4096.0f / 0.625f)
#define I_HALL_OFFSET_V   2.5f

/* ===== Globals — minimal, control loop owns ========================== */

typedef enum {
    ST_INIT = 0,
    ST_PRECHARGE,
    ST_BYPASS_RELAY,
    ST_RAMP_PWM,
    ST_RUNNING,
    ST_FAULT,
} CtrlState;

static volatile CtrlState g_state = ST_INIT;
static volatile bool g_fault = false;       /* set by E-stop ISR */
static uint32_t g_state_entry_tick = 0;
static uint32_t g_tick_counter = 0;          /* incremented every 1 ms */

/* Telemetry snapshot — populated by control loop, read by USART task */
typedef struct {
    float v_bus;
    float v_sc;
    float i_lfp;
    float i_sc;
    float p_total;
    float p_lfp_filt;
    float duty_lfp;
    float duty_sc;
    uint8_t state;
    uint8_t fault_flags;
} Telemetry;

static volatile Telemetry g_tel = {0};

/* LPF state */
static float g_p_lfp_filt = 0.0f;
static float g_ramp_progress = 0.0f;

/* ADC DMA buffer — TIM3 triggers 4-channel scan every 1 ms */
static volatile uint16_t g_adc_buf[4] = {0};
#define ADC_IDX_I_LFP   0
#define ADC_IDX_I_SC    1
#define ADC_IDX_V_BUS   2
#define ADC_IDX_V_SC    3

/* ===== Forward decls ================================================ */

static void enter_state(CtrlState s);
static void pwm_set_duty(float duty_lfp, float duty_sc);
static void k1_relay(bool closed);
static void q3_precharge(bool enabled);
static void all_pwm_off(void);

/* ===== Helpers ====================================================== */

static inline float clampf(float x, float lo, float hi) {
    if (x < lo) return lo;
    if (x > hi) return hi;
    return x;
}

static inline float adc_to_v_bus(uint16_t raw)  { return (float)raw * V_BUS_SCALE; }
static inline float adc_to_v_sc(uint16_t raw)   { return (float)raw * V_SC_SCALE;  }
static inline float adc_to_i(uint16_t raw) {
    return ((float)raw * 3.3f / 4096.0f - I_HALL_OFFSET_V) / 0.625f;
}

static void enter_state(CtrlState s) {
    g_state = s;
    g_state_entry_tick = g_tick_counter;
}

/* ===== 1 kHz control tick =========================================== */

void control_tick(void) {
    g_tick_counter++;

    /* Always read ADC first */
    float v_bus = adc_to_v_bus(g_adc_buf[ADC_IDX_V_BUS]);
    float v_sc  = adc_to_v_sc(g_adc_buf[ADC_IDX_V_SC]);
    float i_lfp = adc_to_i(g_adc_buf[ADC_IDX_I_LFP]);
    float i_sc  = adc_to_i(g_adc_buf[ADC_IDX_I_SC]);
    float p_total = (i_lfp + i_sc) * v_bus;

    /* E-stop check — fault state is sticky, must reset to clear */
    if (g_fault) {
        all_pwm_off();
        k1_relay(false);
        q3_precharge(false);
        enter_state(ST_FAULT);
    }

    uint32_t in_state_ms = g_tick_counter - g_state_entry_tick;

    switch (g_state) {

    case ST_INIT:
        all_pwm_off();
        k1_relay(false);
        q3_precharge(false);
        if (v_bus > 20.0f) {
            /* LFP bus is up (operator armed contactor) → start precharge */
            enter_state(ST_PRECHARGE);
        }
        break;

    case ST_PRECHARGE:
        all_pwm_off();
        k1_relay(false);
        q3_precharge(true);   /* fully on, current limited by 5 Ω resistor */
        if (v_sc >= v_bus * PRECHARGE_DONE_FRACTION) {
            enter_state(ST_BYPASS_RELAY);
        } else if (in_state_ms > (uint32_t)(PRECHARGE_TIMEOUT_S * 1000.0f)) {
            g_fault = true;   /* precharge failed — short or open in SC bank */
        }
        break;

    case ST_BYPASS_RELAY:
        all_pwm_off();
        k1_relay(true);
        if (in_state_ms > 100) {        /* 100 ms relay settling */
            q3_precharge(false);         /* drop precharge path */
            g_ramp_progress = 0.0f;
            enter_state(ST_RAMP_PWM);
        }
        break;

    case ST_RAMP_PWM:
        /* Same control law as RUNNING, but scaled by ramp_progress */
    case ST_RUNNING:
    {
        /* LPF: y[n] = α x[n] + (1-α) y[n-1]; α = dt/(τ+dt) */
        const float alpha = LOOP_DT_S / (LPF_TAU_S + LOOP_DT_S);
        g_p_lfp_filt = alpha * p_total + (1.0f - alpha) * g_p_lfp_filt;

        float duty_lfp_raw = 1.0f;
        if (fabsf(p_total) > 1.0f) {
            duty_lfp_raw = fmaxf(0.0f, g_p_lfp_filt) / fabsf(p_total);
        }
        duty_lfp_raw = clampf(duty_lfp_raw, DUTY_MIN, DUTY_MAX);

        float scale = 1.0f;
        if (g_state == ST_RAMP_PWM) {
            g_ramp_progress = fminf(1.0f, g_ramp_progress + LOOP_DT_S / RAMP_TAU_S);
            scale = g_ramp_progress;
            if (g_ramp_progress >= 1.0f) {
                enter_state(ST_RUNNING);
            }
        }

        float duty_lfp = duty_lfp_raw * scale;
        float duty_sc  = (1.0f - duty_lfp_raw) * scale;
        pwm_set_duty(duty_lfp, duty_sc);

        g_tel.duty_lfp = duty_lfp;
        g_tel.duty_sc = duty_sc;
        break;
    }

    case ST_FAULT:
        all_pwm_off();
        k1_relay(false);
        q3_precharge(false);
        /* Recovery requires power cycle or manual fault clear via USART command */
        break;
    }

    /* Always update telemetry struct (10 Hz uplink reads atomically) */
    g_tel.v_bus = v_bus;
    g_tel.v_sc = v_sc;
    g_tel.i_lfp = i_lfp;
    g_tel.i_sc = i_sc;
    g_tel.p_total = p_total;
    g_tel.p_lfp_filt = g_p_lfp_filt;
    g_tel.state = (uint8_t)g_state;
    g_tel.fault_flags = g_fault ? 1 : 0;
}

/* ===== Interrupt handlers =========================================== */

/* TIM3 update interrupt — fires every 1 ms, triggers ADC, runs control tick */
void TIM3_IRQHandler(void) {
    /* HAL_TIM_IRQHandler(&htim3); */    /* clears flag */
    /* HAL_ADC_Start_DMA(&hadc1, ...); */ /* already started circular at boot */
    control_tick();
}

/* E-stop external interrupt — PB2 falling edge */
void EXTI2_IRQHandler(void) {
    /* HAL_GPIO_EXTI_IRQHandler(GPIO_PIN_2); */
    g_fault = true;
    /* Immediately disable PWM in ISR — don't wait for next control tick */
    all_pwm_off();
}

/* USART2 TX-complete — chain next chunk if pending (DMA-based telemetry) */
void USART2_IRQHandler(void) {
    /* HAL_UART_IRQHandler(&huart2); */
}

/* ===== Telemetry (10 Hz, USART2 TX via DMA) ========================= */

static char tel_buf[160];

void telemetry_send(void) {
    /* Atomic read snapshot to avoid torn reads (ISR vs main loop) */
    __disable_irq();
    Telemetry t = g_tel;
    __enable_irq();

    int n = snprintf(tel_buf, sizeof(tel_buf),
        "{\"v_bus\":%.2f,\"v_sc\":%.2f,\"i_lfp\":%.2f,\"i_sc\":%.2f,"
        "\"p_total\":%.1f,\"p_lfp_filt\":%.1f,\"duty_lfp\":%.3f,"
        "\"duty_sc\":%.3f,\"state\":%u,\"fault\":%u}\r\n",
        t.v_bus, t.v_sc, t.i_lfp, t.i_sc,
        t.p_total, t.p_lfp_filt, t.duty_lfp,
        t.duty_sc, t.state, t.fault_flags);
    if (n > 0 && n < (int)sizeof(tel_buf)) {
        /* HAL_UART_Transmit_DMA(&huart2, (uint8_t*)tel_buf, n); */
    }
}

/* ===== Output helpers (replace stubs with real HAL_TIM / HAL_GPIO calls) === */

static void all_pwm_off(void) {
    /* HAL_TIM_PWM_Stop(&htim1, TIM_CHANNEL_1); */
    /* HAL_TIMEx_PWMN_Stop(&htim1, TIM_CHANNEL_1); */
    /* HAL_TIM_PWM_Stop(&htim2, TIM_CHANNEL_1); */
    /* HAL_TIM_PWM_Stop(&htim2, TIM_CHANNEL_2); */
}

static void pwm_set_duty(float duty_lfp, float duty_sc) {
    /* Convert [0,1] → CCR value in [0, TIM_ARR]. TIM1/TIM2 ARR set to
     * 4799 by CubeMX (96 MHz / 4800 = 20 kHz PWM). */
    uint32_t ccr_lfp = (uint32_t)(duty_lfp * 4799.0f);
    uint32_t ccr_sc  = (uint32_t)(duty_sc  * 4799.0f);
    (void)ccr_lfp; (void)ccr_sc;
    /* __HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_1, ccr_lfp); */
    /* __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, ccr_sc); */
}

static void k1_relay(bool closed) {
    /* HAL_GPIO_WritePin(GPIOB, GPIO_PIN_0, closed ? GPIO_PIN_SET : GPIO_PIN_RESET); */
    (void)closed;
}

static void q3_precharge(bool enabled) {
    /* HAL_GPIO_WritePin(GPIOB, GPIO_PIN_1, enabled ? GPIO_PIN_SET : GPIO_PIN_RESET); */
    (void)enabled;
}

/* ===== main() ======================================================= */

int main(void) {
    /* HAL_Init(); SystemClock_Config(); MX_GPIO_Init(); MX_DMA_Init(); */
    /* MX_TIM1_Init(); MX_TIM2_Init(); MX_TIM3_Init(); MX_ADC1_Init(); */
    /* MX_USART2_UART_Init(); */

    /* HAL_ADC_Start_DMA(&hadc1, (uint32_t*)g_adc_buf, 4); */
    /* HAL_TIM_Base_Start_IT(&htim3); */
    /* HAL_NVIC_EnableIRQ(EXTI2_IRQn); */

    /* Watchdog — main loop must reset it; if frozen, MCU reboots */
    /* HAL_IWDG_Init(...); */

    uint32_t last_tel_tick = 0;
    while (1) {
        /* HAL_IWDG_Refresh(&hiwdg); */

        /* 10 Hz telemetry */
        if ((g_tick_counter - last_tel_tick) >= 100) {
            telemetry_send();
            last_tel_tick = g_tick_counter;
        }

        /* Idle — main loop is doing nothing time-critical; control loop is in ISR */
        /* __WFI(); */
    }
}
