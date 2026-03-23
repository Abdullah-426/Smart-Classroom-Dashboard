const LS_KEY = "smart-classroom-estimated-energy-saved-wh";
const LS_BASELINE_KEY = "smart-classroom-estimated-energy-saved-baseline-wh";

export function readStoredEnergyWh(): number {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw == null || raw === "") return 0;
    const n = parseFloat(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeStoredEnergyWh(wh: number): void {
  try {
    localStorage.setItem(LS_KEY, String(wh));
  } catch {
    /* quota / private mode */
  }
}

export function readEnergyBaselineWh(): number {
  try {
    const raw = localStorage.getItem(LS_BASELINE_KEY);
    if (raw == null || raw === "") return 0;
    const n = parseFloat(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeEnergyBaselineWh(wh: number): void {
  try {
    localStorage.setItem(LS_BASELINE_KEY, String(wh));
  } catch {
    /* quota / private mode */
  }
}

/** Parses values like "138 Wh" or "0.00 Wh" from the dashboard summary. */
export function parseEnergySavedWh(display: string): number {
  const m = String(display).trim().match(/^([\d.]+)\s*Wh\b/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function formatEnergySavedWh(wh: number): string {
  return `${wh.toFixed(2)} Wh`;
}
