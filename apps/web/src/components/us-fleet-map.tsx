"use client";

import { useMemo, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
// Bundled at build time so we don't have to think about basePath / CDN.
import usStates from "../../public/us-states.json";
import { type Device, type DeviceStatus, STATUS_COLOR, STATUS_LABEL } from "@/lib/types";

interface CityAggregate {
  name: string;
  lat: number;
  lng: number;
  count: number;
  healthy: number;
  thermal_warn: number;
  early_aging: number;
  worstStatus: DeviceStatus;
  devices: Device[];
}

function aggregateByCity(devices: Device[]): CityAggregate[] {
  const m = new Map<string, CityAggregate>();
  for (const d of devices) {
    let agg = m.get(d.location);
    if (!agg) {
      agg = {
        name: d.location,
        lat: 0,
        lng: 0,
        count: 0,
        healthy: 0,
        thermal_warn: 0,
        early_aging: 0,
        worstStatus: "healthy",
        devices: [],
      };
      m.set(d.location, agg);
    }
    agg.lat += d.lat;
    agg.lng += d.lng;
    agg.count += 1;
    agg[d.status] += 1;
    agg.devices.push(d);
  }
  return Array.from(m.values()).map((agg) => ({
    ...agg,
    lat: agg.lat / agg.count,
    lng: agg.lng / agg.count,
    worstStatus: agg.early_aging > 0 ? "early_aging" : agg.thermal_warn > 0 ? "thermal_warn" : "healthy",
  }));
}

type Hover =
  | { type: "city"; c: CityAggregate; x: number; y: number }
  | { type: "device"; d: Device; x: number; y: number }
  | null;

interface Props {
  devices: Device[];
  height?: number;
}

export function USFleetMap({ devices, height = 380 }: Props) {
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [hovered, setHovered] = useState<Hover>(null);

  const cities = useMemo(() => aggregateByCity(devices), [devices]);
  const selectedAgg = selectedCity ? cities.find((c) => c.name === selectedCity) ?? null : null;

  // If the active filter removes the drilled city's devices, fall back to fleet view
  const effectiveAgg = selectedAgg && selectedAgg.count > 0 ? selectedAgg : null;

  const center: [number, number] = effectiveAgg ? [effectiveAgg.lng, effectiveAgg.lat] : [-96, 38];
  const zoom = effectiveAgg ? 60 : 1;

  // sqrt scaling so a 492-device city isn't 10x the radius of a 47-device one
  const maxCount = cities.reduce((m, c) => Math.max(m, c.count), 1);
  const cityRadius = (n: number) => 8 + Math.sqrt(n / maxCount) * 16; // 8–24 px

  return (
    <div className="relative" style={{ height }}>
      <ComposableMap
        projection="geoAlbersUsa"
        projectionConfig={{ scale: 1000 }}
        width={980}
        height={height}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup center={center} zoom={zoom}>
          <Geographies geography={usStates as object}>
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

          {/* Overview: one marker per city, sized by device count */}
          {!effectiveAgg &&
            cities.map((c) => {
              const r = cityRadius(c.count);
              return (
                <Marker
                  key={c.name}
                  coordinates={[c.lng, c.lat]}
                  onClick={() => setSelectedCity(c.name)}
                  onMouseEnter={(e) =>
                    setHovered({ type: "city", c, x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY })
                  }
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    default: { cursor: "pointer" },
                    hover: { cursor: "pointer" },
                    pressed: { cursor: "pointer" },
                  }}
                >
                  <circle r={r} fill={STATUS_COLOR[c.worstStatus]} fillOpacity={0.18} />
                  <circle
                    r={r * 0.55}
                    fill={STATUS_COLOR[c.worstStatus]}
                    fillOpacity={0.85}
                    stroke="rgba(255,255,255,0.6)"
                    strokeWidth={1}
                  />
                  <text
                    textAnchor="middle"
                    y={3.5}
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      fill: "white",
                      pointerEvents: "none",
                      userSelect: "none",
                    }}
                  >
                    {c.count}
                  </text>
                </Marker>
              );
            })}

          {/* Drilled: individual device markers, only for the selected city.
              Radii are tiny because the SVG is uniformly scaled by zoom={60}. */}
          {effectiveAgg &&
            effectiveAgg.devices.map((d) => (
              <Marker
                key={d.id}
                coordinates={[d.lng, d.lat]}
                onMouseEnter={(e) =>
                  setHovered({ type: "device", d, x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY })
                }
                onMouseLeave={() => setHovered(null)}
              >
                <circle
                  r={d.status === "healthy" ? 0.18 : 0.28}
                  fill={STATUS_COLOR[d.status]}
                  fillOpacity={d.status === "healthy" ? 0.55 : 0.9}
                  stroke={d.status === "healthy" ? "none" : "rgba(0,0,0,0.4)"}
                  strokeWidth={0.05}
                />
              </Marker>
            ))}
        </ZoomableGroup>
      </ComposableMap>

      {/* Drilled-in breadcrumb + reset button */}
      {effectiveAgg && (
        <>
          <div className="absolute top-3 left-3 rounded-md border border-border bg-background/85 backdrop-blur px-3 py-1.5 text-xs flex items-center gap-2">
            <span className="text-muted">Viewing</span>
            <span className="font-semibold text-foreground">{effectiveAgg.name}</span>
            <span className="text-muted">·</span>
            <span className="tabular-nums">{effectiveAgg.count} devices</span>
            {effectiveAgg.early_aging > 0 && (
              <>
                <span className="text-muted">·</span>
                <span className="tabular-nums" style={{ color: STATUS_COLOR.early_aging }}>
                  {effectiveAgg.early_aging} aging
                </span>
              </>
            )}
            {effectiveAgg.thermal_warn > 0 && (
              <>
                <span className="text-muted">·</span>
                <span className="tabular-nums" style={{ color: STATUS_COLOR.thermal_warn }}>
                  {effectiveAgg.thermal_warn} warn
                </span>
              </>
            )}
          </div>
          <button
            onClick={() => setSelectedCity(null)}
            className="absolute top-3 right-3 rounded-md border border-border bg-background/85 backdrop-blur px-3 py-1.5 text-xs hover:bg-background"
          >
            ← Back to fleet
          </button>
        </>
      )}

      {/* Empty hint when filter removed every device */}
      {!effectiveAgg && cities.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted pointer-events-none">
          No devices match the current filter.
        </div>
      )}

      {/* Tooltip — city (overview) or device (drilled) */}
      {hovered?.type === "city" && (
        <div
          className="pointer-events-none fixed z-50 rounded border border-border bg-background/95 backdrop-blur px-3 py-2 text-xs shadow-xl space-y-0.5 min-w-[180px]"
          style={{ left: hovered.x + 12, top: hovered.y + 12 }}
        >
          <div className="font-semibold text-foreground">{hovered.c.name}</div>
          <div className="text-muted">{hovered.c.count} devices · click to drill in</div>
          <div className="pt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
            <span style={{ color: STATUS_COLOR.healthy }}>Healthy</span>
            <span className="text-right tabular-nums">{hovered.c.healthy}</span>
            <span style={{ color: STATUS_COLOR.thermal_warn }}>Thermal warn</span>
            <span className="text-right tabular-nums">{hovered.c.thermal_warn}</span>
            <span style={{ color: STATUS_COLOR.early_aging }}>Early aging</span>
            <span className="text-right tabular-nums">{hovered.c.early_aging}</span>
          </div>
        </div>
      )}
      {hovered?.type === "device" && (
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

      {/* Legend (always shown) */}
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
