import { Trip } from "@/lib/storage";
import { riconosciBase } from "@/lib/base";

export interface FermateBiglietto {
  /** I nomi da raccontare, in ordine: casa, poi le tappe — con la base una
   *  volta sola invece di una volta per rientro. */
  nomi: string[];
  /** Dove sta la base dentro `nomi`, o null se il viaggio non ne ha una. */
  baseIdx: number | null;
}

/**
 * Le fermate come vanno RACCONTATE, che non è come sono salvate.
 *
 * Un viaggio a tappa fissa ha un rientro alla base dopo ogni gita, e sono
 * rientri veri (i km li contano). Ma sul biglietto diventavano illeggibili:
 * «Milano → Napoli → Pompei → Napoli → Napoli → Caserta → Napoli → Sorrento →
 * Napoli → Capri → Napoli» — undici fermate per sei posti, e la storia del
 * viaggio spariva sotto i doppioni. Qui la base si nomina una volta e le gite
 * restano in fila: sei posti, si legge in un colpo d'occhio.
 *
 * ⚠️ Solo dove c'è una BASE riconosciuta. In un viaggio itinerante ripassare da
 * un posto non è un rientro, è una tappa che hai davvero rifatto: lì il
 * percorso è il racconto e non si tocca (scelta di Stefano).
 */
export function fermateDelBiglietto(t: Trip): FermateBiglietto {
  const tappe = t.waypoints ?? [];
  // Della città di partenza si prende solo il nome: home_label è "Milano, Italia".
  const casa = t.home_label?.split(",")[0]?.trim() || "Casa";
  const pieno = [casa, ...tappe.map(w => w.city), t.city];
  const base = riconosciBase([
    { lat: t.home_latitude, lon: t.home_longitude },
    ...tappe.map(w => ({ lat: w.lat, lon: w.lon })),
    { lat: t.latitude, lon: t.longitude },
  ]);
  if (!base) return { nomi: pieno.filter(Boolean), baseIdx: null };

  const daTogliere = new Set(base.occorrenze.slice(1));   // la prima visita resta
  const nomi: string[] = [];
  let baseIdx: number | null = null;
  pieno.forEach((nome, i) => {
    if (!nome || daTogliere.has(i)) return;
    if (i === base.baseIdx) baseIdx = nomi.length;
    nomi.push(nome);
  });
  return { nomi, baseIdx };
}

/**
 * La catena delle tappe di un viaggio, "Milano → Trieste → Ljubljana → Vienna":
 * partenza, tappe intermedie, destinazione.
 *
 * Esiste perché più punti dell'app devono raccontare lo stesso itinerario nello
 * stesso modo — e dove non lo facevano si leggeva SOLO la destinazione, cioè
 * una meta su quattro (dettaglio della heatmap, cardina del globo).
 *
 * Ritorna `null` quando non ci sono tappe intermedie: lì non c'è un percorso da
 * raccontare, e chi chiama mostra il testo che preferisce (di solito la meta).
 */
export function stopChain(t: Trip): string | null {
  if ((t.waypoints ?? []).length === 0) return null;
  // La STESSA fonte dei pallini sul biglietto: due racconti dello stesso
  // itinerario che non combaciano sono peggio di uno solo.
  return fermateDelBiglietto(t).nomi.join(" → ");
}
