import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { Activity, BarChart3, Cpu, ArrowRight, Zap } from "lucide-react";
import { Disclosure } from "@/components/ui/disclosure";
import { PlainNote, PlainInline, GlossaryPanel } from "@/components/ui/plain";
import { SectionHeader, FeatureRow } from "@/components/ui/section";
import { CountUp } from "@/components/motion";
import fs from "node:fs/promises";
import path from "node:path";

interface ModelValidationLite {
  metrics: { test_mape_pct: number };
  latency: { p99_ms: number; p50_ms: number };
}

async function loadModelValidation(): Promise<ModelValidationLite | null> {
  try {
    const file = path.join(process.cwd(), "public", "scenarios", "model_validation.json");
    return JSON.parse(await fs.readFile(file, "utf-8"));
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const mv = await loadModelValidation();
  return (
    <div className="space-y-24 sm:space-y-32 reveal-stagger">
      {/* Hero — bold gradient headline over a faint grid + glow backdrop. */}
      <section className="relative pt-8 sm:pt-14 pb-2">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          <div className="absolute inset-0 bg-grid opacity-70" />
          <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-primary/20 blur-[120px]" />
          <div className="absolute top-10 right-1/4 h-64 w-64 rounded-full bg-accent/10 blur-[120px]" />
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-muted mb-7 backdrop-blur">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          對齊 OCP Mt. Diablo 400 規格 · LFP + LIC 混合 · 2026 Q3 設計凍結目標
        </div>
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-semibold tracking-tight leading-[1.06] max-w-4xl text-balance">
          混合能量緩衝，因應{" "}
          <span className="gradient-text">AI 機架毫秒級瞬變</span>
        </h1>
        <p className="mt-6 max-w-2xl text-base sm:text-lg text-muted leading-relaxed">
          Sysblade HyperBuffer 結合 <span className="text-foreground font-medium">LFP 電芯</span>、{" "}
          <span className="text-foreground font-medium">鋰離子電容</span> 與內嵌的{" "}
          <span className="text-foreground font-medium">電池數位孿生</span>，吸收 GB200/GB300 機架對電網施加的{" "}
          <span className="text-foreground">±30 % 功率波動</span> — 並將這些資料轉化為提供給營運方的 SaaS 服務。
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/twin"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition glow-primary"
          >
            觀看物理模擬展示 <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/tco"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface/60 px-5 py-2.5 text-sm font-medium hover:bg-surface transition"
          >
            執行 TCO 計算器
          </Link>
        </div>
        <PlainNote className="mt-8 max-w-2xl">
          AI 伺服器的用電像心電圖一樣劇烈跳動，傳統備援電池反應不過來。我們把「反應快的電容」和「耐用的電池」裝進同一個機架單元，再用一套軟體預測每一顆電池還能用多久 —
          硬體解決斷電風險，軟體變成長期的 SaaS 服務。
        </PlainNote>
      </section>

      {/* Plain-language glossary for this page's recurring terms. */}
      <GlossaryPanel
        termKeys={["transient", "bbu", "lfp", "lic", "digital_twin", "tco", "hvdc", "soh"]}
      />

      {/* Headline numbers from PyBaMM scenarios — set on a distinct band. */}
      <section className="section-band rounded-3xl border border-border p-6 sm:p-10">
        <div className="text-xs uppercase tracking-[0.22em] text-accent mb-1">
          主要成果
        </div>
        <div className="text-xs text-muted mb-6">PyBaMM DFN 模擬 · 離線推導</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {[
            {
              value: 3.5, decimals: 1, prefix: "", suffix: "×",
              label: (<>在 GB200 瞬變下降低 <span className="text-foreground font-medium">電芯電壓波動</span></>),
              plain: "電壓抖動小 3.5 倍 — 電壓穩，設備就不會被突波弄到重啟。",
              tone: "from-primary to-accent",
            },
            {
              value: 5.7, decimals: 1, prefix: "", suffix: "×",
              label: (<>LIC 分流後降低 <span className="text-foreground font-medium">LFP 的功率應力</span></>),
              plain: "最猛的功率衝擊由電容代打，主電池壓力小 5.7 倍，自然老得慢。",
              tone: "from-accent to-primary",
            },
            {
              value: 25, decimals: 0, prefix: "~", suffix: " %",
              label: (
                <>
                  <span className="text-foreground font-medium">LFP 使用壽命優勢</span> ·
                  BBU 低負載排程(提案 §G.3)
                </>
              ),
              plain: "電池在較輕鬆的工作型態下運轉，壽命多出約四分之一 — 少換電池就是省錢。",
              tone: "from-success to-accent",
            },
            {
              value: 10, decimals: 0, prefix: "", suffix: " 年",
              label: (<>SOH &gt;80 % 時的 <span className="text-foreground font-medium">BBU 使用壽命</span>(Severson-fit)</>),
              plain: "模擬顯示用滿 10 年，電池健康度仍在 80 % 的業界汰換線之上。",
              tone: "from-primary to-accent",
            },
            {
              value: 33, decimals: 0, prefix: "≈", suffix: " %",
              label: (<><span className="text-foreground font-medium">10 年 TCO 降幅</span> · 提案 §G.3 基準</>),
              plain: "10 年總帳(採購+更換+停機+人力)比傳統方案便宜約三分之一。",
              tone: "from-accent to-primary",
            },
            mv
              ? {
                  value: mv.latency.p99_ms, decimals: 2, prefix: "", suffix: " ms",
                  label: (
                    <>
                      筆電 CPU 上的 <span className="text-foreground font-medium">ONNX p99</span> · <span className="text-success font-medium">{(50 / mv.latency.p99_ms).toFixed(0)}× 優於規格</span>{" "}
                      · STM32N6 NPU 預估 ≤5 ms
                    </>
                  ),
                  plain: "壽命預測在筆電等級的晶片上眨眼間算完 — 快到能放進設備裡，不必上雲付費。",
                  tone: "from-primary to-accent",
                }
              : {
                  value: 50, decimals: 0, prefix: "<", suffix: " ms",
                  label: (<><span className="text-foreground font-medium">邊緣推論延遲目標</span> · STM32N6 ONNX 路徑(執行 <code>export_lstm_onnx.py</code> 以填入)</>),
                  plain: "壽命預測在筆電等級的晶片上眨眼間算完 — 快到能放進設備裡，不必上雲付費。",
                  tone: "from-primary to-accent",
                },
          ].map((s, i) => (
            <Card key={i} className="hover-lift">
              <CardBody>
                <div className={`text-3xl sm:text-4xl md:text-5xl font-semibold tabular-nums bg-gradient-to-br ${s.tone} bg-clip-text text-transparent`}>
                  <CountUp value={s.value} decimals={s.decimals} prefix={s.prefix} suffix={s.suffix} />
                </div>
                <div className="text-sm text-muted mt-2 leading-relaxed">{s.label}</div>
                <div className="text-xs text-accent mt-1.5 leading-relaxed">白話 · {s.plain}</div>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      {/* Three pillars — magazine-style alternating feature rows. */}
      <section className="space-y-12 sm:space-y-16">
        <SectionHeader
          kicker="軟體平台"
          accent="primary"
          title={<>硬體定義，<span className="gradient-text">軟體強化</span>。</>}
          intro={
            <>
              我們賣的不是更便宜的 BBU — 而是一套整合的{" "}
              <span className="text-foreground font-medium">機架級系統</span>，同時解決{" "}
              <span className="text-foreground font-medium">毫秒級瞬變</span>、
              <span className="text-foreground font-medium">HVDC 轉換</span> 與{" "}
              <span className="text-foreground font-medium">維運端可觀測性</span>。
            </>
          }
        />

        <FeatureRow
          index="01"
          accent="primary"
          icon={<Cpu className="h-5 w-5" />}
          title="電池數位孿生"
          href="/twin"
          cta="執行物理模擬"
          body={
            <>
              <span className="text-foreground font-medium">PyBaMM DFN 物理</span> +{" "}
              <span className="text-foreground font-medium">LSTM RUL</span>，以{" "}
              <span className="text-foreground font-medium">188 顆 LFP 電芯</span> 訓練(138 顆 Severson 2019 + 50 顆 Severson 錨定合成 BBU 負載)，
              90 % 預測區間來自 <span className="text-success font-medium">MC Dropout + split conformal</span>。雲端訓練、邊緣(STM32N6)推論。
              <span className="block mt-2 text-accent text-sm">
                白話 · 每顆電池在電腦裡有個虛擬分身，模擬它的老化並預測還能用多久 — 維修從「定期巡檢」變成「該換才換」。
              </span>
            </>
          }
          visual={<PillarVisual Icon={Cpu} tint="tint-primary" glow="glow-primary" stat="90 %" statLabel="conformal 預測區間涵蓋率" />}
        />
        <FeatureRow
          flip
          index="02"
          accent="accent"
          icon={<BarChart3 className="h-5 w-5" />}
          title="TCO 計算器"
          href="/tco"
          cta="計算節省"
          body={
            <>
              輸入機架數量、電價與您現行的 BBU 規格，即可得出{" "}
              <span className="text-foreground font-medium">10 年 TCO、ROI 與 CO₂ 節省</span>，
              每一條成本項皆可對照提案 §G.3 與業界依據稽核。
              <span className="block mt-2 text-accent text-sm">
                白話 · 輸入您的機房規模與電價，馬上算出 10 年省多少、幾年回本 — 每個數字都能點開看依據。
              </span>
            </>
          }
          visual={<PillarVisual Icon={BarChart3} tint="tint-accent" glow="glow-accent" stat="≈33 %" statLabel="10 年 TCO 降幅 · 提案 §G.3" />}
        />
        <FeatureRow
          index="03"
          accent="success"
          icon={<Activity className="h-5 w-5" />}
          title="機隊健康儀表板"
          href="/dashboard"
          cta="開啟儀表板"
          body={
            <>
              在權重分配於 Texas + Virginia 的{" "}
              <span className="text-foreground font-medium">1,000 台設備合成機隊</span> 上，視覺化呈現{" "}
              <span className="text-foreground font-medium">三種服務等級</span> — 即時監測、主動式維護、預測性維運。
              <span className="block mt-2 text-accent text-sm">
                白話 · 一個畫面看完 1,000 台設備誰健康、誰快退休；系統自動把該換的排進清單。
              </span>
            </>
          }
          visual={<PillarVisual Icon={Activity} tint="tint-success" glow="" stat="1,000" statLabel="台合成機隊 · Texas + Virginia" />}
        />
      </section>

      {/* Why now + the 5 kJ rule. */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 items-start">
        <SectionHeader
          kicker="為何現在"
          accent="warning"
          title="電源保護堆疊中的特定缺口。"
          intro={
            <>
              Microsoft Azure 已發表此底層問題(arXiv 2508.14318):LLM 訓練的運算–同步週期
              使機架功率產生 <span className="text-foreground font-medium">1–50 ms 內 ±30 % 的波動</span>。
              NVIDIA 將電容置於 GB300 PSU 內部;我們則在機架層級放置{" "}
              <span className="text-foreground font-medium">LFP+LIC 混合緩衝</span>，服務需要次秒級瞬變吸收、
              又不想整批汰換既有 UPS 的 <span className="text-foreground font-medium">Tier-2/3 AI 市場區隔</span>。
            </>
          }
        />
        <Card className="glow-primary">
          <CardBody className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-warning">
              <Zap className="h-4 w-4" />
              5 kJ / 機架法則
            </div>
            <p className="text-sm text-muted leading-relaxed">
              一座 GB200 NVL72 機架的瞬變約需 <span className="text-foreground font-medium">5 kJ/機架</span> 緩衝能量;
              我們以 <span className="text-foreground font-medium">2× 現成 Eaton XLR 48 V LIC 模組</span> 配置{" "}
              <span className="text-foreground font-medium">345 kJ</span> — 刻意保留{" "}
              <span className="text-success font-medium">69× 餘量</span>，無須客製電池組。
            </p>
            <PlainInline>
              一次瞬變只需要 5 kJ 緩衝能量，我們用現成模組直接配到 69 倍 — 用便宜的「超額」換掉昂貴的「客製」。
            </PlainInline>
            <div className="grid grid-cols-3 gap-3 pt-2 text-xs">
              <Mini label="需求" value="5 kJ" />
              <Mini label="配置" value="345 kJ" />
              <Mini label="餘量" value="69×" tone="text-success" />
            </div>
            <Disclosure summary="為何 5 kJ?為何 69× 餘量?">
              <p className="leading-relaxed">
                一座 GB200 NVL72 機架透過{" "}
                <span className="text-foreground">8 顆 BBU 並聯</span> 拉取 <span className="text-foreground">120 kW</span>(每顆
                BBU 峰值 15 kW &amp; 6C);100 ms 內 &plusmn;30 % 的波動約耗{" "}
                <span className="text-foreground">3.6 kJ</span>。計入 30 % 餘量與連續觸發後，設計目標為 <span className="text-foreground">~5 kJ/機架</span>。
              </p>
              <p className="mt-2 leading-relaxed">
                69× 超額配置是刻意設計:更低的 ESR、低 DoD(1.5 %)將 LIC 壽命延長至
                10⁷ 次循環、N+1 冗餘，並避免客製 5 kJ 電池組所需的 USD 50k+ NRE。
              </p>
              <p className="mt-2 leading-relaxed opacity-80">
                註(不同計算基準):餘量 69× = 配置容量 ÷ §E.1 5 kJ 設計需求。/twin 另報告
                ~26× 比值 = 容量 ÷ 展示波形下的<em>實際</em>累積偏移量(13.3 kJ)。兩者皆正確 —
                首頁呈現結構性超額配置，/twin 則呈現營運餘量。
              </p>
            </Disclosure>
          </CardBody>
        </Card>
      </section>

      {/* Where we sit in the stack — layer-by-layer competitive landscape.
          Honest framing: incumbents already cover their layers. Sysblade
          claims the BBU layer + embedded Twin SaaS, not category creation. */}
      <section className="space-y-6">
        <SectionHeader
          kicker="競爭格局"
          accent="accent"
          title={<>Sysblade 在電源保護堆疊中的<span className="gradient-text-accent">定位</span>。</>}
          intro={
            <>
              以下每一層都有既有廠商 — Sysblade 的論點並非「沒有人做這件事」，而是
              <span className="text-foreground">「LFP+LIC 混合 BBU + 內嵌孿生，正是 AI 機架在 BBU 層所缺的特定組合。」</span>
              <span className="block mt-2 text-accent text-sm">
                白話 · 每一層都有大廠，但「快電容 + 耐用電池 + 壽命預測軟體」這個組合，在機架這一層還沒有人做 — 這就是切入點。
              </span>
            </>
          }
          className="max-w-3xl"
        />

        <Disclosure summary="查看完整 5 層競爭格局(各層既有廠商)">
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 mt-2">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="text-muted text-[10px] uppercase tracking-wider border-b border-border">
                <th className="text-left py-2.5 pr-3 whitespace-nowrap">層級</th>
                <th className="text-left py-2.5 pr-3 whitespace-nowrap">既有廠商</th>
                <th className="text-left py-2.5 pr-3 whitespace-nowrap">涵蓋時間窗</th>
                <th className="text-left py-2.5">Sysblade 的差異</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border align-top">
                <td className="py-3 pr-3 font-medium whitespace-nowrap">PSU 電容</td>
                <td className="py-3 pr-3 text-muted">
                  NVIDIA GB300(PSU 內部薄膜/電解電容)
                </td>
                <td className="py-3 pr-3 text-muted whitespace-nowrap">1&ndash;10 ms</td>
                <td className="py-3 text-muted leading-relaxed">
                  位於 PSU 內部 &mdash; 需要 <span className="text-foreground">新電路板</span>。
                  Sysblade 屬機架外部，可直接放入既有 ORV3 / OCP 機架，無須更換 PSU。
                </td>
              </tr>
              <tr className="border-b border-border align-top">
                <td className="py-3 pr-3 font-medium whitespace-nowrap text-success">
                  BBU(機架級)
                </td>
                <td className="py-3 pr-3 text-muted">
                  OEM BBU 廠商(Murata / Delta / Lite-On);單一化學體系 NMC 電池組;
                  Eaton XLR 販售我們所用的 LIC 模組
                </td>
                <td className="py-3 pr-3 text-muted whitespace-nowrap">10&nbsp;ms &ndash; 60&nbsp;s</td>
                <td className="py-3 text-muted leading-relaxed">
                  <span className="text-success font-medium">Sysblade 的所在層。</span>{" "}
                  混合 <span className="text-foreground">LFP&nbsp;+&nbsp;LIC</span> + 內嵌
                  數位孿生 RUL，正是此處所缺的特定組合。
                </td>
              </tr>
              <tr className="border-b border-border align-top">
                <td className="py-3 pr-3 font-medium whitespace-nowrap">機架 UPS</td>
                <td className="py-3 pr-3 text-muted">
                  Schneider Galaxy VS、Vertiv Liebert APM/GXT、Eaton 9395 / BladeUPS
                </td>
                <td className="py-3 pr-3 text-muted whitespace-nowrap">60 s &ndash; 數十分鐘</td>
                <td className="py-3 text-muted leading-relaxed">
                  相鄰層 &mdash; Sysblade <span className="text-foreground">補強</span>
                  這些產品(在 UPS 察覺之前，BBU 即已處理次秒級瞬變)，而非取代它們。
                </td>
              </tr>
              <tr className="border-b border-border align-top">
                <td className="py-3 pr-3 font-medium whitespace-nowrap">廠房 UPS</td>
                <td className="py-3 pr-3 text-muted">
                  Schneider Galaxy VS(大型)、Eaton 9395P、Vertiv Liebert EXM
                </td>
                <td className="py-3 pr-3 text-muted whitespace-nowrap">數分鐘 &ndash; 數小時</td>
                <td className="py-3 text-muted leading-relaxed">
                  尺度完全不同。Sysblade 不以廠房電源保護為目標;我們位於機架的<em>上游</em>。
                </td>
              </tr>
              <tr className="align-top">
                <td className="py-3 pr-3 font-medium whitespace-nowrap text-success">
                  RUL 軟體
                </td>
                <td className="py-3 pr-3 text-muted">
                  通用異常偵測 SaaS(DataDog 遙測、Splunk ITSI);
                  Schneider EcoStruxure(偏廠房導向)
                </td>
                <td className="py-3 pr-3 text-muted whitespace-nowrap">N/A(連續)</td>
                <td className="py-3 text-muted leading-relaxed">
                  通用異常工具不理解電池物理。{" "}
                  <span className="text-success font-medium">Sysblade Twin</span> 採用
                  PyBaMM-DFN + Severson 校準的 LSTM + conformal PIs &mdash; 此 SaaS 層
                  立基於電芯化學，而非統計閾值。
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted leading-relaxed max-w-3xl">
          5 kJ / 機架的設計點，正落在 PSU 電容與機架 UPS 之間的「數十毫秒」
          缺口 &mdash; 此層級正是 AI 訓練工作負載特性所創造、而既有廠商既有產品線
          未為其設計的新需求。我們在 BBU 層正面競爭(對手是採用單一化學體系電池組的 OEM BBU
          廠商)、在 RUL 軟體層正面競爭(對手是通用異常偵測 SaaS)，並與其上的 UPS 層合作。
        </p>
        </Disclosure>
      </section>
    </div>
  );
}

/** Magazine feature-row visual: a tinted, glowing panel with a key stat and a
 *  large faint icon — gives each pillar a distinct colour identity. */
function PillarVisual({
  Icon,
  tint,
  glow,
  stat,
  statLabel,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  tint: string;
  glow: string;
  stat: string;
  statLabel: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-7 min-h-[168px] flex flex-col justify-between ${tint} ${glow}`}>
      <Icon className="pointer-events-none absolute -right-5 -bottom-6 h-36 w-36 opacity-[0.08]" />
      <Icon className="h-7 w-7 opacity-90" />
      <div>
        <div className="text-3xl sm:text-4xl font-semibold tabular-nums gradient-text">{stat}</div>
        <div className="text-xs text-muted mt-1.5">{statLabel}</div>
      </div>
    </div>
  );
}

function Mini({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
