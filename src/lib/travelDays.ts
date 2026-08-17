import { Trip, parseLocalDate } from "@/lib/storage";

// ~30 anni: oltre è quasi certamente una data corrotta (es. anno a 5 cifre).
// Senza questa guardia il while sotto itererebbe centinaia di migliaia di
// volte congelando la UI — stessa difesa nata in computeMonthlyTravelDays.
const MAX_SPAN_DAYS = 366 * 30;

/**
 * Le chiavi "anno-mese-giorno" dei giorni di calendario coperti dai viaggi
 * (estremi INCLUSI: 1-5 giugno = 5 giorni), UNICHE.
 *
 * È il punto che corregge il doppio conteggio: due viaggi che condividono un
 * giorno — torni il 21 e riparti il 21, o si sovrappongono — contavano quel
 * giorno due volte, sia nel totale della heatmap sia nel recap annuale, e i
 * due numeri potevano pure divergere tra loro. Un giorno di calendario in
 * viaggio è UN giorno, non importa quanti viaggi lo tocchino.
 *
 * Guardie ereditate: date malformate (NaN) e ritorni prima della partenza
 * vengono saltati; gli span assurdi (> ~30 anni) pure.
 */
export function calendarDayKeys(trips: Trip[]): Set<string> {
  const giorni = new Set<string>();
  for (const t of trips) {
    const start = parseLocalDate(t.trip_date);
    const end = t.date_end ? parseLocalDate(t.date_end) : start;
    if (end < start) continue;
    const spanDays = (end.getTime() - start.getTime()) / 86400000;
    if (!Number.isFinite(spanDays) || spanDays > MAX_SPAN_DAYS) continue;
    const cur = new Date(start);
    while (cur <= end) {
      giorni.add(`${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`);
      cur.setDate(cur.getDate() + 1);
    }
  }
  return giorni;
}
