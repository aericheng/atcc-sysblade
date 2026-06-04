"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Pause,
  Play,
  ChevronDown,
  ExternalLink,
  Activity,
  Zap,
  Network,
  Thermometer as ThermoIcon,
  Cpu,
} from "lucide-react";

interface Scenario {
  series: Record<string, number[]>;
  stats?: Record<string, number | boolean | null | undefined>;
  thermal_model?: Record<string, number | boolean | undefined>;
  fault_injection?: { fault_time_s: number; n_bbu_normal: number; n_bbu_degraded: number };
}

// =============================================================================
// Slide timings — Hero is the 2500 ms baseline (per user requirement).
// Other slides scale roughly with their visible content (formula: ms ≈ max(2500,
// chars × 45), capped at 6000). Tweaked per-slide to give chart-heavy and
// CTA slides slight breathing room.
// =============================================================================
const SLIDES = [
  { id: "hero",          label: "Intro",         ms: 2500 },
  { id: "pain",          label: "Pain",          ms: 3600 },
  { id: "solution",      label: "Solution",      ms: 2500 },
  { id: "arch",          label: "Architecture",  ms: 2800 },
  { id: "v1",            label: "V1 物理",       ms: 4300 },
  { id: "v2",            label: "V2 datasheet",  ms: 4300 },
  { id: "v3-chart",      label: "V3 60s",        ms: 3200 },
  { id: "v3-thermal",    label: "V3 熱",         ms: 3800 },
  { id: "v4-chart",      label: "V4 N-1",        ms: 3200 },
  { id: "v4-crate",      label: "V4 C-rate",     ms: 4500 },
  { id: "v5-mape",       label: "V5 MAPE",       ms: 4000 },
  { id: "v5-honest",     label: "V5 揭露",       ms: 6000 },
  { id: "edge",          label: "Edge AI",       ms: 4300 },
  { id: "tco-headline",  label: "TCO",           ms: 3200 },
  { id: "tco-scenarios", label: "TCO scenarios", ms: 3600 },
  { id: "ride",          label: "Ride-through",  ms: 3800 },
  { id: "verify",        label: "Reproduce",     ms: 4500 },
  { id: "cta",           label: "CTA",           ms: 3500 },
] as const;

const N_SLIDES = SLIDES.length;

// =============================================================================
// Hooks
// =============================================================================
function useCountUp(target: number, ms: number, active: boolean): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) { setVal(0); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, active]);
  return val;
}

function useTypewriter(text: string, ms: number, active: boolean, delay = 0): string {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (!active) { setOut(""); return; }
    let i = 0;
    const tickMs = Math.max(20, ms / Math.max(1, text.length));
    const startTimer = window.setTimeout(() => {
      const interval = window.setInterval(() => {
        i++;
        setOut(text.slice(0, i));
        if (i >= text.length) window.clearInterval(interval);
      }, tickMs);
      return () => window.clearInterval(interval);
    }, delay);
    return () => window.clearTimeout(startTimer);
  }, [text, ms, active, delay]);
  return out;
}

