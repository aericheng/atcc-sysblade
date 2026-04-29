"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { computeTco, formatTons, formatUsd, type TcoInputs } from "@/lib/tco";
import { ArrowRight, Leaf } from "lucide-react";

const PRESETS: Record<string, TcoInputs> = {
  "Mid-tier (50 racks · Texas)": {
    racks: 50,
    electricityPriceUsdPerKwh: 0.085,
    pue: 1.4,
    gridCarbonKgPerKwh: 0.41, // ERCOT 2024 average
  },
  "Hyperscale (500 racks · Virginia)": {
    racks: 500,
    electricityPriceUsdPerKwh: 0.105,
    pue: 1.35,
    gridCarbonKgPerKwh: 0.36, // PJM 2024 average
  },
  "Edge AI (10 racks · Pacific NW)": {
    racks: 10,
    electricityPriceUsdPerKwh: 0.07,
    pue: 1.3,
    gridCarbonKgPerKwh: 0.12, // BPA / hydro
  },
};

const DEFAULT_PRESET = "Mid-tier (50 racks · Texas)";

// The cost-breakdown chart is intentionally rendered as plain HTML / CSS
// rather than recharts. recharts 3.x's internal Redux store dispatches
// state updates during render in response to prop churn, which manifests
// as a "Maximum update depth" infinite loop the moment the user drags any
// of the four sliders. ResponsiveContainer + ResizeObserver workarounds
// (commits 11d2073 and 9204809) reduced but did not eliminate the loop;
// dropping recharts entirely on this page is the only stable fix. The
// table below the chart still surfaces the exact dollar values, so the
// chart only needs to communicate "visual proportion".
type BreakdownRow = {
  item: string;
  short: string;
  traditional: number;
  sysblade: number;
};

function BreakdownBars({ rows, isNarrow }: { rows: BreakdownRow[]; isNarrow: boolean }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.traditional, r.sysblade]));
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const tw = (row.traditional / max) * 100;
        const sw = (row.sysblade / max) * 100;
        const labelText = isNarrow ? row.short : row.item;
        return (
          <div
            key={row.item}
            className="grid grid-cols-[80px_1fr_auto] sm:grid-cols-[140px_1fr_auto] items-center gap-3"
          >
            <div className="text-xs text-muted truncate">{labelText}</div>
            <div className="space-y-1.5 min-w-0">
              <div
                className="relative h-2.5 w-full rounded bg-surface/40"
                title={`Traditional NMC BBU · $${row.traditional.toLocaleString()}`}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded"
                  style={{ width: `${tw}%`, background: "rgba(251,191,36,0.85)" }}
                />
              </div>
              <div
                className="relative h-2.5 w-full rounded bg-surface/40"
                title={`Sysblade HyperBuffer · $${row.sysblade.toLocaleString()}`}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded"
                  style={{ width: `${sw}%`, background: "rgba(99,102,241,0.9)" }}
                />
              </div>
            </div>
            <div className="text-right tabular-nums text-xs whitespace-nowrap">
              <div className="text-warning">${row.traditional.toLocaleString()}</div>
              <div className="text-primary">${row.sysblade.toLocaleString()}</div>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-3 mt-2 border-t border-border text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded-sm" style={{ background: "rgba(251,191,36,0.85)" }} />
          Traditional NMC BBU
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded-sm" style={{ background: "rgba(99,102,241,0.9)" }} />
          Sysblade HyperBuffer
        </span>
        <span className="ml-auto">Bar widths normalised to the largest line item.</span>
      </div>
    </div>
  );
}

// Float-safe equality for slider-quantised values. All slider steps are
// powers of 10⁻³ or larger, so a 1e-6 epsilon is way below noise.
const eq = (a: number, b: number) => Math.abs(a - b) < 1e-6;

function inputsMatchPreset(inputs: TcoInputs, p: TcoInputs): boolean {
  return (
    eq(inputs.racks, p.racks) &&
    eq(inputs.electricityPriceUsdPerKwh, p.electricityPriceUsdPerKwh) &&
    eq(inputs.pue, p.pue) &&
    eq(inputs.gridCarbonKgPerKwh, p.gridCarbonKgPerKwh)
  );
}

