"use client";

import { useMemo, useState } from "react";

type ColorScale = "diverging" | "viridis";

interface HeatmapProps {
  /** rows[r][c] — outer index = row, inner = column. Same axis as numpy. */
  data: number[][];
  rowLabels?: string[];
  /** Single label rendered under the column axis. */
  colAxisLabel?: string;
  /** Cell width in px. Cell height defaults to the same. */
  cellWidth?: number;
  cellHeight?: number;
  /** "diverging" centres the colormap on 0; "viridis" maps min→max linearly. */
  scale?: ColorScale;
  /** When set, overrides automatic min/max detection. */
  vmin?: number;
  vmax?: number;
  /** Optional callback for cell click. */
  onCellClick?: (r: number, c: number, value: number) => void;
  /** Format function for tooltip values. */
  formatValue?: (v: number) => string;
  /** Show numeric legend underneath. */
  showLegend?: boolean;
  className?: string;
}

/**
 * Interpolate a viridis-like colormap (purple → blue → green → yellow).
 * Inputs t ∈ [0, 1]. We use a 5-stop approximation that's close enough to
 * the real Matplotlib palette and avoids pulling in d3-scale-chromatic.
 */
function viridisHex(t: number): string {
  const stops = [
    [68, 1, 84],     // dark purple
    [59, 82, 139],   // blue
    [33, 144, 141],  // teal
    [94, 201, 98],   // green
    [253, 231, 37],  // yellow
  ];
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = stops[i];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgb(${r},${g},${bl})`;
}

/**
 * Diverging blue–white–red colormap, centred on 0. t ∈ [-1, 1].
 * Negative → blue, zero → light grey, positive → red.
 */
function divergingHex(t: number): string {
  const x = Math.min(1, Math.max(-1, t));
  if (x < 0) {
    // Blue side: lerp [148,163,184] (slate-400) → [56,189,248] (sky-400) at -1
    const a = [148, 163, 184];
    const b = [56, 189, 248];
    const f = -x;
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
  }
  // Red side: slate-400 → red-400 at +1
  const a = [148, 163, 184];
  const b = [248, 113, 113];
  const f = x;
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}

export function Heatmap({
  data,
  rowLabels,
  colAxisLabel,
  cellWidth = 6,
  cellHeight = 14,
  scale = "diverging",
  vmin,
  vmax,
  onCellClick,
  formatValue = (v) => v.toFixed(2),
  showLegend = true,
  className,
}: HeatmapProps) {
  const [hover, setHover] = useState<{ r: number; c: number; value: number; x: number; y: number } | null>(null);

  const { minV, maxV, absMax } = useMemo(() => {
    let mn = Infinity;
    let mx = -Infinity;
    for (const row of data) {
      for (const v of row) {
        if (Number.isFinite(v)) {
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      }
    }
    return { minV: vmin ?? mn, maxV: vmax ?? mx, absMax: Math.max(Math.abs(vmin ?? mn), Math.abs(vmax ?? mx)) };
  }, [data, vmin, vmax]);

  const colorOf = (v: number): string => {
    if (!Number.isFinite(v)) return "rgba(148,163,184,0.2)";
    if (scale === "diverging") {
      // Normalise to [-1, 1] using symmetric absMax so 0 stays grey.
      const t = absMax === 0 ? 0 : v / absMax;
      return divergingHex(t);
    }
    // viridis: linear in [minV, maxV]
    const range = maxV - minV;
    const t = range === 0 ? 0.5 : (v - minV) / range;
    return viridisHex(t);
  };

  const nRows = data.length;
  const nCols = nRows > 0 ? data[0].length : 0;

  const labelGutter = rowLabels ? Math.max(...rowLabels.map((l) => l.length)) * 6.2 + 8 : 0;
  const gridWidth = nCols * cellWidth;
  const gridHeight = nRows * cellHeight;
  const totalWidth = gridWidth + labelGutter + 8;
  const axisH = colAxisLabel ? 16 : 0;
  const totalHeight = gridHeight + axisH + (showLegend ? 28 : 0);

  return (
    <div className={`relative ${className ?? ""}`}>
      <svg
        width="100%"
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block" }}
      >
        {/* Row labels */}
        {rowLabels?.map((lbl, r) => (
          <text
            key={r}
            x={labelGutter - 6}
            y={r * cellHeight + cellHeight * 0.7}
            textAnchor="end"
            style={{ fontSize: 10, fill: "var(--muted)", fontFamily: "ui-monospace, SFMono-Regular" }}
          >
            {lbl}
          </text>
        ))}

        {/* Cells */}
        <g transform={`translate(${labelGutter}, 0)`}>
          {data.map((row, r) =>
            row.map((v, c) => (
              <rect
                key={`${r}-${c}`}
                x={c * cellWidth}
                y={r * cellHeight}
                width={cellWidth}
                height={cellHeight}
                fill={colorOf(v)}
                onMouseEnter={(e) => setHover({ r, c, value: v, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setHover({ r, c, value: v, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(null)}
                onClick={() => onCellClick?.(r, c, v)}
                style={{ cursor: onCellClick ? "pointer" : "default" }}
              />
            )),
          )}
        </g>

        {/* X axis label centred */}
        {colAxisLabel && (
          <text
            x={labelGutter + gridWidth / 2}
            y={gridHeight + 12}
            textAnchor="middle"
            style={{ fontSize: 10, fill: "var(--muted)" }}
          >
            {colAxisLabel}
          </text>
        )}

        {/* Legend strip */}
        {showLegend && (() => {
          const stripY = gridHeight + axisH + 6;
          const stripW = Math.min(180, gridWidth);
          const stripX = labelGutter + (gridWidth - stripW) / 2;
          const segs = 24;
          return (
            <g>
              {Array.from({ length: segs }).map((_, i) => {
                const t = i / (segs - 1);
                const v = scale === "diverging" ? -absMax + t * 2 * absMax : minV + t * (maxV - minV);
                return (
                  <rect
                    key={i}
                    x={stripX + (i * stripW) / segs}
                    y={stripY}
                    width={stripW / segs + 0.5}
                    height={6}
                    fill={colorOf(v)}
                  />
                );
              })}
              <text
                x={stripX}
                y={stripY + 16}
                textAnchor="start"
                style={{ fontSize: 9, fill: "var(--muted)" }}
              >
                {scale === "diverging" ? formatValue(-absMax) : formatValue(minV)}
              </text>
              <text
                x={stripX + stripW}
                y={stripY + 16}
                textAnchor="end"
                style={{ fontSize: 9, fill: "var(--muted)" }}
              >
                {scale === "diverging" ? formatValue(absMax) : formatValue(maxV)}
              </text>
              {scale === "diverging" && (
                <text
                  x={stripX + stripW / 2}
                  y={stripY + 16}
                  textAnchor="middle"
                  style={{ fontSize: 9, fill: "var(--muted)" }}
                >
                  0
                </text>
              )}
            </g>
          );
        })()}
      </svg>

      {hover && (
        <div
          className="pointer-events-none fixed z-50 rounded border border-border bg-background/95 backdrop-blur px-2.5 py-1.5 text-xs shadow-xl"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="font-medium tabular-nums">{formatValue(hover.value)}</div>
          <div className="text-muted text-[10px] tabular-nums">
            {rowLabels ? rowLabels[hover.r] : `row ${hover.r}`} · col {hover.c}
          </div>
        </div>
      )}
    </div>
  );
}