// =============================================================================
// Component
// =============================================================================
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

  const scrollToSlide = useCallback((idx: number) => {
    const el = sectionRefs.current[idx];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

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
      { threshold: 0.55, rootMargin: "0px 0px -5% 0px" },
    );
    sectionRefs.current.forEach((s) => s && observer.observe(s));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const ms = SLIDES[active]?.ms ?? 3000;
    const id = window.setTimeout(() => {
      setActive((cur) => {
        const next = cur + 1;
        if (next >= N_SLIDES) {
          setIsPlaying(false);
          return cur;
        }
        scrollToSlide(next);
        return next;
      });
    }, ms);
    return () => window.clearTimeout(id);
  }, [isPlaying, active, scrollToSlide]);

  useEffect(() => {
    if (!isPlaying) return;
    const stop = () => setIsPlaying(false);
    window.addEventListener("wheel", stop, { passive: true, once: true });
    window.addEventListener("touchmove", stop, { passive: true, once: true });
    return () => {
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
    };
  }, [isPlaying]);

  const togglePlay = () => {
    if (!isPlaying && active === N_SLIDES - 1) {
      setActive(0);
      scrollToSlide(0);
    }
    setIsPlaying((p) => !p);
  };

  const progressPct = ((active + 1) / N_SLIDES) * 100;

  // Chart data
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

  const fault_t = rackNMinus1.fault_injection?.fault_time_s ?? 15;

  return (
    <div className="-mx-4 sm:-mx-6 -my-8 sm:-my-10">
      {/* Sticky controls */}
      <div className="sticky top-14 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            className="inline-flex items-center gap-2 rounded-md bg-primary/15 text-primary border border-primary/30 px-3 py-1.5 text-sm font-medium hover:bg-primary/25 transition-colors"
            aria-label={isPlaying ? "Pause auto-play" : "Play tour"}
          >
            {isPlaying ? (
              <><Pause className="h-4 w-4" /><span>Pause</span></>
            ) : (
              <><Play className="h-4 w-4" /><span>{active === N_SLIDES - 1 ? "Replay" : "Play"}</span></>
            )}
          </button>
          <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs text-muted whitespace-nowrap tabular-nums">
            {active + 1} / {N_SLIDES}
          </span>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-2 flex items-center gap-1 overflow-x-auto">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { setIsPlaying(false); scrollToSlide(i); }}
              className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider whitespace-nowrap transition-colors ${
                i === active
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface/60 text-muted hover:text-foreground"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* 1 — Hero (blur-in + pulse-glow) */}
      <Slide idx={0} active={active === 0} refCb={(el) => (sectionRefs.current[0] = el)}>
        <div className="text-center max-w-3xl mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.4em] text-muted anim-fade-in anim-stagger-1">
            ATCC C13 · Sysblade HyperBuffer
          </p>
          <h1 className="mt-8 text-5xl sm:text-6xl md:text-7xl font-semibold tracking-tight leading-[0.95] anim-blur-in">
            <span className="block">AI 機房需要</span>
            <span className="block text-primary anim-pulse-glow">新的電池備援</span>
          </h1>
          <div className="mt-14 flex flex-col items-center gap-2 text-muted anim-fade-in anim-stagger-4">
            <span className="text-xs uppercase tracking-widest">Play or scroll</span>
            <ChevronDown className="h-5 w-5 animate-bounce" />
          </div>
        </div>
      </Slide>

      {/* 2 — Pain (rotate-in 3 cards) */}
      <Slide idx={1} active={active === 1} refCb={(el) => (sectionRefs.current[1] = el)}>
        <div className="max-w-5xl mx-auto px-6 w-full">
          <Tag>痛點</Tag>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight anim-slide-up">
            北美 Tier-2/3 AI 機房,沒有整合方案。
          </h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            <PainIconCard icon={<Zap className="h-7 w-7" />} kicker="毫秒瞬態"
              title="GB200 ±30 % dV/dt"
              className="anim-rotate-in anim-stagger-1" />
            <PainIconCard icon={<Network className="h-7 w-7" />} kicker="HVDC 換代"
              title="48 V → ±400 V"
              className="anim-rotate-in anim-stagger-2" />
            <PainIconCard icon={<Activity className="h-7 w-7" />} kicker="Fleet 維運"
              title="1000+ 節 RUL 預測"
              className="anim-rotate-in anim-stagger-3" />
          </div>
        </div>
      </Slide>

      {/* 3 — Solution headline (flip-in) */}
      <Slide idx={2} active={active === 2} refCb={(el) => (sectionRefs.current[2] = el)}>
        <div className="text-center max-w-4xl mx-auto px-6">
          <Tag>解法</Tag>
          <h2 className="mt-4 text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-tight anim-flip-in">
            <span className="block">LFP + LIC</span>
            <span className="block text-primary anim-pulse-glow">混合拓樸</span>
            <span className="block text-3xl sm:text-4xl text-muted mt-3">+ AI 數位孿生 SaaS</span>
          </h2>
        </div>
      </Slide>

      {/* 4 — Architecture (8 BBU zoom-in sequence) */}
      <Slide idx={3} active={active === 3} refCb={(el) => (sectionRefs.current[3] = el)}>
        <div className="max-w-3xl mx-auto px-6 w-full">
          <Tag>架構</Tag>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight anim-slide-up">
            8 BBU 並聯 per rack,N+1 容錯
          </h2>
          <div className="mt-10 rounded-2xl border border-border bg-surface/40 p-6 sm:p-10">
            <div className="flex flex-wrap justify-center gap-2.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="w-14 h-20 sm:w-16 sm:h-24 rounded-md border border-primary/40 bg-primary/10 flex flex-col items-center justify-center anim-zoom-in"
                  style={{ animationDelay: `${0.05 + i * 0.06}s` }}
                >
                  <span className="text-[9px] text-muted uppercase tracking-wider">BBU</span>
                  <span className="text-xs font-mono text-primary mt-1">{i + 1}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 grid grid-cols-3 gap-4 text-center anim-fade-in anim-stagger-4">
              <Mini value="8" label="BBU / rack" />
              <Mini value="20" unit="kWh" label="總能量" />
              <Mini value="60" unit="秒" label="graceful" />
            </div>
          </div>
        </div>
      </Slide>

      {/* 5 — V1: count-up + BarGauge */}
      <Slide idx={4} active={active === 4} refCb={(el) => (sectionRefs.current[4] = el)}>
        <div className="max-w-4xl mx-auto px-6 text-center w-full">
          <Tag>V1 · 物理基礎</Tag>
          <h2 className="mt-3 text-xl sm:text-2xl font-medium text-muted anim-slide-up">
            PyBaMM Prada2013 對齊 Severson 公開實測
          </h2>
          <CountUpNumber active={active === 4} target={2.15} decimals={2} unit="% V RMS" />
          <p className="mt-6 text-base sm:text-lg text-foreground/90 anim-fade-in anim-stagger-3">
            ≤ 5 % 目標
          </p>
          <BarGauge
            value={2.15} max={5.0} label="2.15 / 5.0 %" targetLabel="target 5 %"
            tone="success" className="mt-8 anim-slide-left anim-stagger-3"
          />
          <p className="mt-6 text-sm text-muted leading-relaxed max-w-2xl mx-auto anim-fade-in anim-stagger-4">
            3 cells × cycle_life 534–1227 · paper-aligned discharge V(Qd) curve fit
          </p>
        </div>
      </Slide>

      {/* 6 — V2: count-up + FormulaCard */}
      <Slide idx={5} active={active === 5} refCb={(el) => (sectionRefs.current[5] = el)}>
        <div className="max-w-4xl mx-auto px-6 text-center w-full">
          <Tag>V2 · Datasheet 自洽</Tag>
          <h2 className="mt-3 text-xl sm:text-2xl font-medium text-muted anim-slide-up">
            LIC RC 與 Maxwell 廠商 IPEAK 公式完全對齊
          </h2>
          <CountUpNumber active={active === 5} target={0} decimals={3} unit="% pulse err" />
          <FormulaCard className="mt-8 anim-slide-right anim-stagger-3"
            formula="IPEAK = (V_R / 2) ÷ (Δt/C + R)"
            substitution="190 A = 8 V / (1.16 s / 58 F + 22 mΩ)"
            check="model V drop @ Δt=1.16s = 8.00 V · datasheet 8.00 V"
          />
          <p className="mt-6 text-sm text-muted leading-relaxed max-w-2xl mx-auto anim-fade-in anim-stagger-4">
            加 4 個 nonlinear extension(pseudo-cap / self-discharge / T-ESR)max droop err 2.93 % &lt; 10 %
          </p>
        </div>
      </Slide>

      {/* 7 — V3 rack power chart (Recharts animated draw) */}
      <Slide idx={6} active={active === 6} refCb={(el) => (sectionRefs.current[6] = el)}>
        <div className="max-w-5xl mx-auto px-6 w-full">
          <Tag>V3 · 整 rack 60 秒</Tag>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight anim-slide-up">
            120 kW peak → 30 kW continuous,LIC 吃瞬態
          </h2>
          <div className="mt-8 rounded-xl border border-border bg-surface/40 p-4 anim-fade-in anim-stagger-2">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rackPowerData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                key={active === 6 ? "active" : "inactive"}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="t" type="number" domain={[0, 60]} stroke="" tickFormatter={(v) => `${v.toFixed(0)}s`} />
                <YAxis stroke="" tickFormatter={(v) => `${v} kW`} />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12 }} />
                <Line type="monotone" dataKey="p_total" stroke="var(--warning)" strokeWidth={2} dot={false} name="Rack"
                  isAnimationActive={active === 6} animationDuration={1500} />
                <Line type="monotone" dataKey="p_lfp"   stroke="var(--success)" strokeWidth={2} dot={false} name="LFP"
                  isAnimationActive={active === 6} animationDuration={1500} animationBegin={300} />
                <Line type="monotone" dataKey="p_lic"   stroke="var(--primary)" strokeWidth={1.6} dot={false} name="LIC"
                  isAnimationActive={active === 6} animationDuration={1500} animationBegin={600} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Slide>

      {/* 8 — V3 thermal: thermometer */}
      <Slide idx={7} active={active === 7} refCb={(el) => (sectionRefs.current[7] = el)}>
        <div className="max-w-4xl mx-auto px-6 w-full">
          <div className="text-center">
            <Tag>V3 · 熱模型</Tag>
            <h2 className="mt-3 text-xl sm:text-2xl font-medium text-muted anim-slide-up">
              60 秒 graceful 全程,cell 升溫
            </h2>
            <CountUpNumber active={active === 7} target={0.10} decimals={2} unit="K" tone="success" />
          </div>
          <Thermometer
            value={25.10} ambient={25} warning={50}
            className="mt-8 anim-slide-up anim-stagger-3"
          />
          <p className="mt-6 text-center text-sm text-muted leading-relaxed max-w-2xl mx-auto anim-fade-in anim-stagger-4">
            lumped thermal model · I²R heating vs convective cooling · 熱失控風險近乎零
          </p>
        </div>
      </Slide>

      {/* 9 — V4 fault chart (with flashing marker) */}
      <Slide idx={8} active={active === 8} refCb={(el) => (sectionRefs.current[8] = el)}>
        <div className="max-w-5xl mx-auto px-6 w-full">
          <Tag>V4 · N-1 容錯</Tag>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight anim-slide-up">
            t = {fault_t} s 時 1 台 BBU offline,剩 7 台撐到 60 s
          </h2>
          <div className="mt-8 rounded-xl border border-border bg-surface/40 p-4 anim-fade-in anim-stagger-2">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={faultPowerData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                key={active === 8 ? "active" : "inactive"}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="t" type="number" domain={[0, 60]} stroke="" tickFormatter={(v) => `${v.toFixed(0)}s`} />
                <YAxis stroke="" tickFormatter={(v) => `${v} kW`} />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12 }} />
                <ReferenceLine
                  x={fault_t}
                  stroke="var(--danger)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  label={{ value: "BBU 8 → 7", position: "insideTopRight", fill: "var(--danger)", fontSize: 11 }}
                  className="anim-marker-flash"
                />
                <Line type="stepAfter" dataKey="p_per_bbu" stroke="var(--success)" strokeWidth={2.2} dot={false} name="kW per BBU"
                  isAnimationActive={active === 8} animationDuration={1500} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Slide>

      {/* 10 — V4 c-rate: arc gauge */}
      <Slide idx={9} active={active === 9} refCb={(el) => (sectionRefs.current[9] = el)}>
        <div className="max-w-4xl mx-auto px-6 text-center w-full">
          <Tag>V4 · post-fault</Tag>
          <h2 className="mt-3 text-xl sm:text-2xl font-medium text-muted anim-slide-up">
            剩 7 台撐起 8 台的負載,per-BBU 持續 C-rate
          </h2>
          <ArcGauge
            value={1.71} max={2.5} unit="C"
            limitLabel="datasheet 2.5 C 連續上限"
            className="mt-8 anim-zoom-in anim-stagger-2"
          />
          <p className="mt-6 text-sm text-muted leading-relaxed max-w-2xl mx-auto anim-fade-in anim-stagger-4">
            整 rack N-1 容錯在實體上極難重現,孿生層卻能直接驗證 — 這正是 twin {">"} hardware 的價值
          </p>
        </div>
      </Slide>

      {/* 11 — V5 MAPE: two-bar Sysblade vs paper */}
      <Slide idx={10} active={active === 10} refCb={(el) => (sectionRefs.current[10] = el)}>
        <div className="max-w-4xl mx-auto px-6 w-full">
          <div className="text-center">
            <Tag>V5 · RUL 預測</Tag>
            <h2 className="mt-3 text-xl sm:text-2xl font-medium text-muted anim-slide-up">
              Severson 134 cells random split MAPE
            </h2>
            <CountUpNumber active={active === 10} target={8.38} decimals={2} unit="%" tone="success" />
          </div>
          <TwoBar
            items={[
              { label: "Sysblade bagged-GBT", value: 8.38, color: "var(--success)" },
              { label: "Paper baseline", value: 9.10, color: "var(--muted)" },
            ]}
            maxValue={10}
            unit="% MAPE"
            className="mt-8 anim-fade-in anim-stagger-3"
          />
          <p className="mt-6 text-center text-sm text-muted leading-relaxed max-w-2xl mx-auto anim-fade-in anim-stagger-4">
            13-feature K = 24 bagged-GBT + xstrict filter · R² 0.89 · 超越 Severson 2019 paper 自身 baseline
          </p>
        </div>
      </Slide>

      {/* 12 — V5 honest: dramatic two-bar with massive gap */}
      <Slide idx={11} active={active === 11} refCb={(el) => (sectionRefs.current[11] = el)}>
        <div className="max-w-4xl mx-auto px-6 w-full">
          <div className="text-center">
            <Tag>V5 · 誠實揭露</Tag>
            <h2 className="mt-3 text-xl sm:text-2xl font-medium text-muted anim-slide-up">
              同模型放在 BBU 浮充 regime,MAPE 退化到
            </h2>
            <CountUpNumber active={active === 11} target={80.20} decimals={2} unit="%" tone="warning" />
          </div>
          <TwoBar
            items={[
              { label: "Severson self-test", value: 9.04, color: "var(--success)" },
              { label: "BBU duty cross-regime", value: 80.20, color: "var(--warning)" },
            ]}
            maxValue={100}
            unit="% MAPE"
            className="mt-8 anim-fade-in anim-stagger-3"
          />
          <div className="mt-6 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-foreground/90 leading-relaxed anim-blur-in anim-stagger-4">
            OOD by design — Severson cycle_life &lt; 2200,BBU duty 4000–13000。
            這個數字的存在正好是 deployment SOP「新 protocol fall back OLS、新 chemistry 客戶 PoC 重訓」的 quantitative justification。
          </div>
        </div>
      </Slide>

      {/* 13 — Edge AI: BoxComparison 219 KiB vs 63 KiB */}
      <Slide idx={12} active={active === 12} refCb={(el) => (sectionRefs.current[12] = el)}>
        <div className="max-w-4xl mx-auto px-6 w-full">
          <div className="text-center">
            <Tag>邊緣推論</Tag>
            <h2 className="mt-3 text-xl sm:text-2xl font-medium text-muted anim-slide-up">
              ONNX INT8 量化,LSTM 模型大小
            </h2>
            <CountUpNumber active={active === 12} target={3.49} decimals={2} unit="× 壓縮" />
          </div>
          <BoxComparison
            items={[
              { label: "FP32", value: 219, color: "var(--muted)" },
              { label: "INT8 quantized", value: 63, color: "var(--primary)" },
            ]}
            unit="KiB"
            className="mt-8 anim-fade-in anim-stagger-3"
          />
          <p className="mt-6 text-center text-sm text-muted leading-relaxed max-w-2xl mx-auto anim-fade-in anim-stagger-4">
            ΔMAPE +0.10 pp · STM32N6 Neural-ART NPU 估算 27–109 µs · 本地推論,客戶不為 per-inference 付費
          </p>
        </div>
      </Slide>

      {/* 14 — TCO headline + two-bar Baseline vs Sysblade */}
      <Slide idx={13} active={active === 13} refCb={(el) => (sectionRefs.current[13] = el)}>
        <div className="max-w-4xl mx-auto px-6 w-full">
          <div className="text-center">
            <Tag>客戶價值</Tag>
            <h2 className="mt-3 text-xl sm:text-2xl font-medium text-muted anim-slide-up">
              10 年 per-rack TCO
            </h2>
            <CountUpNumber active={active === 13} target={33} decimals={0} unit="% saving" tone="success" />
          </div>
          <TwoBar
            items={[
              { label: "Baseline BBU + LFP", value: 29.0, color: "var(--muted)" },
              { label: "Sysblade hybrid", value: 19.4, color: "var(--success)" },
            ]}
            maxValue={32}
            unit="k USD / rack / 10 yr"
            className="mt-8 anim-fade-in anim-stagger-3"
          />
          <p className="mt-6 text-center text-sm text-muted leading-relaxed max-w-2xl mx-auto anim-fade-in anim-stagger-4">
            Payback 2.3 年 · Hyperscale 500-rack 場景客戶年省 USD 482.9 k
          </p>
        </div>
      </Slide>

      {/* 15 — TCO 3 personas (rotate-in stagger) */}
      <Slide idx={14} active={active === 14} refCb={(el) => (sectionRefs.current[14] = el)}>
        <div className="max-w-5xl mx-auto px-6 w-full">
          <Tag>三個客戶 persona</Tag>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight anim-slide-up">
            Payback 全部落在 2.3 – 2.6 年
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <PersonaCard kicker="Hyperscale" location="Virginia · 500 racks"
              value="USD 482.9 k" caption="33.2 % saving · 2.3 yr" tone="success"
              className="anim-rotate-in anim-stagger-1" />
            <PersonaCard kicker="Mid-tier colo" location="Texas · 50 racks"
              value="USD 44.6 k" caption="31.8 % saving · 2.4 yr" tone="primary"
              className="anim-rotate-in anim-stagger-2" />
            <PersonaCard kicker="Edge AI" location="Pacific NW · 10 racks"
              value="USD 8.0 k" caption="29.9 % saving · 2.6 yr" tone="default"
              className="anim-rotate-in anim-stagger-3" />
          </div>
          <div className="mt-8 text-center anim-fade-in anim-stagger-4">
            <Link
              href="/tco"
              className="inline-flex items-center gap-2 rounded-md bg-primary/15 text-primary border border-primary/30 px-4 py-2 text-sm font-medium hover:bg-primary/25 transition-colors"
            >
              拉 slider 自己算 → /tco
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </Slide>

      {/* 16 — Ride-through: backup hold-time, new vs aged (customer reliability climax).
          Numbers sourced from mains_fail_profile.json aged block (BoL 600s @ rack peak →
          EOL 480s at 80% SOH = 8× the 60s commitment; peak-power retention 67%). Hardcoded
          to match the deck's curated-number style; see /twin for the live interactive model. */}
      <Slide idx={15} active={active === 15} refCb={(el) => (sectionRefs.current[15] = el)}>
        <div className="max-w-4xl mx-auto px-6 w-full">
          <div className="text-center">
            <Tag>客戶最在乎</Tag>
            <h2 className="mt-3 text-xl sm:text-2xl font-medium text-muted anim-slide-up">
              斷電當下,機櫃還能撐多久 —— 用了 7 年也一樣?
            </h2>
            <CountUpNumber active={active === 15} target={8} decimals={0} unit="× 於 60s 承諾" tone="success" />
          </div>
          <TwoBar
            items={[
              { label: "新品 backup runtime", value: 600, color: "var(--muted)" },
              { label: "用 7 年後(EOL · 80% SOH)", value: 480, color: "var(--success)" },
            ]}
            maxValue={640}
            unit="秒 @ rack peak power"
            className="mt-8 anim-fade-in anim-stagger-3"
          />
          <p className="mt-6 text-center text-sm text-muted leading-relaxed max-w-2xl mx-auto anim-fade-in anim-stagger-4">
            就算電池老化到 80% SOH,斷電仍撐 480 秒 —— 60 秒 graceful 承諾的 8 倍餘量;
            峰值功率能力仍保 67%(毫秒尖峰由 LIC 扛)。客戶買的不是新電池規格,是「老化後還能用」。
          </p>
          <div className="mt-6 text-center anim-fade-in anim-stagger-5">
            <Link
              href="/twin"
              className="inline-flex items-center gap-2 rounded-md bg-primary/15 text-primary border border-primary/30 px-4 py-2 text-sm font-medium hover:bg-primary/25 transition-colors"
            >
              拖 SOH slider 自己看 → /twin
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </Slide>

      {/* 17 — V6 verify (typewriter terminal) */}
      <Slide idx={16} active={active === 16} refCb={(el) => (sectionRefs.current[16] = el)}>
        <div className="max-w-3xl mx-auto px-6 w-full text-center">
          <Tag>V6 · 一鍵重現</Tag>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight anim-slide-up">
            RD reviewer 30 分鐘 self-check
          </h2>
          <TypewriterTerminal active={active === 16} className="mt-10" />
        </div>
      </Slide>

      {/* 17 — CTA (bounce-in buttons) */}
      <Slide idx={17} active={active === 17} refCb={(el) => (sectionRefs.current[17] = el)} last>
        <div className="text-center max-w-4xl mx-auto px-6">
          <Tag>下一步</Tag>
          <h2 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight leading-tight anim-scale-in">
            <span className="block">看 sim 跑、</span>
            <span className="block text-primary anim-pulse-glow">查 source、</span>
            <span className="block">問問題</span>
          </h2>
          <div className="mt-12 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/twin"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-5 py-3 text-sm font-medium hover:bg-primary/90 transition-colors anim-bounce-in anim-stagger-1"
            >
              看斷電當下能撐多久 → /twin
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface/60 px-5 py-3 text-sm font-medium hover:bg-surface transition-colors anim-bounce-in anim-stagger-2"
            >
              看 fleet 健康儀表板 → /dashboard
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <a
              href="https://github.com/aericheng/atcc-sysblade"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface/60 px-5 py-3 text-sm font-medium hover:bg-surface transition-colors anim-bounce-in anim-stagger-3"
            >
              GitHub repo(工程審查)
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          <p className="mt-12 text-xs text-muted anim-fade-in anim-stagger-5">
            ATCC 第 23 屆 C13 系統電 Sysgration · v2.0 twin-first validation
          </p>
        </div>
      </Slide>
    </div>
  );
}

