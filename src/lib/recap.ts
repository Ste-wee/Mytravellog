import { Trip } from "@/lib/storage";
import { calendarDayKeys } from "@/lib/travelDays";
import { tripTotalKm } from "@/lib/flyover";
import { computeKmByTransportMode } from "@/components/TravelHighlights";

/**
 * Dati (puri) per il "Recap annuale" — un riassunto dei viaggi di UN anno.
 * Riusa `tripTotalKm` e `computeKmByTransportMode` così i numeri restano
 * coerenti col resto dell'app. La resa (canvas) è a parte, nella pagina.
 */

export interface YearRecord { value: number; city: string }
/** IL momento dell'anno: la voce di diario marcata con la stella (highlight)
 *  più recente tra i viaggi dell'anno — le parole dell'utente, scelte da lui,
 *  che riemergono su card del recap e stories. */
export interface YearMoment { text: string; date: string; tripTitle: string; city: string }
export interface YearRecap {
  year: number;
  trips: number;
  countries: number;
  cities: number;
  km: number;               // km percorsi (tripTotalKm), road-aware
  days: number;             // giorni in viaggio (inclusivi)
  monthsActive: number;     // mesi distinti con almeno un viaggio
  byMode: Record<string, number>;
  topMode: string | null;   // mezzo con più km
  topCountry: { name: string; code: string | null; visits: number } | null;
  farthest: YearRecord | null; // distanza max da casa
  highest: YearRecord | null;  // altitudine max
  hottest: YearRecord | null;
  coldest: YearRecord | null;
  moment: YearMoment | null;   // il giorno-clou marcato nel diario (se c'è)
}

/** Anni (desc) con almeno un viaggio. */
export function availableYears(trips: Trip[]): number[] {
  const set = new Set<number>();
  for (const t of trips) {
    const y = parseInt((t.trip_date || "").slice(0, 4), 10);
    if (Number.isFinite(y)) set.add(y);
  }
  return Array.from(set).sort((a, b) => b - a);
}

const tripYear = (t: Trip): number => parseInt((t.trip_date || "").slice(0, 4), 10);

export function computeYearRecap(allTrips: Trip[], year: number): YearRecap {
  const trips = allTrips.filter(t => tripYear(t) === year);

  const countryNames = new Set<string>();
  const cities = new Set<string>();
  const visitsByCountry = new Map<string, { name: string; code: string | null; visits: number }>();
  const months = new Set<number>();

  for (const t of trips) {
    const m = parseInt((t.trip_date || "").slice(5, 7), 10) - 1;
    if (m >= 0) months.add(m);
    // paesi/città distinti PER questo viaggio (dedup per nome), poi aggregati
    const inTrip = new Map<string, { name: string; code: string | null }>();
    const add = (name?: string, code?: string, city?: string) => {
      if (city) cities.add(`${city}|${name ?? ""}`);
      const key = (name || code || "").trim().toLowerCase();
      if (!key) return;
      countryNames.add(key);
      if (!inTrip.has(key)) inTrip.set(key, { name: name || "", code: code || null });
      else if (!inTrip.get(key)!.code && code) inTrip.get(key)!.code = code;
    };
    for (const w of t.waypoints ?? []) add(w.country, w.country_code, w.city);
    add(t.country, t.country_code, t.city);
    for (const [key, v] of inTrip) {
      const cur = visitsByCountry.get(key);
      if (cur) { cur.visits += 1; if (!cur.code && v.code) cur.code = v.code; }
      else visitsByCountry.set(key, { name: v.name, code: v.code, visits: 1 });
    }
  }

  const km = trips.reduce((s, t) => s + tripTotalKm(t), 0);
  // Giorni di calendario UNICI (calendarDayKeys, la stessa fonte della
  // heatmap): la vecchia somma per-viaggio contava due volte i giorni
  // condivisi (torni il 21, riparti il 21) e poteva divergere dal totale
  // mostrato in Statistiche. Le guardie su date malformate/ritorni prima
  // della partenza vivono nell'helper; resta il tetto a 366 di prima —
  // più di un anno intero in un recap ANNUALE non ha senso (ci si arriva
  // solo con un viaggio a cavallo d'anno dalle date assurde).
  const days = Math.min(Math.max(trips.length > 0 ? 1 : 0, calendarDayKeys(trips).size), 366);

  const byMode = computeKmByTransportMode(trips) as unknown as Record<string, number>;
  const topMode = Object.entries(byMode).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const topCountry = Array.from(visitsByCountry.values())
    .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name, "it"))[0] ?? null;

  const best = (val: (t: Trip) => number | null, city: (t: Trip) => string, cmp: (a: number, b: number) => boolean): YearRecord | null => {
    let rec: YearRecord | null = null;
    for (const t of trips) {
      const v = val(t);
      if (v == null) continue;
      if (!rec || cmp(v, rec.value)) rec = { value: v, city: city(t) };
    }
    return rec;
  };
  // Il momento dell'anno: tra le voci di diario marcate (highlight) con testo,
  // vince la più recente per data (a parità, la prima incontrata). Un viaggio
  // può marcarne al più una, ma più viaggi nell'anno possono averne una a testa.
  let moment: YearMoment | null = null;
  for (const t of trips) {
    for (const e of t.diary ?? []) {
      if (!e.highlight || !e.text?.trim()) continue;
      if (!moment || e.date.localeCompare(moment.date) > 0) {
        moment = { text: e.text.trim(), date: e.date, tripTitle: t.title || t.city, city: t.city };
      }
    }
  }

  const farthest = best(t => t.max_distance_from_home_km ?? t.distance_from_home_km, t => t.max_distance_city ?? t.city, (a, b) => a > b);
  const highest = best(t => t.max_altitude_m ?? t.altitude_m, t => t.max_altitude_city ?? t.city, (a, b) => a > b);
  const hottest = best(t => t.hottest_temp_c ?? t.temperature_c, t => t.hottest_city ?? t.city, (a, b) => a > b);
  const coldest = best(t => t.coldest_temp_c ?? t.temperature_c, t => t.coldest_city ?? t.city, (a, b) => a < b);

  return {
    year, trips: trips.length, countries: countryNames.size, cities: cities.size,
    km, days, monthsActive: months.size, byMode, topMode, topCountry,
    farthest, highest, hottest, coldest, moment,
  };
}
