import { haversineKm } from "./haversine";

/**
 * Riconoscimento della "base" di un viaggio: il posto dove si dorme e da cui
 * si parte per le gite (Milano → Firenze → Siena → Firenze → Pisa → Firenze).
 *
 * Si deduce TUTTO dalle coordinate, nessun campo nuovo: una fermata che sta
 * dove stava una fermata precedente è un rientro, e il posto più rivisitato è
 * la base. Così i viaggi già salvati si vestono da soli, senza migrazioni.
 */

/** Due fermate sono "lo stesso posto" se distano meno di questo: copre
 *  l'imprecisione di due ricerche diverse della stessa città senza confondere
 *  due paesi vicini. Stessa soglia di `tracciaFittaSalvata`. */
const STESSO_POSTO_KM = 0.3;

export interface FermataConCoordinate {
  lat?: number | null;
  lon?: number | null;
}

export interface Gita {
  /** Indici (nella sequenza completa casa+tappe) delle fermate della gita,
   *  in ordine. Almeno una: le coppie base→base senza niente in mezzo non
   *  sono gite. */
  tappe: number[];
}

export interface RiconoscimentoBase {
  /** Indice della PRIMA occorrenza della base nella sequenza. */
  baseIdx: number;
  /** Tutti gli indici che sono "la base" (prima visita + ogni rientro,
   *  destinazione inclusa se coincide). Da nascondere nel disegno: la base si
   *  disegna una volta sola. */
  occorrenze: number[];
  /** Le gite, nell'ordine del viaggio. */
  gite: Gita[];
  /** Fermate di avvicinamento: dopo la casa, prima della base. */
  prima: number[];
  /** Fermate dopo l'ULTIMA occorrenza della base (viaggio che prosegue).
   *  Vuoto quando la destinazione è la base stessa. */
  dopo: number[];
  /** La destinazione coincide con la base (il caso tipico). */
  destinazioneEBase: boolean;
}

const stessoPosto = (a: FermataConCoordinate, b: FermataConCoordinate): boolean =>
  a.lat != null && a.lon != null && b.lat != null && b.lon != null &&
  haversineKm(a.lat, a.lon, b.lat, b.lon) < STESSO_POSTO_KM;

/**
 * Segna la tappa `baseIdx` come base: dopo ogni tappa che viene dopo di lei
 * inserisce un RIENTRO alla base.
 *
 * ⚠️ Il perché è più interessante del come. La base si riconosce dai rientri
 * (vedi `riconosciBase`), ma nessuno pensa a inserire tre volte «Sofia»
 * mentre censisce un viaggio: Stefano ha trovato «tappa fissa: 0» pur avendo
 * fatto dieci viaggi con una base, e guardando il suo itinerario bulgaro
 * (Milano → Sofia → Rila → Plovdiv) ha chiesto come si ottenesse «tutta quella
 * cosa super figa». Non si otteneva: la funzione c'era e non era raggiungibile.
 * Questo è il ponte — un tocco scrive quello che uno scriverebbe a mano.
 *
 * I rientri si scrivono DAVVERO nell'itinerario, non si finge: quei
 * chilometri li hai percorsi (~300 in più, nel caso bulgaro), e i dati
 * restano quelli che il resto dell'app già capisce — nessun campo nuovo,
 * nessuna regola nuova, nessuna migrazione.
 *
 * `copia` fabbrica il rientro dalla base (serve un id nuovo: gli id delle
 * tappe fanno da chiave nel disegno e nel riordino).
 */
export function inserisciRientri<T extends FermataConCoordinate>(
  tappe: T[], baseIdx: number, copia: (base: T) => T,
): T[] {
  if (baseIdx < 0 || baseIdx >= tappe.length - 1) return tappe;   // ultima o fuori: niente da appendere
  const base = tappe[baseIdx];
  if (base.lat == null || base.lon == null) return tappe;          // senza coordinate non si riconosce
  const out = tappe.slice(0, baseIdx + 1);
  for (let i = baseIdx + 1; i < tappe.length; i++) {
    const tappa = tappe[i];
    out.push(tappa);
    // Se il rientro c'è già (tocco ripetuto, o itinerario scritto a mano) non
    // si duplica: due «Sofia» di fila non sono una gita, sono un refuso.
    const prossima = tappe[i + 1];
    const eGiaRientro = stessoPosto(tappa, base) || (prossima != null && stessoPosto(prossima, base));
    if (!eGiaRientro) out.push(copia(base));
  }
  return out;
}

/**
 * Trova la base di una sequenza di fermate (indice 0 = casa).
 *
 * Ritorna null quando il viaggio non ha una base: nessuna ripetizione, oppure
 * ripetizioni senza nemmeno una gita in mezzo. La casa non può essere la base
 * (ripassare da casa a metà viaggio non è "avere una base": è la casa).
 * Con più posti ripetuti vince il più rivisitato, a parità il primo visitato.
 */
export function riconosciBase(stops: FermataConCoordinate[]): RiconoscimentoBase | null {
  if (stops.length < 4) return null;   // casa + andata + gita + rientro: meno di così non è una base
  const casa = stops[0];

  // Raggruppa per posto: ogni fermata prende l'indice della PRIMA fermata
  // che sta nello stesso punto. O(n²), ma n è una manciata di tappe.
  const capofila: number[] = [];
  for (let i = 1; i < stops.length; i++) {
    let capo = i;
    if (stops[i].lat != null && stops[i].lon != null) {
      for (let j = 1; j < i; j++) {
        if (stessoPosto(stops[j], stops[i])) { capo = capofila[j - 1]; break; }
      }
    }
    capofila.push(capo);
  }

  // Il candidato: il capofila più ricorrente, casa esclusa, almeno 2 presenze.
  const conte = new Map<number, number>();
  for (let i = 1; i < stops.length; i++) {
    const c = capofila[i - 1];
    if (stessoPosto(casa, stops[i])) continue;   // la casa non è mai la base
    conte.set(c, (conte.get(c) ?? 0) + 1);
  }
  let baseIdx = -1, massimo = 1;
  for (const [capo, quante] of conte) {
    if (quante > massimo || (quante === massimo && baseIdx !== -1 && capo < baseIdx)) {
      baseIdx = capo; massimo = quante;
    }
  }
  if (baseIdx === -1) return null;

  const occorrenze: number[] = [];
  for (let i = 1; i < stops.length; i++) if (capofila[i - 1] === baseIdx) occorrenze.push(i);

  // Le gite: quello che sta FRA due occorrenze consecutive della base.
  const gite: Gita[] = [];
  for (let k = 0; k < occorrenze.length - 1; k++) {
    const tappe: number[] = [];
    for (let i = occorrenze[k] + 1; i < occorrenze[k + 1]; i++) tappe.push(i);
    if (tappe.length > 0) gite.push({ tappe });
  }
  // Ripetuto ma mai lasciato e ripreso con qualcosa in mezzo: non è una base,
  // è un refuso (la stessa città inserita due volte di fila).
  if (gite.length === 0) return null;

  const prima: number[] = [];
  for (let i = 1; i < occorrenze[0]; i++) prima.push(i);
  const dopo: number[] = [];
  for (let i = occorrenze[occorrenze.length - 1] + 1; i < stops.length; i++) dopo.push(i);

  return {
    baseIdx: occorrenze[0],
    occorrenze,
    gite,
    prima,
    dopo,
    destinazioneEBase: occorrenze[occorrenze.length - 1] === stops.length - 1,
  };
}
