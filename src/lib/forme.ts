import { Trip } from "./storage";
import { riconosciBase, fermateDiViaggio } from "./base";
import { hasCoords } from "./coords";

/**
 * La FORMA di un viaggio: che tipo di viaggio è stato.
 *
 * Due forme che si escludono a vicenda e coprono tutto, così i conteggi
 * sommano sempre al totale dei viaggi.
 *
 * ⚠️ Erano TRE: c'era anche "giornata" (parti e torni lo stesso giorno). La
 * feature delle gite in giornata è stata rimossa per intero il 2026-08-26 su
 * richiesta di Stefano — l'app censisce solo viaggi con più giorni. Il posto
 * dove la durata conta ora è la validazione del form, non una casella qui.
 *
 * ⚠️ Storia da non ripetere. Il primo taglio ne aveva QUATTRO, con "base" (una
 * meta con gite che ne partono) separata da "diretto" (una meta e basta).
 * Stefano ha guardato i suoi numeri — 0 e 10 — e ha chiesto: «non sono la
 * stessa cosa?». Aveva ragione: in entrambi i casi dormi in un posto solo, e
 * la differenza che avevo codificato non era COME viaggia ma se avesse censito
 * il rientro come tappa. Due nomi per la stessa esperienza, con la casella
 * inventata da me vuota e i suoi dieci viaggi veri in quella dal nome meno
 * riconoscibile. Ora "fissa" vuol dire quello che vuol dire in italiano —
 * hai dormito in un posto — e le gite dalla base sono un DETTAGLIO, non una
 * forma di viaggio a sé.
 */
export type Forma = "fissa" | "itinerante";

/**
 * In quale casella finisce questo viaggio.
 *
 * L'ordine delle domande È la definizione, e non è arbitrario: la base viene
 * prima delle tappe (chi rientra sempre nello stesso posto sta fermo lì, anche
 * se fra i rientri si è mosso).
 */
export function formaDiViaggio(t: Trip): Forma {
  return conForma(t).forma;
}

/**
 * La forma, insieme alla base riconosciuta se c'è.
 *
 * Serve a chi ha bisogno di entrambe (il conteggio, per dire quante gite sono
 * partite dalle basi) senza riconoscere la base DUE volte per lo stesso
 * viaggio: `riconosciBase` confronta ogni fermata con tutte le precedenti.
 */
function conForma(t: Trip): { forma: Forma; base: ReturnType<typeof riconosciBase> } {
  const base = hasCoords(t.home_latitude, t.home_longitude) ? riconosciBase(fermateDiViaggio(t)) : null;
  if (base) return { forma: "fissa", base };   // una meta, con gite che ne partono
  const tappe = (t.waypoints ?? []).filter(w => hasCoords(w.lat, w.lon));
  // Nessuna tappa intermedia = una meta e basta: sempre "fissa", ci hai
  // dormito. Il fatto che non ci siano gite non la rende un'altra cosa.
  return { forma: tappe.length > 0 ? "itinerante" : "fissa", base: null };
}

export interface ContoForme {
  fissa: number;
  itinerante: number;
  /** Quanti dei viaggi a tappa fissa hanno gite che partono dalla base: è il
   *  dettaglio che distingue "Firenze e basta" da "Firenze più Siena e Pisa",
   *  senza farne due forme di viaggio diverse. */
  conGite: number;
  /** Gite totali partite dalle basi. */
  giteDallaBase: number;
  /** Tappe in media dei viaggi itineranti, arrotondate; 0 se non ce ne sono. */
  tappeMedie: number;
}

/** Quanti viaggi per forma, più i due dettagli che valgono la pena di dire. */
export function contaForme(trips: Trip[]): ContoForme {
  const conto: ContoForme = { fissa: 0, itinerante: 0, conGite: 0, giteDallaBase: 0, tappeMedie: 0 };
  let tappeItineranti = 0;
  for (const t of trips) {
    const { forma, base } = conForma(t);
    conto[forma]++;
    if (base) { conto.conGite++; conto.giteDallaBase += base.gite.length; }
    if (forma === "itinerante") {
      tappeItineranti += (t.waypoints ?? []).filter(w => hasCoords(w.lat, w.lon)).length;
    }
  }
  conto.tappeMedie = conto.itinerante > 0 ? Math.round(tappeItineranti / conto.itinerante) : 0;
  return conto;
}
