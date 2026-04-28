"use client";

import { useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";

interface Device {
  id: string;
  site: string;
  location: string;
  lat: number;
  lng: number;
  soh_lfp: number;
  rul_cycles: number;
  age_months: number;
  temp_lfp_c: number;
  status: "healthy" | "thermal_warn" | "early_aging";
}

const STATUS_COLOR: Record<Device["status"], string> = {
  healthy: "#34d399",
  thermal_warn: "#fbbf24",
  early_aging: "#f87171",
};

const STATUS_LABEL: Record<Device["status"], string> = {
  healthy: "Healthy",
  thermal_warn: "Thermal warning",
  early_aging: "Early aging",
};

interface Props {
  devices: Device[];
  height?: number;
}

export function USFleetMap({ devices, height = 380 }: Props) {
  const [hovered, setHovered] = useState<{ d: Device; x: number; y: number } | null>(null);

  return (
    <div className="relative" style={{ height }}>
      <ComposableMap
        projection="geoAlbersUsa"
        projectionConfig={{ scale: 1000 }}
        width={980}
        height={height}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup center={[-96, 38]} zoom={1}>
          <Geographies geography="/us-states.json">
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="rgba(99, 102, 241, 0.08)"
                  stroke="rgba(148, 163, 184, 0.45)"
                  strokeWidth={0.6}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: "rgba(99, 102, 241, 0.16)" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {devices.map((d) => (
            <Marker
              key={d.id}
              coordinates={[d.lng, d.lat]}
              onMouseEnter={(e) =>
                setHovered({ d, x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY })
              }
              onMouseLeave={() => setHovered(null)}
            >
              <circle
                r={d.status === "healthy" ? 1.6 : 2.6}
                fill={STATUS_COLOR[d.status]}
                fillOpacity={d.status === "healthy" ? 0.55 : 0.9}
                stroke={d.status === "healthy" ? "none" : "rgba(0,0,0,0.4)"}
                strokeWidth={0.5}
              />
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {hovered && (
        <div
          className="pointer-events-none fixed z-50 rounded border border-border bg-background/95 backdrop-blur px-3 py-2 text-xs shadow-xl space-y-0.5"
          style={{ left: hovered.x + 12, top: hovered.y + 12 }}
        >
          <div className="font-medium text-foreground">{hovered.d.id}</div>
          <div className="text-muted">{hovered.d.site}</div>
          <div className="text-muted">{hovered.d.location}</div>
          <div className="pt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
            <span className="text-muted">SOH LFP</span>
            <span className="text-right tabular-nums">{(hovered.d.soh_lfp * 100).toFixed(1)}%</span>
            <span className="text-muted">RUL</span>
            <span className="text-right tabular-nums">{hovered.d.rul_cycles} cycles</span>
            <span className="text-muted">Temp LFP</span>
            <span className="text-right tabular-nums">{hovered.d.temp_lfp_c}°C</span>
            <span className="text-muted">Status</span>
            <span className="text-right font-medium" style={{ color: STATUS_COLOR[hovered.d.status] }}>
              {STATUS_LABEL[hovered.d.status]}
            </span>
          </div>
        </div>
      )}

      {/* legend */}
      <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-background/80 backdrop-blur px-3 py-1.5 text-xs">
        {(["healthy", "thermal_warn", "early_aging"] as const).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
            <span className="text-muted">{STATUS_LABEL[s]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
