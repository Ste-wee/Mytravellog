import { Trip, isValidDateISO } from "./storage";

/**
 * Gite in giornata: parti e torni lo stesso giorno.
 *
 * L'app le censiva già senza problemi (biglietto con «· 1g», km, giorni in
 * viaggio) — solo che nei conteggi una gita a Como pesava come cinque giorni a
 * Zurigo. Da qui si ricava la distinzione, senza campi nuovi: sono le DATE a
 * dirlo, come per la base del viaggio.
 *
 * ⚠️ **Le gite hanno una casa loro (scelta di Stefano, 2026-08-24).** Prima
 * erano "viaggi minori": escluse dal numero dei viaggi ma dentro paesi, città,
 * km, globo, recap e statistiche. Sulla stessa schermata la stessa gita non era
 * un viaggio per il contatore ed era un viaggio per le città — un'incoerenza
 * mai dichiarata, che sembrava un bug. Ora sono **fuori dai conti del viaggio**
 * (statistiche, recap, «quando viaggi», record) e **contate a parte**; restano
 * sul globo con un tratto più leggero, perché ci sei stato davvero.
 *
 * Nessun dato è stato modificato: le gite sono viaggi identici nell'archivio,
 * cambia solo come vengono contate. Tornare indietro costa una riga.
 *
 * **La regola per chi legge questo file: qualunque conteggio "di viaggio" parte
 * da `separaGite(trips).viaggi`, non da `trips`.** Se scrivi una nuova
 * statistica e usi `trips` grezzo, le gite rientrano dalla finestra.
 */

/**
 * Vero quando partenza e ritorno sono lo STESSO giorno, entrambi dichiarati.
 *
 * ⚠️ Un ritorno NON compilato non è una gita: è una durata sconosciuta, e
 * indovinare vorrebbe dire declassare a gita i viaggi di chi non ha mai messo
 * la data di ritorno. Nel dubbio resta un viaggio.
 */
export function eGitaInGiornata(t: Pick<Trip, "trip_date" | "date_end">): boolean {
  if (!isValidDateISO(t.trip_date) || !isValidDateISO(t.date_end)) return false;
  return t.trip_date === t.date_end;
}

/** Quanti viaggi (più di un giorno, o durata non dichiarata) e quante gite. */
export function contaViaggiEGite(trips: Trip[]): { viaggi: number; gite: number } {
  let gite = 0;
  for (const t of trips) if (eGitaInGiornata(t)) gite++;
  return { viaggi: trips.length - gite, gite };
}

/**
 * I due mucchi: i viaggi veri e le gite in giornata.
 *
 * È la porta da cui passa TUTTA l'app: una sola definizione, applicata in nove
 * punti diversi (Home, elenco, statistiche, forme, recap, «quando viaggi»,
 * globo…). Tenerne copie sparse è il modo in cui due schermate finiscono per
 * raccontare numeri diversi — già visto con la sequenza delle fermate.
 */
export function separaGite(trips: Trip[]): { viaggi: Trip[]; gite: Trip[] } {
  const viaggi: Trip[] = [], gite: Trip[] = [];
  for (const t of trips) (eGitaInGiornata(t) ? gite : viaggi).push(t);
  return { viaggi, gite };
}
