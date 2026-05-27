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
} from "lucide-react";

interface Scenario {
  series: Record<string, number[]>;
  stats?: Record<string, number | boolean | null | undefined>;
  thermal_model?: Record<string, number | boolean | undefined>;
  fault_injection?: { fault_time_s: number; n_bbu_normal: number; n_bbu_degraded: number };
}

// One row per slide. Timings are tuned so a chart-heavy slide gets a beat
// longer than a single-number slide.
// Per-slide auto-play duration (ms). Tuned to ~2.5 s baseline per user request,
// with chart-heavy slides + the closing CTA getting slightly more breathing room.
// Total auto-play: ~46 s for the full 17-slide tour.
const SLIDES = [
  { id: "hero",          label: "Intro",         ms: 2800 },
  { id: "pain",          label: "Pain",          ms: 2800 },
  { id: "solution",      label: "Solution",      ms: 2200 },
  { id: "arch",          label: "Architecture",  ms: 2800 },
  { id: "v1",            label: "V1 物理",       ms: 2200 },
  { id: "v2",            label: "V2 datasheet",  ms: 2200 },
  { id: "v3-chart",      label: "V3 60s",        ms: 3000 },
  { id: "v3-thermal",    label: "V3 熱",         ms: 2200 },
  { id: "v4-chart",      label: "V4 N-1",        ms: 3000 },
  { id: "v4-crate",      label: "V4 C-rate",     ms: 2200 },
  { id: "v5-mape",       label: "V5 MAPE",       ms: 2200 },
  { id: "v5-honest",     label: "V5 揭露",       ms: 3000 },
  { id: "edge",          label: "Edge AI",       ms: 2200 },
  { id: "tco-headline",  label: "TCO",           ms: 2200 },
  { id: "tco-scenarios", label: "TCO scenarios", ms: 3000 },
  { id: "verify",        label: "Reproduce",     ms: 3000 },
  { id: "cta",           label: "CTA",           ms: 4500 },
] as const;

const N_SLIDES = SLIDES.length;

// ============================================================================
// Hook — Count up from 0 to `target` over `ms` ms, only when `active` is true.
// Returns the current value; caller is responsible for formatting (decimals,
// unit suffix, percent vs raw, etc.). Resets to 0 when active flips false.
// ============================================================================
function useCountUp(target: number, ms: number, active: boolean): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) {
      setVal(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setVal(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, active]);
  return val;
}

