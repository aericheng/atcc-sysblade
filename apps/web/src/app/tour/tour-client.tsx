"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Pause, Play, ChevronDown, ExternalLink } from "lucide-react";

interface Scenario {
  title?: string;
  series: Record<string, number[]>;
  stats?: Record<string, number | boolean | null | undefined>;
  thermal_model?: Record<string, number | boolean | undefined>;
  fault_injection?: { fault_time_s: number; n_bbu_normal: number; n_bbu_degraded: number };
}

const SECONDS_PER_SECTION = 10;

const SECTIONS = [
  { id: "hero", label: "Intro" },
  { id: "problem", label: "Problem" },
  { id: "architecture", label: "Architecture" },
  { id: "physics", label: "V1+V2" },
  { id: "rack", label: "V3 60s" },
  { id: "fault", label: "V4 N-1" },
  { id: "rul", label: "V5 RUL" },
  { id: "edge", label: "Edge AI" },
  { id: "tco", label: "TCO" },
  { id: "verify", label: "Reproduce" },
] as const;

const N_SECTIONS = SECTIONS.length;

export function TourClient({
  rackGraceful,
  rackNMinus1,
}: {
  rackGraceful: Scenario;
  rackNMinus1: Scenario;
}) {
  const [active, setActive] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const userInteractedRef = useRef(false);

  const scrollToSection = useCallback((idx: number) => {
    const el = sectionRefs.current[idx];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // IntersectionObserver — set `active` based on which section is in view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = sectionRefs.current.indexOf(entry.target as HTMLElement);
            if (idx >= 0) setActive(idx);
          }
        });
      },
      { threshold: 0.45, rootMargin: "0px 0px -10% 0px" },
    );
    sectionRefs.current.forEach((s) => s && observer.observe(s));
    return () => observer.disconnect();
  }, []);

  // Auto-play: advance one section every SECONDS_PER_SECTION seconds.
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      setActive((cur) => {
        const next = cur + 1;
        if (next >= N_SECTIONS) {
          setIsPlaying(false);
          return cur;
        }
        scrollToSection(next);
        return next;
      });
    }, SECONDS_PER_SECTION * 1000);
    return () => window.clearInterval(id);
  }, [isPlaying, scrollToSection]);

  // If the user scrolls manually while playing, stop auto-play.
  useEffect(() => {
    if (!isPlaying) return;
    const onWheel = () => {
      if (userInteractedRef.current) return;
      userInteractedRef.current = true;
      setIsPlaying(false);
    };
    window.addEventListener("wheel", onWheel, { passive: true, once: true });
    window.addEventListener("touchmove", onWheel, { passive: true, once: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchmove", onWheel);
      userInteractedRef.current = false;
    };
  }, [isPlaying]);

  const togglePlay = () => {
    if (!isPlaying && active === N_SECTIONS - 1) {
      // restart from the top if we're at the end
      setActive(0);
      scrollToSection(0);
    }
    setIsPlaying((p) => !p);
  };

  const progressPct = ((active + 1) / N_SECTIONS) * 100;

  // Pre-compute chart data for V3 (rack 60s graceful) and V4 (N-1)
  const rackPowerData = useMemo(() => {
    const t = rackGraceful.series.t;
    const pT = rackGraceful.series.p_total_kw;
    const pL = rackGraceful.series.p_lfp_kw;
    const pI = rackGraceful.series.p_lic_kw;
    const out: Array<{ t: number; p_total: number; p_lfp: number; p_lic: number }> = [];
    for (let i = 0; i < t.length; i++) {
      if (t[i] > 3 && i % 6 !== 0 && i !== t.length - 1) continue;
      out.push({
        t: Number(t[i].toFixed(2)),
        p_total: Number(pT[i].toFixed(1)),
        p_lfp: Number(pL[i].toFixed(1)),
        p_lic: Number(pI[i].toFixed(1)),
      });
    }
    return out;
  }, [rackGraceful]);

  const faultPowerData = useMemo(() => {
    const t = rackNMinus1.series.t;
    const perBbu = rackNMinus1.series.p_lfp_per_bbu_kw;
    if (!perBbu) return [];
    const out: Array<{ t: number; p_per_bbu: number }> = [];
    for (let i = 0; i < t.length; i++) {
      if (t[i] > 3 && i % 6 !== 0 && i !== t.length - 1) continue;
      out.push({ t: Number(t[i].toFixed(2)), p_per_bbu: Number(perBbu[i].toFixed(2)) });
    }
    return out;
  }, [rackNMinus1]);

  const t_cell_rise = rackGraceful.thermal_model?.t_rise_above_ambient_c as number | undefined;
  const t_warning = rackGraceful.thermal_model?.t_warning_c as number | undefined;
  const c_rate_post = rackNMinus1.stats?.c_rate_continuous_post_fault as number | undefined;
  const fault_t = rackNMinus1.fault_injection?.fault_time_s ?? 15;

  return (
    <div className="-mx-4 sm:-mx-6 -my-8 sm:-my-10">
      {/* Top progress + play controls */}
      <div className="sticky top-14 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            className="inline-flex items-center gap-2 rounded-md bg-primary/15 text-primary border border-primary/30 px-3 py-1.5 text-sm font-medium hover:bg-primary/25 transition-colors"
            aria-label={isPlaying ? "Pause auto-play" : "Play tour"}
          >
            {isPlaying ? (
              <>
                <Pause className="h-4 w-4" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                <span>{active === N_SECTIONS - 1 ? "Replay" : "Play"}</span>
              </>
            )}
          </button>
          <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs text-muted whitespace-nowrap tabular-nums">
            {active + 1} / {N_SECTIONS}
          </span>
        </div>
        {/* Section dots */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-2 flex items-center gap-1 overflow-x-auto">
          {SECTIONS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setActive(i);
                scrollToSection(i);
              }}
              className={`rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wider whitespace-nowrap transition-colors ${
                i === active
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface/60 text-muted hover:text-foreground"
              }`}
            >
              {i + 1}. {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Section 1 — Hero */}
      <SectionWrap
        idx={0}
        active={active === 0}
        refCb={(el) => (sectionRefs.current[0] = el)}
        first
      >
        <div className="text-center max-w-3xl mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.3em] text-muted mb-6">
            ATCC C13 · Sysblade HyperBuffer · v2.0
          </p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-tight">
            AI 機房需要新的<br />
            電池備援。
          </h1>
          <p className="mt-8 text-lg sm:text-xl text-muted leading-relaxed">
            <span className="text-foreground font-medium">LFP + LIC 混合 BBU</span>
            {" · "}
            <span className="text-foreground font-medium">PyBaMM 物理孿生</span>
            {" · "}
            <span className="text-foreground font-medium">Severson MAPE 8.38 %</span>
            <br />
            一次解掉 GB200 毫秒瞬態、±400 V HVDC 換代、1000+ 節 fleet 維運三大痛點。
          </p>
          <div className="mt-12 inline-flex flex-col items-center gap-2 text-muted">
            <span className="text-xs uppercase tracking-widest">Press play or scroll</span>
            <ChevronDown className="h-5 w-5 animate-bounce" />
          </div>
        </div>
      </SectionWrap>

      {/* Section 2 — Three pain points */}
      <SectionWrap
        idx={1}
        active={active === 1}
        refCb={(el) => (sectionRefs.current[1] = el)}
      >
        <div className="max-w-5xl mx-auto px-6">
          <SectionTag>痛點</SectionTag>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-3">
            北美 Tier-2/3 AI 機房,目前沒有整合方案。
          </h2>
          <p className="mt-4 text-muted leading-relaxed max-w-3xl">
            JLL 2025 在建容量 35 GW · 德州 + 維吉尼亞 33 %。Tier-1 hyperscale 自研,
            Tier-2/3 colo 必依賴外採 BBU,但三大廠 Eaton / Vertiv / Schneider 都有
            strategic moat 不會做我們在做的事。
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <PainCard
              kicker="毫秒級瞬態"
              title="GB200 ±30 % dV/dt > 50 V/s"
              body="純電池 BBU 撐不住 50–200 ms 壓降,下游 PSU 重啟。Eaton 賣 LIC 模組,但控制律要客戶自己寫。"
            />
            <PainCard
              kicker="HVDC 換代"
              title="48 V → ±400 V (2025–2028)"
              body="Vertiv 等只賣 48 V 單一規格,客戶 2027 後須 forklift 換代。沒人同時相容兩階段。"
            />
            <PainCard
              kicker="Fleet 維運"
              title="1000+ 節 RUL 預測 + 替換隊列"
              body="人工巡檢 hit-rate 低,業界無公開 SaaS 提供 BBU-level RUL 與三層替換隊列。"
            />
          </div>
        </div>
      </SectionWrap>

      {/* Section 3 — Architecture */}
      <SectionWrap
        idx={2}
        active={active === 2}
        refCb={(el) => (sectionRefs.current[2] = el)}
      >
        <div className="max-w-5xl mx-auto px-6">
          <SectionTag>解法</SectionTag>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-3">
            LFP + LIC 混合拓樸 + AI 數位孿生 SaaS
          </h2>
          <p className="mt-4 text-muted leading-relaxed max-w-3xl">
            一階互補濾波器 τ = 0.5 s 把高頻瞬態交給 LIC、低頻持續放電交給 LFP。
            每 rack 8 台 BBU 並聯,N+1 容錯 + 60 秒 graceful。
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <ArchCard
              title="硬體拓樸(per rack)"
              rows={[
                ["BBU 數量", "8 台 並聯"],
                ["主電池", "LFP 15S × 2.5 kWh / 台"],
                ["輔助瞬態", "2× Eaton XLR-48-166 LIC bank"],
                ["控制律", "STM32F411 + τ = 0.5 s LPF"],
                ["Rack 總能量", "20 kWh / 120 kW peak"],
              ]}
            />
            <ArchCard
              title="軟體三件套"
              rows={[
                ["/twin", "PyBaMM DFN + LIC RC,V3/V4 toggle"],
                ["/tco", "10-yr TCO calculator,33 % saving baseline"],
                ["/dashboard", "1000-node fleet · Tier-1/2/3 · N+1 toggle"],
                ["邊緣推論", "INT8 LSTM 63 KiB,STM32N6 NPU 目標"],
                ["重現性", "make verify-fast 5/5 PASS in 70 s"],
              ]}
            />
          </div>
        </div>
      </SectionWrap>

      {/* Section 4 — V1 + V2 Physics */}
      <SectionWrap
        idx={3}
        active={active === 3}
        refCb={(el) => (sectionRefs.current[3] = el)}
      >
        <div className="max-w-5xl mx-auto px-6">
          <SectionTag>V1 + V2 · 物理基礎</SectionTag>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-3">
            我們的物理模型對齊公開實測 + 廠商 datasheet 公式。
          </h2>
          <p className="mt-4 text-muted leading-relaxed max-w-3xl">
            數位孿生最常被問:你怎麼知道你的 sim 是 faithful 的?V1 對齊 Severson
            2019 公開量測,V2 對齊 Maxwell datasheet 物理公式。兩條都是 measured-vs-model
            硬數字,不是空想。
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <BigNumberCard
              kicker="V1 · PyBaMM Prada2013 vs Severson A123 LFP"
              value="2.15"
              unit="% V RMS"
              caption="3 cells × cycle_life 534–1227;target ≤ 5 %"
              detail="discharge V(Qd) curve 對齊到 plateau 的 100-pt 內插網格 RMS error。"
              tone="success"
            />
            <BigNumberCard
              kicker="V2 · LIC RC vs Maxwell BMOD0058 datasheet"
              value="0.000"
              unit="% IPEAK err"
              caption="190 A × 1.16 s pulse formula 完全自洽"
              detail="加 4 個 nonlinear extension(pseudo-cap / self-discharge / T-ESR)最大 droop error 2.93 % < 10 % target。"
              tone="success"
            />
          </div>
        </div>
      </SectionWrap>

      {/* Section 5 — V3 Rack 60s graceful */}
      <SectionWrap
        idx={4}
        active={active === 4}
        refCb={(el) => (sectionRefs.current[4] = el)}
      >
        <div className="max-w-5xl mx-auto px-6">
          <SectionTag>V3 · 整 rack 60 秒 graceful</SectionTag>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-3">
            120 kW peak → 30 kW 連續,T_cell 升溫 0.10 K。
          </h2>
          <p className="mt-4 text-muted leading-relaxed max-w-3xl">
            8 BBU + LIC bank + 互補濾波器 + GPU power-cap ramp + 集總熱模型,單一 sim
            把白皮書 §2.1.1 的 60 秒承諾直接跑成 artifact。
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <MiniStat label="T_cell rise" value={`${(t_cell_rise ?? 0.1).toFixed(2)} K`} sub={`limit ${t_warning ?? 50} °C`} tone="success" />
            <MiniStat label="能量餘量" value="38×" sub="2.66 % DoD / 20 kWh rack capacity" tone="success" />
            <MiniStat label="Per-BBU C-rate" value="6C / 1.5C" sub="peak 0.5 s · continuous 58 s" tone="primary" />
          </div>
          <div className="mt-8 rounded-xl border border-border bg-surface/40 p-4">
            <p className="text-xs text-muted mb-2">Rack power split · 0–60 s</p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={rackPowerData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="t" type="number" domain={[0, 60]} stroke="" tickFormatter={(v) => `${v.toFixed(0)}s`} />
                <YAxis stroke="" tickFormatter={(v) => `${v}`} />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
                <Line type="monotone" dataKey="p_total" stroke="var(--warning)" strokeWidth={1.6} dot={false} name="Rack" isAnimationActive={false} />
                <Line type="monotone" dataKey="p_lfp" stroke="var(--success)" strokeWidth={1.6} dot={false} name="LFP" isAnimationActive={false} />
                <Line type="monotone" dataKey="p_lic" stroke="var(--primary)" strokeWidth={1.4} dot={false} name="LIC" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </SectionWrap>

      {/* Section 6 — V4 N-1 fault */}
      <SectionWrap
        idx={5}
        active={active === 5}
        refCb={(el) => (sectionRefs.current[5] = el)}
      >
        <div className="max-w-5xl mx-auto px-6">
          <SectionTag>V4 · N-1 容錯</SectionTag>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-3">
            t = {fault_t} s 時 1 台 BBU offline,剩 7 台撐到 60 秒。
          </h2>
          <p className="mt-4 text-muted leading-relaxed max-w-3xl">
            這在學生實驗室實機**物理上不可能驗證**,sim 層只要動 1 個陣列就能做。
            **這正是 twin {">"} hardware 的賣點** —— per-BBU 連續 C-rate 從 1.50C → 1.71C,
            仍在 2.5C 連續安全上限內,service continuity 100 %。
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <MiniStat label="Per-BBU post-fault" value={`${(c_rate_post ?? 1.71).toFixed(2)} C`} sub="limit 2.5 C continuous" tone="success" />
            <MiniStat label="V_cell swing" value="277 mV" sub="limit 500 mV degraded budget" tone="success" />
            <MiniStat label="Service continuity" value="100 %" sub="60 s graceful 仍完成" tone="success" />
          </div>
          <div className="mt-8 rounded-xl border border-border bg-surface/40 p-4">
            <p className="text-xs text-muted mb-2">Per-BBU LFP power · fault @ t={fault_t}s</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={faultPowerData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="t" type="number" domain={[0, 60]} stroke="" tickFormatter={(v) => `${v.toFixed(0)}s`} />
                <YAxis stroke="" tickFormatter={(v) => `${v} kW`} />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12 }} />
                <ReferenceLine x={fault_t} stroke="var(--danger)" strokeDasharray="4 4" label={{ value: "BBU 8 → 7", position: "insideTopRight", fill: "var(--danger)", fontSize: 10 }} />
                <Line type="stepAfter" dataKey="p_per_bbu" stroke="var(--success)" strokeWidth={1.8} dot={false} name="kW per BBU" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </SectionWrap>

      {/* Section 7 — V5 RUL */}
      <SectionWrap
        idx={6}
        active={active === 6}
        refCb={(el) => (sectionRefs.current[6] = el)}
      >
        <div className="max-w-5xl mx-auto px-6">
          <SectionTag>V5 · RUL 預測 · ML pipeline</SectionTag>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-3">
            Severson MAPE 8.38 %,**比 paper baseline 9.1 % 更準**。
          </h2>
          <p className="mt-4 text-muted leading-relaxed max-w-3xl">
            13-feature bagged-GBT (K = 24) + xstrict cell filter,134 cells 上 10-seed
            median MAPE 8.38 %、R² = 0.89。**達 v2.2 §B 「&lt; 10 %」承諾,且超越
            Severson 2019 paper 自身 baseline**。
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <MiniStat label="Random split MAPE" value="8.38 %" sub="vs Severson paper 9.1 %" tone="success" />
            <MiniStat label="R² (Severson self)" value="0.89" sub="K=24 bagged-GBT" tone="primary" />
            <MiniStat label="Cross-regime MAPE" value="80.20 %" sub="BBU duty transfer (8.9× degradation)" tone="warning" />
          </div>
          <div className="mt-6 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-foreground/90 leading-relaxed">
            <span className="font-semibold text-warning">誠實揭露:</span>
            {" "}
            cross-regime 80.20 % degradation 是 OOD by design — Severson cells cycle_life
            &lt; 2200,BBU duty cells 4000–13000。**這個數字的存在,正好是 v2.2 §B
            「新 protocol fall back bagged-OLS、新 chemistry 客戶 PoC 重訓」deployment SOP
            的 quantitative justification**。
          </div>
        </div>
      </SectionWrap>

      {/* Section 8 — Edge inference */}
      <SectionWrap
        idx={7}
        active={active === 7}
        refCb={(el) => (sectionRefs.current[7] = el)}
      >
        <div className="max-w-5xl mx-auto px-6">
          <SectionTag>邊緣推論 · INT8 LSTM</SectionTag>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-3">
            3.49× 壓縮,精度退化僅 +0.10 pp。
          </h2>
          <p className="mt-4 text-muted leading-relaxed max-w-3xl">
            PyTorch → ONNX (opset 17) → INT8 dynamic quant,**measured ΔMAPE +0.10 pp,
            FP32 219 KiB → INT8 63 KiB**。STM32N6 Neural-ART NPU 估算 27–109 µs。**本地
            推論,客戶不為 per-inference 付費**。
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            <MiniStat label="Compression" value="3.49×" sub="219 → 63 KiB" tone="primary" />
            <MiniStat label="ΔMAPE (INT8 vs FP32)" value="+0.10 pp" sub="measured 134-cell re-eval" tone="success" />
            <MiniStat label="STM32N6 NPU" value="27–109 µs" sub="static graph estimate" tone="default" />
            <MiniStat label="Laptop INT8 p99" value="245 µs" sub="measured baseline" tone="default" />
          </div>
        </div>
      </SectionWrap>

      {/* Section 9 — TCO */}
      <SectionWrap
        idx={8}
        active={active === 8}
        refCb={(el) => (sectionRefs.current[8] = el)}
      >
        <div className="max-w-5xl mx-auto px-6">
          <SectionTag>客戶價值 · TCO</SectionTag>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-3">
            10 年 TCO 節省 33 %,Payback 2.3 年。
          </h2>
          <p className="mt-4 text-muted leading-relaxed max-w-3xl">
            Hyperscale 500-rack Virginia 場景,客戶年省 USD 482.9 k。Mid-tier 50-rack /
            Edge AI 10-rack 也 payback 在 2.4–2.6 年內。
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <BigNumberCard
              kicker="Hyperscale (Virginia · 500 racks)"
              value="USD 482.9 k"
              unit="/yr"
              caption="33.2 % TCO saving · payback 2.3 yr"
              tone="success"
            />
            <BigNumberCard
              kicker="Mid-tier (Texas · 50 racks)"
              value="USD 44.6 k"
              unit="/yr"
              caption="31.8 % TCO saving · payback 2.4 yr"
              tone="primary"
            />
            <BigNumberCard
              kicker="Edge AI (Pacific NW · 10 racks)"
              value="USD 8.0 k"
              unit="/yr"
              caption="29.9 % TCO saving · payback 2.6 yr"
              tone="default"
            />
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/tco"
              className="inline-flex items-center gap-2 rounded-md bg-primary/15 text-primary border border-primary/30 px-4 py-2 text-sm font-medium hover:bg-primary/25 transition-colors"
            >
              拉 slider 自己算 → /tco
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </SectionWrap>

      {/* Section 10 — Reproducibility + CTA */}
      <SectionWrap
        idx={9}
        active={active === 9}
        refCb={(el) => (sectionRefs.current[9] = el)}
        last
      >
        <div className="max-w-4xl mx-auto px-6 text-center">
          <SectionTag>V6 · 一鍵重現</SectionTag>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-3">
            RD reviewer 30 分鐘 self-check
          </h2>
          <p className="mt-4 text-muted leading-relaxed">
            所有 V1–V6 chains + 39 個 headline 數字 cross-check,一條 make 命令搞定。
          </p>
          <div className="mt-8 rounded-xl border border-border bg-surface/50 px-6 py-5 text-left font-mono text-sm">
            <div className="text-muted text-xs mb-2 uppercase tracking-wider">terminal</div>
            <div>
              <span className="text-success">$</span> git clone https://github.com/aericheng/atcc-sysblade.git
            </div>
            <div>
              <span className="text-success">$</span> make verify-fast
            </div>
            <div className="text-muted text-xs mt-3">[V6] V2 PASS · V3 PASS · V4 PASS · V5 PASS · XCHECK PASS</div>
            <div className="text-success font-medium">5/5 chains PASS in 70 s · overall PASS</div>
          </div>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="https://github.com/aericheng/atcc-sysblade"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <ExternalLink className="h-4 w-4" />
              GitHub repo
            </a>
            <Link
              href="/twin"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface/60 px-4 py-2.5 text-sm font-medium hover:bg-surface transition-colors"
            >
              開 /twin V3/V4 toggle
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface/60 px-4 py-2.5 text-sm font-medium hover:bg-surface transition-colors"
            >
              開 /dashboard fleet toggle
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
          <p className="mt-10 text-xs text-muted">
            ATCC 第 23 屆 C13 系統電 Sysgration · v2.0 twin-first validation
          </p>
        </div>
      </SectionWrap>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function SectionWrap({
  idx,
  active,
  refCb,
  first,
  last,
  children,
}: {
  idx: number;
  active: boolean;
  refCb: (el: HTMLElement | null) => void;
  first?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      ref={refCb}
      data-section={idx}
      data-active={active}
      className={`min-h-[90vh] flex items-center py-12 sm:py-16 transition-opacity duration-700 ${
        active ? "opacity-100" : "opacity-50"
      } ${first ? "border-t border-border/30" : ""} ${last ? "border-b border-border/30" : ""}`}
    >
      <div className="w-full">{children}</div>
    </section>
  );
}

function SectionTag({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-[0.25em] text-primary font-semibold">
      {children}
    </p>
  );
}

function PainCard({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-5">
      <p className="text-xs uppercase tracking-wider text-warning font-semibold">{kicker}</p>
      <h3 className="mt-2 text-lg font-medium leading-snug">{title}</h3>
      <p className="mt-3 text-sm text-muted leading-relaxed">{body}</p>
    </div>
  );
}

function ArchCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, string]>;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-5">
      <h3 className="text-lg font-medium">{title}</h3>
      <dl className="mt-4 divide-y divide-border/60">
        {rows.map(([k, v]) => (
          <div key={k} className="py-2.5 flex items-center justify-between gap-4">
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="text-sm font-medium text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function BigNumberCard({
  kicker,
  value,
  unit,
  caption,
  detail,
  tone = "default",
}: {
  kicker: string;
  value: string;
  unit: string;
  caption: string;
  detail?: string;
  tone?: "success" | "primary" | "warning" | "default";
}) {
  const toneClass: Record<string, string> = {
    success: "text-success",
    primary: "text-primary",
    warning: "text-warning",
    default: "text-foreground",
  };
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-6">
      <p className="text-xs uppercase tracking-wider text-muted">{kicker}</p>
      <div className={`mt-3 flex items-baseline gap-1.5 ${toneClass[tone]}`}>
        <span className="text-4xl sm:text-5xl font-semibold tabular-nums tracking-tight">{value}</span>
        <span className="text-base sm:text-lg font-medium">{unit}</span>
      </div>
      <p className="mt-2 text-sm text-foreground/90">{caption}</p>
      {detail && <p className="mt-2 text-xs text-muted leading-relaxed">{detail}</p>}
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "success" | "primary" | "warning" | "default";
}) {
  const toneClass: Record<string, string> = {
    success: "text-success",
    primary: "text-primary",
    warning: "text-warning",
    default: "text-foreground",
  };
  return (
    <div className="rounded-lg border border-border bg-surface/30 p-4">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums tracking-tight ${toneClass[tone]}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}
