import { Trip } from "./storage";
import { eGitaInGiornata } from "./gite";
import { riconosciBase } from "./base";
import { hasCoords } from "./coords";

/**
 * La FORMA di un viaggio: che tipo di viaggio è stato.
 *
 * Le quattro forme si escludono a vicenda e coprono tutto, così i conteggi
 * sommano sempre al totale dei viaggi. Le tre chieste da Stefano (in giornata,
 * a tappe, tappa fissa) si sovrapponevano — un viaggio con base è anche a
 * tappe, una gita può avere tappe — e tre numeri sovrapposti in una pagina di
 * statistiche non tornano mai col totale. La quarta forma ("diretto") è quella
 * che mancava: senza, un Milano→Zurigo→Milano non starebbe in nessuna casella.
 */
export type Forma = "giornata" | "base" | "itinerante" | "diretto";

/** Le fermate di un viaggio SALVATO: casa → tappe → destinazione. */
function fermate(t: Trip): { lat?: number | null; lon?: number | null }[] {
  return [
    { lat: t.home_latitude, lon: t.home_longitude },
    ...(t.waypoints ?? []).map(w => ({ lat: w.lat, lon: w.lon })),
    { lat: t.latitude, lon: t.longitude },
  ];
}

/**
 * In quale casella finisce questo viaggio.
 *
 * L'ordine delle domande È la definizione, e non è arbitrario: la durata viene
 * prima della struttura (una gita resta una gita anche con due tappe), e la
 * base prima delle tappe (un viaggio con base è per definizione a tappe, ma
 * "tappa fissa" dice qualcosa di più preciso).
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
  if (eGitaInGiornata(t)) return { forma: "giornata", base: null };
  const base = hasCoords(t.home_latitude, t.home_longitude) ? riconosciBase(fermate(t)) : null;
  if (base) return { forma: "base", base };
  const tappe = (t.waypoints ?? []).filter(w => hasCoords(w.lat, w.lon));
  return { forma: tappe.length > 0 ? "itinerante" : "diretto", base: null };
}

export interface ContoForme {
  giornata: number;
  base: number;
  itinerante: number;
  diretto: number;
  /** Gite totali dei viaggi con tappa fissa (le uscite dalla base). */
  giteDallaBase: number;
  /** Tappe in media dei viaggi itineranti, arrotondate; 0 se non ce ne sono. */
  tappeMedie: number;
}

/** Quanti viaggi per forma, più i due dettagli che valgono la pena di dire. */
export function contaForme(trips: Trip[]): ContoForme {
  const conto: ContoForme = { giornata: 0, base: 0, itinerante: 0, diretto: 0, giteDallaBase: 0, tappeMedie: 0 };
  let tappeItineranti = 0;
  for (const t of trips) {
    const { forma, base } = conForma(t);
    conto[forma]++;
    if (forma === "base") conto.giteDallaBase += base?.gite.length ?? 0;
    if (forma === "itinerante") {
      tappeItineranti += (t.waypoints ?? []).filter(w => hasCoords(w.lat, w.lon)).length;
    }
  }
  conto.tappeMedie = conto.itinerante > 0 ? Math.round(tappeItineranti / conto.itinerante) : 0;
  return conto;
}
