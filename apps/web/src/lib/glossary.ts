/**
 * Plain-language glossary — single source of truth for the guide layer.
 *
 * Same catalogue idiom as TCO_LINE_ITEM_SOURCES in lib/tco.ts: typed keys,
 * one data file, rendered by presentational components (components/ui/plain.tsx).
 * Keys are ASCII string literals (logic tokens — never translate); only the
 * display fields are Traditional Chinese.
 *
 * Register: business-background readers (get TCO/ROI, not battery/EE/ML).
 * Every sentence must stay faithful to the numbers already rendered on the
 * site — this layer explains claims, it never re-derives or improves them.
 */

export type GlossaryKey =
  | "bbu"
  | "lfp"
  | "lic"
  | "soh"
  | "rul"
  | "c_rate"
  | "n_redundancy"
  | "hvdc"
  | "pue"
  | "tco"
  | "mape"
  | "pybamm_dfn"
  | "lstm"
  | "tcn"
  | "onnx_int8"
  | "uvlo"
  | "transient"
  | "graceful"
  | "severson"
  | "digital_twin"
  | "calendar_aging";

export interface GlossaryEntry {
  /** Display name, e.g. "BBU（電池備援單元）". */
  term: string;
  /** One-sentence plain-language definition, business-judge register. */
  plain: string;
  /** Optional「打個比方」analogy. */
  analogy?: string;
  /** English display fields (zh fields above are kept verbatim). */
  termEn: string;
  plainEn: string;
  analogyEn?: string;
}

