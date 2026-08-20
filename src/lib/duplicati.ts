import { Trip } from "./storage";

/**
 * C'è già un viaggio nello stesso posto con date che si sovrappongono?
 *
 * Esiste perché è successo davvero: due "Zurigo" identici (1-2 nov 2025),
 * nati da due risultati di ricerca leggermente diversi, e nessun avviso.
 * Il criterio scelto da Stefano è il più preciso: STESSA città (nome
 * normalizzato — le coordinate dei due doppioni differivano) e intervalli di
 * date che si toccano. Un ritorno nello stesso posto in date diverse NON è
 * un doppione: è un altro viaggio.
 */
export function trovaDuplicato(
  trips: Trip[],
  city: string,
  dateStart: string,
  dateEnd?: string | null,
): Trip | null {
  const nome = city.trim().toLowerCase();
  if (!nome || !dateStart) return null;
  const aInizio = dateStart;
  const aFine = dateEnd || dateStart;
  for (const t of trips) {
    if ((t.city || "").trim().toLowerCase() !== nome) continue;
    const bInizio = t.trip_date;
    if (!bInizio) continue;
    const bFine = t.date_end || bInizio;
    // Due intervalli si sovrappongono se ognuno inizia prima che l'altro
    // finisca (date ISO: il confronto lessicografico è quello cronologico).
    if (aInizio <= bFine && bInizio <= aFine) return t;
  }
  return null;
}
