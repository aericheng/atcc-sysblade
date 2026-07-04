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
}

export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  bbu: {
    term: "BBU（電池備援單元）",
    plain:
      "裝在機架裡的備用電池盒；市電一出狀況先由它頂住，讓伺服器有時間安全收尾。",
    analogy:
      "像大樓停電時自動亮起的緊急照明，只是它撐住的是一整排 AI 伺服器。",
  },
  lfp: {
    term: "LFP（磷酸鋰鐵電池）",
    plain: "以安全、耐用著稱的鋰電池化學體系，是本方案的「主力電池」。",
    analogy: "長跑選手——爆發力不是最強，但能穩定跑很多年。",
  },
  lic: {
    term: "LIC（鋰離子電容）",
    plain:
      "介於電池與電容之間的儲能元件，充放極快、可承受數十萬次循環，專門吸收毫秒級的功率尖峰。",
    analogy: "短跑選手——爆發力極強、恢復極快，但不負責長時間輸出。",
  },
  soh: {
    term: "SOH（健康度）",
    plain: "電池目前容量相對全新時的百分比；業界慣例低於 80 % 就該汰換。",
    analogy: "就是手機設定裡「電池健康度 85 %」的那個數字。",
  },
  rul: {
    term: "RUL（剩餘壽命）",
    plain: "模型預測這顆電池「還能再用多少次循環」，是排程維修與汰換的依據。",
    analogy:
      "像車廠提醒「再 5,000 公里該保養」，只是由 AI 針對每一顆電池個別估算。",
  },
  c_rate: {
    term: "C-rate（充放電倍率）",
    plain:
      "衡量電池「放電有多用力」的單位：1 C = 一小時放完整顆電池，數字越大對電池越傷，原廠規格書會給安全上限。",
    analogy: "像引擎轉速——偶爾拉高沒事，長期逼近紅線會縮短壽命。",
  },
  n_redundancy: {
    term: "N-1 / N+1 冗餘",
    plain:
      "比實際需求多配一台備援，任一台故障其餘照常運作、服務不中斷；「N-1 測試」就是故意拿掉一台來驗證這件事。",
  },
  hvdc: {
    term: "HVDC ±400 V（高壓直流換代）",
    plain:
      "資料中心供電正從 48 V 轉向 ±400 V 高壓直流的產業換代；設備若不相容，轉換期就得整批重買。",
  },
  pue: {
    term: "PUE（能源使用效率）",
    plain:
      "資料中心的省電指標 = 總用電 ÷ IT 設備用電，越接近 1 越省；冷卻用電越多，數字越高。",
  },
  tco: {
    term: "TCO（總持有成本）",
    plain:
      "買下去之後 10 年的總帳：採購 + 更換 + 停機損失 + 維運人力 + 改裝——而不是只看標價。",
  },
  mape: {
    term: "MAPE（平均絕對百分比誤差）",
    plain: "衡量預測有多準：預測值平均偏離實際值的百分比，越低越準。",
  },
  pybamm_dfn: {
    term: "PyBaMM / DFN（電池物理模擬）",
    plain:
      "學術界公認的開源電池模擬工具與其中最高精度的電化學方程式；我們用它模擬電池「內部」發生的事，而不是只看外部數據猜。",
    analogy: "像先在風洞裡吹過，才上路。",
  },
  lstm: {
    term: "LSTM（時間序列 AI 模型）",
    plain:
      "一種擅長從時間序列找規律的 AI 模型；這裡讀取電池每一次循環的健康紀錄，預測它還能用多久。",
  },
  onnx_int8: {
    term: "ONNX / INT8（模型打包與瘦身）",
    plain:
      "把訓練好的 AI 模型「打包 + 壓縮」的標準做法，讓模型小到能放進設備內的微控制器、就地運算——不必每次預測都連雲端付費。",
  },
  uvlo: {
    term: "UVLO（低電壓保護門檻）",
    plain:
      "電容電壓的安全底線，一旦低於它系統會自動切斷保護；工程上要證明最壞情況下離這條線仍有餘裕。",
  },
  transient: {
    term: "瞬變（transient）",
    plain:
      "AI 伺服器在毫秒之間功率忽高忽低的劇烈抖動（GB200 機架可達 ±30 %）；傳統電力設備反應不過來，會造成電壓驟降甚至設備重啟。",
    analogy:
      "像家裡有人啟動大功率電器時電燈閃一下——只是這裡規模是 120 kW、而且不停發生。",
  },
  graceful: {
    term: "60 秒平緩降載（graceful shutdown）",
    plain:
      "市電中斷後，電池撐住供電 60 秒，讓 GPU 逐步降速、資料存檔完成後才關機——而不是硬斷電。",
    analogy: "像筆電沒電前先自動存檔再關機。",
  },
  severson: {
    term: "Severson 2019（公開電池資料集）",
    plain:
      "MIT / Stanford 團隊公開的知名電池壽命資料集，上百顆電芯從全新實測到報廢；我們的模型以它訓練與校準——判斷基準是公開學術資料，不是自家黑盒子。",
  },
  digital_twin: {
    term: "數位孿生（digital twin）",
    plain:
      "實體電池在電腦裡的「虛擬分身」，以物理方程式模擬其狀態與老化；可以先在分身上做實體很難做的實驗（例如故意弄壞一台）。",
  },
  calendar_aging: {
    term: "日曆老化（calendar aging）",
    plain:
      "電池就算放著不用，也會隨時間自然變老（受溫度與電量水位影響）；備援電池大多時間在待機，所以「放著變老」往往比「用到變老」更早成為壽命瓶頸。",
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
