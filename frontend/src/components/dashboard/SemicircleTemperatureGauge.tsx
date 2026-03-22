/**
 * Semi-circular temperature gauge (SVG). Theme-aligned; arc shifts cool → warm → red with temperature.
 */

import { useId } from "react";

const GAUGE_MIN = 0;
const GAUGE_MAX = 50;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Cool blues below ~20 °C; from 20 °C toward yellow, then orange, strong red by 40 °C+.
 * Stops are absolute °C (clamped to gauge range).
 */
const COLOR_STOPS = [
  { c: 0, h: 212, s: 70, l: 58 },
  { c: 16, h: 198, s: 72, l: 57 },
  { c: 20, h: 186, s: 70, l: 56 },
  { c: 23, h: 52, s: 86, l: 54 },
  { c: 28, h: 42, s: 88, l: 53 },
  { c: 32, h: 32, s: 90, l: 52 },
  { c: 38, h: 18, s: 92, l: 51 },
  { c: 42, h: 6, s: 94, l: 50 },
  { c: 50, h: 0, s: 96, l: 49 },
] as const;

function gaugeColor(tempCelsius: number): string {
  const t = clamp(tempCelsius, GAUGE_MIN, GAUGE_MAX);
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const a = COLOR_STOPS[i];
    const b = COLOR_STOPS[i + 1];
    if (t <= b.c) {
      const span = b.c - a.c;
      const u = span <= 0 ? 0 : (t - a.c) / span;
      const h = a.h + (b.h - a.h) * u;
      const s = a.s + (b.s - a.s) * u;
      const l = a.l + (b.l - a.l) * u;
      return `hsl(${h} ${s}% ${l}%)`;
    }
  }
  const last = COLOR_STOPS[COLOR_STOPS.length - 1];
  return `hsl(${last.h} ${last.s}% ${last.l}%)`;
}

interface SemicircleTemperatureGaugeProps {
  /** Celsius, or `null` when there is no live device reading (empty gauge, “NA”). */
  temperature: number | null;
  className?: string;
}

export function SemicircleTemperatureGauge({ temperature, className = "" }: SemicircleTemperatureGaugeProps) {
  const filterId = useId().replace(/:/g, "");
  const noReading = temperature === null;
  const numeric =
    temperature !== null && Number.isFinite(temperature) && temperature > -900;
  const displayTemp = numeric ? temperature : null;
  const pct = numeric ? clamp((temperature - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN), 0, 1) : 0;
  const pathLength = 100;
  const dashOffset = pathLength * (1 - pct);
  const accent = numeric ? gaugeColor(temperature) : "rgb(148, 163, 184)";

  /* Larger arc: r=80, stroke 12, matches scaled card */
  return (
    <div className={`relative mx-auto w-full max-w-[min(100%,20rem)] ${className}`}>
      <svg viewBox="0 0 200 124" className="h-auto w-full min-h-[9.5rem]" aria-hidden>
        <defs>
          <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d="M 20 102 A 80 80 0 0 1 180 102"
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          className="stroke-slate-200/90 dark:stroke-slate-600/60"
        />
        <path
          d="M 20 102 A 80 80 0 0 1 180 102"
          fill="none"
          stroke={accent}
          strokeWidth="12"
          strokeLinecap="round"
          pathLength={pathLength}
          strokeDasharray={pathLength}
          strokeDashoffset={dashOffset}
          filter={`url(#${filterId})`}
          className="transition-[stroke-dashoffset,stroke] duration-500 ease-out"
        />
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[32%] flex flex-col items-center justify-center">
        <div className="flex items-baseline gap-1.5 leading-none">
          <span className="text-[2rem] font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-50 sm:text-[2.35rem]">
            {noReading ? "NA" : displayTemp !== null ? displayTemp.toFixed(1) : "—"}
          </span>
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">°C</span>
        </div>
      </div>
    </div>
  );
}
