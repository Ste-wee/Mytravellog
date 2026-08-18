import { useEffect, useState } from "react";
import { GeoResult, searchAnyPlace, searchPlaces } from "./geo";

/**
 * L'UNICA ricerca di posti dell'app.
 *
 * Prima questo effect viveva ricopiato in OTTO punti dentro sei file
 * (Nuovo/Modifica viaggio e TripPlanner per casa e tappe, In programma,
 * Impostazioni, HomeCityGate), con tre convenzioni leggermente diverse su
 * quando accendere lo spinner e quanti risultati tenere. Il costo non era
 * teorico: quando la ricerca ha imparato laghi e monumenti, tre copie sono
 * state aggiornate e una (In programma) è rimasta indietro — stessa azione,
 * capacità diverse, scoperto solo in revisione.
 *
 * Qui vivono le decisioni condivise:
 * - debounce (300ms) e niente ricerche sotto i 2 caratteri;
 * - guardia anti-race: una risposta arrivata DOPO un cambio di query non
 *   sovrascrive i risultati della query nuova (due risposte possono tornare
 *   fuori ordine, e senza guardia restavano a schermo i suggerimenti vecchi);
 * - la scelta della fonte: `luoghi: true` = mete (città + laghi/monumenti,
 *   searchAnyPlace), false = solo centri abitati (le residenze).
 */
export interface PlaceSearchOptions {
  /** true per le METE (città + laghi/monumenti); false per le residenze. */
  luoghi?: boolean;
  /** Query da ignorare (es. l'etichetta già scelta: riaprirebbe la lista). */
  ignora?: string | null;
  /** Quanti risultati tenere (default: tutti quelli della fonte). */
  limite?: number;
}

export function usePlaceSearch(query: string, { luoghi = false, ignora = null, limite }: PlaceSearchOptions = {}) {
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || (ignora != null && query === ignora)) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await (luoghi ? searchAnyPlace(q) : searchPlaces(q));
      if (cancelled) return;
      setResults(limite != null ? r.slice(0, limite) : r);
      setLoading(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, luoghi, ignora, limite]);

  /** Chiude la lista dopo una scelta (la query può restare com'è). */
  const clear = () => { setResults([]); setLoading(false); };

  return { results, loading, clear };
}
