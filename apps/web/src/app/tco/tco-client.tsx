"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

// Stable references for Recharts props. Inline functions / new objects on
// every parent render combine with ResponsiveContainer's ResizeObserver to
// cause "Maximum update depth exceeded" loops on rapid input changes
// (e.g. dragging the rack-count slider). Hoisting them out is the fix.
const LEGEND_WRAPPER_STYLE = { fontSize: 11, color: "var(--muted)" } as const;

function BreakdownTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string | number; value?: number; color?: string }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-border bg-background/95 backdrop-blur px-3 py-2 text-xs shadow-xl">
      <div className="text-muted mb-1">{label}</div>
      {payload.map((p) => (
        <div key={String(p.name)} className="flex items-center gap-2 tabular-nums">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto font-medium">${p.value!.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export function TcoClient() {
  const [presetName, setPresetName] = useState<string>(DEFAULT_PRESET);
  const [inputs, setInputs] = useState<TcoInputs>(() => ({ ...PRESETS[DEFAULT_PRESET] }));
  const result = useMemo(() => computeTco(inputs), [inputs]);

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

  const breakdown = useMemo(() => {
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
                  setPresetName(e.target.value);
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
              onChange={(v) => {
                setPresetName("custom");
                setInputs((s) => ({ ...s, racks: v }));
              }}
            />
            <NumberField
              label="Electricity price (USD / kWh)"
              value={inputs.electricityPriceUsdPerKwh}
              min={0.04}
              max={0.25}
              step={0.005}
              onChange={(v) => {
                setPresetName("custom");
                setInputs((s) => ({ ...s, electricityPriceUsdPerKwh: v }));
              }}
              format={(n) => `$${n.toFixed(3)}`}
            />
            <NumberField
              label="PUE"
              value={inputs.pue}
              min={1.05}
              max={2.0}
              step={0.05}
              onChange={(v) => {
                setPresetName("custom");
                setInputs((s) => ({ ...s, pue: v }));
              }}
              format={(n) => n.toFixed(2)}
            />
            <NumberField
              label="Grid carbon (kg CO₂ / kWh)"
              value={inputs.gridCarbonKgPerKwh}
              min={0.05}
              max={0.8}
              step={0.01}
              onChange={(v) => {
                setPresetName("custom");
                setInputs((s) => ({ ...s, gridCarbonKgPerKwh: v }));
              }}
              format={(n) => n.toFixed(2)}
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
              {/* Fixed-height wrapper stabilises the ResizeObserver feedback
                  loop ResponsiveContainer can hit when the parent grid cell
                  re-flows on every input change. */}
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%" debounce={50}>
                  <BarChart
                    data={breakdown}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: isNarrow ? 0 : 80, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} stroke="" />
                    <YAxis
                      type="category"
                      dataKey={isNarrow ? "short" : "item"}
                      stroke=""
                      width={isNarrow ? 64 : 100}
                    />
                    <Tooltip content={<BreakdownTooltip />} />
                    <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
                    <Bar dataKey="traditional" name="Traditional NMC BBU" fill="rgba(251,191,36,0.8)" radius={[0, 3, 3, 0]} />
                    <Bar dataKey="sysblade" name="Sysblade HyperBuffer" fill="rgba(99,102,241,0.85)" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
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
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (n: number) => string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-xs text-muted uppercase tracking-wider">{label}</label>
        <span className="text-sm font-medium tabular-nums">{format ? format(value) : value}</span>
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