// =============================================================================
// Slide + small UI primitives
// =============================================================================

function Slide({
  idx, active, refCb, last, children,
}: {
  idx: number; active: boolean; refCb: (el: HTMLElement | null) => void;
  last?: boolean; children: React.ReactNode;
}) {
  return (
    <section
      ref={refCb}
      data-tour-section
      data-active={active}
      data-section={idx}
      className={`min-h-[88vh] flex items-center justify-center py-12 sm:py-16 transition-opacity duration-500 ${
        active ? "opacity-100" : "opacity-30"
      } ${last ? "border-b border-border/30" : ""}`}
    >
      <div className="w-full">{children}</div>
    </section>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-[0.3em] text-primary font-semibold anim-fade-in">
      {children}
    </p>
  );
}

function CountUpNumber({
  active, target, decimals, unit, tone = "primary",
}: {
  active: boolean; target: number; decimals: number; unit: string;
  tone?: "success" | "primary" | "warning" | "default";
}) {
  const val = useCountUp(target, 800, active);
  const toneClass: Record<string, string> = {
    success: "text-success",
    primary: "tour-bignum",
    warning: "text-warning",
    default: "text-foreground",
  };
  return (
    <div className="mt-8 flex items-baseline justify-center gap-3 anim-scale-in">
      <span className={`text-7xl sm:text-8xl md:text-9xl font-semibold tracking-tighter tabular-nums leading-none ${toneClass[tone]}`}>
        {val.toFixed(decimals)}
      </span>
      <span className={`text-2xl sm:text-3xl font-medium ${tone === "primary" ? "text-primary" : toneClass[tone]}`}>
        {unit}
      </span>
    </div>
  );
}