export function TcoClient() {
  const [inputs, setInputs] = useState<TcoInputs>(() => ({ ...PRESETS[DEFAULT_PRESET] }));
  const result = useMemo(() => computeTco(inputs), [inputs]);

  // Derive the preset selection from the current input values rather than
  // tracking it as separate state. Dragging a slider away from the named
  // preset shows "Custom"; dragging back to the preset's exact values
  // re-selects that preset automatically (the previous imperative
  // setPresetName('custom') made this a one-way trip).
  const presetName = useMemo<string>(() => {
    for (const [name, p] of Object.entries(PRESETS)) {
      if (inputsMatchPreset(inputs, p)) return name;
    }
    return "custom";
  }, [inputs]);

  // Recharts vertical-bar layout reserves a fixed pixel column for category
  // labels — at <640 px we shrink it (and shorten the labels) so the bars
  // themselves stay visible on a phone.
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const breakdown = useMemo<BreakdownRow[]>(() => {
    const t = result.perRack.traditional;
    const s = result.perRack.sysblade;
    return [
      { item: "Initial purchase", short: "Purchase", traditional: t.initial, sysblade: s.initial },
      { item: "Replacements", short: "Replace", traditional: t.replacements, sysblade: s.replacements },
      { item: "Transient losses", short: "Transient", traditional: t.transient, sysblade: s.transient },
      { item: "Ops labor", short: "Ops", traditional: t.ops, sysblade: s.ops },
      { item: "HVDC transition", short: "HVDC", traditional: t.hvdc, sysblade: s.hvdc },
    ];
  }, [result]);

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="text-xs uppercase tracking-[0.2em] text-muted">TCO Calculator · 10-year horizon</div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight">How much does the transient gap cost you?</h1>
        <p className="text-sm sm:text-base text-muted max-w-3xl leading-relaxed">
          Cost model from the proposal §G.3, line-by-line. The reference baseline at
          <span className="text-foreground"> $0.10 / kWh</span> and
          <span className="text-foreground"> PUE 1.4</span> is the headline 33 % savings claim;
          this calculator scales transient and ops costs by your electricity rate so your specific
          scenario will land slightly above or below 33 %.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inputs */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
          </CardHeader>
          <CardBody className="space-y-5">
            <div>
              <label className="text-xs text-muted uppercase tracking-wider">Quick preset</label>
              <select
                value={presetName}
                onChange={(e) => {
                  // Selecting "Custom" is a no-op — the option only appears
                  // when the user has dragged a slider off-preset.
                  if (e.target.value === "custom") return;
                  setInputs({ ...PRESETS[e.target.value] });
                }}
                className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="custom" disabled hidden>Custom</option>
                {Object.keys(PRESETS).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>

            <NumberField
              label="Rack count"
              value={inputs.racks}
              min={1}
              max={5000}
              step={1}
              onChange={(v) => setInputs((s) => ({ ...s, racks: v }))}
            />
            <NumberField
              label="Electricity price (USD / kWh)"
              value={inputs.electricityPriceUsdPerKwh}
              min={0.04}
              max={0.25}
              step={0.005}
              prefix="$"
              onChange={(v) => setInputs((s) => ({ ...s, electricityPriceUsdPerKwh: v }))}
            />
            <NumberField
              label="PUE"
              value={inputs.pue}
              min={1.05}
              max={2.0}
              step={0.05}
              onChange={(v) => setInputs((s) => ({ ...s, pue: v }))}
            />
            <NumberField
              label="Grid carbon (kg CO₂ / kWh)"
              value={inputs.gridCarbonKgPerKwh}
              min={0.05}
              max={0.8}
              step={0.01}
              onChange={(v) => setInputs((s) => ({ ...s, gridCarbonKgPerKwh: v }))}
            />
          </CardBody>
        </Card>

        {/* Headline outputs */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Stat
              label="Fleet 10-year saving"
              value={formatUsd(result.fleet.savingUsd)}
              tone="success"
              hint={`${(result.fleet.savingPct * 100).toFixed(1)} % below traditional BBU`}
            />
            <Stat
              label="Per-rack saving"
              value={formatUsd(result.perRack.saving)}
              tone="primary"
              hint={`${(result.perRack.savingPct * 100).toFixed(1)} % per rack`}
            />
            <Stat
              label="CO₂ avoided · 10y"
              value={formatTons(result.fleet.co2SavedKg)}
              tone="default"
              hint={
                <span className="inline-flex items-center gap-1">
                  {/* EPA average passenger vehicle ≈ 4.6 t CO₂/yr (10y → 46 t).
                      Dividing fleet 10-year savings by 46 t gives the
                      "passenger cars taken off the road for a year" headline. */}
                  <Leaf className="h-3 w-3" /> ≈ {(result.fleet.co2SavedKg / 1000 / 4.6 / 10).toFixed(0)} cars / yr equivalent
                </span>
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cost breakdown · per rack · 10 year horizon</CardTitle>
            </CardHeader>
            <CardBody>
              <BreakdownBars rows={breakdown} isNarrow={isNarrow} />
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Per-rack table */}
      <Card>
        <CardHeader>
          <CardTitle>Line-item detail · single rack · USD</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs uppercase tracking-wider">
                  <th className="text-left py-2">Cost line</th>
                  <th className="text-right py-2">Traditional</th>
                  <th className="text-right py-2">Sysblade</th>
                  <th className="text-right py-2">Δ</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((row) => {
                  const delta = row.sysblade - row.traditional;
                  return (
                    <tr key={row.item} className="border-t border-border">
                      <td className="py-2.5">{row.item}</td>
                      <td className="py-2.5 text-right tabular-nums text-warning">${row.traditional.toLocaleString()}</td>
                      <td className="py-2.5 text-right tabular-nums text-primary">${row.sysblade.toLocaleString()}</td>
                      <td
                        className={`py-2.5 text-right tabular-nums font-medium ${
                          delta < 0 ? "text-success" : "text-danger"
                        }`}
                      >
                        {delta < 0 ? "−" : "+"}${Math.abs(delta).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-border font-semibold">
                  <td className="py-3">Total</td>
                  <td className="py-3 text-right tabular-nums text-warning">
                    ${result.perRack.traditional.total.toLocaleString()}
                  </td>
                  <td className="py-3 text-right tabular-nums text-primary">
                    ${result.perRack.sysblade.total.toLocaleString()}
                  </td>
                  <td className="py-3 text-right tabular-nums text-success">
                    −${result.perRack.saving.toLocaleString()} ({(result.perRack.savingPct * 100).toFixed(0)} %)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* CTA */}
      <Card>
        <CardBody className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Want this report on your letterhead?</h3>
            <p className="text-muted mt-1 text-sm">
              The lead-gen path: drop your email, we send a PDF with line-item assumptions, FTO references, and a quote
              for your specific rack count.
            </p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition cursor-not-allowed opacity-80">
            Email me the report <ArrowRight className="h-4 w-4" />
          </button>
        </CardBody>
      </Card>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  prefix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  prefix?: string;
}) {
  // Decimal places follow the slider step so the typed input shows the same
  // resolution as the slider snaps to (step=1 → 0, step=0.005 → 3, etc.).
  const decimals = step >= 1 ? 0 : Math.max(0, -Math.floor(Math.log10(step)));
  const formatNum = (n: number) =>
    decimals === 0 ? String(Math.round(n)) : n.toFixed(decimals);

  // The number input keeps a local string draft so the user can pass through
  // intermediate states like "" or "0." without us clobbering the parent
  // state. We only commit on blur or Enter; the slider stays at the
  // last-committed value while the user is typing.
  const [draft, setDraft] = useState<string>(() => formatNum(value));
  const userEditingRef = useRef(false);
  useEffect(() => {
    if (userEditingRef.current) return; // don't fight the user mid-type
    setDraft(formatNum(value));
    // formatNum closes over `decimals` which is derived from `step`; both
    // are stable across the input's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = () => {
    userEditingRef.current = false;
    const v = Number(draft);
    if (!Number.isFinite(v)) {
      setDraft(formatNum(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, v));
    if (clamped !== value) onChange(clamped);
    setDraft(formatNum(clamped));
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-xs text-muted uppercase tracking-wider">{label}</label>
        <div className="flex items-center gap-1 text-sm">
          {prefix && <span className="text-muted">{prefix}</span>}
          <input
            type="number"
            value={draft}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
              userEditingRef.current = true;
              setDraft(e.target.value);
            }}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commit();
                (e.currentTarget as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                userEditingRef.current = false;
                setDraft(formatNum(value));
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            className="w-20 rounded border border-border bg-background px-2 py-0.5 text-right tabular-nums font-medium focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-primary"
      />
    </div>
  );
}