// ============================================================================
// Main component
// ============================================================================
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

  // IntersectionObserver — keeps `active` in sync with the slide in view.
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

  // Auto-play: advance to the next slide after the current slide's `ms`.
  useEffect(() => {
    if (!isPlaying) return;
    const ms = SLIDES[active]?.ms ?? 5000;
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

  // User scroll / touch while playing → auto-pause.
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

  // Pre-compute V3 / V4 chart data once.
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
      {/* === Sticky top control bar ============================================ */}
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
              onClick={() => {
                setIsPlaying(false);
                scrollToSlide(i);
              }}
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

      {/* === Slides ============================================================ */}

      {/* 1 — Hero */}
      <Slide idx={0} active={active === 0} refCb={(el) => (sectionRefs.current[0] = el)}>
        <div className="text-center max-w-3xl mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.4em] text-muted anim-fade-in anim-stagger-1">
            ATCC C13 · Sysblade HyperBuffer
          </p>
          <h1 className="mt-8 text-5xl sm:text-6xl md:text-7xl font-semibold tracking-tight leading-[0.95] anim-scale-in">
            <span className="block">AI 機房需要</span>
            <span className="block text-primary anim-pulse-glow">新的電池備援</span>
          </h1>
          <div className="mt-14 flex flex-col items-center gap-2 text-muted anim-fade-in anim-stagger-4">
            <span className="text-xs uppercase tracking-widest">Play or scroll</span>
            <ChevronDown className="h-5 w-5 animate-bounce" />
          </div>
        </div>
      </Slide>

      {/* 2 — Pain points (3 icon cards stagger animate-in) */}
      <Slide idx={1} active={active === 1} refCb={(el) => (sectionRefs.current[1] = el)}>
        <div className="max-w-5xl mx-auto px-6 w-full">
          <Tag>痛點</Tag>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight anim-slide-up">
            北美 Tier-2/3 AI 機房,沒有整合方案。
          </h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            <PainIconCard
              icon={<Zap className="h-7 w-7" />}
              kicker="毫秒瞬態"
              title="GB200 ±30 % dV/dt"
              className="anim-slide-up anim-stagger-1"
            />
            <PainIconCard
              icon={<Network className="h-7 w-7" />}
              kicker="HVDC 換代"
              title="48 V → ±400 V"
              className="anim-slide-up anim-stagger-2"
            />
            <PainIconCard
              icon={<Activity className="h-7 w-7" />}
              kicker="Fleet 維運"
              title="1000+ 節 RUL 預測"
              className="anim-slide-up anim-stagger-3"
            />
          </div>
        </div>
      </Slide>

      {/* 3 — Solution headline */}
      <Slide idx={2} active={active === 2} refCb={(el) => (sectionRefs.current[2] = el)}>
        <div className="text-center max-w-4xl mx-auto px-6">
          <Tag>解法</Tag>
          <h2 className="mt-4 text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-tight anim-scale-in">
            <span className="block">LFP + LIC</span>
            <span className="block text-primary anim-pulse-glow">混合拓樸</span>
            <span className="block text-3xl sm:text-4xl text-muted mt-3">+ AI 數位孿生 SaaS</span>
          </h2>
        </div>
      </Slide>

      {/* 4 — Architecture diagram */}
      <Slide idx={3} active={active === 3} refCb={(el) => (sectionRefs.current[3] = el)}>
        <div className="max-w-3xl mx-auto px-6 w-full">
          <Tag>架構</Tag>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight anim-slide-up">
            8 BBU 並聯 per rack,N+1 容錯
          </h2>
          <div className="mt-10 rounded-2xl border border-border bg-surface/40 p-6 sm:p-10 anim-scale-in">
            <div className="flex flex-wrap justify-center gap-2.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="w-14 h-20 sm:w-16 sm:h-24 rounded-md border border-primary/40 bg-primary/10 flex flex-col items-center justify-center anim-slide-up"
                  style={{ animationDelay: `${0.05 + i * 0.05}s` }}
                >
                  <span className="text-[9px] text-muted uppercase tracking-wider">BBU</span>
                  <span className="text-xs font-mono text-primary mt-1">{i + 1}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 grid grid-cols-3 gap-4 text-center">
              <Mini value="8" label="BBU / rack" />
              <Mini value="20" unit="kWh" label="Rack 總能量" />
              <Mini value="60" unit="秒" label="graceful" />
            </div>
          </div>
        </div>
      </Slide>

      {/* 5 — V1 big number 2.15 % */}
      <BigNumberSlide
        idx={4}
        active={active === 4}
        refCb={(el) => (sectionRefs.current[4] = el)}
        tag="V1 · 物理基礎"
        title="PyBaMM Prada2013 對齊 Severson 公開實測"
        target={2.15}
        decimals={2}
        unit="% V RMS"
        targetText="≤ 5 %"
        caption="3 cells × cycle_life 534–1227,paper-aligned discharge V curve fit"
      />

      {/* 6 — V2 big number 0.000 % */}
      <BigNumberSlide
        idx={5}
        active={active === 5}
        refCb={(el) => (sectionRefs.current[5] = el)}
        tag="V2 · Datasheet 自洽"
        title="LIC RC 與 Maxwell 公布的 IPEAK 公式完全對齊"
        target={0}
        decimals={3}
        unit="% pulse err"
        targetText="190 A × 1.16 s pulse"
        caption="加 4 個 nonlinear extension(pseudo-cap / self-discharge / T-ESR)max droop err 2.93 % < 10 %"
      />

      {/* 7 — V3 chart: rack power split */}
      <Slide idx={6} active={active === 6} refCb={(el) => (sectionRefs.current[6] = el)}>
        <div className="max-w-5xl mx-auto px-6 w-full">
          <Tag>V3 · 整 rack 60 秒</Tag>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight anim-slide-up">
            120 kW peak → 30 kW continuous,LIC 吃瞬態
          </h2>
          <div className="mt-8 rounded-xl border border-border bg-surface/40 p-4 anim-scale-in">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rackPowerData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="t" type="number" domain={[0, 60]} stroke="" tickFormatter={(v) => `${v.toFixed(0)}s`} />
                <YAxis stroke="" tickFormatter={(v) => `${v} kW`} />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12 }} />
                <Line type="monotone" dataKey="p_total" stroke="var(--warning)" strokeWidth={2} dot={false} name="Rack" isAnimationActive={false} />
                <Line type="monotone" dataKey="p_lfp"   stroke="var(--success)" strokeWidth={2} dot={false} name="LFP"  isAnimationActive={false} />
                <Line type="monotone" dataKey="p_lic"   stroke="var(--primary)" strokeWidth={1.6} dot={false} name="LIC" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Slide>

      {/* 8 — V3 thermal: T_cell rise 0.10 K */}
      <BigNumberSlide
        idx={7}
        active={active === 7}
        refCb={(el) => (sectionRefs.current[7] = el)}
        tag="V3 · 熱模型"
        title="60 秒 graceful 全程,cell 升溫"
        target={0.1}
        decimals={2}
        unit="K"
        targetText="vs limit 50 °C"
        caption="lumped thermal model · I²R heating vs convective cooling · 熱失控風險近乎零"
        tone="success"
      />

      {/* 9 — V4 chart: per-BBU power with fault marker */}
      <Slide idx={8} active={active === 8} refCb={(el) => (sectionRefs.current[8] = el)}>
        <div className="max-w-5xl mx-auto px-6 w-full">
          <Tag>V4 · N-1 容錯</Tag>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight anim-slide-up">
            t = {fault_t} s 時 1 台 BBU offline,剩 7 台撐到 60 s
          </h2>
          <div className="mt-8 rounded-xl border border-border bg-surface/40 p-4 anim-scale-in">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={faultPowerData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="t" type="number" domain={[0, 60]} stroke="" tickFormatter={(v) => `${v.toFixed(0)}s`} />
                <YAxis stroke="" tickFormatter={(v) => `${v} kW`} />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12 }} />
                <ReferenceLine
                  x={fault_t}
                  stroke="var(--danger)"
                  strokeDasharray="4 4"
                  label={{ value: "BBU 8 → 7", position: "insideTopRight", fill: "var(--danger)", fontSize: 11 }}
                />
                <Line type="stepAfter" dataKey="p_per_bbu" stroke="var(--success)" strokeWidth={2.2} dot={false} name="kW per BBU" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Slide>

      {/* 10 — V4 C-rate big number */}
      <BigNumberSlide
        idx={9}
        active={active === 9}
        refCb={(el) => (sectionRefs.current[9] = el)}
        tag="V4 · post-fault"
        title="剩 7 台撐起 8 台的負載,per-BBU 持續 C-rate"
        target={1.71}
        decimals={2}
        unit="C"
        targetText="< 2.5 C 連續上限"
        caption="實機學生階段物理上不可能驗證 · sim 層 trivial — 這正是 twin {'>'} hardware 的賣點"
        tone="success"
      />

      {/* 11 — V5 MAPE 8.38 % */}
      <BigNumberSlide
        idx={10}
        active={active === 10}
        refCb={(el) => (sectionRefs.current[10] = el)}
        tag="V5 · RUL 預測"
        title="Severson 134 cells 上 random split MAPE"
        target={8.38}
        decimals={2}
        unit="%"
        targetText="超越 paper baseline 9.1 %"
        caption="13-feature bagged-GBT (K = 24) + xstrict filter · R² 0.89 · 達 v2.2 §B 「< 10 %」承諾"
        tone="success"
      />

      {/* 12 — V5 honest disclosure 80.20 % */}
      <BigNumberSlide
        idx={11}
        active={active === 11}
        refCb={(el) => (sectionRefs.current[11] = el)}
        tag="V5 · 誠實揭露"
        title="同模型放在 BBU duty regime,MAPE 退化到"
        target={80.20}
        decimals={2}
        unit="%"
        targetText="8.9× 退化"
        caption="OOD by design — Severson cycle_life < 2200,BBU duty 4000–13000。這個數字的存在正好是 v2.2 §B 「新 protocol fall back OLS、新 chemistry 客戶 PoC 重訓」deployment SOP 的 quantitative justification。"
        tone="warning"
      />

      {/* 13 — Edge AI 3.49× */}
      <BigNumberSlide
        idx={12}
        active={active === 12}
        refCb={(el) => (sectionRefs.current[12] = el)}
        tag="邊緣推論"
        title="ONNX INT8 量化,LSTM 從 219 KiB 壓到 63 KiB"
        target={3.49}
        decimals={2}
        unit="× 壓縮"
        targetText="精度退化僅 +0.10 pp"
        caption="STM32N6 Neural-ART NPU 估算 27–109 µs · 本地推論,客戶不為 per-inference 付費"
      />

      {/* 14 — TCO 33 % saving */}
      <BigNumberSlide
        idx={13}
        active={active === 13}
        refCb={(el) => (sectionRefs.current[13] = el)}
        tag="客戶價值"
        title="10 年 TCO 節省"
        target={33}
        decimals={0}
        unit="%"
        targetText="Payback 2.3 年"
        caption="hyperscale 500-rack Virginia 場景,客戶年省 USD 482.9 k"
        tone="success"
      />

      {/* 15 — TCO scenarios 3 cards */}
      <Slide idx={14} active={active === 14} refCb={(el) => (sectionRefs.current[14] = el)}>
        <div className="max-w-5xl mx-auto px-6 w-full">
          <Tag>三個客戶 persona</Tag>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight anim-slide-up">
            Payback 全部落在 2.3 – 2.6 年
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <PersonaCard
              kicker="Hyperscale"
              location="Virginia · 500 racks"
              value="USD 482.9 k"
              caption="33.2 % saving · 2.3 yr"
              tone="success"
              className="anim-slide-up anim-stagger-1"
            />
            <PersonaCard
              kicker="Mid-tier colo"
              location="Texas · 50 racks"
              value="USD 44.6 k"
              caption="31.8 % saving · 2.4 yr"
              tone="primary"
              className="anim-slide-up anim-stagger-2"
            />
            <PersonaCard
              kicker="Edge AI"
              location="Pacific NW · 10 racks"
              value="USD 8.0 k"
              caption="29.9 % saving · 2.6 yr"
              tone="default"
              className="anim-slide-up anim-stagger-3"
            />
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

      {/* 16 — V6 verify terminal */}
      <Slide idx={15} active={active === 15} refCb={(el) => (sectionRefs.current[15] = el)}>
        <div className="max-w-3xl mx-auto px-6 w-full text-center">
          <Tag>V6 · 一鍵重現</Tag>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight anim-slide-up">
            RD reviewer 30 分鐘 self-check
          </h2>
          <div className="mt-10 rounded-xl border border-border bg-surface/80 px-6 py-5 text-left font-mono text-sm anim-scale-in">
            <div className="text-muted text-xs mb-3 uppercase tracking-wider">terminal</div>
            <div className="anim-fade-in anim-stagger-1">
              <span className="text-success">$</span> git clone github.com/aericheng/atcc-sysblade
            </div>
            <div className="anim-fade-in anim-stagger-2">
              <span className="text-success">$</span> make verify-fast
            </div>
            <div className="text-muted text-xs mt-3 anim-fade-in anim-stagger-3">
              [V6] V2 PASS · V3 PASS · V4 PASS · V5 PASS · XCHECK PASS
            </div>
            <div className="text-success font-medium anim-fade-in anim-stagger-4">
              5/5 chains PASS in 70 s · overall PASS
            </div>
          </div>
        </div>
      </Slide>

      {/* 17 — CTA */}
      <Slide idx={16} active={active === 16} refCb={(el) => (sectionRefs.current[16] = el)} last>
        <div className="text-center max-w-4xl mx-auto px-6">
          <Tag>下一步</Tag>
          <h2 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight leading-tight anim-scale-in">
            <span className="block">看 sim 跑、</span>
            <span className="block text-primary anim-pulse-glow">查 source、</span>
            <span className="block">問問題</span>
          </h2>
          <div className="mt-12 flex flex-col sm:flex-row gap-3 justify-center anim-fade-in anim-stagger-3">
            <a
              href="https://github.com/aericheng/atcc-sysblade"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-foreground text-background px-5 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              GitHub repo
              <ExternalLink className="h-4 w-4" />
            </a>
            <Link
              href="/twin"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface/60 px-5 py-3 text-sm font-medium hover:bg-surface transition-colors"
            >
              開 /twin V3/V4 toggle
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface/60 px-5 py-3 text-sm font-medium hover:bg-surface transition-colors"
            >
              開 /dashboard fleet
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
          <p className="mt-12 text-xs text-muted anim-fade-in anim-stagger-5">
            ATCC 第 23 屆 C13 系統電 Sysgration · v2.0 twin-first validation
          </p>
        </div>
      </Slide>
    </div>
  );
}