// =============================================================================
// Visualization components
// =============================================================================

/** Horizontal bar gauge with target / limit marker. */
function BarGauge({
  value, max, label, targetLabel, tone = "primary", className,
}: {
  value: number; max: number; label: string; targetLabel?: string;
  tone?: "success" | "primary" | "warning"; className?: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  const toneBg: Record<string, string> = {
    success: "bg-gradient-to-r from-success/70 to-success",
    primary: "bg-gradient-to-r from-primary/70 to-primary",
    warning: "bg-gradient-to-r from-warning/70 to-warning",
  };
  return (
    <div className={`max-w-xl mx-auto ${className ?? ""}`}>
      <div className="relative h-10 rounded-md bg-surface/60 border border-border overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 ${toneBg[tone]} anim-draw-bar`}
          style={{ width: `${pct}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-sm font-medium tabular-nums">
          {label}
        </div>
      </div>
      {targetLabel && (
        <div className="mt-2 flex justify-end text-xs text-muted">
          <span className="border-r-2 border-warning pr-1.5">{targetLabel}</span>
        </div>
      )}
    </div>
  );
}

/** Two-bar comparison — for V5 MAPE-vs-paper, V5 honest, TCO old-vs-new. */
function TwoBar({
  items, maxValue, unit, className,
}: {
  items: Array<{ label: string; value: number; color: string }>;
  maxValue: number; unit: string; className?: string;
}) {
  return (
    <div className={`max-w-2xl mx-auto space-y-4 ${className ?? ""}`}>
      {items.map((it, i) => {
        const pct = (it.value / maxValue) * 100;
        return (
          <div key={it.label}>
            <div className="flex items-baseline justify-between mb-1.5 text-xs text-muted">
              <span>{it.label}</span>
              <span className="tabular-nums text-foreground font-medium">
                {it.value.toFixed(it.value < 1 ? 3 : 2)} {unit}
              </span>
            </div>
            <div className="relative h-8 rounded-md bg-surface/60 border border-border overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-r-md anim-draw-bar`}
                style={{
                  width: `${pct}%`,
                  background: it.color,
                  animationDelay: `${0.15 + i * 0.15}s`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Box-size comparison — for INT8 quantization 219 → 63 KiB. */
function BoxComparison({
  items, unit, className,
}: {
  items: Array<{ label: string; value: number; color: string }>;
  unit: string; className?: string;
}) {
  const maxValue = Math.max(...items.map((i) => i.value));
  return (
    <div className={`flex items-end justify-center gap-6 sm:gap-12 ${className ?? ""}`}>
      {items.map((it, i) => {
        const sizePct = (it.value / maxValue) * 100;
        return (
          <div key={it.label} className="flex flex-col items-center gap-3">
            <div
              className="rounded-lg border-2 anim-zoom-in flex items-center justify-center text-xs font-medium tabular-nums"
              style={{
                width: `${Math.max(60, sizePct * 1.6)}px`,
                height: `${Math.max(60, sizePct * 1.6)}px`,
                background: `${it.color}20`,
                borderColor: it.color,
                color: it.color,
                animationDelay: `${0.15 + i * 0.2}s`,
              }}
            >
              {it.value} {unit}
            </div>
            <span className="text-xs text-muted uppercase tracking-wider">{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Vertical thermometer — for V3 thermal slide. */
function Thermometer({
  value, ambient, warning, className,
}: {
  value: number; ambient: number; warning: number; className?: string;
}) {
  // Map value→percent on 0..(warning + 10) scale.
  const scaleMax = warning + 10;
  const pct = Math.min(100, (value / scaleMax) * 100);
  const ambientPct = (ambient / scaleMax) * 100;
  const warningPct = (warning / scaleMax) * 100;
  return (
    <div className={`flex items-end justify-center gap-8 ${className ?? ""}`}>
      <div className="relative h-64 w-12 rounded-full bg-surface/60 border border-border overflow-hidden">
        {/* Mercury fill — anchored at bottom, animates upward */}
        <div
          className="absolute left-0 right-0 bottom-0 bg-gradient-to-t from-warning to-success anim-draw-bar-y rounded-b-full"
          style={{ height: `${pct}%`, animationDuration: "1.2s" }}
        />
        {/* Ambient line */}
        <div
          className="absolute left-0 right-0 border-t border-dashed border-muted/60"
          style={{ bottom: `${ambientPct}%` }}
        >
          <span className="absolute right-full pr-3 text-[10px] text-muted whitespace-nowrap -translate-y-1/2">
            {ambient}°C
          </span>
        </div>
        {/* Warning line */}
        <div
          className="absolute left-0 right-0 border-t border-dashed border-danger/70"
          style={{ bottom: `${warningPct}%` }}
        >
          <span className="absolute right-full pr-3 text-[10px] text-danger whitespace-nowrap -translate-y-1/2">
            {warning}°C ⚠
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex items-center gap-2">
          <ThermoIcon className="h-5 w-5 text-success" />
          <span className="text-2xl font-semibold tabular-nums">{value.toFixed(2)}</span>
          <span className="text-muted">°C max</span>
        </div>
        <div className="text-xs text-muted">
          ambient {ambient}°C → max {value.toFixed(2)}°C
          <br />
          headroom to warning <span className="text-success font-medium">{(warning - value).toFixed(1)} K</span>
        </div>
      </div>
    </div>
  );
}

/** Semi-circular arc gauge — for V4 c-rate slide. */
function ArcGauge({
  value, max, unit, limitLabel, className,
}: {
  value: number; max: number; unit: string; limitLabel?: string;
  className?: string;
}) {
  // Arc spans 180° (semicircle). Value→arc-length on 0..max.
  // SVG: cx=100, cy=100, r=80. Circumference of semicircle = π × r ≈ 251.
  const r = 80;
  const cir = Math.PI * r;
  const valuePct = Math.min(1, value / max);
  const valueLen = valuePct * cir;
  return (
    <div className={`flex flex-col items-center ${className ?? ""}`}>
      <svg viewBox="0 0 200 120" className="w-72 sm:w-96">
        {/* Background arc */}
        <path
          d={`M 20 100 A ${r} ${r} 0 0 1 180 100`}
          fill="none"
          stroke="var(--surface)"
          strokeWidth="16"
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d={`M 20 100 A ${r} ${r} 0 0 1 180 100`}
          fill="none"
          stroke="var(--success)"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${valueLen} ${cir}`}
          style={{
            strokeDashoffset: 0,
            animation: "tour-stroke-draw 1.4s cubic-bezier(0.2, 0.8, 0.2, 1) both",
            ["--draw-length" as never]: cir,
          }}
        />
        {/* Limit marker at max (right end of the arc) — label sits to the LEFT
            of the dashed line with textAnchor="end" so it stays inside the
            200×120 viewBox even when {max}{unit} grows past 4 chars. */}
        <line
          x1={180} y1={100} x2={180} y2={82}
          stroke="var(--danger)" strokeWidth="2" strokeDasharray="3 2"
        />
        <text
          x={176} y={78}
          fill="var(--danger)" fontSize="10" fontWeight="600"
          textAnchor="end" fontFamily="ui-monospace"
        >
          {max} {unit} limit
        </text>
      </svg>
      <div className="-mt-2 text-center">
        <div className="text-5xl sm:text-6xl font-semibold tabular-nums text-success">
          {value.toFixed(2)}
        </div>
        <div className="text-sm text-muted mt-1">
          {unit} continuous
        </div>
        {limitLabel && (
          <div className="text-xs text-muted mt-2 max-w-xs">{limitLabel}</div>
        )}
      </div>
    </div>
  );
}

/** Annotated formula card — for V2 datasheet slide. */
function FormulaCard({
  formula, substitution, check, className,
}: {
  formula: string; substitution: string; check: string; className?: string;
}) {
  return (
    <div className={`max-w-xl mx-auto rounded-xl border border-border bg-surface/40 p-5 text-left font-mono text-sm ${className ?? ""}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted mb-3">
        <Cpu className="h-3.5 w-3.5" />
        Maxwell BMOD0058 datasheet
      </div>
      <div className="text-foreground/90 leading-relaxed">{formula}</div>
      <div className="mt-3 text-accent leading-relaxed">{substitution}</div>
      <div className="mt-3 text-success leading-relaxed">✓ {check}</div>
    </div>
  );
}

/** Typewriter terminal — for V6 verify slide. */
function TypewriterTerminal({ active, className }: { active: boolean; className?: string }) {
  const line1 = useTypewriter("git clone github.com/aericheng/atcc-sysblade", 400, active, 0);
  const line2 = useTypewriter("make verify-fast", 250, active, 700);
  const showOutput = active;
  return (
    <div className={`rounded-xl border border-border bg-surface/80 px-6 py-5 text-left font-mono text-sm ${className ?? ""}`}>
      <div className="text-muted text-xs mb-3 uppercase tracking-wider">terminal</div>
      <div>
        <span className="text-success">$ </span>
        <span>{line1}</span>
        {active && line1.length < "git clone github.com/aericheng/atcc-sysblade".length && <Caret />}
      </div>
      <div>
        <span className="text-success">$ </span>
        <span>{line2}</span>
        {active && line2.length < "make verify-fast".length && line1.length === "git clone github.com/aericheng/atcc-sysblade".length && <Caret />}
      </div>
      {showOutput && (
        <>
          <div className="text-muted text-xs mt-3 anim-fade-in" style={{ animationDelay: "1.2s" }}>
            [V6] V2 PASS · V3 PASS · V4 PASS · V5 PASS · XCHECK PASS
          </div>
          <div className="text-success font-medium anim-fade-in" style={{ animationDelay: "1.5s" }}>
            5/5 chains PASS in 70 s · overall PASS
          </div>
        </>
      )}
    </div>
  );
}

function Caret() {
  return <span className="inline-block w-2 h-4 bg-foreground/80 ml-0.5 align-middle anim-marker-flash" />;
}

// =============================================================================
// Tiny helpers
// =============================================================================
function PainIconCard({
  icon, kicker, title, className,
}: {
  icon: React.ReactNode; kicker: string; title: string; className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-surface/40 p-6 text-center ${className ?? ""}`}>
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-warning/15 text-warning mb-3">
        {icon}
      </div>
      <p className="text-xs uppercase tracking-wider text-warning font-semibold">{kicker}</p>
      <h3 className="mt-2 text-lg font-medium">{title}</h3>
    </div>
  );
}

function Mini({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-center gap-1">
        <span className="text-2xl sm:text-3xl font-semibold tabular-nums tracking-tight">{value}</span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
      <p className="mt-1 text-xs text-muted uppercase tracking-wider">{label}</p>
    </div>
  );
}

function PersonaCard({
  kicker, location, value, caption, tone = "default", className,
}: {
  kicker: string; location: string; value: string; caption: string;
  tone?: "success" | "primary" | "default"; className?: string;
}) {
  const toneClass: Record<string, string> = {
    success: "text-success",
    primary: "text-primary",
    default: "text-foreground",
  };
  return (
    <div className={`rounded-xl border border-border bg-surface/40 p-5 text-center ${className ?? ""}`}>
      <p className="text-xs uppercase tracking-wider text-muted">{kicker}</p>
      <p className="mt-0.5 text-xs text-foreground/80">{location}</p>
      <p className={`mt-4 text-2xl sm:text-3xl font-semibold tabular-nums tracking-tight ${toneClass[tone]}`}>
        {value}
      </p>
      <p className="mt-2 text-xs text-muted">{caption}</p>
    </div>
  );
}
