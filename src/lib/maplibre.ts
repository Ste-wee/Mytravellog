// Casa unica dei tipi e del caricamento di MapLibre. Tutto ciò che è tipo
// sparisce alla compilazione: maplibre-gl resta nel suo chunk separato,
// caricato solo quando serve dal dynamic import qui sotto.

/** Il modulo maplibre-gl caricato al volo: serve per `new maplibregl.Map(...)`. */
export type MapLibreModule = typeof import("maplibre-gl");

/**
 * DEROGA DOCUMENTATA (unica nel progetto, decisione del giro tipi 2026-08-16):
 * espressione di stile MapLibre (`["match", ["get","transport"], "car", …]`).
 * Resta un array libero: i tipi veri della libreria descrivono ogni forma
 * possibile con tuple così rigide che scriverle a mano costa più di quanto
 * protegga (any[] non basta: pretendono lunghezza minima) — e qui un errore
 * lo si vede subito, il pallino perde il colore. Il nome però dice cosa sono.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vedi il commento qui sopra
export type StyleExpr = any;

/**
 * Import dinamico + unwrap dell'interop ESM/CJS in un punto solo: il d.ts di
 * maplibre non tipizza `default`, quindi il cast è inevitabile — ma vive qui,
 * non ricopiato in ogni componente mappa.
 */
export async function loadMapLibre(): Promise<MapLibreModule> {
  const ml = await import("maplibre-gl");
  return ((ml as { default?: MapLibreModule }).default ?? ml) as MapLibreModule;
}
