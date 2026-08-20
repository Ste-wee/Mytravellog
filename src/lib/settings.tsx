import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type DistanceUnit = "metric" | "imperial";
export type TemperatureUnit = "celsius" | "fahrenheit";
export type AutoRotate = "on" | "off";

export type HomeCity = {
  label: string;
  lat: number;
  lon: number;
} | null;

export type Settings = {
  distanceUnit: DistanceUnit;
  temperatureUnit: TemperatureUnit;
  autoRotate: AutoRotate;
  homeCity: HomeCity;
  minMarkerScale: number;
  maxMarkerScale: number;
};

type Ctx = Settings & {
  setDistanceUnit: (v: DistanceUnit) => void;
  setTemperatureUnit: (v: TemperatureUnit) => void;
  setAutoRotate: (v: AutoRotate) => void;
  setHomeCity: (v: HomeCity) => void;
  setMinMarkerScale: (v: number) => void;
  setMaxMarkerScale: (v: number) => void;
};

export const MARKER_SCALE_MIN = 0.1;
export const MARKER_SCALE_MAX = 2.0;

const DEFAULTS: Settings = {
  distanceUnit: "metric",
  temperatureUnit: "celsius",
  autoRotate: "on",
  homeCity: null,
  // "Piccoli" (0,3-0,7) invece di "Standard": con l'archivio che cresce i
  // pallini si impastano (44 punti in Europa centrale = 35 coppie sovrapposte),
  // mentre col primo viaggio la differenza è appena percettibile. Chi ha già
  // scelto una dimensione non viene toccato: le impostazioni salvate vincono.
  minMarkerScale: 0.3,
  maxMarkerScale: 0.7,
};

function clampScale(v: number): number {
  if (!Number.isFinite(v)) return 0.5;
  return Math.min(MARKER_SCALE_MAX, Math.max(MARKER_SCALE_MIN, v));
}

const KEY = "atlas.settings.v1";

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

const Ctx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>(load);
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(s)); }, [s]);

  // Apply theme class to document root

  const value: Ctx = {
    ...s,
    setDistanceUnit: (v) => setS((p) => ({ ...p, distanceUnit: v })),
    setTemperatureUnit: (v) => setS((p) => ({ ...p, temperatureUnit: v })),
    setAutoRotate: (v) => setS((p) => ({ ...p, autoRotate: v })),
    setHomeCity: (v) => setS((p) => ({ ...p, homeCity: v })),
    setMinMarkerScale: (v) => setS((p) => ({ ...p, minMarkerScale: clampScale(v) })),
    setMaxMarkerScale: (v) => setS((p) => ({ ...p, maxMarkerScale: clampScale(v) })),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSettings must be inside SettingsProvider");
  return ctx;
}

// Il separatore delle migliaia SEMPRE: l'italiano di CLDR non raggruppa i
// numeri a 4 cifre (minimumGroupingDigits=2 → "4419", il punto compare solo
// da 10.000 in su), quindi i totali più comuni dell'app — km, quote e giorni
// tra 1.000 e 9.999 — uscivano senza separatore e sembrava mancasse del tutto.
// `useGrouping: "always"` è ES2023: la lib del progetto è ES2020 (per scelta,
// vedi tsconfig) e il suo tipo dice ancora `boolean`. Il cast resta QUI.
// Runtime: i motori pre-2022 coercevano la stringa a true (= "auto", il
// comportamento di prima) — nessun crash, al peggio niente punto sui 4 cifre.
const NUMERO = new Intl.NumberFormat("it-IT", { useGrouping: "always" } as unknown as Intl.NumberFormatOptions);
export const fmtNumber = (n: number): string => NUMERO.format(n);

export function fmtDistance(km: number | null | undefined, unit: DistanceUnit): string {
  if (km == null) return "—";
  if (unit === "imperial") return `${fmtNumber(Math.round(km * 0.621371))} mi`;
  return `${fmtNumber(Math.round(km))} km`;
}

export function fmtAltitude(m: number | null | undefined, unit: DistanceUnit): string {
  if (m == null) return "—";
  if (unit === "imperial") return `${fmtNumber(Math.round(m * 3.28084))} ft`;
  return `${fmtNumber(Math.round(m))} m`;
}

export function fmtTemp(c: number | null | undefined, unit: TemperatureUnit): string {
  if (c == null) return "—";
  const v = unit === "fahrenheit" ? c * 9 / 5 + 32 : c;
  // Il decimale solo quando esiste: "24.0°C" era rumore su ogni biglietto.
  // E quando c'è si scrive all'italiana, con la VIRGOLA: il vecchio
  // toFixed(1) usava il punto ("18.5°C") in un'app tutta in italiano.
  const r = Math.round(v * 10) / 10;
  const testo = Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",");
  return `${testo}°${unit === "fahrenheit" ? "F" : "C"}`;
}

// ── Backwards-compatible aliases (used by older components) ──────────────────
export function formatDistanceKm(km: number | null | undefined, unit: DistanceUnit): string {
  return fmtDistance(km, unit);
}
export function formatAltitudeM(m: number | null | undefined, unit: DistanceUnit): string {
  return fmtAltitude(m, unit);
}
export function formatTemperatureC(c: number | null | undefined, unit: TemperatureUnit): string {
  return fmtTemp(c, unit);
}

// parseStoredSettings — used by settings.test.tsx
export function parseStoredSettings(raw: string | null): Settings {
  if (!raw) return DEFAULTS;
  try { return { ...DEFAULTS, ...JSON.parse(raw) }; }
  catch { return DEFAULTS; }
}