// ============================================================================
// Slide wrappers + helpers
// ============================================================================

function Slide({
  idx,
  active,
  refCb,
  last,
  children,
}: {
  idx: number;
  active: boolean;
  refCb: (el: HTMLElement | null) => void;
  last?: boolean;
  children: React.ReactNode;
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

function BigNumberSlide({
  idx,
  active,
  refCb,
  tag,
  title,
  target,
  decimals,
  unit,
  targetText,
  caption,
  tone = "primary",
}: {
  idx: number;
  active: boolean;
  refCb: (el: HTMLElement | null) => void;
  tag: string;
  title: string;
  target: number;
  decimals: number;
  unit: string;
  targetText: string;
  caption: string;
  tone?: "success" | "primary" | "warning" | "default";
}) {
  // Count up over 0.8 s. Tuned shorter than 1.2 s so the number stops moving
  // well before the 2.2 s slide auto-advance, leaving ~1.4 s of stable
  // read-time on the final value.
  const val = useCountUp(target, 800, active);

  const toneClass: Record<string, string> = {
    success: "text-success",
    primary: "tour-bignum",
    warning: "text-warning",
    default: "text-foreground",
  };

  return (
    <Slide idx={idx} active={active} refCb={refCb}>
      <div className="max-w-4xl mx-auto px-6 text-center w-full">
        <Tag>{tag}</Tag>
        <h2 className="mt-3 text-xl sm:text-2xl font-medium text-muted anim-slide-up">{title}</h2>
        <div className="mt-10 flex items-baseline justify-center gap-3 anim-scale-in">
          <span className={`text-7xl sm:text-8xl md:text-9xl font-semibold tracking-tighter tabular-nums leading-none ${toneClass[tone]}`}>
            {val.toFixed(decimals)}
          </span>
          <span className={`text-2xl sm:text-3xl font-medium ${tone === "primary" ? "text-primary" : toneClass[tone]}`}>
            {unit}
          </span>
        </div>
        <p className="mt-6 text-base sm:text-lg text-foreground/90 anim-fade-in anim-stagger-3">
          {targetText}
        </p>
        <p className="mt-4 text-sm text-muted leading-relaxed max-w-2xl mx-auto anim-fade-in anim-stagger-4">
          {caption}
        </p>
      </div>
    </Slide>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-[0.3em] text-primary font-semibold anim-fade-in">
      {children}
    </p>
  );
}

function PainIconCard({
  icon,
  kicker,
  title,
  className,
}: {
  icon: React.ReactNode;
  kicker: string;
  title: string;
  className?: string;
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
  kicker,
  location,
  value,
  caption,
  tone = "default",
  className,
}: {
  kicker: string;
  location: string;
  value: string;
  caption: string;
  tone?: "success" | "primary" | "default";
  className?: string;
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