export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  bbu: {
    term: "BBU（電池備援單元）",
    plain:
      "裝在機架裡的備用電池盒；市電一出狀況先由它頂住，讓伺服器有時間安全收尾。",
    analogy:
      "像大樓停電時自動亮起的緊急照明，只是它撐住的是一整排 AI 伺服器。",
    termEn: "BBU (battery backup unit)",
    plainEn:
      "A backup battery box mounted in the rack. When utility power has a problem, it carries the load first so servers have time to shut down safely.",
    analogyEn:
      "Like the emergency lights that come on when a building loses power, except what it holds up is a whole row of AI servers.",
  },
  lfp: {
    term: "LFP（磷酸鋰鐵電池）",
    plain: "以安全、耐用著稱的鋰電池化學體系，是本方案的「主力電池」。",
    analogy: "長跑選手——爆發力不是最強，但能穩定跑很多年。",
    termEn: "LFP (lithium iron phosphate battery)",
    plainEn:
      "A lithium battery chemistry known for safety and durability; it is the main battery in this design.",
    analogyEn:
      "A long-distance runner: not the strongest burst, but steady for many years.",
  },
  lic: {
    term: "LIC（鋰離子電容）",
    plain:
      "介於電池與電容之間的儲能元件，充放極快、循環壽命長（廠商宣稱值，本作品未驗證）；在本設計中主要承擔峰值與較高頻的功率擺盪（τ = 0.5 s 截止 0.32 Hz；1 Hz 時 LFP 仍承擔約三成）。",
    analogy: "短跑選手——爆發力極強、恢復極快，但不負責長時間輸出。",
    termEn: "LIC (lithium-ion capacitor)",
    plainEn:
      "A storage element between a battery and a capacitor, with very fast charge and discharge and long cycle life (manufacturer-claimed values, not verified in this work). In this design it mainly handles peaks and higher-frequency power swings (τ = 0.5 s, cutoff 0.32 Hz; at 1 Hz the LFP still carries about 30 %).",
    analogyEn:
      "A sprinter: very strong burst and very fast recovery, but not responsible for long-duration output.",
  },
  soh: {
    term: "SOH（健康度）",
    plain: "電池目前容量相對全新時的百分比；業界慣例低於 80 % 就該汰換。",
    analogy: "就是手機設定裡「電池健康度 85 %」的那個數字。",
    termEn: "SOH (state of health)",
    plainEn:
      "The battery's present capacity as a percentage of when it was new; by industry convention, below 80 % it should be replaced.",
    analogyEn:
      "The same number as \"Battery Health 85 %\" in a phone's settings.",
  },
  rul: {
    term: "RUL（剩餘壽命）",
    plain: "模型預測這顆電池「還能再用多少次循環」，是排程維修與汰換的依據。",
    analogy:
      "像車廠提醒「再 5,000 公里該保養」，只是由 AI 針對每一顆電池個別估算。",
    termEn: "RUL (remaining useful life)",
    plainEn:
      "The model's prediction of how many more cycles this battery can be used; it is the basis for scheduling maintenance and replacement.",
    analogyEn:
      "Like a car maker's reminder to \"service again in 5,000 km\", except estimated for each individual battery by AI.",
  },
  c_rate: {
    term: "C-rate（充放電倍率）",
    plain:
      "衡量電池「放電有多用力」的單位：1 C = 一小時放完整顆電池，數字越大對電池越傷，原廠規格書會給安全上限。",
    analogy: "像引擎轉速——偶爾拉高沒事，長期逼近紅線會縮短壽命。",
    termEn: "C-rate (charge/discharge rate)",
    plainEn:
      "A unit for how hard a battery is discharged: 1 C = emptying the whole battery in one hour. A higher number is harder on the battery, and the manufacturer's datasheet gives a safe upper limit.",
    analogyEn:
      "Like engine RPM: raising it briefly is fine, but running near the red line for long shortens life.",
  },
  n_redundancy: {
    term: "N-1 / N+1 冗餘",
    plain:
      "比實際需求多配一台備援，任一台故障時由其餘幾台分擔負載；「N-1 測試」就是故意拿掉一台，驗證剩下的仍能完成任務（本專案為模擬驗證）。",
    termEn: "N-1 / N+1 redundancy",
    plainEn:
      "Provide one more unit than the load needs, so that when any one unit fails the others share the load. An \"N-1 test\" deliberately removes one unit to verify the rest can still complete the task (verified by simulation in this project).",
  },
  hvdc: {
    term: "HVDC ±400 V（高壓直流換代）",
    plain:
      "資料中心供電正從 48 V 轉向 ±400 V 高壓直流的產業換代；設備若不相容，轉換期就得整批重買。",
    termEn: "HVDC ±400 V (high-voltage DC transition)",
    plainEn:
      "The industry shift in data-center power from 48 V to ±400 V high-voltage DC; equipment that is not compatible must be bought again in bulk during the transition.",
  },
  pue: {
    term: "PUE（能源使用效率）",
    plain:
      "資料中心的省電指標 = 總用電 ÷ IT 設備用電，越接近 1 越省；冷卻用電越多，數字越高。",
    termEn: "PUE (power usage effectiveness)",
    plainEn:
      "A data-center efficiency metric = total power ÷ IT equipment power. The closer to 1, the better; the more power cooling uses, the higher the number.",
  },
  tco: {
    term: "TCO（總持有成本）",
    plain:
      "買下去之後 10 年的總帳：採購 + 更換 + 停機損失 + 維運人力 + 改裝——而不是只看標價。",
    termEn: "TCO (total cost of ownership)",
    plainEn:
      "The 10-year total after purchase: acquisition + replacement + downtime loss + operations labor + retrofit, not just the sticker price.",
  },
  mape: {
    term: "MAPE（平均絕對百分比誤差）",
    plain: "衡量預測有多準：預測值平均偏離實際值的百分比，越低越準。",
    termEn: "MAPE (mean absolute percentage error)",
    plainEn:
      "A measure of how accurate a prediction is: the average percentage by which predictions deviate from actual values. Lower is more accurate.",
  },
  pybamm_dfn: {
    term: "PyBaMM / DFN（電池物理模擬）",
    plain:
      "學術界公認的開源電池模擬工具與其中最高精度的電化學方程式；我們用它模擬電池「內部」發生的事，而不是只看外部數據猜。",
    analogy: "像先在風洞裡吹過，才上路。",
    termEn: "PyBaMM / DFN (battery physics simulation)",
    plainEn:
      "An open-source battery simulation tool and its highest-fidelity electrochemical equations, both widely accepted in academia. We use it to simulate what happens inside the battery, rather than guessing from external data alone.",
    analogyEn:
      "Like testing in a wind tunnel before going on the road.",
  },
  lstm: {
    term: "LSTM（前一版基線模型，已由 TCN 取代）",
    plain:
      "一種擅長從時間序列找規律的 AI 模型；本專案前一版基線曾用它預測電池剩餘壽命，現行模型為 TCN。",
    termEn: "LSTM (previous baseline model, replaced by TCN)",
    plainEn:
      "An AI model good at finding patterns in time series. The previous baseline of this project used it to predict battery remaining life; the current model is TCN.",
  },
  tcn: {
    term: "TCN（時間序列 AI 模型）",
    plain:
      "一種擅長從時間序列找規律的 AI 模型（以多層擴張卷積讀取歷史）；這裡讀取電池每一次循環的健康紀錄，預測它還能用多久。",
    termEn: "TCN (time-series AI model)",
    plainEn:
      "An AI model good at finding patterns in time series (it reads history with stacked dilated convolutions). Here it reads each cycle's health record of a battery and predicts how long it can still be used.",
  },
  onnx_int8: {
    term: "ONNX / INT8（模型打包與瘦身）",
    plain:
      "把訓練好的 AI 模型「打包 + 壓縮」的標準做法，讓模型小到能放進設備內的微控制器、就地運算——不必每次預測都連雲端付費。",
    termEn: "ONNX / INT8 (model packaging and slimming)",
    plainEn:
      "The standard way to package and compress a trained AI model so it is small enough to run on the microcontroller inside the device, with no need to pay for a cloud call on every prediction.",
  },
  uvlo: {
    term: "UVLO（低電壓保護門檻）",
    plain:
      "電容電壓的安全底線，一旦低於它系統會自動切斷保護；工程上要證明最壞情況下離這條線仍有餘裕。",
    termEn: "UVLO (undervoltage lockout threshold)",
    plainEn:
      "The safety floor for capacitor voltage; below it the system cuts off automatically to protect itself. Engineering must show that even in the worst case there is still margin above this line.",
  },
  transient: {
    term: "瞬變（transient）",
    plain:
      "AI 伺服器的功率隨運算與通訊階段來回擺盪；Choukse et al. 2025（arXiv 2508.14318 §III-A）量到主要能量集中在 0.2–3 Hz。本作品頁面上的 ±30 %、每 100 ms 切換方波是自訂示意波形；「會造成設備重啟」是競賽期說法，本作品的模擬沒有證明。",
    analogy:
      "像家裡有人啟動大功率電器時電燈閃一下——只是這裡規模是 120 kW、而且不停發生。",
    termEn: "Transient",
    plainEn:
      "AI server power swings back and forth with compute and communication phases; Choukse et al. 2025 (arXiv 2508.14318 §III-A) measured most of the energy at 0.2-3 Hz. The ±30 %, 100 ms square wave shown on this site's pages is a custom illustrative waveform; \"causes equipment restarts\" is a claim made for the competition that this work's simulation does not prove.",
    analogyEn:
      "Like the lights flickering when someone at home starts a high-power appliance, except here the scale is 120 kW and it happens continuously.",
  },
  graceful: {
    term: "60 秒平緩降載（graceful shutdown）",
    plain:
      "市電中斷後，電池撐住供電 60 秒，讓 GPU 逐步降速、資料存檔完成後才關機——而不是硬斷電。",
    analogy: "像筆電沒電前先自動存檔再關機。",
    termEn: "60 s graceful shutdown",
    plainEn:
      "After utility power is lost, the battery sustains supply for 60 seconds so the GPUs step down gradually and data is saved before shutdown, instead of a hard power cut.",
    analogyEn:
      "Like a laptop that autosaves and then shuts down before the battery runs out.",
  },
  severson: {
    term: "Severson 2019（公開電池資料集）",
    plain:
      "MIT / Stanford 團隊公開的知名電池壽命資料集，上百顆電芯從全新實測到報廢；我們的模型以它訓練與校準——判斷基準是公開學術資料，不是自家黑盒子。",
    termEn: "Severson 2019 (public battery dataset)",
    plainEn:
      "A well-known public battery-life dataset from an MIT / Stanford team, with over a hundred cells tested from new to end of life. Our model is trained and calibrated on it, so the benchmark is public academic data, not our own black box.",
  },
  digital_twin: {
    term: "數位孿生（digital twin）",
    plain:
      "實體電池在電腦裡的「虛擬分身」，以物理方程式模擬其狀態與老化；可以先在分身上做實體很難做的實驗（例如故意弄壞一台）。",
    termEn: "Digital twin",
    plainEn:
      "A \"virtual copy\" of a physical battery in the computer, simulating its state and aging with physical equations; experiments that are hard to do on the real thing (for example, deliberately breaking one unit) can be run on the copy first.",
  },
  calendar_aging: {
    term: "日曆老化（calendar aging）",
    plain:
      "電池就算放著不用，也會隨時間自然變老（受溫度與電量水位影響）；備援電池大多時間在待機，所以「放著變老」往往比「用到變老」更早成為壽命瓶頸。",
    termEn: "Calendar aging",
    plainEn:
      "A battery ages over time even when it sits unused (affected by temperature and state of charge). Backup batteries spend most of their time on standby, so aging from sitting idle is often the life bottleneck before aging from use.",
  },
};

/** Canonical display order for glossary panels. */
export const GLOSSARY_ORDER: GlossaryKey[] = [
  "bbu",
  "transient",
  "lfp",
  "lic",
  "graceful",
  "n_redundancy",
  "soh",
  "rul",
  "c_rate",
  "calendar_aging",
  "digital_twin",
  "pybamm_dfn",
  "severson",
  "lstm",
  "tcn",
  "mape",
  "onnx_int8",
  "uvlo",
  "hvdc",
  "pue",
  "tco",
];

/** Entries for the given keys, deduped, in canonical GLOSSARY_ORDER. */
export function glossaryEntries(
  keys: GlossaryKey[],
): Array<GlossaryEntry & { key: GlossaryKey }> {
  const wanted = new Set(keys);
  return GLOSSARY_ORDER.filter((k) => wanted.has(k)).map((k) => ({
    key: k,
    ...GLOSSARY[k],
  }));
}
