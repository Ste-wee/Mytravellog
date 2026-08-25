import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { type Chiave, type Lingua, type PreferenzaLingua, localeDi, risolviLingua, traduci } from "@/lib/i18n";

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
  /** La lingua dell'interfaccia. "sistema" segue il browser. */
  lingua: PreferenzaLingua;
};

type Ctx = Settings & {
  setDistanceUnit: (v: DistanceUnit) => void;
  setTemperatureUnit: (v: TemperatureUnit) => void;
  setAutoRotate: (v: AutoRotate) => void;
  setHomeCity: (v: HomeCity) => void;
  setMinMarkerScale: (v: number) => void;
  setMaxMarkerScale: (v: number) => void;
  setLingua: (v: PreferenzaLingua) => void;
  /** La lingua VERA (mai "sistema"): quella con cui tradurre adesso. */
  linguaAttiva: Lingua;
  /** Traduce una scritta dell'interfaccia. Vedi lib/i18n. */
  t: (chiave: Chiave, params?: Record<string, string | number>) => string;
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
  // ⚠️ "it", NON "sistema". Avevo messo "sistema" convinto che fosse più
  // gentile con chi arriva da fuori, e ho scoperto due cose provandolo:
  // l'app di Stefano sarebbe passata all'inglese da sola se il suo browser
  // fosse in inglese — un cambio che nessuno ha chiesto — e quattro test di
  // TravelHighlights sono caduti perché in jsdom `navigator.language` è
  // inglese, quindi i numeri uscivano "9,710" invece di "9.710".
  // L'app nasce italiana: chi vuole il resto lo scegli, non lo subisce.
  lingua: "it",
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

  const linguaOra = risolviLingua(s.lingua);
  // Date e numeri seguono la lingua: `fmtNumber` e i `toLocaleDateString`
  // sparsi nei componenti leggono il locale da qui, così non esiste una
  // schermata che resta in italiano solo per le date.
  useEffect(() => { impostaLingua(linguaOra); }, [linguaOra]);
  // Anche l'attributo `lang` del documento: serve alla sillabazione, agli
  // screen reader e alla tastiera del telefono.
  useEffect(() => { document.documentElement.lang = linguaOra; }, [linguaOra]);

  const value: Ctx = {
    ...s,
    setDistanceUnit: (v) => setS((p) => ({ ...p, distanceUnit: v })),
    setTemperatureUnit: (v) => setS((p) => ({ ...p, temperatureUnit: v })),
    setAutoRotate: (v) => setS((p) => ({ ...p, autoRotate: v })),
    setHomeCity: (v) => setS((p) => ({ ...p, homeCity: v })),
    setMinMarkerScale: (v) => setS((p) => ({ ...p, minMarkerScale: clampScale(v) })),
    setMaxMarkerScale: (v) => setS((p) => ({ ...p, maxMarkerScale: clampScale(v) })),
    setLingua: (v) => setS((p) => ({ ...p, lingua: v })),
    linguaAttiva: linguaOra,
    t: (chiave, params) => traduci(linguaOra, chiave, params),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSettings must be inside SettingsProvider");
  return ctx;
}

/**
 * Il traduttore, per i componenti.
 *
 * ⚠️ A differenza di `useSettings`, **non esplode senza provider**: ricade
 * sull'italiano. Non è pigrizia, è una scelta con due motivi:
 *
 * - **35 file di test** montano i componenti senza `SettingsProvider`. Se il
 *   traduttore pretendesse il contesto, tradurre un componente vorrebbe dire
 *   riscrivere il suo test — e allora i test non potrebbero più fare da rete
 *   per la traduzione stessa. Così restano verdi e provano che l'italiano non
 *   è cambiato di una virgola.
 * - **Una scritta è meno importante di una schermata.** Se un domani un
 *   componente finisse fuori dal provider, deve mostrare l'italiano, non una
 *   pagina bianca.
 */
export function useT(): Ctx["t"] {
  const ctx = useContext(Ctx);
  return ctx ? ctx.t : (chiave, params) => traduci("it", chiave, params);
}

// Il separatore delle migliaia SEMPRE: l'italiano di CLDR non raggruppa i
// numeri a 4 cifre (minimumGroupingDigits=2 → "4419", il punto compare solo
// da 10.000 in su), quindi i totali più comuni dell'app — km, quote e giorni
// tra 1.000 e 9.999 — uscivano senza separatore e sembrava mancasse del tutto.
// `useGrouping: "always"` è ES2023: la lib del progetto è ES2020 (per scelta,
// vedi tsconfig) e il suo tipo dice ancora `boolean`. Il cast resta QUI.
// Runtime: i motori pre-2022 coercevano la stringa a true (= "auto", il
// comportamento di prima) — nessun crash, al peggio niente punto sui 4 cifre.
const opzioniNumero = { useGrouping: "always" } as unknown as Intl.NumberFormatOptions;
let NUMERO = new Intl.NumberFormat("it-IT", opzioniNumero);
/** Il locale di date e numeri, cambiato dal provider quando cambia la lingua.
 *  Una variabile di modulo e non un hook, per non toccare le decine di punti
 *  che chiamano `fmtNumber` — e perché serve anche a chi disegna su canvas,
 *  dove gli hook non arrivano. */
// Anche il locale parte dalla lingua salvata: vedi la nota su LINGUA qui sotto.
let LOCALE = "it-IT";
export function impostaLocale(locale: string): void {
  LOCALE = locale;
  NUMERO = new Intl.NumberFormat(locale, opzioniNumero);
}
/** Il locale attivo: da passare a `toLocaleDateString` invece di "it-IT". */
export const localeAttivo = (): string => LOCALE;

/**
 * La lingua attiva e il traduttore per il codice SENZA hook.
 *
 * Servono a tre famiglie di codice che non possono usare `useT`: le funzioni
 * pure (`planCountdown`, `formatTripDate`), quello che disegna su canvas (il
 * poster del recap, le stories) e i moduli chiamati fuori dall'albero React.
 * Il provider li tiene aggiornati insieme al locale.
 *
 * ⚠️ Stessa avvertenza del locale: è stato di modulo, quindi un test che monta
 * il provider in inglese lo lascia in inglese per quello dopo.
 */
/**
 * ⚠️ Inizializzata al CARICAMENTO del modulo, non dal provider.
 *
 * Il provider imposta la lingua in un `useEffect`, cioè **dopo il primo
 * render**: chiunque chiamasse `tr()` o `localeAttivo()` durante quel primo
 * render leggeva l'italiano anche con l'app in inglese. Provato: oggi non si
 * vede, ma solo perché tutte le pagine sono a caricamento pigro e montano dopo
 * l'effect — cioè funzionava **per fortuna**, non per costruzione. Leggendo
 * qui le impostazioni salvate, la lingua è giusta dalla prima riga di codice.
 */
let LINGUA: Lingua = (() => {
  try {
    const salvate = JSON.parse(localStorage.getItem(KEY) || "null");
    return risolviLingua(salvate?.lingua ?? DEFAULTS.lingua);
  } catch {
    return "it";
  }
})();

export function impostaLingua(lingua: Lingua): void {
  LINGUA = lingua;
  impostaLocale(localeDi(lingua));
}
export const linguaAttiva = (): Lingua => LINGUA;
export const tr = (chiave: Chiave, params?: Record<string, string | number>): string =>
  traduci(LINGUA, chiave, params);

// Allinea il locale alla lingua letta all'avvio (il `let LOCALE` qui sopra
// nasce italiano perché serve a `NUMERO`, che si costruisce prima).
impostaLocale(localeDi(LINGUA));
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
